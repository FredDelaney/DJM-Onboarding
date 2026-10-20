-- Existing tasks remain canonical. The capture action ledger provides retries,
-- provenance and guarded Undo. No new tables, grants on data, or external actions.
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
      select t.id,t.title,t.status,'task'::text as task_kind,t.owner_user_id,t.updated_at,t.due_at,t.person_id,t.player_id,t.organisation_id,
        p.full_name as person_name,nullif(concat_ws(' ',pl.first_name,pl.last_name),'') as player_name,o.name as club_name
      from djm_os.tasks t
      left join djm_os.people p on p.id=t.person_id and p.tenant_id=c.tenant_id
      left join public.players pl on pl.id=t.player_id and pl.tenant_id=c.tenant_id
      left join djm_os.organisations o on o.id=t.organisation_id and o.tenant_id=c.tenant_id
      where t.tenant_id=c.tenant_id and t.owner_user_id=c.submitted_by
        and (t.status in ('open','in_progress') or (t.status='completed' and t.completed_at>now()-interval '30 days'))
      union all
      select t.id,t.title,case when t.status='done' then 'completed' else t.status end,'calendar_task',t.owner_user_id,t.updated_at,t.due_at,
        null::uuid,null::uuid,null::uuid,null::text,null::text,null::text
      from platform.calendar_tasks t where t.tenant_id=c.tenant_id and t.owner_user_id=c.submitted_by and t.archived_at is null
        and (t.status='open' or (t.status='done' and t.updated_at>now()-interval '30 days'))
    ) work
    order by case when status='completed' then 1 else 0 end,due_at nulls last,updated_at desc,id limit 80
  ) x;
  return jsonb_build_object('tasks',v_tasks,'timezone',v_timezone,'limit',80);
end;
$$;
revoke all on function public.redream_ai_task_context(uuid) from public,anon,authenticated;
grant execute on function public.redream_ai_task_context(uuid) to service_role;

