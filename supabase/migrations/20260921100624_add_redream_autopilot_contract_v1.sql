
create or replace function private.redream_request_tenant()
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  v_slug text := nullif(v_headers->>'x-redream-workspace','');
  v_tenant uuid;
begin
  if auth.uid() is null then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;

  if v_slug is null then
    v_tenant := private.primary_active_tenant_id(auth.uid());
  else
    if v_slug !~ '^[a-z0-9][a-z0-9-]{0,99}$'
       or v_slug ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Workspace access denied' using errcode='42501';
    end if;

    select t.id
      into v_tenant
    from platform.tenants t
    where t.slug=v_slug
      and t.status='active'
    limit 1;
  end if;

  if v_tenant is null
     or not private.user_has_staff_tenant_access(v_tenant,auth.uid()) then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;

  return v_tenant;
end;
$function$;

revoke all on function private.redream_request_tenant() from public,anon;
grant execute on function private.redream_request_tenant() to authenticated,service_role;

create or replace function public.redream_autopilot_home(
  p_limit integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,8),12));
  v_tenant uuid := private.redream_request_tenant();
  v_home jsonb;
  v_commands jsonb;
  v_policy jsonb;
  v_commitments jsonb;
  v_delegable jsonb;
  v_confirm jsonb;
  v_judgement jsonb;
  v_display_name text;
  v_slug text;
