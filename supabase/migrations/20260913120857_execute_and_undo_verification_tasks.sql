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
  v_current_status text;
  v_current_completed timestamptz;
  v_next_text text;
  v_next_at timestamptz;
  v_feedback_type text;
  v_snoozed_until timestamptz;
  v_person_id uuid;
  v_org_id uuid;
  v_player_id uuid;
  v_need_id uuid;
  v_task_type text;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id for update;
  if not found then raise exception 'proposal_not_found'; end if;

  select m.role into v_role
  from platform.tenant_memberships m
  join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=v_p.tenant_id and m.user_id=p_actor_user_id and m.status='active'
    and m.role in ('owner','admin','agent','scout','operations')
  limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;
  if v_p.status='applied' then return jsonb_build_object('proposal_id',v_p.id,'status','applied','duplicate',true,'verified',coalesce((v_p.verification_json->>'verified')::boolean,false)); end if;
  if v_p.status<>'proposed' then raise exception 'proposal_not_executable:%',v_p.status; end if;
  if v_p.approval_mode='review_only' then raise exception 'proposal_requires_manual_review'; end if;
  if v_p.expires_at <= now() then update platform.agency_action_proposals set status='expired',updated_at=now() where id=v_p.id; raise exception 'proposal_expired'; end if;

  if v_p.action_type='complete_task' then
    select to_jsonb(t),t.status,t.completed_at into v_before,v_current_status,v_current_completed
    from djm_os.tasks t where t.id=v_p.target_id and t.tenant_id=v_p.tenant_id for update;
    if v_before is null then raise exception 'task_not_found'; end if;
    if v_current_status<>'open' then raise exception 'task_is_no_longer_open'; end if;
    update djm_os.tasks set status='completed',completed_at=now(),updated_at=now()
    where id=v_p.target_id and tenant_id=v_p.tenant_id returning id into v_result_id;
    select to_jsonb(t) into v_after from djm_os.tasks t where t.id=v_result_id and t.tenant_id=v_p.tenant_id;
    if v_after is null or v_after->>'status'<>'completed' then raise exception 'task_write_verification_failed'; end if;
    v_feedback_type := 'completed';

  elsif v_p.action_type in ('create_search_task','create_player_task','create_relationship_task','create_verification_task') then
    v_title := nullif(trim(v_p.proposed_payload->>'title'),'');
    if v_title is null then raise exception 'task_title_required'; end if;
    begin v_due := nullif(v_p.proposed_payload->>'due_at','')::timestamptz; exception when others then raise exception 'invalid_due_at'; end;
    if v_due is null then v_due := now()+interval '1 day'; end if;
    v_priority := greatest(1,least(coalesce(nullif(v_p.proposed_payload->>'priority','')::integer,3),5));
    begin v_person_id:=nullif(v_p.proposed_payload->>'person_id','')::uuid; exception when others then v_person_id:=null; end;
    begin v_org_id:=nullif(v_p.proposed_payload->>'organisation_id','')::uuid; exception when others then v_org_id:=null; end;
    begin v_player_id:=nullif(v_p.proposed_payload->>'player_id','')::uuid; exception when others then v_player_id:=null; end;
    begin v_need_id:=nullif(v_p.proposed_payload->>'club_need_id','')::uuid; exception when others then v_need_id:=null; end;

    if v_p.action_type='create_search_task' then
      v_player_id:=null;
      v_need_id:=v_p.target_id;
    elsif v_p.action_type='create_player_task' then
      v_player_id:=v_p.target_id;
    end if;

    v_task_type:=case when v_p.action_type='create_verification_task' then 'agency_verification' else 'agency_os' end;
    v_before := jsonb_build_object('created',true);
    insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,player_id,club_need_id,due_at,status,priority,source,tenant_id)
    values(v_title,v_task_type,p_actor_user_id,v_person_id,v_org_id,v_player_id,v_need_id,v_due,'open',v_priority,'agency_os:'||v_p.id::text,v_p.tenant_id)
    returning id into v_result_id;

    select to_jsonb(t) into v_after from djm_os.tasks t where t.id=v_result_id and t.tenant_id=v_p.tenant_id;
    if v_after is null or v_after->>'status'<>'open' or v_after->>'source'<>'agency_os:'||v_p.id::text then raise exception 'task_creation_verification_failed'; end if;
    v_feedback_type := 'snoozed';
    v_snoozed_until := greatest(v_due,now()+interval '15 minutes');

  elsif v_p.action_type='set_deal_next_action' then
    v_next_text := nullif(trim(v_p.proposed_payload->>'next_action_text'),'');
    begin v_next_at := nullif(v_p.proposed_payload->>'next_action_at','')::timestamptz; exception when others then raise exception 'invalid_next_action_at'; end;
    if v_next_text is null or v_next_at is null then raise exception 'deal_next_action_input_required'; end if;
    if v_next_at <= now() then raise exception 'next_action_at_must_be_future'; end if;
    select to_jsonb(d) into v_before from djm_os.deal_rooms d where d.id=v_p.target_id and d.tenant_id=v_p.tenant_id and d.status='active' for update;
    if v_before is null then raise exception 'active_deal_not_found'; end if;
    update djm_os.deal_rooms set next_action_text=v_next_text,next_action_at=v_next_at,updated_at=now()
    where id=v_p.target_id and tenant_id=v_p.tenant_id and status='active' returning id into v_result_id;
    select to_jsonb(d) into v_after from djm_os.deal_rooms d where d.id=v_result_id and d.tenant_id=v_p.tenant_id;
    if v_after is null or v_after->>'next_action_text' is distinct from v_next_text or (v_after->>'next_action_at')::timestamptz is distinct from v_next_at then raise exception 'deal_write_verification_failed'; end if;
    v_feedback_type := 'completed';
  else
    raise exception 'action_type_not_executable:%',v_p.action_type;
  end if;

  update platform.agency_action_proposals
  set status='applied',approved_by=p_actor_user_id,approved_at=now(),applied_at=now(),
      result_target_type=case when v_p.action_type in ('create_search_task','create_player_task','create_relationship_task','create_verification_task') then 'task' else v_p.target_type end,
      result_target_id=v_result_id,before_json=v_before,after_json=v_after,
      verification_json=jsonb_build_object('verified',true,'verified_at',now(),'read_back',true,'tenant_id',v_p.tenant_id),
      undo_supported=true,error_message=null,updated_at=now()
  where id=v_p.id returning * into v_p;

  insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,snoozed_until,metadata)
  values(v_p.tenant_id,p_actor_user_id,v_p.command_id,v_p.command_type,v_p.target_type,v_p.target_id,v_feedback_type,v_snoozed_until,
    jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,
      'operating_state',case when v_feedback_type='snoozed' then 'delegated' else 'resolved' end,
      'delegated_task_id',case when v_feedback_type='snoozed' then v_result_id else null end,
      'verification_task',v_p.action_type='create_verification_task'));

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(v_p.tenant_id,p_actor_user_id,'user','agency_action.applied','agency_action',v_p.id::text,v_before,v_after,
    jsonb_build_object('action_type',v_p.action_type,'command_id',v_p.command_id,'verified',true,
      'operating_state',case when v_feedback_type='snoozed' then 'delegated' else 'resolved' end,
      'verification_task',v_p.action_type='create_verification_task'));

  return jsonb_build_object('proposal_id',v_p.id,'status','applied','action_type',v_p.action_type,'target_type',v_p.result_target_type,'target_id',v_p.result_target_id,
    'verified',true,'undo_supported',true,'duplicate',false,
    'operating_state',case when v_feedback_type='snoozed' then 'delegated' else 'resolved' end,
    'snoozed_until',v_snoozed_until);
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
  v_deleted integer := 0;
  v_before_status text;
  v_before_completed timestamptz;
  v_before_next_text text;
  v_before_next_at timestamptz;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=v_p.tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','scout','operations') limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;
  if v_p.status='undone' then return jsonb_build_object('proposal_id',v_p.id,'status','undone','duplicate',true); end if;
  if v_p.status<>'applied' or not v_p.undo_supported then raise exception 'action_cannot_be_undone'; end if;

  if v_p.action_type='complete_task' then
    select to_jsonb(t) into v_current from djm_os.tasks t where t.id=v_p.result_target_id and t.tenant_id=v_p.tenant_id for update;
    if v_current is null then raise exception 'task_missing_during_undo'; end if;
    if v_current->>'status' is distinct from v_p.after_json->>'status' or v_current->>'completed_at' is distinct from v_p.after_json->>'completed_at' then raise exception 'target_changed_after_action_review_manually'; end if;
    v_before_status := coalesce(v_p.before_json->>'status','open');
    begin v_before_completed := nullif(v_p.before_json->>'completed_at','')::timestamptz; exception when others then v_before_completed:=null; end;
    update djm_os.tasks set status=v_before_status,completed_at=v_before_completed,updated_at=now() where id=v_p.result_target_id and tenant_id=v_p.tenant_id;

  elsif v_p.action_type in ('create_search_task','create_player_task','create_relationship_task','create_verification_task') then
    select to_jsonb(t) into v_current from djm_os.tasks t where t.id=v_p.result_target_id and t.tenant_id=v_p.tenant_id for update;
    if v_current is null then raise exception 'task_missing_during_undo'; end if;
    if v_current->>'source' is distinct from ('agency_os:'||v_p.id::text)
       or v_current->>'status' is distinct from v_p.after_json->>'status'
       or v_current->>'title' is distinct from v_p.after_json->>'title'
       or v_current->>'due_at' is distinct from v_p.after_json->>'due_at'
       or v_current->>'priority' is distinct from v_p.after_json->>'priority'
       or v_current->>'player_id' is distinct from v_p.after_json->>'player_id'
       or v_current->>'club_need_id' is distinct from v_p.after_json->>'club_need_id'
       or v_current->>'person_id' is distinct from v_p.after_json->>'person_id'
       or v_current->>'organisation_id' is distinct from v_p.after_json->>'organisation_id'
       or v_current->>'owner_user_id' is distinct from v_p.after_json->>'owner_user_id'
       or v_current->>'completed_at' is distinct from v_p.after_json->>'completed_at' then
      raise exception 'target_changed_after_action_review_manually';
    end if;
    delete from djm_os.tasks where id=v_p.result_target_id and tenant_id=v_p.tenant_id and source='agency_os:'||v_p.id::text;
    get diagnostics v_deleted=row_count;
    if v_deleted<>1 then raise exception 'target_changed_after_action_review_manually'; end if;

  elsif v_p.action_type='set_deal_next_action' then
    select to_jsonb(d) into v_current from djm_os.deal_rooms d where d.id=v_p.result_target_id and d.tenant_id=v_p.tenant_id for update;
    if v_current is null then raise exception 'deal_missing_during_undo'; end if;
    if v_current->>'next_action_text' is distinct from v_p.after_json->>'next_action_text' or v_current->>'next_action_at' is distinct from v_p.after_json->>'next_action_at' then raise exception 'target_changed_after_action_review_manually'; end if;
    v_before_next_text := nullif(v_p.before_json->>'next_action_text','');
    begin v_before_next_at := nullif(v_p.before_json->>'next_action_at','')::timestamptz; exception when others then v_before_next_at:=null; end;
    update djm_os.deal_rooms set next_action_text=v_before_next_text,next_action_at=v_before_next_at,updated_at=now() where id=v_p.result_target_id and tenant_id=v_p.tenant_id;
  else
    raise exception 'undo_handler_not_available';
  end if;

  update platform.agency_action_proposals set status='undone',undone_at=now(),updated_at=now() where id=v_p.id;
  insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,metadata)
  values(v_p.tenant_id,p_actor_user_id,v_p.command_id,v_p.command_type,v_p.target_type,v_p.target_id,'undone',jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type));
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(v_p.tenant_id,p_actor_user_id,'user','agency_action.undone','agency_action',v_p.id::text,v_p.after_json,v_p.before_json,jsonb_build_object('action_type',v_p.action_type,'command_id',v_p.command_id));
  return jsonb_build_object('proposal_id',v_p.id,'status','undone','undone',true,'action_type',v_p.action_type);
end;
$$;

revoke all on function public.platform_server_execute_agency_action(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_undo_agency_action(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_execute_agency_action(uuid,uuid) to service_role;
grant execute on function public.platform_server_undo_agency_action(uuid,uuid) to service_role;;
