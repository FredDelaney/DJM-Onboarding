create or replace function public.platform_server_player_service_card(p_tenant_id uuid,p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_p public.players%rowtype;
  v_active_deals integer:=0;
  v_max_deal_probability integer:=0;
  v_market_matches integer:=0;
  v_active_opps integer:=0;
  v_open_requests integer:=0;
  v_overdue_requests integer:=0;
  v_authority integer:=0;
  v_docs integer:=0;
  v_open_tasks integer:=0;
  v_overdue_tasks integer:=0;
  v_contract_days integer:=null;
  v_action_days integer:=null;
  v_market_trigger text:='none';
  v_coverage_state text;
  v_service_state text;
  v_service_score integer:=100;
  v_priority_score integer:=0;
  v_service_gaps jsonb:='[]'::jsonb;
  v_preparation_gaps jsonb:='[]'::jsonb;
  v_next_service jsonb;
  v_next_control jsonb:=null;
  v_next_preparation jsonb:=null;
  v_request_items jsonb:='[]'::jsonb;
  v_deal_items jsonb:='[]'::jsonb;
begin
  select * into v_p from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found_for_tenant'; end if;

  if v_p.contract_expiry is not null then v_contract_days:=v_p.contract_expiry-current_date; end if;
  if v_p.next_action_due is not null then v_action_days:=v_p.next_action_due-current_date; end if;

  select count(*)::integer,coalesce(max(coalesce(d.probability,d.manual_probability,d.model_probability,0)),0)::integer,
         coalesce(jsonb_agg(jsonb_build_object('deal_room_id',d.id,'title',d.title,'stage',d.stage,'probability',coalesce(d.probability,d.manual_probability,d.model_probability,0),'organisation_id',d.organisation_id,'expected_commission',d.expected_commission,'currency',d.currency,'next_action_text',d.next_action_text,'next_action_at',d.next_action_at) order by d.expected_commission desc nulls last,d.updated_at desc),'[]'::jsonb)
  into v_active_deals,v_max_deal_probability,v_deal_items
  from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id and d.status='active';

  select count(*)::integer into v_market_matches from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.player_id=p_player_id and pm.status in ('suggested','reviewing','shortlisted','pitched','active');
  select count(*)::integer into v_active_opps from public.player_opportunities po where po.tenant_id=p_tenant_id and po.player_id=p_player_id and po.stage not in ('won','lost');
  select count(*)::integer,count(*) filter(where r.due_at is not null and r.due_at<now())::integer,
         coalesce(jsonb_agg(jsonb_build_object('request_id',r.id,'title',r.title,'request_type',r.request_type,'due_at',r.due_at,'assigned_to_user_id',r.assigned_to_user_id,'created_at',r.created_at) order by r.due_at nulls last,r.created_at) filter(where r.status='open'),'[]'::jsonb)
  into v_open_requests,v_overdue_requests,v_request_items
  from public.player_requests r where r.player_id=p_player_id and r.status='open';
  select count(*)::integer into v_authority from public.player_agreements a where a.player_id=p_player_id and a.status='active' and a.agreement_type in ('representation','mandate','placement_authorisation') and (a.end_date is null or a.end_date>=current_date);
  select count(*)::integer into v_docs from public.player_documents pd where pd.player_id=p_player_id and (pd.expires_at is null or pd.expires_at>=current_date);
  select count(*)::integer,count(*) filter(where t.due_at is not null and t.due_at<now())::integer into v_open_tasks,v_overdue_tasks from djm_os.tasks t where t.tenant_id=p_tenant_id and t.player_id=p_player_id and t.status='open';

  v_market_trigger:=case
    when v_p.football_status='free_agent' or v_p.contract_status='free_agent' then 'free_agent'
    when v_contract_days is not null and v_contract_days<=90 then 'contract_critical_window'
    when v_contract_days is not null and v_contract_days<=180 then 'contract_planning_window'
    when v_p.agency_priority='urgent' then 'agency_urgent'
    else 'no_immediate_market_trigger' end;
  v_coverage_state:=case
    when v_market_trigger in ('free_agent','contract_critical_window','contract_planning_window','agency_urgent') and v_active_deals>0 then 'active_deal_coverage'
    when v_market_trigger in ('free_agent','contract_critical_window','contract_planning_window','agency_urgent') and (v_market_matches>0 or v_active_opps>0) then 'market_search_active'
    when v_market_trigger in ('free_agent','contract_critical_window','contract_planning_window','agency_urgent') then 'market_coverage_gap'
    when v_active_deals>0 then 'active_deal'
    when v_market_matches>0 or v_active_opps>0 then 'market_activity_recorded'
    else 'stable_no_immediate_market_trigger' end;

  if v_p.primary_staff_user_id is null then v_service_gaps:=v_service_gaps||jsonb_build_array('primary_staff_not_assigned'); v_service_score:=v_service_score-12; end if;
  if nullif(trim(v_p.next_action),'') is null or v_p.next_action_due is null then v_service_gaps:=v_service_gaps||jsonb_build_array('player_next_action_not_controlled'); v_service_score:=v_service_score-22;
  elsif v_p.next_action_due<current_date then v_service_gaps:=v_service_gaps||jsonb_build_array('player_next_action_overdue'); v_service_score:=v_service_score-25;
  elsif v_p.next_action_due=current_date then v_service_gaps:=v_service_gaps||jsonb_build_array('player_next_action_due_today'); v_service_score:=v_service_score-8; end if;
  if v_overdue_requests>0 then v_service_gaps:=v_service_gaps||jsonb_build_array('overdue_player_request'); v_service_score:=v_service_score-least(25,v_overdue_requests*10); end if;
  if v_overdue_tasks>0 then v_service_gaps:=v_service_gaps||jsonb_build_array('overdue_player_task'); v_service_score:=v_service_score-least(15,v_overdue_tasks*5); end if;
  if v_market_trigger='free_agent' and v_active_deals=0 then v_service_gaps:=v_service_gaps||jsonb_build_array('free_agent_without_active_deal'); v_service_score:=v_service_score-18; end if;
  if v_market_trigger='contract_critical_window' and v_active_deals=0 and v_market_matches=0 and v_active_opps=0 then v_service_gaps:=v_service_gaps||jsonb_build_array('contract_critical_without_market_coverage'); v_service_score:=v_service_score-20; end if;
  if v_authority=0 then v_preparation_gaps:=v_preparation_gaps||jsonb_build_array('active_authority_record_not_found_in_platform'); end if;
  if v_docs=0 then v_preparation_gaps:=v_preparation_gaps||jsonb_build_array('current_player_document_record_not_found'); end if;
  if v_p.verification_status is distinct from 'verified' then v_preparation_gaps:=v_preparation_gaps||jsonb_build_array('player_record_not_verified'); end if;
  v_service_score:=greatest(0,least(100,v_service_score));
  v_service_state:=case when v_service_score>=85 then 'controlled' when v_service_score>=70 then 'workable' when v_service_score>=50 then 'needs_attention' else 'service_risk' end;

  v_priority_score:=least(100,
    case v_p.agency_priority when 'urgent' then 28 when 'high' then 18 when 'normal' then 8 else 5 end
    + case v_market_trigger when 'free_agent' then 30 when 'contract_critical_window' then 28 when 'contract_planning_window' then 18 when 'agency_urgent' then 20 else 5 end
    + case when v_action_days is null then 15 when v_action_days<0 then 25 when v_action_days=0 then 18 when v_action_days<=2 then 10 else 2 end
    + case when v_overdue_requests>0 then 18 else 0 end
    + case when v_coverage_state='market_coverage_gap' then 20 when v_coverage_state='market_search_active' then 8 else 0 end
    + case when v_active_deals>0 then 15 else 0 end
    + case when v_max_deal_probability>=50 then 10 when v_max_deal_probability>0 then 5 else 0 end
  );

  v_next_service:=case
    when v_overdue_requests>0 then jsonb_build_object('move_type','resolve_player_request','priority','service','instruction','Resolve the overdue player request before adding lower-priority agency work.','success_condition','The player request is completed or deliberately dismissed with a reason.')
    when v_p.next_action_due is not null and v_p.next_action_due<=current_date then jsonb_build_object('move_type','execute_player_next_action','priority','service','instruction',coalesce(nullif(trim(v_p.next_action),''),'Set and execute the player next action.'),'success_condition','The player action is completed and a new next action is recorded if further work remains.')
    when v_market_trigger='free_agent' and v_active_deals=0 and v_market_matches=0 and v_active_opps=0 then jsonb_build_object('move_type','build_free_agent_market_plan','priority','career','instruction','Build immediate market coverage for the free agent: target clubs, routes, materials and next contact actions.','success_condition','At least one credible market route or active opportunity is recorded.')
    when v_market_trigger='free_agent' and v_active_deals=0 then jsonb_build_object('move_type','convert_market_activity_to_deal','priority','career','instruction','Turn the current free-agent market activity into a concrete club conversation or deliberately widen the search.','success_condition','An active deal/opportunity is created or the market plan is explicitly expanded.')
    when v_market_trigger='contract_critical_window' and v_active_deals=0 then jsonb_build_object('move_type','contract_strategy','priority','career','instruction','Agree the player contract strategy now: extension, exit, free-agency preparation or market process.','success_condition','A documented contract strategy and next action are recorded.')
    when v_market_trigger='contract_planning_window' and v_active_deals=0 then jsonb_build_object('move_type','contract_planning','priority','career','instruction','Review the contract horizon and decide whether to prepare an extension or market process.','success_condition','The player contract strategy is explicitly recorded.')
    when v_active_deals>0 then jsonb_build_object('move_type','protect_live_player_deal','priority','career','instruction','Protect the strongest live player transaction and keep the player-side next action current.','success_condition','The live deal advances or the player receives a clear updated plan.')
    else jsonb_build_object('move_type','maintain_player_plan','priority','service','instruction','Keep the player plan current and define the next meaningful career action.','success_condition','A current player next action is recorded.') end;

  v_next_control:=case
    when v_p.primary_staff_user_id is null then jsonb_build_object('fix_type','assign_primary_staff','instruction','Assign one accountable primary staff member to the player.','requires_human_input',true)
    when nullif(trim(v_p.next_action),'') is null or v_p.next_action_due is null then jsonb_build_object('fix_type','set_player_next_action','instruction','Set one concrete player next action and due date.','requires_human_input',true)
    else null end;
  v_next_preparation:=case
    when v_authority=0 then jsonb_build_object('fix_type','verify_authority_record','instruction','Confirm whether an active relevant representation/authority record should be recorded.','legal_warning','Absence from the platform is not proof that authority does not exist.')
    when v_docs=0 then jsonb_build_object('fix_type','assemble_player_documents','instruction','Record the current player documents that are actually available and relevant.')
    when v_p.verification_status is distinct from 'verified' then jsonb_build_object('fix_type','verify_player_record','instruction','Verify the player record before relying on it for external decisions.')
    else null end;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'player_id',p_player_id,'generated_at',now(),
    'player',jsonb_build_object('name',trim(concat_ws(' ',v_p.first_name,v_p.last_name)),'football_status',v_p.football_status,'contract_status',v_p.contract_status,'contract_expiry',v_p.contract_expiry,'agency_priority',v_p.agency_priority,'primary_staff_user_id',v_p.primary_staff_user_id,'next_action',v_p.next_action,'next_action_due',v_p.next_action_due),
    'service_control',jsonb_build_object('score',v_service_score,'state',v_service_state,'gaps',v_service_gaps,'open_tasks',v_open_tasks,'overdue_tasks',v_overdue_tasks,'open_player_requests',v_open_requests,'overdue_player_requests',v_overdue_requests),
    'career_timing',jsonb_build_object('market_trigger',v_market_trigger,'contract_days_remaining',v_contract_days,'next_action_days',v_action_days),
    'market_coverage',jsonb_build_object('state',v_coverage_state,'active_deals',v_active_deals,'highest_active_deal_probability',v_max_deal_probability,'recorded_market_matches',v_market_matches,'active_player_opportunities',v_active_opps,'deals',v_deal_items),
    'preparation',jsonb_build_object('gaps',v_preparation_gaps,'active_authority_records',v_authority,'current_document_records',v_docs,'verification_status',v_p.verification_status),
    'open_player_requests',v_request_items,'service_priority_score',v_priority_score,
    'next_service_move',v_next_service,'next_control_fix',v_next_control,'next_preparation_fix',v_next_preparation,
    'truth_contract',jsonb_build_object('service_score','Operational service-control score based on ownership, actions, requests and coverage. It is not a measure of agent quality or player satisfaction.','preparation','Authority/documents/verification are shown separately and do not reduce the service-control score.','market_coverage','Recorded deals, matches and opportunities only.','player_contact_frequency','Not scored because the current interaction model is not a reliable player communication ledger.')
  );
end;
$$;;
