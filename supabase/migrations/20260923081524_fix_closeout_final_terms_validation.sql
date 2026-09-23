CREATE OR REPLACE FUNCTION public.platform_server_save_deal_closeout(p_tenant_id uuid, p_deal_room_id uuid, p_actor_user_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_deal djm_os.deal_rooms%rowtype;
  v_status text:=coalesce(nullif(trim(p_input->>'status'),''),'draft');
  v_before jsonb; v_after jsonb;
  v_terms jsonb:=coalesce(p_input->'final_terms','{}'::jsonb);
  v_signed boolean:=coalesce((p_input->>'signed_agreement_recorded')::boolean,false);
  v_completion boolean:=coalesce((p_input->>'completion_confirmed')::boolean,false);
  v_player_ack boolean:=coalesce((p_input->>'player_acknowledgement_recorded')::boolean,false);
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  if v_status not in ('draft','confirmed','archived') then raise exception 'invalid_closeout_status'; end if;
  if v_status='confirmed' and not(v_deal.status='won' or v_deal.stage in ('contracting','won')) then raise exception 'deal_not_at_closeout_stage'; end if;
  if v_status='confirmed' and (jsonb_typeof(v_terms) is distinct from 'object' or v_terms='{}'::jsonb) then raise exception 'final_terms_required_for_confirmation'; end if;
  if v_status='confirmed' and not v_completion then raise exception 'completion_confirmation_required'; end if;
  select to_jsonb(r) into v_before from platform.deal_closeout_records r where r.tenant_id=p_tenant_id and r.deal_room_id=p_deal_room_id for update;
  insert into platform.deal_closeout_records(tenant_id,deal_room_id,status,final_terms,signed_agreement_recorded,completion_confirmed,player_acknowledgement_recorded,completion_note,confirmed_by,confirmed_at,created_by,updated_by)
  values(p_tenant_id,p_deal_room_id,v_status,v_terms,v_signed,v_completion,v_player_ack,nullif(trim(p_input->>'completion_note'),''),case when v_status='confirmed' then p_actor_user_id else null end,case when v_status='confirmed' then now() else null end,p_actor_user_id,p_actor_user_id)
  on conflict (tenant_id,deal_room_id) do update set status=excluded.status,final_terms=excluded.final_terms,signed_agreement_recorded=excluded.signed_agreement_recorded,completion_confirmed=excluded.completion_confirmed,player_acknowledgement_recorded=excluded.player_acknowledgement_recorded,completion_note=excluded.completion_note,confirmed_by=case when excluded.status='confirmed' then p_actor_user_id else platform.deal_closeout_records.confirmed_by end,confirmed_at=case when excluded.status='confirmed' then now() else platform.deal_closeout_records.confirmed_at end,updated_by=p_actor_user_id,updated_at=now();
  select to_jsonb(r) into v_after from platform.deal_closeout_records r where r.tenant_id=p_tenant_id and r.deal_room_id=p_deal_room_id;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','deal_closeout.saved','deal_closeout',p_deal_room_id::text,v_before,v_after,jsonb_build_object('closeout_status',v_status,'deal_status',v_deal.status,'deal_stage',v_deal.stage));
  return jsonb_build_object('saved',true,'closeout',v_after,'truth_contract',jsonb_build_object('final_terms','Final terms are human-recorded facts. DJM does not infer agreed terms from negotiation guardrails or messages.','completion','Completion confirmed is an internal operating fact, not legal certification of registration, transfer validity or contract enforceability.','stage_gate','A confirmed closeout can only be saved when the underlying deal is recorded at contracting/won or marked won.'));
end;$function$
