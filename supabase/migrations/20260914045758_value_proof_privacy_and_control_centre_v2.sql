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
  select count(*) filter (where s.created_at>=v_since),count(*) filter (where s.player_confirmed_at>=v_since),count(*) filter (where s.approved_at>=v_since)
    into v_strategy_versions,v_strategy_confirmations,v_strategy_approvals from platform.player_career_strategies s where s.tenant_id=p_tenant_id and s.player_id=p_player_id;
  select count(*) into v_matches_added from djm_os.player_matches m where m.tenant_id=p_tenant_id and m.player_id=p_player_id and m.created_at between v_since and v_now;
  select count(*) into v_opportunities_opened from public.player_opportunities o where o.tenant_id=p_tenant_id and o.player_id=p_player_id and o.created_at between v_since and v_now;
  select count(*) filter (where d.created_at>=v_since),count(*) filter (where d.status='won' and d.closed_at>=v_since)
    into v_deals_opened,v_deals_won from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id;

  with ranked as (
    select s.deal_room_id,s.observed_at,s.stage,lag(s.stage) over(partition by s.deal_room_id order by s.observed_at,s.id) as previous_stage
    from platform.deal_state_snapshots s join djm_os.deal_rooms d on d.id=s.deal_room_id and d.tenant_id=s.tenant_id
    where s.tenant_id=p_tenant_id and d.player_id=p_player_id
  )
  select count(*) into v_stage_advances from ranked
  where observed_at between v_since and v_now and previous_stage is not null and stage is not null and stage<>previous_stage
    and (case stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end)
      > (case previous_stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end);

  v_total_service_changes:=v_tasks_completed+v_requests_resolved+v_strategy_versions+v_strategy_confirmations+v_strategy_approvals+v_matches_added+v_opportunities_opened+v_deals_opened+v_stage_advances+v_deals_won;
  v_proof_state:=case when v_deals_won>0 or v_stage_advances>0 or v_deals_opened>0 then 'material_market_change_recorded' when v_total_service_changes>0 then 'service_delivery_recorded' else 'thin_recorded_evidence' end;

  with events as (
    select t.completed_at as event_at,'agency_work_completed'::text as event_type,'Agency service work completed'::text as label,jsonb_build_object('work_type',t.task_type) as detail
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
    select m.created_at,'market_match_added','New market match recorded','{}'::jsonb
      from djm_os.player_matches m where m.tenant_id=p_tenant_id and m.player_id=p_player_id and m.created_at between v_since and v_now
    union all
    select o.created_at,'opportunity_opened','New player opportunity recorded',jsonb_build_object('stage',o.stage)
      from public.player_opportunities o where o.tenant_id=p_tenant_id and o.player_id=p_player_id and o.created_at between v_since and v_now
    union all
    select d.created_at,'deal_opened','New club process recorded',jsonb_build_object('stage',d.stage)
      from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id and d.created_at between v_since and v_now
    union all
    select q.observed_at,'deal_stage_advanced','Club process advanced',jsonb_build_object('from_stage',q.previous_stage,'to_stage',q.stage)
      from (
        select s.observed_at,s.stage,lag(s.stage) over(partition by s.deal_room_id order by s.observed_at,s.id) as previous_stage
        from platform.deal_state_snapshots s join djm_os.deal_rooms d on d.id=s.deal_room_id and d.tenant_id=s.tenant_id
        where s.tenant_id=p_tenant_id and d.player_id=p_player_id
      ) q
      where q.observed_at between v_since and v_now and q.previous_stage is not null and q.stage is not null and q.stage<>q.previous_stage
        and (case q.stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end)
          > (case q.previous_stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end)
    union all
    select d.closed_at,'deal_won','Recorded club process completed successfully','{}'::jsonb
      from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id and d.status='won' and d.closed_at between v_since and v_now
  )
  select coalesce(jsonb_agg(jsonb_build_object('at',event_at,'type',event_type,'label',label,'detail',detail) order by event_at desc),'[]'::jsonb)
    into v_timeline from (select * from events where event_at is not null order by event_at desc limit 30) e;

  v_statement:=public.platform_server_player_service_statement(p_tenant_id,p_player_id);
  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'player_id',p_player_id,'player_name',v_name,
    'window',jsonb_build_object('days',v_days,'from',v_since,'to',v_now),'proof_state',v_proof_state,
    'service_delivery',jsonb_build_object('agency_work_completed',v_tasks_completed,'player_requests_resolved',v_requests_resolved,'career_strategy_versions_created',v_strategy_versions,'career_strategy_confirmations',v_strategy_confirmations,'career_strategy_approvals',v_strategy_approvals),
    'market_work',jsonb_build_object('market_matches_added',v_matches_added,'opportunities_opened',v_opportunities_opened,'club_processes_opened',v_deals_opened,'recorded_deal_stage_advances',v_stage_advances,'recorded_deals_won',v_deals_won),
    'player_safe_current_statement',v_statement,'timeline',v_timeline,
    'truth_contract',jsonb_build_object('service','This report shows only service and market work recorded in DJM. Offline work that was not captured is not visible.','activity','Activity volume is evidence of recorded work, not proof of quality or player satisfaction.','market','A new match, opportunity or deal is recorded market activity, not a transfer-success probability.','stage_advances','Stage advances are derived from recorded deal-state snapshots and do not prove the club process will complete.','player_safe','The timeline intentionally excludes fees, negotiation limits, club identities, private relationship routes, internal entity IDs and club-contact identities.')
  );
