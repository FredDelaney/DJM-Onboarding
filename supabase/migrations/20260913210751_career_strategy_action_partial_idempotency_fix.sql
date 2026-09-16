create or replace function public.platform_server_prepare_career_strategy_action(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_role text; v_card jsonb; v_action jsonb; v_type text; v_player public.players%rowtype; v_s platform.player_career_strategies%rowtype;
  v_title text; v_instruction text; v_due timestamptz; v_active_deals integer:=0; v_matches integer:=0; v_opps integer:=0;
  v_proposal platform.agency_action_proposals%rowtype; v_key text;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  select * into v_player from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found_for_tenant'; end if;
  v_card:=public.platform_server_player_career_alignment(p_tenant_id,p_player_id);
  v_action:=v_card->'next_strategy_action'; v_type:=v_action->>'action_type'; v_instruction:=v_action->>'instruction';
  if v_type is null then return jsonb_build_object('status','no_strategy_action_available','player_id',p_player_id); end if;
  if v_type in ('define_career_strategy','complete_strategy_approval','confirm_strategy_with_player') then
    return jsonb_build_object('status','needs_human_input','player_id',p_player_id,'strategy_action_type',v_type,'instruction',v_instruction,'reason','Career objectives, target markets, trade-offs and player confirmation cannot be created by automation.','allowed_next_steps',case when v_type='define_career_strategy' then jsonb_build_array('save_career_strategy') when v_type='confirm_strategy_with_player' then jsonb_build_array('record_player_confirmation') else jsonb_build_array('record_player_confirmation','approve_career_strategy') end);
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
  insert into platform.agency_action_proposals(tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,requested_by,idempotency_key,expires_at,undo_supported)
  values(p_tenant_id,'career_strategy:'||p_player_id::text,'Career strategy','create_career_strategy_task','player',p_player_id,'low','confirm','proposed',v_title,'Create internal work to bring execution back into line with the human-owned career strategy.',jsonb_build_object('title',v_title,'due_at',v_due,'priority',case when v_type='review_market_exception' then 5 else 4 end,'player_id',p_player_id,'strategy_action_type',v_type,'instruction',v_instruction,'baseline_alignment_state',v_card->>'alignment_state','baseline_strategy_version',coalesce(v_s.version,0),'baseline_strategy_status',coalesce(v_s.status,'missing'),'baseline_confirmation_status',coalesce(v_s.confirmation_status,'missing'),'baseline_review_due_at',v_s.review_due_at,'baseline_active_deals',v_active_deals,'baseline_market_matches',v_matches,'baseline_active_opportunities',v_opps,'success_condition',case when v_type='activate_market_plan' then 'Recorded market coverage increases or a deliberate alternative execution decision is recorded.' when v_type='review_market_exception' then 'The exception is resolved through strategy revision, player reconfirmation or deliberate removal/parking of the conflicting pursuit.' else 'The strategy is reviewed and becomes current again with player confirmation where required.' end),p_actor_user_id,v_key,now()+interval '24 hours',true)
  on conflict (tenant_id,idempotency_key) where status in ('proposed','needs_input','applied') do update set updated_at=now() returning * into v_proposal;
  return jsonb_build_object('status',v_proposal.status,'proposal_id',v_proposal.id,'action_type',v_proposal.action_type,'strategy_action_type',v_type,'payload',v_proposal.proposed_payload,'undo_supported',true,'external_side_effect',false);
end;$$;;
