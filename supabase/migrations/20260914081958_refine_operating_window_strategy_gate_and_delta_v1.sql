create or replace function public.platform_server_operating_window_command(p_tenant_id uuid,p_operating_window_id uuid default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_w platform.tenant_operating_windows%rowtype; v_deadlines jsonb; v_receivables jsonb; v_closeout jsonb;
  v_players jsonb; v_needs jsonb; v_active_players integer:=0; v_live_deals integer:=0; v_strategy_missing integer:=0; v_strategy_draft integer:=0; v_need_count integer:=0;
begin
  if p_operating_window_id is not null then select * into v_w from platform.tenant_operating_windows w where w.id=p_operating_window_id and w.tenant_id=p_tenant_id;
  else
    select * into v_w from platform.tenant_operating_windows w where w.tenant_id=p_tenant_id and w.status in ('active','planned') order by case when current_date between w.start_date and w.end_date then 0 when w.start_date>current_date then 1 else 2 end,abs(w.start_date-current_date),w.created_at desc limit 1;
  end if;
  if v_w.id is null then return jsonb_build_object('available',false,'tenant_id',p_tenant_id,'reason','no_operating_window_configured','truth_contract',jsonb_build_object('setup','DJM will not invent transfer-window dates. Configure an agency operating window first.')); end if;

  v_deadlines:=public.platform_server_execution_deadline_command(p_tenant_id,greatest(1,least((v_w.end_date-current_date),366)),200);
  v_receivables:=public.platform_server_receivables_command(p_tenant_id,greatest(1,least((v_w.end_date-current_date),366)),100);
  v_closeout:=public.platform_server_deal_closeout_command(p_tenant_id,100);

  with base as (
    select p.id,coalesce(nullif(trim(p.preferred_name),''),trim(concat_ws(' ',p.first_name,p.last_name))) player_name,p.football_status,p.contract_status,p.contract_expiry,p.primary_staff_user_id,
      cs.status strategy_status,cs.review_due_at,cs.strategy->'target_window' target_window,
      coalesce((select count(*) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p.id and d.status='active'),0)::int active_deals,
      coalesce((select count(*) from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.player_id=p.id and pm.status in ('suggested','reviewing','shortlisted','pitched','active')),0)::int active_matches
    from public.players p
    left join lateral (select s.* from platform.player_career_strategies s where s.tenant_id=p_tenant_id and s.player_id=p.id and s.status in ('draft','approved') order by case when s.status='approved' then 0 else 1 end,s.updated_at desc limit 1) cs on true
    where p.tenant_id=p_tenant_id and p.football_status in ('active','free_agent')
  ), scoped as (
    select b.*,
      case
        when active_deals>0 then 'protect_live_deal'
        when strategy_status is null then 'create_career_strategy'
        when strategy_status='draft' then 'confirm_career_strategy'
        when target_window is not null and nullif(target_window->>'start_date','') is not null and nullif(target_window->>'end_date','') is not null and (target_window->>'start_date')::date<=v_w.end_date and (target_window->>'end_date')::date>=v_w.start_date then 'execute_player_market_plan'
        when football_status='free_agent' then 'free_agent_market_work'
        else 'maintain_outside_window_plan' end lane,
      case when strategy_status is null then 'missing' when strategy_status='draft' then 'draft_needs_human_confirmation' else 'approved' end strategy_control_state
    from base b
  ), ranked as (
    select s.*,row_number() over(order by case lane when 'protect_live_deal' then 1 when 'create_career_strategy' then 2 when 'confirm_career_strategy' then 3 when 'free_agent_market_work' then 4 when 'execute_player_market_plan' then 5 else 6 end,contract_expiry nulls last,player_name) rn from scoped s
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'rank',rn,'player_id',id,'player_name',player_name,'lane',lane,'football_status',football_status,'contract_status',contract_status,'contract_expiry',contract_expiry,'has_primary_owner',primary_staff_user_id is not null,
      'strategy_status',strategy_status,'strategy_control_state',strategy_control_state,'target_window',target_window,'active_deals',active_deals,'active_matches',active_matches,
      'next_action',case
        when lane='protect_live_deal' then jsonb_build_object('api_action','deal_portfolio','instruction','Protect and progress the live deal first. Also resolve any recorded strategy-control gap before opening additional market work.')
        when lane='create_career_strategy' then jsonb_build_object('api_action','career_strategy','player_id',id,'instruction','Create the human-owned career strategy before DJM treats the player as ready for proactive market execution.')
        when lane='confirm_career_strategy' then jsonb_build_object('api_action','career_strategy','player_id',id,'instruction','Human-review and player-confirm the draft career strategy before broader market execution.')
        when lane='execute_player_market_plan' then jsonb_build_object('api_action','career_alignment','player_id',id,'instruction','Review execution against the player-confirmed target window.')
        when lane='free_agent_market_work' then jsonb_build_object('api_action','player_service_card','player_id',id,'instruction','Execute the confirmed free-agent market plan and keep service control current.')
        else jsonb_build_object('api_action','player_service_card','player_id',id,'instruction','Maintain service; no window-specific market action is forced by recorded data.') end
    ) order by rn) filter(where rn<=greatest(1,least(coalesce(p_limit,100),500))),'[]'::jsonb),
    count(*),count(*) filter(where active_deals>0),count(*) filter(where strategy_status is null),count(*) filter(where strategy_status='draft')
  into v_players,v_active_players,v_live_deals,v_strategy_missing,v_strategy_draft from ranked;

  select coalesce(jsonb_agg(jsonb_build_object('club_need_id',n.id,'title',n.title,'need_type',n.need_type,'priority',n.priority,'expires_at',n.expires_at,'club_name',o.name,'status',n.status,'next_action',jsonb_build_object('api_action','demand_control_fast','club_need_id',n.id,'instruction','Resolve or deliberately park the need before its recorded expiry.')) order by n.expires_at,n.priority desc),'[]'::jsonb),count(*)
  into v_needs,v_need_count
  from djm_os.club_needs n left join djm_os.organisations o on o.id=n.organisation_id and o.tenant_id=n.tenant_id
  where n.tenant_id=p_tenant_id and n.status in ('open','active','confirmed','predicted') and n.expires_at is not null and n.expires_at::date between v_w.start_date and v_w.end_date;

  return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'generated_at',now(),
    'operating_window',jsonb_build_object('id',v_w.id,'name',v_w.name,'window_type',v_w.window_type,'status',v_w.status,'start_date',v_w.start_date,'end_date',v_w.end_date,'days_until_start',v_w.start_date-current_date,'days_remaining',v_w.end_date-current_date,'markets',v_w.markets,'objectives',v_w.objectives),
    'summary',jsonb_build_object('active_players',v_active_players,'players_with_live_deals',v_live_deals,'players_missing_career_strategy',v_strategy_missing,'players_with_draft_career_strategy',v_strategy_draft,'club_needs_expiring_in_window',v_need_count,'overdue_recorded_deadlines',coalesce((v_deadlines#>>'{summary,overdue}')::int,0),'open_receivables',coalesce((v_receivables#>>'{summary,open_receivables}')::int,0),'closeout_deals',coalesce((v_closeout->>'deal_count')::int,0)),
    'player_execution',v_players,'club_demand_expiring_in_window',v_needs,'execution_deadlines',v_deadlines,'cash_collection',v_receivables,'deal_closeout',v_closeout,
    'truth_contract',jsonb_build_object('window','The operating window is human-configured. DJM does not infer federation or league registration windows.','strategy_gate','Proactive market execution is subordinate to the player-owned career-strategy workflow. Free-agent status alone does not authorise random market activity.','player_scope','Players are classified from recorded career strategy, free-agent status and live deal activity. This is not a transfer recommendation.','priority','Execution lanes organise recorded work; humans still decide strategic trade-offs.','cash','Collections remain human-recorded and currency-separated.'));
end;$$;

create or replace function public.platform_server_operating_window_delta(p_tenant_id uuid,p_operating_window_id uuid,p_from_snapshot_id uuid default null,p_to_snapshot_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_from platform.operating_window_snapshots%rowtype; v_to platform.operating_window_snapshots%rowtype; v_count integer; v_changes jsonb;
begin
  select count(*) into v_count from platform.operating_window_snapshots s where s.tenant_id=p_tenant_id and s.operating_window_id=p_operating_window_id;
  if p_to_snapshot_id is not null then select * into v_to from platform.operating_window_snapshots s where s.id=p_to_snapshot_id and s.tenant_id=p_tenant_id and s.operating_window_id=p_operating_window_id;
  else select * into v_to from platform.operating_window_snapshots s where s.tenant_id=p_tenant_id and s.operating_window_id=p_operating_window_id order by snapshot_date desc,captured_at desc limit 1; end if;
  if p_from_snapshot_id is not null then select * into v_from from platform.operating_window_snapshots s where s.id=p_from_snapshot_id and s.tenant_id=p_tenant_id and s.operating_window_id=p_operating_window_id;
  else select * into v_from from platform.operating_window_snapshots s where s.tenant_id=p_tenant_id and s.operating_window_id=p_operating_window_id and (v_to.id is null or s.id<>v_to.id) order by snapshot_date desc,captured_at desc limit 1; end if;
  if v_to.id is null or v_from.id is null then return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'operating_window_id',p_operating_window_id,'status','insufficient_snapshot_history','snapshot_count',v_count,'truth_contract',jsonb_build_object('comparison','At least two persisted snapshots are required. DJM does not manufacture a historical baseline.')); end if;

  with oldp as (select value item from jsonb_array_elements(coalesce(v_from.snapshot->'player_execution','[]'::jsonb))), newp as (select value item from jsonb_array_elements(coalesce(v_to.snapshot->'player_execution','[]'::jsonb))), joined as (
    select coalesce(n.item->>'player_id',o.item->>'player_id') player_id,coalesce(n.item->>'player_name',o.item->>'player_name') player_name,o.item->>'lane' from_lane,n.item->>'lane' to_lane
    from oldp o full join newp n on n.item->>'player_id'=o.item->>'player_id'
  ) select coalesce(jsonb_agg(jsonb_build_object('player_id',player_id,'player_name',player_name,'from_lane',from_lane,'to_lane',to_lane)) filter(where from_lane is distinct from to_lane),'[]'::jsonb) into v_changes from joined;

  return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'operating_window_id',p_operating_window_id,'status','comparison_available',
    'from',jsonb_build_object('snapshot_id',v_from.id,'snapshot_date',v_from.snapshot_date),'to',jsonb_build_object('snapshot_id',v_to.id,'snapshot_date',v_to.snapshot_date),
    'summary_delta',jsonb_build_object(
      'players_with_live_deals',coalesce((v_to.snapshot#>>'{summary,players_with_live_deals}')::int,0)-coalesce((v_from.snapshot#>>'{summary,players_with_live_deals}')::int,0),
      'players_missing_career_strategy',coalesce((v_to.snapshot#>>'{summary,players_missing_career_strategy}')::int,0)-coalesce((v_from.snapshot#>>'{summary,players_missing_career_strategy}')::int,0),
      'players_with_draft_career_strategy',coalesce((v_to.snapshot#>>'{summary,players_with_draft_career_strategy}')::int,0)-coalesce((v_from.snapshot#>>'{summary,players_with_draft_career_strategy}')::int,0),
      'club_needs_expiring_in_window',coalesce((v_to.snapshot#>>'{summary,club_needs_expiring_in_window}')::int,0)-coalesce((v_from.snapshot#>>'{summary,club_needs_expiring_in_window}')::int,0),
      'overdue_recorded_deadlines',coalesce((v_to.snapshot#>>'{summary,overdue_recorded_deadlines}')::int,0)-coalesce((v_from.snapshot#>>'{summary,overdue_recorded_deadlines}')::int,0),
      'open_receivables',coalesce((v_to.snapshot#>>'{summary,open_receivables}')::int,0)-coalesce((v_from.snapshot#>>'{summary,open_receivables}')::int,0),
      'closeout_deals',coalesce((v_to.snapshot#>>'{summary,closeout_deals}')::int,0)-coalesce((v_from.snapshot#>>'{summary,closeout_deals}')::int,0)
    ),
    'player_lane_changes',v_changes,
    'truth_contract',jsonb_build_object('delta','A change in recorded counts or execution lane is not causal proof of performance. It only shows how the operating record changed between snapshots.'));
end;$$;

do $$ declare r record; begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('platform_server_operating_window_command','platform_server_operating_window_delta') loop execute format('revoke all on function %s from public,anon,authenticated',r.sig); execute format('grant execute on function %s to service_role',r.sig); end loop; end $$;;
