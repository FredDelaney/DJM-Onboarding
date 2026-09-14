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
  if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=v_owner and m.status='active') then raise exception 'task_owner_not_active_tenant_member'; end if;
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=v_owner and coalesce(tm.is_active,true)=true) then raise exception 'task_owner_missing_from_team_directory'; end if;
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

revoke all on function public.platform_server_execute_pitch_response_action(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_execute_pitch_response_action(uuid,uuid,uuid) to service_role;;
