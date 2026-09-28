begin;

-- #100 proved provider thread identity is useful for narrowing work, but
-- conversation identity alone is not proof that a task has been completed.
-- Keep thread identity, but remove the automatic interaction trigger.
drop trigger if exists
  redream_complete_email_thread_followup
on
  djm_os.interactions;

drop function if exists
  private.redream_complete_email_thread_followup();


create or replace function private.redream_enrich_email_task_candidate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_provider text;
  v_thread_id text;
  v_candidate_count integer := 0;
  v_task_id uuid;
  v_task_title text;
begin
  if new.channel not in (
       'google_email',
       'microsoft_email'
     )
     or new.person_id is null
     or new.submitted_by is null
     or coalesce(
       new.context_json
         ->> 'capture_origin',
       ''
     ) <> 'email'
     or coalesce(
       new.context_json
         ->> 'email_direction',
       ''
     ) <> 'outbound'
  then
    return new;
  end if;

  v_provider :=
    nullif(
      btrim(
        new.context_json
          ->> 'provider'
      ),
      ''
    );

  v_thread_id :=
    nullif(
      btrim(
        new.context_json
          ->> 'external_thread_id'
      ),
      ''
    );

  if v_provider not in (
       'google',
       'microsoft'
     )
     or v_thread_id is null
  then
    return new;
  end if;

  with candidates as (
    select distinct
      t.id,
      t.title
    from
      djm_os.provider_email_receipts r
    join
      djm_os.tasks t
      on t.tenant_id =
        new.tenant_id
     and t.person_id =
        new.person_id
     and t.owner_user_id =
        new.submitted_by
     and t.status not in (
       'done',
       'completed',
       'cancelled'
     )
     and t.task_type =
       'tell_djm'
     and t.source like
       'tell_djm:' ||
       r.capture_id::text ||
       ':%'
    where
      r.tenant_id =
        new.tenant_id
      and r.user_id =
        new.submitted_by
      and r.provider =
        v_provider
      and r.external_thread_id =
        v_thread_id
      and r.capture_id is not null
      and r.occurred_at <
        new.created_at
  )
  select
    count(*)::integer,
    (array_agg(
      id
      order by id
    ))[1],
    (array_agg(
      title
      order by id
    ))[1]
  into
    v_candidate_count,
    v_task_id,
    v_task_title
  from
    candidates;

  new.context_json :=
    coalesce(
      new.context_json,
      '{}'::jsonb
    ) ||
    jsonb_strip_nulls(
      jsonb_build_object(
        'email_thread_task_candidate_count',
        v_candidate_count,
        'email_thread_task_candidate_id',
        case
          when v_candidate_count = 1
            then v_task_id
          else null
        end,
        'email_thread_task_candidate_title',
        case
          when v_candidate_count = 1
            then v_task_title
          else null
        end
      )
    );

  return new;
end;
$function$;


drop trigger if exists
  redream_enrich_email_task_candidate
on
  djm_os.captures;

create trigger
  redream_enrich_email_task_candidate
before insert
on
  djm_os.captures
for each row
execute function
  private.redream_enrich_email_task_candidate();


revoke all on function
  private.redream_enrich_email_task_candidate()
from
  public,
  anon,
  authenticated;


