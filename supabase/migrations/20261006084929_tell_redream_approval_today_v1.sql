-- Tell ReDream approval-first capture and explicit task ownership.
-- Reuses the existing action ledger. No new tables or exposed data surfaces.

create or replace function public.redream_ai_resolve_team_member(
  p_capture_id uuid,
  p_spoken_name text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
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

  select c.tenant_id into v_tenant
  from djm_os.captures c
  where c.id=p_capture_id and c.processing_version='tell_djm_v1';

  if v_tenant is null then raise exception 'Capture not found'; end if;

  select count(*) into v_exact_count
  from platform.tenant_memberships m
  join djm_os.team_members tm on tm.user_id=m.user_id
  where m.tenant_id=v_tenant and m.status='active' and tm.is_active
    and lower(trim(tm.display_name))=v_name;

  if v_exact_count=1 then
    select m.user_id,tm.display_name into v_user_id,v_display_name
    from platform.tenant_memberships m
    join djm_os.team_members tm on tm.user_id=m.user_id
    where m.tenant_id=v_tenant and m.status='active' and tm.is_active
      and lower(trim(tm.display_name))=v_name
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

  with matches as (
    select m.user_id,tm.display_name
    from platform.tenant_memberships m
    join djm_os.team_members tm on tm.user_id=m.user_id
    where m.tenant_id=v_tenant and m.status='active' and tm.is_active
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
$$;

revoke all on function public.redream_ai_resolve_team_member(uuid,text)
from public,anon,authenticated;
grant execute on function public.redream_ai_resolve_team_member(uuid,text)
to service_role;


create or replace function public.redream_ai_stage_action(
  p_capture_id uuid,
  p_action_hash text,
  p_action_index integer,
  p_action_type text,
  p_confidence numeric,
  p_evidence text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
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

  if found and v_action.status in ('applied','undone','needs_review') then
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
$$;

revoke all on function public.redream_ai_stage_action(uuid,text,integer,text,numeric,text,jsonb)
from public,anon,authenticated;
grant execute on function public.redream_ai_stage_action(uuid,text,integer,text,numeric,text,jsonb)
to service_role;


create or replace function public.redream_ai_worker_complete(
  p_capture_id uuid,
  p_transcript text,
  p_summary text,
  p_usage jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_open_questions integer;
  v_failed integer;
  v_review integer;
  v_pending integer;
begin
  select count(*) into v_open_questions
  from djm_os.tell_djm_questions
  where capture_id=p_capture_id and status='open';

  select count(*) into v_failed
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and status='failed';

  select count(*) into v_review
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and status='needs_review';

  select count(*) into v_pending
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and status='pending';

  v_status:=case
    when v_open_questions>0 then 'needs_input'
    when v_failed>0 then 'partial'
    when v_review>0 then 'needs_review'
    when v_pending>0 then 'needs_review'
    else 'done'
  end;

  update djm_os.captures
  set transcript_text=p_transcript,
      raw_text=coalesce(raw_text,p_transcript),
      summary=p_summary,
      usage_json=coalesce(usage_json,'{}'::jsonb)||coalesce(p_usage,'{}'::jsonb),
      status=v_status,
      completed_at=now(),
      processed_at=now(),
      locked_at=null,
      locked_by=null,
      error_message=null,
      last_error_code=null,
      receipt_json=jsonb_build_object(
        'status',v_status,
        'open_questions',v_open_questions,
        'failed_actions',v_failed,
        'review_actions',v_review,
        'pending_approval_actions',v_pending,
        'approval_required',v_pending>0
      )
  where id=p_capture_id;

  if not found then raise exception 'Capture not found'; end if;

  return jsonb_build_object(
    'capture_id',p_capture_id,
    'status',v_status,
    'approval_required',v_pending>0,
    'pending_approval_actions',v_pending
  );
end;
$$;

revoke all on function public.redream_ai_worker_complete(uuid,text,text,jsonb)
from public,anon,authenticated;
grant execute on function public.redream_ai_worker_complete(uuid,text,text,jsonb)
to service_role;


create or replace function public.redream_ai_receipt(p_capture_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.tell_assert_capture(p_capture_id,false);
  perform private.tell_request_tenant();

  select jsonb_build_object(
    'capture',jsonb_build_object(
      'id',c.id,
      'status',c.status,
      'summary',c.summary,
      'transcript_text',c.transcript_text,
      'created_at',c.created_at,
      'completed_at',c.completed_at,
      'error_message',c.error_message,
      'approval_required',exists(
        select 1 from djm_os.tell_djm_actions pa
        where pa.capture_id=c.id and pa.status='pending'
      )
    ),
    'actions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,
        'action_type',a.action_type,
        'status',a.status,
        'confidence',a.confidence,
        'evidence',a.evidence,
        'proposed_payload',a.proposed_payload,
        'resolved_payload',a.resolved_payload,
        'target_type',a.target_type,
        'target_id',a.target_id,
        'verification',a.verification_json,
        'undo_supported',a.undo_supported,
        'error_message',a.error_message
      ) order by a.action_index,a.created_at)
      from djm_os.tell_djm_actions a
      where a.capture_id=c.id and a.status<>'superseded'
    ),'[]'::jsonb),
    'questions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',q.id,
        'field_key',q.field_key,
        'prompt',q.prompt,
        'reason',q.reason,
        'candidates',q.candidates,
        'status',q.status
      ) order by q.created_at)
      from djm_os.tell_djm_questions q
      where q.capture_id=c.id and q.status<>'superseded'
    ),'[]'::jsonb)
  )
  into v_result
  from djm_os.captures c
  where c.id=p_capture_id
    and c.tenant_id=private.tell_request_tenant();

  if v_result is null then raise exception 'Capture not found'; end if;
  return v_result;
end;
$$;

revoke all on function public.redream_ai_receipt(uuid)
from public,anon;
grant execute on function public.redream_ai_receipt(uuid)
to authenticated;


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
        ),
      updated_at=now()
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
