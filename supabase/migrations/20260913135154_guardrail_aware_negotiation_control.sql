create or replace function public.platform_server_negotiation_sequence_v2(p_tenant_id uuid,p_deal_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_base jsonb;
  v_guard jsonb;
  v_steps jsonb:='[]'::jsonb;
  v_item jsonb;
  v_step integer:=0;
  v_blocking integer:=0;
  v_guard_block boolean:=false;
  v_brief jsonb;
  v_next jsonb:=null;
begin
  v_base:=public.platform_server_negotiation_sequence(p_tenant_id,p_deal_room_id);
  v_guard:=public.platform_server_deal_guardrails(p_tenant_id,p_deal_room_id);
  begin v_blocking:=coalesce((v_base->>'blocking_gap_count')::integer,0); exception when others then v_blocking:=0; end;

  for v_item in
    select x.value from jsonb_array_elements(coalesce(v_base->'steps','[]'::jsonb)) x
    where x.value->>'step_type'<>'prepare_negotiation_brief'
    order by (x.value->>'step')::integer
  loop
    v_step:=v_step+1;
    v_steps:=v_steps||jsonb_build_array((v_item-'step')||jsonb_build_object('step',v_step));
  end loop;

  v_guard_block:=coalesce((v_guard->>'required_for_stage')::boolean,false) and coalesce(v_guard->>'state','')<>'approved';
  if v_guard_block then
    v_step:=v_step+1;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'step',v_step,'step_type','set_negotiation_guardrails','priority','blocking','executable',false,'requires_human_input',true,
      'action_surface','deal_guardrails','guardrail_state',v_guard->>'state',
      'instruction','Set and approve the private human negotiation guardrails before relying on an internal negotiation brief at this deal stage.',
      'success_condition','Private negotiation guardrails are approved by an authorised owner/admin.',
      'truth_contract','The platform must not invent targets, floors, concessions, non-negotiables or walk-away conditions.'
    ));
  end if;

  v_step:=v_step+1;
  v_brief:=jsonb_build_object(
    'step',v_step,'step_type','prepare_negotiation_brief','priority','decision',
    'executable',(v_blocking=0 and not v_guard_block),
    'blocked_by_count',v_blocking+(case when v_guard_block then 1 else 0 end),
    'instruction','Prepare the internal negotiation brief: confirmed facts, approved guardrails, unknowns, decision-maker route and unresolved decisions.',
    'success_condition','The agent has one current internal brief separating confirmed facts, approved human guardrails, assumptions and decisions required.'
  );
  v_steps:=v_steps||jsonb_build_array(v_brief);

  select x.value into v_next
  from jsonb_array_elements(v_steps) x
  where coalesce((x.value->>'executable')::boolean,false)=true or coalesce((x.value->>'requires_human_input')::boolean,false)=true
  order by (x.value->>'step')::integer limit 1;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'available',true,
    'readiness_score',v_base->'readiness_score','readiness_state',v_base->'readiness_state',
    'blocking_gap_count',v_blocking+(case when v_guard_block then 1 else 0 end),
    'guardrails',jsonb_build_object('state',v_guard->>'state','required_for_stage',v_guard->'required_for_stage','exists',v_guard->'exists'),
    'steps',v_steps,'next_step',v_next,
    'principle','Preparation follows dependency order. At negotiation-stage depth, private human guardrails are required before the brief is treated as internally ready.'
  );
end;
$$;

