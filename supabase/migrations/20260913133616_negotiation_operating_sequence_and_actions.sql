create or replace function public.platform_server_negotiation_sequence(p_tenant_id uuid, p_deal_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_r jsonb;
  v_steps jsonb := '[]'::jsonb;
  v_step integer := 0;
  v_score integer := 0;
  v_rep integer := 0;
  v_contract integer := 0;
  v_reg integer := 0;
  v_terms integer := 0;
  v_docs integer := 0;
  v_gaps jsonb := '[]'::jsonb;
  v_blocking integer := 0;
begin
  v_r := public.platform_server_negotiation_readiness(p_tenant_id,p_deal_room_id);
  if coalesce((v_r->>'available')::boolean,false)=false then
    return jsonb_build_object('tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'available',false,'steps','[]'::jsonb,'next_step',null);
  end if;
  begin v_score:=coalesce((v_r->>'score')::integer,0); exception when others then v_score:=0; end;
  begin v_rep:=coalesce((v_r->'factors'->'representation_record'->>'score')::integer,0); exception when others then v_rep:=0; end;
  begin v_contract:=coalesce((v_r->'factors'->'player_contract_position'->>'score')::integer,0); exception when others then v_contract:=0; end;
  begin v_reg:=coalesce((v_r->'factors'->'registration_readiness'->>'score')::integer,0); exception when others then v_reg:=0; end;
  begin v_terms:=coalesce((v_r->'factors'->'commercial_terms_clarity'->>'score')::integer,0); exception when others then v_terms:=0; end;
  begin v_docs:=coalesce((v_r->'factors'->'document_readiness'->>'score')::integer,0); exception when others then v_docs:=0; end;
  v_gaps:=coalesce(v_r->'gaps','[]'::jsonb);

  if v_rep<70 then
    v_step:=v_step+1; v_blocking:=v_blocking+1;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'step',v_step,'step_type','verify_authority_record','priority','blocking','executable',true,
      'target_gap','representation_or_mandate_record_not_confirmed_in_platform',
      'instruction','Confirm and record the relevant representation, mandate or placement-authority record, including scope and dates where applicable.',
      'success_condition','The platform contains an active relevant authority record or the uncertainty is explicitly resolved.',
      'legal_warning','This is a record-completeness check, not a legal conclusion about authority or enforceability.'
    ));
  end if;

  if v_contract<70 then
    v_step:=v_step+1; v_blocking:=v_blocking+1;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'step',v_step,'step_type','verify_player_contract_position','priority','blocking','executable',true,
      'target_gap','player_contract_position_not_sufficiently_recorded',
      'instruction','Verify the player contract position, current club and relevant expiry or free-agent status before negotiating transaction terms.',
      'success_condition','The recorded contract position is sufficiently clear for internal deal preparation.'
    ));
  end if;

  if v_reg<65 then
    v_step:=v_step+1; v_blocking:=v_blocking+1;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'step',v_step,'step_type','verify_registration_case','priority','blocking','executable',true,
      'target_gap','registration_case_requires_verification',
      'instruction','Verify the material registration, passport and foreign-player constraints relevant to this move.',
      'success_condition','The registration readiness signal reaches the normal-action threshold or the uncertainty is explicitly documented.',
      'legal_warning','Internal registration readiness is not a legal eligibility determination.'
    ));
  end if;

  if v_terms<80 then
    v_step:=v_step+1; v_blocking:=v_blocking+1;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'step',v_step,'step_type','complete_commercial_terms','priority','commercial','executable',true,
      'target_gap','commercial_terms_incomplete',
      'instruction','Complete the material transaction terms that are known or establish which terms still require club/player confirmation.',
      'success_condition','Fee or release position, salary basis and other material recorded terms are sufficiently clear for the current negotiation stage.'
    ));
  end if;

  if v_docs<70 then
    v_step:=v_step+1;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'step',v_step,'step_type','assemble_document_pack','priority','preparation','executable',true,
      'target_gap','no_player_documents_recorded_for_deal_preparation',
      'instruction','Assemble and record the transaction-relevant player documents that are actually available and appropriate to share.',
      'success_condition','The platform records a usable, current document set for the transaction stage.',
      'warning','Document presence does not certify that every legal or registration document required by the transaction is present.'
    ));
  end if;

  v_step:=v_step+1;
  v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
    'step',v_step,'step_type','prepare_negotiation_brief','priority','decision','executable',(v_blocking=0),
    'blocked_by_count',v_blocking,
    'instruction','Prepare the internal negotiation brief: objectives, known terms, unresolved points, decision-maker route, concessions and walk-away questions.',
    'success_condition','The agent has one current internal brief that separates confirmed terms, assumptions, unknowns and decisions required.'
  ));

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'available',true,
    'readiness_score',v_score,'readiness_state',v_r->>'state','blocking_gap_count',v_blocking,
    'steps',v_steps,
    'next_step',(select x.value from jsonb_array_elements(v_steps) x where coalesce((x.value->>'executable')::boolean,false)=true order by (x.value->>'step')::integer limit 1),
    'principle','Preparation steps close recorded uncertainty in dependency order. Completing a task is not evidence that the underlying negotiation gap is resolved.'
  );
