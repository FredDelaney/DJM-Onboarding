create or replace function public.platform_server_prepare_scouting_mandate(
  p_tenant_id uuid,
  p_club_need_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_need djm_os.club_needs%rowtype;
  v_org djm_os.organisations%rowtype;
  v_matches integer:=0;
  v_title text;
  v_due timestamptz;
  v_key text;
  v_proposal platform.agency_action_proposals%rowtype;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','scout','operations') limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;

  select * into v_need from djm_os.club_needs n where n.id=p_club_need_id and n.tenant_id=p_tenant_id and n.status='active' and (n.expires_at is null or n.expires_at>=now());
  if not found then raise exception 'active_club_need_not_found'; end if;
  select * into v_org from djm_os.organisations o where o.id=v_need.organisation_id and o.tenant_id=p_tenant_id;
  if not found then raise exception 'organisation_not_found_for_tenant'; end if;
  select count(*) into v_matches from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.club_need_id=p_club_need_id and pm.status in ('suggested','reviewing','shortlisted','pitched','active');
  if v_matches>0 then return jsonb_build_object('status','no_mandate_required','club_need_id',p_club_need_id,'reason','At least one recorded player match already exists for this need.','recorded_candidates',v_matches); end if;

  v_title:='Scout '||coalesce(nullif(trim(v_need.title),''),nullif(trim(v_need.position),''),'player profile')||' for '||v_org.name;
  v_due:=case
    when v_need.expires_at is null then now()+interval '2 days'
    when v_need.expires_at<=now()+interval '1 day' then now()+interval '4 hours'
    else least(v_need.expires_at-interval '1 day',now()+interval '2 days')
  end;
  v_key:='scouting_mandate:'||p_club_need_id::text||':'||v_need.updated_at::text||':baseline:'||v_matches::text;

  insert into platform.agency_action_proposals(
    tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key,expires_at,undo_supported
  ) values(
    p_tenant_id,'scouting_mandate:'||p_club_need_id::text,'Scouting mandate','create_search_task','club_need',p_club_need_id,
    'low','confirm','proposed',v_title,
    'Create reversible internal scouting work for a recorded club need that currently has no roster match.',
    jsonb_build_object(
      'title',v_title,'due_at',v_due,'priority',case when v_need.need_type='confirmed' then greatest(v_need.priority,4) else greatest(v_need.priority,3) end,
      'organisation_id',v_need.organisation_id,'club_need_id',p_club_need_id,'search_move_type','scouting_mandate','baseline_candidate_matches',v_matches,
      'need_type',v_need.need_type,'position',v_need.position,'preferred_foot',v_need.preferred_foot,'min_age',v_need.min_age,'max_age',v_need.max_age,'min_height_cm',v_need.min_height_cm,
      'transfer_type',v_need.transfer_type,'transfer_budget',v_need.transfer_budget,'salary_budget',v_need.salary_budget,'currency',v_need.currency,'expires_at',v_need.expires_at,
      'success_condition','At least one new recorded player match is created for this club need. Completing the scouting task alone is not downstream success.'
    ),
    p_actor_user_id,v_key,now()+interval '24 hours',true
  )
  on conflict (tenant_id,idempotency_key) where status in ('proposed','needs_input','applied') do update set updated_at=now()
  returning * into v_proposal;

  return jsonb_build_object('status',v_proposal.status,'proposal_id',v_proposal.id,'action_type',v_proposal.action_type,'search_move_type','scouting_mandate','payload',v_proposal.proposed_payload,'external_side_effect',false,'undo_supported',true);
end;
$function$;

create or replace function platform.evaluate_player_service_outcome_v1(p_proposal_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_p platform.agency_action_proposals%rowtype; v_c platform.agency_commitments%rowtype; v_player public.players%rowtype;
  v_move text; v_operational text:='pending'; v_downstream text:='pending'; v_key text:='player_service_outcome_pending';
  v_window_end timestamptz; v_first timestamptz:=null; v_active_deals integer:=0; v_matches integer:=0; v_opps integer:=0;
  v_base_deals integer:=0; v_base_matches integer:=0; v_base_opps integer:=0; v_deal_activity integer:=0; v_evidence jsonb;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id; if not found then raise exception 'proposal_not_found'; end if;
  v_window_end:=coalesce(v_p.applied_at,v_p.created_at)+interval '14 days'; v_move:=v_p.proposed_payload->>'service_move_type';
  if v_p.status='undone' then v_operational:='cancelled';v_downstream:='cancelled';v_key:='action_undone';
  elsif v_p.status='failed' then v_operational:='failed';v_downstream:='not_applicable';v_key:='execution_failed';
  elsif v_p.status<>'applied' then v_operational:='pending';v_downstream:='not_applicable';v_key:='not_applied';
  else
    select * into v_c from platform.agency_commitments c where c.proposal_id=v_p.id;
    v_operational:=case when v_c.status='completed' then 'completed' when v_c.status='cancelled' then 'cancelled' else 'pending' end;
    select * into v_player from public.players p where p.id=v_p.target_id and p.tenant_id=v_p.tenant_id;
    begin v_base_deals:=coalesce((v_p.proposed_payload->>'baseline_active_deals')::integer,0); exception when others then v_base_deals:=0; end;
    begin v_base_matches:=coalesce((v_p.proposed_payload->>'baseline_market_matches')::integer,0); exception when others then v_base_matches:=0; end;
    begin v_base_opps:=coalesce((v_p.proposed_payload->>'baseline_active_opportunities')::integer,0); exception when others then v_base_opps:=0; end;
    select count(*) into v_active_deals from djm_os.deal_rooms d where d.tenant_id=v_p.tenant_id and d.player_id=v_p.target_id and d.status='active';
    select count(*) into v_matches from djm_os.player_matches pm where pm.tenant_id=v_p.tenant_id and pm.player_id=v_p.target_id and pm.status in ('suggested','reviewing','shortlisted','pitched','active');
    select count(*) into v_opps from public.player_opportunities po where po.tenant_id=v_p.tenant_id and po.player_id=v_p.target_id and po.stage not in ('won','lost');
    select count(*) into v_deal_activity from djm_os.deal_rooms d where d.tenant_id=v_p.tenant_id and d.player_id=v_p.target_id and d.status='active' and coalesce(d.last_meaningful_at,d.updated_at)>coalesce(v_p.applied_at,v_p.created_at);
    if v_move in ('build_free_agent_market_plan','convert_market_activity_to_deal') and (v_active_deals>v_base_deals or v_matches>v_base_matches or v_opps>v_base_opps) then v_downstream:='positive';v_key:='player_market_coverage_increased';v_first:=now();
    elsif v_move='protect_live_player_deal' and v_deal_activity>0 then v_downstream:='positive';v_key:='live_player_deal_activity_after_service_move';v_first:=now();
    elsif v_move in ('execute_player_next_action','contract_strategy','contract_planning','maintain_player_plan') and ((v_player.next_action is distinct from v_p.proposed_payload->>'baseline_next_action') or (v_player.next_action_due is not null and v_player.next_action_due>coalesce(nullif(v_p.proposed_payload->>'baseline_next_action_due','')::date,current_date))) then v_downstream:='positive';v_key:='player_plan_advanced';v_first:=now();
    elsif v_operational='completed' then v_downstream:='neutral';v_key:='player_service_task_completed_without_plan_change';
    elsif now()>=v_window_end then v_downstream:='neutral';v_key:='player_service_outcome_not_observed_in_window';
    else v_downstream:='pending';v_key:='player_service_outcome_pending'; end if;
  end if;
  v_evidence:=jsonb_build_object('player_id',v_p.target_id,'service_move_type',v_move,'task_id',v_c.task_id,'commitment_status',v_c.status,'baseline_active_deals',v_base_deals,'current_active_deals',v_active_deals,'baseline_market_matches',v_base_matches,'current_market_matches',v_matches,'baseline_active_opportunities',v_base_opps,'current_active_opportunities',v_opps,'success_definition','Player service work succeeds only when the player plan, market coverage or live-deal movement changes. Completing the task alone is not downstream success.');
  insert into platform.agency_action_outcomes(tenant_id,proposal_id,action_type,operational_state,downstream_state,outcome_key,evaluation_window_end,first_observed_at,last_evaluated_at,evidence)
  values(v_p.tenant_id,v_p.id,v_p.action_type,v_operational,v_downstream,v_key,v_window_end,v_first,now(),v_evidence)
  on conflict (proposal_id) do update set operational_state=excluded.operational_state,downstream_state=excluded.downstream_state,outcome_key=excluded.outcome_key,evaluation_window_end=excluded.evaluation_window_end,first_observed_at=coalesce(platform.agency_action_outcomes.first_observed_at,excluded.first_observed_at),last_evaluated_at=now(),evidence=excluded.evidence,updated_at=now()
  returning first_observed_at into v_first;
  return jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'service_move_type',v_move,'operational_state',v_operational,'downstream_state',v_downstream,'outcome_key',v_key,'evaluation_window_end',v_window_end,'first_observed_at',v_first,'evidence',v_evidence);
end;
$function$;

create or replace function platform.evaluate_career_strategy_outcome_v1(p_proposal_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_p platform.agency_action_proposals%rowtype; v_c platform.agency_commitments%rowtype; v_s platform.player_career_strategies%rowtype;
  v_type text; v_alignment jsonb; v_state text; v_operational text:='pending'; v_downstream text:='pending'; v_key text:='career_strategy_outcome_pending';
  v_window_end timestamptz; v_first timestamptz:=null; v_base_deals integer:=0; v_base_matches integer:=0; v_base_opps integer:=0;
  v_active_deals integer:=0; v_matches integer:=0; v_opps integer:=0; v_base_version integer:=0; v_evidence jsonb;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id; if not found then raise exception 'proposal_not_found'; end if;
  v_type:=v_p.proposed_payload->>'strategy_action_type'; v_window_end:=coalesce(v_p.applied_at,v_p.created_at)+interval '14 days';
  if v_p.status='undone' then v_operational:='cancelled';v_downstream:='cancelled';v_key:='action_undone';
  elsif v_p.status='failed' then v_operational:='failed';v_downstream:='not_applicable';v_key:='execution_failed';
  elsif v_p.status<>'applied' then v_operational:='pending';v_downstream:='not_applicable';v_key:='not_applied';
  else
    select * into v_c from platform.agency_commitments c where c.proposal_id=v_p.id;
    v_operational:=case when v_c.status='completed' then 'completed' when v_c.status='cancelled' then 'cancelled' else 'pending' end;
    begin v_base_deals:=coalesce((v_p.proposed_payload->>'baseline_active_deals')::integer,0); exception when others then v_base_deals:=0; end;
    begin v_base_matches:=coalesce((v_p.proposed_payload->>'baseline_market_matches')::integer,0); exception when others then v_base_matches:=0; end;
    begin v_base_opps:=coalesce((v_p.proposed_payload->>'baseline_active_opportunities')::integer,0); exception when others then v_base_opps:=0; end;
    begin v_base_version:=coalesce((v_p.proposed_payload->>'baseline_strategy_version')::integer,0); exception when others then v_base_version:=0; end;
    select count(*) into v_active_deals from djm_os.deal_rooms d where d.tenant_id=v_p.tenant_id and d.player_id=v_p.target_id and d.status='active';
    select count(*) into v_matches from djm_os.player_matches pm where pm.tenant_id=v_p.tenant_id and pm.player_id=v_p.target_id and pm.status in ('suggested','reviewing','shortlisted','pitched','active');
    select count(*) into v_opps from public.player_opportunities po where po.tenant_id=v_p.tenant_id and po.player_id=v_p.target_id and po.stage not in ('won','lost');
    v_alignment:=public.platform_server_player_career_alignment(v_p.tenant_id,v_p.target_id); v_state:=v_alignment->>'alignment_state';
    select * into v_s from platform.player_career_strategies s where s.tenant_id=v_p.tenant_id and s.player_id=v_p.target_id and s.status in ('draft','approved') order by s.version desc limit 1;
    if v_type='activate_market_plan' and (v_active_deals>v_base_deals or v_matches>v_base_matches or v_opps>v_base_opps) then v_downstream:='positive';v_key:='career_market_coverage_increased';v_first:=now();
    elsif v_type='activate_market_plan' and coalesce(v_p.proposed_payload->>'baseline_alignment_state','')='strategy_execution_gap' and v_state<>'strategy_execution_gap' then v_downstream:='positive';v_key:='career_execution_gap_resolved';v_first:=now();
    elsif v_type='review_market_exception' and coalesce(v_p.proposed_payload->>'baseline_alignment_state','') in ('strategic_conflict','market_exception_review') and v_state not in ('strategic_conflict','market_exception_review') then v_downstream:='positive';v_key:='career_market_exception_resolved';v_first:=now();
    elsif v_type='review_career_strategy' and coalesce(v_s.version,0)>v_base_version and v_s.status='approved' and v_s.confirmation_status='confirmed' and (v_s.review_due_at is null or v_s.review_due_at>=current_date) then v_downstream:='positive';v_key:='career_strategy_reviewed_and_current';v_first:=now();
    elsif v_operational='completed' then v_downstream:='neutral';v_key:='career_strategy_task_completed_without_strategy_or_execution_change';
    elsif now()>=v_window_end then v_downstream:='neutral';v_key:='career_strategy_outcome_not_observed_in_window';
    else v_downstream:='pending';v_key:='career_strategy_outcome_pending'; end if;
  end if;
  v_evidence:=jsonb_build_object('player_id',v_p.target_id,'strategy_action_type',v_type,'task_id',v_c.task_id,'commitment_status',v_c.status,'baseline_alignment_state',v_p.proposed_payload->>'baseline_alignment_state','current_alignment_state',v_state,'baseline_active_deals',v_base_deals,'current_active_deals',v_active_deals,'baseline_market_matches',v_base_matches,'current_market_matches',v_matches,'baseline_active_opportunities',v_base_opps,'current_active_opportunities',v_opps,'baseline_strategy_version',v_base_version,'current_strategy_version',coalesce(v_s.version,0),'current_strategy_status',v_s.status,'current_confirmation_status',v_s.confirmation_status,'success_definition','Career strategy work succeeds only when market execution, a recorded exception/conflict, or the player-confirmed current strategy materially changes. Task completion alone is not downstream success.');
  insert into platform.agency_action_outcomes(tenant_id,proposal_id,action_type,operational_state,downstream_state,outcome_key,evaluation_window_end,first_observed_at,last_evaluated_at,evidence)
  values(v_p.tenant_id,v_p.id,v_p.action_type,v_operational,v_downstream,v_key,v_window_end,v_first,now(),v_evidence)
  on conflict (proposal_id) do update set operational_state=excluded.operational_state,downstream_state=excluded.downstream_state,outcome_key=excluded.outcome_key,evaluation_window_end=excluded.evaluation_window_end,first_observed_at=coalesce(platform.agency_action_outcomes.first_observed_at,excluded.first_observed_at),last_evaluated_at=now(),evidence=excluded.evidence,updated_at=now()
  returning first_observed_at into v_first;
  return jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'strategy_action_type',v_type,'operational_state',v_operational,'downstream_state',v_downstream,'outcome_key',v_key,'evaluation_window_end',v_window_end,'first_observed_at',v_first,'evidence',v_evidence);
end;
$function$;

create or replace function platform.evaluate_scouting_mandate_outcome_v1(p_proposal_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_p platform.agency_action_proposals%rowtype; v_c platform.agency_commitments%rowtype; v_need djm_os.club_needs%rowtype;
  v_operational text:='pending'; v_downstream text:='pending'; v_key text:='scouting_mandate_outcome_pending';
  v_base integer:=0; v_current integer:=0; v_window_end timestamptz; v_first timestamptz:=null; v_evidence jsonb;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id; if not found then raise exception 'proposal_not_found'; end if;
  select * into v_need from djm_os.club_needs n where n.id=v_p.target_id and n.tenant_id=v_p.tenant_id;
  begin v_base:=coalesce((v_p.proposed_payload->>'baseline_candidate_matches')::integer,0); exception when others then v_base:=0; end;
  v_window_end:=least(coalesce(v_need.expires_at,coalesce(v_p.applied_at,v_p.created_at)+interval '14 days'),coalesce(v_p.applied_at,v_p.created_at)+interval '14 days');
  if v_p.status='undone' then v_operational:='cancelled';v_downstream:='cancelled';v_key:='action_undone';
  elsif v_p.status='failed' then v_operational:='failed';v_downstream:='not_applicable';v_key:='execution_failed';
  elsif v_p.status<>'applied' then v_operational:='pending';v_downstream:='not_applicable';v_key:='not_applied';
  else
    select * into v_c from platform.agency_commitments c where c.proposal_id=v_p.id;
    v_operational:=case when v_c.status='completed' then 'completed' when v_c.status='cancelled' then 'cancelled' else 'pending' end;
    select count(*) into v_current from djm_os.player_matches pm where pm.tenant_id=v_p.tenant_id and pm.club_need_id=v_p.target_id and pm.status in ('suggested','reviewing','shortlisted','pitched','active');
    if v_current>v_base then v_downstream:='positive';v_key:='scouting_mandate_candidate_created';v_first:=now();
    elsif v_operational='completed' then v_downstream:='neutral';v_key:='scouting_task_completed_without_candidate';
    elsif now()>=v_window_end then v_downstream:='neutral';v_key:='scouting_mandate_window_closed_without_candidate';
    else v_downstream:='pending';v_key:='scouting_mandate_outcome_pending'; end if;
  end if;
  v_evidence:=jsonb_build_object('club_need_id',v_p.target_id,'task_id',v_c.task_id,'commitment_status',v_c.status,'baseline_candidate_matches',v_base,'current_candidate_matches',v_current,'need_status',v_need.status,'need_expires_at',v_need.expires_at,'success_definition','A scouting mandate succeeds only when the club need gains at least one new recorded player match. Completing the task alone is not downstream success.');
  insert into platform.agency_action_outcomes(tenant_id,proposal_id,action_type,operational_state,downstream_state,outcome_key,evaluation_window_end,first_observed_at,last_evaluated_at,evidence)
  values(v_p.tenant_id,v_p.id,v_p.action_type,v_operational,v_downstream,v_key,v_window_end,v_first,now(),v_evidence)
  on conflict (proposal_id) do update set operational_state=excluded.operational_state,downstream_state=excluded.downstream_state,outcome_key=excluded.outcome_key,evaluation_window_end=excluded.evaluation_window_end,first_observed_at=coalesce(platform.agency_action_outcomes.first_observed_at,excluded.first_observed_at),last_evaluated_at=now(),evidence=excluded.evidence,updated_at=now()
  returning first_observed_at into v_first;
  return jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'search_move_type','scouting_mandate','operational_state',v_operational,'downstream_state',v_downstream,'outcome_key',v_key,'evaluation_window_end',v_window_end,'first_observed_at',v_first,'evidence',v_evidence);
end;
$function$;

create or replace function platform.evaluate_agency_action_outcome(p_proposal_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_p platform.agency_action_proposals%rowtype;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_p.action_type='create_player_service_task' then return platform.evaluate_player_service_outcome_v1(p_proposal_id); end if;
  if v_p.action_type='create_career_strategy_task' then return platform.evaluate_career_strategy_outcome_v1(p_proposal_id); end if;
  if v_p.action_type='create_search_task' and v_p.proposed_payload->>'search_move_type'='scouting_mandate' then return platform.evaluate_scouting_mandate_outcome_v1(p_proposal_id); end if;
  return platform.evaluate_agency_action_outcome_core_v7(p_proposal_id);
end;
$function$;

revoke all on function public.platform_server_prepare_scouting_mandate(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_prepare_scouting_mandate(uuid,uuid,uuid) to service_role;;