create or replace function public.platform_server_prepare_negotiation_next_step(
  p_tenant_id uuid,p_deal_room_id uuid,p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_seq jsonb;
  v_step jsonb;
  v_readiness jsonb;
  v_deal djm_os.deal_rooms%rowtype;
  v_proposal platform.agency_action_proposals%rowtype;
  v_key text;
  v_title text;
  v_step_type text;
  v_target_gap text;
begin
  select m.role into v_role
  from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active'
    and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id and d.status='active';
  if not found then raise exception 'active_deal_not_found'; end if;

  v_seq:=public.platform_server_negotiation_sequence_v2(p_tenant_id,p_deal_room_id);
  v_step:=v_seq->'next_step';
  if v_step is null or v_step='null'::jsonb then raise exception 'no_negotiation_preparation_step'; end if;
  v_step_type:=v_step->>'step_type';
  if v_step_type='set_negotiation_guardrails' then
    return jsonb_build_object(
      'status','needs_input','action_type','set_negotiation_guardrails','step_type',v_step_type,'deal_room_id',p_deal_room_id,
      'external_side_effect',false,'requires_human_input',true,
      'instruction',v_step->>'instruction','guardrails',public.platform_server_deal_guardrails(p_tenant_id,p_deal_room_id),
      'allowed_next_actions',jsonb_build_array('save_guardrails','approve_guardrails')
    );
  end if;
  if v_step_type='prepare_negotiation_brief' then
    return jsonb_build_object(
      'status','ready_for_human_review','action_type','review_negotiation_brief','step_type',v_step_type,'deal_room_id',p_deal_room_id,
      'external_side_effect',false,'brief',public.platform_server_negotiation_brief_fast(p_tenant_id,p_deal_room_id)
    );
  end if;

  v_target_gap:=v_step->>'target_gap';
  v_readiness:=public.platform_server_negotiation_readiness(p_tenant_id,p_deal_room_id);
  v_title:=case v_step_type
    when 'verify_authority_record' then 'Verify authority record: '
    when 'verify_player_contract_position' then 'Verify player contract position: '
    when 'verify_registration_case' then 'Verify registration case: '
    when 'complete_commercial_terms' then 'Complete commercial terms: '
    when 'assemble_document_pack' then 'Assemble transaction documents: '
    else 'Prepare negotiation: ' end || v_deal.title;
  v_key:='negotiation:'||p_deal_room_id::text||':'||v_step_type||':'||coalesce((v_readiness->>'score'),'0');

  select * into v_proposal from platform.agency_action_proposals
  where tenant_id=p_tenant_id and idempotency_key=v_key and status in ('proposed','applied') order by created_at desc limit 1;
  if found then return jsonb_build_object('proposal_id',v_proposal.id,'status',v_proposal.status,'duplicate',true,'action_type',v_proposal.action_type,'step_type',v_step_type); end if;

  insert into platform.agency_action_proposals(
    tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,
    proposed_payload,requested_by,idempotency_key,expires_at,undo_supported
  ) values(
    p_tenant_id,'negotiation:'||p_deal_room_id::text,'Negotiation preparation','create_negotiation_task','deal_room',p_deal_room_id,
    'low','confirm','proposed',v_title,'Close the highest-priority recorded negotiation-preparation gap before advancing to later preparation steps.',
    jsonb_build_object('title',v_title,'due_at',now()+interval '1 day','priority',case when v_step->>'priority'='blocking' then 5 else 4 end,
      'deal_room_id',p_deal_room_id,'organisation_id',v_deal.organisation_id,'player_id',v_deal.player_id,'club_need_id',v_deal.club_need_id,
      'negotiation_step_type',v_step_type,'target_gap',v_target_gap,'instruction',v_step->>'instruction',
      'baseline_negotiation_readiness',v_readiness,'baseline_score',coalesce((v_readiness->>'score')::integer,0),'success_condition',v_step->>'success_condition'),
    p_actor_user_id,v_key,now()+interval '24 hours',true
  ) returning * into v_proposal;

  return jsonb_build_object('proposal_id',v_proposal.id,'status',v_proposal.status,'duplicate',false,'action_type',v_proposal.action_type,
    'step_type',v_step_type,'target_gap',v_target_gap,'title',v_proposal.title,'rationale',v_proposal.rationale,'payload',v_proposal.proposed_payload,
    'risk_level',v_proposal.risk_level,'approval_mode',v_proposal.approval_mode,'external_side_effect',false,'selected_from_live_negotiation_sequence',true);
end;
$$;

create or replace function public.platform_server_negotiation_brief_fast_v2(p_tenant_id uuid,p_deal_room_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select public.platform_server_negotiation_brief_fast(p_tenant_id,p_deal_room_id)
         || jsonb_build_object(
              'private_guardrails',public.platform_server_deal_guardrails(p_tenant_id,p_deal_room_id),
              'preparation_sequence',public.platform_server_negotiation_sequence_v2(p_tenant_id,p_deal_room_id),
              'privacy_contract','Private negotiation guardrails are staff-only internal data and must never be included in club-facing share surfaces.'
            );
$$;

create or replace function public.platform_server_deal_war_room_instant_v2(p_tenant_id uuid,p_deal_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_base jsonb;
  v_guard jsonb;
  v_seq jsonb;
begin
  v_base:=public.platform_server_deal_war_room_instant(p_tenant_id,p_deal_room_id);
  v_guard:=public.platform_server_deal_guardrails(p_tenant_id,p_deal_room_id);
  v_seq:=public.platform_server_negotiation_sequence_v2(p_tenant_id,p_deal_room_id);
  return v_base||jsonb_build_object(
    'negotiation',(v_base->'negotiation')||jsonb_build_object(
      'guardrails_state',v_guard->>'state','guardrails_required_for_stage',v_guard->'required_for_stage',
      'next_step',v_seq->'next_step','blocking_gap_count',v_seq->'blocking_gap_count'
    ),
    'private_guardrails_summary',case when coalesce((v_guard->>'exists')::boolean,false) then jsonb_build_object(
      'state',v_guard->>'state','status',v_guard->'guardrails'->>'status','version',v_guard->'guardrails'->'version',
      'target_outcome',v_guard->'guardrails'->>'target_outcome','open_decision_count',jsonb_array_length(coalesce(v_guard->'guardrails'->'open_decisions','[]'::jsonb))
    ) else jsonb_build_object('state',v_guard->>'state','status',null) end,
    'privacy_contract','Private guardrail values are internal staff data and are not club-share content.'
  );
end;
$$;

revoke all on function public.platform_server_negotiation_sequence_v2(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_negotiation_brief_fast_v2(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_deal_war_room_instant_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_negotiation_sequence_v2(uuid,uuid) to service_role;
grant execute on function public.platform_server_negotiation_brief_fast_v2(uuid,uuid) to service_role;
grant execute on function public.platform_server_deal_war_room_instant_v2(uuid,uuid) to service_role;;
