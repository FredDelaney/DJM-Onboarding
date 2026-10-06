-- Fix approval capture update for the existing captures schema, which has no updated_at column.

create or replace function public.redream_ai_approve_capture(p_capture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_tenant uuid;
  v_capture djm_os.captures%rowtype;
  v_action djm_os.tell_djm_actions%rowtype;
  v_result jsonb;
  v_owner uuid;
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
    where capture_id=p_capture_id and status='pending'
    order by action_index,created_at
    for update
  loop
    if v_action.action_type='log_scout_observation' then
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
       and nullif(v_action.resolved_payload->>'owner_user_id','') is not null
    then
      v_owner:=(v_action.resolved_payload->>'owner_user_id')::uuid;

      if not exists (
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

      update djm_os.tasks t
      set owner_user_id=v_owner,
          updated_at=now()
      where t.tenant_id=v_tenant
        and t.id=(v_result->>'target_id')::uuid;

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
              'owner_user_id',v_owner
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
          'owner_user_id',v_owner
        ),
        'redream_ai',
        1,
        now()
      );
    end if;
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
$$;

revoke all on function public.redream_ai_approve_capture(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.redream_ai_approve_capture(uuid)
to authenticated,service_role;
