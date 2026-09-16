create or replace function public.platform_server_forecast_calibration(p_tenant_id uuid,p_window_days integer default 365)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_days integer:=greatest(30,least(coalesce(p_window_days,365),1460));
  v_resolved integer:=0;
  v_wins integer:=0;
  v_avg_pred numeric:=null;
  v_win_rate numeric:=null;
  v_bias numeric:=null;
  v_brier numeric:=null;
  v_buckets jsonb;
  v_source_quality jsonb;
  v_state text;
begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id and t.status='active') then raise exception 'tenant_not_found'; end if;

  with resolved as (
    select d.id,d.status,d.closed_at,d.updated_at,
           coalesce(h.probability,d.probability,d.manual_probability,d.model_probability)::numeric as pre_resolution_probability,
           case when d.status='won' then 1::numeric else 0::numeric end outcome,
           case when h.probability is not null then 'historical_active_snapshot' else 'current_deal_fallback' end forecast_source
    from djm_os.deal_rooms d
    left join lateral (
      select s.probability
      from platform.deal_state_snapshots s
      where s.tenant_id=p_tenant_id and s.deal_room_id=d.id and s.status='active' and s.probability is not null
        and s.observed_at<=coalesce(d.closed_at,d.updated_at,now())
      order by s.observed_at desc,s.id desc limit 1
    ) h on true
    where d.tenant_id=p_tenant_id and d.status in ('won','lost')
      and coalesce(d.closed_at,d.updated_at)>=now()-make_interval(days=>v_days)
      and coalesce(h.probability,d.probability,d.manual_probability,d.model_probability) is not null
  ), metrics as (
    select count(*)::integer resolved_count,count(*) filter(where outcome=1)::integer wins,
           avg(pre_resolution_probability/100.0) avg_pred,avg(outcome) win_rate,
           avg(power(pre_resolution_probability/100.0-outcome,2)) brier
    from resolved
  )
  select resolved_count,wins,round(avg_pred,4),round(win_rate,4),round(avg_pred-win_rate,4),round(brier,4)
  into v_resolved,v_wins,v_avg_pred,v_win_rate,v_bias,v_brier from metrics;

  with resolved as (
    select d.id,d.status,
           coalesce(h.probability,d.probability,d.manual_probability,d.model_probability)::integer p,
           case when d.status='won' then 1 else 0 end outcome
    from djm_os.deal_rooms d
    left join lateral (
      select s.probability from platform.deal_state_snapshots s
      where s.tenant_id=p_tenant_id and s.deal_room_id=d.id and s.status='active' and s.probability is not null
        and s.observed_at<=coalesce(d.closed_at,d.updated_at,now())
      order by s.observed_at desc,s.id desc limit 1
    ) h on true
    where d.tenant_id=p_tenant_id and d.status in ('won','lost')
      and coalesce(d.closed_at,d.updated_at)>=now()-make_interval(days=>v_days)
      and coalesce(h.probability,d.probability,d.manual_probability,d.model_probability) is not null
  ), bucketed as (
    select case when p<20 then '0-19' when p<40 then '20-39' when p<60 then '40-59' when p<80 then '60-79' else '80-100' end bucket,
           case when p<20 then 1 when p<40 then 2 when p<60 then 3 when p<80 then 4 else 5 end bucket_order,
           count(*)::integer n,round(avg(p)::numeric/100.0,4) avg_forecast,round(avg(outcome)::numeric,4) observed_win_rate
    from resolved group by 1,2
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket',bucket,'resolved_deals',n,'average_forecast',avg_forecast,'observed_win_rate',observed_win_rate,
    'difference',round(avg_forecast-observed_win_rate,4),'interpretation_state',case when n>=5 then 'sample_available' else 'sample_too_small' end
  ) order by bucket_order),'[]'::jsonb)
  into v_buckets from bucketed;

  with resolved as (
    select case when h.probability is not null then 'historical_active_snapshot' else 'current_deal_fallback' end source,count(*)::integer n
    from djm_os.deal_rooms d
    left join lateral (
      select s.probability from platform.deal_state_snapshots s
      where s.tenant_id=p_tenant_id and s.deal_room_id=d.id and s.status='active' and s.probability is not null
        and s.observed_at<=coalesce(d.closed_at,d.updated_at,now())
      order by s.observed_at desc,s.id desc limit 1
    ) h on true
    where d.tenant_id=p_tenant_id and d.status in ('won','lost')
      and coalesce(d.closed_at,d.updated_at)>=now()-make_interval(days=>v_days)
      and coalesce(h.probability,d.probability,d.manual_probability,d.model_probability) is not null
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('source',source,'deals',n) order by source),'[]'::jsonb) into v_source_quality from resolved;

  v_state:=case when v_resolved<20 then 'insufficient_data' else 'measurable' end;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'window_days',v_days,'state',v_state,
    'sample',jsonb_build_object('resolved_deals',v_resolved,'wins',v_wins,'losses',greatest(v_resolved-v_wins,0),'minimum_resolved_deals_for_interpretation',20),
    'metrics',case when v_resolved=0 then null else jsonb_build_object(
      'average_forecast',v_avg_pred,'observed_win_rate',v_win_rate,'forecast_minus_observed',v_bias,'brier_score',v_brier
    ) end,
    'buckets',v_buckets,'forecast_source_quality',v_source_quality,
    'interpretation',case when v_resolved<20 then 'Not enough resolved deals to judge forecast calibration responsibly. Metrics, if present, are descriptive only.' else 'Calibration compares recorded pre-resolution deal probabilities with actual won/lost outcomes. Lower Brier score means forecasts were closer to outcomes, but this remains a historical calibration measure, not a future-success model.' end,
    'truth_contract','Uses the latest recorded active-state probability before resolution when available. Falls back to the deal probability only when historical probability is unavailable, and labels that fallback explicitly.'
  );
end;
$$;

revoke execute on function public.platform_server_forecast_calibration(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_forecast_calibration(uuid,integer) to service_role;;
