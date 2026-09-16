create or replace function public.platform_server_prepare_deal_step(
  p_tenant_id uuid,
  p_deal_room_id uuid,
  p_step_type text,
  p_actor_user_id uuid,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_deal djm_os.deal_rooms%rowtype;
  v_war jsonb;
  v_step jsonb;
  v_action_type text;
  v_target_type text:='deal_room';
  v_target_id uuid:=p_deal_room_id;
  v_risk text:='low';
  v_approval text:='confirm';
  v_status text:='proposed';
  v_title text;
  v_rationale text;
  v_payload jsonb:='{}'::jsonb;
  v_due timestamptz;
  v_owner uuid;
  v_intro jsonb;
  v_intermediary uuid;
  v_target_person uuid;
  v_next_text text;
  v_next_at timestamptz;
  v_idempotency text;
  v_proposal platform.agency_action_proposals%rowtype;
begin
  if jsonb_typeof(coalesce(p_input,'{}'::jsonb))<>'object' then raise exception 'input_must_be_object'; end if;
  if trim(coalesce(p_step_type,''))='' then raise exception 'step_type_required'; end if;

  select m.role into v_role
  from platform.tenant_memberships m
  join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active'
    and m.role in ('owner','admin','agent','scout','operations') limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;

  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id and d.status='active';
  if not found then raise exception 'active_deal_not_found_for_tenant'; end if;

  v_war:=public.platform_server_deal_war_room(p_tenant_id,p_deal_room_id);
  select x.value into v_step
  from jsonb_array_elements(coalesce(v_war->'closing_sequence','[]'::jsonb)) x
  where x.value->>'step_type'=p_step_type limit 1;
  if v_step is null then raise exception 'deal_step_no_longer_actionable'; end if;

  if p_step_type='assign_owner' then
    if v_role not in ('owner','admin','agent','operations') then raise exception 'deal_owner_assignment_not_permitted'; end if;
    begin v_owner:=nullif(p_input->>'owner_user_id','')::uuid; exception when others then raise exception 'invalid_owner_user_id'; end;
    if v_owner is null then
      v_status:='needs_input'; v_approval:='input_then_confirm';
    elsif not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=v_owner and m.status='active' and m.role in ('owner','admin','agent','operations')) then
      raise exception 'owner_must_be_active_agency_operator';
    end if;
    v_action_type:='assign_deal_owner';
    v_title:='Assign deal owner: '||v_deal.title;
    v_rationale:='A live deal should have one accountable owner. This changes internal ownership only.';
    v_payload:=jsonb_build_object('deal_room_id',v_deal.id,'owner_user_id',v_owner,'previous_owner_user_id',v_deal.owner_user_id);

  elsif p_step_type='request_warm_introduction' then
    v_intro:=v_step->'introduction_context';
    begin v_intermediary:=nullif(v_intro->'intermediary'->>'person_id','')::uuid; exception when others then v_intermediary:=null; end;
    begin v_target_person:=nullif(v_intro->'target_contact'->>'person_id','')::uuid; exception when others then v_target_person:=null; end;
    if v_intermediary is null or v_target_person is null then raise exception 'introduction_path_incomplete'; end if;
    begin v_due:=nullif(p_input->>'due_at','')::timestamptz; exception when others then raise exception 'invalid_due_at'; end;
    if v_due is null then v_due:=now()+interval '1 day'; end if;
    v_action_type:='create_introduction_task'; v_target_type:='person'; v_target_id:=v_intermediary;
    v_title:=coalesce(nullif(trim(p_input->>'title'),''),'Request warm introduction: '||v_deal.title);
    v_rationale:='Direct club access is weaker than the recorded warm-introduction route. Create accountable internal work to open the stronger path.';
    v_payload:=jsonb_build_object(
      'title',v_title,'due_at',v_due,'priority',4,'person_id',v_intermediary,'intermediary_person_id',v_intermediary,
      'target_person_id',v_target_person,'organisation_id',v_deal.organisation_id,'player_id',v_deal.player_id,'club_need_id',v_deal.club_need_id,
      'deal_room_id',v_deal.id,'deal_step_type',p_step_type,'introduction_context',v_intro,'recommended_action',v_step->>'instruction'
    );

  elsif p_step_type='resolve_blocker' then
    begin v_due:=nullif(p_input->>'due_at','')::timestamptz; exception when others then raise exception 'invalid_due_at'; end;
    if v_due is null then v_due:=now()+interval '1 day'; end if;
    v_action_type:='create_deal_blocker_task';
    v_title:=coalesce(nullif(trim(p_input->>'title'),''),'Resolve blocker: '||v_deal.title);
    v_rationale:='The recorded blocker is preventing or slowing commercial movement. Create a reversible internal commitment to resolve it.';
    v_payload:=jsonb_build_object(
      'title',v_title,'due_at',v_due,'priority',5,'organisation_id',v_deal.organisation_id,'player_id',v_deal.player_id,'club_need_id',v_deal.club_need_id,
      'deal_room_id',v_deal.id,'deal_step_type',p_step_type,'baseline_blocker',v_deal.primary_blocker,'baseline_stage',v_deal.stage,'baseline_status',v_deal.status,
      'instruction',v_step->>'instruction'
    );

  elsif p_step_type='set_next_action' then
    v_action_type:='set_deal_next_action'; v_risk:='medium'; v_approval:='input_then_confirm';
    v_next_text:=nullif(trim(coalesce(p_input->>'next_action_text','')),'');
    begin v_next_at:=nullif(p_input->>'next_action_at','')::timestamptz; exception when others then raise exception 'invalid_next_action_at'; end;
    if v_next_text is null or v_next_at is null then v_status:='needs_input';
    elsif v_next_at<=now() then raise exception 'next_action_at_must_be_future'; end if;
    v_title:='Set next action: '||v_deal.title;
    v_rationale:='The deal does not currently have a controlled future-dated next action.';
    v_payload:=jsonb_build_object('deal_room_id',v_deal.id,'next_action_text',v_next_text,'next_action_at',v_next_at,'suggested_text',v_step->>'instruction','deal_step_type',p_step_type);

  elsif p_step_type='decision_checkpoint' then
    begin v_due:=nullif(p_input->>'due_at','')::timestamptz; exception when others then raise exception 'invalid_due_at'; end;
    if v_due is null then v_due:=now()+interval '2 days'; end if;
    v_action_type:='create_deal_decision_task';
    v_title:=coalesce(nullif(trim(p_input->>'title'),''),'Decision checkpoint: '||v_deal.title);
    v_rationale:='The deal needs an explicit advance, park or close decision rather than indefinite activity.';
    v_payload:=jsonb_build_object(
      'title',v_title,'due_at',v_due,'priority',4,'organisation_id',v_deal.organisation_id,'player_id',v_deal.player_id,'club_need_id',v_deal.club_need_id,
      'deal_room_id',v_deal.id,'deal_step_type',p_step_type,'baseline_stage',v_deal.stage,'baseline_status',v_deal.status,'baseline_next_decision',v_deal.next_decision,
      'instruction',v_step->>'instruction'
    );

  elsif p_step_type='verify_evidence' then
    begin v_due:=nullif(p_input->>'due_at','')::timestamptz; exception when others then raise exception 'invalid_due_at'; end;
    if v_due is null then v_due:=now()+interval '6 hours'; end if;
    v_action_type:='create_verification_task';
    v_title:=coalesce(nullif(trim(p_input->>'title'),''),'Verify deal evidence: '||v_deal.title);
    v_rationale:='The deal remains commercially important, but its evidence is below the normal-action threshold.';
    v_payload:=jsonb_build_object(
      'title',v_title,'due_at',v_due,'priority',5,'organisation_id',v_deal.organisation_id,'player_id',v_deal.player_id,'club_need_id',v_deal.club_need_id,
      'deal_room_id',v_deal.id,'deal_step_type',p_step_type,'evidence_health',v_war->'evidence_health','verification_reasons',v_war->'evidence_health'->'verify_reasons'
    );
  else
    raise exception 'unsupported_deal_step_type:%',p_step_type;
  end if;

  v_idempotency:=md5('deal_step|'||p_deal_room_id::text||'|'||p_step_type||'|'||coalesce(p_input,'{}'::jsonb)::text);

  insert into platform.agency_action_proposals(
    tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key
  ) values(
    p_tenant_id,'deal_step:'||p_deal_room_id::text||':'||p_step_type,'Deal War Room: '||p_step_type,v_action_type,v_target_type,v_target_id,v_risk,v_approval,v_status,
    v_title,v_rationale,v_payload,p_actor_user_id,v_idempotency
  )
  on conflict (tenant_id,idempotency_key) where status in ('proposed','needs_input','applied')
  do update set title=excluded.title,rationale=excluded.rationale,proposed_payload=excluded.proposed_payload,updated_at=now()
  returning * into v_proposal;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','deal_war_room.step_prepared','agency_action',v_proposal.id::text,
    jsonb_build_object('deal_room_id',p_deal_room_id,'step_type',p_step_type,'action_type',v_action_type,'status',v_proposal.status),
    jsonb_build_object('source','deal_war_room','external_side_effect',false));

  return jsonb_build_object(
    'proposal_id',v_proposal.id,'deal_room_id',p_deal_room_id,'step_type',p_step_type,'action_type',v_action_type,'risk_level',v_risk,
    'approval_mode',v_approval,'status',v_proposal.status,'title',v_title,'rationale',v_rationale,'payload',v_payload,'expires_at',v_proposal.expires_at,
    'executable',v_status='proposed' and v_approval<>'review_only','external_side_effect',false
  );
