create or replace function public.platform_server_prepare_play_action(p_tenant_id uuid, p_play_id text, p_actor_user_id uuid, p_input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_play jsonb;
  v_play_type text;
  v_command_id text;
  v_person_id uuid;
  v_org_id uuid;
  v_player_id uuid;
  v_need_id uuid;
  v_deal_id uuid;
  v_target_id uuid;
  v_target_type text;
  v_due timestamptz;
  v_title text;
  v_idempotency text;
  v_proposal platform.agency_action_proposals%rowtype;
  v_health jsonb;
begin
  if jsonb_typeof(coalesce(p_input,'{}'::jsonb))<>'object' then raise exception 'input_must_be_object'; end if;
  if trim(coalesce(p_play_id,''))='' then raise exception 'play_id_required'; end if;
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','scout','operations') limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;

  select x.value into v_play from jsonb_array_elements(public.platform_server_agency_playbook(p_tenant_id,20)->'plays') x where x.value->>'play_id'=p_play_id limit 1;
  if v_play is null then raise exception 'strategic_play_no_longer_available'; end if;
  v_play_type:=v_play->>'play_type';
  v_health:=coalesce(v_play->'evidence_health','{}'::jsonb);

  if v_play->>'evidence_gate'='verify_first' or v_play_type in ('validate_evidence_before_pitch','verify_need_before_sourcing','verify_deal_evidence_first') then
    begin v_deal_id:=nullif(v_play->'evidence'->>'deal_room_id','')::uuid; exception when others then v_deal_id:=null; end;
    begin v_need_id:=nullif(v_play->'evidence'->>'club_need_id','')::uuid; exception when others then v_need_id:=null; end;
    if v_need_id is null then begin v_need_id:=nullif(v_play->'evidence'->'pursuit'->>'club_need_id','')::uuid; exception when others then v_need_id:=null; end; end if;
    begin v_org_id:=nullif(v_play->'evidence'->>'organisation_id','')::uuid; exception when others then v_org_id:=null; end;
    if v_org_id is null then begin v_org_id:=nullif(v_play->'evidence'->'pursuit'->'club'->>'organisation_id','')::uuid; exception when others then v_org_id:=null; end; end if;
    begin v_player_id:=nullif(v_play->'evidence'->>'player_id','')::uuid; exception when others then v_player_id:=null; end;
    if v_player_id is null then begin v_player_id:=nullif(v_play->'evidence'->'pursuit'->'player'->>'player_id','')::uuid; exception when others then v_player_id:=null; end; end if;

    if v_deal_id is not null then v_target_type:='deal_room'; v_target_id:=v_deal_id;
    elsif v_need_id is not null then v_target_type:='club_need'; v_target_id:=v_need_id;
    elsif v_player_id is not null then v_target_type:='player'; v_target_id:=v_player_id;
    else v_target_type:='organisation'; v_target_id:=v_org_id; end if;
    if v_target_id is null then raise exception 'verification_target_unavailable'; end if;

    begin v_due:=nullif(p_input->>'due_at','')::timestamptz; exception when others then raise exception 'invalid_due_at'; end;
    if v_due is null then v_due:=now()+interval '6 hours'; end if;
    v_title:=coalesce(nullif(trim(p_input->>'title'),''),'Verify evidence before: '||(v_play->>'title'));
    v_idempotency:=md5('play|'||p_play_id||'|verify|'||coalesce(p_input,'{}'::jsonb)::text);

    insert into platform.agency_action_proposals(
      tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key
    ) values(
      p_tenant_id,'strategic_play:'||p_play_id,'Strategic play evidence verification','create_verification_task',v_target_type,v_target_id,
      'low','confirm','proposed',v_title,
      'The strategic play remains important, but the evidence gate is below the action threshold. Verify the underlying facts before executing the commercial play.',
      jsonb_build_object('title',v_title,'due_at',v_due,'priority',case when coalesce((v_play->>'play_score')::integer,0)>=90 then 5 else 4 end,
        'organisation_id',v_org_id,'player_id',v_player_id,'club_need_id',v_need_id,'play_id',p_play_id,
        'evidence_health',v_health,'blocked_play_type',v_play->>'original_play_type','recommended_action',v_play->>'recommended_action'),
      p_actor_user_id,v_idempotency
    )
    on conflict (tenant_id,idempotency_key) where status in ('proposed','needs_input','applied')
    do update set title=excluded.title,rationale=excluded.rationale,proposed_payload=excluded.proposed_payload,updated_at=now()
    returning * into v_proposal;

    insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
    values(p_tenant_id,p_actor_user_id,'user','strategic_play.verification_prepared','agency_action',v_proposal.id::text,
      jsonb_build_object('play_id',p_play_id,'play_type',v_play_type,'action_type','create_verification_task','evidence_health',v_health),
      jsonb_build_object('source','agency_playbook','evidence_gate','verify_first'));

    return jsonb_build_object('proposal_id',v_proposal.id,'play_id',p_play_id,'action_type','create_verification_task','risk_level','low','approval_mode','confirm','status',v_proposal.status,
      'title',v_proposal.title,'rationale',v_proposal.rationale,'payload',v_proposal.proposed_payload,'expires_at',v_proposal.expires_at,'executable',true,'evidence_health',v_health);
  end if;

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
    v_title:=coalesce(nullif(trim(p_input->>'title'),''),case when v_play_type='strengthen_access_before_pitch' then 'Strengthen club route before pursuing '||(v_play->>'title') else 'Validate club demand before pursuing '||(v_play->>'title') end);
    v_idempotency:=md5('play|'||p_play_id||'|'||coalesce(p_input,'{}'::jsonb)::text);
    insert into platform.agency_action_proposals(tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key)
    values(p_tenant_id,'strategic_play:'||p_play_id,'Strategic play: '||v_play_type,'create_relationship_task',case when v_person_id is not null then 'person' else 'organisation' end,coalesce(v_person_id,v_org_id),
      'low','confirm','proposed',v_title,v_play->>'rationale',jsonb_build_object('title',v_title,'due_at',v_due,'priority',4,'person_id',v_person_id,'organisation_id',v_org_id,'player_id',v_player_id,'play_id',p_play_id,'recommended_action',v_play->>'recommended_action'),p_actor_user_id,v_idempotency)
    on conflict (tenant_id,idempotency_key) where status in ('proposed','needs_input','applied') do update set title=excluded.title,rationale=excluded.rationale,proposed_payload=excluded.proposed_payload,updated_at=now()
    returning * into v_proposal;
    insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
    values(p_tenant_id,p_actor_user_id,'user','strategic_play.prepared','agency_action',v_proposal.id::text,jsonb_build_object('play_id',p_play_id,'play_type',v_play_type,'action_type','create_relationship_task'),jsonb_build_object('source','agency_playbook'));
    return jsonb_build_object('proposal_id',v_proposal.id,'play_id',p_play_id,'action_type',v_proposal.action_type,'risk_level','low','approval_mode','confirm','status',v_proposal.status,'title',v_proposal.title,'rationale',v_proposal.rationale,'payload',v_proposal.proposed_payload,'expires_at',v_proposal.expires_at,'executable',true);
  elsif v_play_type='pitch_now' then
    v_idempotency:=md5('play|'||p_play_id||'|review_pitch');
    insert into platform.agency_action_proposals(tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key)
    values(p_tenant_id,'strategic_play:'||p_play_id,'Strategic play: pitch review','review_pitch','player_match',(v_play->'evidence'->'pursuit'->>'player_match_id')::uuid,'high','review_only','proposed','Review pitch: '||(v_play->>'title'),v_play->>'rationale',v_play->'evidence',p_actor_user_id,v_idempotency)
    on conflict (tenant_id,idempotency_key) where status in ('proposed','needs_input','applied') do update set updated_at=now()
    returning * into v_proposal;
    return jsonb_build_object('proposal_id',v_proposal.id,'play_id',p_play_id,'action_type','review_pitch','risk_level','high','approval_mode','review_only','status',v_proposal.status,'title',v_proposal.title,'rationale',v_proposal.rationale,'payload',v_proposal.proposed_payload,'executable',false,'reason','External pitch remains human-led.');
  else
    raise exception 'play_requires_manual_review';
  end if;
end;
$$;

revoke all on function public.platform_server_prepare_play_action(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_prepare_play_action(uuid,text,uuid,jsonb) to service_role;;