begin
  select t.slug,b.display_name
    into v_slug,v_display_name
  from platform.tenants t
  left join platform.tenant_branding b on b.tenant_id=t.id
  where t.id=v_tenant
    and t.status='active';

  v_home := public.platform_server_agency_home(v_tenant,v_limit);
  v_commands := coalesce(v_home->'attention'->'commands','[]'::jsonb);
  v_policy := public.platform_server_autonomy_policy(v_tenant);
  v_commitments := public.platform_server_commitment_summary(v_tenant,12);

  with items as (
    select c.value as command,
           coalesce(c.value->'actionability','{}'::jsonb) as actionability
    from jsonb_array_elements(v_commands) c
  )
  select
    coalesce(jsonb_agg(command order by (command->>'rank')::integer)
      filter(
        where actionability->>'mode'='one_tap'
          and actionability->>'risk_level'='low'
          and coalesce((actionability->>'undo_expected')::boolean,false)=true
          and coalesce((actionability->>'external_side_effect')::boolean,false)=false
      ),'[]'::jsonb),
    coalesce(jsonb_agg(command order by (command->>'rank')::integer)
      filter(where actionability->>'mode'='input_then_confirm'),'[]'::jsonb),
    coalesce(jsonb_agg(command order by (command->>'rank')::integer)
      filter(
        where not (
          actionability->>'mode'='one_tap'
          and actionability->>'risk_level'='low'
          and coalesce((actionability->>'undo_expected')::boolean,false)=true
          and coalesce((actionability->>'external_side_effect')::boolean,false)=false
        )
        and coalesce(actionability->>'mode','review_only')<>'input_then_confirm'
      ),'[]'::jsonb)
  into v_delegable,v_confirm,v_judgement
  from items;

  return jsonb_build_object(
    'contract_version','redream_autopilot_v1',
    'generated_at',now(),
    'workspace',jsonb_build_object(
      'slug',v_slug,
      'display_name',coalesce(nullif(trim(v_display_name),''),v_slug)
    ),
    'attention',jsonb_build_object(
      'status',v_home->'attention'->>'status',
      'visible_signals',coalesce((v_home#>>'{attention,visible_signals}')::integer,0),
      'critical_count',coalesce((v_home#>>'{attention,critical_count}')::integer,0),
      'high_count',coalesce((v_home#>>'{attention,high_count}')::integer,0),
      'suppressed_by_decision_memory',coalesce((v_home#>>'{attention,suppressed_by_decision_memory}')::integer,0),
      'delegable',v_delegable,
      'confirm',v_confirm,
      'judgement',v_judgement
    ),
    'delegated_work',v_commitments,
    'changed_last_24h',coalesce(v_home->'changed_last_24h','{}'::jsonb),
    'value_proof_30d',coalesce(v_home->'value_proof_30d','{}'::jsonb),
    'command_quality_30d',coalesce(v_home->'command_quality_30d','{}'::jsonb),
    'autonomy',v_policy,
    'operating_principle','ReDream performs safe reversible operations and returns only judgement, confirmation and exceptions to the agent.'
  );
end;
$function$;

revoke all on function public.redream_autopilot_home(integer) from public,anon;
grant execute on function public.redream_autopilot_home(integer) to authenticated,service_role;

create or replace function public.redream_autopilot_prepare(
  p_command_id text,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  if auth.uid() is null then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;

  return public.platform_server_prepare_command_action(
    v_tenant,
    p_command_id,
    auth.uid(),
    coalesce(p_input,'{}'::jsonb)
  );
end;
$function$;

revoke all on function public.redream_autopilot_prepare(text,jsonb) from public,anon;
grant execute on function public.redream_autopilot_prepare(text,jsonb) to authenticated,service_role;

create or replace function public.redream_autopilot_execute(
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
  v_proposal_tenant uuid;
begin
  if auth.uid() is null then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;

  select p.tenant_id
    into v_proposal_tenant
  from platform.agency_action_proposals p
  where p.id=p_proposal_id;

  if v_proposal_tenant is null or v_proposal_tenant is distinct from v_tenant then
    raise exception 'Action access denied' using errcode='42501';
  end if;

  return public.platform_server_execute_agency_action(p_proposal_id,auth.uid());
end;
$function$;

revoke all on function public.redream_autopilot_execute(uuid) from public,anon;
grant execute on function public.redream_autopilot_execute(uuid) to authenticated,service_role;

create or replace function public.redream_autopilot_undo(
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
  v_proposal_tenant uuid;
begin
  if auth.uid() is null then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;

  select p.tenant_id
    into v_proposal_tenant
  from platform.agency_action_proposals p
  where p.id=p_proposal_id;

  if v_proposal_tenant is null or v_proposal_tenant is distinct from v_tenant then
    raise exception 'Action access denied' using errcode='42501';
  end if;

  return public.platform_server_undo_agency_action(p_proposal_id,auth.uid());
end;
$function$;

revoke all on function public.redream_autopilot_undo(uuid) from public,anon;
grant execute on function public.redream_autopilot_undo(uuid) to authenticated,service_role;

create or replace function public.redream_autopilot_feedback(
  p_command_id text,
  p_command_type text,
  p_source_type text,
  p_source_id uuid,
  p_feedback_type text,
  p_snoozed_until timestamptz default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  if auth.uid() is null then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;

  return public.platform_server_record_command_feedback(
    v_tenant,
    p_command_id,
    p_command_type,
    p_source_type,
    p_source_id,
    p_feedback_type,
    auth.uid(),
    p_snoozed_until,
    p_reason,
    jsonb_build_object('surface','redream_autopilot')
  );
end;
$function$;

revoke all on function public.redream_autopilot_feedback(text,text,text,uuid,text,timestamptz,text) from public,anon;
grant execute on function public.redream_autopilot_feedback(text,text,text,uuid,text,timestamptz,text) to authenticated,service_role;

comment on function public.redream_autopilot_home(integer) is
  'Tenant-derived ReDream Autopilot read contract. Returns only the ranked agent attention queue, delegated work, recent operational change, value proof and autonomy policy.';
comment on function public.redream_autopilot_prepare(text,jsonb) is
  'Prepares a safe action for the current ReDream workspace without accepting tenant or actor identifiers from the client.';
comment on function public.redream_autopilot_execute(uuid) is
  'Executes an approved reversible action only when the proposal belongs to the current ReDream workspace.';
comment on function public.redream_autopilot_undo(uuid) is
  'Undoes a supported ReDream Autopilot action only when the proposal belongs to the current ReDream workspace.';
