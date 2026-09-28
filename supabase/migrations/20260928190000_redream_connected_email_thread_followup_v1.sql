begin;

alter table
  djm_os.provider_email_receipts
add column if not exists
  external_thread_id text;

create index if not exists
  provider_email_receipts_thread_idx
on
  djm_os.provider_email_receipts(
    tenant_id,
    user_id,
    provider,
    external_thread_id,
    occurred_at
  )
where
  external_thread_id is not null;


create or replace function public.platform_server_provider_email_commit(
  p_tenant_id uuid,
  p_user_id uuid,
  p_provider text,
  p_sync_started_at timestamptz,
  p_emails jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_provider text :=
    lower(
      btrim(
        coalesce(
          p_provider,
          ''
        )
      )
    );
  v_item jsonb;
  v_external_message_id text;
  v_external_thread_id text;
  v_contact_email text;
  v_direction text;
  v_subject text;
  v_body text;
  v_transcript text;
  v_occurred_at timestamptz;
  v_person_id uuid;
  v_person_name text;
  v_organisation_id uuid;
  v_organisation_name text;
  v_receipt_id uuid;
  v_capture_id uuid;
  v_client_capture_id uuid;
  v_capture_ids jsonb :=
    '[]'::jsonb;
  v_seen integer := 0;
  v_captured integer := 0;
  v_duplicates integer := 0;
  v_skipped integer := 0;
begin
  if v_provider not in (
    'google',
    'microsoft'
  ) then
    raise exception 'unsupported_provider';
  end if;

  if not private.user_has_staff_tenant_access(
    p_tenant_id,
    p_user_id
  ) then
    raise exception 'workspace_access_denied';
  end if;

  if not exists (
    select 1
    from djm_os.provider_connections c
    where c.tenant_id = p_tenant_id
      and c.user_id = p_user_id
      and c.provider = v_provider
      and c.status = 'connected'
      and 'email' = any(c.capabilities)
  ) then
    raise exception 'provider_email_not_enabled';
  end if;

  if jsonb_typeof(
    coalesce(
      p_emails,
      '[]'::jsonb
    )
  ) <> 'array' then
    raise exception 'emails_must_be_array';
  end if;

  for v_item in
    select
      value
    from
      jsonb_array_elements(
        coalesce(
          p_emails,
          '[]'::jsonb
        )
      )
  loop
    v_seen :=
      v_seen + 1;

    v_external_message_id :=
      nullif(
        btrim(
          coalesce(
            v_item
              ->> 'external_message_id',
            ''
          )
        ),
        ''
      );

    v_external_thread_id :=
      nullif(
        btrim(
          coalesce(
            v_item
              ->> 'external_thread_id',
            ''
          )
        ),
        ''
      );

    v_contact_email :=
      nullif(
        lower(
          btrim(
            coalesce(
              v_item
                ->> 'contact_email',
              ''
            )
          )
        ),
        ''
      );

    v_direction :=
      lower(
        btrim(
          coalesce(
            v_item
              ->> 'direction',
            ''
          )
        )
      );

    v_subject :=
      nullif(
        btrim(
          coalesce(
            v_item
              ->> 'subject',
            ''
          )
        ),
        ''
      );

    v_body :=
      nullif(
        btrim(
          coalesce(
            v_item
              ->> 'body',
            ''
          )
        ),
        ''
      );

    if
      v_external_message_id is null
      or v_contact_email is null
      or v_direction not in (
        'inbound',
        'outbound'
      )
      or v_body is null
    then
      v_skipped :=
        v_skipped + 1;

      continue;
    end if;

    begin
      v_occurred_at :=
        coalesce(
          nullif(
            v_item
              ->> 'occurred_at',
            ''
          )::timestamptz,
          coalesce(
            p_sync_started_at,
            now()
          )
        );
    exception
      when others then
        v_occurred_at :=
          coalesce(
            p_sync_started_at,
            now()
          );
    end;

    v_person_id :=
      private.redream_provider_contact_person_for_email(
        p_tenant_id,
        p_user_id,
        v_provider,
        v_contact_email
      );

    if v_person_id is null then
      v_skipped :=
        v_skipped + 1;

      continue;
    end if;

    select
      p.full_name
    into
      v_person_name
    from
      djm_os.people p
    where
      p.id = v_person_id
      and p.tenant_id =
        p_tenant_id
    limit 1;

    v_organisation_id :=
      null;

    v_organisation_name :=
      null;

    select
      e.organisation_id,
      o.name
    into
      v_organisation_id,
      v_organisation_name
    from
      djm_os.employments e
    join
      djm_os.organisations o
      on o.id =
        e.organisation_id
     and o.tenant_id =
        p_tenant_id
    where
      e.tenant_id =
        p_tenant_id
      and e.person_id =
        v_person_id
      and e.is_current =
        true
    order by
      e.started_on desc nulls last,
      e.updated_at desc,
      e.id
    limit 1;

    v_receipt_id :=
      null;

    insert into
      djm_os.provider_email_receipts (
        tenant_id,
        user_id,
        provider,
        external_message_id,
        external_thread_id,
        person_id,
        organisation_id,
        direction,
        occurred_at
      )
    values (
      p_tenant_id,
      p_user_id,
      v_provider,
      v_external_message_id,
      v_external_thread_id,
      v_person_id,
      v_organisation_id,
      v_direction,
      v_occurred_at
    )
    on conflict (
      tenant_id,
      user_id,
      provider,
      external_message_id
    )
    do nothing
    returning
      id
    into
      v_receipt_id;

    if v_receipt_id is null then
      update
        djm_os.provider_email_receipts r
      set
        external_thread_id =
          coalesce(
            r.external_thread_id,
            v_external_thread_id
          )
      where
        r.tenant_id =
          p_tenant_id
        and r.user_id =
          p_user_id
        and r.provider =
          v_provider
        and r.external_message_id =
          v_external_message_id;

      update
        djm_os.captures c
      set
        context_json =
          coalesce(
            c.context_json,
            '{}'::jsonb
          ) ||
          case
            when v_external_thread_id is null
              then '{}'::jsonb
            else
              jsonb_build_object(
                'external_thread_id',
                v_external_thread_id
              )
          end
      where
        c.id = (
          select r.capture_id
          from
            djm_os.provider_email_receipts r
          where
            r.tenant_id =
              p_tenant_id
            and r.user_id =
              p_user_id
            and r.provider =
              v_provider
            and r.external_message_id =
              v_external_message_id
          limit 1
        )
        and c.tenant_id =
          p_tenant_id;

      v_duplicates :=
        v_duplicates + 1;

      continue;
    end if;

    v_transcript :=
      left(
        concat_ws(
          E'\n\n',
          case
            when v_subject is null
              then null
            else
              'Subject: ' ||
              v_subject
          end,
          v_body
        ),
        16000
      );

    v_client_capture_id :=
      gen_random_uuid();

    insert into
      djm_os.captures (
        tenant_id,
        submitted_by,
        channel,
        capture_type,
        raw_text,
        person_id,
        organisation_id,
        status,
        confidence,
        client_capture_id,
        context_json,
        next_attempt_at,
        processing_version,
        created_at
      )
    values (
      p_tenant_id,
      p_user_id,
      v_provider ||
        '_email',
      'text',
      v_transcript,
      v_person_id,
      v_organisation_id,
      'queued',
      null,
      v_client_capture_id,
      jsonb_strip_nulls(
        jsonb_build_object(
          'capture_origin',
          'email',
          'provider',
          v_provider,
          'email_direction',
          v_direction,
          'external_message_id',
          v_external_message_id,
          'external_thread_id',
          v_external_thread_id,
          'email_subject',
          v_subject,
          'contact_email',
          v_contact_email,
          'person_id',
          v_person_id,
          'person_name',
          v_person_name,
          'organisation_id',
          v_organisation_id,
          'organisation_name',
          v_organisation_name,
          'email_known_contact',
          true,
          'occurred_at',
          v_occurred_at
        )
      ),
      now(),
      'tell_djm_v1',
      v_occurred_at
    )
    returning
      id
    into
      v_capture_id;

    update
      djm_os.provider_email_receipts
    set
      capture_id =
        v_capture_id
    where
      id =
        v_receipt_id;

    insert into
      djm_os.events (
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
      p_tenant_id,
      'REDREAM_AI_CAPTURE_QUEUED',
      p_user_id,
      v_person_id,
      v_organisation_id,
      jsonb_build_object(
        'capture_id',
        v_capture_id,
        'capture_type',
        'text',
        'client_capture_id',
        v_client_capture_id,
        'capture_origin',
        'email',
        'provider',
        v_provider,
        'direction',
        v_direction
      ),
      'redream_provider_email',
      1,
      now()
    );

    v_capture_ids :=
      v_capture_ids ||
      jsonb_build_array(
        v_capture_id
      );

    v_captured :=
      v_captured + 1;
  end loop;

  insert into
    platform.audit_events (
      tenant_id,
      actor_user_id,
      actor_kind,
      action,
      entity_type,
      entity_id,
      after_state,
      metadata
    )
  values (
    p_tenant_id,
    p_user_id,
    'user',
    'platform.provider.email.synced',
    'provider_connection',
    v_provider,
    jsonb_build_object(
      'emails_seen',
      v_seen,
      'emails_captured',
      v_captured,
      'emails_duplicate',
      v_duplicates,
      'emails_skipped',
      v_skipped
    ),
    jsonb_build_object(
      'provider',
      v_provider,
      'source',
      'provider_sync'
    )
  );

  return
    jsonb_build_object(
      'provider',
      v_provider,
      'emails_seen',
      v_seen,
      'emails_captured',
      v_captured,
      'emails_duplicate',
      v_duplicates,
      'emails_skipped',
      v_skipped,
      'capture_ids',
      v_capture_ids
    );
end;
$function$;


create or replace function private.redream_complete_email_thread_followup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_capture_id uuid;
  v_provider text;
  v_thread_id text;
  v_capture_occurred_at timestamptz;
  v_candidate_count integer := 0;
  v_task_id uuid;
begin
  if new.channel not in (
       'google_email',
       'microsoft_email'
     )
     or new.direction <> 'outbound'
     or new.person_id is null
     or new.team_member_id is null
     or new.source_type <> 'tell_djm'
     or new.source_external_id is null
     or new.source_external_id not like 'tell:%'
  then
    return new;
  end if;

  begin
    v_capture_id :=
      split_part(
        new.source_external_id,
        ':',
        2
      )::uuid;
  exception
    when invalid_text_representation then
      return new;
  end;

  select
    nullif(
      btrim(
        c.context_json
          ->> 'provider'
      ),
      ''
    ),
    nullif(
      btrim(
        c.context_json
          ->> 'external_thread_id'
      ),
      ''
    ),
    c.created_at
  into
    v_provider,
    v_thread_id,
    v_capture_occurred_at
  from
    djm_os.captures c
  where
    c.id = v_capture_id
    and c.tenant_id =
      new.tenant_id
    and c.context_json
      ->> 'capture_origin' =
      'email'
    and c.context_json
      ->> 'email_direction' =
      'outbound'
  limit 1;

  if v_provider not in (
       'google',
       'microsoft'
     )
     or v_thread_id is null
     or v_capture_occurred_at is null
  then
    return new;
  end if;

  with candidates as (
    select distinct
      t.id
    from
      djm_os.provider_email_receipts r
    join
      djm_os.tasks t
      on t.tenant_id =
        new.tenant_id
     and t.person_id =
        new.person_id
     and t.owner_user_id =
        new.team_member_id
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
        new.team_member_id
      and r.provider =
        v_provider
      and r.external_thread_id =
        v_thread_id
      and r.capture_id is not null
      and r.capture_id <>
        v_capture_id
      and r.occurred_at <
        v_capture_occurred_at
  )
  select
    count(*)::integer,
    (array_agg(
      id
      order by id
    ))[1]
  into
    v_candidate_count,
    v_task_id
  from
    candidates;

  if v_candidate_count <> 1
     or v_task_id is null
  then
    return new;
  end if;

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
        new.id
      ),
    updated_at =
      now()
  where
    t.id =
      v_task_id
    and t.tenant_id =
      new.tenant_id
    and t.status not in (
      'done',
      'completed',
      'cancelled'
    );

  if found then
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
      new.tenant_id,
      'CONNECTED_EMAIL_FOLLOWUP_AUTO_COMPLETED',
      new.team_member_id,
      new.person_id,
      new.organisation_id,
      jsonb_build_object(
        'interaction_id',
        new.id,
        'task_id',
        v_task_id,
        'capture_id',
        v_capture_id,
        'provider',
        v_provider,
        'external_thread_id',
        v_thread_id,
        'communication_task_candidates',
        v_candidate_count
      ),
      'connected_email',
      1,
      now()
    );
  end if;

  return new;
end;
$function$;


drop trigger if exists
  redream_complete_email_thread_followup
on
  djm_os.interactions;

create trigger
  redream_complete_email_thread_followup
after insert
on
  djm_os.interactions
for each row
execute function
  private.redream_complete_email_thread_followup();


revoke all on function
  private.redream_complete_email_thread_followup()
from
  public,
  anon,
  authenticated;


revoke all on function
  public.platform_server_provider_email_commit(
    uuid,
    uuid,
    text,
    timestamptz,
    jsonb
  )
from
  public,
  anon,
  authenticated;

grant execute on function
  public.platform_server_provider_email_commit(
    uuid,
    uuid,
    text,
    timestamptz,
    jsonb
  )
to
  service_role;


notify pgrst, 'reload schema';

commit;
