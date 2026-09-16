create or replace function public.platform_server_player_staff_candidates(p_tenant_id uuid,p_player_id uuid,p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_p public.players%rowtype;
  v_items jsonb;
  v_limit integer:=greatest(1,least(coalesce(p_limit,10),25));
begin
  select * into v_p from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found_for_tenant'; end if;
  with members as (
    select m.user_id,m.role,coalesce(tm.display_name,u.email,m.user_id::text) display_name
    from platform.tenant_memberships m
    join auth.users u on u.id=m.user_id
    left join djm_os.team_members tm on tm.user_id=m.user_id
    where m.tenant_id=p_tenant_id and m.status='active' and m.role in ('owner','admin','agent','operations')
  ), f as (
    select m.*,
      (case when v_p.primary_staff_user_id=m.user_id then 100 else 0 end) current_responsibility,
      (select count(*) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id and d.status='active' and d.owner_user_id=m.user_id) player_deals_owned,
      (select count(*) from djm_os.tasks t where t.tenant_id=p_tenant_id and t.player_id=p_player_id and t.status='open' and t.owner_user_id=m.user_id) player_open_tasks,
      (select count(*) from public.players p2 where p2.tenant_id=p_tenant_id and p2.football_status in ('active','free_agent') and p2.primary_staff_user_id=m.user_id) players_owned,
      (select count(*) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.status='active' and d.owner_user_id=m.user_id) active_deals_owned,
      (select count(*) from djm_os.tasks t where t.tenant_id=p_tenant_id and t.status='open' and t.owner_user_id=m.user_id) open_tasks
    from members m
  ), scored as (
    select f.*,
      least(100,
        case when current_responsibility=100 then 35 else 0 end
        + least(player_deals_owned,2)*20
        + least(player_open_tasks,2)*10
        + case role when 'owner' then 15 when 'admin' then 12 when 'agent' then 15 else 8 end
        + greatest(0,40-least(40,players_owned*8+active_deals_owned*5+open_tasks*2))
      )::integer suitability_score
    from f
  ), ranked as (
    select *,row_number() over(order by suitability_score desc,display_name) rank from scored
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',rank,'user_id',user_id,'display_name',display_name,'role',role,'suitability_score',suitability_score,
    'continuity',jsonb_build_object('current_primary_staff',current_responsibility=100,'player_deals_owned',player_deals_owned,'player_open_tasks',player_open_tasks),
    'workload_proxy',jsonb_build_object('players_owned',players_owned,'active_deals_owned',active_deals_owned,'open_tasks',open_tasks),
    'why',case when current_responsibility=100 then 'Already recorded as the player primary staff member.' when player_deals_owned>0 then 'Already owns a live deal for this player.' when player_open_tasks>0 then 'Already owns current work for this player.' else 'Available agency operator ranked using recorded continuity and workload proxy.' end
  ) order by rank),'[]'::jsonb) into v_items from ranked where rank<=v_limit;
  return jsonb_build_object('tenant_id',p_tenant_id,'player_id',p_player_id,'candidates',v_items,'best_candidate',case when jsonb_array_length(v_items)>0 then v_items->0 else null end,
    'method',jsonb_build_object('interpretation','Internal assignment aid using recorded continuity and workload proxy only. It does not measure human quality, true capacity or player preference.'));
end;
$$;

