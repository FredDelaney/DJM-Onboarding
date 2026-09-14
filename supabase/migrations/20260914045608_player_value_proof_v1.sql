create table if not exists platform.player_value_proof_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  snapshot_date date not null default current_date,
  window_days integer not null check (window_days between 1 and 366),
  window_start timestamptz not null,
  window_end timestamptz not null,
  proof jsonb not null,
  captured_by uuid null,
  source text not null default 'manual_capture',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, player_id, snapshot_date, window_days)
);

alter table platform.player_value_proof_snapshots enable row level security;
create index if not exists player_value_proof_snapshots_tenant_date_idx on platform.player_value_proof_snapshots(tenant_id, snapshot_date desc);
create index if not exists player_value_proof_snapshots_player_date_idx on platform.player_value_proof_snapshots(tenant_id, player_id, snapshot_date desc);

create or replace function public.platform_server_player_value_proof(p_tenant_id uuid, p_player_id uuid, p_window_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_days integer := coalesce(p_window_days,30);
  v_since timestamptz;
  v_now timestamptz := now();
  v_player public.players%rowtype;
  v_name text;
  v_tasks_completed integer := 0;
  v_requests_resolved integer := 0;
  v_strategy_versions integer := 0;
  v_strategy_confirmations integer := 0;
  v_strategy_approvals integer := 0;
  v_matches_added integer := 0;
  v_opportunities_opened integer := 0;
  v_deals_opened integer := 0;
  v_deals_won integer := 0;
  v_stage_advances integer := 0;
  v_total_service_changes integer := 0;
  v_proof_state text;
  v_timeline jsonb := '[]'::jsonb;
  v_statement jsonb;
begin
  if v_days not between 1 and 366 then raise exception 'invalid_window_days'; end if;
  select * into v_player from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found_for_tenant'; end if;
  v_name:=coalesce(nullif(trim(v_player.preferred_name),''),nullif(trim(concat_ws(' ',v_player.first_name,v_player.last_name)),''),'Player');
  v_since:=v_now-make_interval(days=>v_days);

  select count(*) into v_tasks_completed from djm_os.tasks t where t.tenant_id=p_tenant_id and t.player_id=p_player_id and t.completed_at>=v_since and t.completed_at<=v_now;
  select count(*) into v_requests_resolved from public.player_requests r where r.player_id=p_player_id and r.completed_at>=v_since and r.completed_at<=v_now;
  select count(*) filter (where s.created_at>=v_since),
         count(*) filter (where s.player_confirmed_at>=v_since),
         count(*) filter (where s.approved_at>=v_since)
    into v_strategy_versions,v_strategy_confirmations,v_strategy_approvals
  from platform.player_career_strategies s where s.tenant_id=p_tenant_id and s.player_id=p_player_id;
  select count(*) into v_matches_added from djm_os.player_matches m where m.tenant_id=p_tenant_id and m.player_id=p_player_id and m.created_at>=v_since and m.created_at<=v_now;
  select count(*) into v_opportunities_opened from public.player_opportunities o where o.tenant_id=p_tenant_id and o.player_id=p_player_id and o.created_at>=v_since and o.created_at<=v_now;
  select count(*) filter (where d.created_at>=v_since), count(*) filter (where d.status='won' and d.closed_at>=v_since)
    into v_deals_opened,v_deals_won
  from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id;

  with ranked as (
    select s.deal_room_id,s.observed_at,s.stage,
      lag(s.stage) over(partition by s.deal_room_id order by s.observed_at,s.id) as previous_stage
    from platform.deal_state_snapshots s
    join djm_os.deal_rooms d on d.id=s.deal_room_id and d.tenant_id=s.tenant_id
    where s.tenant_id=p_tenant_id and d.player_id=p_player_id
  ), moved as (
    select * from ranked where observed_at>=v_since and observed_at<=v_now and previous_stage is not null and stage is not null and stage<>previous_stage
  )
  select count(*) into v_stage_advances from moved
  where (case stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end)
      > (case previous_stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end);

  v_total_service_changes:=v_tasks_completed+v_requests_resolved+v_strategy_versions+v_strategy_confirmations+v_strategy_approvals+v_matches_added+v_opportunities_opened+v_deals_opened+v_stage_advances+v_deals_won;
  v_proof_state:=case
    when v_deals_won>0 or v_stage_advances>0 or v_deals_opened>0 then 'material_market_change_recorded'
    when v_total_service_changes>0 then 'service_delivery_recorded'
    else 'thin_recorded_evidence'
  end;

  with events as (
    select t.completed_at as event_at,'agency_work_completed'::text as event_type,'Agency service work completed'::text as label,jsonb_build_object('task_type',t.task_type) as detail
      from djm_os.tasks t where t.tenant_id=p_tenant_id and t.player_id=p_player_id and t.completed_at between v_since and v_now
    union all
    select r.completed_at,'player_request_resolved','Player request resolved',jsonb_build_object('request_type',r.request_type,'title',r.title)
      from public.player_requests r where r.player_id=p_player_id and r.completed_at between v_since and v_now
    union all
    select s.player_confirmed_at,'career_strategy_confirmed','Career strategy confirmed with player',jsonb_build_object('version',s.version)
      from platform.player_career_strategies s where s.tenant_id=p_tenant_id and s.player_id=p_player_id and s.player_confirmed_at between v_since and v_now
    union all
    select s.approved_at,'career_strategy_approved','Career strategy approved',jsonb_build_object('version',s.version)
      from platform.player_career_strategies s where s.tenant_id=p_tenant_id and s.player_id=p_player_id and s.approved_at between v_since and v_now
    union all
    select m.created_at,'market_match_added','New market match recorded',jsonb_build_object('player_match_id',m.id)
      from djm_os.player_matches m where m.tenant_id=p_tenant_id and m.player_id=p_player_id and m.created_at between v_since and v_now
    union all
    select o.created_at,'opportunity_opened','New player opportunity recorded',jsonb_build_object('opportunity_id',o.id,'stage',o.stage)
      from public.player_opportunities o where o.tenant_id=p_tenant_id and o.player_id=p_player_id and o.created_at between v_since and v_now
    union all
    select d.created_at,'deal_opened','New club process recorded',jsonb_build_object('deal_room_id',d.id,'stage',d.stage)
      from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id and d.created_at between v_since and v_now
    union all
    select d.closed_at,'deal_won','Recorded club process completed successfully',jsonb_build_object('deal_room_id',d.id)
      from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id and d.status='won' and d.closed_at between v_since and v_now
  )
  select coalesce(jsonb_agg(jsonb_build_object('at',event_at,'type',event_type,'label',label,'detail',detail) order by event_at desc),'[]'::jsonb)
  into v_timeline from (select * from events where event_at is not null order by event_at desc limit 30) e;

  v_statement:=public.platform_server_player_service_statement(p_tenant_id,p_player_id);

  return jsonb_build_object(
    'available',true,
    'tenant_id',p_tenant_id,
    'player_id',p_player_id,
    'player_name',v_name,
    'window',jsonb_build_object('days',v_days,'from',v_since,'to',v_now),
    'proof_state',v_proof_state,
    'service_delivery',jsonb_build_object(
      'agency_work_completed',v_tasks_completed,
      'player_requests_resolved',v_requests_resolved,
      'career_strategy_versions_created',v_strategy_versions,
      'career_strategy_confirmations',v_strategy_confirmations,
      'career_strategy_approvals',v_strategy_approvals
    ),
    'market_work',jsonb_build_object(
      'market_matches_added',v_matches_added,
      'opportunities_opened',v_opportunities_opened,
      'club_processes_opened',v_deals_opened,
      'recorded_deal_stage_advances',v_stage_advances,
      'recorded_deals_won',v_deals_won
    ),
    'player_safe_current_statement',v_statement,
    'timeline',v_timeline,
    'truth_contract',jsonb_build_object(
      'service','This report shows only service and market work recorded in DJM. Offline work that was not captured is not visible.',
      'activity','Activity volume is evidence of recorded work, not proof of quality or player satisfaction.',
      'market','A new match, opportunity or deal is recorded market activity, not a transfer-success probability.',
      'stage_advances','Stage advances are derived from recorded deal-state snapshots and do not prove the club process will complete.',
      'player_safe','The timeline intentionally excludes fees, negotiation limits, private relationship routes and club-contact identities.'
    )
  );
end;
$$;

create or replace function public.platform_server_player_value_proof_portfolio(p_tenant_id uuid, p_window_days integer default 30, p_limit integer default 100)
returns jsonb
language sql
security definer
set search_path=''
as $$
with active_players as (
  select p.id,p.preferred_name,p.first_name,p.last_name
  from public.players p
  where p.tenant_id=p_tenant_id and coalesce(p.football_status,'active') not in ('retired','inactive')
), proofed as materialized (
  select p.id,coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') as player_name,
         public.platform_server_player_value_proof(p_tenant_id,p.id,p_window_days) as proof
  from active_players p
), ranked as (
  select *,case proof->>'proof_state' when 'thin_recorded_evidence' then 1 when 'service_delivery_recorded' then 2 else 3 end as state_rank
  from proofed
  order by state_rank,player_name
  limit greatest(1,least(coalesce(p_limit,100),500))
)
select jsonb_build_object(
  'available',true,'tenant_id',p_tenant_id,'window_days',p_window_days,
  'summary',jsonb_build_object(
    'active_players',(select count(*) from active_players),
    'players_with_thin_recorded_evidence',(select count(*) from proofed where proof->>'proof_state'='thin_recorded_evidence'),
    'players_with_recorded_service_delivery',(select count(*) from proofed where proof->>'proof_state'='service_delivery_recorded'),
    'players_with_material_market_change',(select count(*) from proofed where proof->>'proof_state'='material_market_change_recorded')
  ),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
      'player_id',id,'player_name',player_name,'proof_state',proof->>'proof_state',
      'service_delivery',proof->'service_delivery','market_work',proof->'market_work',
      'open_full_proof',jsonb_build_object('api_action','player_value_proof','player_id',id)
    ) order by state_rank,player_name) from ranked),'[]'::jsonb),
  'truth_contract',jsonb_build_object(
    'thin_evidence','Thin recorded evidence means DJM has little recorded service change in the selected window. It does not prove that no offline work occurred.',
    'no_score','Players are grouped by recorded proof state; no composite agent-performance or player-satisfaction score is calculated.'
  )
);
$$;

