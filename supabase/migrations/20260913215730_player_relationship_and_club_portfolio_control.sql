create or replace function public.platform_server_player_relationship_control(
  p_tenant_id uuid,
  p_limit integer default 100
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_assurance jsonb:=public.platform_server_service_assurance_v2(p_tenant_id,500);
  v_rep jsonb:=public.platform_server_representation_records_control(p_tenant_id,120);
  v_limit integer:=greatest(1,least(coalesce(p_limit,100),500));
  v_items jsonb;
  v_total integer:=0;
  v_immediate integer:=0;
  v_gaps integer:=0;
  v_controlled integer:=0;
begin
  with players as (
    select p.id,p.first_name,p.last_name,p.football_status,p.contract_status,p.contract_expiry,p.primary_staff_user_id,p.next_action,p.next_action_due,
      coalesce(m.active_deals,0)::integer active_deals,
      coalesce(m.market_matches,0)::integer market_matches,
      coalesce(m.active_opportunities,0)::integer active_opportunities,
      coalesce(r.open_requests,0)::integer open_requests,
      coalesce(r.overdue_requests,0)::integer overdue_requests,
      greatest(t.last_task_at,d.last_deal_activity_at,r.last_request_at,s.last_strategy_at) last_recorded_service_activity_at
    from public.players p
    left join lateral (
      select
        (select count(*) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p.id and d.status='active') active_deals,
        (select count(*) from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.player_id=p.id and pm.status in ('suggested','reviewing','shortlisted','pitched','active')) market_matches,
        (select count(*) from public.player_opportunities po where po.player_id=p.id and po.stage not in ('won','lost')) active_opportunities
    ) m on true
    left join lateral (
      select count(*) filter(where pr.status<>'completed') open_requests,
             count(*) filter(where pr.status<>'completed' and pr.due_at is not null and pr.due_at<now()) overdue_requests,
             max(pr.updated_at) last_request_at
      from public.player_requests pr where pr.player_id=p.id
    ) r on true
    left join lateral (
      select max(t.updated_at) last_task_at from djm_os.tasks t where t.tenant_id=p_tenant_id and t.player_id=p.id
    ) t on true
    left join lateral (
      select max(coalesce(d.last_meaningful_at,d.updated_at)) last_deal_activity_at from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p.id
    ) d on true
    left join lateral (
      select max(cs.updated_at) last_strategy_at from platform.player_career_strategies cs where cs.tenant_id=p_tenant_id and cs.player_id=p.id
    ) s on true
    where p.tenant_id=p_tenant_id and p.football_status in ('active','free_agent')
  ), joined as (
    select p.*,
      coalesce(a.value->'breaches','[]'::jsonb) service_breaches,
      coalesce(a.value->>'state','not_evaluated') service_state,
      coalesce(rep.value->>'state','not_recorded') representation_state,
      coalesce(rep.value->>'attention','info') representation_attention,
      (select count(*) from jsonb_array_elements(coalesce(a.value->'breaches','[]'::jsonb)) b where b->>'severity'='high')::integer high_service_breaches,
      (select q.value->'action_plan' from jsonb_array_elements(coalesce(v_assurance->'operating_queue','[]'::jsonb)) q where q.value->>'entity_type'='player' and q.value->>'entity_id'=p.id::text order by case q.value#>>'{breach,severity}' when 'high' then 1 else 2 end limit 1) first_action_plan,
      (select q.value->'breach' from jsonb_array_elements(coalesce(v_assurance->'operating_queue','[]'::jsonb)) q where q.value->>'entity_type'='player' and q.value->>'entity_id'=p.id::text order by case q.value#>>'{breach,severity}' when 'high' then 1 else 2 end limit 1) first_breach
    from players p
    left join lateral (select value from jsonb_array_elements(coalesce(v_assurance->'players','[]'::jsonb)) where value->>'player_id'=p.id::text limit 1) a on true
    left join lateral (select value from jsonb_array_elements(coalesce(v_rep->'players','[]'::jsonb)) where value->>'player_id'=p.id::text limit 1) rep on true
  ), classified as (
    select j.*,
      case
        when j.high_service_breaches>0 or j.overdue_requests>0 then 'immediate_service_intervention'
        when jsonb_array_length(j.service_breaches)>0 then 'service_control_gap'
        when j.representation_attention in ('high','medium') then 'records_control_gap'
        when j.active_deals+j.market_matches+j.active_opportunities>0 then 'active_market_service'
        else 'maintained_no_active_market_process'
      end relationship_control_state,
      case
        when j.high_service_breaches>0 or j.overdue_requests>0 then 1
        when jsonb_array_length(j.service_breaches)>0 then 2
        when j.representation_attention in ('high','medium') then 3
        when j.active_deals+j.market_matches+j.active_opportunities>0 then 4
        else 5 end control_rank
    from joined j
  ), ranked as (
    select *,row_number() over(order by control_rank,
      case when football_status='free_agent' then 0 else 1 end,
      contract_expiry nulls last,
      last_recorded_service_activity_at nulls first,
      trim(concat_ws(' ',first_name,last_name))) rn
    from classified
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',rn,
    'player_id',id,
    'player_name',trim(concat_ws(' ',first_name,last_name)),
    'football_status',football_status,
    'contract_status',contract_status,
    'contract_expiry',contract_expiry,
    'state',relationship_control_state,
    'service_control',jsonb_build_object('state',service_state,'breaches',service_breaches,'high_breach_count',high_service_breaches,'first_breach',first_breach,'next_allowed_workflow',first_action_plan),
    'representation_control',jsonb_build_object('state',representation_state,'attention',representation_attention),
    'market_service',jsonb_build_object('active_deals',active_deals,'market_matches',market_matches,'active_opportunities',active_opportunities),
    'player_requests',jsonb_build_object('open',open_requests,'overdue',overdue_requests),
    'service_plan',jsonb_build_object('next_action',next_action,'next_action_due',next_action_due,'has_primary_owner',primary_staff_user_id is not null),
    'last_recorded_service_activity_at',last_recorded_service_activity_at,
    'days_since_recorded_service_activity',case when last_recorded_service_activity_at is null then null else floor(extract(epoch from (now()-last_recorded_service_activity_at))/86400)::integer end,
    'player_safe_statement_action',jsonb_build_object('api_action','player_service_statement','player_id',id)
  ) order by rn) filter(where rn<=v_limit),'[]'::jsonb),
  count(*),
  count(*) filter(where relationship_control_state='immediate_service_intervention'),
  count(*) filter(where relationship_control_state in ('service_control_gap','records_control_gap')),
  count(*) filter(where relationship_control_state in ('active_market_service','maintained_no_active_market_process'))
  into v_items,v_total,v_immediate,v_gaps,v_controlled
  from ranked;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),
    'summary',jsonb_build_object('active_players',v_total,'immediate_service_interventions',v_immediate,'other_control_gaps',v_gaps,'controlled_players',v_controlled),
    'items',v_items,
    'principle','Protect player relationships through factual service continuity and accountability. Do not infer loyalty, satisfaction or churn probability from operational records.',
    'truth_contract',jsonb_build_object(
      'no_churn_prediction','The state is not a prediction that a player will leave the agency.',
      'activity','Last recorded service activity is the latest captured task, player request, deal activity or career-strategy update. Offline conversations that are not recorded remain invisible.',
      'representation','Representation-record attention is factual records control, not a legal enforceability judgement.',
      'priority','Immediate intervention is driven by recorded high-severity service breaches or overdue player requests, not subjective player importance.'
    )
  );