create or replace function public.platform_server_prepare_player_service_move(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_card jsonb;
  v_move jsonb;
  v_p public.players%rowtype;
  v_proposal platform.agency_action_proposals%rowtype;
  v_move_type text;
  v_title text;
  v_key text;
  v_active_deals integer:=0;
  v_market_matches integer:=0;
  v_active_opps integer:=0;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  select * into v_p from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found_for_tenant'; end if;
  v_card:=public.platform_server_player_service_card(p_tenant_id,p_player_id);
  v_move:=v_card->'next_service_move';
  v_move_type:=v_move->>'move_type';
  if v_move_type is null then raise exception 'no_player_service_move'; end if;
  v_title:=case v_move_type
    when 'execute_player_next_action' then coalesce(nullif(trim(v_p.next_action),''),'Execute player next action')
    when 'build_free_agent_market_plan' then 'Build free-agent market plan: '||trim(concat_ws(' ',v_p.first_name,v_p.last_name))
    when 'convert_market_activity_to_deal' then 'Convert market activity: '||trim(concat_ws(' ',v_p.first_name,v_p.last_name))
    when 'contract_strategy' then 'Agree contract strategy: '||trim(concat_ws(' ',v_p.first_name,v_p.last_name))
    when 'contract_planning' then 'Review contract plan: '||trim(concat_ws(' ',v_p.first_name,v_p.last_name))
    when 'protect_live_player_deal' then 'Protect live player deal: '||trim(concat_ws(' ',v_p.first_name,v_p.last_name))
    else 'Update player plan: '||trim(concat_ws(' ',v_p.first_name,v_p.last_name)) end;
  select count(*) into v_active_deals from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.player_id=p_player_id and d.status='active';
  select count(*) into v_market_matches from djm_os.player_matches pm where pm.tenant_id=p_tenant_id and pm.player_id=p_player_id and pm.status in ('suggested','reviewing','shortlisted','pitched','active');
  select count(*) into v_active_opps from public.player_opportunities po where po.tenant_id=p_tenant_id and po.player_id=p_player_id and po.stage not in ('won','lost');
  v_key:='player_service:'||p_player_id::text||':'||v_move_type||':'||coalesce(v_p.updated_at::text,'');
  select * into v_proposal from platform.agency_action_proposals where tenant_id=p_tenant_id and idempotency_key=v_key and status in ('proposed','applied') order by created_at desc limit 1;
  if found then return jsonb_build_object('proposal_id',v_proposal.id,'status',v_proposal.status,'duplicate',true,'action_type',v_proposal.action_type,'move_type',v_move_type); end if;
  insert into platform.agency_action_proposals(
    tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key,expires_at,undo_supported
  ) values(
    p_tenant_id,'player_service:'||p_player_id::text,'Player service move','create_player_service_task','player',p_player_id,'low','confirm','proposed',v_title,
    'Create one reversible internal commitment for the current highest-priority player service/career move.',
    jsonb_build_object('title',v_title,'due_at',now()+interval '1 day','priority',case when (v_card->>'service_priority_score')::integer>=75 then 5 else 4 end,
      'player_id',p_player_id,'service_move_type',v_move_type,'instruction',v_move->>'instruction','success_condition',v_move->>'success_condition',
      'baseline_next_action',v_p.next_action,'baseline_next_action_due',v_p.next_action_due,
      'baseline_active_deals',v_active_deals,'baseline_market_matches',v_market_matches,'baseline_active_opportunities',v_active_opps,
      'baseline_service_card',v_card),
    p_actor_user_id,v_key,now()+interval '24 hours',true
  ) returning * into v_proposal;
  return jsonb_build_object('proposal_id',v_proposal.id,'status','proposed','duplicate',false,'action_type',v_proposal.action_type,'move_type',v_move_type,'title',v_title,'payload',v_proposal.proposed_payload,'external_side_effect',false,'undo_supported',true);
end;
$$;

create or replace function public.platform_server_prepare_player_control_fix(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid,p_input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_card jsonb;
  v_fix jsonb;
  v_fix_type text;
  v_p public.players%rowtype;
  v_owner uuid;
  v_action text;
  v_due date;
  v_proposal platform.agency_action_proposals%rowtype;
  v_key text;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  select * into v_p from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found_for_tenant'; end if;
  v_card:=public.platform_server_player_service_card(p_tenant_id,p_player_id);
  v_fix:=v_card->'next_control_fix';
  if v_fix is null or v_fix='null'::jsonb then return jsonb_build_object('status','no_control_fix_required','player_id',p_player_id); end if;
  v_fix_type:=v_fix->>'fix_type';
  if v_fix_type='assign_primary_staff' then
    begin v_owner:=nullif(p_input->>'owner_user_id','')::uuid; exception when others then v_owner:=null; end;
    if v_owner is null then return jsonb_build_object('status','needs_input','action_type','assign_player_staff','fix_type',v_fix_type,'required_inputs',jsonb_build_array('owner_user_id'),'candidates',public.platform_server_player_staff_candidates(p_tenant_id,p_player_id,10)); end if;
    if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=v_owner and m.status='active' and m.role in ('owner','admin','agent','operations')) then raise exception 'player_staff_must_be_active_agency_operator'; end if;
    v_key:='player_control:'||p_player_id::text||':assign:'||v_owner::text||':'||coalesce(v_p.primary_staff_user_id::text,'none');
    insert into platform.agency_action_proposals(tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key,expires_at,undo_supported)
    values(p_tenant_id,'player_control:'||p_player_id::text,'Player service control','assign_player_staff','player',p_player_id,'low','confirm','proposed','Assign primary staff: '||trim(concat_ws(' ',v_p.first_name,v_p.last_name)),'Assign one accountable internal owner to the player.',jsonb_build_object('player_id',p_player_id,'owner_user_id',v_owner,'previous_owner_user_id',v_p.primary_staff_user_id),p_actor_user_id,v_key,now()+interval '24 hours',true)
    on conflict (tenant_id,idempotency_key) do update set updated_at=now() returning * into v_proposal;
  elsif v_fix_type='set_player_next_action' then
    v_action:=nullif(trim(p_input->>'next_action'),''); begin v_due:=nullif(p_input->>'next_action_due','')::date; exception when others then v_due:=null; end;
    if v_action is null or v_due is null or v_due<current_date then return jsonb_build_object('status','needs_input','action_type','set_player_next_action','fix_type',v_fix_type,'required_inputs',jsonb_build_array('next_action','next_action_due')); end if;
    v_key:='player_control:'||p_player_id::text||':next:'||md5(v_action||'|'||v_due::text);
    insert into platform.agency_action_proposals(tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key,expires_at,undo_supported)
    values(p_tenant_id,'player_control:'||p_player_id::text,'Player service control','set_player_next_action','player',p_player_id,'low','confirm','proposed','Set player next action: '||trim(concat_ws(' ',v_p.first_name,v_p.last_name)),'Keep the player service plan controlled with one explicit next action.',jsonb_build_object('player_id',p_player_id,'next_action',v_action,'next_action_due',v_due,'previous_next_action',v_p.next_action,'previous_next_action_due',v_p.next_action_due),p_actor_user_id,v_key,now()+interval '24 hours',true)
    on conflict (tenant_id,idempotency_key) do update set updated_at=now() returning * into v_proposal;
  else raise exception 'unsupported_player_control_fix:%',v_fix_type; end if;
  return jsonb_build_object('proposal_id',v_proposal.id,'status',v_proposal.status,'action_type',v_proposal.action_type,'fix_type',v_fix_type,'external_side_effect',false,'undo_supported',true,'payload',v_proposal.proposed_payload);
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
  v_task_actions text[]:=array['create_search_task','create_player_task','create_relationship_task','create_verification_task','create_introduction_task','create_deal_blocker_task','create_deal_decision_task','create_negotiation_task','create_player_service_task'];
begin
  if new.action_type=any(v_task_actions) and new.status='applied' and new.result_target_id is not null then
    select * into v_task from djm_os.tasks where id=new.result_target_id and tenant_id=new.tenant_id;
    if found then
      v_status:=case when v_task.status='completed' then 'completed' when v_task.due_at is not null and v_task.due_at<now() then 'overdue' else 'active' end;
      insert into platform.agency_commitments(tenant_id,proposal_id,command_id,task_id,owner_user_id,status,due_at,completed_at,metadata)
      values(new.tenant_id,new.id,new.command_id,v_task.id,coalesce(new.approved_by,new.requested_by),v_status,v_task.due_at,v_task.completed_at,
        jsonb_build_object('action_type',new.action_type,'source','agency_os','target_type',new.target_type,'target_id',new.target_id,'task_title',v_task.title,'task_source',v_task.source,'verification_task',new.action_type='create_verification_task','deal_control_task',new.action_type in ('create_deal_blocker_task','create_deal_decision_task'),'negotiation_task',new.action_type='create_negotiation_task','player_service_task',new.action_type='create_player_service_task','service_move_type',new.proposed_payload->>'service_move_type','deal_room_id',new.proposed_payload->>'deal_room_id','deal_step_type',new.proposed_payload->>'deal_step_type','negotiation_step_type',new.proposed_payload->>'negotiation_step_type','target_gap',new.proposed_payload->>'target_gap'))
      on conflict (proposal_id) do update set task_id=excluded.task_id,owner_user_id=excluded.owner_user_id,status=excluded.status,due_at=excluded.due_at,completed_at=excluded.completed_at,metadata=platform.agency_commitments.metadata||excluded.metadata,updated_at=now();
    end if;
  elsif new.action_type=any(v_task_actions) and new.status='undone' then
    update platform.agency_commitments set status='cancelled',updated_at=now(),metadata=metadata||jsonb_build_object('cancelled_by_undo',true,'cancelled_at',now()) where proposal_id=new.id and status<>'cancelled';
  end if;
  return new;
end;
$$;

alter function public.platform_server_execute_agency_action(uuid,uuid) rename to platform_server_execute_agency_action_core_v7;
alter function public.platform_server_undo_agency_action(uuid,uuid) rename to platform_server_undo_agency_action_core_v7;

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
  v_owner uuid;
  v_next_action text;
  v_next_due date;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_p.action_type not in ('create_player_service_task','assign_player_staff','set_player_next_action') then return public.platform_server_execute_agency_action_core_v7(p_proposal_id,p_actor_user_id); end if;
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active' where m.tenant_id=v_p.tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  if v_p.status='applied' then return jsonb_build_object('proposal_id',v_p.id,'status','applied','duplicate',true); end if;
  if v_p.status<>'proposed' then raise exception 'proposal_not_executable:%',v_p.status; end if;
  if v_p.expires_at<=now() then update platform.agency_action_proposals set status='expired',updated_at=now() where id=v_p.id; raise exception 'proposal_expired'; end if;

  if v_p.action_type='create_player_service_task' then
    v_title:=nullif(trim(v_p.proposed_payload->>'title'),''); if v_title is null then raise exception 'task_title_required'; end if;
    begin v_due:=nullif(v_p.proposed_payload->>'due_at','')::timestamptz; exception when others then v_due:=now()+interval '1 day'; end;
    if v_due is null then v_due:=now()+interval '1 day'; end if;
    v_priority:=greatest(1,least(coalesce(nullif(v_p.proposed_payload->>'priority','')::integer,4),5));
    v_before:=jsonb_build_object('created',true);
    insert into djm_os.tasks(title,task_type,owner_user_id,player_id,due_at,status,priority,source,tenant_id)
    values(v_title,'agency_player_service',p_actor_user_id,v_p.target_id,v_due,'open',v_priority,'agency_os:'||v_p.id::text,v_p.tenant_id) returning id into v_result_id;
    select to_jsonb(t) into v_after from djm_os.tasks t where t.id=v_result_id and t.tenant_id=v_p.tenant_id;
    if v_after is null or v_after->>'status'<>'open' then raise exception 'task_creation_verification_failed'; end if;
  elsif v_p.action_type='assign_player_staff' then
    begin v_owner:=nullif(v_p.proposed_payload->>'owner_user_id','')::uuid; exception when others then v_owner:=null; end; if v_owner is null then raise exception 'owner_user_id_required'; end if;
    if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=v_p.tenant_id and m.user_id=v_owner and m.status='active' and m.role in ('owner','admin','agent','operations')) then raise exception 'player_staff_must_be_active_agency_operator'; end if;
    select to_jsonb(p) into v_before from public.players p where p.id=v_p.target_id and p.tenant_id=v_p.tenant_id for update; if v_before is null then raise exception 'player_not_found'; end if;
    update public.players set primary_staff_user_id=v_owner,updated_at=now() where id=v_p.target_id and tenant_id=v_p.tenant_id returning id into v_result_id;
    select to_jsonb(p) into v_after from public.players p where p.id=v_result_id and p.tenant_id=v_p.tenant_id; if v_after->>'primary_staff_user_id' is distinct from v_owner::text then raise exception 'player_staff_write_verification_failed'; end if;
  elsif v_p.action_type='set_player_next_action' then
    v_next_action:=nullif(trim(v_p.proposed_payload->>'next_action'),''); begin v_next_due:=nullif(v_p.proposed_payload->>'next_action_due','')::date; exception when others then v_next_due:=null; end;
    if v_next_action is null or v_next_due is null or v_next_due<current_date then raise exception 'valid_player_next_action_required'; end if;
    select to_jsonb(p) into v_before from public.players p where p.id=v_p.target_id and p.tenant_id=v_p.tenant_id for update; if v_before is null then raise exception 'player_not_found'; end if;
    update public.players set next_action=v_next_action,next_action_due=v_next_due,updated_at=now() where id=v_p.target_id and tenant_id=v_p.tenant_id returning id into v_result_id;
    select to_jsonb(p) into v_after from public.players p where p.id=v_result_id and p.tenant_id=v_p.tenant_id; if v_after->>'next_action' is distinct from v_next_action or (v_after->>'next_action_due')::date is distinct from v_next_due then raise exception 'player_next_action_write_verification_failed'; end if;
  end if;

  update platform.agency_action_proposals set status='applied',approved_by=p_actor_user_id,approved_at=now(),applied_at=now(),result_target_type=case when v_p.action_type='create_player_service_task' then 'task' else 'player' end,result_target_id=v_result_id,before_json=v_before,after_json=v_after,verification_json=jsonb_build_object('verified',true,'verified_at',now(),'read_back',true,'tenant_id',v_p.tenant_id),undo_supported=true,error_message=null,updated_at=now() where id=v_p.id returning * into v_p;
  insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,snoozed_until,metadata)
  values(v_p.tenant_id,p_actor_user_id,v_p.command_id,v_p.command_type,v_p.target_type,v_p.target_id,case when v_p.action_type='create_player_service_task' then 'snoozed' else 'completed' end,case when v_p.action_type='create_player_service_task' then greatest(v_due,now()+interval '15 minutes') else null end,jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'player_service',true,'delegated_task_id',case when v_p.action_type='create_player_service_task' then v_result_id else null end));
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata) values(v_p.tenant_id,p_actor_user_id,'user','agency_action.applied','agency_action',v_p.id::text,v_before,v_after,jsonb_build_object('action_type',v_p.action_type,'command_id',v_p.command_id,'verified',true,'source','player_service'));
  return jsonb_build_object('proposal_id',v_p.id,'status','applied','action_type',v_p.action_type,'target_type',v_p.result_target_type,'target_id',v_p.result_target_id,'verified',true,'undo_supported',true,'external_side_effect',false);
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
  v_current jsonb;
  v_deleted integer:=0;
  v_before_owner uuid;
  v_before_action text;
  v_before_due date;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id for update; if not found then raise exception 'proposal_not_found'; end if;
  if v_p.action_type not in ('create_player_service_task','assign_player_staff','set_player_next_action') then return public.platform_server_undo_agency_action_core_v7(p_proposal_id,p_actor_user_id); end if;
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active' where m.tenant_id=v_p.tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1; if v_role is null then raise exception 'agency_operator_access_required'; end if;
  if v_p.status='undone' then return jsonb_build_object('proposal_id',v_p.id,'status','undone','duplicate',true); end if;
  if v_p.status<>'applied' or not v_p.undo_supported then raise exception 'action_cannot_be_undone'; end if;
  if v_p.action_type='create_player_service_task' then
    select to_jsonb(t) into v_current from djm_os.tasks t where t.id=v_p.result_target_id and t.tenant_id=v_p.tenant_id for update; if v_current is null then raise exception 'task_missing_during_undo'; end if;
    if v_current->>'source' is distinct from ('agency_os:'||v_p.id::text) or v_current->>'status' is distinct from v_p.after_json->>'status' or v_current->>'title' is distinct from v_p.after_json->>'title' or v_current->>'due_at' is distinct from v_p.after_json->>'due_at' then raise exception 'target_changed_after_action_review_manually'; end if;
    delete from djm_os.tasks where id=v_p.result_target_id and tenant_id=v_p.tenant_id and source='agency_os:'||v_p.id::text; get diagnostics v_deleted=row_count; if v_deleted<>1 then raise exception 'target_changed_after_action_review_manually'; end if;
  elsif v_p.action_type='assign_player_staff' then
    select to_jsonb(p) into v_current from public.players p where p.id=v_p.result_target_id and p.tenant_id=v_p.tenant_id for update; if v_current is null then raise exception 'player_missing_during_undo'; end if; if v_current->>'primary_staff_user_id' is distinct from v_p.after_json->>'primary_staff_user_id' then raise exception 'target_changed_after_action_review_manually'; end if;
    begin v_before_owner:=nullif(v_p.before_json->>'primary_staff_user_id','')::uuid; exception when others then v_before_owner:=null; end; update public.players set primary_staff_user_id=v_before_owner,updated_at=now() where id=v_p.result_target_id and tenant_id=v_p.tenant_id;
  elsif v_p.action_type='set_player_next_action' then
    select to_jsonb(p) into v_current from public.players p where p.id=v_p.result_target_id and p.tenant_id=v_p.tenant_id for update; if v_current is null then raise exception 'player_missing_during_undo'; end if; if v_current->>'next_action' is distinct from v_p.after_json->>'next_action' or v_current->>'next_action_due' is distinct from v_p.after_json->>'next_action_due' then raise exception 'target_changed_after_action_review_manually'; end if;
    v_before_action:=v_p.before_json->>'next_action'; begin v_before_due:=nullif(v_p.before_json->>'next_action_due','')::date; exception when others then v_before_due:=null; end; update public.players set next_action=v_before_action,next_action_due=v_before_due,updated_at=now() where id=v_p.result_target_id and tenant_id=v_p.tenant_id;
  end if;
  update platform.agency_action_proposals set status='undone',undone_at=now(),updated_at=now() where id=v_p.id;
  insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,metadata) values(v_p.tenant_id,p_actor_user_id,v_p.command_id,v_p.command_type,v_p.target_type,v_p.target_id,'undone',jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'player_service',true));
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata) values(v_p.tenant_id,p_actor_user_id,'user','agency_action.undone','agency_action',v_p.id::text,v_p.after_json,v_p.before_json,jsonb_build_object('action_type',v_p.action_type,'command_id',v_p.command_id,'source','player_service'));
  return jsonb_build_object('proposal_id',v_p.id,'status','undone','undone',true,'action_type',v_p.action_type);
