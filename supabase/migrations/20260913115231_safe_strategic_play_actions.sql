create or replace function public.platform_server_execute_agency_action(p_proposal_id uuid, p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=v_p.tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','scout','operations') limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;
  if v_p.status='applied' then return jsonb_build_object('proposal_id',v_p.id,'status','applied','duplicate',true,'verified',coalesce((v_p.verification_json->>'verified')::boolean,false)); end if;
  if v_p.status<>'proposed' then raise exception 'proposal_not_executable:%',v_p.status; end if;
  if v_p.approval_mode='review_only' then raise exception 'proposal_requires_manual_review'; end if;
  if v_p.expires_at <= now() then update platform.agency_action_proposals set status='expired',updated_at=now() where id=v_p.id; raise exception 'proposal_expired'; end if;

  if v_p.action_type='complete_task' then
    select to_jsonb(t),t.status,t.completed_at into v_before,v_current_status,v_current_completed from djm_os.tasks t where t.id=v_p.target_id and t.tenant_id=v_p.tenant_id for update;
    if v_before is null then raise exception 'task_not_found'; end if;
    if v_current_status<>'open' then raise exception 'task_is_no_longer_open'; end if;
    update djm_os.tasks set status='completed',completed_at=now(),updated_at=now() where id=v_p.target_id and tenant_id=v_p.tenant_id returning id into v_result_id;
    select to_jsonb(t) into v_after from djm_os.tasks t where t.id=v_result_id and t.tenant_id=v_p.tenant_id;
    if v_after is null or v_after->>'status'<>'completed' then raise exception 'task_write_verification_failed'; end if;
    v_feedback_type := 'completed';

  elsif v_p.action_type in ('create_search_task','create_player_task','create_relationship_task') then
    v_title := nullif(trim(v_p.proposed_payload->>'title'),''); if v_title is null then raise exception 'task_title_required'; end if;
    begin v_due := nullif(v_p.proposed_payload->>'due_at','')::timestamptz; exception when others then raise exception 'invalid_due_at'; end;
    if v_due is null then v_due := now()+interval '1 day'; end if;
    v_priority := greatest(1,least(coalesce(nullif(v_p.proposed_payload->>'priority','')::integer,3),5));
    begin v_person_id:=nullif(v_p.proposed_payload->>'person_id','')::uuid; exception when others then v_person_id:=null; end;
    begin v_org_id:=nullif(v_p.proposed_payload->>'organisation_id','')::uuid; exception when others then v_org_id:=null; end;
    begin v_player_id:=nullif(v_p.proposed_payload->>'player_id','')::uuid; exception when others then v_player_id:=null; end;

    if v_p.action_type='create_search_task' then v_player_id:=null; end if;
    if v_p.action_type='create_player_task' then v_player_id:=v_p.target_id; end if;

    v_before := jsonb_build_object('created',true);
    insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,player_id,club_need_id,due_at,status,priority,source,tenant_id)
    values(
      v_title,'agency_os',p_actor_user_id,v_person_id,v_org_id,v_player_id,
      case when v_p.action_type='create_search_task' then v_p.target_id else null end,
      v_due,'open',v_priority,'agency_os:'||v_p.id::text,v_p.tenant_id
    ) returning id into v_result_id;
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
    update djm_os.deal_rooms set next_action_text=v_next_text,next_action_at=v_next_at,updated_at=now() where id=v_p.target_id and tenant_id=v_p.tenant_id and status='active' returning id into v_result_id;
    select to_jsonb(d) into v_after from djm_os.deal_rooms d where d.id=v_result_id and d.tenant_id=v_p.tenant_id;
    if v_after is null or v_after->>'next_action_text' is distinct from v_next_text or (v_after->>'next_action_at')::timestamptz is distinct from v_next_at then raise exception 'deal_write_verification_failed'; end if;
    v_feedback_type := 'completed';
  else raise exception 'action_type_not_executable:%',v_p.action_type;
  end if;

  update platform.agency_action_proposals
  set status='applied',approved_by=p_actor_user_id,approved_at=now(),applied_at=now(),
      result_target_type=case when v_p.action_type in ('create_search_task','create_player_task','create_relationship_task') then 'task' else v_p.target_type end,
      result_target_id=v_result_id,before_json=v_before,after_json=v_after,
      verification_json=jsonb_build_object('verified',true,'verified_at',now(),'read_back',true,'tenant_id',v_p.tenant_id),
      undo_supported=true,error_message=null,updated_at=now()
  where id=v_p.id returning * into v_p;

  insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,snoozed_until,metadata)
  values(
    v_p.tenant_id,p_actor_user_id,v_p.command_id,v_p.command_type,v_p.target_type,v_p.target_id,
    v_feedback_type,v_snoozed_until,
    jsonb_build_object(
      'proposal_id',v_p.id,'action_type',v_p.action_type,
      'operating_state',case when v_feedback_type='snoozed' then 'delegated' else 'resolved' end,
      'delegated_task_id',case when v_feedback_type='snoozed' then v_result_id else null end
    )
  );
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(v_p.tenant_id,p_actor_user_id,'user','agency_action.applied','agency_action',v_p.id::text,v_before,v_after,jsonb_build_object('action_type',v_p.action_type,'command_id',v_p.command_id,'verified',true,'operating_state',case when v_feedback_type='snoozed' then 'delegated' else 'resolved' end));
  return jsonb_build_object('proposal_id',v_p.id,'status','applied','action_type',v_p.action_type,'target_type',v_p.result_target_type,'target_id',v_p.result_target_id,'verified',true,'undo_supported',true,'duplicate',false,'operating_state',case when v_feedback_type='snoozed' then 'delegated' else 'resolved' end,'snoozed_until',v_snoozed_until);
