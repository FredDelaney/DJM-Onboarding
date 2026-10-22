-- Nullable canonical links missing from staging; preserve all existing rows.
-- Production already has these columns under the historical communication migrations.
alter table djm_os.captures add column if not exists prospect_id uuid references djm_os.scouting_prospects(id) on delete set null;
alter table djm_os.interactions add column if not exists player_id uuid references public.players(id) on delete set null;
alter table djm_os.interactions add column if not exists prospect_id uuid references djm_os.scouting_prospects(id) on delete set null;
create index if not exists captures_tenant_prospect_idx on djm_os.captures(prospect_id,tenant_id,created_at desc) where prospect_id is not null;
create index if not exists interactions_tenant_player_occurred_idx on djm_os.interactions(tenant_id,player_id,occurred_at desc) where player_id is not null;
create index if not exists interactions_tenant_prospect_occurred_idx on djm_os.interactions(prospect_id,tenant_id,occurred_at desc) where prospect_id is not null;

-- Forward-only replacement: canonical tasks, existing responsibility and action ledger.
-- No table grants, ownership changes or automatic completion of a colleague's task.
create or replace function private.redream_task_actor_can_edit(t uuid,k text,record_id uuid,u uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.user_has_staff_tenant_access(t,u) and case k
 when 'task' then exists(select 1 from djm_os.tasks w where w.tenant_id=t and w.id=record_id
   and (w.owner_user_id=u or exists(select 1 from platform.work_responsibilities r
     where r.tenant_id=t and r.work_kind='task' and r.work_id=w.id and u=any(r.responsible_user_ids))))
 when 'calendar_task' then exists(select 1 from platform.calendar_tasks w where w.tenant_id=t and w.id=record_id and w.archived_at is null
   and (w.owner_user_id=u or (w.visibility='company' and u=any(w.responsible_user_ids))))
 else false end;
$$;
revoke all on function private.redream_task_actor_can_edit(uuid,text,uuid,uuid) from public,anon,authenticated;

create or replace function public.redream_ai_task_context(p_capture_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c djm_os.captures%rowtype; v_tasks jsonb; v_timezone text;
begin
  select * into c from djm_os.captures where id=p_capture_id;
  if not found or not private.user_has_staff_tenant_access(c.tenant_id,c.submitted_by)
    or not exists(select 1 from djm_os.tell_djm_permissions p where p.tenant_id=c.tenant_id and p.user_id=c.submitted_by and p.is_enabled)
  then raise exception 'Capture access denied' using errcode='42501'; end if;
  select nullif(p.timezone,'') into v_timezone from public.notification_preferences p where p.user_id=c.submitted_by;
  if v_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then v_timezone:='Europe/Rome'; end if;
  select coalesce(jsonb_agg(x),'[]'::jsonb) into v_tasks from (
    select work.* from (
      select t.id,t.title,t.status,'task'::text as task_kind,t.owner_user_id,(t.owner_user_id is distinct from c.submitted_by) as shared_with_you,
        (select tm.display_name from djm_os.team_members tm where tm.user_id=t.owner_user_id limit 1) as owner_display_name,t.updated_at,t.due_at,t.person_id,t.player_id,t.organisation_id,
        p.full_name as person_name,nullif(concat_ws(' ',pl.first_name,pl.last_name),'') as player_name,o.name as club_name
      from djm_os.tasks t
      left join djm_os.people p on p.id=t.person_id and p.tenant_id=c.tenant_id
      left join public.players pl on pl.id=t.player_id and pl.tenant_id=c.tenant_id
      left join djm_os.organisations o on o.id=t.organisation_id and o.tenant_id=c.tenant_id
      where t.tenant_id=c.tenant_id and (t.owner_user_id=c.submitted_by or exists(
        select 1 from platform.work_responsibilities r where r.tenant_id=c.tenant_id and r.work_kind='task' and r.work_id=t.id and c.submitted_by=any(r.responsible_user_ids)))
        and (t.status in ('open','in_progress') or (t.status='completed' and t.completed_at>now()-interval '30 days'))
      union all
      select t.id,t.title,case when t.status='done' then 'completed' else t.status end,'calendar_task',t.owner_user_id,(t.owner_user_id is distinct from c.submitted_by),
        (select tm.display_name from djm_os.team_members tm where tm.user_id=t.owner_user_id limit 1),t.updated_at,t.due_at,
        null::uuid,null::uuid,null::uuid,null::text,null::text,null::text
      from platform.calendar_tasks t where t.tenant_id=c.tenant_id and (t.owner_user_id=c.submitted_by or (t.visibility='company' and c.submitted_by=any(t.responsible_user_ids))) and t.archived_at is null
        and (t.status='open' or (t.status='done' and t.updated_at>now()-interval '30 days'))
    ) work
    order by case when status='completed' then 1 else 0 end,due_at nulls last,updated_at desc,id limit 80
  ) x;
  return jsonb_build_object('tasks',v_tasks,'timezone',v_timezone,'limit',80);
end;
$$;
revoke all on function public.redream_ai_task_context(uuid) from public,anon,authenticated;
grant execute on function public.redream_ai_task_context(uuid) to service_role;

create or replace function public.redream_ai_update_task(
  p_capture_id uuid,p_action_hash text,p_action_index integer,p_confidence numeric,p_evidence text,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c djm_os.captures%rowtype; a djm_os.tell_djm_actions%rowtype; t djm_os.tasks%rowtype;
  v_before jsonb; v_after jsonb; v_operation text:=p_payload->>'operation'; v_due timestamptz;
  v_calendar platform.calendar_tasks%rowtype; v_target uuid:=(p_payload->>'task_id')::uuid; v_zone text;
begin
  select * into c from djm_os.captures where id=p_capture_id for update;
  if not found or not private.user_has_staff_tenant_access(c.tenant_id,c.submitted_by)
    or not exists(select 1 from djm_os.tell_djm_permissions p where p.tenant_id=c.tenant_id and p.user_id=c.submitted_by and p.is_enabled)
  then raise exception 'Capture access denied' using errcode='42501'; end if;
  if auth.uid() is not null then perform private.tell_assert_capture(p_capture_id,true); end if;
  select * into a from djm_os.tell_djm_actions where capture_id=p_capture_id and action_hash=p_action_hash for update;
  if found and a.status in ('applied','undone','superseded') then
    return jsonb_build_object('action_id',a.id,'status',a.status,'target_id',a.target_id,'duplicate',true);
  end if;
  if v_operation is null or v_operation not in ('complete','reopen','reschedule') or coalesce(p_confidence,0)<0.8
    or nullif(trim(p_evidence),'') is null
    or position(regexp_replace(lower(trim(p_evidence)),'\s+',' ','g') in regexp_replace(lower(coalesce(c.transcript_text,'')),'\s+',' ','g'))=0
  then raise exception 'Review the original note before changing this task'; end if;
  if coalesce(p_payload->>'task_kind','task') not in ('task','calendar_task') then raise exception 'Task kind is unavailable'; end if;
  if v_operation='complete' and coalesce((p_payload->>'objective_satisfied')::boolean,false)=false then raise exception 'The task objective is not finished'; end if;
  if v_operation='reschedule' then
    if coalesce(p_payload->>'due_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Choose a clear new date'; end if;
    v_due:=(p_payload->>'due_at')::timestamptz;
    if v_due is null then raise exception 'Choose a clear new date'; end if;
  end if;
  if p_payload->>'task_kind'='calendar_task' then
    select * into v_calendar from platform.calendar_tasks where id=v_target and tenant_id=c.tenant_id and archived_at is null for update;
    if not found then raise exception 'Only your own available task can be changed' using errcode='42501'; end if;

    if not private.redream_task_actor_can_edit(c.tenant_id,'calendar_task',v_target,c.submitted_by) then
      raise exception 'Only your own available or explicitly shared task can be changed' using errcode='42501';
    end if;
    if v_calendar.owner_user_id is distinct from c.submitted_by and (
      coalesce((p_payload->>'_automatic')::boolean,false) or auth.uid() is distinct from c.submitted_by
      or a.id is null or a.action_type<>'update_task' or a.status not in ('pending','failed')
      or a.resolved_payload is distinct from p_payload
    ) then raise exception 'Review and approve this shared task change first' using errcode='42501'; end if;
    if v_calendar.updated_at is distinct from (p_payload->>'expected_updated_at')::timestamptz
      or (case when v_calendar.status='done' then 'completed' else v_calendar.status end) is distinct from p_payload->>'expected_status'
      or v_calendar.title is distinct from p_payload->>'task_title' then raise exception 'This task changed. Review your tasks before trying again'; end if;
    if (v_operation='reopen' and v_calendar.status<>'done') or (v_operation<>'reopen' and v_calendar.status<>'open') then raise exception 'The task objective is not ready for this change'; end if;
    v_before:=to_jsonb(v_calendar);
    select nullif(timezone,'') into v_zone from public.notification_preferences where user_id=c.submitted_by;
    if v_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=v_zone) then v_zone:='Europe/Rome'; end if;
    update platform.calendar_tasks set
      status=case v_operation when 'complete' then 'done' when 'reopen' then 'open' else status end,
      due_on=case when v_operation='reschedule' then (v_due at time zone v_zone)::date else due_on end,
      due_time=case when v_operation='reschedule' and due_time is not null then (v_due at time zone v_zone)::time else due_time end,
      time_zone=case when v_operation='reschedule' and due_time is not null then v_zone else time_zone end,
      due_at=case when v_operation='reschedule' and due_time is not null then v_due else due_at end,
      revision=revision+1,updated_at=clock_timestamp()
    where id=v_target returning to_jsonb(calendar_tasks.*) into v_after;
  else
  select * into t from djm_os.tasks where id=(p_payload->>'task_id')::uuid
    and tenant_id=c.tenant_id for update;
  if not found then raise exception 'Only your own available task can be changed' using errcode='42501'; end if;
  perform 1 from platform.work_responsibilities where tenant_id=c.tenant_id and work_kind='task' and work_id=v_target for share;

    if not private.redream_task_actor_can_edit(c.tenant_id,'task',v_target,c.submitted_by) then
      raise exception 'Only your own available or explicitly shared task can be changed' using errcode='42501';
    end if;
    if t.owner_user_id is distinct from c.submitted_by and (
      coalesce((p_payload->>'_automatic')::boolean,false) or auth.uid() is distinct from c.submitted_by
      or a.id is null or a.action_type<>'update_task' or a.status not in ('pending','failed')
      or a.resolved_payload is distinct from p_payload
    ) then raise exception 'Review and approve this shared task change first' using errcode='42501'; end if;
  if t.updated_at is distinct from (p_payload->>'expected_updated_at')::timestamptz
    or t.status is distinct from p_payload->>'expected_status'
    or t.title is distinct from p_payload->>'task_title'
  then raise exception 'This task changed. Review your tasks before trying again'; end if;
  if (v_operation='reopen' and t.status<>'completed')
    or (v_operation<>'reopen' and t.status not in ('open','in_progress'))
    or (v_operation='complete' and coalesce((p_payload->>'objective_satisfied')::boolean,false)=false)
  then raise exception 'The task objective is not ready for this change'; end if;
  if v_operation='reschedule' then
    if coalesce(p_payload->>'due_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Choose a clear new date'; end if;
    v_due:=(p_payload->>'due_at')::timestamptz;
    if v_due is null then raise exception 'Choose a clear new date'; end if;
  end if;
  v_before:=to_jsonb(t);
  update djm_os.tasks set
    status=case v_operation when 'complete' then 'completed' when 'reopen' then 'open' else status end,
    completed_at=case v_operation when 'complete' then clock_timestamp() when 'reopen' then null else completed_at end,
    due_at=case when v_operation='reschedule' then v_due else due_at end,
    updated_at=clock_timestamp()
  where id=t.id returning to_jsonb(tasks.*) into v_after;
  end if;
  insert into djm_os.tell_djm_actions(tenant_id,capture_id,action_hash,action_index,action_type,status,confidence,evidence,
    proposed_payload,resolved_payload,target_type,target_id,before_json,after_json,verification_json,undo_supported,applied_at)
  values(c.tenant_id,c.id,p_action_hash,p_action_index,'update_task','applied',p_confidence,p_evidence,p_payload,p_payload,'task',v_target,
    v_before,v_after,jsonb_build_object('operation',v_operation,'actor_user_id',coalesce(auth.uid(),c.submitted_by),'automatic',coalesce((p_payload->>'_automatic')::boolean,false)),true,now())
  on conflict(capture_id,action_hash) do update set status='applied',resolved_payload=excluded.resolved_payload,
    target_type='task',target_id=excluded.target_id,before_json=excluded.before_json,after_json=excluded.after_json,
    verification_json=excluded.verification_json,undo_supported=true,error_message=null,applied_at=now(),updated_at=now()
  returning * into a;
  insert into djm_os.events(tenant_id,event_type,actor_user_id,person_id,organisation_id,player_id,payload,source,confidence,occurred_at)
  values(c.tenant_id,'REDREAM_AI_TASK_UPDATED',coalesce(auth.uid(),c.submitted_by),t.person_id,t.organisation_id,t.player_id,
    jsonb_build_object('capture_id',c.id,'action_id',a.id,'task_id',v_target,'operation',v_operation,'before',v_before,'after',v_after),'redream_ai',p_confidence,now());
  return jsonb_build_object('action_id',a.id,'status','applied','target_id',v_target);
end;
$$;
revoke all on function public.redream_ai_update_task(uuid,text,integer,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.redream_ai_update_task(uuid,text,integer,numeric,text,jsonb) to service_role;

create or replace function private.redream_ai_undo_task(p_action_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a djm_os.tell_djm_actions%rowtype; c djm_os.captures%rowtype; t djm_os.tasks%rowtype; v_calendar platform.calendar_tasks%rowtype;
begin
  select * into a from djm_os.tell_djm_actions where id=p_action_id for update;
  if not found or a.action_type<>'update_task' then raise exception 'Task update not found'; end if;
  perform private.tell_assert_capture(a.capture_id,true);
  select * into c from djm_os.captures where id=a.capture_id;
  if c.submitted_by is distinct from auth.uid() or c.tenant_id is distinct from private.tell_request_tenant()
    or not private.user_has_staff_tenant_access(c.tenant_id,auth.uid()) then raise exception 'Task access denied' using errcode='42501'; end if;
  if a.status='undone' then return jsonb_build_object('undone',true,'duplicate',true); end if;
  if a.status<>'applied' or not a.undo_supported then raise exception 'This change cannot be undone'; end if;
  if a.resolved_payload->>'task_kind'='calendar_task' then
    select * into v_calendar from platform.calendar_tasks where id=a.target_id and tenant_id=c.tenant_id for update;
    if not found or not private.redream_task_actor_can_edit(c.tenant_id,'calendar_task',a.target_id,auth.uid()) or to_jsonb(v_calendar) is distinct from a.after_json then raise exception 'This task changed after the update. Review it instead of undoing a newer change'; end if;
    update platform.calendar_tasks set status=a.before_json->>'status',due_on=(a.before_json->>'due_on')::date,
      due_time=(a.before_json->>'due_time')::time,time_zone=a.before_json->>'time_zone',due_at=(a.before_json->>'due_at')::timestamptz,
      revision=revision+1,updated_at=clock_timestamp() where id=a.target_id;
  else
  select * into t from djm_os.tasks where id=a.target_id and tenant_id=c.tenant_id for update;
  if not found then raise exception 'Task access denied' using errcode='42501'; end if;
  perform 1 from platform.work_responsibilities where tenant_id=c.tenant_id and work_kind='task' and work_id=a.target_id for share;
  if not private.redream_task_actor_can_edit(c.tenant_id,'task',a.target_id,auth.uid()) or to_jsonb(t) is distinct from a.after_json then
    raise exception 'This task changed after the update. Review it instead of undoing a newer change';
  end if;
  update djm_os.tasks set status=a.before_json->>'status',completed_at=(a.before_json->>'completed_at')::timestamptz,
    due_at=(a.before_json->>'due_at')::timestamptz,updated_at=clock_timestamp() where id=t.id;
  end if;
  update djm_os.tell_djm_actions set status='undone',undone_at=now(),updated_at=now() where id=a.id;
  insert into djm_os.events(tenant_id,event_type,actor_user_id,payload,source,confidence,occurred_at)
  values(c.tenant_id,'REDREAM_AI_TASK_UPDATE_UNDONE',auth.uid(),jsonb_build_object('capture_id',c.id,'action_id',a.id,'task_id',a.target_id),'redream_ai',1,now());
  return jsonb_build_object('capture_id',c.id,'action_id',a.id,'undone',true);
end;
$$;
revoke all on function private.redream_ai_undo_task(uuid) from public,anon,authenticated;


-- A signed upload is not a successful profile update. Verify the stored object,
-- recheck edit access and compare the previous photo in one database transaction.
create or replace function public.platform_server_attach_player_photo(
 p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid,p_path text,p_expected_photo_path text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.players%rowtype; media storage.objects%rowtype; old_path text;
begin
 select * into p from public.players where id=p_player_id and tenant_id=p_tenant_id for update;
 if not found or p.archived_at is not null or lower(coalesce(p.football_status,'')) in ('retired','inactive')
   or not private.user_has_staff_tenant_access(p_tenant_id,p_actor_user_id)
   or not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active'
      and (m.role in ('owner','admin') or (m.role in ('agent','operations') and exists(
        select 1 from public.staff_player_access a where a.player_id=p_player_id and a.staff_user_id=p_actor_user_id and a.can_edit))))
 then raise exception 'Player edit access required' using errcode='42501'; end if;
 if p_path is null or p_path !~ ('^agency/'||p_tenant_id::text||'/players/'||p_player_id::text||'/'||p_actor_user_id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$')
 then raise exception 'player_photo_path_invalid' using errcode='22023'; end if;
 select * into media from storage.objects where bucket_id='player-public' and name=p_path;
 if not found or coalesce(media.metadata->>'mimetype','') not in ('image/jpeg','image/png','image/webp')
   or coalesce((media.metadata->>'size')::bigint,0) not between 1 and 8388608
 then raise exception 'player_photo_upload_incomplete' using errcode='22023'; end if;
 if p.profile_photo_path=p_path then return jsonb_build_object('id',p.id,'profile_photo_path',p_path,'verification_status',p.verification_status,'verified_at',p.verified_at,'review_required_at',p.review_required_at,'review_reason',p.review_reason); end if;
 if p.profile_photo_path is distinct from p_expected_photo_path then
   raise exception 'player_photo_revision_conflict' using errcode='40001';
 end if;
 old_path:=p.profile_photo_path;
 update public.players set profile_photo_path=p_path,updated_at=clock_timestamp() where id=p.id returning * into p;
 insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
 values(p_tenant_id,p_actor_user_id,'user','player.photo_updated','player',p.id::text,
   jsonb_build_object('profile_photo_path',old_path),jsonb_build_object('profile_photo_path',p_path),'{}');
 return jsonb_build_object('id',p.id,'profile_photo_path',p_path,'verification_status',p.verification_status,'verified_at',p.verified_at,'review_required_at',p.review_required_at,'review_reason',p.review_reason);
end;$$;
revoke all on function public.platform_server_attach_player_photo(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.platform_server_attach_player_photo(uuid,uuid,uuid,text,text) to service_role;