end;
$$;

alter function public.platform_server_execute_agency_action(uuid,uuid) rename to platform_server_execute_agency_action_core_v6;

create or replace function public.platform_server_execute_agency_action(p_proposal_id uuid,p_actor_user_id uuid)
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

  if v_p.action_type not in ('create_deal_blocker_task','create_deal_decision_task','assign_deal_owner') then
    return public.platform_server_execute_agency_action_core_v6(p_proposal_id,p_actor_user_id);
  end if;

  select m.role into v_role
  from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=v_p.tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','scout','operations') limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;
  if v_p.status='applied' then return jsonb_build_object('proposal_id',v_p.id,'status','applied','duplicate',true,'verified',coalesce((v_p.verification_json->>'verified')::boolean,false)); end if;
  if v_p.status<>'proposed' then raise exception 'proposal_not_executable:%',v_p.status; end if;
  if v_p.expires_at<=now() then update platform.agency_action_proposals set status='expired',updated_at=now() where id=v_p.id; raise exception 'proposal_expired'; end if;

  if v_p.action_type in ('create_deal_blocker_task','create_deal_decision_task') then
    v_title:=nullif(trim(v_p.proposed_payload->>'title'),'');
    if v_title is null then raise exception 'task_title_required'; end if;
    begin v_due:=nullif(v_p.proposed_payload->>'due_at','')::timestamptz; exception when others then raise exception 'invalid_due_at'; end;
    if v_due is null then v_due:=now()+interval '1 day'; end if;
    v_priority:=greatest(1,least(coalesce(nullif(v_p.proposed_payload->>'priority','')::integer,4),5));
    begin v_person_id:=nullif(v_p.proposed_payload->>'person_id','')::uuid; exception when others then v_person_id:=null; end;
    begin v_org_id:=nullif(v_p.proposed_payload->>'organisation_id','')::uuid; exception when others then v_org_id:=null; end;
    begin v_player_id:=nullif(v_p.proposed_payload->>'player_id','')::uuid; exception when others then v_player_id:=null; end;
    begin v_need_id:=nullif(v_p.proposed_payload->>'club_need_id','')::uuid; exception when others then v_need_id:=null; end;
    v_task_type:='agency_deal_control';
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
      result_target_type=case when v_p.action_type in ('create_deal_blocker_task','create_deal_decision_task') then 'task' else 'deal_room' end,
      result_target_id=v_result_id,before_json=v_before,after_json=v_after,
      verification_json=jsonb_build_object('verified',true,'verified_at',now(),'read_back',true,'tenant_id',v_p.tenant_id),
      undo_supported=true,error_message=null,updated_at=now()
  where id=v_p.id returning * into v_p;

  insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,snoozed_until,metadata)
  values(v_p.tenant_id,p_actor_user_id,v_p.command_id,v_p.command_type,v_p.target_type,v_p.target_id,
    case when v_p.action_type in ('create_deal_blocker_task','create_deal_decision_task') then 'snoozed' else 'completed' end,
    case when v_p.action_type in ('create_deal_blocker_task','create_deal_decision_task') then greatest(v_due,now()+interval '15 minutes') else null end,
    jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'deal_war_room',true,'delegated_task_id',case when v_p.action_type in ('create_deal_blocker_task','create_deal_decision_task') then v_result_id else null end));

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(v_p.tenant_id,p_actor_user_id,'user','agency_action.applied','agency_action',v_p.id::text,v_before,v_after,
    jsonb_build_object('action_type',v_p.action_type,'command_id',v_p.command_id,'verified',true,'source','deal_war_room'));

  return jsonb_build_object('proposal_id',v_p.id,'status','applied','action_type',v_p.action_type,'target_type',v_p.result_target_type,'target_id',v_p.result_target_id,
    'verified',true,'undo_supported',true,'duplicate',false,'external_side_effect',false);
