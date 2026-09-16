create or replace function public.platform_server_prepare_pitch_response_action(
  p_tenant_id uuid,
  p_share_id uuid,
  p_actor_user_id uuid,
  p_input jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_resp platform.club_pitch_responses%rowtype;
  v_share public.club_share_links%rowtype;
  v_deal djm_os.deal_rooms%rowtype;
  v_existing platform.agency_action_proposals%rowtype;
  v_proposal platform.agency_action_proposals%rowtype;
  v_title text;
  v_key text;
  v_due timestamptz;
  v_owner uuid:=coalesce(nullif(trim(p_input->>'owner_user_id'), '')::uuid,p_actor_user_id);
  v_owner_valid boolean:=false;
begin
  select m.role into v_role
  from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;

  select * into v_resp from platform.club_pitch_responses r where r.share_id=p_share_id and r.tenant_id=p_tenant_id;
  if not found then raise exception 'pitch_response_not_found_for_tenant'; end if;
  select * into v_share from public.club_share_links s where s.id=p_share_id;
  if not found then raise exception 'pitch_share_not_found'; end if;

  select exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=v_owner and m.status='active') into v_owner_valid;
  if not v_owner_valid then raise exception 'task_owner_not_active_tenant_member'; end if;
  if nullif(trim(p_input->>'due_at'),'') is not null then v_due:=(p_input->>'due_at')::timestamptz; end if;

  if v_share.opportunity_id is not null then
    select * into v_deal from djm_os.deal_rooms d where d.id=v_share.opportunity_id and d.tenant_id=p_tenant_id;
  end if;

  v_title:=case v_resp.response_type
    when 'request_conversation' then 'Review explicit club conversation request'
    when 'request_information' then 'Review explicit club information request'
    when 'not_now' then 'Review club pitch response: not now'
    when 'decline' then 'Review club pitch response: decline'
    else 'Review explicit club pitch response' end;
  v_key:=format('pitch_response:%s:%s',p_share_id,v_resp.submission_count);

  select * into v_existing from platform.agency_action_proposals a
  where a.tenant_id=p_tenant_id and a.idempotency_key=v_key and a.status in ('proposed','needs_input','applied') order by a.created_at desc limit 1;
  if found then return jsonb_build_object('proposal',to_jsonb(v_existing),'existing',true); end if;

  insert into platform.agency_action_proposals(
    tenant_id,command_id,command_type,action_type,target_type,target_id,risk_level,approval_mode,status,title,rationale,proposed_payload,before_json,undo_supported,requested_by,idempotency_key
  ) values(
    p_tenant_id,'pitch_response:'||p_share_id::text,'pitch_response','review_pitch_response','club_pitch',p_share_id,
    'low','confirm','proposed',v_title,
    'A holder of the active pitch link submitted an explicit response. Create internal work to review the response and decide the human next step; do not auto-contact or auto-change the deal.',
    jsonb_build_object('share_id',p_share_id,'response_type',v_resp.response_type,'response_updated_at',v_resp.updated_at,'submission_count',v_resp.submission_count,'owner_user_id',v_owner,'due_at',v_due,'deal_room_id',v_share.opportunity_id),
    jsonb_build_object('response',to_jsonb(v_resp),'deal',case when v_deal.id is null then null else jsonb_build_object('stage',v_deal.stage,'status',v_deal.status,'next_action_at',v_deal.next_action_at,'next_action_text',v_deal.next_action_text) end),
    true,p_actor_user_id,v_key
  ) returning * into v_proposal;

  return jsonb_build_object('proposal',to_jsonb(v_proposal),'existing',false,'truth_contract',jsonb_build_object(
    'external_action','This proposal creates internal review work only. It does not message the responder or change a deal stage.',
    'deadline','No due date is invented. A due date exists only if a human supplied one.',
    'identity','The pitch-link responder remains self-asserted and unverified unless separately verified.'
  ));
end;
$function$;

