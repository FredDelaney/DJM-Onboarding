create or replace function public.platform_server_deal_war_room_instant(p_tenant_id uuid,p_deal_room_id uuid)
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
  v_match djm_os.player_matches%rowtype;
  v_control jsonb;
  v_momentum jsonb;
  v_readiness jsonb;
  v_pressure jsonb;
  v_direct_ctx jsonb;
  v_intro_ctx jsonb;
  v_direct integer:=0;
  v_intro integer:=0;
  v_evidence integer:=0;
  v_control_score integer:=0;
  v_momentum_score integer:=0;
  v_readiness_score integer:=0;
  v_rep integer:=0;
  v_contract integer:=0;
  v_reg integer:=0;
  v_terms integer:=0;
  v_docs integer:=0;
  v_fit integer:=50;
  v_demand integer:=35;
  v_alignment integer:=50;
  v_optionality integer:=35;
  v_route integer:=0;
  v_advantage integer:=0;
  v_other_deals integer:=0;
  v_other_matches integer:=0;
  v_salary_alignment text;
  v_next_move jsonb;
  v_control_fix jsonb:=null;
  v_negotiation_next jsonb;
  v_edges jsonb:='[]'::jsonb;
  v_exposures jsonb:='[]'::jsonb;
  v_probability integer:=0;
  v_weighted numeric:=0;
