create or replace function public.platform_server_player_value_proof_delta(
  p_tenant_id uuid,
  p_player_id uuid,
  p_from_snapshot_id uuid default null,
  p_to_snapshot_id uuid default null
)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_from platform.player_value_proof_snapshots%rowtype;
  v_to platform.player_value_proof_snapshots%rowtype;
  v_count integer:=0;
  v_metrics text[]:=array['agency_work_completed','player_requests_resolved','career_strategy_versions_created','career_strategy_confirmations','career_strategy_approvals','market_matches_added','opportunities_opened','club_processes_opened','recorded_deal_stage_advances','recorded_deals_won'];
  v_metric text;
  v_from_value integer;
  v_to_value integer;
  v_deltas jsonb:='{}'::jsonb;
begin
  if not exists(select 1 from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id) then raise exception 'player_not_found_for_tenant'; end if;

  if p_to_snapshot_id is not null then
    select * into v_to from platform.player_value_proof_snapshots s where s.id=p_to_snapshot_id and s.tenant_id=p_tenant_id and s.player_id=p_player_id;
    if not found then raise exception 'to_snapshot_not_found_for_player'; end if;
  else
    select * into v_to from platform.player_value_proof_snapshots s where s.tenant_id=p_tenant_id and s.player_id=p_player_id order by s.snapshot_date desc,s.created_at desc limit 1;
  end if;

  if p_from_snapshot_id is not null then
    select * into v_from from platform.player_value_proof_snapshots s where s.id=p_from_snapshot_id and s.tenant_id=p_tenant_id and s.player_id=p_player_id;
    if not found then raise exception 'from_snapshot_not_found_for_player'; end if;
  elsif v_to.id is not null then
    select * into v_from from platform.player_value_proof_snapshots s where s.tenant_id=p_tenant_id and s.player_id=p_player_id and s.id<>v_to.id and (s.snapshot_date<v_to.snapshot_date or (s.snapshot_date=v_to.snapshot_date and s.created_at<v_to.created_at)) order by s.snapshot_date desc,s.created_at desc limit 1;
  end if;

  select count(*) into v_count from platform.player_value_proof_snapshots s where s.tenant_id=p_tenant_id and s.player_id=p_player_id;
  if v_to.id is null or v_from.id is null then
    return jsonb_build_object(
      'available',true,'tenant_id',p_tenant_id,'player_id',p_player_id,'status','insufficient_snapshot_history','snapshot_count',v_count,
      'latest_snapshot',case when v_to.id is null then null else jsonb_build_object('snapshot_id',v_to.id,'snapshot_date',v_to.snapshot_date,'window_days',v_to.window_days,'proof_state',v_to.proof->>'proof_state') end,
      'truth_contract',jsonb_build_object('comparison','At least two persisted snapshots are required. DJM does not fabricate a historical baseline when one is unavailable.')
    );
  end if;

  foreach v_metric in array v_metrics loop
    if v_metric in ('agency_work_completed','player_requests_resolved','career_strategy_versions_created','career_strategy_confirmations','career_strategy_approvals') then
      v_from_value:=coalesce((v_from.proof#>>array['service_delivery',v_metric])::integer,0);
      v_to_value:=coalesce((v_to.proof#>>array['service_delivery',v_metric])::integer,0);
    else
      v_from_value:=coalesce((v_from.proof#>>array['market_work',v_metric])::integer,0);
      v_to_value:=coalesce((v_to.proof#>>array['market_work',v_metric])::integer,0);
    end if;
    v_deltas:=v_deltas||jsonb_build_object(v_metric,jsonb_build_object('from',v_from_value,'to',v_to_value,'delta',v_to_value-v_from_value));
  end loop;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'player_id',p_player_id,'status','comparable',
    'from_snapshot',jsonb_build_object('snapshot_id',v_from.id,'snapshot_date',v_from.snapshot_date,'window_days',v_from.window_days,'proof_state',v_from.proof->>'proof_state'),
    'to_snapshot',jsonb_build_object('snapshot_id',v_to.id,'snapshot_date',v_to.snapshot_date,'window_days',v_to.window_days,'proof_state',v_to.proof->>'proof_state'),
    'recorded_proof_state_change',jsonb_build_object('from',v_from.proof->>'proof_state','to',v_to.proof->>'proof_state','changed',(v_from.proof->>'proof_state') is distinct from (v_to.proof->>'proof_state')),
    'metric_deltas',v_deltas,
    'truth_contract',jsonb_build_object(
      'meaning','Deltas compare two persisted DJM snapshots. They show changes in recorded evidence, not changes in agent quality, player satisfaction or transfer probability.',
      'windows','When snapshot windows overlap, counts can move because events enter or leave the selected rolling window. A negative delta is not automatically a deterioration.',
      'history','Only evidence captured in the two persisted snapshots is compared.'
    )
  );
end;
$$;

create or replace function public.platform_server_value_proof_review_queue(
  p_tenant_id uuid,
  p_cadence_days integer default 30,
  p_limit integer default 100
)
returns jsonb
language sql
stable security definer
set search_path=''
as $$
with params as (
  select greatest(1,least(coalesce(p_cadence_days,30),180)) cadence_days,greatest(1,least(coalesce(p_limit,100),500)) lim
), players as (
  select p.id,coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') player_name,p.football_status,p.contract_status,p.contract_expiry
  from public.players p where p.tenant_id=p_tenant_id and coalesce(p.football_status,'active') not in ('retired','inactive')
), latest as (
  select distinct on (s.player_id) s.player_id,s.id snapshot_id,s.snapshot_date,s.created_at,s.window_days,s.proof
  from platform.player_value_proof_snapshots s where s.tenant_id=p_tenant_id order by s.player_id,s.snapshot_date desc,s.created_at desc
), classified as (
  select p.*,l.snapshot_id,l.snapshot_date,l.window_days,l.proof,
    case when l.snapshot_id is null then 'snapshot_missing'
         when current_date-l.snapshot_date >= (select cadence_days from params) then 'snapshot_due'
         when l.proof->>'proof_state'='thin_recorded_evidence' then 'review_recording_completeness'
         else 'current' end review_state,
    case when l.snapshot_date is null then null else current_date-l.snapshot_date end days_since_snapshot
  from players p left join latest l on l.player_id=p.id
), ranked as (
  select *,row_number() over(order by case review_state when 'snapshot_missing' then 1 when 'snapshot_due' then 2 when 'review_recording_completeness' then 3 else 4 end,days_since_snapshot desc nulls first,contract_expiry nulls last,player_name) rn
  from classified
)
select jsonb_build_object(
  'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'cadence_days',(select cadence_days from params),
  'summary',jsonb_build_object(
    'active_players',(select count(*) from players),
    'snapshot_missing',(select count(*) from classified where review_state='snapshot_missing'),
    'snapshot_due',(select count(*) from classified where review_state='snapshot_due'),
    'review_recording_completeness',(select count(*) from classified where review_state='review_recording_completeness'),
    'current',(select count(*) from classified where review_state='current')
  ),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'rank',rn,'player_id',id,'player_name',player_name,'football_status',football_status,'contract_status',contract_status,'contract_expiry',contract_expiry,
    'review_state',review_state,'latest_snapshot',case when snapshot_id is null then null else jsonb_build_object('snapshot_id',snapshot_id,'snapshot_date',snapshot_date,'window_days',window_days,'proof_state',proof->>'proof_state','days_since_snapshot',days_since_snapshot) end,
    'next_action',case review_state
      when 'snapshot_missing' then jsonb_build_object('api_action','player_value_proof_capture','instruction','Capture the first factual player-service proof snapshot.')
      when 'snapshot_due' then jsonb_build_object('api_action','player_value_proof_capture','instruction','Capture the next point-in-time proof snapshot for the agreed review cadence.')
      when 'review_recording_completeness' then jsonb_build_object('api_action','player_value_proof','instruction','Review whether important agency work is missing from DJM before treating the proof as complete.')
      else jsonb_build_object('api_action','player_value_proof','instruction','No proof-cadence action is currently forced.') end
  ) order by rn) from ranked where rn<=(select lim from params)),'[]'::jsonb),
  'truth_contract',jsonb_build_object(
    'cadence','The cadence is an operating review interval supplied to this function, not a legal or regulatory requirement.',
    'thin_evidence','Thin recorded evidence triggers a recording-completeness review, not a conclusion that the agency failed to service the player.',
    'current','Current only means a recent snapshot exists and is not classified as thin recorded evidence.'
  )
);
$$;

create or replace function public.platform_server_value_proof_review_pack(p_tenant_id uuid,p_cadence_days integer default 30,p_limit integer default 100)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_queue jsonb:=public.platform_server_value_proof_review_queue(p_tenant_id,p_cadence_days,p_limit);
  v_portfolio jsonb:=public.platform_server_player_value_proof_portfolio(p_tenant_id,p_cadence_days,p_limit);
begin
  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'cadence_days',p_cadence_days,
    'review_queue',v_queue,
    'portfolio',v_portfolio,
    'truth_contract',jsonb_build_object('purpose','Prepare factual player-service reviews from persisted and current DJM evidence. It does not grade agents or infer player satisfaction.')
  );
end;
$$;

revoke all on function public.platform_server_player_value_proof_delta(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_value_proof_review_queue(uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.platform_server_value_proof_review_pack(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.platform_server_player_value_proof_delta(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.platform_server_value_proof_review_queue(uuid,integer,integer) to service_role;
grant execute on function public.platform_server_value_proof_review_pack(uuid,integer,integer) to service_role;
;
