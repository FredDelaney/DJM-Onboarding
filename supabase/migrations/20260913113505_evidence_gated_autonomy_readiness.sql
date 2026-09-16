create or replace function public.platform_server_autonomy_readiness(
  p_tenant_id uuid,
  p_window_days integer default 90
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_days integer := coalesce(p_window_days,90);
  v_tenant platform.tenants%rowtype;
  v_actions jsonb;
  v_environment text;
  v_synthetic boolean;
begin
  if v_days not between 14 and 365 then raise exception 'invalid_window_days'; end if;
  select * into v_tenant from platform.tenants where id=p_tenant_id and status='active';
  if not found then raise exception 'tenant_not_found'; end if;

  v_environment := lower(coalesce(v_tenant.metadata->>'environment','production'));
  v_synthetic := coalesce((v_tenant.metadata->>'synthetic_test_tenant')::boolean,false);

  with action_types(action_type) as (
    values ('complete_task'::text),('create_search_task'::text),('create_player_task'::text)
  ), stats as (
    select a.action_type,
      count(p.id) filter(where p.applied_at is not null)::integer as executed_count,
      count(p.id) filter(where p.applied_at is not null and coalesce((p.verification_json->>'verified')::boolean,false))::integer as verified_count,
      count(p.id) filter(where p.status='failed')::integer as failed_count,
      count(p.id) filter(where p.status='undone')::integer as undone_count,
      count(distinct (p.applied_at at time zone 'UTC')::date) filter(where p.applied_at is not null)::integer as distinct_operating_days
    from action_types a
    left join platform.agency_action_proposals p
      on p.tenant_id=p_tenant_id
     and p.action_type=a.action_type
     and p.created_at>=now()-make_interval(days=>v_days)
    group by a.action_type
  ), evaluated as (
    select *,
      case when executed_count=0 then 0 else round(verified_count::numeric/executed_count,4) end as verified_rate,
      case when executed_count=0 then 0 else round(undone_count::numeric/executed_count,4) end as correction_rate,
      case
        when v_environment<>'production' then 'blocked_non_production'
        when v_synthetic then 'blocked_synthetic_evidence'
        when executed_count<20 then 'insufficient_executions'
        when distinct_operating_days<7 then 'insufficient_operating_days'
        when verified_count<executed_count then 'verification_gap'
        when failed_count>0 then 'failure_observed'
        when executed_count>0 and undone_count::numeric/executed_count>0.05 then 'correction_rate_too_high'
        else 'candidate_for_guarded_auto'
      end as readiness_state
    from stats
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'action_type',action_type,
    'readiness_state',readiness_state,
    'eligible_for_guarded_auto',readiness_state='candidate_for_guarded_auto',
    'executed_count',executed_count,
    'verified_count',verified_count,
    'verified_rate',verified_rate,
    'failed_count',failed_count,
    'undone_count',undone_count,
    'correction_rate',correction_rate,
    'distinct_operating_days',distinct_operating_days,
    'requirements',jsonb_build_object(
      'minimum_verified_executions',20,
      'minimum_distinct_operating_days',7,
      'maximum_correction_rate',0.05,
      'failures_allowed_for_initial_readiness',0,
      'all_executions_must_verify',true,
      'production_environment_required',true,
      'synthetic_evidence_counts',false
    )
  ) order by action_type),'[]'::jsonb)
  into v_actions
  from evaluated;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'window_days',v_days,
    'environment',v_environment,
    'synthetic_tenant',v_synthetic,
    'actions',v_actions,
    'principle','Autonomy is earned by verified production reliability over time; synthetic or staging activity never qualifies.'
  );
end;
$function$;