exception when others then
  if v_p.id is not null then
    update platform.agency_action_proposals set status=case when status in ('applied','expired','undone') then status else 'failed' end,error_message=left(sqlerrm,1000),updated_at=now() where id=v_p.id;
  end if;
  raise;
end;
$function$;

revoke all on function public.platform_server_execute_agency_action(uuid,uuid) from public, anon, authenticated;
grant execute on function public.platform_server_execute_agency_action(uuid,uuid) to service_role;

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

  elsif v_p.action_type in ('create_search_task','create_player_task','create_relationship_task') then
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
  else raise exception 'undo_handler_not_available'; end if;

  update platform.agency_action_proposals set status='undone',undone_at=now(),updated_at=now() where id=v_p.id;
  insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,metadata)
  values(v_p.tenant_id,p_actor_user_id,v_p.command_id,v_p.command_type,v_p.target_type,v_p.target_id,'undone',jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type));
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(v_p.tenant_id,p_actor_user_id,'user','agency_action.undone','agency_action',v_p.id::text,v_p.after_json,v_p.before_json,jsonb_build_object('action_type',v_p.action_type,'command_id',v_p.command_id));
  return jsonb_build_object('proposal_id',v_p.id,'status','undone','undone',true,'action_type',v_p.action_type);
end;
$function$;

revoke all on function public.platform_server_undo_agency_action(uuid,uuid) from public, anon, authenticated;
grant execute on function public.platform_server_undo_agency_action(uuid,uuid) to service_role;

create or replace function platform.sync_commitment_from_proposal()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_task djm_os.tasks%rowtype;
  v_status text;
begin
  if new.action_type in ('create_search_task','create_player_task','create_relationship_task') and new.status='applied' and new.result_target_id is not null then
    select * into v_task from djm_os.tasks where id=new.result_target_id and tenant_id=new.tenant_id;
    if found then
      v_status:=case when v_task.status='completed' then 'completed' when v_task.due_at is not null and v_task.due_at<now() then 'overdue' else 'active' end;
      insert into platform.agency_commitments(tenant_id,proposal_id,command_id,task_id,owner_user_id,status,due_at,completed_at,metadata)
      values(new.tenant_id,new.id,new.command_id,v_task.id,coalesce(new.approved_by,new.requested_by),v_status,v_task.due_at,v_task.completed_at,
        jsonb_build_object('action_type',new.action_type,'source','agency_os','target_type',new.target_type,'target_id',new.target_id,'task_title',v_task.title,'task_source',v_task.source))
      on conflict (proposal_id) do update set task_id=excluded.task_id,owner_user_id=excluded.owner_user_id,status=excluded.status,due_at=excluded.due_at,completed_at=excluded.completed_at,metadata=platform.agency_commitments.metadata||excluded.metadata,updated_at=now();
    end if;
  elsif new.action_type in ('create_search_task','create_player_task','create_relationship_task') and new.status='undone' then
    update platform.agency_commitments set status='cancelled',updated_at=now(),metadata=metadata||jsonb_build_object('cancelled_by_undo',true,'cancelled_at',now())
    where proposal_id=new.id and status<>'cancelled';
  end if;
  return new;
end;
$function$;

