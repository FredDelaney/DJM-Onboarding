create or replace function public.platform_server_service_assurance(p_tenant_id uuid,p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_cfg jsonb:=public.platform_server_service_standards(p_tenant_id);
  v_s jsonb;
  v_players jsonb;
  v_deals jsonb;
  v_queue jsonb;
  v_player_count integer;
  v_deal_count integer;
  v_players_breached integer;
  v_deals_breached integer;
  v_player_breach_count integer;
  v_deal_breach_count integer;
  v_limit integer:=greatest(1,least(coalesce(p_limit,100),500));
  v_origin_rank integer;
  v_guardrail_rank integer;
begin
  v_s:=v_cfg->'standards';
  v_origin_rank:=case v_s->>'require_deal_origin_from_stage' when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 else 3 end;
  v_guardrail_rank:=case v_s->>'require_negotiation_guardrails_from_stage' when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 else 4 end;

  with pb as (
    select p.id,p.first_name,p.last_name,p.football_status,p.contract_status,p.contract_expiry,p.primary_staff_user_id,p.next_action,p.next_action_due,
      s.status strategy_status,s.confirmation_status strategy_confirmation,s.review_due_at,
      coalesce(m.active_deals,0) active_deals,coalesce(m.market_matches,0) market_matches,coalesce(m.active_opportunities,0) active_opportunities,
      coalesce(r.overdue_requests,0) overdue_requests
    from public.players p
    left join lateral (
      select cs.status,cs.confirmation_status,cs.review_due_at
      from platform.player_career_strategies cs where cs.tenant_id=p_tenant_id and cs.player_id=p.id and cs.status in ('draft','approved')
      order by case when cs.status='approved' then 0 else 1 end,cs.version desc limit 1
    ) s on true
    left join lateral (
      select
        (select count(*) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p.id and d.status='active') active_deals,
        (select count(*) from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.player_id=p.id and pm.status in ('suggested','reviewing','shortlisted','pitched','active')) market_matches,
        (select count(*) from public.player_opportunities po where po.player_id=p.id and po.stage not in ('won','lost')) active_opportunities
    ) m on true
    left join lateral (
      select count(*) filter(where pr.status<>'completed' and pr.due_at is not null and pr.due_at<now()) overdue_requests
      from public.player_requests pr where pr.player_id=p.id
    ) r on true
    where p.tenant_id=p_tenant_id and p.football_status in ('active','free_agent')
  ), pbreaches as (
    select p.id player_id,b.breach
    from pb p
    cross join lateral (
      select breach from (
        values
          (case when (v_s->>'require_primary_owner')::boolean and p.primary_staff_user_id is null then jsonb_build_object('code','primary_owner_missing','severity','high','fact','No primary staff owner is recorded.','required_action','Assign one accountable primary owner.') end),
          (case when (v_s->>'require_player_next_action')::boolean and nullif(trim(p.next_action),'') is null then jsonb_build_object('code','player_next_action_missing','severity','medium','fact','No player next action is recorded.','required_action','Record the next player-service action.') end),
          (case when p.next_action_due is not null and p.next_action_due < current_date-(v_s->>'player_next_action_grace_days')::integer then jsonb_build_object('code','player_next_action_overdue','severity','high','fact','The recorded player next action is overdue beyond the agency grace period.','required_action','Complete or deliberately reset the next action.') end),
          (case when (v_s->>'require_approved_player_confirmed_strategy')::boolean and (p.strategy_status is distinct from 'approved' or p.strategy_confirmation is distinct from 'confirmed') then jsonb_build_object('code','career_strategy_not_operational','severity','high','fact','There is no approved, player-confirmed career strategy.','required_action','Complete strategy confirmation and approval.') end),
          (case when p.review_due_at is not null and p.review_due_at < current_date-(v_s->>'strategy_review_grace_days')::integer then jsonb_build_object('code','career_strategy_review_overdue','severity','medium','fact','Career strategy review is overdue beyond the agency grace period.','required_action','Review the strategy with the player.') end),
          (case when (v_s->>'free_agent_requires_market_coverage')::boolean and p.football_status='free_agent' and (p.active_deals+p.market_matches+p.active_opportunities)=0 then jsonb_build_object('code','free_agent_without_market_coverage','severity','high','fact','Free agent has no recorded active deal, market match or opportunity.','required_action','Activate or deliberately widen the market plan.') end),
          (case when (v_s->>'contract_window_requires_market_coverage')::boolean and p.contract_expiry is not null and p.contract_expiry>=current_date and (p.contract_expiry-current_date)<=(v_s->>'contract_strategy_window_days')::integer and (p.active_deals+p.market_matches+p.active_opportunities)=0 then jsonb_build_object('code','contract_window_without_market_coverage','severity','high','fact',format('Contract expires in %s days with no recorded market coverage.',p.contract_expiry-current_date),'required_action','Resolve extension versus external market strategy.') end),
          (case when p.overdue_requests>(v_s->>'max_overdue_player_requests')::integer then jsonb_build_object('code','player_request_sla_breach','severity','high','fact',format('%s player request(s) are overdue.',p.overdue_requests),'required_action','Resolve overdue player requests.') end)
      ) x(breach) where breach is not null
    ) b
  ), pagg as (
    select player_id,jsonb_agg(breach order by case breach->>'severity' when 'high' then 1 else 2 end,breach->>'code') breaches,count(*) breach_count
    from pbreaches group by player_id
  ), prows as (
    select p.*,coalesce(a.breaches,'[]'::jsonb) breaches,coalesce(a.breach_count,0)::integer breach_count,
      row_number() over(order by coalesce(a.breach_count,0) desc,trim(concat_ws(' ',p.first_name,p.last_name))) rn
    from pb p left join pagg a on a.player_id=p.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id',p.id,'player_name',trim(concat_ws(' ',p.first_name,p.last_name)),'football_status',p.football_status,'contract_expiry',p.contract_expiry,
    'state',case when p.breach_count=0 then 'within_standard' else 'breach' end,'breaches',p.breaches,
    'facts',jsonb_build_object('has_primary_owner',p.primary_staff_user_id is not null,'next_action',p.next_action,'next_action_due',p.next_action_due,'strategy_status',coalesce(p.strategy_status,'missing'),'strategy_confirmation',coalesce(p.strategy_confirmation,'missing'),'strategy_review_due_at',p.review_due_at,'active_deals',p.active_deals,'market_matches',p.market_matches,'active_opportunities',p.active_opportunities,'overdue_player_requests',p.overdue_requests)
  ) order by p.rn) filter(where p.rn<=v_limit),'[]'::jsonb),count(*),count(*) filter(where p.breach_count>0),coalesce(sum(p.breach_count),0)
  into v_players,v_player_count,v_players_breached,v_player_breach_count from prows p;

  with db as (
    select d.id,d.title,d.player_id,d.stage,d.status,d.owner_user_id,d.next_action_text,d.next_action_at,
      case d.stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 else 0 end stage_rank,
      exists(select 1 from platform.deal_origin_attributions o where o.tenant_id=p_tenant_id and o.deal_room_id=d.id and o.confirmation_status='confirmed') origin_confirmed,
      exists(select 1 from platform.deal_negotiation_guardrails g where g.tenant_id=p_tenant_id and g.deal_room_id=d.id and g.status='approved') guardrails_approved
    from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.status='active'
  ), dbreaches as (
    select d.id deal_room_id,b.breach
    from db d
    cross join lateral (
      select breach from (
        values
          (case when (v_s->>'live_deal_requires_owner')::boolean and d.owner_user_id is null then jsonb_build_object('code','deal_owner_missing','severity','high','fact','Live deal has no accountable owner.','required_action','Assign an accountable deal owner.') end),
          (case when (v_s->>'live_deal_requires_next_action')::boolean and (nullif(trim(d.next_action_text),'') is null or d.next_action_at is null) then jsonb_build_object('code','deal_next_action_missing','severity','high','fact','Live deal does not have both a next action and execution time.','required_action','Set one concrete next action and time.') end),
          (case when d.next_action_at is not null and d.next_action_at < now()-make_interval(hours=>(v_s->>'deal_next_action_grace_hours')::integer) then jsonb_build_object('code','deal_next_action_overdue','severity','high','fact','Live deal next action is overdue beyond the agency grace period.','required_action','Execute or deliberately reset the deal action.') end),
          (case when d.stage_rank>=v_origin_rank and not d.origin_confirmed then jsonb_build_object('code','deal_origin_missing','severity','medium','fact','Deal has reached the agency origin-attribution threshold without confirmed origin provenance.','required_action','Record how the opportunity entered the agency.') end),
          (case when d.stage_rank>=v_guardrail_rank and not d.guardrails_approved then jsonb_build_object('code','negotiation_guardrails_missing','severity','high','fact','Deal has reached the negotiation-control threshold without approved guardrails.','required_action','Agree and approve negotiation boundaries before progressing terms.') end)
      ) x(breach) where breach is not null
    ) b
  ), dagg as (
    select deal_room_id,jsonb_agg(breach order by case breach->>'severity' when 'high' then 1 else 2 end,breach->>'code') breaches,count(*) breach_count
    from dbreaches group by deal_room_id
  ), drows as (
    select d.*,coalesce(a.breaches,'[]'::jsonb) breaches,coalesce(a.breach_count,0)::integer breach_count,
      row_number() over(order by coalesce(a.breach_count,0) desc,d.title) rn
    from db d left join dagg a on a.deal_room_id=d.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deal_room_id',d.id,'title',d.title,'player_id',d.player_id,'stage',d.stage,'state',case when d.breach_count=0 then 'within_standard' else 'breach' end,
    'breaches',d.breaches,'facts',jsonb_build_object('has_owner',d.owner_user_id is not null,'next_action_text',d.next_action_text,'next_action_at',d.next_action_at,'origin_confirmed',d.origin_confirmed,'guardrails_approved',d.guardrails_approved)
  ) order by d.rn) filter(where d.rn<=v_limit),'[]'::jsonb),count(*),count(*) filter(where d.breach_count>0),coalesce(sum(d.breach_count),0)
  into v_deals,v_deal_count,v_deals_breached,v_deal_breach_count from drows d;

  with all_b as (
    select 'player' entity_type,(p->>'player_id')::uuid entity_id,p->>'player_name' title,b breach
    from jsonb_array_elements(v_players) p cross join lateral jsonb_array_elements(p->'breaches') b
    union all
    select 'deal',(d->>'deal_room_id')::uuid,d->>'title',b
    from jsonb_array_elements(v_deals) d cross join lateral jsonb_array_elements(d->'breaches') b
  )
  select coalesce(jsonb_agg(jsonb_build_object('entity_type',entity_type,'entity_id',entity_id,'title',title,'breach',breach)
    order by case breach->>'severity' when 'high' then 1 else 2 end,title,breach->>'code'),'[]'::jsonb)
  into v_queue from all_b;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'policy',v_cfg,
    'state',case when v_player_breach_count+v_deal_breach_count=0 then 'within_standard' else 'needs_attention' end,
    'summary',jsonb_build_object('active_players',v_player_count,'players_with_breaches',v_players_breached,'player_breaches',v_player_breach_count,'active_deals',v_deal_count,'deals_with_breaches',v_deals_breached,'deal_breaches',v_deal_breach_count,'total_breaches',v_player_breach_count+v_deal_breach_count),
    'players',v_players,'deals',v_deals,'operating_queue',v_queue,
    'truth_contract',jsonb_build_object('no_score','No composite quality score is calculated. Each breach is tied to one recorded fact and one agency-defined standard.','data_scope','Missing integrations or unrecorded work can create apparent breaches. The system reports what is recorded, not invisible offline work.','purpose','This is an operating assurance layer, not a performance appraisal of staff or players.')
  );
end;
$function$;

revoke all on function public.platform_server_service_assurance(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_service_assurance(uuid,integer) to service_role;;
