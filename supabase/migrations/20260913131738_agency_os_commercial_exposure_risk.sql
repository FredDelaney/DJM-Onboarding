create or replace function public.platform_server_commercial_exposure_risk(p_tenant_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_portfolio jsonb;
  v_deals jsonb;
  v_total jsonb;
  v_risk_by_currency jsonb;
  v_items jsonb;
  v_concentration jsonb;
begin
  v_portfolio:=public.platform_server_deal_portfolio(p_tenant_id,50);
  v_deals:=coalesce(v_portfolio->'deals','[]'::jsonb);

  with d as (
    select x.value item,
           coalesce(nullif(x.value->>'currency',''),'UNKNOWN') currency,
           coalesce((x.value->>'expected_commission')::numeric,0) expected_commission,
           coalesce((x.value->>'weighted_commission')::numeric,0) weighted_commission,
           coalesce((x.value->>'control_score')::integer,0) control_score,
           coalesce((x.value->>'evidence_score')::integer,0) evidence_score,
           coalesce((x.value->>'direct_access_score')::integer,0) direct_access,
           coalesce((x.value->>'best_introduction_score')::integer,0) intro_score,
           x.value->>'momentum_state' momentum_state,
           x.value->>'rescue_state' rescue_state,
           x.value->'control_gaps' gaps
    from jsonb_array_elements(v_deals) x
  ), classified as (
    select *,
      case
        when evidence_score<65 or rescue_state='commercial_rescue' or control_score<55 then 'red_intervention'
        when control_score<70 or momentum_state in ('busy_but_cooling','cooling','stalled','busy_not_moving','stalled_or_uncontrolled') then 'amber_recovery'
        when jsonb_array_length(coalesce(gaps,'[]'::jsonb))>0 then 'watch_process_gap'
        else 'healthy' end risk_state,
      case
        when direct_access<60 and intro_score>=80 then 'weak_direct_mitigated_by_introduction'
        when direct_access<60 then 'weak_access_unmitigated'
        when direct_access<75 then 'usable_direct_access'
        else 'strong_direct_access' end access_risk_state
    from d
  )
  select coalesce(jsonb_agg(item || jsonb_build_object(
      'commercial_risk_state',risk_state,
      'access_risk_state',access_risk_state,
      'risk_reasons',jsonb_strip_nulls(jsonb_build_object(
        'evidence',case when evidence_score<65 then 'evidence_below_action_threshold' else null end,
        'control',case when control_score<55 then 'control_exposed' when control_score<70 then 'control_fragile' else null end,
        'momentum',case when momentum_state in ('stalled','busy_not_moving','stalled_or_uncontrolled') then 'stalled' when momentum_state in ('busy_but_cooling','cooling') then 'cooling' else null end,
        'access',case when direct_access<60 and intro_score<80 then 'weak_access_unmitigated' when direct_access<60 and intro_score>=80 then 'weak_direct_but_intro_available' else null end,
        'process_gaps',case when jsonb_array_length(coalesce(gaps,'[]'::jsonb))>0 then gaps else null end
      ))
    ) order by
      case risk_state when 'red_intervention' then 1 when 'amber_recovery' then 2 when 'watch_process_gap' then 3 else 4 end,
      expected_commission desc),'[]'::jsonb)
  into v_items from classified;

  with d as (
    select coalesce(nullif(x.value->>'currency',''),'UNKNOWN') currency,
           coalesce((x.value->>'expected_commission')::numeric,0) expected_commission,
           coalesce((x.value->>'weighted_commission')::numeric,0) weighted_commission,
           coalesce((x.value->>'control_score')::integer,0) control_score,
           coalesce((x.value->>'evidence_score')::integer,0) evidence_score,
           coalesce((x.value->>'direct_access_score')::integer,0) direct_access,
           coalesce((x.value->>'best_introduction_score')::integer,0) intro_score,
           x.value->>'momentum_state' momentum_state,
           x.value->>'rescue_state' rescue_state,
           x.value->'control_gaps' gaps
    from jsonb_array_elements(v_deals) x
  ), classified as (
    select *,case
      when evidence_score<65 or rescue_state='commercial_rescue' or control_score<55 then 'red_intervention'
      when control_score<70 or momentum_state in ('busy_but_cooling','cooling','stalled','busy_not_moving','stalled_or_uncontrolled') then 'amber_recovery'
      when jsonb_array_length(coalesce(gaps,'[]'::jsonb))>0 then 'watch_process_gap'
      else 'healthy' end risk_state,
      case when direct_access<60 and intro_score<80 then true else false end weak_access_unmitigated,
      case when direct_access<60 and intro_score>=80 then true else false end weak_direct_mitigated
    from d
  ), agg as (
    select currency,count(*)::integer active_deals,
      sum(expected_commission) expected_commission,sum(weighted_commission) weighted_commission,
      sum(expected_commission) filter(where risk_state='red_intervention') red_expected,
      sum(weighted_commission) filter(where risk_state='red_intervention') red_weighted,
      sum(expected_commission) filter(where risk_state='amber_recovery') amber_expected,
      sum(weighted_commission) filter(where risk_state='amber_recovery') amber_weighted,
      sum(expected_commission) filter(where risk_state='watch_process_gap') watch_expected,
      sum(weighted_commission) filter(where risk_state='watch_process_gap') watch_weighted,
      sum(expected_commission) filter(where risk_state='healthy') healthy_expected,
      sum(weighted_commission) filter(where risk_state='healthy') healthy_weighted,
      sum(expected_commission) filter(where weak_access_unmitigated) weak_access_expected,
      sum(expected_commission) filter(where weak_direct_mitigated) intro_mitigated_expected
    from classified group by currency
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'currency',currency,'active_deals',active_deals,'expected_commission',expected_commission,'weighted_commission',weighted_commission,
    'red_intervention',jsonb_build_object('expected_commission',coalesce(red_expected,0),'weighted_commission',coalesce(red_weighted,0)),
    'amber_recovery',jsonb_build_object('expected_commission',coalesce(amber_expected,0),'weighted_commission',coalesce(amber_weighted,0)),
    'watch_process_gap',jsonb_build_object('expected_commission',coalesce(watch_expected,0),'weighted_commission',coalesce(watch_weighted,0)),
    'healthy',jsonb_build_object('expected_commission',coalesce(healthy_expected,0),'weighted_commission',coalesce(healthy_weighted,0)),
    'weak_access_unmitigated_expected_commission',coalesce(weak_access_expected,0),
    'weak_direct_access_mitigated_by_intro_expected_commission',coalesce(intro_mitigated_expected,0)
  ) order by currency),'[]'::jsonb)
  into v_risk_by_currency from agg;

  v_total:=jsonb_build_object(
    'active_deals',jsonb_array_length(v_deals),
    'red_intervention_deals',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'commercial_risk_state'='red_intervention'),
    'amber_recovery_deals',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'commercial_risk_state'='amber_recovery'),
    'watch_process_gap_deals',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'commercial_risk_state'='watch_process_gap'),
    'healthy_deals',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'commercial_risk_state'='healthy'),
    'weak_access_unmitigated_deals',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'access_risk_state'='weak_access_unmitigated'),
    'weak_direct_mitigated_by_intro_deals',(select count(*) from jsonb_array_elements(v_items) x where x.value->>'access_risk_state'='weak_direct_mitigated_by_introduction')
  );

  with d as (
    select coalesce(nullif(x.value->>'currency',''),'UNKNOWN') currency,
           x.value->>'organisation' organisation,
           coalesce((x.value->>'expected_commission')::numeric,0) expected_commission
    from jsonb_array_elements(v_deals) x
  ), totals as (
    select currency,sum(expected_commission) total,count(*) deal_count from d group by currency
  ), top_org as (
    select d.currency,d.organisation,sum(d.expected_commission) org_expected,t.total,t.deal_count,
      row_number() over(partition by d.currency order by sum(d.expected_commission) desc,d.organisation) rn
    from d join totals t on t.currency=d.currency
    group by d.currency,d.organisation,t.total,t.deal_count
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'currency',currency,'top_organisation',organisation,'top_expected_commission',org_expected,'total_expected_commission',total,
    'top_share',case when total=0 then 0 else round(org_expected/total,4) end,
    'state',case when deal_count>=2 and total>0 and org_expected/total>=0.60 then 'concentrated' when deal_count>=2 and total>0 and org_expected/total>=0.40 then 'moderate_concentration' else 'diversified_or_small_sample' end,
    'interpretation','Concentration shows share of recorded expected commission, not probability of loss.'
  ) order by currency),'[]'::jsonb)
  into v_concentration from top_org where rn=1;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'generated_at',now(),'summary',v_total,'by_currency',v_risk_by_currency,'deals',v_items,'concentration',v_concentration,
    'policy',jsonb_build_object(
      'red_intervention','Evidence below threshold, commercial rescue state, or exposed control.',
      'amber_recovery','Fragile control or cooling/stalled momentum.',
      'watch_process_gap','Deal is not currently fragile, but recorded process gaps remain.',
      'healthy','No current evidence, control, momentum or access intervention signal.',
      'principle','Exposure classification is an operating-risk view. It does not change the recorded deal probability or expected commission.'
    )
  );
end;
$$;

revoke execute on function public.platform_server_commercial_exposure_risk(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_commercial_exposure_risk(uuid) to service_role;;
