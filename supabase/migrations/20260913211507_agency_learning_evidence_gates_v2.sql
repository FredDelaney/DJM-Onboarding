create or replace function public.platform_server_agency_learning_v2(p_tenant_id uuid,p_window_days integer default 365)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_days integer:=greatest(30,least(coalesce(p_window_days,365),730));
  v_tenant platform.tenants%rowtype;
  v_plays jsonb;
  v_total integer:=0;
  v_resolved integer:=0;
  v_usable integer:=0;
  v_emerging integer:=0;
  v_insufficient integer:=0;
  v_policy_eligible boolean:=false;
begin
  select * into v_tenant from platform.tenants where id=p_tenant_id and status='active';
  if not found then raise exception 'tenant_not_found'; end if;
  v_policy_eligible:=not coalesce((v_tenant.metadata->>'synthetic_test_tenant')::boolean,false);

  with base as (
    select
      o.action_type,
      coalesce(
        nullif(o.evidence->>'strategy_action_type',''),
        nullif(o.evidence->>'service_move_type',''),
        nullif(o.evidence->>'negotiation_step_type',''),
        nullif(o.evidence->>'deal_step_type',''),
        nullif(o.evidence->>'target_gap',''),
        o.action_type
      ) as play_key,
      o.operational_state,
      o.downstream_state,
      o.outcome_key
    from platform.agency_action_outcomes o
    where o.tenant_id=p_tenant_id
      and o.created_at>=now()-make_interval(days=>v_days)
  ), stats as (
    select
      action_type,play_key,
      count(*)::integer as evaluated_count,
      count(*) filter(where downstream_state in ('positive','negative','neutral'))::integer as resolved_count,
      count(*) filter(where downstream_state='positive')::integer as positive_count,
      count(*) filter(where downstream_state='negative')::integer as negative_count,
      count(*) filter(where downstream_state='neutral')::integer as neutral_count,
      count(*) filter(where downstream_state='pending')::integer as pending_count,
      count(*) filter(where operational_state='completed')::integer as operational_completed,
      count(*) filter(where operational_state='cancelled')::integer as cancelled_count,
      count(*) filter(where operational_state='failed')::integer as failed_count
    from base group by action_type,play_key
  ), calc as (
    select s.*,
      case when resolved_count=0 then null else positive_count::numeric/resolved_count end as p_hat,
      case
        when resolved_count<10 then 'insufficient'
        when resolved_count<25 then 'emerging'
        else 'usable'
      end as evidence_state
    from stats s
  ), wilson as (
    select c.*,
      case when resolved_count=0 then null else greatest(0::numeric,
        ((p_hat + 3.8416/(2*resolved_count)) / (1 + 3.8416/resolved_count))
        - (1.96 * sqrt((p_hat*(1-p_hat) + 3.8416/(4*resolved_count))/resolved_count) / (1 + 3.8416/resolved_count))
      ) end as ci_low,
      case when resolved_count=0 then null else least(1::numeric,
        ((p_hat + 3.8416/(2*resolved_count)) / (1 + 3.8416/resolved_count))
        + (1.96 * sqrt((p_hat*(1-p_hat) + 3.8416/(4*resolved_count))/resolved_count) / (1 + 3.8416/resolved_count))
      ) end as ci_high
    from calc c
  ), interpreted as (
    select w.*,
      case
        when evidence_state='insufficient' then 'keep_learning'
        when evidence_state='emerging' then 'observe_only'
        when not v_policy_eligible then 'synthetic_demo_only'
        when ci_low>=0.55 then 'stronger_play_candidate'
        when ci_high<=0.45 then 'weaker_play_candidate'
        else 'mixed_no_policy_change'
      end as recommendation,
      case
        when evidence_state='insufficient' then 'Fewer than 10 resolved outcomes. Do not infer effectiveness.'
        when evidence_state='emerging' then '10-24 resolved outcomes. Direction may be visible, but evidence is not mature enough for operating-policy changes.'
        when not v_policy_eligible then 'Synthetic demo evidence can illustrate the method but cannot change production policy.'
        when ci_low>=0.55 then 'The 95% Wilson lower bound is at least 55%, making this a candidate for human review as a stronger observed play.'
        when ci_high<=0.45 then 'The 95% Wilson upper bound is at most 45%, making this a candidate for human review as a weaker observed play.'
        else 'Evidence is mature enough to inspect, but the observed effect is mixed. Keep the current policy unless human review finds stronger context.'
      end as interpretation
    from wilson w
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'action_type',action_type,
      'play_key',play_key,
      'evaluated_count',evaluated_count,
      'resolved_count',resolved_count,
      'positive_count',positive_count,
      'negative_count',negative_count,
      'neutral_count',neutral_count,
      'pending_count',pending_count,
      'operational_completed',operational_completed,
      'cancelled_count',cancelled_count,
      'failed_count',failed_count,
      'evidence_state',evidence_state,
      'raw_positive_rate',case when resolved_count=0 then null else round(p_hat,4) end,
      'decision_positive_rate',case when resolved_count>=10 then round(p_hat,4) else null end,
      'wilson_95',case when resolved_count>=10 then jsonb_build_object('low',round(ci_low,4),'high',round(ci_high,4)) else null end,
      'recommendation',recommendation,
      'policy_change_allowed',false,
      'interpretation',interpretation
    ) order by
      case evidence_state when 'usable' then 0 when 'emerging' then 1 else 2 end,
      resolved_count desc,action_type,play_key),'[]'::jsonb),
    coalesce(sum(evaluated_count),0)::integer,
    coalesce(sum(resolved_count),0)::integer,
    count(*) filter(where evidence_state='usable')::integer,
    count(*) filter(where evidence_state='emerging')::integer,
    count(*) filter(where evidence_state='insufficient')::integer
  into v_plays,v_total,v_resolved,v_usable,v_emerging,v_insufficient
  from interpreted;

  return jsonb_build_object(
    'available',true,
    'tenant_id',p_tenant_id,
    'window_days',v_days,
    'environment',coalesce(v_tenant.metadata->>'environment','production'),
    'synthetic_tenant',coalesce((v_tenant.metadata->>'synthetic_test_tenant')::boolean,false),
    'summary',jsonb_build_object(
      'evaluated_outcomes',v_total,
      'resolved_outcomes',v_resolved,
      'usable_plays',v_usable,
      'emerging_plays',v_emerging,
      'insufficient_plays',v_insufficient,
      'policy_eligible_environment',v_policy_eligible
    ),
    'plays',v_plays,
    'evidence_policy',jsonb_build_object(
      'minimum_resolved_for_rate',10,
      'minimum_resolved_for_usable',25,
      'confidence_interval','95% Wilson score interval',
      'strong_candidate_rule','usable evidence and Wilson lower bound >= 0.55',
      'weak_candidate_rule','usable evidence and Wilson upper bound <= 0.45',
      'automatic_policy_changes',false,
      'synthetic_results_can_change_production_policy',false
    ),
    'truth_contract',jsonb_build_object(
      'causality','Observed historical association is not causal proof.',
      'comparability','A play is grouped by recorded intervention subtype. Different player, market and club contexts may not be directly comparable.',
      'small_samples','No decision-grade rate is shown below 10 resolved outcomes and no play is marked usable below 25.',
      'recommendations','A stronger/weaker candidate is a prompt for human review, never an automatic operating-policy change.'
    )
  );
end;$$;

revoke all on function public.platform_server_agency_learning_v2(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_agency_learning_v2(uuid,integer) to service_role;;