exception when others then
  if v_p.id is not null then
    update platform.agency_action_proposals set status=case when status in ('applied','expired','undone') then status else 'failed' end,error_message=left(sqlerrm,1000),updated_at=now() where id=v_p.id;
  end if;
  raise;
end;
$$;

alter function public.platform_server_undo_agency_action(uuid,uuid) rename to platform_server_undo_agency_action_core_v6;

create or replace function public.platform_server_undo_agency_action(p_proposal_id uuid,p_actor_user_id uuid)
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

  if v_p.action_type not in ('create_deal_blocker_task','create_deal_decision_task','assign_deal_owner') then
    return public.platform_server_undo_agency_action_core_v6(p_proposal_id,p_actor_user_id);
  end if;

  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=v_p.tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','scout','operations') limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;
  if v_p.status='undone' then return jsonb_build_object('proposal_id',v_p.id,'status','undone','duplicate',true); end if;
  if v_p.status<>'applied' or not v_p.undo_supported then raise exception 'action_cannot_be_undone'; end if;

  if v_p.action_type in ('create_deal_blocker_task','create_deal_decision_task') then
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

revoke execute on function public.platform_server_prepare_deal_step(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_prepare_deal_step(uuid,uuid,text,uuid,jsonb) to service_role;
revoke execute on function public.platform_server_execute_agency_action(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_execute_agency_action(uuid,uuid) to service_role;
revoke execute on function public.platform_server_undo_agency_action(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_undo_agency_action(uuid,uuid) to service_role;;
