alter function public.platform_server_prepare_deal_step(uuid,uuid,text,uuid,jsonb) rename to platform_server_prepare_deal_step_core_v1;

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
  v_due timestamptz;
  v_title text;
  v_idempotency text;
  v_proposal platform.agency_action_proposals%rowtype;
begin
  if p_step_type not in ('recover_momentum','force_decision_or_park') then
    return public.platform_server_prepare_deal_step_core_v1(p_tenant_id,p_deal_room_id,p_step_type,p_actor_user_id,p_input);
  end if;

  if jsonb_typeof(coalesce(p_input,'{}'::jsonb))<>'object' then raise exception 'input_must_be_object'; end if;
  select m.role into v_role
  from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active'
    and m.role in ('owner','admin','agent','scout','operations') limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;

  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id and d.status='active';
  if not found then raise exception 'active_deal_not_found_for_tenant'; end if;
  v_war:=public.platform_server_deal_war_room(p_tenant_id,p_deal_room_id);
  select x.value into v_step from jsonb_array_elements(coalesce(v_war->'closing_sequence','[]'::jsonb)) x where x.value->>'step_type'=p_step_type limit 1;
  if v_step is null then raise exception 'deal_step_no_longer_actionable'; end if;

  begin v_due:=nullif(p_input->>'due_at','')::timestamptz; exception when others then raise exception 'invalid_due_at'; end;
  if v_due is null then v_due:=case when p_step_type='force_decision_or_park' then now()+interval '1 day' else now()+interval '2 days' end; end if;
  v_title:=coalesce(nullif(trim(p_input->>'title'),''),case when p_step_type='force_decision_or_park' then 'Force decision: ' else 'Recover momentum: ' end||v_deal.title);
  v_idempotency:=md5('deal_step|'||p_deal_room_id::text||'|'||p_step_type||'|'||coalesce(p_input,'{}'::jsonb)::text);

  insert into platform.agency_action_proposals(
    tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key
  ) values(
    p_tenant_id,'deal_step:'||p_deal_room_id::text||':'||p_step_type,'Deal War Room: '||p_step_type,'create_deal_decision_task','deal_room',p_deal_room_id,
    'low','confirm','proposed',v_title,
    case when p_step_type='force_decision_or_park'
      then 'The deal is strategically important but has stopped producing forward movement. Create a decision checkpoint that must end in progress, a materially different route, or an explicit park/close decision.'
      else 'The deal is cooling. Create a decision-producing recovery checkpoint rather than another low-information status follow-up.' end,
    jsonb_build_object(
      'title',v_title,'due_at',v_due,'priority',case when p_step_type='force_decision_or_park' then 5 else 4 end,
      'organisation_id',v_deal.organisation_id,'player_id',v_deal.player_id,'club_need_id',v_deal.club_need_id,'deal_room_id',v_deal.id,
      'deal_step_type',p_step_type,'baseline_stage',v_deal.stage,'baseline_status',v_deal.status,'baseline_probability',coalesce(v_deal.probability,v_deal.manual_probability,v_deal.model_probability),
      'baseline_blocker',v_deal.primary_blocker,'baseline_next_decision',v_deal.next_decision,
      'baseline_momentum',v_war->'momentum','instruction',v_step->>'instruction','success_condition',v_step->>'success_condition'
    ),p_actor_user_id,v_idempotency
  )
  on conflict (tenant_id,idempotency_key) where status in ('proposed','needs_input','applied')
  do update set title=excluded.title,rationale=excluded.rationale,proposed_payload=excluded.proposed_payload,updated_at=now()
  returning * into v_proposal;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','deal_war_room.rescue_prepared','agency_action',v_proposal.id::text,
    jsonb_build_object('deal_room_id',p_deal_room_id,'step_type',p_step_type,'action_type','create_deal_decision_task'),
    jsonb_build_object('source','deal_war_room','external_side_effect',false,'momentum_state',v_war->'momentum'->>'state'));

  return jsonb_build_object(
    'proposal_id',v_proposal.id,'deal_room_id',p_deal_room_id,'step_type',p_step_type,'action_type','create_deal_decision_task',
    'risk_level','low','approval_mode','confirm','status',v_proposal.status,'title',v_proposal.title,'rationale',v_proposal.rationale,
    'payload',v_proposal.proposed_payload,'expires_at',v_proposal.expires_at,'executable',true,'external_side_effect',false
  );
end;
$$;

revoke execute on function public.platform_server_prepare_deal_step(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_prepare_deal_step(uuid,uuid,text,uuid,jsonb) to service_role;;
