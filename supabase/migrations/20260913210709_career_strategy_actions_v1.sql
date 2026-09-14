create or replace function public.platform_server_prepare_career_strategy_action(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_role text;
  v_card jsonb;
  v_action jsonb;
  v_type text;
  v_player public.players%rowtype;
  v_s platform.player_career_strategies%rowtype;
  v_title text;
  v_instruction text;
  v_due timestamptz;
  v_active_deals integer:=0;
  v_matches integer:=0;
  v_opps integer:=0;
  v_proposal platform.agency_action_proposals%rowtype;
  v_key text;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  select * into v_player from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found_for_tenant'; end if;
  v_card:=public.platform_server_player_career_alignment(p_tenant_id,p_player_id);
  v_action:=v_card->'next_strategy_action';
  v_type:=v_action->>'action_type';
  v_instruction:=v_action->>'instruction';
  if v_type is null then return jsonb_build_object('status','no_strategy_action_available','player_id',p_player_id); end if;
  if v_type in ('define_career_strategy','complete_strategy_approval','confirm_strategy_with_player') then
    return jsonb_build_object(
      'status','needs_human_input','player_id',p_player_id,'strategy_action_type',v_type,'instruction',v_instruction,
      'reason','Career objectives, target markets, trade-offs and player confirmation cannot be created by automation.',
      'allowed_next_steps',case when v_type='define_career_strategy' then jsonb_build_array('save_career_strategy') when v_type='confirm_strategy_with_player' then jsonb_build_array('record_player_confirmation') else jsonb_build_array('record_player_confirmation','approve_career_strategy') end
    );
  end if;
  if v_type='maintain_strategy' then return jsonb_build_object('status','no_action_required','player_id',p_player_id,'strategy_action_type',v_type); end if;
  if v_type not in ('activate_market_plan','review_market_exception','review_career_strategy') then raise exception 'unsupported_strategy_action:%',v_type; end if;

  select * into v_s from platform.player_career_strategies s where s.tenant_id=p_tenant_id and s.player_id=p_player_id and s.status in ('draft','approved') order by s.version desc limit 1;
  select count(*) into v_active_deals from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id and d.status='active';
  select count(*) into v_matches from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.player_id=p_player_id and pm.status in ('suggested','reviewing','shortlisted','pitched','active');
  select count(*) into v_opps from public.player_opportunities po where po.tenant_id=p_tenant_id and po.player_id=p_player_id and po.stage not in ('won','lost');
  v_title:=case v_type when 'activate_market_plan' then 'Activate career market plan: ' when 'review_market_exception' then 'Review career market exception: ' else 'Review career strategy: ' end || coalesce(nullif(trim(v_player.preferred_name),''),nullif(trim(concat_ws(' ',v_player.first_name,v_player.last_name)),''),'Player');
  v_due:=now()+case when v_type='review_market_exception' then interval '12 hours' else interval '1 day' end;
  v_key:='career_strategy:'||p_player_id::text||':'||v_type||':'||coalesce(v_s.version,0)::text||':'||coalesce(v_card->>'alignment_state','none');
  insert into platform.agency_action_proposals(
    tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key,expires_at,undo_supported
  ) values (
    p_tenant_id,'career_strategy:'||p_player_id::text,'Career strategy','create_career_strategy_task','player',p_player_id,'low','confirm','proposed',v_title,
    'Create internal work to bring execution back into line with the human-owned career strategy.',
    jsonb_build_object(
      'title',v_title,'due_at',v_due,'priority',case when v_type='review_market_exception' then 5 else 4 end,'player_id',p_player_id,
      'strategy_action_type',v_type,'instruction',v_instruction,'baseline_alignment_state',v_card->>'alignment_state','baseline_strategy_version',coalesce(v_s.version,0),
      'baseline_strategy_status',coalesce(v_s.status,'missing'),'baseline_confirmation_status',coalesce(v_s.confirmation_status,'missing'),'baseline_review_due_at',v_s.review_due_at,
      'baseline_active_deals',v_active_deals,'baseline_market_matches',v_matches,'baseline_active_opportunities',v_opps,
      'success_condition',case when v_type='activate_market_plan' then 'Recorded market coverage increases or a deliberate alternative execution decision is recorded.' when v_type='review_market_exception' then 'The exception is resolved through strategy revision, player reconfirmation or deliberate removal/parking of the conflicting pursuit.' else 'The strategy is reviewed and becomes current again with player confirmation where required.' end
    ),p_actor_user_id,v_key,now()+interval '24 hours',true
  ) on conflict (tenant_id,idempotency_key) do update set updated_at=now() returning * into v_proposal;
  return jsonb_build_object('status',v_proposal.status,'proposal_id',v_proposal.id,'action_type',v_proposal.action_type,'strategy_action_type',v_type,'payload',v_proposal.proposed_payload,'undo_supported',true,'external_side_effect',false);
end;$$;

create or replace function public.platform_server_execute_agency_action_core_v9(p_proposal_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_role text;
  v_title text;
  v_due timestamptz;
  v_priority integer;
  v_result_id uuid;
  v_after jsonb;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_p.action_type<>'create_career_strategy_task' then return public.platform_server_execute_agency_action_core_v8(p_proposal_id,p_actor_user_id); end if;
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=v_p.tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  if v_p.status='applied' then return jsonb_build_object('proposal_id',v_p.id,'status','applied','duplicate',true); end if;
  if v_p.status<>'proposed' then raise exception 'proposal_not_executable:%',v_p.status; end if;
  if v_p.expires_at<=now() then update platform.agency_action_proposals set status='expired',updated_at=now() where id=v_p.id; raise exception 'proposal_expired'; end if;
  v_title:=nullif(trim(v_p.proposed_payload->>'title'),''); if v_title is null then raise exception 'task_title_required'; end if;
  begin v_due:=nullif(v_p.proposed_payload->>'due_at','')::timestamptz; exception when others then v_due:=now()+interval '1 day'; end;
  v_priority:=greatest(1,least(coalesce(nullif(v_p.proposed_payload->>'priority','')::integer,4),5));
  insert into djm_os.tasks(title,task_type,owner_user_id,player_id,due_at,status,priority,source,tenant_id)
  values(v_title,'agency_career_strategy',p_actor_user_id,v_p.target_id,v_due,'open',v_priority,'agency_os:'||v_p.id::text,v_p.tenant_id) returning id into v_result_id;
  select to_jsonb(t) into v_after from djm_os.tasks t where t.id=v_result_id and t.tenant_id=v_p.tenant_id;
  if v_after is null or v_after->>'status'<>'open' then raise exception 'career_strategy_task_verification_failed'; end if;
  update platform.agency_action_proposals set status='applied',approved_by=p_actor_user_id,approved_at=now(),applied_at=now(),result_target_type='task',result_target_id=v_result_id,before_json=jsonb_build_object('created',true),after_json=v_after,verification_json=jsonb_build_object('verified',true,'verified_at',now(),'read_back',true,'tenant_id',v_p.tenant_id),undo_supported=true,error_message=null,updated_at=now() where id=v_p.id returning * into v_p;
  insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,snoozed_until,metadata)
  values(v_p.tenant_id,p_actor_user_id,v_p.command_id,v_p.command_type,v_p.target_type,v_p.target_id,'snoozed',greatest(v_due,now()+interval '15 minutes'),jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'career_strategy',true,'delegated_task_id',v_result_id));
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(v_p.tenant_id,p_actor_user_id,'user','agency_action.applied','agency_action',v_p.id::text,v_p.before_json,v_p.after_json,jsonb_build_object('action_type',v_p.action_type,'command_id',v_p.command_id,'source','career_strategy'));
  return jsonb_build_object('proposal_id',v_p.id,'status','applied','action_type',v_p.action_type,'target_type','task','target_id',v_result_id,'verified',true,'undo_supported',true,'external_side_effect',false);