end;
$$;

create or replace function public.platform_server_prepare_negotiation_next_step(
  p_tenant_id uuid,
  p_deal_room_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_seq jsonb;
  v_step jsonb;
  v_readiness jsonb;
  v_deal djm_os.deal_rooms%rowtype;
  v_proposal platform.agency_action_proposals%rowtype;
  v_key text;
  v_title text;
  v_step_type text;
  v_target_gap text;
begin
  select m.role into v_role
  from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active'
    and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;

  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id and d.status='active';
  if not found then raise exception 'active_deal_not_found'; end if;

  v_seq:=public.platform_server_negotiation_sequence(p_tenant_id,p_deal_room_id);
  v_step:=v_seq->'next_step';
  if v_step is null or v_step='null'::jsonb then raise exception 'no_executable_negotiation_step'; end if;
  v_step_type:=v_step->>'step_type';
  v_target_gap:=v_step->>'target_gap';
  v_readiness:=public.platform_server_negotiation_readiness(p_tenant_id,p_deal_room_id);
  v_title:=case v_step_type
    when 'verify_authority_record' then 'Verify authority record: '
    when 'verify_player_contract_position' then 'Verify player contract position: '
    when 'verify_registration_case' then 'Verify registration case: '
    when 'complete_commercial_terms' then 'Complete commercial terms: '
    when 'assemble_document_pack' then 'Assemble transaction documents: '
    when 'prepare_negotiation_brief' then 'Prepare negotiation brief: '
    else 'Prepare negotiation: ' end || v_deal.title;
  v_key:='negotiation:'||p_deal_room_id::text||':'||v_step_type||':'||coalesce((v_readiness->>'score'),'0');

  select * into v_proposal from platform.agency_action_proposals
  where tenant_id=p_tenant_id and idempotency_key=v_key and status in ('proposed','applied')
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('proposal_id',v_proposal.id,'status',v_proposal.status,'duplicate',true,'action_type',v_proposal.action_type,'step_type',v_step_type);
  end if;

  insert into platform.agency_action_proposals(
    tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,
    proposed_payload,requested_by,idempotency_key,expires_at,undo_supported
  ) values(
    p_tenant_id,'negotiation:'||p_deal_room_id::text,'Negotiation preparation','create_negotiation_task','deal_room',p_deal_room_id,
    'low','confirm','proposed',v_title,
    'Close the highest-priority recorded negotiation-preparation gap before advancing to later preparation steps.',
    jsonb_build_object(
      'title',v_title,'due_at',now()+interval '1 day','priority',case when v_step->>'priority'='blocking' then 5 else 4 end,
      'deal_room_id',p_deal_room_id,'organisation_id',v_deal.organisation_id,'player_id',v_deal.player_id,'club_need_id',v_deal.club_need_id,
      'negotiation_step_type',v_step_type,'target_gap',v_target_gap,'instruction',v_step->>'instruction',
      'baseline_negotiation_readiness',v_readiness,'baseline_score',coalesce((v_readiness->>'score')::integer,0),
      'success_condition',v_step->>'success_condition'
    ),
    p_actor_user_id,v_key,now()+interval '24 hours',true
  ) returning * into v_proposal;

  return jsonb_build_object(
    'proposal_id',v_proposal.id,'status',v_proposal.status,'duplicate',false,'action_type',v_proposal.action_type,
    'step_type',v_step_type,'target_gap',v_target_gap,'title',v_proposal.title,'rationale',v_proposal.rationale,
    'payload',v_proposal.proposed_payload,'risk_level',v_proposal.risk_level,'approval_mode',v_proposal.approval_mode,
    'external_side_effect',false,'selected_from_live_negotiation_sequence',true
  );
end;
$$;

create or replace function platform.sync_commitment_from_proposal()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_task djm_os.tasks%rowtype;
  v_status text;
  v_task_actions text[]:=array[
    'create_search_task','create_player_task','create_relationship_task','create_verification_task','create_introduction_task',
    'create_deal_blocker_task','create_deal_decision_task','create_negotiation_task'
  ];
begin
  if new.action_type=any(v_task_actions) and new.status='applied' and new.result_target_id is not null then
    select * into v_task from djm_os.tasks where id=new.result_target_id and tenant_id=new.tenant_id;
    if found then
      v_status:=case when v_task.status='completed' then 'completed' when v_task.due_at is not null and v_task.due_at<now() then 'overdue' else 'active' end;
      insert into platform.agency_commitments(tenant_id,proposal_id,command_id,task_id,owner_user_id,status,due_at,completed_at,metadata)
      values(new.tenant_id,new.id,new.command_id,v_task.id,coalesce(new.approved_by,new.requested_by),v_status,v_task.due_at,v_task.completed_at,
        jsonb_build_object(
          'action_type',new.action_type,'source','agency_os','target_type',new.target_type,'target_id',new.target_id,
          'task_title',v_task.title,'task_source',v_task.source,'verification_task',new.action_type='create_verification_task',
          'deal_control_task',new.action_type in ('create_deal_blocker_task','create_deal_decision_task'),
          'negotiation_task',new.action_type='create_negotiation_task',
          'deal_room_id',new.proposed_payload->>'deal_room_id',
          'deal_step_type',new.proposed_payload->>'deal_step_type',
          'negotiation_step_type',new.proposed_payload->>'negotiation_step_type',
          'target_gap',new.proposed_payload->>'target_gap'
        ))
      on conflict (proposal_id) do update set
        task_id=excluded.task_id,owner_user_id=excluded.owner_user_id,status=excluded.status,due_at=excluded.due_at,completed_at=excluded.completed_at,
        metadata=platform.agency_commitments.metadata||excluded.metadata,updated_at=now();
    end if;
  elsif new.action_type=any(v_task_actions) and new.status='undone' then
    update platform.agency_commitments
    set status='cancelled',updated_at=now(),metadata=metadata||jsonb_build_object('cancelled_by_undo',true,'cancelled_at',now())
    where proposal_id=new.id and status<>'cancelled';
  end if;
  return new;
end;
$$;

create or replace function public.platform_server_execute_agency_action(p_proposal_id uuid, p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_result_id uuid;
  v_due timestamptz;
  v_priority integer;
  v_title text;
  v_person_id uuid;
  v_org_id uuid;
  v_player_id uuid;
  v_need_id uuid;
  v_owner uuid;
  v_task_type text;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id for update;
  if not found then raise exception 'proposal_not_found'; end if;

  if v_p.action_type not in ('create_deal_blocker_task','create_deal_decision_task','assign_deal_owner','create_negotiation_task') then
    return public.platform_server_execute_agency_action_core_v6(p_proposal_id,p_actor_user_id);
  end if;

  select m.role into v_role
  from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=v_p.tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','scout','operations') limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;
  if v_p.status='applied' then return jsonb_build_object('proposal_id',v_p.id,'status','applied','duplicate',true,'verified',coalesce((v_p.verification_json->>'verified')::boolean,false)); end if;
  if v_p.status<>'proposed' then raise exception 'proposal_not_executable:%',v_p.status; end if;
  if v_p.expires_at<=now() then update platform.agency_action_proposals set status='expired',updated_at=now() where id=v_p.id; raise exception 'proposal_expired'; end if;

  if v_p.action_type in ('create_deal_blocker_task','create_deal_decision_task','create_negotiation_task') then
    v_title:=nullif(trim(v_p.proposed_payload->>'title'),'');
    if v_title is null then raise exception 'task_title_required'; end if;
    begin v_due:=nullif(v_p.proposed_payload->>'due_at','')::timestamptz; exception when others then raise exception 'invalid_due_at'; end;
    if v_due is null then v_due:=now()+interval '1 day'; end if;
    v_priority:=greatest(1,least(coalesce(nullif(v_p.proposed_payload->>'priority','')::integer,4),5));
    begin v_person_id:=nullif(v_p.proposed_payload->>'person_id','')::uuid; exception when others then v_person_id:=null; end;
    begin v_org_id:=nullif(v_p.proposed_payload->>'organisation_id','')::uuid; exception when others then v_org_id:=null; end;
    begin v_player_id:=nullif(v_p.proposed_payload->>'player_id','')::uuid; exception when others then v_player_id:=null; end;
    begin v_need_id:=nullif(v_p.proposed_payload->>'club_need_id','')::uuid; exception when others then v_need_id:=null; end;
    v_task_type:=case when v_p.action_type='create_negotiation_task' then 'agency_negotiation' else 'agency_deal_control' end;
    v_before:=jsonb_build_object('created',true);
    insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,player_id,club_need_id,due_at,status,priority,source,tenant_id)
    values(v_title,v_task_type,p_actor_user_id,v_person_id,v_org_id,v_player_id,v_need_id,v_due,'open',v_priority,'agency_os:'||v_p.id::text,v_p.tenant_id)
    returning id into v_result_id;
    select to_jsonb(t) into v_after from djm_os.tasks t where t.id=v_result_id and t.tenant_id=v_p.tenant_id;
    if v_after is null or v_after->>'status'<>'open' then raise exception 'task_creation_verification_failed'; end if;

  elsif v_p.action_type='assign_deal_owner' then
    if v_role not in ('owner','admin','agent','operations') then raise exception 'deal_owner_assignment_not_permitted'; end if;
    begin v_owner:=nullif(v_p.proposed_payload->>'owner_user_id','')::uuid; exception when others then raise exception 'invalid_owner_user_id'; end;
    if v_owner is null then raise exception 'owner_user_id_required'; end if;
    if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=v_p.tenant_id and m.user_id=v_owner and m.status='active' and m.role in ('owner','admin','agent','operations')) then
      raise exception 'owner_must_be_active_agency_operator';
    end if;
    select to_jsonb(d) into v_before from djm_os.deal_rooms d where d.id=v_p.target_id and d.tenant_id=v_p.tenant_id and d.status='active' for update;
    if v_before is null then raise exception 'active_deal_not_found'; end if;
    update djm_os.deal_rooms set owner_user_id=v_owner,updated_at=now() where id=v_p.target_id and tenant_id=v_p.tenant_id and status='active' returning id into v_result_id;
    select to_jsonb(d) into v_after from djm_os.deal_rooms d where d.id=v_result_id and d.tenant_id=v_p.tenant_id;
    if v_after is null or v_after->>'owner_user_id' is distinct from v_owner::text then raise exception 'deal_owner_write_verification_failed'; end if;
  end if;

  update platform.agency_action_proposals
  set status='applied',approved_by=p_actor_user_id,approved_at=now(),applied_at=now(),
      result_target_type=case when v_p.action_type in ('create_deal_blocker_task','create_deal_decision_task','create_negotiation_task') then 'task' else 'deal_room' end,
      result_target_id=v_result_id,before_json=v_before,after_json=v_after,
      verification_json=jsonb_build_object('verified',true,'verified_at',now(),'read_back',true,'tenant_id',v_p.tenant_id),
      undo_supported=true,error_message=null,updated_at=now()
  where id=v_p.id returning * into v_p;

  insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,snoozed_until,metadata)
  values(v_p.tenant_id,p_actor_user_id,v_p.command_id,v_p.command_type,v_p.target_type,v_p.target_id,
    case when v_p.action_type in ('create_deal_blocker_task','create_deal_decision_task','create_negotiation_task') then 'snoozed' else 'completed' end,
    case when v_p.action_type in ('create_deal_blocker_task','create_deal_decision_task','create_negotiation_task') then greatest(v_due,now()+interval '15 minutes') else null end,
    jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'deal_war_room',true,'negotiation_task',v_p.action_type='create_negotiation_task','delegated_task_id',case when v_p.action_type in ('create_deal_blocker_task','create_deal_decision_task','create_negotiation_task') then v_result_id else null end));

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(v_p.tenant_id,p_actor_user_id,'user','agency_action.applied','agency_action',v_p.id::text,v_before,v_after,
    jsonb_build_object('action_type',v_p.action_type,'command_id',v_p.command_id,'verified',true,'source',case when v_p.action_type='create_negotiation_task' then 'negotiation_readiness' else 'deal_war_room' end));

  return jsonb_build_object('proposal_id',v_p.id,'status','applied','action_type',v_p.action_type,'target_type',v_p.result_target_type,'target_id',v_p.result_target_id,
    'verified',true,'undo_supported',true,'duplicate',false,'external_side_effect',false);
