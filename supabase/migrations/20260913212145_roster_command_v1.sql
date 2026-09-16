create or replace function public.platform_server_roster_command(p_tenant_id uuid,p_limit integer default 50)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_service jsonb;
  v_career jsonb;
  v_pursuits jsonb;
  v_svc jsonb;
  v_car jsonb;
  v_player_id uuid;
  v_name text;
  v_active_deals integer;
  v_max_stage integer;
  v_max_probability integer;
  v_deal_overdue integer;
  v_deals jsonb;
  v_commercial jsonb;
  v_open_pursuits integer;
  v_review_pursuits integer;
  v_hold_pursuits integer;
  v_best_open integer;
  v_focus text;
  v_window text;
  v_rank integer;
  v_block boolean;
  v_why jsonb;
  v_control jsonb;
  v_items jsonb:='[]'::jsonb;
  v_sorted jsonb;
  v_count integer:=0;
  v_unowned integer:=0;
  v_live_protect integer:=0;
  v_market_activate integer:=0;
  v_strategy_block integer:=0;
begin
  if not exists(select 1 from platform.tenants where id=p_tenant_id and status='active') then raise exception 'tenant_not_found'; end if;
  v_service:=public.platform_server_player_service_command(p_tenant_id,200);
  v_career:=public.platform_server_career_strategy_command(p_tenant_id,200);
  v_pursuits:=public.platform_server_career_aligned_pursuit_board(p_tenant_id,100);

  for v_svc in select value from jsonb_array_elements(coalesce(v_service->'players','[]'::jsonb))
  loop
    begin v_player_id:=(v_svc->>'player_id')::uuid; exception when others then continue; end;
    v_name:=coalesce(v_svc#>>'{player,name}','Player');
    select value into v_car from jsonb_array_elements(coalesce(v_career->'players','[]'::jsonb)) where value->>'player_id'=v_player_id::text limit 1;

    select count(*)::int,
           coalesce(max(case d.stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 else 0 end),0)::int,
           coalesce(max(d.probability),0)::int,
           count(*) filter(where d.next_action_at is not null and d.next_action_at<now())::int,
           coalesce(jsonb_agg(jsonb_build_object('deal_room_id',d.id,'title',d.title,'stage',d.stage,'probability',d.probability,'next_action_text',d.next_action_text,'next_action_at',d.next_action_at,'primary_blocker',d.primary_blocker,'currency',d.currency,'expected_commission',d.expected_commission) order by d.probability desc),'[]'::jsonb)
    into v_active_deals,v_max_stage,v_max_probability,v_deal_overdue,v_deals
    from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=v_player_id and d.status='active';

    select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'expected_commission',expected_commission,'weighted_commission',weighted_commission) order by currency),'[]'::jsonb)
    into v_commercial from (
      select d.currency,round(sum(coalesce(d.expected_commission,0)),2) as expected_commission,round(sum(coalesce(d.expected_commission,0)*d.probability/100.0),2) as weighted_commission
      from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=v_player_id and d.status='active' group by d.currency
    ) x;

    select count(*) filter(where x#>>'{career_strategy_gate,state}'='open_aligned')::int,
           count(*) filter(where x#>>'{career_strategy_gate,state}' like 'review_%')::int,
           count(*) filter(where x#>>'{career_strategy_gate,state}' like 'hold_%')::int,
           coalesce(max(case when x#>>'{career_strategy_gate,state}'='open_aligned' then (x->>'readiness_score')::int end),0)::int
    into v_open_pursuits,v_review_pursuits,v_hold_pursuits,v_best_open
    from jsonb_array_elements(coalesce(v_pursuits->'items','[]'::jsonb)) x where x#>>'{player,player_id}'=v_player_id::text;

    v_why:='[]'::jsonb; v_control:='[]'::jsonb; v_block:=false;
    if v_svc#>>'{player,primary_staff_user_id}' is null then v_control:=v_control||jsonb_build_array('primary_staff_not_assigned'); v_unowned:=v_unowned+1; end if;
    if coalesce((v_svc#>>'{career_timing,next_action_days}')::int,999)<0 then v_control:=v_control||jsonb_build_array('player_next_action_overdue'); end if;
    if coalesce((v_svc#>>'{service_control,overdue_tasks}')::int,0)>0 then v_control:=v_control||jsonb_build_array('player_task_overdue'); end if;
    if coalesce((v_svc#>>'{service_control,overdue_player_requests}')::int,0)>0 then v_control:=v_control||jsonb_build_array('player_request_overdue'); end if;
    if v_deal_overdue>0 then v_control:=v_control||jsonb_build_array('deal_next_action_overdue'); end if;

    if v_active_deals>0 and v_deal_overdue>0 then
      v_focus:='protect_live_deal'; v_window:='now'; v_rank:=1;
      v_why:=v_why||jsonb_build_array('A live deal has an overdue recorded next action.'); v_live_protect:=v_live_protect+1;
    elsif v_active_deals>0 and coalesce(v_car->>'alignment_state','') in ('strategy_missing','strategy_draft','player_reconfirmation_required','strategy_review_overdue','strategic_conflict','market_exception_review') then
      v_focus:='resolve_strategy_before_deal_escalation'; v_window:='before_next_external_move'; v_rank:=2; v_block:=true;
      v_why:=v_why||jsonb_build_array('A live deal exists but the current player career strategy is not operationally clear or aligned.'); v_strategy_block:=v_strategy_block+1;
    elsif coalesce(v_svc#>>'{career_timing,market_trigger}','')='free_agent' and v_active_deals=0 then
      if coalesce(v_car->>'alignment_state','') in ('strategy_missing','strategy_draft','player_reconfirmation_required') then
        v_focus:='agree_strategy_then_activate_market'; v_block:=true; v_strategy_block:=v_strategy_block+1;
      else v_focus:='activate_free_agent_market'; end if;
      v_window:='today'; v_rank:=2;
      v_why:=v_why||jsonb_build_array('The player is a free agent without a live deal.'); v_market_activate:=v_market_activate+1;
    elsif coalesce(v_svc#>>'{career_timing,market_trigger}','')='contract_critical_window' and v_active_deals=0 then
      v_focus:='resolve_contract_and_market_strategy'; v_window:='this_week'; v_rank:=3;
      v_why:=v_why||jsonb_build_array('The player is inside the contract-critical window without a live deal.'); v_market_activate:=v_market_activate+1;
    elsif v_open_pursuits>0 and v_best_open>=85 and v_active_deals=0 then
      v_focus:='progress_aligned_pursuit'; v_window:='this_week'; v_rank:=3;
      v_why:=v_why||jsonb_build_array('A strong pursuit is open under the approved player strategy.');
    elsif coalesce((v_svc#>>'{service_control,score}')::int,100)<70 or coalesce((v_svc#>>'{career_timing,next_action_days}')::int,999)<=0 then
      v_focus:='restore_player_service_control'; v_window:='this_week'; v_rank:=4;
      v_why:=v_why||jsonb_build_array('Player service control needs attention before work drifts.');
    elsif coalesce(v_car->>'alignment_state','')='strategy_execution_gap' then
      v_focus:='activate_approved_career_plan'; v_window:='this_week'; v_rank:=4;
      v_why:=v_why||jsonb_build_array('The approved career plan is not yet producing recorded market execution.'); v_market_activate:=v_market_activate+1;
    else
      v_focus:='maintain_current_plan'; v_window:='planned_cadence'; v_rank:=5;
      v_why:=v_why||jsonb_build_array('No higher-priority operating exception is currently recorded.');
    end if;

    if v_max_stage>=4 then v_why:=v_why||jsonb_build_array('At least one live deal is already at Negotiating stage or later.'); end if;
    if v_review_pursuits>0 then v_why:=v_why||jsonb_build_array('At least one pursuit needs a human career-strategy exception review.'); end if;
    if v_hold_pursuits>0 then v_why:=v_why||jsonb_build_array('At least one pursuit is held by the career-strategy gate.'); end if;

    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'player_id',v_player_id,'player',v_svc->'player','primary_focus',v_focus,'execution_window',v_window,'priority_rank',v_rank,
      'blocks_external_escalation',v_block,'why_now',v_why,'control_flags',v_control,
      'service',jsonb_build_object('priority_score',v_svc->'service_priority_score','state',v_svc#>'{service_control,state}','score',v_svc#>'{service_control,score}','next_service_move',v_svc->'next_service_move'),
      'career',jsonb_build_object('alignment_state',v_car->>'alignment_state','attention_score',v_car->'attention_score','next_strategy_action',v_car->'next_strategy_action'),
      'pursuits',jsonb_build_object('career_aligned_open',v_open_pursuits,'exception_review',v_review_pursuits,'strategy_hold',v_hold_pursuits,'best_open_readiness',v_best_open),
      'live_deals',jsonb_build_object('count',v_active_deals,'highest_stage_rank',v_max_stage,'highest_probability',v_max_probability,'overdue_next_actions',v_deal_overdue,'items',v_deals,'commercial_by_currency',v_commercial)
    ));
    v_count:=v_count+1;
  end loop;

  select coalesce(jsonb_agg(value order by (value->>'priority_rank')::int,coalesce((value#>>'{service,priority_score}')::int,0) desc,value#>>'{player,name}') filter(where rn<=greatest(1,least(coalesce(p_limit,50),200))),'[]'::jsonb)
  into v_sorted from (
    select value,row_number() over(order by (value->>'priority_rank')::int,coalesce((value#>>'{service,priority_score}')::int,0) desc,value#>>'{player,name}') rn
    from jsonb_array_elements(v_items)
  ) q;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'items',v_sorted,
    'summary',jsonb_build_object('active_players',v_count,'players_without_primary_staff',v_unowned,'live_deals_needing_protection',v_live_protect,'players_needing_market_activation',v_market_activate,'strategy_blocks_on_execution',v_strategy_block),
    'principle','Allocate agency effort by recorded urgency and execution dependency, not by player fame, subjective importance or an invented transfer probability.',
    'priority_policy',jsonb_build_object('1','live deal with overdue action','2','free-agent urgency or live-deal career-strategy blocker','3','contract-critical player or strong aligned pursuit','4','service/strategy execution control','5','maintain planned cadence'),
    'truth_contract',jsonb_build_object('commercial','Commercial values remain grouped by currency and do not influence cross-currency priority ordering.','probability','Recorded deal probability is context only and does not become a roster success probability.','strategy','Career-strategy blockers can stop external escalation but do not change football-fit scores.','effort','Priority is an operating queue, not a valuation of the player or relationship.')
  );
end;$$;

revoke all on function public.platform_server_roster_command(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_roster_command(uuid,integer) to service_role;;
