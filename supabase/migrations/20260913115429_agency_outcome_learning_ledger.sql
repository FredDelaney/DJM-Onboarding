create table if not exists platform.agency_action_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  proposal_id uuid not null unique references platform.agency_action_proposals(id) on delete cascade,
  action_type text not null,
  operational_state text not null check(operational_state in ('pending','completed','failed','cancelled')),
  downstream_state text not null check(downstream_state in ('pending','positive','neutral','negative','not_applicable','cancelled')),
  outcome_key text,
  evaluation_window_end timestamptz,
  first_observed_at timestamptz,
  last_evaluated_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table platform.agency_action_outcomes enable row level security;
revoke all on platform.agency_action_outcomes from public, anon, authenticated, service_role;
create index if not exists agency_action_outcomes_tenant_state_idx on platform.agency_action_outcomes(tenant_id,downstream_state,updated_at desc);
create index if not exists agency_action_outcomes_action_type_idx on platform.agency_action_outcomes(tenant_id,action_type,updated_at desc);

create or replace function platform.evaluate_agency_action_outcome(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_commitment platform.agency_commitments%rowtype;
  v_operational text := 'pending';
  v_downstream text := 'pending';
  v_key text := null;
  v_window_end timestamptz;
  v_evidence jsonb := '{}'::jsonb;
  v_current_deal djm_os.deal_rooms%rowtype;
  v_before_stage text;
  v_before_rank integer;
  v_current_rank integer;
  v_match_count integer := 0;
  v_interaction_count integer := 0;
  v_first_observed timestamptz := null;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id;
  if not found then raise exception 'proposal_not_found'; end if;

  v_window_end := coalesce(v_p.applied_at,v_p.created_at)+interval '14 days';

  if v_p.status='undone' then
    v_operational:='cancelled'; v_downstream:='cancelled'; v_key:='action_undone';
  elsif v_p.status='failed' then
    v_operational:='failed'; v_downstream:='not_applicable'; v_key:='execution_failed';
  elsif v_p.status<>'applied' then
    v_operational:='pending'; v_downstream:='not_applicable'; v_key:='not_applied';
  elsif v_p.action_type='complete_task' then
    v_operational:='completed'; v_downstream:='not_applicable'; v_key:='task_completed';
    v_evidence:=jsonb_build_object('task_id',v_p.result_target_id,'verified',coalesce((v_p.verification_json->>'verified')::boolean,false));

  elsif v_p.action_type in ('create_search_task','create_player_task','create_relationship_task') then
    select * into v_commitment from platform.agency_commitments where proposal_id=v_p.id;
    v_operational:=case
      when v_commitment.status='completed' then 'completed'
      when v_commitment.status='cancelled' then 'cancelled'
      else 'pending'
    end;

    if v_p.action_type='create_search_task' then
      select count(*),min(pm.created_at) into v_match_count,v_first_observed
      from djm_os.player_matches pm
      where pm.tenant_id=v_p.tenant_id and pm.club_need_id=v_p.target_id
        and pm.created_at>=coalesce(v_p.applied_at,v_p.created_at);
      if v_match_count>0 then
        v_downstream:='positive'; v_key:='player_match_created_after_search';
      elsif now()>=v_window_end then
        v_downstream:='neutral'; v_key:='no_player_match_observed_in_window';
      else
        v_downstream:='pending'; v_key:='search_outcome_pending';
      end if;
      v_evidence:=jsonb_build_object('club_need_id',v_p.target_id,'new_player_matches',v_match_count,'commitment_status',v_commitment.status,'task_id',v_commitment.task_id);

    elsif v_p.action_type='create_relationship_task' then
      select count(*),min(i.occurred_at) into v_interaction_count,v_first_observed
      from djm_os.interactions i
      where i.tenant_id=v_p.tenant_id
        and i.occurred_at>=coalesce(v_p.applied_at,v_p.created_at)
        and (
          (v_p.proposed_payload->>'person_id' is not null and i.person_id=(v_p.proposed_payload->>'person_id')::uuid)
          or (v_p.proposed_payload->>'organisation_id' is not null and i.organisation_id=(v_p.proposed_payload->>'organisation_id')::uuid)
        )
        and coalesce(i.source_type,'')<>'synthetic_outcome_test_excluded';
      if v_interaction_count>0 then
        v_downstream:='positive'; v_key:='fresh_club_interaction_after_relationship_task';
      elsif now()>=v_window_end then
        v_downstream:='neutral'; v_key:='no_fresh_club_interaction_in_window';
      else
        v_downstream:='pending'; v_key:='relationship_outcome_pending';
      end if;
      v_evidence:=jsonb_build_object('person_id',v_p.proposed_payload->>'person_id','organisation_id',v_p.proposed_payload->>'organisation_id','new_interactions',v_interaction_count,'commitment_status',v_commitment.status,'task_id',v_commitment.task_id);

    else
      v_downstream:='not_applicable';
      v_key:=case when v_operational='completed' then 'delegated_player_work_completed' else 'delegated_player_work_pending' end;
      v_evidence:=jsonb_build_object('player_id',v_p.target_id,'commitment_status',v_commitment.status,'task_id',v_commitment.task_id);
    end if;

  elsif v_p.action_type='set_deal_next_action' then
    v_operational:='completed';
    select * into v_current_deal from djm_os.deal_rooms where id=v_p.target_id and tenant_id=v_p.tenant_id;
    if not found then
      v_downstream:='neutral'; v_key:='deal_no_longer_available';
    else
      v_before_stage:=v_p.before_json->>'stage';
      v_before_rank:=case v_before_stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end;
      v_current_rank:=case v_current_deal.stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end;
      if v_current_deal.status='won' then
        v_downstream:='positive'; v_key:='deal_won_after_action'; v_first_observed:=v_current_deal.closed_at;
      elsif v_current_deal.status='lost' then
        v_downstream:='negative'; v_key:='deal_lost_after_action'; v_first_observed:=v_current_deal.closed_at;
      elsif v_current_rank>v_before_rank then
        v_downstream:='positive'; v_key:='deal_stage_progressed_after_action'; v_first_observed:=v_current_deal.updated_at;
      elsif v_current_deal.last_meaningful_at is not null and v_current_deal.last_meaningful_at>coalesce(v_p.applied_at,v_p.created_at) then
        v_downstream:='positive'; v_key:='meaningful_deal_activity_after_action'; v_first_observed:=v_current_deal.last_meaningful_at;
      elsif now()>=v_window_end then
        v_downstream:='neutral'; v_key:='no_deal_progress_observed_in_window';
      else
        v_downstream:='pending'; v_key:='deal_outcome_pending';
      end if;
      v_evidence:=jsonb_build_object('deal_room_id',v_current_deal.id,'before_stage',v_before_stage,'current_stage',v_current_deal.stage,'current_status',v_current_deal.status,'last_meaningful_at',v_current_deal.last_meaningful_at);
    end if;
  else
    v_operational:=case when v_p.status='applied' then 'completed' else 'pending' end;
    v_downstream:='not_applicable'; v_key:='no_outcome_model_for_action_type';
  end if;

  insert into platform.agency_action_outcomes(
    tenant_id,proposal_id,action_type,operational_state,downstream_state,outcome_key,evaluation_window_end,first_observed_at,last_evaluated_at,evidence
  ) values(
    v_p.tenant_id,v_p.id,v_p.action_type,v_operational,v_downstream,v_key,v_window_end,v_first_observed,now(),v_evidence
  )
  on conflict (proposal_id) do update set
    operational_state=excluded.operational_state,
    downstream_state=excluded.downstream_state,
    outcome_key=excluded.outcome_key,
    evaluation_window_end=excluded.evaluation_window_end,
    first_observed_at=coalesce(platform.agency_action_outcomes.first_observed_at,excluded.first_observed_at),
    last_evaluated_at=now(),
    evidence=excluded.evidence,
    updated_at=now()
  returning first_observed_at into v_first_observed;

  return jsonb_build_object(
    'proposal_id',v_p.id,'action_type',v_p.action_type,'operational_state',v_operational,
    'downstream_state',v_downstream,'outcome_key',v_key,'evaluation_window_end',v_window_end,
    'first_observed_at',v_first_observed,'evidence',v_evidence
  );
end;
$function$;

create or replace function public.platform_server_evaluate_action_outcomes(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_p record;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_checked integer:=0;
  v_failed integer:=0;
begin
  if not exists(select 1 from platform.tenants where id=p_tenant_id and status='active') then raise exception 'tenant_not_found'; end if;
  for v_p in
    select p.id from platform.agency_action_proposals p
    where p.tenant_id=p_tenant_id
      and p.created_at>=now()-interval '180 days'
      and p.status in ('applied','undone','failed')
    order by p.created_at desc
  loop
    begin
      v_result:=platform.evaluate_agency_action_outcome(v_p.id);
      v_results:=v_results||jsonb_build_array(v_result);
      v_checked:=v_checked+1;
    exception when others then
      v_failed:=v_failed+1;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('proposal_id',v_p.id,'error',left(sqlerrm,500)));
    end;
  end loop;
  return jsonb_build_object('tenant_id',p_tenant_id,'checked',v_checked,'failed',v_failed,'evaluated_at',now(),'results',v_results);
end;
$function$;

revoke all on function public.platform_server_evaluate_action_outcomes(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_evaluate_action_outcomes(uuid) to service_role;

create or replace function public.platform_server_outcome_learning(p_tenant_id uuid, p_window_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_days integer:=greatest(14,least(coalesce(p_window_days,90),365));
  v_tenant platform.tenants%rowtype;
  v_actions jsonb;
begin
  select * into v_tenant from platform.tenants where id=p_tenant_id and status='active';
  if not found then raise exception 'tenant_not_found'; end if;

  with stats as (
    select o.action_type,
      count(*)::integer as evaluated_count,
      count(*) filter(where o.operational_state='completed')::integer as operational_completed,
      count(*) filter(where o.operational_state='cancelled')::integer as cancelled_count,
      count(*) filter(where o.operational_state='failed')::integer as failed_count,
      count(*) filter(where o.downstream_state='positive')::integer as downstream_positive,
      count(*) filter(where o.downstream_state='negative')::integer as downstream_negative,
      count(*) filter(where o.downstream_state='neutral')::integer as downstream_neutral,
      count(*) filter(where o.downstream_state='pending')::integer as downstream_pending,
      count(*) filter(where o.downstream_state in ('positive','negative','neutral'))::integer as downstream_resolved
    from platform.agency_action_outcomes o
    where o.tenant_id=p_tenant_id and o.created_at>=now()-make_interval(days=>v_days)
    group by o.action_type
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'action_type',action_type,
    'evaluated_count',evaluated_count,
    'operational_completed',operational_completed,
    'cancelled_count',cancelled_count,
    'failed_count',failed_count,
    'downstream_positive',downstream_positive,
    'downstream_negative',downstream_negative,
    'downstream_neutral',downstream_neutral,
    'downstream_pending',downstream_pending,
    'downstream_resolved',downstream_resolved,
    'resolved_positive_rate',case when downstream_resolved=0 then null else round(downstream_positive::numeric/downstream_resolved,4) end
  ) order by action_type),'[]'::jsonb)
  into v_actions from stats;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'window_days',v_days,
    'environment',coalesce(v_tenant.metadata->>'environment','production'),
    'synthetic_tenant',coalesce((v_tenant.metadata->>'synthetic_test_tenant')::boolean,false),
    'actions',v_actions,
    'learning_policy',jsonb_build_object(
      'automatic_policy_weight_changes',false,
      'synthetic_results_can_change_production_policy',false,
      'principle','Measure downstream effectiveness separately from execution reliability. Recommendation policy changes require explicit review.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_outcome_learning(uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_outcome_learning(uuid,integer) to service_role;;
