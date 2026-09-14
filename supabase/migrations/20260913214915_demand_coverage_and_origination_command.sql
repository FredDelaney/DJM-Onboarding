create or replace function public.platform_server_demand_coverage(p_tenant_id uuid,p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,100),250));
  v_board jsonb:=public.platform_server_career_aligned_pursuit_board(p_tenant_id,250);
  v_n record;
  v_candidates jsonb;
  v_best_open jsonb;
  v_best_any jsonb;
  v_candidate_count integer;
  v_open_count integer;
  v_review_count integer;
  v_hold_count integer;
  v_access jsonb;
  v_intro jsonb;
  v_direct integer;
  v_intro_score integer;
  v_access_mode text;
  v_state text;
  v_action jsonb;
  v_items jsonb:='[]'::jsonb;
  v_total integer:=0;
  v_ready integer:=0;
  v_roster_gaps integer:=0;
  v_access_gaps integer:=0;
  v_career_reviews integer:=0;
begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id and t.status='active') then raise exception 'tenant_not_found'; end if;

  for v_n in
    select n.*,o.name club_name,o.country,o.city,o.league_name
    from djm_os.club_needs n
    join djm_os.organisations o on o.id=n.organisation_id and o.tenant_id=n.tenant_id
    where n.tenant_id=p_tenant_id and n.status='active' and (n.expires_at is null or n.expires_at>=now())
    order by case n.need_type when 'confirmed' then 0 else 1 end,n.priority desc,n.expires_at nulls last,n.received_at desc
    limit v_limit
  loop
    v_total:=v_total+1;
    select coalesce(jsonb_agg(x.value order by coalesce((x.value->>'readiness_score')::integer,0) desc),'[]'::jsonb),
           count(*),
           count(*) filter(where x.value#>>'{career_strategy_gate,state}' like 'open_%'),
           count(*) filter(where x.value#>>'{career_strategy_gate,state}' like 'review_%'),
           count(*) filter(where not (x.value#>>'{career_strategy_gate,state}' like 'open_%') and not (x.value#>>'{career_strategy_gate,state}' like 'review_%'))
    into v_candidates,v_candidate_count,v_open_count,v_review_count,v_hold_count
    from jsonb_array_elements(coalesce(v_board->'items','[]'::jsonb)) x
    where x.value->>'club_need_id'=v_n.id::text;

    select x.value into v_best_open
    from jsonb_array_elements(v_candidates) x
    where x.value#>>'{career_strategy_gate,state}' like 'open_%'
    order by coalesce((x.value->>'readiness_score')::integer,0) desc
    limit 1;
    select x.value into v_best_any from jsonb_array_elements(v_candidates) x order by coalesce((x.value->>'readiness_score')::integer,0) desc limit 1;

    v_access:=public.platform_server_access_routes(p_tenant_id,v_n.organisation_id,5);
    v_intro:=public.platform_server_introduction_routes(p_tenant_id,v_n.organisation_id,3);
    begin v_direct:=coalesce((v_access#>>'{best_route,route_score}')::integer,0); exception when others then v_direct:=0; end;
    begin v_intro_score:=coalesce((v_intro#>>'{best_route,introduction_score}')::integer,0); exception when others then v_intro_score:=0; end;
    v_access_mode:=case
      when v_direct>=70 then 'direct_route'
      when v_intro_score>=70 and v_intro_score>=v_direct+10 then 'warm_introduction'
      when v_direct>0 then 'developing_direct_route'
      when v_intro_score>0 then 'developing_introduction'
      else 'no_recorded_route' end;

    if v_candidate_count=0 then
      v_state:='roster_gap'; v_roster_gaps:=v_roster_gaps+1;
      v_action:=jsonb_build_object('action_type','scout_or_recruit_for_need','instruction','No recorded roster match exists for this active club need. Scout or recruit against the recorded profile rather than forcing an unsuitable player.','requires_human_input',true);
    elsif v_open_count=0 and v_review_count>0 then
      v_state:='career_or_human_review_required'; v_career_reviews:=v_career_reviews+1;
      v_action:=jsonb_build_object('action_type','resolve_pursuit_gate','instruction','A football match exists, but career-strategy or human review must be resolved before external escalation.','requires_human_input',true);
    elsif v_open_count=0 then
      v_state:='career_blocked'; v_career_reviews:=v_career_reviews+1;
      v_action:=jsonb_build_object('action_type','resolve_player_strategy_control','instruction','Recorded matches exist but none are open under the player career controls.','requires_human_input',true);
    elsif coalesce(v_best_open->>'readiness_state','') not in ('strong_pursuit','credible_pursuit') then
      v_state:='candidate_requires_pursuit_review';
      v_action:=jsonb_build_object('action_type','review_candidate_fit','instruction','A career-cleared candidate exists, but the recorded pursuit readiness is not yet strong enough for the system to call it a priority execution route.','requires_human_input',true);
    elsif v_access_mode='direct_route' then
      v_state:='ready_direct'; v_ready:=v_ready+1;
      v_action:=jsonb_build_object('action_type','work_direct_pursuit','instruction','Use the recorded direct club route and progress the best career-cleared candidate through human review.','requires_human_input',false);
    elsif v_access_mode='warm_introduction' then
      v_state:='ready_via_introduction'; v_ready:=v_ready+1;
      v_action:=jsonb_build_object('action_type','request_warm_introduction','instruction','The player route is credible and the best recorded access is a warm introduction. Use that path rather than weak direct outreach.','requires_human_input',true);
    else
      v_state:='access_gap'; v_access_gaps:=v_access_gaps+1;
      v_action:=jsonb_build_object('action_type','build_club_access','instruction','A career-cleared roster candidate exists, but club access is not yet strong enough. Build or source the access route before spending the player relationship.','requires_human_input',true);
    end if;

    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'club_need_id',v_n.id,
      'club',jsonb_build_object('organisation_id',v_n.organisation_id,'name',v_n.club_name,'country',v_n.country,'city',v_n.city,'league_name',v_n.league_name),
      'need',jsonb_build_object(
        'title',v_n.title,'position',v_n.position,'secondary_position',v_n.secondary_position,'preferred_foot',v_n.preferred_foot,
        'min_age',v_n.min_age,'max_age',v_n.max_age,'min_height_cm',v_n.min_height_cm,'transfer_type',v_n.transfer_type,
        'transfer_budget',v_n.transfer_budget,'salary_budget',v_n.salary_budget,'currency',v_n.currency,'salary_period',v_n.salary_period,
        'priority',v_n.priority,'need_type',v_n.need_type,'confidence',v_n.confidence,'prediction_probability',v_n.prediction_probability,
        'confirmed_at',v_n.confirmed_at,'expires_at',v_n.expires_at,'received_at',v_n.received_at
      ),
      'coverage_state',v_state,
      'candidate_coverage',jsonb_build_object('recorded_candidates',v_candidate_count,'career_open',v_open_count,'human_review',v_review_count,'held',v_hold_count,'best_open_candidate',v_best_open,'best_recorded_candidate',v_best_any),
      'access',jsonb_build_object('mode',v_access_mode,'direct_score',v_direct,'introduction_score',v_intro_score,'best_direct_route',v_access->'best_route','best_introduction_route',v_intro->'best_route'),
      'next_action',v_action
    ));
  end loop;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'items',v_items,
    'summary',jsonb_build_object('active_needs',v_total,'ready_to_work',v_ready,'roster_gaps',v_roster_gaps,'access_gaps',v_access_gaps,'career_or_human_review',v_career_reviews),
    'principle','Start from recorded club demand, then test roster fit, player career permission and access separately. Do not force a player into a need simply because the club is attractive.',
    'truth_contract',jsonb_build_object(
      'demand','Confirmed and predicted needs remain distinct. Predicted need is not treated as confirmed club demand.',
      'fit','Candidate readiness comes from the existing pursuit model and is not a transfer probability.',
      'career','Career gate is independent of football fit and can hold external escalation.',
      'access','Warm introductions remain separate from direct access.',
      'roster_gap','No recorded player match means no recorded roster solution; it does not prove that no suitable player exists in the world.'
    )
  );
end;
$function$;

create or replace function public.platform_server_origination_command(p_tenant_id uuid,p_limit integer default 25)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_cov jsonb:=public.platform_server_demand_coverage(p_tenant_id,200);
  v_items jsonb;
  v_limit integer:=greatest(1,least(coalesce(p_limit,25),100));
begin
  with x as (
    select value item,
      case value#>>'{need,need_type}' when 'confirmed' then 0 else 1 end certainty_rank,
      case value->>'coverage_state'
        when 'ready_direct' then 1
        when 'ready_via_introduction' then 2
        when 'access_gap' then 3
        when 'career_or_human_review_required' then 4
        when 'career_blocked' then 5
        when 'candidate_requires_pursuit_review' then 6
        when 'roster_gap' then 7
        else 9 end action_rank,
      coalesce((value#>>'{need,priority}')::integer,3) priority,
      nullif(value#>>'{need,expires_at}','')::timestamptz expires_at
    from jsonb_array_elements(coalesce(v_cov->'items','[]'::jsonb))
  ), ranked as (
    select *,row_number() over(order by certainty_rank,action_rank,priority desc,expires_at nulls last,item#>>'{club,name}',item#>>'{need,title}') rn from x
  )
  select coalesce(jsonb_agg(item||jsonb_build_object(
    'command_rank',rn,
    'why_now',case
      when item#>>'{need,need_type}'='confirmed' and item->>'coverage_state'='ready_direct' then 'Confirmed club demand, credible career-cleared roster solution and strong direct access are all recorded.'
      when item#>>'{need,need_type}'='confirmed' and item->>'coverage_state'='ready_via_introduction' then 'Confirmed club demand and a credible roster solution exist; the warm-introduction route is stronger than direct access.'
      when item#>>'{need,need_type}'='confirmed' and item->>'coverage_state'='roster_gap' then 'Confirmed club demand exists but the current recorded roster has no match, creating a concrete scouting/recruitment brief.'
      when item->>'coverage_state' like '%career%' then 'A recorded player fit exists, but player-career control must be resolved before external escalation.'
      when item->>'coverage_state'='access_gap' then 'A credible player route exists but access is the operating bottleneck.'
      when item#>>'{need,need_type}'='predicted' then 'This is predicted demand only; treat it as preparation, not confirmed club instruction.'
      else 'Recorded demand has a defined operating next step.' end
  ) order by rn) filter(where rn<=v_limit),'[]'::jsonb) into v_items from ranked;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'items',v_items,'coverage_summary',v_cov->'summary',
    'ranking_policy',jsonb_build_object(
      'order',jsonb_build_array('confirmed demand before predicted demand','ready direct route','ready warm-introduction route','access gap','career/human review','other candidate review','roster gap','higher recorded club priority','earlier expiry'),
      'no_composite_score',true
    ),
    'truth_contract',v_cov->'truth_contract'
  );
end;
$function$;

revoke all on function public.platform_server_demand_coverage(uuid,integer) from public,anon,authenticated;
revoke all on function public.platform_server_origination_command(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_demand_coverage(uuid,integer) to service_role;
grant execute on function public.platform_server_origination_command(uuid,integer) to service_role;;