end;
$$;

create or replace function public.platform_server_capture_value_proof_portfolio(p_tenant_id uuid,p_actor_user_id uuid,p_window_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_player record;
  v_count integer:=0;
  v_ids jsonb:='[]'::jsonb;
  v_result jsonb;
begin
  if coalesce(p_window_days,30) not between 1 and 366 then raise exception 'invalid_window_days'; end if;
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','operations') limit 1;
  if v_role is null then raise exception 'owner_admin_or_operations_access_required'; end if;
  for v_player in select p.id from public.players p where p.tenant_id=p_tenant_id and coalesce(p.football_status,'active') not in ('retired','inactive') order by p.id loop
    v_result:=public.platform_server_capture_player_value_proof(p_tenant_id,v_player.id,p_actor_user_id,p_window_days);
    v_count:=v_count+1;
    v_ids:=v_ids||jsonb_build_array(v_result->>'snapshot_id');
  end loop;
  return jsonb_build_object('captured',true,'tenant_id',p_tenant_id,'snapshot_date',current_date,'window_days',p_window_days,'players_captured',v_count,'snapshot_ids',v_ids);
end;
$$;

create or replace function public.platform_server_agency_control_centre(p_tenant_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_assurance jsonb:=public.platform_server_service_assurance_v2(p_tenant_id,50);
  v_roster jsonb:=public.platform_server_roster_command(p_tenant_id,12);
  v_origination jsonb:=public.platform_server_origination_command(p_tenant_id,12);
  v_revenue jsonb:=public.platform_server_revenue_command(p_tenant_id,10);
  v_capacity jsonb:=public.platform_server_team_capacity(p_tenant_id);
  v_rep jsonb:=public.platform_server_representation_records_control(p_tenant_id,120);
  v_ready jsonb:=public.platform_server_go_live_readiness(p_tenant_id);
  v_learning jsonb:=public.platform_server_learning_center(p_tenant_id);
  v_scouting jsonb:=public.platform_server_scouting_mandates(p_tenant_id,10);
  v_relationships jsonb:=public.platform_server_player_relationship_control(p_tenant_id,20);
  v_clubs jsonb:=public.platform_server_club_portfolio_control(p_tenant_id,20);
  v_proof jsonb:=public.platform_server_player_value_proof_portfolio(p_tenant_id,30,20);
  v_service_lane jsonb; v_roster_lane jsonb; v_origin_lane jsonb; v_revenue_lane jsonb; v_relationship_lane jsonb; v_club_lane jsonb; v_proof_lane jsonb;
  v_state text;
begin
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_service_lane from jsonb_array_elements(coalesce(v_assurance->'operating_queue','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_roster_lane from jsonb_array_elements(coalesce(v_roster->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_origin_lane from jsonb_array_elements(coalesce(v_origination->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_revenue_lane from jsonb_array_elements(coalesce(v_revenue->'protect_revenue','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_relationship_lane from jsonb_array_elements(coalesce(v_relationships->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_club_lane from jsonb_array_elements(coalesce(v_clubs->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_proof_lane from jsonb_array_elements(coalesce(v_proof->'items','[]'::jsonb)) with ordinality x(value,ord) where ord<=6;
  v_state:=case when coalesce((v_assurance#>>'{summary,total_breaches}')::integer,0)>0 then 'operating_controls_need_attention' when coalesce(v_ready->>'state','')<>'ready_for_controlled_use' then 'setup_gaps_remain' when coalesce((v_origination#>>'{coverage_summary,ready_to_work}')::integer,0)>0 then 'commercial_execution_available' else 'controlled' end;
  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'state',v_state,
    'executive_summary',jsonb_build_object(
      'active_players',coalesce((v_roster#>>'{summary,active_players}')::integer,0),'active_deals',coalesce((v_assurance#>>'{summary,active_deals}')::integer,0),'service_standard_breaches',coalesce((v_assurance#>>'{summary,total_breaches}')::integer,0),
      'players_without_primary_owner',coalesce((v_capacity#>>'{summary,active_players_without_primary_owner}')::integer,0),'deals_without_owner',coalesce((v_capacity#>>'{summary,active_deals_without_owner}')::integer,0),
      'club_needs_ready_to_work',coalesce((v_origination#>>'{coverage_summary,ready_to_work}')::integer,0),'club_need_roster_gaps',coalesce((v_origination#>>'{coverage_summary,roster_gaps}')::integer,0),
      'representation_records_needing_review',coalesce((v_rep#>>'{summary,records_needing_review}')::integer,0),'players_needing_immediate_service_intervention',coalesce((v_relationships#>>'{summary,immediate_service_interventions}')::integer,0),
      'live_club_business_to_protect',coalesce((v_clubs#>>'{summary,live_business_to_protect}')::integer,0),'players_with_thin_30d_value_proof',coalesce((v_proof#>>'{summary,players_with_thin_recorded_evidence}')::integer,0),
      'go_live_state',v_ready->>'state','learning_maturity',v_learning->>'maturity_state'),
    'lanes',jsonb_build_object(
      'service_control',jsonb_build_object('summary',v_assurance->'summary','items',v_service_lane),
      'player_relationship_control',jsonb_build_object('summary',v_relationships->'summary','items',v_relationship_lane),
      'player_value_proof',jsonb_build_object('window_days',30,'summary',v_proof->'summary','items',v_proof_lane),
      'roster_effort',jsonb_build_object('summary',v_roster->'summary','items',v_roster_lane),
      'club_demand_origination',jsonb_build_object('summary',v_origination->'coverage_summary','items',v_origin_lane),
      'club_portfolio',jsonb_build_object('summary',v_clubs->'summary','items',v_club_lane),
      'revenue_execution',jsonb_build_object('commercial_hygiene',v_revenue->'commercial_hygiene','pipeline_creation',v_revenue->'pipeline_creation','by_currency',v_revenue->'by_currency','items',v_revenue_lane),
      'scouting_mandates',jsonb_build_object('count',v_scouting->'mandate_count','items',v_scouting->'items')),
    'governance',jsonb_build_object('team_capacity_summary',v_capacity->'summary','representation_summary',v_rep->'summary','go_live',jsonb_build_object('state',v_ready->>'state','summary',v_ready->'summary','next_action',v_ready->'next_action'),'learning',jsonb_build_object('maturity_state',v_learning->>'maturity_state','next_learning_action',v_learning->'next_learning_action')),
    'truth_contract',jsonb_build_object('no_composite_score','The Control Centre intentionally keeps player service, value proof, revenue, demand, club accounts, ownership and setup controls in separate lanes rather than collapsing them into one opaque score.','priority','Ordering inside each lane uses that domain’s recorded operating rules; lanes are not mathematically compared with each other.','value_proof','Thin recorded proof never means no work occurred; it means DJM has little captured evidence in the selected period.','revenue','Commercial exposure is shown by recorded currency and is not converted across currencies or treated as guaranteed revenue.','scope','Only work and facts recorded in the platform are visible.')
  );
end;
$$;

revoke all on function public.platform_server_capture_value_proof_portfolio(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_capture_value_proof_portfolio(uuid,uuid,integer) to service_role;
revoke all on function public.platform_server_agency_control_centre(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_agency_control_centre(uuid) to service_role;
;