end;
$function$;

create or replace function public.platform_server_club_portfolio_control(
  p_tenant_id uuid,
  p_limit integer default 100
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_accounts jsonb:=public.platform_server_club_accounts(p_tenant_id,250);
  v_coverage jsonb:=public.platform_server_demand_coverage(p_tenant_id,250);
  v_limit integer:=greatest(1,least(coalesce(p_limit,100),250));
  v_items jsonb;
  v_total integer:=0;
  v_protect integer:=0;
  v_serve integer:=0;
  v_roster_gap integer:=0;
  v_access_gap integer:=0;
begin
  with accounts as (
    select a.value account
    from jsonb_array_elements(coalesce(v_accounts->'clubs','[]'::jsonb)) a
  ), facts as (
    select account,
      account->>'organisation_id' organisation_id,
      coalesce((account#>>'{commercial,active_deals}')::integer,0) active_deals,
      coalesce((account#>>'{commercial,deals_needing_action}')::integer,0) deals_needing_action,
      coalesce((account#>>'{demand,confirmed_needs}')::integer,0) confirmed_needs,
      coalesce((account#>>'{demand,active_needs}')::integer,0) active_needs,
      coalesce((account#>>'{access,direct_score}')::integer,0) direct_score,
      coalesce((account#>>'{access,introduction_score}')::integer,0) intro_score,
      coalesce((account#>>'{activity,interactions_30d}')::integer,0) interactions_30d,
      nullif(account#>>'{activity,last_interaction_at}','')::timestamptz last_interaction_at,
      coalesce(c.ready_needs,0) ready_needs,
      coalesce(c.roster_gap_needs,0) roster_gap_needs,
      coalesce(c.access_gap_needs,0) access_gap_needs,
      coalesce(c.career_review_needs,0) career_review_needs,
      coalesce(h.won_deals,0) won_deals,
      coalesce(h.lost_deals,0) lost_deals,
      coalesce(h.confirmed_origin_deals,0) confirmed_origin_deals,
      h.origin_routes
    from accounts
    left join lateral (
      select
        count(*) filter(where x.value->>'coverage_state' in ('ready_direct','ready_via_introduction'))::integer ready_needs,
        count(*) filter(where x.value->>'coverage_state'='roster_gap')::integer roster_gap_needs,
        count(*) filter(where x.value->>'coverage_state'='access_gap')::integer access_gap_needs,
        count(*) filter(where x.value->>'coverage_state' like '%career%' or x.value->>'coverage_state'='candidate_requires_pursuit_review')::integer career_review_needs
      from jsonb_array_elements(coalesce(v_coverage->'items','[]'::jsonb)) x
      where x.value#>>'{club,organisation_id}'=account->>'organisation_id'
    ) c on true
    left join lateral (
      select
        count(*) filter(where d.status='won')::integer won_deals,
        count(*) filter(where d.status='lost')::integer lost_deals,
        count(*) filter(where o.confirmation_status='confirmed')::integer confirmed_origin_deals,
        coalesce(jsonb_agg(distinct o.route_type) filter(where o.route_type is not null and o.confirmation_status='confirmed'),'[]'::jsonb) origin_routes
      from djm_os.deal_rooms d
      left join platform.deal_origin_attributions o on o.tenant_id=p_tenant_id and o.deal_room_id=d.id
      where d.tenant_id=p_tenant_id and d.organisation_id=(account->>'organisation_id')::uuid
    ) h on true
  ), classified as (
    select f.*,
      case
        when active_deals>0 and deals_needing_action>0 then 'protect_live_business'
        when confirmed_needs>0 and ready_needs>0 then 'serve_confirmed_demand'
        when confirmed_needs>0 and roster_gap_needs>0 then 'fill_confirmed_roster_gap'
        when active_deals>0 then 'maintain_live_business'
        when active_needs>0 and access_gap_needs>0 then 'improve_access_for_demand'
        when active_needs>0 and career_review_needs>0 then 'resolve_player_gate_for_demand'
        when active_needs>0 then 'develop_live_demand'
        else 'relationship_development'
      end control_state,
      case
        when active_deals>0 and deals_needing_action>0 then 1
        when confirmed_needs>0 and ready_needs>0 then 2
        when confirmed_needs>0 and roster_gap_needs>0 then 3
        when active_deals>0 then 4
        when active_needs>0 and access_gap_needs>0 then 5
        when active_needs>0 and career_review_needs>0 then 6
        when active_needs>0 then 7
        else 8 end control_rank
    from facts f
  ), ranked as (
    select *,row_number() over(order by control_rank,
      confirmed_needs desc,
      active_deals desc,
      greatest(direct_score,intro_score) desc,
      last_interaction_at desc nulls last,
      account->>'name') rn
    from classified
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',rn,
    'organisation_id',organisation_id,
    'club',jsonb_build_object('name',account->>'name','country',account->>'country','city',account->>'city','league_name',account->>'league_name'),
    'state',control_state,
    'live_business',jsonb_build_object('active_deals',active_deals,'deals_needing_action',deals_needing_action,'commercial_by_currency',account#>'{commercial,by_currency}'),
    'demand',jsonb_build_object('active_needs',active_needs,'confirmed_needs',confirmed_needs,'ready_needs',ready_needs,'roster_gap_needs',roster_gap_needs,'access_gap_needs',access_gap_needs,'career_review_needs',career_review_needs,'earliest_expiry',account#>>'{demand,earliest_expiry}'),
    'access',jsonb_build_object('direct_score',direct_score,'direct_state',account#>>'{access,direct_state}','best_direct_contact',account#>>'{access,best_direct_contact}','best_direct_role',account#>>'{access,best_direct_role}','introduction_score',intro_score,'introduction_via',account#>>'{access,introduction_via}','introduction_target',account#>>'{access,introduction_target}'),
    'relationship_activity',jsonb_build_object('interactions_30d',interactions_30d,'last_interaction_at',last_interaction_at),
    'historical_evidence',jsonb_build_object('won_deals',won_deals,'lost_deals',lost_deals,'confirmed_origin_deals',confirmed_origin_deals,'recorded_origin_routes',origin_routes),
    'next_action',case control_state
      when 'protect_live_business' then jsonb_build_object('api_action','deal_portfolio','instruction','Protect the live deals that currently need action before chasing new account activity.')
      when 'serve_confirmed_demand' then jsonb_build_object('api_action','origination_command','instruction','Work the career-cleared candidate route against confirmed club demand.')
      when 'fill_confirmed_roster_gap' then jsonb_build_object('api_action','scouting_mandates','instruction','Turn the confirmed uncovered need into a scouting mandate.')
      when 'maintain_live_business' then jsonb_build_object('api_action','deal_portfolio','instruction','Maintain disciplined execution on the current live business.')
      when 'improve_access_for_demand' then jsonb_build_object('api_action','access_routes','instruction','Improve the club access route before spending the player relationship.')
      when 'resolve_player_gate_for_demand' then jsonb_build_object('api_action','career_aligned_pursuits','instruction','Resolve player-career control before escalating the club opportunity.')
      when 'develop_live_demand' then jsonb_build_object('api_action','demand_coverage','instruction','Review the live demand and decide whether the agency can credibly serve it.')
      else jsonb_build_object('api_action','club_account','instruction','Develop the relationship deliberately; no live business or demand currently forces action.') end
  ) order by rn) filter(where rn<=v_limit),'[]'::jsonb),
  count(*),
  count(*) filter(where control_state='protect_live_business'),
  count(*) filter(where control_state='serve_confirmed_demand'),
  count(*) filter(where control_state='fill_confirmed_roster_gap'),
  count(*) filter(where control_state='improve_access_for_demand')
  into v_items,v_total,v_protect,v_serve,v_roster_gap,v_access_gap
  from ranked;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),
    'summary',jsonb_build_object('relevant_clubs',v_total,'live_business_to_protect',v_protect,'confirmed_demand_ready_to_serve',v_serve,'confirmed_roster_gaps',v_roster_gap,'demand_access_gaps',v_access_gap),
    'items',v_items,
    'principle','Manage clubs as relationship-and-demand accounts. Protect live business first, then serve confirmed demand, then fill real roster or access gaps.',
    'truth_contract',jsonb_build_object(
      'no_club_score','No composite club priority score is used in this control surface.',
      'history','Won/lost deal counts are recorded history, not a forecast of future club conversion.',
      'access','Warm introduction and direct access remain separate facts.',
      'demand','Confirmed and predicted demand remain distinct; confirmed demand is never inferred from a prediction.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_player_relationship_control(uuid,integer) from public,anon,authenticated;
revoke all on function public.platform_server_club_portfolio_control(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_player_relationship_control(uuid,integer) to service_role;
grant execute on function public.platform_server_club_portfolio_control(uuid,integer) to service_role;;
