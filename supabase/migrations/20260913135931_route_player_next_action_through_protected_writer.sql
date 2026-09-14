alter function public.platform_server_execute_agency_action(uuid,uuid) rename to platform_server_execute_agency_action_core_v8;
alter function public.platform_server_undo_agency_action(uuid,uuid) rename to platform_server_undo_agency_action_core_v8;

create or replace function public.platform_server_execute_agency_action(p_proposal_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_write jsonb;
  v_next_action text;
  v_next_due date;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_p.action_type<>'set_player_next_action' then return public.platform_server_execute_agency_action_core_v8(p_proposal_id,p_actor_user_id); end if;
  if v_p.status='applied' then return jsonb_build_object('proposal_id',v_p.id,'status','applied','duplicate',true,'verified',coalesce((v_p.verification_json->>'verified')::boolean,false)); end if;
  if v_p.status<>'proposed' then raise exception 'proposal_not_executable:%',v_p.status; end if;
  if v_p.expires_at<=now() then update platform.agency_action_proposals set status='expired',updated_at=now() where id=v_p.id; raise exception 'proposal_expired'; end if;
  v_next_action:=nullif(trim(v_p.proposed_payload->>'next_action'),'');
  begin v_next_due:=nullif(v_p.proposed_payload->>'next_action_due','')::date; exception when others then v_next_due:=null; end;
  v_write:=platform.write_player_next_action(v_p.tenant_id,v_p.target_id,p_actor_user_id,v_next_action,v_next_due);
  update platform.agency_action_proposals
  set status='applied',approved_by=p_actor_user_id,approved_at=now(),applied_at=now(),result_target_type='player',result_target_id=v_p.target_id,
      before_json=v_write->'before',after_json=v_write->'after',verification_json=jsonb_build_object('verified',true,'verified_at',now(),'read_back',true,'tenant_id',v_p.tenant_id),
      undo_supported=true,error_message=null,updated_at=now()
  where id=v_p.id returning * into v_p;
  insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,metadata)
  values(v_p.tenant_id,p_actor_user_id,v_p.command_id,v_p.command_type,v_p.target_type,v_p.target_id,'completed',jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'player_service',true));
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(v_p.tenant_id,p_actor_user_id,'user','agency_action.applied','agency_action',v_p.id::text,v_p.before_json,v_p.after_json,jsonb_build_object('action_type',v_p.action_type,'command_id',v_p.command_id,'verified',true,'source','player_service'));
  return jsonb_build_object('proposal_id',v_p.id,'status','applied','action_type',v_p.action_type,'target_type','player','target_id',v_p.target_id,'verified',true,'undo_supported',true,'external_side_effect',false);
exception when others then
  if v_p.id is not null then update platform.agency_action_proposals set status=case when status in ('applied','expired','undone') then status else 'failed' end,error_message=left(sqlerrm,1000),updated_at=now() where id=v_p.id; end if;
  raise;
end;
$$;

create or replace function public.platform_server_undo_agency_action(p_proposal_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_role text;
  v_current public.players%rowtype;
  v_before_action text;
  v_before_due date;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_p.action_type<>'set_player_next_action' then return public.platform_server_undo_agency_action_core_v8(p_proposal_id,p_actor_user_id); end if;
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=v_p.tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  if v_p.status='undone' then return jsonb_build_object('proposal_id',v_p.id,'status','undone','duplicate',true); end if;
  if v_p.status<>'applied' or not v_p.undo_supported then raise exception 'action_cannot_be_undone'; end if;
  select * into v_current from public.players p where p.id=v_p.target_id and p.tenant_id=v_p.tenant_id for update;
  if not found then raise exception 'player_missing_during_undo'; end if;
  if v_current.next_action is distinct from v_p.after_json->>'next_action' or v_current.next_action_due is distinct from nullif(v_p.after_json->>'next_action_due','')::date then raise exception 'target_changed_after_action_review_manually'; end if;
  v_before_action:=v_p.before_json->>'next_action';
  begin v_before_due:=nullif(v_p.before_json->>'next_action_due','')::date; exception when others then v_before_due:=null; end;
  perform pg_catalog.set_config('djm.internal_player_service','on',true);
  update public.players set next_action=v_before_action,next_action_due=v_before_due,updated_at=now() where id=v_p.target_id and tenant_id=v_p.tenant_id;
  perform pg_catalog.set_config('djm.internal_player_service','off',true);
  update platform.agency_action_proposals set status='undone',undone_at=now(),updated_at=now() where id=v_p.id;
  insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,metadata)
  values(v_p.tenant_id,p_actor_user_id,v_p.command_id,v_p.command_type,v_p.target_type,v_p.target_id,'undone',jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'player_service',true));
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(v_p.tenant_id,p_actor_user_id,'user','agency_action.undone','agency_action',v_p.id::text,v_p.after_json,v_p.before_json,jsonb_build_object('action_type',v_p.action_type,'command_id',v_p.command_id,'source','player_service'));
  return jsonb_build_object('proposal_id',v_p.id,'status','undone','undone',true,'action_type',v_p.action_type);
end;
$$;;
