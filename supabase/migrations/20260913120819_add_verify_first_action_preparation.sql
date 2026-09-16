create or replace function public.platform_server_prepare_command_action(p_tenant_id uuid, p_command_id text, p_actor_user_id uuid, p_input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_feed jsonb;
  v_command jsonb;
  v_command_type text;
  v_source_type text;
  v_source_id uuid;
  v_action_type text;
  v_target_type text;
  v_target_id uuid;
  v_risk text;
  v_approval text;
  v_status text := 'proposed';
  v_title text;
  v_rationale text;
  v_payload jsonb := '{}'::jsonb;
  v_idempotency text;
  v_proposal platform.agency_action_proposals%rowtype;
  v_next_action text;
  v_next_at timestamptz;
  v_actionability jsonb;
  v_health jsonb;
  v_org_id uuid;
  v_player_id uuid;
  v_need_id uuid;
begin
  if jsonb_typeof(coalesce(p_input,'{}'::jsonb)) <> 'object' then raise exception 'input_must_be_object'; end if;
  if trim(coalesce(p_command_id,''))='' then raise exception 'command_id_required'; end if;

  select m.role into v_role
  from platform.tenant_memberships m
  join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active'
    and m.role in ('owner','admin','agent','scout','operations')
  limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;

  v_feed := public.platform_server_agency_decisions(p_tenant_id,25);
  select c.value into v_command
  from jsonb_array_elements(coalesce(v_feed->'commands','[]'::jsonb)) c
  where c.value->>'command_id'=p_command_id
  limit 1;
  if v_command is null then raise exception 'command_no_longer_actionable'; end if;

  v_command_type := v_command->>'command_type';
  v_source_type := v_command->>'source_type';
  v_actionability := coalesce(v_command->'actionability','{}'::jsonb);
  v_health := coalesce(v_command->'evidence_health','{}'::jsonb);
  begin v_source_id := nullif(v_command->>'source_id','')::uuid; exception when invalid_text_representation then v_source_id := null; end;

  if v_actionability->>'action_type'='create_verification_task' then
    v_action_type := 'create_verification_task';
    v_target_type := coalesce(v_source_type,'unknown');
    v_target_id := v_source_id;
    v_risk := 'low';
    v_approval := 'confirm';
    v_title := 'Verify evidence: '||coalesce(v_command->>'title','agency decision');
    v_rationale := 'This item remains important, but the current evidence is not strong enough for normal action. Verify the underlying facts first.';

    if v_source_type='deal_room' then
      select d.organisation_id,d.player_id,d.club_need_id into v_org_id,v_player_id,v_need_id
      from djm_os.deal_rooms d where d.id=v_source_id and d.tenant_id=p_tenant_id;
    elsif v_source_type='club_need' then
      select n.organisation_id,n.id into v_org_id,v_need_id
      from djm_os.club_needs n where n.id=v_source_id and n.tenant_id=p_tenant_id;
      begin v_player_id:=nullif(v_command->>'player_id','')::uuid; exception when others then v_player_id:=null; end;
    elsif v_source_type='player' then
      v_player_id:=v_source_id;
    end if;

    v_payload := jsonb_build_object(
      'title',coalesce(nullif(trim(p_input->>'title'),''),v_title),
      'due_at',coalesce(p_input->>'due_at',(now()+interval '6 hours')::text),
      'priority',case when (v_command->>'priority_score')::integer>=88 then 5 when (v_command->>'priority_score')::integer>=72 then 4 else 3 end,
      'organisation_id',v_org_id,
      'player_id',v_player_id,
      'club_need_id',v_need_id,
      'evidence_health',v_health,
      'blocked_action',v_actionability->'blocked_action',
      'verification_reasons',v_health->'verify_reasons'
    );

  elsif v_source_type='task' and v_command_type='Complete follow-up' then
    v_action_type := 'complete_task'; v_target_type := 'task'; v_target_id := v_source_id;
    v_risk := 'low'; v_approval := 'confirm';
    v_title := 'Complete: '||coalesce(v_command->>'title','follow-up');
    v_rationale := coalesce(v_command->>'why_now','The follow-up is currently actionable.');
    v_payload := jsonb_build_object('task_id',v_source_id);
  elsif v_source_type='task' and v_command_type='Consolidate duplicate follow-up' then
    v_action_type := 'consolidate_duplicate_tasks'; v_target_type := 'task_group'; v_target_id := v_source_id;
    v_risk := 'medium'; v_approval := 'review_only';
    v_title := 'Review duplicate follow-ups';
    v_rationale := 'The OS detected multiple open records that appear to represent the same follow-up. Automatic consolidation stays disabled until task-merging semantics are explicitly approved.';
    v_payload := jsonb_build_object('canonical_task_id',v_source_id,'tasks',v_command->'evidence'->'tasks');
  elsif v_source_type='deal_room' then
    v_action_type := 'set_deal_next_action'; v_target_type := 'deal_room'; v_target_id := v_source_id;
    v_risk := 'medium'; v_approval := 'input_then_confirm';
    v_title := 'Set the next action: '||coalesce(v_command->>'title','deal');
    v_rationale := coalesce(v_command->>'why_now','The deal requires a concrete next step.');
    v_next_action := nullif(trim(coalesce(p_input->>'next_action_text','')),'');
    begin v_next_at := nullif(p_input->>'next_action_at','')::timestamptz; exception when others then raise exception 'invalid_next_action_at'; end;
    if v_next_action is null or v_next_at is null then v_status := 'needs_input';
    elsif v_next_at <= now() then raise exception 'next_action_at_must_be_future'; end if;
    v_payload := jsonb_build_object('deal_room_id',v_source_id,'next_action_text',v_next_action,'next_action_at',v_next_at,'suggested_text',v_command->>'recommended_action');
  elsif v_source_type='club_need' and v_command_type='Live club need has no player match' then
    v_action_type := 'create_search_task'; v_target_type := 'club_need'; v_target_id := v_source_id;
    v_risk := 'low'; v_approval := 'confirm';
    v_title := 'Create search task: '||coalesce(v_command->>'title','club need');
    v_rationale := coalesce(v_command->>'why_now','The live need has no suitable match yet.');
    v_payload := jsonb_build_object('club_need_id',v_source_id,'title',coalesce(nullif(trim(p_input->>'title'),''),'Find options for '||coalesce(v_command->'evidence'->>'need_title',v_command->>'title','club need')),'due_at',coalesce(p_input->>'due_at',(now()+interval '1 day')::text),'priority',coalesce(nullif(p_input->>'priority','')::integer,4));
  elsif v_source_type='player' and v_command_type in ('Player follow-up due','Contract decision approaching','Player review required') then
    v_action_type := 'create_player_task'; v_target_type := 'player'; v_target_id := v_source_id;
    v_risk := 'low'; v_approval := 'confirm';
    v_title := 'Create player action: '||coalesce(v_command->>'title','player');
    v_rationale := coalesce(v_command->>'why_now','The player requires an action.');
    v_payload := jsonb_build_object('player_id',v_source_id,'title',coalesce(nullif(trim(p_input->>'title'),''),v_command->>'recommended_action'),'due_at',coalesce(p_input->>'due_at',(now()+interval '1 day')::text),'priority',case when (v_command->>'priority_score')::integer >= 88 then 5 when (v_command->>'priority_score')::integer >= 72 then 4 else 3 end);
  elsif v_source_type='club_need' and v_command_type='Review player match for live club need' then
    v_action_type := 'create_deal_from_match'; v_target_type := 'club_need'; v_target_id := v_source_id;
    v_risk := 'high'; v_approval := 'review_only';
    v_title := 'Review opportunity creation: '||coalesce(v_command->>'title','club need');
    v_rationale := 'Creating a live deal changes the commercial pipeline. The OS can prepare the context, but this remains review-first.';
    v_payload := jsonb_build_object('club_need_id',v_source_id,'player_id',v_command->>'player_id','match',v_command->'evidence','evidence_health',v_health);
  elsif v_source_type='capture' then
    v_action_type := 'resolve_capture_clarification'; v_target_type := 'capture'; v_target_id := v_source_id;
    v_risk := 'high'; v_approval := 'review_only';
    v_title := 'Answer Tell DJM clarification';
    v_rationale := 'The capture is intentionally blocked because evidence or identity is ambiguous. Human input is required.';
    v_payload := jsonb_build_object('capture_id',v_source_id,'receipt',v_command->'evidence'->'receipt');
  else
    v_action_type := 'review_command'; v_target_type := coalesce(v_source_type,'unknown'); v_target_id := v_source_id;
    v_risk := 'high'; v_approval := 'review_only';
    v_title := 'Review: '||coalesce(v_command->>'title','agency command');
    v_rationale := 'No safe executable handler is approved for this command type yet.';
    v_payload := jsonb_build_object('command',v_command);
  end if;

  v_idempotency := md5(p_command_id||'|'||v_action_type||'|'||coalesce(p_input,'{}'::jsonb)::text);

  insert into platform.agency_action_proposals(
    tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key
  ) values (
    p_tenant_id,p_command_id,v_command_type,v_action_type,v_target_type,v_target_id,v_risk,v_approval,v_status,v_title,v_rationale,v_payload,p_actor_user_id,v_idempotency
  )
  on conflict (tenant_id,idempotency_key) where status in ('proposed','needs_input','applied')
  do update set title=excluded.title,rationale=excluded.rationale,proposed_payload=excluded.proposed_payload,updated_at=now()
  returning * into v_proposal;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','agency_action.prepared','agency_action',v_proposal.id::text,
    jsonb_build_object('command_id',p_command_id,'action_type',v_action_type,'risk_level',v_risk,'approval_mode',v_approval,'status',v_proposal.status),
    jsonb_build_object('source','agency_command_engine','priority_score',v_command->>'priority_score','decision_basis',v_command->'decision_basis','evidence_health',v_health));

  return jsonb_build_object(
    'proposal_id',v_proposal.id,'command_id',v_proposal.command_id,'action_type',v_proposal.action_type,
    'risk_level',v_proposal.risk_level,'approval_mode',v_proposal.approval_mode,'status',v_proposal.status,
    'title',v_proposal.title,'rationale',v_proposal.rationale,'payload',v_proposal.proposed_payload,
    'expires_at',v_proposal.expires_at,'executable',v_proposal.approval_mode <> 'review_only' and v_proposal.status='proposed',
    'decision_basis',v_command->'decision_basis','priority_score',(v_command->>'priority_score')::integer,'evidence_health',v_health
  );
end;
$$;

revoke all on function public.platform_server_prepare_command_action(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_prepare_command_action(uuid,text,uuid,jsonb) to service_role;;