create or replace function public.platform_server_prepare_play_action(
  p_tenant_id uuid,
  p_play_id text,
  p_actor_user_id uuid,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text;
  v_play jsonb;
  v_play_type text;
  v_command_id text;
  v_person_id uuid;
  v_org_id uuid;
  v_player_id uuid;
  v_due timestamptz;
  v_title text;
  v_idempotency text;
  v_proposal platform.agency_action_proposals%rowtype;
begin
  if jsonb_typeof(coalesce(p_input,'{}'::jsonb))<>'object' then raise exception 'input_must_be_object'; end if;
  if trim(coalesce(p_play_id,''))='' then raise exception 'play_id_required'; end if;
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','scout','operations') limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;

  select x.value into v_play from jsonb_array_elements(public.platform_server_agency_playbook(p_tenant_id,20)->'plays') x where x.value->>'play_id'=p_play_id limit 1;
  if v_play is null then raise exception 'strategic_play_no_longer_available'; end if;
  v_play_type:=v_play->>'play_type';

  if v_play_type in ('protect_live_deal','remove_deal_blocker') then
    v_command_id:='deal:'||(v_play->'evidence'->>'deal_room_id');
    return public.platform_server_prepare_command_action(p_tenant_id,v_command_id,p_actor_user_id,p_input);
  elsif v_play_type='source_for_confirmed_need' then
    v_command_id:='need_unmatched:'||(v_play->'evidence'->>'club_need_id');
    return public.platform_server_prepare_command_action(p_tenant_id,v_command_id,p_actor_user_id,p_input);
  elsif v_play_type in ('strengthen_access_before_pitch','validate_demand_before_pitch') then
    begin v_person_id:=nullif(v_play->'evidence'->'pursuit'->'best_access_route'->>'person_id','')::uuid; exception when others then v_person_id:=null; end;
    begin v_org_id:=nullif(v_play->'evidence'->>'organisation_id','')::uuid; exception when others then v_org_id:=null; end;
    begin v_player_id:=nullif(v_play->'evidence'->>'player_id','')::uuid; exception when others then v_player_id:=null; end;
    begin v_due:=nullif(p_input->>'due_at','')::timestamptz; exception when others then raise exception 'invalid_due_at'; end;
    if v_due is null then v_due:=now()+interval '1 day'; end if;
    v_title:=coalesce(nullif(trim(p_input->>'title'),''),
      case when v_play_type='strengthen_access_before_pitch'
           then 'Strengthen club route before pursuing '||(v_play->>'title')
           else 'Validate club demand before pursuing '||(v_play->>'title') end);
    v_idempotency:=md5('play|'||p_play_id||'|'||coalesce(p_input,'{}'::jsonb)::text);
    insert into platform.agency_action_proposals(
      tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key
    ) values(
      p_tenant_id,'strategic_play:'||p_play_id,'Strategic play: '||v_play_type,'create_relationship_task',case when v_person_id is not null then 'person' else 'organisation' end,coalesce(v_person_id,v_org_id),
      'low','confirm','proposed',v_title,v_play->>'rationale',
      jsonb_build_object('title',v_title,'due_at',v_due,'priority',4,'person_id',v_person_id,'organisation_id',v_org_id,'player_id',v_player_id,'play_id',p_play_id,'recommended_action',v_play->>'recommended_action'),
      p_actor_user_id,v_idempotency
    )
    on conflict (tenant_id,idempotency_key) where status in ('proposed','needs_input','applied')
    do update set title=excluded.title,rationale=excluded.rationale,proposed_payload=excluded.proposed_payload,updated_at=now()
    returning * into v_proposal;

    insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
    values(p_tenant_id,p_actor_user_id,'user','strategic_play.prepared','agency_action',v_proposal.id::text,jsonb_build_object('play_id',p_play_id,'play_type',v_play_type,'action_type','create_relationship_task'),jsonb_build_object('source','agency_playbook'));

    return jsonb_build_object('proposal_id',v_proposal.id,'play_id',p_play_id,'action_type',v_proposal.action_type,'risk_level','low','approval_mode','confirm','status',v_proposal.status,'title',v_proposal.title,'rationale',v_proposal.rationale,'payload',v_proposal.proposed_payload,'expires_at',v_proposal.expires_at,'executable',true);
  elsif v_play_type='pitch_now' then
    v_idempotency:=md5('play|'||p_play_id||'|review_pitch');
    insert into platform.agency_action_proposals(
      tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key
    ) values(
      p_tenant_id,'strategic_play:'||p_play_id,'Strategic play: pitch review','review_pitch','player_match',(v_play->'evidence'->'pursuit'->>'player_match_id')::uuid,
      'high','review_only','proposed','Review pitch: '||(v_play->>'title'),v_play->>'rationale',v_play->'evidence',p_actor_user_id,v_idempotency
    )
    on conflict (tenant_id,idempotency_key) where status in ('proposed','needs_input','applied') do update set updated_at=now()
    returning * into v_proposal;
    return jsonb_build_object('proposal_id',v_proposal.id,'play_id',p_play_id,'action_type','review_pitch','risk_level','high','approval_mode','review_only','status',v_proposal.status,'title',v_proposal.title,'rationale',v_proposal.rationale,'payload',v_proposal.proposed_payload,'executable',false,'reason','External pitch remains human-led.');
  else
    raise exception 'play_requires_manual_review';
  end if;
end;
$function$;

revoke all on function public.platform_server_prepare_play_action(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.platform_server_prepare_play_action(uuid,text,uuid,jsonb) to service_role;;
