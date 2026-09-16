create or replace function public.platform_server_negotiation_brief(p_tenant_id uuid,p_deal_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_deal djm_os.deal_rooms%rowtype;
  v_player public.players%rowtype;
  v_org djm_os.organisations%rowtype;
  v_need djm_os.club_needs%rowtype;
  v_readiness jsonb;
  v_sequence jsonb;
  v_decision jsonb;
  v_access jsonb;
  v_momentum jsonb;
  v_pressure jsonb;
  v_pursuit jsonb:=null;
  v_questions jsonb:='[]'::jsonb;
  v_known jsonb;
  v_unknowns jsonb:='[]'::jsonb;
  v_direct integer:=0;
  v_intro integer:=0;
  v_rep integer:=0;
  v_reg integer:=0;
  v_terms integer:=0;
  v_docs integer:=0;
begin
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  if v_deal.player_id is null then
    return jsonb_build_object('available',false,'reason','negotiation_brief_currently_requires_player_deal','tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id);
  end if;
  select * into v_player from public.players p where p.id=v_deal.player_id and p.tenant_id=p_tenant_id;
  select * into v_org from djm_os.organisations o where o.id=v_deal.organisation_id and o.tenant_id=p_tenant_id;
  if v_deal.club_need_id is not null then select * into v_need from djm_os.club_needs n where n.id=v_deal.club_need_id and n.tenant_id=p_tenant_id; end if;

  v_readiness:=public.platform_server_negotiation_readiness(p_tenant_id,p_deal_room_id);
  v_sequence:=public.platform_server_negotiation_sequence(p_tenant_id,p_deal_room_id);
  v_decision:=public.platform_server_deal_decision_map(p_tenant_id,p_deal_room_id);
  v_access:=public.platform_server_club_account(p_tenant_id,v_deal.organisation_id)->'access';
  v_momentum:=public.platform_server_deal_momentum(p_tenant_id,p_deal_room_id,30);
  v_pressure:=public.platform_server_deal_decision_pressure(p_tenant_id,p_deal_room_id);
  if v_deal.club_need_id is not null and exists(select 1 from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.club_need_id=v_deal.club_need_id and pm.player_id=v_deal.player_id) then
    v_pursuit:=public.platform_server_pursuit_readiness(p_tenant_id,v_deal.club_need_id,v_deal.player_id);
  end if;
  begin v_direct:=coalesce((v_access->'direct'->'best_route'->>'route_score')::integer,0); exception when others then v_direct:=0; end;
  begin v_intro:=coalesce((v_access->'introductions'->'best_route'->>'introduction_score')::integer,0); exception when others then v_intro:=0; end;
  begin v_rep:=coalesce((v_readiness->'factors'->'representation_record'->>'score')::integer,0); exception when others then v_rep:=0; end;
  begin v_reg:=coalesce((v_readiness->'factors'->'registration_readiness'->>'score')::integer,0); exception when others then v_reg:=0; end;
  begin v_terms:=coalesce((v_readiness->'factors'->'commercial_terms_clarity'->>'score')::integer,0); exception when others then v_terms:=0; end;
  begin v_docs:=coalesce((v_readiness->'factors'->'document_readiness'->>'score')::integer,0); exception when others then v_docs:=0; end;

  if v_rep<70 then v_questions:=v_questions||jsonb_build_array('What representation, mandate or placement authority is actually in force for this transaction, and what are its scope and dates?'); end if;
  if v_deal.transfer_fee is null and coalesce(v_player.contract_status,'')='under_contract' then v_questions:=v_questions||jsonb_build_array('What is the club-to-club fee, release position or acceptable transaction structure?'); end if;
  if v_deal.player_salary is null then v_questions:=v_questions||jsonb_build_array('What player salary target or acceptable range should guide the negotiation?'); end if;
  if v_deal.player_salary is not null and v_deal.salary_period is null then v_questions:=v_questions||jsonb_build_array('What period and tax basis does the recorded salary figure use?'); end if;
  if v_reg<65 then v_questions:=v_questions||jsonb_build_array('Which registration, passport or foreign-player issue must be verified before terms are relied on?'); end if;
  if v_docs<70 then v_questions:=v_questions||jsonb_build_array('Which current player documents are required for the next transaction stage, and which are actually available?'); end if;
  v_questions:=v_questions||jsonb_build_array(
    'What is the preferred outcome, acceptable fallback and issue that would cause us to stop or reframe the negotiation?',
    'Which terms are confirmed facts, which are negotiating positions, and which are still assumptions?',
    'Who can actually move the decision at the club, and which recorded route gives us the best access to them?'
  );

  if v_deal.transfer_fee is null then v_unknowns:=v_unknowns||jsonb_build_array('transfer_fee_or_release_position'); end if;
  if v_deal.player_salary is null then v_unknowns:=v_unknowns||jsonb_build_array('player_salary'); end if;
  if v_deal.salary_period is null then v_unknowns:=v_unknowns||jsonb_build_array('salary_period_or_basis'); end if;
  if v_rep<70 then v_unknowns:=v_unknowns||jsonb_build_array('recorded_authority_scope'); end if;
  if v_reg<65 then v_unknowns:=v_unknowns||jsonb_build_array('registration_case'); end if;
  if v_docs<70 then v_unknowns:=v_unknowns||jsonb_build_array('transaction_document_pack'); end if;
  v_unknowns:=v_unknowns||jsonb_build_array('competitor_activity_unless_explicitly_recorded','club_internal_approval_process_unless_explicitly_recorded','agent_concession_limits_unless_explicitly_recorded');

  v_known:=jsonb_build_object(
    'deal',jsonb_build_object('title',v_deal.title,'stage',v_deal.stage,'status',v_deal.status,'probability',coalesce(v_deal.probability,v_deal.manual_probability,v_deal.model_probability),'primary_blocker',v_deal.primary_blocker,'next_decision',v_deal.next_decision),
    'player',jsonb_build_object('player_id',v_player.id,'name',trim(concat_ws(' ',v_player.first_name,v_player.last_name)),'current_club',v_player.current_club,'contract_status',v_player.contract_status,'contract_expiry',v_player.contract_expiry,'football_status',v_player.football_status),
    'club',jsonb_build_object('organisation_id',v_org.id,'name',v_org.name,'country',v_org.country,'league_name',v_org.league_name),
    'recorded_terms',jsonb_build_object('currency',v_deal.currency,'transfer_fee',v_deal.transfer_fee,'player_salary',v_deal.player_salary,'salary_period',v_deal.salary_period,'expected_commission',v_deal.expected_commission,'financial_notes',v_deal.financial_notes),
    'recorded_club_need',case when v_need.id is null then null else jsonb_build_object('need_type',v_need.need_type,'transfer_type',v_need.transfer_type,'transfer_budget',v_need.transfer_budget,'salary_budget',v_need.salary_budget,'salary_period',v_need.salary_period,'currency',v_need.currency,'expires_at',v_need.expires_at) end
  );

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'generated_at',now(),
    'headline',v_deal.title,
    'known_recorded_facts',v_known,
    'negotiation_readiness',jsonb_build_object('score',v_readiness->'score','state',v_readiness->'state','gaps',v_readiness->'gaps'),
    'preparation_sequence',v_sequence,
    'decision_map',v_decision,
    'route_strategy',jsonb_build_object('direct_score',v_direct,'introduction_score',v_intro,'direct_best_route',v_access->'direct'->'best_route','best_introduction_route',v_access->'introductions'->'best_route'),
    'movement',jsonb_build_object('momentum',v_momentum,'decision_pressure',v_pressure),
    'pursuit_readiness',v_pursuit,
    'unresolved_or_unrecorded',v_unknowns,
    'human_decisions_required',v_questions,
    'negotiation_guardrails',jsonb_build_object(
      'minimum_acceptable_fee','not_recorded_unless_explicitly_set',
      'player_salary_floor_or_target','not_recorded_unless_explicitly_set',
      'commission_floor_or_protection','not_recorded_unless_explicitly_set',
      'concession_order','not_recorded_unless_explicitly_set',
      'walk_away_conditions','human_decision_required'
    ),
    'truth_contract',jsonb_build_object(
      'purpose','internal preparation brief only',
      'confirmed_vs_unknown','Only recorded database facts are presented as known. Missing information remains unknown rather than inferred.',
      'legal','This is not legal advice, authority confirmation, registration eligibility or regulatory clearance.',
      'competitive_pressure','Unknown unless explicitly recorded; the system does not invent rival players, agents or offers.',
      'negotiation_positions','The system does not invent floors, targets, concessions or walk-away terms.'
    )
  );
end;
$$;

create or replace function public.platform_server_deal_advantage(p_tenant_id uuid,p_deal_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_deal djm_os.deal_rooms%rowtype;
  v_player public.players%rowtype;
  v_need djm_os.club_needs%rowtype;
  v_readiness jsonb;
  v_momentum jsonb;
  v_account jsonb;
  v_pursuit jsonb:=null;
  v_direct integer:=0;
  v_intro integer:=0;
  v_route integer:=0;
  v_readiness_score integer:=0;
  v_momentum_score integer:=0;
  v_demand integer:=40;
  v_fit integer:=50;
  v_alignment integer:=50;
  v_optionality integer:=35;
  v_other_deals integer:=0;
  v_other_matches integer:=0;
  v_club_other_matches integer:=0;
  v_score integer:=0;
  v_edges jsonb:='[]'::jsonb;
  v_exposures jsonb:='[]'::jsonb;
  v_unknowns jsonb:='[]'::jsonb;
  v_salary_alignment text;
begin
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  if v_deal.player_id is null then return jsonb_build_object('available',false,'reason','deal_advantage_currently_requires_player_deal','tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id); end if;
  select * into v_player from public.players p where p.id=v_deal.player_id and p.tenant_id=p_tenant_id;
  if v_deal.club_need_id is not null then select * into v_need from djm_os.club_needs n where n.id=v_deal.club_need_id and n.tenant_id=p_tenant_id; end if;

  v_readiness:=public.platform_server_negotiation_readiness(p_tenant_id,p_deal_room_id);
  v_momentum:=public.platform_server_deal_momentum(p_tenant_id,p_deal_room_id,30);
  v_account:=public.platform_server_club_account(p_tenant_id,v_deal.organisation_id);
  if v_deal.club_need_id is not null and exists(select 1 from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.club_need_id=v_deal.club_need_id and pm.player_id=v_deal.player_id) then
    v_pursuit:=public.platform_server_pursuit_readiness(p_tenant_id,v_deal.club_need_id,v_deal.player_id);
  end if;
  begin v_direct:=coalesce((v_account->'access'->'direct'->'best_route'->>'route_score')::integer,0); exception when others then v_direct:=0; end;
  begin v_intro:=coalesce((v_account->'access'->'introductions'->'best_route'->>'introduction_score')::integer,0); exception when others then v_intro:=0; end;
  begin v_readiness_score:=coalesce((v_readiness->>'score')::integer,0); exception when others then v_readiness_score:=0; end;
  begin v_momentum_score:=coalesce((v_momentum->>'momentum_score')::integer,0); exception when others then v_momentum_score:=0; end;
  begin if v_pursuit is not null then v_fit:=coalesce((v_pursuit->>'readiness_score')::integer,50); end if; exception when others then v_fit:=50; end;

  v_route:=case when v_direct>=80 then 90 when v_direct>=65 then 75 when v_intro>=85 then 68 when v_intro>=70 then 58 when v_direct>=45 then 45 else 30 end;
  if v_need.id is not null then
    v_demand:=case when v_need.need_type='confirmed' then least(100,78+coalesce(v_need.priority,3)*4) when v_need.need_type='predicted' then 55 else 50 end;
  else v_demand:=35; end if;

  v_salary_alignment:=v_readiness->'factors'->'commercial_terms_clarity'->'budget_alignment'->>'salary';
  v_alignment:=case v_salary_alignment when 'within_recorded_budget' then 90 when 'above_recorded_budget' then 25 else case when coalesce((v_readiness->'factors'->'commercial_terms_clarity'->>'score')::integer,0)>=80 then 70 else 45 end end;

  select count(*) into v_other_deals from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=v_deal.player_id and d.status='active' and d.id<>p_deal_room_id;
  select count(*) into v_other_matches from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.player_id=v_deal.player_id and (v_deal.club_need_id is null or pm.club_need_id<>v_deal.club_need_id) and pm.status in ('suggested','reviewing','shortlisted','pitched','active');
  if v_deal.club_need_id is not null then
    select count(*) into v_club_other_matches from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.club_need_id=v_deal.club_need_id and pm.player_id<>v_deal.player_id and pm.status in ('suggested','reviewing','shortlisted','pitched','active');
  end if;
  v_optionality:=least(90,35+least(v_other_deals,2)*25+least(v_other_matches,3)*10);

  v_score:=round(v_route*0.20+v_readiness_score*0.20+v_demand*0.15+v_fit*0.15+v_optionality*0.10+v_momentum_score*0.10+v_alignment*0.10);

  if v_direct>=75 then v_edges:=v_edges||jsonb_build_array('strong_recorded_direct_club_route');
  elsif v_intro>=80 then v_edges:=v_edges||jsonb_build_array('strong_recorded_warm_introduction_option');
  else v_exposures:=v_exposures||jsonb_build_array('club_access_not_strong'); end if;
  if v_need.need_type='confirmed' then v_edges:=v_edges||jsonb_build_array('confirmed_recorded_club_demand'); else v_unknowns:=v_unknowns||jsonb_build_array('club_demand_not_confirmed_or_not_linked'); end if;
  if v_fit>=80 then v_edges:=v_edges||jsonb_build_array('strong_recorded_player_club_fit'); elsif v_pursuit is null then v_unknowns:=v_unknowns||jsonb_build_array('no_linked_pursuit_readiness_case'); end if;
  if v_salary_alignment='within_recorded_budget' then v_edges:=v_edges||jsonb_build_array('recorded_salary_within_recorded_club_budget'); elsif v_salary_alignment='above_recorded_budget' then v_exposures:=v_exposures||jsonb_build_array('recorded_salary_above_recorded_club_budget'); else v_unknowns:=v_unknowns||jsonb_build_array('salary_budget_alignment_unknown'); end if;
  if v_readiness_score<70 then v_exposures:=v_exposures||jsonb_build_array('negotiation_preparation_incomplete'); end if;
  if v_momentum_score<55 then v_exposures:=v_exposures||jsonb_build_array('deal_momentum_weak'); end if;
  if v_other_deals>0 or v_other_matches>0 then v_edges:=v_edges||jsonb_build_array('recorded_player_optionality_exists'); else v_exposures:=v_exposures||jsonb_build_array('limited_recorded_player_optionality'); end if;
  v_unknowns:=v_unknowns||jsonb_build_array('external_competitor_activity_unless_explicitly_recorded','club_true_alternatives_unless_explicitly_recorded','negotiation_power_not_inferred_from_score');

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'generated_at',now(),
    'operating_advantage_score',v_score,
    'state',case when v_score>=78 then 'strong_operating_position' when v_score>=62 then 'balanced_with_edges' when v_score>=48 then 'exposed_but_workable' else 'weak_recorded_position' end,
    'factors',jsonb_build_object(
      'route_strength',jsonb_build_object('score',v_route,'weight',0.20,'direct_access_score',v_direct,'best_introduction_score',v_intro),
      'negotiation_preparation',jsonb_build_object('score',v_readiness_score,'weight',0.20,'state',v_readiness->>'state'),
      'recorded_demand_strength',jsonb_build_object('score',v_demand,'weight',0.15,'need_type',v_need.need_type,'priority',v_need.priority),
      'player_club_fit',jsonb_build_object('score',v_fit,'weight',0.15,'source',case when v_pursuit is null then 'not_available' else 'pursuit_readiness' end),
      'recorded_player_optionality',jsonb_build_object('score',v_optionality,'weight',0.10,'other_active_deals',v_other_deals,'other_recorded_matches',v_other_matches),
      'deal_momentum',jsonb_build_object('score',v_momentum_score,'weight',0.10,'state',v_momentum->>'state'),
      'commercial_alignment',jsonb_build_object('score',v_alignment,'weight',0.10,'salary_alignment',v_salary_alignment)
    ),
    'club_recorded_internal_alternatives',jsonb_build_object('other_players_matched_to_same_need',v_club_other_matches,'interpretation','Internal recorded alternatives only; this is not evidence of the club actual shortlist or external competition.'),
    'edges',v_edges,'exposures',v_exposures,'unknowns',v_unknowns,
    'truth_contract',jsonb_build_object(
      'score','Deterministic operating-position score, not bargaining power, transfer probability or outcome forecast.',
      'optionality','Counts recorded alternative deals/matches only; it is not a BATNA valuation.',
      'competition','External competitor activity remains unknown unless explicitly recorded.',
      'club_alternatives','Other platform matches are not proof of the club real shortlist.',
      'legal','No factor establishes authority, eligibility or enforceability.'
    )
  );
end;
$$;

create or replace function public.platform_server_deal_war_room_v3(p_tenant_id uuid,p_deal_room_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select public.platform_server_deal_war_room_v2(p_tenant_id,p_deal_room_id)
         || jsonb_build_object(
              'negotiation_readiness',public.platform_server_negotiation_readiness(p_tenant_id,p_deal_room_id),
              'negotiation_sequence',public.platform_server_negotiation_sequence(p_tenant_id,p_deal_room_id),
              'negotiation_brief',public.platform_server_negotiation_brief(p_tenant_id,p_deal_room_id),
              'deal_advantage',public.platform_server_deal_advantage(p_tenant_id,p_deal_room_id)
            );
$$;

create or replace function public.platform_server_deal_portfolio_v3(p_tenant_id uuid,p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_base jsonb;
  v_deals jsonb:='[]'::jsonb;
  v_item jsonb;
  v_readiness jsonb;
  v_advantage jsonb;
  v_ready integer:=0;
  v_prepare integer:=0;
  v_strong integer:=0;
  v_exposed integer:=0;
begin
  v_base:=public.platform_server_deal_portfolio_v2(p_tenant_id,p_limit);
  for v_item in select x.value from jsonb_array_elements(coalesce(v_base->'deals','[]'::jsonb)) x loop
    v_readiness:=public.platform_server_negotiation_readiness(p_tenant_id,(v_item->>'deal_room_id')::uuid);
    v_advantage:=public.platform_server_deal_advantage(p_tenant_id,(v_item->>'deal_room_id')::uuid);
    if coalesce((v_readiness->>'score')::integer,0)>=80 then v_ready:=v_ready+1; else v_prepare:=v_prepare+1; end if;
    if v_advantage->>'state'='strong_operating_position' then v_strong:=v_strong+1; end if;
    if v_advantage->>'state' in ('exposed_but_workable','weak_recorded_position') then v_exposed:=v_exposed+1; end if;
    v_deals:=v_deals||jsonb_build_array(v_item||jsonb_build_object(
      'negotiation_readiness_score',v_readiness->'score','negotiation_readiness_state',v_readiness->'state',
      'deal_advantage_score',v_advantage->'operating_advantage_score','deal_advantage_state',v_advantage->'state',
      'deal_advantage_edges',v_advantage->'edges','deal_advantage_exposures',v_advantage->'exposures'
    ));
  end loop;
  return v_base||jsonb_build_object(
    'deals',v_deals,
    'summary',(v_base->'summary')||jsonb_build_object(
      'negotiation_ready_or_strong_count',v_ready,'negotiation_preparation_required_count',v_prepare,
      'strong_operating_position_count',v_strong,'exposed_operating_position_count',v_exposed
    ),
    'principle','Attention, probability, control, momentum, negotiation preparation and deal advantage remain separate operating dimensions.'
  );
end;
$$;

revoke all on function public.platform_server_negotiation_brief(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_deal_advantage(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_deal_war_room_v3(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_deal_portfolio_v3(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_negotiation_brief(uuid,uuid) to service_role;
grant execute on function public.platform_server_deal_advantage(uuid,uuid) to service_role;
grant execute on function public.platform_server_deal_war_room_v3(uuid,uuid) to service_role;
grant execute on function public.platform_server_deal_portfolio_v3(uuid,integer) to service_role;
;