begin
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  select * into v_org from djm_os.organisations o where o.id=v_deal.organisation_id and o.tenant_id=p_tenant_id;
  if v_deal.player_id is not null then select * into v_player from public.players p where p.id=v_deal.player_id and p.tenant_id=p_tenant_id; end if;
  if v_deal.club_need_id is not null then select * into v_need from djm_os.club_needs n where n.id=v_deal.club_need_id and n.tenant_id=p_tenant_id; end if;
  if v_deal.club_need_id is not null and v_deal.player_id is not null then select * into v_match from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.club_need_id=v_deal.club_need_id and pm.player_id=v_deal.player_id order by pm.updated_at desc limit 1; end if;

  v_control:=platform.deal_control_health(p_tenant_id,p_deal_room_id);
  v_momentum:=public.platform_server_deal_momentum(p_tenant_id,p_deal_room_id,30);
  v_readiness:=public.platform_server_negotiation_readiness(p_tenant_id,p_deal_room_id);
  v_pressure:=public.platform_server_deal_decision_pressure(p_tenant_id,p_deal_room_id);

  begin v_direct:=coalesce((v_control->'factors'->'access_execution'->>'direct_access_score')::integer,0); exception when others then v_direct:=0; end;
  begin v_intro:=coalesce((v_control->'factors'->'access_execution'->>'best_introduction_score')::integer,0); exception when others then v_intro:=0; end;
  begin v_evidence:=coalesce((v_control->'factors'->'evidence_health'->>'score')::integer,0); exception when others then v_evidence:=0; end;
  begin v_control_score:=coalesce((v_control->>'score')::integer,0); exception when others then v_control_score:=0; end;
  begin v_momentum_score:=coalesce((v_momentum->>'momentum_score')::integer,0); exception when others then v_momentum_score:=0; end;
  begin v_readiness_score:=coalesce((v_readiness->>'score')::integer,0); exception when others then v_readiness_score:=0; end;
  begin v_rep:=coalesce((v_readiness->'factors'->'representation_record'->>'score')::integer,0); exception when others then v_rep:=0; end;
  begin v_contract:=coalesce((v_readiness->'factors'->'player_contract_position'->>'score')::integer,0); exception when others then v_contract:=0; end;
  begin v_reg:=coalesce((v_readiness->'factors'->'registration_readiness'->>'score')::integer,0); exception when others then v_reg:=0; end;
  begin v_terms:=coalesce((v_readiness->'factors'->'commercial_terms_clarity'->>'score')::integer,0); exception when others then v_terms:=0; end;
  begin v_docs:=coalesce((v_readiness->'factors'->'document_readiness'->>'score')::integer,0); exception when others then v_docs:=0; end;

  v_direct_ctx:=public.platform_server_access_routes(p_tenant_id,v_deal.organisation_id,2);
  if v_direct<60 or v_intro>=70 then v_intro_ctx:=public.platform_server_introduction_routes(p_tenant_id,v_deal.organisation_id,2); else v_intro_ctx:=jsonb_build_object('best_route',null,'route_count',0); end if;

  v_probability:=coalesce(v_deal.probability,v_deal.manual_probability,v_deal.model_probability,0);
  v_weighted:=round(coalesce(v_deal.expected_commission,0)*v_probability/100.0,2);
  v_fit:=coalesce(round(v_match.overall_score)::integer,50);
  if v_need.id is not null then v_demand:=case when v_need.need_type='confirmed' then least(100,78+coalesce(v_need.priority,3)*4) when v_need.need_type='predicted' then 55 else 50 end; end if;
  v_salary_alignment:=v_readiness->'factors'->'commercial_terms_clarity'->'budget_alignment'->>'salary';
  v_alignment:=case v_salary_alignment when 'within_recorded_budget' then 90 when 'above_recorded_budget' then 25 else case when v_terms>=80 then 70 else 45 end end;
  select count(*) into v_other_deals from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=v_deal.player_id and d.status='active' and d.id<>p_deal_room_id;
  select count(*) into v_other_matches from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.player_id=v_deal.player_id and (v_deal.club_need_id is null or pm.club_need_id<>v_deal.club_need_id) and pm.status in ('suggested','reviewing','shortlisted','pitched','active');
  v_optionality:=least(90,35+least(v_other_deals,2)*25+least(v_other_matches,3)*10);
  v_route:=case when v_direct>=80 then 90 when v_direct>=65 then 75 when v_intro>=85 then 68 when v_intro>=70 then 58 when v_direct>=45 then 45 else 30 end;
  v_advantage:=round(v_route*0.20+v_readiness_score*0.20+v_demand*0.15+v_fit*0.15+v_optionality*0.10+v_momentum_score*0.10+v_alignment*0.10);

  if v_direct>=75 then v_edges:=v_edges||jsonb_build_array('strong_recorded_direct_club_route'); elsif v_intro>=80 then v_edges:=v_edges||jsonb_build_array('strong_recorded_warm_introduction_option'); else v_exposures:=v_exposures||jsonb_build_array('club_access_not_strong'); end if;
  if v_need.need_type='confirmed' then v_edges:=v_edges||jsonb_build_array('confirmed_recorded_club_demand'); end if;
  if v_fit>=80 then v_edges:=v_edges||jsonb_build_array('strong_recorded_player_club_fit'); end if;
  if v_salary_alignment='within_recorded_budget' then v_edges:=v_edges||jsonb_build_array('recorded_salary_within_recorded_club_budget'); elsif v_salary_alignment='above_recorded_budget' then v_exposures:=v_exposures||jsonb_build_array('recorded_salary_above_recorded_club_budget'); end if;
  if v_readiness_score<70 then v_exposures:=v_exposures||jsonb_build_array('negotiation_preparation_incomplete'); end if;
  if v_other_deals=0 and v_other_matches=0 then v_exposures:=v_exposures||jsonb_build_array('limited_recorded_player_optionality'); end if;

  v_negotiation_next:=case
    when v_rep<70 then jsonb_build_object('step_type','verify_authority_record','instruction','Confirm the relevant representation, mandate or placement-authority record before relying on authority in negotiation.','priority','blocking')
    when v_contract<70 then jsonb_build_object('step_type','verify_player_contract_position','instruction','Verify the player contract position before negotiating transaction terms.','priority','blocking')
    when v_reg<65 then jsonb_build_object('step_type','verify_registration_case','instruction','Verify material registration, passport and foreign-player constraints.','priority','blocking')
    when v_terms<80 then jsonb_build_object('step_type','complete_commercial_terms','instruction','Complete the material fee, salary and transaction terms known for this stage.','priority','commercial')
    when v_docs<70 then jsonb_build_object('step_type','assemble_document_pack','instruction','Assemble the current transaction-relevant player document set.','priority','preparation')
    else jsonb_build_object('step_type','review_negotiation_brief','instruction','Review the internal negotiation brief and set human guardrails before the next negotiation interaction.','priority','decision') end;

  v_control_fix:=case
    when v_deal.owner_user_id is null then jsonb_build_object('step_type','assign_owner','instruction','Assign one accountable deal owner.','requires_input',true)
    when nullif(trim(v_deal.next_action_text),'') is null or v_deal.next_action_at is null or v_deal.next_action_at<now() then jsonb_build_object('step_type','set_next_action','instruction',coalesce(nullif(trim(v_deal.next_action_text),''),'Set the single concrete next action that creates deal movement.'),'requires_input',true)
    else null end;

  v_next_move:=case
    when v_evidence<65 then jsonb_build_object('step_type','verify_evidence','instruction','Verify the weak or contradictory facts before the next commercial move.','priority','blocking')
    when v_direct<60 and v_intro>=80 then jsonb_build_object('step_type','request_warm_introduction','instruction',coalesce(v_intro_ctx->'best_route'->>'recommended_action','Use the strongest recorded warm-introduction route.'),'priority','access')
    when nullif(trim(v_deal.primary_blocker),'') is not null then jsonb_build_object('step_type','resolve_blocker','instruction','Resolve blocker: '||v_deal.primary_blocker,'priority','commercial')
    when v_momentum->>'state' in ('busy_but_cooling','stalled') then jsonb_build_object('step_type','recover_momentum','instruction','Create one decision-producing follow-up rather than another status check.','priority','commercial')
    else jsonb_build_object('step_type','decision_checkpoint','instruction',coalesce(nullif(trim(v_deal.next_decision),''),'Define the next decision that will advance, park or close the deal.'),'priority','decision') end;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'generated_at',now(),'surface','instant_war_room_v1',
    'deal',jsonb_build_object('title',v_deal.title,'stage',v_deal.stage,'status',v_deal.status,'probability',v_probability,'probability_source',v_deal.probability_source,'expected_commission',v_deal.expected_commission,'currency',v_deal.currency,'weighted_commission',v_weighted,'primary_blocker',v_deal.primary_blocker,'next_decision',v_deal.next_decision,'next_action_text',v_deal.next_action_text,'next_action_at',v_deal.next_action_at,'owner_user_id',v_deal.owner_user_id),
    'player',case when v_player.id is null then null else jsonb_build_object('player_id',v_player.id,'name',trim(concat_ws(' ',v_player.first_name,v_player.last_name)),'current_club',v_player.current_club,'contract_status',v_player.contract_status,'contract_expiry',v_player.contract_expiry) end,
    'club',jsonb_build_object('organisation_id',v_org.id,'name',v_org.name,'country',v_org.country,'league_name',v_org.league_name),
    'control',jsonb_build_object('score',v_control_score,'state',v_control->>'state','gaps',v_control->'gaps','evidence_score',v_evidence),
    'momentum',jsonb_build_object('score',v_momentum_score,'state',v_momentum->>'state','movement',v_momentum->'movement'),
    'decision_pressure',jsonb_build_object('state',v_pressure->>'state','observed_days_in_stage',v_pressure->'observed_days_in_stage','observed_review_due_at',v_pressure->'observed_review_due_at'),
    'access',jsonb_build_object('direct_score',v_direct,'introduction_score',v_intro,'best_direct_route',v_direct_ctx->'best_route','best_introduction_route',v_intro_ctx->'best_route'),
    'negotiation',jsonb_build_object('score',v_readiness_score,'state',v_readiness->>'state','gaps',v_readiness->'gaps','next_step',v_negotiation_next),
    'deal_advantage',jsonb_build_object('score',v_advantage,'state',case when v_advantage>=78 then 'strong_operating_position' when v_advantage>=62 then 'balanced_with_edges' when v_advantage>=48 then 'exposed_but_workable' else 'weak_recorded_position' end,'edges',v_edges,'exposures',v_exposures,'unknowns',jsonb_build_array('external_competitor_activity_unless_explicitly_recorded','negotiation_power_not_inferred_from_score')),
    'next_best_move',v_next_move,'next_control_fix',v_control_fix,
    'deep_detail',jsonb_build_object('decision_map',true,'owner_candidates',true,'club_account',true,'negotiation_brief',true,'deal_advantage_detail',true,'open_work',true),
    'truth_contract',jsonb_build_object('probability','recorded estimate only','control','process quality, not success probability','momentum','recorded movement, not outcome probability','advantage','operating position, not bargaining power','competition','unknown unless explicitly recorded')
  );
end;
$$;

revoke all on function public.platform_server_deal_war_room_instant(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_deal_war_room_instant(uuid,uuid) to service_role;
;
