create or replace function public.platform_server_player_workspaces(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
  'available',true,
  'user_id',p_user_id,
  'workspaces',coalesce(jsonb_agg(jsonb_build_object(
    'tenant_id',p.tenant_id,
    'player_id',p.id,
    'player_name',coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player'),
    'football_status',p.football_status,
    'agency',jsonb_build_object(
      'display_name',coalesce(b.portal_name,b.display_name,t.slug),
      'short_name',b.short_name,
      'logo_asset',b.logo_asset,
      'compact_logo_asset',b.compact_logo_asset,
      'primary_color',b.primary_color,
      'secondary_color',b.secondary_color,
      'accent_color',b.accent_color,
      'support_email',b.support_email,
      'website_url',b.website_url
    )
  ) order by coalesce(b.portal_name,b.display_name,t.slug)) filter(where p.id is not null),'[]'::jsonb)
)
from public.players p
join platform.tenants t on t.id=p.tenant_id and t.status='active'
left join platform.tenant_branding b on b.tenant_id=p.tenant_id
where p.user_id=p_user_id and p.football_status<>'retired';$$;

create or replace function public.platform_server_player_portal_review(p_user_id uuid,p_tenant_id uuid default null,p_window_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_player public.players%rowtype;
  v_count integer:=0;
  v_proof jsonb;
  v_statement jsonb;
  v_delta jsonb;
  v_requests jsonb;
  v_documents jsonb;
  v_agency jsonb;
  v_days integer:=greatest(7,least(coalesce(p_window_days,30),180));
begin
  select count(*) into v_count from public.players p join platform.tenants t on t.id=p.tenant_id and t.status='active' where p.user_id=p_user_id and (p_tenant_id is null or p.tenant_id=p_tenant_id) and p.football_status<>'retired';
  if v_count=0 then return jsonb_build_object('available',false,'reason','player_workspace_not_found'); end if;
  if p_tenant_id is null and v_count>1 then return jsonb_build_object('available',false,'reason','tenant_required','workspace_count',v_count); end if;
  select p.* into v_player from public.players p join platform.tenants t on t.id=p.tenant_id and t.status='active' where p.user_id=p_user_id and (p_tenant_id is null or p.tenant_id=p_tenant_id) and p.football_status<>'retired' order by p.created_at limit 1;

  v_proof:=public.platform_server_player_value_proof(v_player.tenant_id,v_player.id,v_days);
  v_statement:=coalesce(v_proof->'player_safe_current_statement','{}'::jsonb);
  v_delta:=public.platform_server_player_value_proof_delta(v_player.tenant_id,v_player.id,null,null);

  select coalesce(jsonb_agg(jsonb_build_object(
    'request_id',r.id,'title',r.title,'message',r.message,'request_type',r.request_type,'status',r.status,'due_at',r.due_at,'player_reply',r.player_reply,'created_at',r.created_at,'completed_at',r.completed_at
  ) order by case when r.status='completed' then 2 else 1 end,r.due_at nulls last,r.created_at desc),'[]'::jsonb)
  into v_requests
  from public.player_requests r where r.player_id=v_player.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'document_id',d.id,'title',d.title,'document_type',d.document_type,'country',d.country,'expires_at',d.expires_at,
    'attention',case when d.expires_at is null then 'no_expiry_recorded' when d.expires_at<current_date then 'expired_recorded_date' when d.expires_at<=current_date+30 then 'expires_within_30_days' when d.expires_at<=current_date+120 then 'expires_within_120_days' else 'current_by_recorded_date' end
  ) order by d.expires_at nulls last,d.title),'[]'::jsonb)
  into v_documents from public.player_documents d where d.player_id=v_player.id;

  select jsonb_build_object(
    'display_name',coalesce(b.portal_name,b.display_name,t.slug),'short_name',b.short_name,'logo_asset',b.logo_asset,'compact_logo_asset',b.compact_logo_asset,
    'primary_color',b.primary_color,'secondary_color',b.secondary_color,'accent_color',b.accent_color,'support_email',b.support_email,'website_url',b.website_url
  ) into v_agency from platform.tenants t left join platform.tenant_branding b on b.tenant_id=t.id where t.id=v_player.tenant_id;

  return jsonb_build_object(
    'available',true,'generated_at',now(),'tenant_id',v_player.tenant_id,'player_id',v_player.id,'agency',v_agency,
    'player',v_statement->'player',
    'career_plan',v_statement->'career_plan',
    'service_plan',v_statement->'service_plan',
    'service_delivery',v_proof->'service_delivery',
    'market_activity',v_statement->'market_activity',
    'player_requests',v_requests,
    'documents',v_documents,
    'last_recorded_agency_activity_at',v_statement->'last_recorded_agency_activity_at',
    'review_change',v_delta,
    'timeline',v_proof->'timeline',
    'privacy_contract',jsonb_build_object(
      'purpose','Give the player transparent access to their own recorded service, career plan, requests and player-safe market activity.',
      'excluded',jsonb_build_array('fees and commission forecasts','negotiation guardrails','club contact identities','private club identities in market-process timelines','relationship-route intelligence','internal staff notes','internal control scores'),
      'market_names_hidden',true,
      'own_record_only',true
    ),
    'truth_contract',jsonb_build_object(
      'service','Only agency work recorded in DJM is shown. Offline work that was not captured remains invisible.',
      'market','Market activity counts and safe timeline events are records of activity, not promises of a transfer or proof of club commitment.',
      'career','Career objectives and trade-offs remain human-owned and player-confirmed.',
      'documents','Document attention uses recorded expiry dates only and is not a legal-validity or immigration judgement.',
      'change','Review change compares persisted DJM snapshots when at least two exist; DJM does not invent a historical baseline.'
    )
  );
end;$$;

create or replace function public.platform_server_player_create_request(p_user_id uuid,p_tenant_id uuid,p_title text,p_message text default null,p_request_type text default 'action')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player public.players%rowtype; v_id uuid; v_title text:=nullif(trim(p_title),''); v_type text:=coalesce(nullif(trim(p_request_type),''),'action');
begin
  select p.* into v_player from public.players p join platform.tenants t on t.id=p.tenant_id and t.status='active' where p.user_id=p_user_id and p.tenant_id=p_tenant_id and p.football_status<>'retired' limit 1;
  if not found then raise exception 'player_workspace_not_found'; end if;
  if v_title is null then raise exception 'request_title_required'; end if;
  if length(v_title)>200 then raise exception 'request_title_too_long'; end if;
  if p_message is not null and length(p_message)>5000 then raise exception 'request_message_too_long'; end if;
  insert into public.player_requests(player_id,title,message,request_type,status,created_by)
  values(v_player.id,v_title,nullif(trim(p_message),''),v_type,'open',p_user_id) returning id into v_id;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(v_player.tenant_id,p_user_id,'user','player_request.created','player_request',v_id::text,jsonb_build_object('title',v_title,'request_type',v_type),jsonb_build_object('player_id',v_player.id));
  return jsonb_build_object('created',true,'request_id',v_id,'truth_contract',jsonb_build_object('routing','Creating a request records the player request; it does not guarantee an immediate response time unless the agency has separately configured a service standard.'));
end;$$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('platform_server_player_workspaces','platform_server_player_portal_review','platform_server_player_create_request') loop
    execute format('revoke all on function %s from public,anon,authenticated',r.sig);
    execute format('grant execute on function %s to service_role',r.sig);
  end loop;
end $$;;