create or replace function public.redream_ai_complete_email_thread_task(
  p_capture_id uuid,
  p_action_hash text,
  p_action_index integer,
  p_confidence numeric,
  p_evidence text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_capture djm_os.captures%rowtype;
  v_permission text;
  v_action djm_os.tell_djm_actions%rowtype;
  v_task djm_os.tasks%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_task_id uuid;
  v_context_task_id uuid;
  v_context_count integer := 0;
  v_provider text;
  v_thread_id text;
  v_db_candidate_count integer := 0;
  v_db_candidate_id uuid;
  v_interaction_id uuid;
  v_source_text text;
  v_evidence_text text;
begin
  select *
  into
    v_capture
  from
    djm_os.captures
  where
    id = p_capture_id
  for update;

  if not found then
    raise exception
      'Capture not found';
  end if;

  if not
    private.user_has_staff_tenant_access(
      v_capture.tenant_id,
      v_capture.submitted_by
    )
  then
    raise exception
      'Capture workspace access denied'
      using errcode = '42501';
  end if;

  select
    permission_scope
  into
    v_permission
  from
    djm_os.tell_djm_permissions
  where
    tenant_id =
      v_capture.tenant_id
    and user_id =
      v_capture.submitted_by
    and is_enabled =
      true;

  if v_permission not in (
       'full',
       'scout'
     )
  then
    raise exception
      'ReDream task completion permission denied';
  end if;

  select *
  into
    v_action
  from
    djm_os.tell_djm_actions
  where
    capture_id =
      p_capture_id
    and action_hash =
      p_action_hash;

  if found
     and v_action.status in (
       'applied',
       'undone',
       'needs_review'
     )
  then
    return
      jsonb_build_object(
        'action_id',
        v_action.id,
        'status',
        v_action.status,
        'duplicate',
        true,
        'target_id',
        v_action.target_id
      );
  end if;

  if v_capture.channel not in (
       'google_email',
       'microsoft_email'
     )
     or coalesce(
       v_capture.context_json
         ->> 'capture_origin',
       ''
     ) <> 'email'
     or coalesce(
       v_capture.context_json
         ->> 'email_direction',
       ''
     ) <> 'outbound'
  then
    raise exception
      'email_completion_requires_outbound_email';
  end if;

  begin
    v_context_count :=
      coalesce(
        nullif(
          v_capture.context_json
            ->> 'email_thread_task_candidate_count',
          ''
        )::integer,
        0
      );
  exception
    when others then
      v_context_count := 0;
  end;

  begin
    v_context_task_id :=
      nullif(
        v_capture.context_json
          ->> 'email_thread_task_candidate_id',
        ''
      )::uuid;
  exception
    when invalid_text_representation then
      v_context_task_id := null;
  end;

  begin
    v_task_id :=
      nullif(
        p_payload
          ->> 'task_id',
        ''
      )::uuid;
  exception
    when invalid_text_representation then
      v_task_id := null;
  end;

  if v_context_count <> 1
     or v_context_task_id is null
     or v_task_id is null
     or v_task_id is distinct from
        v_context_task_id
  then
    raise exception
      'email_thread_task_candidate_mismatch';
  end if;

  v_provider :=
    nullif(
      btrim(
        v_capture.context_json
          ->> 'provider'
      ),
      ''
    );

  v_thread_id :=
    nullif(
      btrim(
        v_capture.context_json
          ->> 'external_thread_id'
      ),
      ''
    );

  if v_provider not in (
       'google',
       'microsoft'
     )
     or v_thread_id is null
  then
    raise exception
      'email_thread_identity_missing';
  end if;

  with candidates as (
    select distinct
      t.id
    from
      djm_os.provider_email_receipts r
    join
      djm_os.tasks t
      on t.tenant_id =
        v_capture.tenant_id
     and t.person_id =
        v_capture.person_id
     and t.owner_user_id =
        v_capture.submitted_by
     and t.status not in (
       'done',
       'completed',
       'cancelled'
     )
     and t.task_type =
       'tell_djm'
     and t.source like
       'tell_djm:' ||
       r.capture_id::text ||
       ':%'
    where
      r.tenant_id =
        v_capture.tenant_id
      and r.user_id =
        v_capture.submitted_by
      and r.provider =
        v_provider
      and r.external_thread_id =
        v_thread_id
      and r.capture_id is not null
      and r.capture_id <>
        v_capture.id
      and r.occurred_at <
        v_capture.created_at
  )
  select
    count(*)::integer,
    (array_agg(
      id
      order by id
    ))[1]
  into
    v_db_candidate_count,
    v_db_candidate_id
  from
    candidates;

  if v_db_candidate_count <> 1
     or v_db_candidate_id is null
     or v_db_candidate_id is distinct from
        v_task_id
  then
    raise exception
      'email_thread_task_candidate_changed';
  end if;

  v_source_text :=
    regexp_replace(
      lower(
        coalesce(
          nullif(
            v_capture.transcript_text,
            ''
          ),
          v_capture.raw_text,
          ''
        )
      ),
      '[[:space:]]+',
      ' ',
      'g'
    );

  v_evidence_text :=
    regexp_replace(
      lower(
        btrim(
          coalesce(
            p_evidence,
            ''
          )
        )
      ),
      '[[:space:]]+',
      ' ',
      'g'
    );

  if v_evidence_text = ''
     or strpos(
       v_source_text,
       v_evidence_text
     ) = 0
  then
    raise exception
      'email_completion_evidence_not_grounded';
  end if;

  if coalesce(
       p_confidence,
       0
     ) < 0.90
  then
    insert into
      djm_os.tell_djm_actions(
        tenant_id,
        capture_id,
        action_hash,
        action_index,
        action_type,
        status,
        confidence,
        evidence,
        proposed_payload,
        resolved_payload
      )
    values (
      v_capture.tenant_id,
      p_capture_id,
      p_action_hash,
      p_action_index,
      'complete_email_thread_task',
      'needs_review',
      p_confidence,
      p_evidence,
      p_payload,
      p_payload
    )
    on conflict (
      capture_id,
      action_hash
    )
    do update
    set
      status =
        'needs_review',
      confidence =
        excluded.confidence,
      evidence =
        excluded.evidence,
      resolved_payload =
        excluded.resolved_payload,
      error_message =
        null,
      updated_at =
        now()
    returning *
    into
      v_action;

    insert into
      djm_os.review_items(
        tenant_id,
        owner_user_id,
        review_type,
        title,
        detail,
        person_id,
        organisation_id,
        capture_id,
        confidence,
        payload,
        status
      )
    values (
      v_capture.tenant_id,
      v_capture.submitted_by,
      'tell_djm_action_review',
      'Check ReDream AI updates',
      'ReDream found a possible completed email follow-up, but confidence was not high enough to close it automatically.',
      v_capture.person_id,
      v_capture.organisation_id,
      p_capture_id,
      p_confidence,
      jsonb_build_object(
        'actions',
        jsonb_build_array(
          jsonb_build_object(
            'action_id',
            v_action.id,
            'action_type',
            'complete_email_thread_task',
            'evidence',
            p_evidence,
            'payload',
            p_payload
          )
        )
      ),
      'open'
    )
    on conflict (
      capture_id,
      review_type
    )
    do update
    set
      confidence =
        greatest(
          coalesce(
            djm_os.review_items.confidence,
            0
          ),
          coalesce(
            excluded.confidence,
            0
          )
        ),
      payload =
        jsonb_build_object(
          'actions',
          coalesce(
            djm_os.review_items.payload
              -> 'actions',
            '[]'::jsonb
          ) ||
          coalesce(
            excluded.payload
              -> 'actions',
            '[]'::jsonb
          )
        ),
      status =
        case
          when djm_os.review_items.status in (
            'approved',
            'rejected',
            'resolved',
            'expired'
          )
            then 'open'
          else
            djm_os.review_items.status
        end,
      resolved_at =
        null;

    return
      jsonb_build_object(
        'action_id',
        v_action.id,
        'status',
        'needs_review',
        'duplicate',
        false
      );
  end if;

  select *
  into
    v_task
  from
    djm_os.tasks t
  where
    t.id =
      v_task_id
    and t.tenant_id =
      v_capture.tenant_id
    and t.person_id =
      v_capture.person_id
    and t.owner_user_id =
      v_capture.submitted_by
    and t.task_type =
      'tell_djm'
    and t.status not in (
      'done',
      'completed',
      'cancelled'
    )
  for update;

  if not found then
    raise exception
      'email_thread_task_not_open';
  end if;

  v_before :=
    to_jsonb(
      v_task
    );

  select
    i.id
  into
    v_interaction_id
  from
    djm_os.interactions i
  where
    i.tenant_id =
      v_capture.tenant_id
    and i.person_id =
      v_capture.person_id
    and i.source_type =
      'tell_djm'
    and i.source_external_id like
      'tell:' ||
      v_capture.id::text ||
      ':%'
  order by
    i.created_at asc
  limit 1;

  update
    djm_os.tasks t
  set
    status =
      'completed',
    completed_at =
      coalesce(
        t.completed_at,
        now()
      ),
    interaction_id =
      coalesce(
        t.interaction_id,
        v_interaction_id
      ),
    updated_at =
      now()
  where
    t.id =
      v_task_id
    and t.tenant_id =
      v_capture.tenant_id
  returning
    to_jsonb(t)
  into
    v_after;

  insert into
    djm_os.tell_djm_actions(
      tenant_id,
      capture_id,
      action_hash,
      action_index,
      action_type,
      status,
      confidence,
      evidence,
      proposed_payload,
      resolved_payload,
      target_type,
      target_id,
      before_json,
      after_json,
      verification_json,
      undo_supported,
      applied_at
    )
  values (
    v_capture.tenant_id,
    p_capture_id,
    p_action_hash,
    p_action_index,
    'complete_email_thread_task',
    'applied',
    p_confidence,
    p_evidence,
    p_payload,
    p_payload,
    'task',
    v_task_id,
    v_before,
    v_after,
    jsonb_build_object(
      'read_back',
      true,
      'verified_at',
      now(),
      'target_exists',
      true,
      'provider',
      v_provider,
      'external_thread_id',
      v_thread_id
    ),
    true,
    now()
  )
  on conflict (
    capture_id,
    action_hash
  )
  do update
  set
    status =
      'applied',
    confidence =
      excluded.confidence,
    evidence =
      excluded.evidence,
    resolved_payload =
      excluded.resolved_payload,
    target_type =
      excluded.target_type,
    target_id =
      excluded.target_id,
    before_json =
      excluded.before_json,
    after_json =
      excluded.after_json,
    verification_json =
      excluded.verification_json,
    undo_supported =
      true,
    error_message =
      null,
    applied_at =
      excluded.applied_at,
    updated_at =
      now()
  returning *
  into
    v_action;

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
    'REDREAM_AI_ACTION_APPLIED',
    v_capture.submitted_by,
    v_capture.person_id,
    v_capture.organisation_id,
    jsonb_build_object(
      'capture_id',
      p_capture_id,
      'action_id',
      v_action.id,
      'action_type',
      'complete_email_thread_task',
      'target_id',
      v_task_id,
      'provider',
      v_provider,
      'external_thread_id',
      v_thread_id
    ),
    'tell_djm',
    p_confidence,
    now()
  );

  return
    jsonb_build_object(
      'action_id',
      v_action.id,
      'status',
      'applied',
      'target_id',
      v_task_id,
      'duplicate',
      false,
      'verified',
      true
    );
