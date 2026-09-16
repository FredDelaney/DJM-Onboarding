create or replace function public.platform_server_convert_pursuit_to_deal(
  p_tenant_id uuid,
  p_player_match_id uuid,
  p_actor_user_id uuid,
  p_input jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_match djm_os.player_matches%rowtype;
  v_need djm_os.club_needs%rowtype;
  v_gate jsonb;
  v_existing djm_os.deal_rooms%rowtype;
  v_deal djm_os.deal_rooms%rowtype;
  v_stage text:=nullif(trim(p_input->>'stage'),'');
  v_probability int;
  v_owner uuid:=coalesce(nullif(trim(p_input->>'owner_user_id'),'')::uuid,p_actor_user_id);
  v_title text:=nullif(trim(p_input->>'title'),'');
  v_expected numeric;
  v_currency text:=upper(coalesce(nullif(trim(p_input->>'currency'),''),'EUR'));
  v_blocker text:=nullif(trim(p_input->>'primary_blocker'),'');
  v_decision text:=nullif(trim(p_input->>'next_decision'),'');
  v_next_text text:=nullif(trim(p_input->>'next_action_text'),'');
  v_next_at timestamptz;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=v_owner and m.status='active') then raise exception 'deal_owner_not_active_tenant_member'; end if;

  select * into v_match from djm_os.player_matches pm where pm.id=p_player_match_id and pm.tenant_id=p_tenant_id;
  if not found then raise exception 'player_match_not_found_for_tenant'; end if;
  select * into v_need from djm_os.club_needs n where n.id=v_match.club_need_id and n.tenant_id=p_tenant_id;
  if not found then raise exception 'club_need_not_found_for_tenant'; end if;
  v_gate:=public.platform_server_career_pursuit_gate(p_tenant_id,p_player_match_id);
  if coalesce(v_gate->>'state','') not in ('open_aligned','open_approved_exception') then raise exception 'career_control_gate_not_open'; end if;

  select * into v_existing from djm_os.deal_rooms d
  where d.tenant_id=p_tenant_id and d.player_id=v_match.player_id and d.organisation_id=v_need.organisation_id and d.status in ('active','paused')
  order by d.created_at desc limit 1;
  if found then return jsonb_build_object('created',false,'existing',true,'deal_room_id',v_existing.id,'deal',to_jsonb(v_existing),'truth_contract',jsonb_build_object('duplicates','An existing active/paused player-club deal was reused rather than duplicated.')); end if;

  if v_stage not in ('qualifying','contacted','interest','negotiating','offer') then raise exception 'human_stage_required_for_new_deal'; end if;
  if nullif(trim(p_input->>'probability'),'') is null then raise exception 'human_probability_required_for_new_deal'; end if;
  v_probability:=(p_input->>'probability')::int;
  if v_probability<0 or v_probability>100 then raise exception 'probability_must_be_0_to_100'; end if;
  if nullif(trim(p_input->>'expected_commission'),'') is not null then
    v_expected:=(p_input->>'expected_commission')::numeric;
    if v_expected<0 then raise exception 'expected_commission_cannot_be_negative'; end if;
  end if;
  if nullif(trim(p_input->>'next_action_at'),'') is not null then v_next_at:=(p_input->>'next_action_at')::timestamptz; end if;
  if v_title is null then v_title:=coalesce(nullif(trim(v_need.title),''),'Player pursuit')||' - '||coalesce((select o.name from djm_os.organisations o where o.id=v_need.organisation_id),'Club'); end if;

  insert into djm_os.deal_rooms(
    title,organisation_id,player_id,club_need_id,owner_user_id,stage,status,expected_commission,currency,probability,manual_probability,model_probability,probability_source,probability_basis,primary_blocker,next_decision,next_action_at,next_action_text,last_meaningful_at,source,tenant_id
  ) values(
    v_title,v_need.organisation_id,v_match.player_id,v_match.club_need_id,v_owner,v_stage,'active',v_expected,v_currency,v_probability,v_probability,null,'manual',jsonb_build_object('source','human_pursuit_conversion','player_match_id',p_player_match_id,'recorded_by',p_actor_user_id),v_blocker,v_decision,v_next_at,v_next_text,now(),'pursuit_conversion',p_tenant_id
  ) returning * into v_deal;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','deal.created_from_pursuit','deal_room',v_deal.id::text,to_jsonb(v_deal),jsonb_build_object('player_match_id',p_player_match_id,'club_need_id',v_match.club_need_id));

  return jsonb_build_object(
    'created',true,'existing',false,'deal_room_id',v_deal.id,'deal',to_jsonb(v_deal),
    'next_controls',jsonb_build_array(
      jsonb_build_object('api_action','deal_origin_save','instruction','Confirm how this deal actually originated. DJM does not infer origin from the pursuit-conversion workflow.'),
      jsonb_build_object('api_action','deal_war_room','instruction','Use the Deal War Room for execution control after creation.')
    ),
    'truth_contract',jsonb_build_object(
      'probability','The recorded probability is human-supplied. Pursuit readiness is not converted into deal probability.',
      'origin','Creating a deal from a pursuit does not establish the historical origin of the deal.',
      'career','Conversion requires an open human-owned career gate.',
      'external','Creating a Deal Room is internal tracking only and does not contact the club or player.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_convert_pursuit_to_deal(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_convert_pursuit_to_deal(uuid,uuid,uuid,jsonb) to service_role;;