exception when others then
  if v_p.id is not null then
    update platform.agency_action_proposals set status=case when status in ('applied','expired','undone') then status else 'failed' end,error_message=left(sqlerrm,1000),updated_at=now() where id=v_p.id;
  end if;
  raise;
end;
$$;

create or replace function public.platform_server_undo_agency_action(p_proposal_id uuid, p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_role text;
  v_current jsonb;
  v_deleted integer:=0;
  v_before_owner uuid;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id for update;
  if not found then raise exception 'proposal_not_found'; end if;

  if v_p.action_type not in ('create_deal_blocker_task','create_deal_decision_task','assign_deal_owner','create_negotiation_task') then
    return public.platform_server_undo_agency_action_core_v6(p_proposal_id,p_actor_user_id);
  end if;

  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=v_p.tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','scout','operations') limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;
  if v_p.status='undone' then return jsonb_build_object('proposal_id',v_p.id,'status','undone','duplicate',true); end if;
  if v_p.status<>'applied' or not v_p.undo_supported then raise exception 'action_cannot_be_undone'; end if;

  if v_p.action_type in ('create_deal_blocker_task','create_deal_decision_task','create_negotiation_task') then
    select to_jsonb(t) into v_current from djm_os.tasks t where t.id=v_p.result_target_id and t.tenant_id=v_p.tenant_id for update;
    if v_current is null then raise exception 'task_missing_during_undo'; end if;
    if v_current->>'source' is distinct from ('agency_os:'||v_p.id::text)
       or v_current->>'status' is distinct from v_p.after_json->>'status'
       or v_current->>'title' is distinct from v_p.after_json->>'title'
       or v_current->>'due_at' is distinct from v_p.after_json->>'due_at'
       or v_current->>'priority' is distinct from v_p.after_json->>'priority'
       or v_current->>'player_id' is distinct from v_p.after_json->>'player_id'
       or v_current->>'club_need_id' is distinct from v_p.after_json->>'club_need_id'
       or v_current->>'organisation_id' is distinct from v_p.after_json->>'organisation_id'
       or v_current->>'owner_user_id' is distinct from v_p.after_json->>'owner_user_id' then
      raise exception 'target_changed_after_action_review_manually';
    end if;
    delete from djm_os.tasks where id=v_p.result_target_id and tenant_id=v_p.tenant_id and source='agency_os:'||v_p.id::text;
    get diagnostics v_deleted=row_count;
    if v_deleted<>1 then raise exception 'target_changed_after_action_review_manually'; end if;

  elsif v_p.action_type='assign_deal_owner' then
    select to_jsonb(d) into v_current from djm_os.deal_rooms d where d.id=v_p.result_target_id and d.tenant_id=v_p.tenant_id for update;
    if v_current is null then raise exception 'deal_missing_during_undo'; end if;
    if v_current->>'owner_user_id' is distinct from v_p.after_json->>'owner_user_id' then raise exception 'target_changed_after_action_review_manually'; end if;
    begin v_before_owner:=nullif(v_p.before_json->>'owner_user_id','')::uuid; exception when others then v_before_owner:=null; end;
    update djm_os.deal_rooms set owner_user_id=v_before_owner,updated_at=now() where id=v_p.result_target_id and tenant_id=v_p.tenant_id;
  end if;

  update platform.agency_action_proposals set status='undone',undone_at=now(),updated_at=now() where id=v_p.id;
  insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,metadata)
  values(v_p.tenant_id,p_actor_user_id,v_p.command_id,v_p.command_type,v_p.target_type,v_p.target_id,'undone',jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'deal_war_room',true));
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(v_p.tenant_id,p_actor_user_id,'user','agency_action.undone','agency_action',v_p.id::text,v_p.after_json,v_p.before_json,jsonb_build_object('action_type',v_p.action_type,'command_id',v_p.command_id,'source','deal_war_room'));
  return jsonb_build_object('proposal_id',v_p.id,'status','undone','undone',true,'action_type',v_p.action_type);
end;
$$;

revoke all on function public.platform_server_negotiation_sequence(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_prepare_negotiation_next_step(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_negotiation_sequence(uuid,uuid) to service_role;
grant execute on function public.platform_server_prepare_negotiation_next_step(uuid,uuid,uuid) to service_role;
;
