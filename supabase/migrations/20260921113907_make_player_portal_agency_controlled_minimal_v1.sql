
create or replace function private.redream_player_portal_policy(
  p_tenant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
with configured as (
  select coalesce(ts.configuration->'player_portal','{}'::jsonb) as policy
  from platform.tenant_settings ts
  where ts.tenant_id=p_tenant_id
)
select jsonb_build_object(
  'visibility_mode','minimal',
  'show_career_plan',true,
  'show_requests',true,
  'show_document_attention',true,
  'show_service_plan',false,
  'show_market_activity',false,
  'show_service_delivery',false,
  'show_activity_timeline',false,
  'show_review_change',false,
  'show_last_recorded_agency_activity',false
) || coalesce((select policy from configured),'{}'::jsonb);
$function$;

revoke all on function private.redream_player_portal_policy(uuid) from public,anon,authenticated;
grant execute on function private.redream_player_portal_policy(uuid) to service_role;

create or replace function public.redream_player_portal_policy()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
  v_role text;
begin
  select m.role
    into v_role
  from platform.tenant_memberships m
  where m.tenant_id=v_tenant
    and m.user_id=auth.uid()
    and m.status='active'
  limit 1;

  if v_role not in ('owner','admin','operations','agent') then
    raise exception 'agency_staff_access_required' using errcode='42501';
  end if;

  return private.redream_player_portal_policy(v_tenant);
end;
$function$;

create or replace function public.redream_player_portal_set_policy(
  p_policy jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
  v_role text;
  v_current jsonb;
  v_patch jsonb := coalesce(p_policy,'{}'::jsonb);
  v_allowed text[] := array[
    'show_career_plan',
    'show_requests',
    'show_document_attention',
    'show_service_plan',
    'show_market_activity',
    'show_service_delivery',
    'show_activity_timeline',
    'show_review_change',
    'show_last_recorded_agency_activity'
  ];
  v_key text;
  v_new jsonb;
begin
  select m.role
    into v_role
  from platform.tenant_memberships m
  where m.tenant_id=v_tenant
    and m.user_id=auth.uid()
    and m.status='active'
  limit 1;

  if v_role not in ('owner','admin') then
    raise exception 'owner_or_admin_required' using errcode='42501';
  end if;

  if jsonb_typeof(v_patch)<>'object' then
    raise exception 'policy_must_be_object';
  end if;

  for v_key in select jsonb_object_keys(v_patch)
  loop
    if not (v_key = any(v_allowed)) then
      raise exception 'unsupported_player_portal_policy_key: %',v_key;
    end if;

    if jsonb_typeof(v_patch->v_key)<>'boolean' then
      raise exception 'player_portal_policy_values_must_be_boolean';
    end if;
  end loop;

  v_current := private.redream_player_portal_policy(v_tenant);
  v_new := jsonb_build_object(
    'visibility_mode','custom'
  ) || (v_current - 'visibility_mode') || v_patch;

  insert into platform.tenant_settings(
    tenant_id,
    configuration,
    created_at,
    updated_at
  )
  values(
    v_tenant,
    jsonb_build_object('player_portal',v_new),
    now(),
    now()
  )
  on conflict (tenant_id) do update
    set configuration =
      coalesce(platform.tenant_settings.configuration,'{}'::jsonb)
      || jsonb_build_object('player_portal',v_new),
        updated_at=now();

  insert into platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata
  )
  values(
    v_tenant,auth.uid(),'user','player_portal.visibility_policy_updated',
    'tenant',v_tenant::text,v_new,
    jsonb_build_object('surface','redream_player_experience_settings')
  );

  return v_new;
end;
$function$;

revoke all on function public.redream_player_portal_policy() from public,anon;
revoke all on function public.redream_player_portal_set_policy(jsonb) from public,anon;
grant execute on function public.redream_player_portal_policy() to authenticated,service_role;
grant execute on function public.redream_player_portal_set_policy(jsonb) to authenticated,service_role;

create or replace function public.platform_server_player_portal_review(
  p_user_id uuid,
  p_tenant_id uuid default null,
  p_window_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_player public.players%rowtype;
  v_count integer:=0;
  v_proof jsonb;
  v_statement jsonb;
  v_delta jsonb;
  v_requests jsonb;
  v_documents jsonb;
  v_agency jsonb;
  v_policy jsonb;
  v_days integer:=greatest(7,least(coalesce(p_window_days,30),180));
  v_open_requests integer:=0;
  v_document_attention integer:=0;
  v_career_review_due boolean:=false;
  v_status jsonb;
begin
  select count(*) into v_count
  from public.players p
  join platform.tenants t on t.id=p.tenant_id and t.status='active'
  where p.user_id=p_user_id
    and (p_tenant_id is null or p.tenant_id=p_tenant_id)
    and p.football_status<>'retired';

  if v_count=0 then
    return jsonb_build_object('available',false,'reason','player_workspace_not_found');
  end if;

  if p_tenant_id is null and v_count>1 then
    return jsonb_build_object('available',false,'reason','tenant_required','workspace_count',v_count);
  end if;

  select p.* into v_player
  from public.players p
  join platform.tenants t on t.id=p.tenant_id and t.status='active'
  where p.user_id=p_user_id
    and (p_tenant_id is null or p.tenant_id=p_tenant_id)
    and p.football_status<>'retired'
  order by p.created_at
  limit 1;

  v_policy:=private.redream_player_portal_policy(v_player.tenant_id);
  v_proof:=public.platform_server_player_value_proof(v_player.tenant_id,v_player.id,v_days);
  v_statement:=coalesce(v_proof->'player_safe_current_statement','{}'::jsonb);

  if coalesce((v_policy->>'show_review_change')::boolean,false) then
    v_delta:=public.platform_server_player_value_proof_delta(v_player.tenant_id,v_player.id,null,null);
  else
    v_delta:=null;
  end if;

  select
    count(*) filter(where r.status<>'completed')::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'request_id',r.id,
      'title',r.title,
      'message',r.message,
      'request_type',r.request_type,
      'status',r.status,
      'due_at',r.due_at,
      'player_reply',r.player_reply,
      'created_at',r.created_at,
      'completed_at',r.completed_at
    ) order by case when r.status='completed' then 2 else 1 end,r.due_at nulls last,r.created_at desc),'[]'::jsonb)
  into v_open_requests,v_requests
  from public.player_requests r
  where r.player_id=v_player.id;

  select
    count(*) filter(where d.expires_at is not null and d.expires_at<=current_date+30)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'document_id',d.id,
      'title',d.title,
      'document_type',d.document_type,
      'country',d.country,
      'expires_at',d.expires_at,
      'attention',case
        when d.expires_at is null then 'no_expiry_recorded'
        when d.expires_at<current_date then 'expired_recorded_date'
        when d.expires_at<=current_date+30 then 'expires_within_30_days'
        when d.expires_at<=current_date+120 then 'expires_within_120_days'
        else 'current_by_recorded_date'
      end
    ) order by d.expires_at nulls last,d.title),'[]'::jsonb)
  into v_document_attention,v_documents
  from public.player_documents d
  where d.player_id=v_player.id;

  begin
    v_career_review_due :=
      coalesce((v_statement#>>'{career_plan,review_due_at}')::date,current_date+1) <= current_date;
  exception when others then
    v_career_review_due:=false;
  end;

  select jsonb_build_object(
    'display_name',coalesce(b.portal_name,b.display_name,t.slug),
    'short_name',b.short_name,
    'logo_asset',b.logo_asset,
    'compact_logo_asset',b.compact_logo_asset,
    'primary_color',b.primary_color,
    'secondary_color',b.secondary_color,
    'accent_color',b.accent_color,
    'support_email',b.support_email,
    'website_url',b.website_url
  ) into v_agency
  from platform.tenants t
  left join platform.tenant_branding b on b.tenant_id=t.id
  where t.id=v_player.tenant_id;

  v_status:=case
    when v_open_requests>0 then jsonb_build_object(
      'state','player_input_needed',
      'headline','Your agency needs something from you',
      'detail','Open your requests to see what is needed.'
    )
    when v_document_attention>0 then jsonb_build_object(
      'state','document_attention',
      'headline','A document needs attention',
      'detail','Review the recorded expiry information in your files.'
    )
    when v_career_review_due then jsonb_build_object(
      'state','career_review_due',
      'headline','Your career plan is due for review',
      'detail','Your agency can review the agreed plan with you.'
    )
    else jsonb_build_object(
      'state','under_control',
      'headline','You are up to date',
      'detail','Your agency will contact you when something needs your input.'
    )
  end;

  return jsonb_build_object(
    'available',true,
    'contract_version','redream_player_portal_minimal_v1',
    'generated_at',now(),
    'tenant_id',v_player.tenant_id,
    'player_id',v_player.id,
    'agency',v_agency,
    'visibility_policy',v_policy,
    'agency_status',v_status,
    'player',v_statement->'player',
    'career_plan',case when coalesce((v_policy->>'show_career_plan')::boolean,true) then v_statement->'career_plan' else null end,
    'service_plan',case when coalesce((v_policy->>'show_service_plan')::boolean,false) then v_statement->'service_plan' else null end,
    'service_delivery',case when coalesce((v_policy->>'show_service_delivery')::boolean,false) then v_proof->'service_delivery' else null end,
    'market_activity',case when coalesce((v_policy->>'show_market_activity')::boolean,false) then v_statement->'market_activity' else null end,
    'player_requests',case when coalesce((v_policy->>'show_requests')::boolean,true) then v_requests else '[]'::jsonb end,
    'documents',case when coalesce((v_policy->>'show_document_attention')::boolean,true) then v_documents else '[]'::jsonb end,
    'last_recorded_agency_activity_at',case when coalesce((v_policy->>'show_last_recorded_agency_activity')::boolean,false) then v_statement->'last_recorded_agency_activity_at' else null end,
    'review_change',case when coalesce((v_policy->>'show_review_change')::boolean,false) then v_delta else null end,
    'timeline',case when coalesce((v_policy->>'show_activity_timeline')::boolean,false) then v_proof->'timeline' else '[]'::jsonb end,
    'privacy_contract',jsonb_build_object(
      'default','Minimal disclosure. ReDream does not automatically expose the agency internal operating process to players.',
      'always_excluded',jsonb_build_array(
        'fees and commission forecasts',
        'negotiation guardrails',
        'club contact identities',
        'relationship-route intelligence',
        'internal staff notes',
        'internal control scores'
      ),
      'club_names_hidden',true,
      'own_record_only',true,
      'agency_controlled_visibility',true
    ),
    'truth_contract',jsonb_build_object(
      'service','The portal is not a surveillance feed of agency work. It shows only player-useful information allowed by the agency visibility policy.',
      'market','Market activity is hidden by default and, when enabled, remains player-safe operating context rather than a promise of transfer or club interest.',
      'career','Career objectives and trade-offs remain human-owned and player-confirmed.',
      'documents','Document attention uses recorded expiry dates only and is not a legal-validity or immigration judgement.'
    )
  );
end;
$function$;