create or replace function public.platform_server_execute_pitch_response_action(
  p_tenant_id uuid,
  p_proposal_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_p platform.agency_action_proposals%rowtype;
  v_share public.club_share_links%rowtype;
  v_resp platform.club_pitch_responses%rowtype;
  v_task djm_os.tasks%rowtype;
  v_owner uuid;
  v_due timestamptz;
  v_title text;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;

  select * into v_p from platform.agency_action_proposals a where a.id=p_proposal_id and a.tenant_id=p_tenant_id for update;
  if not found then raise exception 'proposal_not_found_for_tenant'; end if;
  if v_p.action_type<>'review_pitch_response' then raise exception 'invalid_pitch_response_action'; end if;
  if v_p.status='applied' then return jsonb_build_object('applied',true,'existing',true,'proposal',to_jsonb(v_p)); end if;
  if v_p.status<>'proposed' then raise exception 'proposal_not_executable'; end if;
  if v_p.expires_at<=now() then update platform.agency_action_proposals set status='expired',updated_at=now() where id=v_p.id; raise exception 'proposal_expired'; end if;

  select * into v_share from public.club_share_links s where s.id=v_p.target_id;
  select * into v_resp from platform.club_pitch_responses r where r.share_id=v_p.target_id and r.tenant_id=p_tenant_id;
  if not found then raise exception 'pitch_response_no_longer_exists'; end if;
  if coalesce((v_p.proposed_payload->>'submission_count')::int,0)<>v_resp.submission_count or (v_p.proposed_payload->>'response_updated_at')::timestamptz<>v_resp.updated_at then raise exception 'pitch_response_changed_since_proposal'; end if;

  v_owner:=(v_p.proposed_payload->>'owner_user_id')::uuid;
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=v_owner and tm.tenant_id=p_tenant_id and coalesce(tm.active,true)=true) then raise exception 'task_owner_not_active_team_member'; end if;
  if nullif(v_p.proposed_payload->>'due_at','') is not null then v_due:=(v_p.proposed_payload->>'due_at')::timestamptz; end if;
  v_title:=v_p.title;

  insert into djm_os.tasks(title,task_type,owner_user_id,organisation_id,player_id,due_at,status,priority,source,tenant_id)
  values(v_title,'commitment',v_owner,v_share.organisation_id,v_share.player_id,v_due,'open',case when v_resp.response_type in ('request_conversation','request_information') then 4 else 3 end,'pitch_response',p_tenant_id)
  returning * into v_task;

  update platform.agency_action_proposals set status='applied',approved_by=p_actor_user_id,approved_at=now(),applied_at=now(),result_target_type='task',result_target_id=v_task.id,
    after_json=jsonb_build_object('task_id',v_task.id,'title',v_task.title,'status',v_task.status,'owner_user_id',v_task.owner_user_id,'organisation_id',v_task.organisation_id,'player_id',v_task.player_id,'due_at',v_task.due_at,'source',v_task.source),
    verification_json=jsonb_build_object('task_created',true,'response_unchanged',true),updated_at=now()
  where id=v_p.id returning * into v_p;

  insert into platform.agency_commitments(tenant_id,proposal_id,command_id,task_id,owner_user_id,status,due_at,metadata)
  values(p_tenant_id,v_p.id,v_p.command_id,v_task.id,v_owner,'active',v_due,jsonb_build_object('action_type','review_pitch_response','share_id',v_share.id,'response_type',v_resp.response_type,'deal_room_id',v_share.opportunity_id));

  insert into platform.agency_action_outcomes(tenant_id,proposal_id,action_type,operational_state,downstream_state,evaluation_window_end,evidence)
  values(p_tenant_id,v_p.id,'review_pitch_response','pending','pending',now()+interval '7 days',jsonb_build_object('baseline_deal',v_p.before_json->'deal','share_id',v_share.id,'response_type',v_resp.response_type));

  return jsonb_build_object('applied',true,'existing',false,'proposal',to_jsonb(v_p),'task',to_jsonb(v_task),'truth_contract',jsonb_build_object('meaning','Internal review work was created. No external reply or deal-stage change occurred.'));
end;
$function$;