end;
$$;

alter function platform.evaluate_agency_action_outcome(uuid) rename to evaluate_agency_action_outcome_core_v7;
create or replace function platform.evaluate_agency_action_outcome(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_commitment platform.agency_commitments%rowtype;
  v_player public.players%rowtype;
  v_move text;
  v_operational text:='pending';
  v_downstream text:='pending';
  v_key text:='player_service_outcome_pending';
  v_window_end timestamptz;
  v_first timestamptz:=null;
  v_active_deals integer:=0;
  v_matches integer:=0;
  v_opps integer:=0;
  v_base_deals integer:=0;
  v_base_matches integer:=0;
  v_base_opps integer:=0;
  v_deal_activity integer:=0;
  v_evidence jsonb;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id; if not found then raise exception 'proposal_not_found'; end if;
  if v_p.action_type<>'create_player_service_task' then return platform.evaluate_agency_action_outcome_core_v7(p_proposal_id); end if;
  v_window_end:=coalesce(v_p.applied_at,v_p.created_at)+interval '14 days'; v_move:=v_p.proposed_payload->>'service_move_type';
  if v_p.status='undone' then v_operational:='cancelled';v_downstream:='cancelled';v_key:='action_undone';
  elsif v_p.status='failed' then v_operational:='failed';v_downstream:='not_applicable';v_key:='execution_failed';
  elsif v_p.status<>'applied' then v_operational:='pending';v_downstream:='not_applicable';v_key:='not_applied';
  else
    select * into v_commitment from platform.agency_commitments c where c.proposal_id=v_p.id;
    v_operational:=case when v_commitment.status='completed' then 'completed' when v_commitment.status='cancelled' then 'cancelled' else 'pending' end;
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
  v_evidence:=jsonb_build_object('player_id',v_p.target_id,'service_move_type',v_move,'task_id',v_commitment.task_id,'commitment_status',v_commitment.status,'baseline_active_deals',v_base_deals,'current_active_deals',v_active_deals,'baseline_market_matches',v_base_matches,'current_market_matches',v_matches,'baseline_active_opportunities',v_base_opps,'current_active_opportunities',v_opps,'success_definition','Player service work succeeds only when the player plan, market coverage or live-deal movement changes. Completing the task alone is not downstream success.');
  insert into platform.agency_action_outcomes(tenant_id,proposal_id,action_type,operational_state,downstream_state,outcome_key,evaluation_window_end,first_observed_at,last_evaluated_at,evidence)
  values(v_p.tenant_id,v_p.id,v_p.action_type,v_operational,v_downstream,v_key,v_window_end,v_first,now(),v_evidence)
  on conflict (proposal_id) do update set operational_state=excluded.operational_state,downstream_state=excluded.downstream_state,outcome_key=excluded.outcome_key,evaluation_window_end=excluded.evaluation_window_end,first_observed_at=coalesce(platform.agency_action_outcomes.first_observed_at,excluded.first_observed_at),last_evaluated_at=now(),evidence=excluded.evidence,updated_at=now()
  returning first_observed_at into v_first;
  return jsonb_build_object('proposal_id',v_p.id,'action_type',v_p.action_type,'service_move_type',v_move,'operational_state',v_operational,'downstream_state',v_downstream,'outcome_key',v_key,'evaluation_window_end',v_window_end,'first_observed_at',v_first,'evidence',v_evidence);
end;
$$;

revoke all on function public.platform_server_player_staff_candidates(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.platform_server_prepare_player_service_move(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_prepare_player_control_fix(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_player_staff_candidates(uuid,uuid,integer) to service_role;
grant execute on function public.platform_server_prepare_player_service_move(uuid,uuid,uuid) to service_role;
grant execute on function public.platform_server_prepare_player_control_fix(uuid,uuid,uuid,jsonb) to service_role;;