revoke all on function public.platform_server_autonomy_readiness(uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_autonomy_readiness(uuid,integer) to service_role;

create or replace function public.platform_server_autonomy_eligibility(p_proposal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_policy platform.tenant_autonomy_policy%rowtype;
  v_tenant platform.tenants%rowtype;
  v_reversible_by_protocol boolean;
  v_today_count integer := 0;
  v_reasons jsonb := '[]'::jsonb;
  v_eligible boolean := true;
  v_readiness jsonb;
  v_action_readiness jsonb;
  v_environment text;
  v_synthetic boolean;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id;
  if not found then raise exception 'proposal_not_found'; end if;

  select * into v_tenant from platform.tenants where id=v_p.tenant_id;
  v_environment := lower(coalesce(v_tenant.metadata->>'environment','production'));
  v_synthetic := coalesce((v_tenant.metadata->>'synthetic_test_tenant')::boolean,false);

  if v_environment<>'production' then
    v_eligible:=false; v_reasons:=v_reasons||jsonb_build_array('non_production_environment');
  end if;
  if v_synthetic then
    v_eligible:=false; v_reasons:=v_reasons||jsonb_build_array('synthetic_tenant');
  end if;

  select * into v_policy from platform.tenant_autonomy_policy where tenant_id=v_p.tenant_id;
  if not found then
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_array('autonomy_policy_missing');
  else
    if v_policy.mode<>'guarded' then v_eligible:=false; v_reasons:=v_reasons||jsonb_build_array('mode_not_guarded'); end if;
    if not v_policy.auto_execute_enabled then v_eligible:=false; v_reasons:=v_reasons||jsonb_build_array('automatic_execution_disabled'); end if;
    if v_policy.automation_paused then v_eligible:=false; v_reasons:=v_reasons||jsonb_build_array('automation_paused'); end if;
    if not (v_p.action_type=any(v_policy.allowed_auto_action_types)) then v_eligible:=false; v_reasons:=v_reasons||jsonb_build_array('action_type_not_allowed'); end if;
    if v_policy.max_auto_actions_per_day<=0 then v_eligible:=false; v_reasons:=v_reasons||jsonb_build_array('daily_limit_zero'); end if;
  end if;

  if v_p.status<>'proposed' then v_eligible:=false; v_reasons:=v_reasons||jsonb_build_array('proposal_not_proposed'); end if;
  if v_p.risk_level<>'low' then v_eligible:=false; v_reasons:=v_reasons||jsonb_build_array('risk_not_low'); end if;
  if v_p.approval_mode<>'confirm' then v_eligible:=false; v_reasons:=v_reasons||jsonb_build_array('action_requires_input_or_review'); end if;
  if v_p.expires_at<=now() then v_eligible:=false; v_reasons:=v_reasons||jsonb_build_array('proposal_expired'); end if;

  v_reversible_by_protocol := v_p.action_type in ('complete_task','create_search_task','create_player_task');
  if coalesce(v_policy.require_reversible,true) and not v_reversible_by_protocol then
    v_eligible:=false; v_reasons:=v_reasons||jsonb_build_array('reversible_handler_required');
  end if;

  v_readiness := public.platform_server_autonomy_readiness(v_p.tenant_id,90);
  select a.value into v_action_readiness
  from jsonb_array_elements(coalesce(v_readiness->'actions','[]'::jsonb)) a
  where a.value->>'action_type'=v_p.action_type
  limit 1;

  if v_action_readiness is null then
    v_eligible:=false; v_reasons:=v_reasons||jsonb_build_array('action_type_has_no_readiness_model');
  elsif not coalesce((v_action_readiness->>'eligible_for_guarded_auto')::boolean,false) then
    v_eligible:=false; v_reasons:=v_reasons||jsonb_build_array('reliability_evidence_not_ready');
  end if;

  select count(*) into v_today_count
  from platform.audit_events a
  where a.tenant_id=v_p.tenant_id and a.action='agency_action.auto_applied'
    and a.occurred_at>=date_trunc('day',now());
  if v_policy.tenant_id is not null and v_today_count>=v_policy.max_auto_actions_per_day then
    v_eligible:=false; v_reasons:=v_reasons||jsonb_build_array('daily_auto_action_limit_reached');
  end if;

  return jsonb_build_object(
    'proposal_id',v_p.id,'tenant_id',v_p.tenant_id,'eligible',v_eligible,
    'action_type',v_p.action_type,'risk_level',v_p.risk_level,'approval_mode',v_p.approval_mode,
    'reversible_by_protocol',v_reversible_by_protocol,'auto_actions_today',v_today_count,
    'environment',v_environment,'synthetic_tenant',v_synthetic,
    'readiness',v_action_readiness,
    'policy',public.platform_server_autonomy_policy(v_p.tenant_id),'reasons',v_reasons
  );
end;
$function$;

revoke all on function public.platform_server_autonomy_eligibility(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_autonomy_eligibility(uuid) to service_role;;