create or replace function public.platform_server_capture_player_value_proof(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid,p_window_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_proof jsonb;
  v_id uuid;
  v_from timestamptz;
  v_to timestamptz;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  v_proof:=public.platform_server_player_value_proof(p_tenant_id,p_player_id,p_window_days);
  v_from:=(v_proof#>>'{window,from}')::timestamptz;
  v_to:=(v_proof#>>'{window,to}')::timestamptz;
  insert into platform.player_value_proof_snapshots(tenant_id,player_id,snapshot_date,window_days,window_start,window_end,proof,captured_by,source)
  values(p_tenant_id,p_player_id,current_date,p_window_days,v_from,v_to,v_proof,p_actor_user_id,'manual_capture')
  on conflict (tenant_id,player_id,snapshot_date,window_days) do update set window_start=excluded.window_start,window_end=excluded.window_end,proof=excluded.proof,captured_by=excluded.captured_by,updated_at=now()
  returning id into v_id;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','player_value_proof.captured','player',p_player_id::text,jsonb_build_object('snapshot_id',v_id,'snapshot_date',current_date,'window_days',p_window_days),jsonb_build_object('privacy_scope','player_safe'));
  return jsonb_build_object('captured',true,'snapshot_id',v_id,'player_id',p_player_id,'snapshot_date',current_date,'window_days',p_window_days,'proof',v_proof);
end;
$$;

create or replace function public.platform_server_player_value_proof_history(p_tenant_id uuid,p_player_id uuid,p_limit integer default 24)
returns jsonb
language sql
security definer
set search_path=''
as $$
select jsonb_build_object(
  'available',true,'tenant_id',p_tenant_id,'player_id',p_player_id,
  'snapshots',coalesce(jsonb_agg(jsonb_build_object('snapshot_id',x.id,'snapshot_date',x.snapshot_date,'window_days',x.window_days,'window_start',x.window_start,'window_end',x.window_end,'proof_state',x.proof->>'proof_state','proof',x.proof) order by x.snapshot_date desc,x.created_at desc),'[]'::jsonb),
  'truth_contract',jsonb_build_object('snapshot','Each item is a persisted point-in-time proof generated from records available to DJM when the snapshot was captured.')
)
from (
  select s.* from platform.player_value_proof_snapshots s
  where s.tenant_id=p_tenant_id and s.player_id=p_player_id
  order by s.snapshot_date desc,s.created_at desc
  limit greatest(1,least(coalesce(p_limit,24),120))
) x;
$$;

create or replace function public.platform_server_agency_roi_proof(p_tenant_id uuid,p_window_days integer default 30)
returns jsonb
language sql
security definer
set search_path=''
as $$
select public.platform_server_value_proof(p_tenant_id,p_window_days) || jsonb_build_object(
  'proof_type','agency_roi',
  'truth_contract',jsonb_build_object(
    'pipeline','Commercial pipeline is recorded exposure, not guaranteed revenue.',
    'admin_savings','Time and staff-cost savings are shown only when the agency has configured its own baseline assumptions.',
    'activity','Usage counts show recorded platform activity, not employee productivity or player-service quality.'
  )
);
$$;

revoke all on function public.platform_server_player_value_proof(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.platform_server_player_value_proof_portfolio(uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.platform_server_capture_player_value_proof(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.platform_server_player_value_proof_history(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.platform_server_agency_roi_proof(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_player_value_proof(uuid,uuid,integer) to service_role;
grant execute on function public.platform_server_player_value_proof_portfolio(uuid,integer,integer) to service_role;
grant execute on function public.platform_server_capture_player_value_proof(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.platform_server_player_value_proof_history(uuid,uuid,integer) to service_role;
grant execute on function public.platform_server_agency_roi_proof(uuid,integer) to service_role;
;
