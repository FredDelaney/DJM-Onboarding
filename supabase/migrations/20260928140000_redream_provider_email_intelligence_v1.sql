begin;

create table if not exists djm_os.provider_email_receipts (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references platform.tenants(id)
    on delete cascade,

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  provider text not null
    check (
      provider in (
        'google',
        'microsoft'
      )
    ),

  external_message_id text not null,

  person_id uuid
    references djm_os.people(id)
    on delete set null,

  organisation_id uuid
    references djm_os.organisations(id)
    on delete set null,

  direction text not null
    check (
      direction in (
        'inbound',
        'outbound'
      )
    ),

  occurred_at timestamptz,

  capture_id uuid
    references djm_os.captures(id)
    on delete set null,

  created_at timestamptz not null
    default now(),

  unique (
    tenant_id,
    user_id,
    provider,
    external_message_id
  )
);

create index if not exists
  provider_email_receipts_person_idx
on djm_os.provider_email_receipts (
  tenant_id,
  person_id,
  occurred_at desc
);

alter table
  djm_os.provider_email_receipts
enable row level security;

revoke all on
  djm_os.provider_email_receipts
from public, anon, authenticated;


create or replace function
  public.platform_server_provider_email_contacts(
    p_tenant_id uuid,
    p_user_id uuid,
    p_provider text
  )
returns jsonb
language plpgsql
stable
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

  v_own_email text;

  v_contacts jsonb;
begin
  if v_provider not in (
    'google',
    'microsoft'
  ) then
    raise exception
      'unsupported_provider';
  end if;

  if not private.user_has_staff_tenant_access(
    p_tenant_id,
    p_user_id
  ) then
    raise exception
      'workspace_access_denied';
  end if;

  select
    lower(
      btrim(
        coalesce(
          c.email,
          ''
        )
      )
    )
  into
    v_own_email
  from
    djm_os.provider_connections c
  where
    c.tenant_id =
      p_tenant_id

    and c.user_id =
      p_user_id

    and c.provider =
      v_provider

    and c.status =
      'connected'

    and 'email' =
      any(c.capabilities)

  limit 1;

  if nullif(
    v_own_email,
    ''
  ) is null then
    raise exception
      'provider_email_not_enabled';
  end if;

  with current_employment_ranked as (
    select
      e.person_id,
      e.organisation_id,

      row_number() over (
        partition by
          e.person_id

        order by
          e.started_on desc nulls last,
          e.updated_at desc,
          e.id
      ) as rn

    from
      djm_os.employments e

    where
      e.tenant_id =
        p_tenant_id

      and e.is_current =
        true
  ),

  current_employment as (
    select
      person_id,
      organisation_id

    from
      current_employment_ranked

    where
      rn = 1
  ),

  email_rows as (
    select distinct
      lower(
        btrim(
          coalesce(
            nullif(
              cm.normalised_value,
              ''
            ),
            cm.value
          )
        )
      ) as email,

      p.id as person_id,

      p.full_name as person_name,

      ce.organisation_id,

      o.name as organisation_name

    from
      djm_os.contact_methods cm

    join
      djm_os.people p
      on p.id =
        cm.person_id

     and p.tenant_id =
        p_tenant_id

    left join
      current_employment ce
      on ce.person_id =
        p.id

    left join
      djm_os.organisations o
      on o.id =
        ce.organisation_id

     and o.tenant_id =
        p_tenant_id

    where
      cm.tenant_id =
        p_tenant_id

      and cm.channel =
        'email'

      and coalesce(
        p.person_type,
        'contact'
      ) <> 'player'

      and nullif(
        lower(
          btrim(
            coalesce(
              nullif(
                cm.normalised_value,
                ''
              ),
              cm.value
            )
          )
        ),
        ''
      ) is not null
  )

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'email',
          email,

          'person_id',
          person_id,

          'person_name',
          person_name,

          'organisation_id',
          organisation_id,

          'organisation_name',
          organisation_name
        )

        order by
          person_name,
          email
      ),
      '[]'::jsonb
    )

  into
    v_contacts

  from
    email_rows;

  return
    jsonb_build_object(
      'provider',
      v_provider,

      'own_email',
      v_own_email,

      'contacts',
      v_contacts
    );
end;
$function$;