create or replace function public.platform_server_evaluate_pitch_response_action(
  p_tenant_id uuid,
  p_proposal_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_p platform.agency_action_proposals%rowtype;
  v_o platform.agency_action_outcomes%rowtype;
  v_task djm_os.tasks%rowtype;
  v_deal djm_os.deal_rooms%rowtype;
  v_baseline_stage text;
  v_baseline_next timestamptz;
  v_stage_improved boolean:=false;
  v_next_improved boolean:=false;
  v_operational text;
  v_downstream text;
  v_key text;
  v_rank_base int:=0;
  v_rank_now int:=0;
begin
  select * into v_p from platform.agency_action_proposals a where a.id=p_proposal_id and a.tenant_id=p_tenant_id;
  if not found or v_p.action_type<>'review_pitch_response' then raise exception 'pitch_response_proposal_not_found'; end if;
  select * into v_o from platform.agency_action_outcomes o where o.proposal_id=v_p.id and o.tenant_id=p_tenant_id for update;
  if not found then raise exception 'pitch_response_outcome_not_found'; end if;
  select * into v_task from djm_os.tasks t where t.id=v_p.result_target_id and t.tenant_id=p_tenant_id;
  v_operational:=case when v_p.status='undone' then 'cancelled' when v_task.id is null then 'failed' when v_task.status='completed' then 'completed' else 'pending' end;

  if nullif(v_p.proposed_payload->>'deal_room_id','') is not null then
    select * into v_deal from djm_os.deal_rooms d where d.id=(v_p.proposed_payload->>'deal_room_id')::uuid and d.tenant_id=p_tenant_id;
    v_baseline_stage:=v_p.before_json#>>'{deal,stage}';
    if nullif(v_p.before_json#>>'{deal,next_action_at}','') is not null then v_baseline_next:=(v_p.before_json#>>'{deal,next_action_at}')::timestamptz; end if;
    v_rank_base:=case v_baseline_stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end;
    v_rank_now:=case v_deal.stage when 'qualifying' then 1 when 'contacted' then 2 when 'interest' then 3 when 'negotiating' then 4 when 'offer' then 5 when 'contracting' then 6 when 'won' then 7 else 0 end;
    v_stage_improved:=v_rank_now>v_rank_base;
    v_next_improved:=v_deal.next_action_at is not null and (v_baseline_next is null or v_deal.next_action_at is distinct from v_baseline_next) and v_deal.updated_at>=v_p.applied_at;
  end if;

  if v_p.status='undone' then v_downstream:='cancelled'; v_key:='pitch_response_action_undone';
  elsif v_stage_improved then v_downstream:='positive'; v_key:='deal_stage_advanced_after_pitch_response';
  elsif v_next_improved then v_downstream:='positive'; v_key:='deal_next_action_control_improved_after_pitch_response';
  elsif now()>=v_o.evaluation_window_end then v_downstream:='neutral'; v_key:='no_recorded_deal_progress_within_evaluation_window';
  else v_downstream:='pending'; v_key:=null; end if;

  update platform.agency_action_outcomes set operational_state=v_operational,downstream_state=v_downstream,outcome_key=v_key,last_evaluated_at=now(),
    first_observed_at=case when v_downstream in ('positive','neutral','negative') then coalesce(first_observed_at,now()) else first_observed_at end,
    evidence=evidence||jsonb_build_object('task_status',v_task.status,'stage_improved',v_stage_improved,'next_action_improved',v_next_improved,'current_deal_stage',v_deal.stage,'current_next_action_at',v_deal.next_action_at),updated_at=now()
  where id=v_o.id returning * into v_o;
  return jsonb_build_object('outcome',to_jsonb(v_o),'truth_contract',jsonb_build_object('task','Task completion alone does not create a positive commercial outcome.','positive','Positive means the linked deal stage advanced or its recorded next-action control changed after the intervention.','neutral','Neutral after seven days means DJM did not record the defined downstream improvement inside the evaluation window; it does not prove the human response was poor.'));
end;
$function$;

create or replace function public.platform_server_undo_pitch_response_action(
  p_tenant_id uuid,
  p_proposal_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_p platform.agency_action_proposals%rowtype;
  v_task djm_os.tasks%rowtype;
  v_after jsonb;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  select * into v_p from platform.agency_action_proposals a where a.id=p_proposal_id and a.tenant_id=p_tenant_id for update;
  if not found or v_p.action_type<>'review_pitch_response' or v_p.status<>'applied' then raise exception 'pitch_response_action_not_undoable'; end if;
  select * into v_task from djm_os.tasks t where t.id=v_p.result_target_id and t.tenant_id=p_tenant_id for update;
  if not found then raise exception 'pitch_response_task_missing'; end if;
  v_after:=v_p.after_json;
  if v_task.status<>'open' or v_task.title is distinct from v_after->>'title' or v_task.owner_user_id is distinct from (v_after->>'owner_user_id')::uuid or v_task.organisation_id is distinct from nullif(v_after->>'organisation_id','')::uuid or v_task.player_id is distinct from nullif(v_after->>'player_id','')::uuid or v_task.due_at is distinct from nullif(v_after->>'due_at','')::timestamptz or v_task.source is distinct from v_after->>'source' then raise exception 'pitch_response_task_changed_since_apply'; end if;
  delete from djm_os.tasks where id=v_task.id;
  update platform.agency_commitments set status='cancelled',updated_at=now() where proposal_id=v_p.id;
  update platform.agency_action_outcomes set operational_state='cancelled',downstream_state='cancelled',outcome_key='pitch_response_action_undone',last_evaluated_at=now(),updated_at=now() where proposal_id=v_p.id;
  update platform.agency_action_proposals set status='undone',undone_at=now(),updated_at=now() where id=v_p.id returning * into v_p;
  return jsonb_build_object('undone',true,'proposal',to_jsonb(v_p),'truth_contract',jsonb_build_object('scope','Undo removes only the untouched internal task created by this action. It never retracts or alters the external pitch response.'));
end;
$function$;

revoke all on function public.platform_server_prepare_pitch_response_action(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.platform_server_execute_pitch_response_action(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_evaluate_pitch_response_action(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_undo_pitch_response_action(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_prepare_pitch_response_action(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.platform_server_execute_pitch_response_action(uuid,uuid,uuid) to service_role;
grant execute on function public.platform_server_evaluate_pitch_response_action(uuid,uuid) to service_role;
grant execute on function public.platform_server_undo_pitch_response_action(uuid,uuid,uuid) to service_role;;