end;$$;

create or replace function public.platform_server_undo_agency_action_core_v9(p_proposal_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_p platform.agency_action_proposals%rowtype; v_role text; v_current jsonb; v_deleted integer:=0; begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id for update; if not found then raise exception 'proposal_not_found'; end if;
  if v_p.action_type<>'create_career_strategy_task' then return public.platform_server_undo_agency_action_core_v8(p_proposal_id,p_actor_user_id); end if;
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active' where m.tenant_id=v_p.tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  if v_p.status='undone' then return jsonb_build_object('proposal_id',v_p.id,'status','undone','duplicate',true); end if;
  if v_p.status<>'applied' or not v_p.undo_supported then raise exception 'action_cannot_be_undone'; end if;
  select to_jsonb(t) into v_current from djm_os.tasks t where t.id=v_p.result_target_id and t.tenant_id=v_p.tenant_id for update;
  if v_current is null then raise exception 'task_missing_during_undo'; end if;
  if v_current->>'source' is distinct from ('agency_os:'||v_p.id::text) or v_current->>'status' is distinct from v_p.after_json->>'status' or v_current->>'title' is distinct from v_p.after_json->>'title' or v_current->>'due_at' is distinct from v_p.after_json->>'due_at' then raise exception 'target_changed_after_action_review_manually'; end if;
  delete from djm_os.tasks where id=v_p.result_target_id and tenant_id=v_p.tenant_id and source='agency_os:'||v_p.id::text; get diagnostics v_deleted=row_count; if v_deleted<>1 then raise exception 'target_changed_after_action_review_manually'; end if;
  update platform.agency_action_proposals set status='undone',undone_at=now(),updated_at=now() where id=v_p.id;
  insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,metadata) values(v_p.tenant_id,p_actor_user_id,v_p.command_id,v_p.command_type,v_p.target_type,v_p.target_id,'undone',jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'career_strategy',true));
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata) values(v_p.tenant_id,p_actor_user_id,'user','agency_action.undone','agency_action',v_p.id::text,v_p.after_json,v_p.before_json,jsonb_build_object('action_type',v_p.action_type,'command_id',v_p.command_id,'source','career_strategy'));
  return jsonb_build_object('proposal_id',v_p.id,'status','undone','undone',true,'action_type',v_p.action_type);
