create or replace function public.platform_server_undo_agency_action(p_proposal_id uuid, p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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

  select m.role into v_role
  from platform.tenant_memberships m
  join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=v_p.tenant_id and m.user_id=p_actor_user_id and m.status='active'
    and m.role in ('owner','admin','agent','scout','operations')
  limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;
  if v_p.status='undone' then return jsonb_build_object('proposal_id',v_p.id,'status','undone','duplicate',true); end if;
  if v_p.status<>'applied' or not v_p.undo_supported then raise exception 'action_cannot_be_undone'; end if;

  if v_p.action_type='complete_task' then
    select to_jsonb(t) into v_current from djm_os.tasks t where t.id=v_p.result_target_id and t.tenant_id=v_p.tenant_id for update;
    if v_current is null then raise exception 'task_missing_during_undo'; end if;
    if v_current->>'status' is distinct from v_p.after_json->>'status'
       or v_current->>'completed_at' is distinct from v_p.after_json->>'completed_at' then
      raise exception 'target_changed_after_action_review_manually';
    end if;
    v_before_status := coalesce(v_p.before_json->>'status','open');
    begin v_before_completed := nullif(v_p.before_json->>'completed_at','')::timestamptz;
    exception when others then v_before_completed := null; end;
    update djm_os.tasks set status=v_before_status,completed_at=v_before_completed,updated_at=now()
    where id=v_p.result_target_id and tenant_id=v_p.tenant_id;

  elsif v_p.action_type in ('create_search_task','create_player_task') then
    select to_jsonb(t) into v_current
    from djm_os.tasks t
    where t.id=v_p.result_target_id and t.tenant_id=v_p.tenant_id
    for update;
    if v_current is null then raise exception 'task_missing_during_undo'; end if;

    if v_current->>'source' is distinct from ('agency_os:'||v_p.id::text)
       or v_current->>'status' is distinct from v_p.after_json->>'status'
       or v_current->>'title' is distinct from v_p.after_json->>'title'
       or v_current->>'due_at' is distinct from v_p.after_json->>'due_at'
       or v_current->>'priority' is distinct from v_p.after_json->>'priority'
       or v_current->>'player_id' is distinct from v_p.after_json->>'player_id'
       or v_current->>'club_need_id' is distinct from v_p.after_json->>'club_need_id'
       or v_current->>'completed_at' is distinct from v_p.after_json->>'completed_at' then
      raise exception 'target_changed_after_action_review_manually';
    end if;

    delete from djm_os.tasks
    where id=v_p.result_target_id and tenant_id=v_p.tenant_id and source='agency_os:'||v_p.id::text;
    get diagnostics v_deleted=row_count;
    if v_deleted<>1 then raise exception 'target_changed_after_action_review_manually'; end if;

  elsif v_p.action_type='set_deal_next_action' then
    select to_jsonb(d) into v_current from djm_os.deal_rooms d where d.id=v_p.result_target_id and d.tenant_id=v_p.tenant_id for update;
    if v_current is null then raise exception 'deal_missing_during_undo'; end if;
    if v_current->>'next_action_text' is distinct from v_p.after_json->>'next_action_text'
       or v_current->>'next_action_at' is distinct from v_p.after_json->>'next_action_at' then
      raise exception 'target_changed_after_action_review_manually';
    end if;
    v_before_next_text := nullif(v_p.before_json->>'next_action_text','');
    begin v_before_next_at := nullif(v_p.before_json->>'next_action_at','')::timestamptz;
    exception when others then v_before_next_at := null; end;
    update djm_os.deal_rooms set next_action_text=v_before_next_text,next_action_at=v_before_next_at,updated_at=now()
    where id=v_p.result_target_id and tenant_id=v_p.tenant_id;
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
$function$;

revoke all on function public.platform_server_undo_agency_action(uuid,uuid) from public, anon, authenticated;
grant execute on function public.platform_server_undo_agency_action(uuid,uuid) to service_role;;