create or replace function public.redream_ai_capture_action_states(p_capture_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c djm_os.captures%rowtype; result jsonb;
begin
  select * into c from djm_os.captures where id=p_capture_id;
  if not found or not private.user_has_staff_tenant_access(c.tenant_id,c.submitted_by) then raise exception 'Capture access denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('hash',action_hash,'status',status)),'[]'::jsonb) into result
  from djm_os.tell_djm_actions where capture_id=c.id and tenant_id=c.tenant_id;
  return result;
end;
$$;
revoke all on function public.redream_ai_capture_action_states(uuid) from public,anon,authenticated;
grant execute on function public.redream_ai_capture_action_states(uuid) to service_role;

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
    select * into v_calendar from platform.calendar_tasks where id=v_target and tenant_id=c.tenant_id and owner_user_id=c.submitted_by and archived_at is null for update;
    if not found then raise exception 'Only your own available task can be changed' using errcode='42501'; end if;
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
    and tenant_id=c.tenant_id and owner_user_id=c.submitted_by for update;
  if not found then raise exception 'Only your own available task can be changed' using errcode='42501'; end if;
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
    select * into v_calendar from platform.calendar_tasks where id=a.target_id and tenant_id=c.tenant_id and owner_user_id=auth.uid() for update;
    if not found or to_jsonb(v_calendar) is distinct from a.after_json then raise exception 'This task changed after the update. Review it instead of undoing a newer change'; end if;
    update platform.calendar_tasks set status=a.before_json->>'status',due_on=(a.before_json->>'due_on')::date,
      due_time=(a.before_json->>'due_time')::time,time_zone=a.before_json->>'time_zone',due_at=(a.before_json->>'due_at')::timestamptz,
      revision=revision+1,updated_at=clock_timestamp() where id=a.target_id;
  else
  select * into t from djm_os.tasks where id=a.target_id and tenant_id=c.tenant_id and owner_user_id=auth.uid() for update;
  if not found or to_jsonb(t) is distinct from a.after_json then
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

-- Preserve the deployed ownership and email-completion behaviour.
CREATE OR REPLACE FUNCTION public.redream_ai_approve_capture(p_capture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_tenant uuid;
  v_capture djm_os.captures%rowtype;
  v_action djm_os.tell_djm_actions%rowtype;
  v_result jsonb;
  v_owner uuid;
  v_responsible uuid[];
  v_pending integer;
  v_open_questions integer;
  v_failed integer;
  v_review integer;
  v_status text;
begin
  if v_actor is null then
    raise exception 'Sign in required' using errcode='42501';
  end if;

  perform private.tell_assert_capture(p_capture_id,true);
  v_tenant:=private.tell_request_tenant();

  select * into v_capture
  from djm_os.captures
  where id=p_capture_id and tenant_id=v_tenant
  for update;

  if not found then raise exception 'Capture not found'; end if;

  if v_capture.submitted_by<>v_actor and not exists (
    select 1
    from djm_os.tell_djm_permissions p
    where p.tenant_id=v_tenant
      and p.user_id=v_actor
      and p.permission_scope='full'
      and p.is_enabled
  ) then
    raise exception 'Only the capture owner or a full-access agency user can approve this'
      using errcode='42501';
  end if;

  select count(*) into v_open_questions
  from djm_os.tell_djm_questions q
  where q.capture_id=p_capture_id and q.status='open';

  if v_open_questions>0 then
    raise exception 'Answer ReDream questions before approving this update';
  end if;

  for v_action in
    select *
    from djm_os.tell_djm_actions
    where capture_id=p_capture_id and status in ('pending','failed')
    order by action_index,created_at
    for update
  loop
    begin
    if v_action.action_type='update_task' then
      select public.redream_ai_update_task(p_capture_id,v_action.action_hash,v_action.action_index,
        v_action.confidence,v_action.evidence,v_action.resolved_payload) into v_result;
    elsif v_action.action_type='log_scout_observation' then
      select public.redream_ai_apply_scout_observation(
        p_capture_id,
        v_action.action_hash,
        v_action.action_index,
        v_action.confidence,
        v_action.evidence,
        v_action.resolved_payload
      ) into v_result;
    elsif v_action.action_type='complete_email_thread_task' then
      select public.redream_ai_complete_email_thread_task(
        p_capture_id,
        v_action.action_hash,
        v_action.action_index,
        v_action.confidence,
        v_action.evidence,
        v_action.resolved_payload
      ) into v_result;
    else
      select public.redream_ai_apply_action(
        p_capture_id,
        v_action.action_hash,
        v_action.action_index,
        v_action.action_type,
        v_action.confidence,
        v_action.evidence,
        v_action.resolved_payload
      ) into v_result;
    end if;

    if coalesce(v_result->>'status','')='failed' then
      raise exception 'One proposed update could not be applied';
    end if;

    if v_action.action_type='create_task'
       and coalesce(v_result->>'status','')='applied'
    then
      v_owner:=null;
      v_responsible:='{}'::uuid[];

      if nullif(v_action.resolved_payload->>'owner_user_id','') is not null then
        v_owner:=(v_action.resolved_payload->>'owner_user_id')::uuid;
      end if;

      if jsonb_typeof(v_action.resolved_payload->'responsible_user_ids')='array' then
        select coalesce(array_agg(distinct value::uuid),'{}'::uuid[])
        into v_responsible
        from jsonb_array_elements_text(v_action.resolved_payload->'responsible_user_ids');
      end if;

      if coalesce(cardinality(v_responsible),0)=0 and v_owner is not null then
        v_responsible:=array[v_owner];
      end if;

      if v_owner is null and coalesce(cardinality(v_responsible),0)>0 then
        v_owner:=v_responsible[1];
      end if;

      if v_owner is not null and not exists (
        select 1
        from platform.tenant_memberships m
        join djm_os.team_members tm on tm.user_id=m.user_id
        where m.tenant_id=v_tenant
          and m.user_id=v_owner
          and m.status='active'
          and tm.is_active
      ) then
        raise exception 'The proposed task owner is no longer an active agency member';
      end if;

      if exists (
        select 1
        from unnest(v_responsible) r(user_id)
        where not exists (
          select 1
          from platform.tenant_memberships m
          join djm_os.team_members tm on tm.user_id=m.user_id
          where m.tenant_id=v_tenant
            and m.user_id=r.user_id
            and m.status='active'
            and tm.is_active
        )
      ) then
        raise exception 'One proposed responsible person is no longer an active agency member';
      end if;

      if v_owner is not null then
        update djm_os.tasks t
        set owner_user_id=v_owner,
            updated_at=now()
        where t.tenant_id=v_tenant
          and t.id=(v_result->>'target_id')::uuid;
      end if;

      if coalesce(cardinality(v_responsible),0)>0 then
        insert into platform.work_responsibilities(
          tenant_id,work_kind,work_id,responsible_user_ids,revision,updated_by,updated_at
        )
        values(
          v_tenant,
          'task',
          (v_result->>'target_id')::uuid,
          v_responsible,
          1,
          v_actor,
          now()
        )
        on conflict(tenant_id,work_kind,work_id)
        do update
        set responsible_user_ids=excluded.responsible_user_ids,
            revision=platform.work_responsibilities.revision+1,
            updated_by=excluded.updated_by,
            updated_at=now();
      end if;

      update djm_os.tell_djm_actions a
      set after_json=(
            select to_jsonb(t)
            from djm_os.tasks t
            where t.tenant_id=v_tenant and t.id=a.target_id
          ),
          verification_json=coalesce(a.verification_json,'{}'::jsonb)
            || jsonb_build_object(
              'approved_by',v_actor,
              'approved_at',now(),
              'owner_user_id',v_owner,
              'responsible_user_ids',to_jsonb(v_responsible)
            ),
          updated_at=now()
      where a.id=v_action.id;

      insert into djm_os.events(
        tenant_id,event_type,actor_user_id,payload,source,confidence,occurred_at
      )
      values (
        v_tenant,
        'REDREAM_AI_TASK_OWNER_ASSIGNED',
        v_actor,
        jsonb_build_object(
          'capture_id',p_capture_id,
          'action_id',v_action.id,
          'owner_user_id',v_owner,
          'responsible_user_ids',to_jsonb(v_responsible)
        ),
        'redream_ai',
        1,
        now()
      );
    end if;
    exception when others then
      update djm_os.tell_djm_actions set status='failed',error_message=left(SQLERRM,300),updated_at=now() where id=v_action.id;
    end;
  end loop;

  select count(*) into v_pending
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and status='pending';

  select count(*) into v_failed
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and status='failed';

  select count(*) into v_review
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and status='needs_review';

  v_status:=case
    when v_failed>0 then 'partial'
    when v_review>0 then 'needs_review'
    when v_pending>0 then 'needs_review'
    else 'done'
  end;

  update djm_os.captures
  set status=v_status,
      completed_at=now(),
      receipt_json=coalesce(receipt_json,'{}'::jsonb)
        || jsonb_build_object(
          'status',v_status,
          'approval_required',v_pending>0,
          'approved_at',now(),
          'approved_by',v_actor
        )
  where id=p_capture_id and tenant_id=v_tenant;

  insert into djm_os.events(
    tenant_id,event_type,actor_user_id,payload,source,confidence,occurred_at
  )
  values (
    v_tenant,
    'REDREAM_AI_CAPTURE_APPROVED',
    v_actor,
    jsonb_build_object(
      'capture_id',p_capture_id,
      'status',v_status
    ),
    'redream_ai',
    1,
    now()
  );

  return jsonb_build_object(
    'ok',true,
    'status',v_status,
    'receipt',public.redream_ai_receipt(p_capture_id)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.redream_ai_undo_action(p_action_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_action djm_os.tell_djm_actions%rowtype;
  v_capture djm_os.captures%rowtype;
  v_task djm_os.tasks%rowtype;
  v_before_status text;
  v_before_completed timestamptz;
  v_before_interaction uuid;
begin
  if exists(select 1 from djm_os.tell_djm_actions where id=p_action_id and action_type='update_task') then
    return private.redream_ai_undo_task(p_action_id);
  end if;
  select *
  into
    v_action
  from
    djm_os.tell_djm_actions
  where
    id =
      p_action_id;

  if not found
     or v_action.action_type <>
        'complete_email_thread_task'
  then
    return
      public.redream_ai_undo_action_core_pre_email(
        p_action_id
      );
  end if;

  perform
    private.tell_request_tenant();

  if v_action.status <>
       'applied'
     or not
       v_action.undo_supported
  then
    raise exception
      'This action cannot be undone';
  end if;

  perform
    private.tell_assert_capture(
      v_action.capture_id,
      true
    );

  select *
  into
    v_capture
  from
    djm_os.captures
  where
    id =
      v_action.capture_id;

  if not found then
    raise exception
      'Capture not found';
  end if;

  if v_capture.submitted_by <>
       auth.uid()
     and not exists (
       select 1
       from
         djm_os.tell_djm_permissions p
       where
         p.user_id =
           auth.uid()
         and p.tenant_id =
           private.tell_request_tenant()
         and p.permission_scope =
           'full'
         and p.is_enabled =
           true
     )
  then
    raise exception
      'Only the capture owner or a full-access ReDream user can undo this';
  end if;

  select *
  into
    v_task
  from
    djm_os.tasks t
  where
    t.id =
      v_action.target_id
    and t.tenant_id =
      v_capture.tenant_id
  for update;

  if not found then
    raise exception
      'Task missing during undo';
  end if;

  if v_task.status is distinct from
       v_action.after_json
         ->> 'status'
     or v_task.completed_at is distinct from
       nullif(
         v_action.after_json
           ->> 'completed_at',
         ''
       )::timestamptz
     or v_task.interaction_id is distinct from
       nullif(
         v_action.after_json
           ->> 'interaction_id',
         ''
       )::uuid
  then
    raise exception
      'This task changed after ReDream AI completed it. Review it manually instead of rolling it back.';
  end if;

  v_before_status :=
    coalesce(
      v_action.before_json
        ->> 'status',
      'open'
    );

  begin
    v_before_completed :=
      nullif(
        v_action.before_json
          ->> 'completed_at',
        ''
      )::timestamptz;
  exception
    when others then
      v_before_completed :=
        null;
  end;

  begin
    v_before_interaction :=
      nullif(
        v_action.before_json
          ->> 'interaction_id',
        ''
      )::uuid;
  exception
    when others then
      v_before_interaction :=
        null;
  end;

  update
    djm_os.tasks
  set
    status =
      v_before_status,
    completed_at =
      v_before_completed,
    interaction_id =
      v_before_interaction,
    updated_at =
      now()
  where
    id =
      v_action.target_id
    and tenant_id =
      v_capture.tenant_id;

  update
    djm_os.tell_djm_actions
  set
    status =
      'undone',
    undone_at =
      now(),
    updated_at =
      now()
  where
    id =
      v_action.id;

  insert into
    djm_os.events(
      tenant_id,
      event_type,
      actor_user_id,
      person_id,
      organisation_id,
      payload,
      source,
      confidence,
      occurred_at
    )
  values (
    v_capture.tenant_id,
    'REDREAM_AI_ACTION_UNDONE',
    auth.uid(),
    v_capture.person_id,
    v_capture.organisation_id,
    jsonb_build_object(
      'capture_id',
      v_action.capture_id,
      'action_id',
      v_action.id,
      'action_type',
      v_action.action_type,
      'target_id',
      v_action.target_id
    ),
    'tell_djm',
    1,
    now()
  );

  return
    jsonb_build_object(
      'capture_id',
      v_action.capture_id,
      'action_id',
      v_action.id,
      'undone',
      true
    );
end;
$function$;

revoke all on function public.redream_ai_approve_capture(uuid),public.redream_ai_undo_action(uuid) from public,anon;
grant execute on function public.redream_ai_approve_capture(uuid),public.redream_ai_undo_action(uuid) to authenticated;

create or replace function public.redream_ai_dismiss_action(p_action_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a djm_os.tell_djm_actions%rowtype; c djm_os.captures%rowtype; v_status text;
begin
  select * into a from djm_os.tell_djm_actions where id=p_action_id;
  if not found then raise exception 'Update not found'; end if;
  perform private.tell_assert_capture(a.capture_id,true);
  select * into c from djm_os.captures where id=a.capture_id for update;
  if c.submitted_by is distinct from auth.uid() or c.tenant_id is distinct from private.tell_request_tenant()
    or not private.user_has_staff_tenant_access(c.tenant_id,auth.uid()) then raise exception 'Capture access denied' using errcode='42501'; end if;
  select * into a from djm_os.tell_djm_actions where id=p_action_id for update;
  if a.status='superseded' then return public.redream_ai_receipt(c.id); end if;
  if a.status not in ('pending','needs_review','failed') then raise exception 'Saved changes must use Undo'; end if;
  update djm_os.tell_djm_actions set status='superseded',updated_at=now() where id=a.id;
  select case when exists(select 1 from djm_os.tell_djm_questions where capture_id=c.id and status='open') then 'needs_input'
    when exists(select 1 from djm_os.tell_djm_actions where capture_id=c.id and status='failed') then 'partial'
    when exists(select 1 from djm_os.tell_djm_actions where capture_id=c.id and status in ('pending','needs_review')) then 'needs_review'
    else 'done' end into v_status;
  update djm_os.captures set status=v_status where id=c.id;
  insert into djm_os.events(tenant_id,event_type,actor_user_id,payload,source,confidence,occurred_at)
  values(c.tenant_id,'REDREAM_AI_ACTION_DISMISSED',auth.uid(),jsonb_build_object('capture_id',c.id,'action_id',a.id),'redream_ai',1,now());
  return public.redream_ai_receipt(c.id);
end;
$$;
revoke all on function public.redream_ai_dismiss_action(uuid) from public,anon;
grant execute on function public.redream_ai_dismiss_action(uuid) to authenticated;

-- Colleague choices must be active staff, separate from player/contact matching.
CREATE OR REPLACE FUNCTION public.redream_ai_resolve_team_member(p_capture_id uuid, p_spoken_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid;
  v_submitter uuid;
  v_name text := lower(trim(coalesce(p_spoken_name,'')));
  v_exact_count integer := 0;
  v_candidate_count integer := 0;
  v_user_id uuid;
  v_display_name text;
  v_candidates jsonb := '[]'::jsonb;
begin
  if v_name='' then
    return jsonb_build_object('resolved',false,'candidates','[]'::jsonb);
  end if;

  select c.tenant_id,c.submitted_by
  into v_tenant,v_submitter
  from djm_os.captures c
  where c.id=p_capture_id and c.processing_version='tell_djm_v1';

  if v_tenant is null then raise exception 'Capture not found'; end if;
  if not private.user_has_staff_tenant_access(v_tenant,v_submitter) then raise exception 'Capture access denied' using errcode='42501'; end if;

  if v_name in ('me','myself','i') then
    select m.user_id,tm.display_name
    into v_user_id,v_display_name
    from platform.tenant_memberships m
    join djm_os.team_members tm on tm.user_id=m.user_id
    where m.tenant_id=v_tenant
      and m.user_id=v_submitter
      and m.status='active' and m.role in ('owner','admin','agent','scout','operations')
      and tm.is_active
    limit 1;

    if v_user_id is not null then
      return jsonb_build_object(
        'resolved',true,
        'user_id',v_user_id,
        'display_name',coalesce(v_display_name,'You'),
        'candidates',jsonb_build_array(jsonb_build_object(
          'user_id',v_user_id,'label',coalesce(v_display_name,'You')
        ))
      );
    end if;
  end if;

  select count(*) into v_exact_count
  from platform.tenant_memberships m
  join djm_os.team_members tm on tm.user_id=m.user_id
  where m.tenant_id=v_tenant
    and m.status='active' and m.role in ('owner','admin','agent','scout','operations')
    and tm.is_active
    and (
      lower(trim(tm.display_name))=v_name
      or lower(split_part(trim(tm.display_name),' ',1))=v_name
    );

  if v_exact_count=1 then
    select m.user_id,tm.display_name into v_user_id,v_display_name
    from platform.tenant_memberships m
    join djm_os.team_members tm on tm.user_id=m.user_id
    where m.tenant_id=v_tenant
      and m.status='active' and m.role in ('owner','admin','agent','scout','operations')
      and tm.is_active
      and (
        lower(trim(tm.display_name))=v_name
        or lower(split_part(trim(tm.display_name),' ',1))=v_name
      )
    limit 1;

    return jsonb_build_object(
      'resolved',true,
      'user_id',v_user_id,
      'display_name',v_display_name,
      'candidates',jsonb_build_array(jsonb_build_object(
        'user_id',v_user_id,'label',v_display_name
      ))
    );
  end if;

  -- Voice transcription can shift a short first-name vowel (for example Dapo -> Depo).
  -- Only accept this when the consonant skeleton identifies one unique active staff member.
  if length(v_name) between 3 and 12 then
    with matches as (
      select m.user_id,tm.display_name
      from platform.tenant_memberships m
      join djm_os.team_members tm on tm.user_id=m.user_id
      where m.tenant_id=v_tenant
        and m.status='active' and m.role in ('owner','admin','agent','scout','operations')
        and tm.is_active
        and abs(length(split_part(trim(tm.display_name),' ',1))-length(v_name))<=1
        and regexp_replace(lower(split_part(trim(tm.display_name),' ',1)),'[aeiouy]','','g')
            = regexp_replace(v_name,'[aeiouy]','','g')
      order by tm.display_name
      limit 6
    )
    select count(*),
           coalesce(jsonb_agg(jsonb_build_object(
             'user_id',user_id,'label',display_name
           ) order by display_name),'[]'::jsonb)
    into v_candidate_count,v_candidates
    from matches;

    if v_candidate_count=1 then
      select (v_candidates->0->>'user_id')::uuid,
             v_candidates->0->>'label'
      into v_user_id,v_display_name;

      return jsonb_build_object(
        'resolved',true,
        'user_id',v_user_id,
        'display_name',v_display_name,
        'matched_by','unique_voice_name',
        'candidates',v_candidates
      );
    end if;
  end if;

  with matches as (
    select m.user_id,tm.display_name
    from platform.tenant_memberships m
    join djm_os.team_members tm on tm.user_id=m.user_id
    where m.tenant_id=v_tenant
      and m.status='active' and m.role in ('owner','admin','agent','scout','operations')
      and tm.is_active
      and (
        lower(split_part(trim(tm.display_name),' ',1))=v_name
        or lower(trim(tm.display_name)) like v_name||' %'
      )
    order by tm.display_name
    limit 6
  )
  select count(*),
         coalesce(jsonb_agg(jsonb_build_object(
           'user_id',user_id,'label',display_name
         ) order by display_name),'[]'::jsonb)
  into v_candidate_count,v_candidates
  from matches;

  if v_candidate_count=1 then
    select (v_candidates->0->>'user_id')::uuid,
           v_candidates->0->>'label'
    into v_user_id,v_display_name;
    return jsonb_build_object(
      'resolved',true,
      'user_id',v_user_id,
      'display_name',v_display_name,
      'candidates',v_candidates
    );
  end if;

  return jsonb_build_object(
    'resolved',false,
    'candidates',v_candidates
  );
end;
$function$;

revoke all on function public.redream_ai_resolve_team_member(uuid,text) from public,anon,authenticated;
grant execute on function public.redream_ai_resolve_team_member(uuid,text) to service_role;

-- A worker retry must honour an explicit decision to leave a proposal unchanged.
CREATE OR REPLACE FUNCTION public.redream_ai_stage_action(p_capture_id uuid, p_action_hash text, p_action_index integer, p_action_type text, p_confidence numeric, p_evidence text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_capture djm_os.captures%rowtype;
  v_action djm_os.tell_djm_actions%rowtype;
begin
  select * into v_capture
  from djm_os.captures
  where id=p_capture_id
  for update;

  if not found then raise exception 'Capture not found'; end if;
  if not private.user_has_staff_tenant_access(v_capture.tenant_id,v_capture.submitted_by) then
    raise exception 'Capture workspace access denied' using errcode='42501';
  end if;

  perform private.tell_assert_entities(v_capture.tenant_id,coalesce(p_payload,'{}'::jsonb));

  select * into v_action
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and action_hash=p_action_hash;

  if found and v_action.status in ('applied','undone','needs_review','superseded') then
    return jsonb_build_object(
      'action_id',v_action.id,
      'status',v_action.status,
      'duplicate',true,
      'target_id',v_action.target_id
    );
  end if;

  insert into djm_os.tell_djm_actions(
    tenant_id,capture_id,action_hash,action_index,action_type,status,
    confidence,evidence,proposed_payload,resolved_payload,
    verification_json,undo_supported
  )
  values (
    v_capture.tenant_id,p_capture_id,p_action_hash,p_action_index,p_action_type,'pending',
    p_confidence,p_evidence,coalesce(p_payload,'{}'::jsonb),coalesce(p_payload,'{}'::jsonb),
    jsonb_build_object(
      'approval_required',true,
      'staged_at',now(),
      'source','redream_ai'
    ),
    false
  )
  on conflict (capture_id,action_hash)
  do update
  set action_index=excluded.action_index,
      action_type=excluded.action_type,
      status='pending',
      confidence=excluded.confidence,
      evidence=excluded.evidence,
      proposed_payload=excluded.proposed_payload,
      resolved_payload=excluded.resolved_payload,
      target_type=null,
      target_id=null,
      before_json=null,
      after_json=null,
      verification_json=excluded.verification_json,
      undo_supported=false,
      error_message=null,
      applied_at=null,
      undone_at=null,
      updated_at=now()
  returning * into v_action;

  insert into djm_os.events(
    tenant_id,event_type,actor_user_id,payload,source,confidence,occurred_at
  )
  values (
    v_capture.tenant_id,
    'REDREAM_AI_ACTION_STAGED',
    v_capture.submitted_by,
    jsonb_build_object(
      'capture_id',p_capture_id,
      'action_id',v_action.id,
      'action_type',p_action_type
    ),
    'redream_ai',
    p_confidence,
    now()
  );

  return jsonb_build_object(
    'action_id',v_action.id,
    'status','pending',
    'duplicate',false
  );
end;
$function$;

revoke all on function public.redream_ai_stage_action(uuid,text,integer,text,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.redream_ai_stage_action(uuid,text,integer,text,numeric,text,jsonb) to service_role;