end;
$function$;


revoke all on function
  public.redream_ai_complete_email_thread_task(
    uuid,
    text,
    integer,
    numeric,
    text,
    jsonb
  )
from
  public,
  anon,
  authenticated;

grant execute on function
  public.redream_ai_complete_email_thread_task(
    uuid,
    text,
    integer,
    numeric,
    text,
    jsonb
  )
to
  service_role;


do $rename$
begin
  if to_regprocedure(
       'public.redream_ai_undo_action_core_pre_email(uuid)'
     ) is null
  then
    alter function
      public.redream_ai_undo_action(uuid)
    rename to
      redream_ai_undo_action_core_pre_email;
  end if;
end
$rename$;


revoke all on function
  public.redream_ai_undo_action_core_pre_email(uuid)
from
  public,
  anon,
  authenticated,
  service_role;


create or replace function public.redream_ai_undo_action(
  p_action_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_action djm_os.tell_djm_actions%rowtype;
  v_capture djm_os.captures%rowtype;
  v_task djm_os.tasks%rowtype;
  v_before_status text;
  v_before_completed timestamptz;
  v_before_interaction uuid;
begin
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


revoke all on function
  public.redream_ai_undo_action(uuid)
from
  public,
  anon,
  service_role;

grant execute on function
  public.redream_ai_undo_action(uuid)
to
  authenticated;


notify pgrst, 'reload schema';

commit;