create or replace function
  public.platform_server_provider_email_commit(
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

  v_contact_email text;

  v_direction text;

  v_subject text;

  v_body text;

  v_transcript text;

  v_occurred_at timestamptz;

  v_person_id uuid;

  v_person_name text;

  v_match_count integer;

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
    raise exception
      'unsupported_provider';
  end if;

  if not private.user_has_staff_tenant_access(
    p_tenant_id,
    p_user_id
  ) then
    raise exception
      'workspace_access_denied';
  end if;

  if not exists (
    select 1

    from
      djm_os.provider_connections c

    where
      c.tenant_id =
        p_tenant_id

      and c.user_id =
        p_user_id

      and c.provider =
        v_provider

      and c.status =
        'connected'

      and 'email' =
        any(c.capabilities)
  ) then
    raise exception
      'provider_email_not_enabled';
  end if;

  if jsonb_typeof(
    coalesce(
      p_emails,
      '[]'::jsonb
    )
  ) <> 'array' then
    raise exception
      'emails_must_be_array';
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
      null;

    v_person_name :=
      null;

    v_match_count :=
      0;

    select
      min(p.id),
      min(p.full_name),
      count(
        distinct p.id
      )::integer

    into
      v_person_id,
      v_person_name,
      v_match_count

    from
      djm_os.contact_methods cm

    join
      djm_os.people p
      on p.id =
        cm.person_id

     and p.tenant_id =
        p_tenant_id

    where
      cm.tenant_id =
        p_tenant_id

      and cm.channel =
        'email'

      and coalesce(
        p.person_type,
        'contact'
      ) <> 'player'

      and lower(
        btrim(
          coalesce(
            nullif(
              cm.normalised_value,
              ''
            ),
            cm.value
          )
        )
      ) =
        v_contact_email;

    if
      v_match_count <> 1

      or v_person_id is null
    then
      v_skipped :=
        v_skipped + 1;

      continue;
    end if;

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


create or replace function
  public.platform_server_provider_sync_targets(
    p_limit integer default 20
  )
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer :=
    greatest(
      1,
      least(
        coalesce(
          p_limit,
          20
        ),
        100
      )
    );

  v_targets jsonb;
begin
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'tenant_id',
          x.tenant_id,

          'user_id',
          x.user_id,

          'provider',
          x.provider
        )

        order by
          x.last_synced_at asc nulls first,
          x.updated_at asc
      ),
      '[]'::jsonb
    )

  into
    v_targets

  from (
    select
      c.tenant_id,
      c.user_id,
      c.provider,
      c.last_synced_at,
      c.updated_at

    from
      djm_os.provider_connections c

    join
      platform.tenant_memberships m
      on m.tenant_id =
        c.tenant_id

     and m.user_id =
        c.user_id

     and m.status =
        'active'

     and m.role in (
       'owner',
       'admin',
       'agent',
       'operations',
       'scout'
     )

    join
      platform.tenants t
      on t.id =
        c.tenant_id

     and t.status =
        'active'

    where
      c.status =
        'connected'

      and (
        'calendar' =
          any(c.capabilities)

        or 'contacts' =
          any(c.capabilities)

        or 'email' =
          any(c.capabilities)
      )

    order by
      c.last_synced_at asc nulls first,
      c.updated_at asc

    limit
      v_limit
  ) x;

  return
    jsonb_build_object(
      'targets',
      v_targets
    );
end;
$function$;


revoke all on function
  public.platform_server_provider_email_contacts(
    uuid,
    uuid,
    text
  )
from public, anon, authenticated;

grant execute on function
  public.platform_server_provider_email_contacts(
    uuid,
    uuid,
    text
  )
to service_role;


revoke all on function
  public.platform_server_provider_email_commit(
    uuid,
    uuid,
    text,
    timestamptz,
    jsonb
  )
from public, anon, authenticated;

grant execute on function
  public.platform_server_provider_email_commit(
    uuid,
    uuid,
    text,
    timestamptz,
    jsonb
  )
to service_role;


revoke all on function
  public.platform_server_provider_sync_targets(
    integer
  )
from public, anon, authenticated;

grant execute on function
  public.platform_server_provider_sync_targets(
    integer
  )
to service_role;


notify pgrst, 'reload schema';

commit;
