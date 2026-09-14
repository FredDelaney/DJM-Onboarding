alter function public.platform_server_prepare_play_action(uuid,text,uuid,jsonb) rename to platform_server_prepare_play_action_core_v1;

create or replace function public.platform_server_prepare_play_action(p_tenant_id uuid, p_play_id text, p_actor_user_id uuid, p_input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_play jsonb;
  v_intro jsonb;
  v_intermediary uuid;
  v_target_person uuid;
  v_org uuid;
  v_player uuid;
  v_due timestamptz;
  v_title text;
  v_idempotency text;
  v_proposal platform.agency_action_proposals%rowtype;
begin
  if jsonb_typeof(coalesce(p_input,'{}'::jsonb))<>'object' then raise exception 'input_must_be_object'; end if;
  if trim(coalesce(p_play_id,''))='' then raise exception 'play_id_required'; end if;

  select m.role into v_role
  from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','scout','operations') limit 1;
  if v_role is null then raise exception 'agency_staff_access_required'; end if;

  select x.value into v_play
  from jsonb_array_elements(public.platform_server_agency_playbook(p_tenant_id,20)->'plays') x
  where x.value->>'play_id'=p_play_id limit 1;
  if v_play is null then raise exception 'strategic_play_no_longer_available'; end if;

  if v_play->>'play_type'<>'use_warm_introduction_before_pitch' then
    return public.platform_server_prepare_play_action_core_v1(p_tenant_id,p_play_id,p_actor_user_id,p_input);
  end if;

  v_intro:=v_play->'introduction_context';
  begin v_intermediary:=nullif(v_intro->'intermediary'->>'person_id','')::uuid; exception when others then v_intermediary:=null; end;
  begin v_target_person:=nullif(v_intro->'target_contact'->>'person_id','')::uuid; exception when others then v_target_person:=null; end;
  begin v_org:=nullif(v_intro->'target_organisation'->>'organisation_id','')::uuid; exception when others then v_org:=null; end;
  begin v_player:=nullif(v_play->'evidence'->'pursuit'->'player'->>'player_id','')::uuid; exception when others then v_player:=null; end;
  if v_intermediary is null or v_target_person is null or v_org is null then raise exception 'introduction_path_incomplete'; end if;

  begin v_due:=nullif(p_input->>'due_at','')::timestamptz; exception when others then raise exception 'invalid_due_at'; end;
  if v_due is null then v_due:=now()+interval '1 day'; end if;
  v_title:=coalesce(nullif(trim(p_input->>'title'),''),'Request warm introduction: '||(v_play->>'title'));
  v_idempotency:=md5('play|'||p_play_id||'|warm_intro|'||coalesce(p_input,'{}'::jsonb)::text);

  insert into platform.agency_action_proposals(
    tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key
  ) values(
    p_tenant_id,'strategic_play:'||p_play_id,'Strategic play: warm introduction','create_introduction_task','person',v_intermediary,
    'low','confirm','proposed',v_title,v_play->>'rationale',
    jsonb_build_object(
      'title',v_title,'due_at',v_due,'priority',4,
      'person_id',v_intermediary,'intermediary_person_id',v_intermediary,'target_person_id',v_target_person,
      'organisation_id',v_org,'player_id',v_player,'play_id',p_play_id,
      'recommended_action',v_play->>'recommended_action','introduction_context',v_intro
    ),
    p_actor_user_id,v_idempotency
  )
  on conflict (tenant_id,idempotency_key) where status in ('proposed','needs_input','applied')
  do update set title=excluded.title,rationale=excluded.rationale,proposed_payload=excluded.proposed_payload,updated_at=now()
  returning * into v_proposal;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','strategic_play.introduction_prepared','agency_action',v_proposal.id::text,
    jsonb_build_object('play_id',p_play_id,'action_type','create_introduction_task','intermediary_person_id',v_intermediary,'target_person_id',v_target_person,'organisation_id',v_org),
    jsonb_build_object('source','agency_playbook','external_message_sent',false));

  return jsonb_build_object(
    'proposal_id',v_proposal.id,'play_id',p_play_id,'action_type','create_introduction_task','risk_level','low','approval_mode','confirm','status',v_proposal.status,
    'title',v_proposal.title,'rationale',v_proposal.rationale,'payload',v_proposal.proposed_payload,'expires_at',v_proposal.expires_at,'executable',true,
    'external_message_sent',false,'success_definition','Fresh interaction with the target club/contact, not merely contacting the intermediary.'
  );
end;
$$;

revoke all on function public.platform_server_prepare_play_action_core_v1(uuid,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.platform_server_prepare_play_action(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_prepare_play_action_core_v1(uuid,text,uuid,jsonb) to service_role;
grant execute on function public.platform_server_prepare_play_action(uuid,text,uuid,jsonb) to service_role;;