end;$$;

create or replace function public.platform_server_execute_agency_action(p_proposal_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_write jsonb;
  v_next_action text;
  v_next_due date;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_p.action_type<>'set_player_next_action' then return public.platform_server_execute_agency_action_core_v9(p_proposal_id,p_actor_user_id); end if;
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
end;$$;

create or replace function public.platform_server_undo_agency_action(p_proposal_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
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
  if v_p.action_type<>'set_player_next_action' then return public.platform_server_undo_agency_action_core_v9(p_proposal_id,p_actor_user_id); end if;
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=v_p.tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  if v_p.status='undone' then return jsonb_build_object('proposal_id',v_p.id,'status','undone','duplicate',true); end if;
  if v_p.status<>'applied' or not v_p.undo_supported then raise exception 'action_cannot_be_undone'; end if;
  select * into v_current from public.players p where p.id=v_p.target_id and p.tenant_id=v_p.tenant_id for update;
  if not found then raise exception 'player_missing_during_undo'; end if;
  if v_current.next_action is distinct from v_p.after_json->>'next_action' or v_current.next_action_due is distinct from nullif(v_p.after_json->>'next_action_due','')::date then raise exception 'target_changed_after_action_review_manually'; end if;
  v_before_action:=v_p.before_json->>'next_action'; begin v_before_due:=nullif(v_p.before_json->>'next_action_due','')::date; exception when others then v_before_due:=null; end;
  perform pg_catalog.set_config('djm.internal_player_service','on',true);
  update public.players set next_action=v_before_action,next_action_due=v_before_due,updated_at=now() where id=v_p.target_id and tenant_id=v_p.tenant_id;
  perform pg_catalog.set_config('djm.internal_player_service','off',true);
  update platform.agency_action_proposals set status='undone',undone_at=now(),updated_at=now() where id=v_p.id;
  insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,metadata)
  values(v_p.tenant_id,p_actor_user_id,v_p.command_id,v_p.command_type,v_p.target_type,v_p.target_id,'undone',jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'player_service',true));
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(v_p.tenant_id,p_actor_user_id,'user','agency_action.undone','agency_action',v_p.id::text,v_p.after_json,v_p.before_json,jsonb_build_object('action_type',v_p.action_type,'command_id',v_p.command_id,'source','player_service'));
  return jsonb_build_object('proposal_id',v_p.id,'status','undone','undone',true,'action_type',v_p.action_type);
end;$$;

revoke all on function public.platform_server_prepare_career_strategy_action(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_execute_agency_action_core_v9(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_undo_agency_action_core_v9(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_prepare_career_strategy_action(uuid,uuid,uuid) to service_role;
grant execute on function public.platform_server_execute_agency_action_core_v9(uuid,uuid) to service_role;
grant execute on function public.platform_server_undo_agency_action_core_v9(uuid,uuid) to service_role;;
