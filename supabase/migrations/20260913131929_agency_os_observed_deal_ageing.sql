create or replace function public.platform_server_deal_ageing(p_tenant_id uuid,p_deal_room_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_deal djm_os.deal_rooms%rowtype;
  v_first timestamptz;
  v_current_since timestamptz;
  v_last_different timestamptz;
  v_snapshot_count integer:=0;
  v_distinct_stages integer:=0;
  v_history_mode text;
  v_first_source text;
  v_days_stage numeric:=null;
  v_days_observed numeric:=null;
begin
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;

  select min(observed_at),count(*)::integer,count(distinct stage)::integer
  into v_first,v_snapshot_count,v_distinct_stages
  from platform.deal_state_snapshots s
  where s.tenant_id=p_tenant_id and s.deal_room_id=p_deal_room_id;

  select source into v_first_source
  from platform.deal_state_snapshots s
  where s.tenant_id=p_tenant_id and s.deal_room_id=p_deal_room_id
  order by observed_at asc,id asc limit 1;

  select max(observed_at) into v_last_different
  from platform.deal_state_snapshots s
  where s.tenant_id=p_tenant_id and s.deal_room_id=p_deal_room_id and s.stage is distinct from v_deal.stage;

  if v_last_different is not null then
    select min(observed_at) into v_current_since
    from platform.deal_state_snapshots s
    where s.tenant_id=p_tenant_id and s.deal_room_id=p_deal_room_id and s.stage=v_deal.stage and s.observed_at>v_last_different;
  else
    select min(observed_at) into v_current_since
    from platform.deal_state_snapshots s
    where s.tenant_id=p_tenant_id and s.deal_room_id=p_deal_room_id and s.stage=v_deal.stage;
  end if;

  if v_current_since is not null then v_days_stage:=round(extract(epoch from (now()-v_current_since))/86400.0,1); end if;
  if v_first is not null then v_days_observed:=round(extract(epoch from (now()-v_first))/86400.0,1); end if;

  v_history_mode:=case
    when v_snapshot_count=0 then 'no_history'
    when v_first_source='synthetic_demo_history' then 'synthetic_demo_history'
    when v_snapshot_count=1 then 'baseline_only'
    when v_distinct_stages>=2 then 'observed_stage_history'
    else 'observed_same_stage_history'
  end;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'current_stage',v_deal.stage,'current_status',v_deal.status,
    'observed_stage_since',v_current_since,'observed_days_in_current_stage',v_days_stage,
    'observation_started_at',v_first,'observed_days_total',v_days_observed,'snapshot_count',v_snapshot_count,'distinct_stages_observed',v_distinct_stages,
    'history_mode',v_history_mode,
    'confidence',case when v_history_mode='observed_stage_history' then 'strong_for_observed_window' when v_history_mode='synthetic_demo_history' then 'synthetic_demo_only' when v_history_mode='baseline_only' then 'baseline_only_do_not_infer_true_stage_age' when v_history_mode='no_history' then 'unavailable' else 'partial_observed_window' end,
    'interpretation','Observed stage age measures how long the platform has recorded the current stage. It must not be presented as the true stage age when history begins with a baseline snapshot.'
  );
end;
$$;

revoke execute on function public.platform_server_deal_ageing(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_deal_ageing(uuid,uuid) to service_role;;
