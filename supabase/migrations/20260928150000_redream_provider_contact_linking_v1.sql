begin;

create or replace function private.redream_provider_contact_person_for_email(
  p_tenant_id uuid,
  p_user_id uuid,
  p_provider text,
  p_email text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_person_id uuid;
  v_count integer := 0;
begin
  if v_email = '' then
    return null;
  end if;

  with matches as (
    select cm.person_id
    from djm_os.contact_methods cm
    join djm_os.people p
      on p.id = cm.person_id
     and p.tenant_id = p_tenant_id
    where cm.tenant_id = p_tenant_id
      and cm.channel = 'email'
      and lower(
        btrim(
          coalesce(
            nullif(cm.normalised_value, ''),
            cm.value
          )
        )
      ) = v_email

    union

    select s.person_id
    from djm_os.provider_contact_sources s
    join djm_os.people p
      on p.id = s.person_id
     and p.tenant_id = p_tenant_id
    where s.tenant_id = p_tenant_id
      and s.user_id = p_user_id
      and s.provider = lower(btrim(coalesce(p_provider, '')))
      and s.is_deleted = false
      and s.person_id is not null
      and lower(btrim(coalesce(s.email, ''))) = v_email
  )
  select
    (array_agg(person_id order by person_id))[1],
    count(distinct person_id)::integer
  into
    v_person_id,
    v_count
  from matches;

  if v_count = 1 then
    return v_person_id;
  end if;

  return null;
end;
$function$;


create or replace function private.redream_enrich_provider_meeting_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_person_id uuid;
  v_organisation_id uuid;
begin
  if new.provider not in ('google', 'microsoft')
     or new.person_id is not null
     or nullif(btrim(coalesce(new.invitee_email, '')), '') is null
     or new.owner_user_id is null then
    return new;
  end if;

  v_person_id :=
    private.redream_provider_contact_person_for_email(
      new.tenant_id,
      new.owner_user_id,
      new.provider,
      new.invitee_email
    );

  if v_person_id is null then
    return new;
  end if;

  select e.organisation_id
  into v_organisation_id
  from djm_os.employments e
  where e.tenant_id = new.tenant_id
    and e.person_id = v_person_id
    and e.is_current = true
  order by
    e.started_on desc nulls last,
    e.updated_at desc,
    e.id
  limit 1;

  new.person_id := v_person_id;
  new.organisation_id :=
    coalesce(
      new.organisation_id,
      v_organisation_id
    );

  return new;
end;
$function$;


drop trigger if exists
  redream_enrich_provider_meeting_identity
on djm_os.meetings;

create trigger
  redream_enrich_provider_meeting_identity
before insert or update of
  provider,
  invitee_email,
  person_id
on djm_os.meetings
for each row
execute function
  private.redream_enrich_provider_meeting_identity();


create or replace function public.redream_provider_contact_candidates(
  p_provider text,
  p_query text default '',
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_tenant uuid := private.redream_request_tenant();
  v_provider text :=
    lower(
      btrim(
        coalesce(
          p_provider,
          ''
        )
      )
    );
  v_query text :=
    lower(
      btrim(
        coalesce(
          p_query,
          ''
        )
      )
    );
  v_limit integer :=
    greatest(
      1,
      least(
        coalesce(
          p_limit,
          20
        ),
        50
      )
    );
  v_items jsonb;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  if not private.user_has_staff_tenant_access(
    v_tenant,
    v_user
  ) then
    raise exception 'workspace_access_denied';
  end if;

  if v_provider not in (
    'google',
    'microsoft'
  ) then
    raise exception 'unsupported_provider';
  end if;

  if not exists (
    select 1
    from djm_os.provider_connections c
    where c.tenant_id = v_tenant
      and c.user_id = v_user
      and c.provider = v_provider
      and c.status = 'connected'
      and 'contacts' = any(c.capabilities)
  ) then
    raise exception 'provider_contacts_not_enabled';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'external_contact_id',
          x.external_contact_id,
          'display_name',
          x.display_name,
          'email',
          x.email,
          'organisation_name',
          x.organisation_name,
          'role_title',
          x.role_title,
          'linked_person_id',
          x.linked_person_id,
          'linked_person_name',
          x.linked_person_name,
          'linked_organisation_name',
          x.linked_organisation_name,
          'suggested_person_id',
          x.suggested_person_id,
          'suggested_person_name',
          x.suggested_person_name,
          'suggested_organisation_name',
          x.suggested_organisation_name
        )
        order by
          x.linked_person_id is not null desc,
          x.display_name nulls last,
          x.email
      ),
      '[]'::jsonb
    )
  into
    v_items
  from (
    select
      s.external_contact_id,
      s.display_name,
      s.email,
      s.organisation_name,
      s.role_title,
      s.person_id as linked_person_id,
      linked.full_name as linked_person_name,
      linked_org.name as linked_organisation_name,

      case
        when s.person_id is null
         and exact_match.match_count = 1
        then exact_match.person_id
        else null
      end as suggested_person_id,

      case
        when s.person_id is null
         and exact_match.match_count = 1
        then exact_match.person_name
        else null
      end as suggested_person_name,

      case
        when s.person_id is null
         and exact_match.match_count = 1
        then exact_match.organisation_name
        else null
      end as suggested_organisation_name

    from
      djm_os.provider_contact_sources s

    left join
      djm_os.people linked
      on linked.id = s.person_id
     and linked.tenant_id = v_tenant

    left join lateral (
      select
        e.organisation_id
      from
        djm_os.employments e
      where
        e.tenant_id = v_tenant
        and e.person_id = s.person_id
        and e.is_current = true
      order by
        e.started_on desc nulls last,
        e.updated_at desc,
        e.id
      limit 1
    ) linked_employment
      on true

    left join
      djm_os.organisations linked_org
      on linked_org.id =
        linked_employment.organisation_id
     and linked_org.tenant_id =
        v_tenant

    left join lateral (
      select
        p.id as person_id,
        p.full_name as person_name,
        o.name as organisation_name,
        count(*) over()::integer as match_count
      from
        djm_os.people p

      left join lateral (
        select
          e.organisation_id
        from
          djm_os.employments e
        where
          e.tenant_id = v_tenant
          and e.person_id = p.id
          and e.is_current = true
        order by
          e.started_on desc nulls last,
          e.updated_at desc,
          e.id
        limit 1
      ) ce
        on true

      left join
        djm_os.organisations o
        on o.id = ce.organisation_id
       and o.tenant_id = v_tenant

      where
        p.tenant_id = v_tenant
        and coalesce(
          p.person_type,
          'contact'
        ) <> 'player'
        and s.display_name is not null
        and regexp_replace(
          lower(
            btrim(
              p.full_name
            )
          ),
          '[^a-z0-9]+',
          '',
          'g'
        ) =
        regexp_replace(
          lower(
            btrim(
              s.display_name
            )
          ),
          '[^a-z0-9]+',
          '',
          'g'
        )

      order by
        p.full_name,
        p.id

      limit 1
    ) exact_match
      on true

    where
      s.tenant_id = v_tenant
      and s.user_id = v_user
      and s.provider = v_provider
      and s.is_deleted = false
      and nullif(
        btrim(
          coalesce(
            s.email,
            ''
          )
        ),
        ''
      ) is not null
      and (
        v_query = ''
        or lower(
          coalesce(
            s.display_name,
            ''
          )
        ) like '%' || v_query || '%'
        or lower(
          coalesce(
            s.email,
            ''
          )
        ) like '%' || v_query || '%'
        or lower(
          coalesce(
            s.organisation_name,
            ''
          )
        ) like '%' || v_query || '%'
      )

    order by
      s.person_id is not null desc,
      s.display_name nulls last,
      s.email

    limit v_limit
  ) x;

  return
    jsonb_build_object(
      'provider',
      v_provider,
      'contacts',
      v_items
    );
end;
$function$;


create or replace function public.redream_provider_contact_bind(
  p_provider text,
  p_external_contact_id text,
  p_person_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_tenant uuid := private.redream_request_tenant();
  v_provider text :=
    lower(
      btrim(
        coalesce(
          p_provider,
          ''
        )
      )
    );
  v_external_contact_id text :=
    btrim(
      coalesce(
        p_external_contact_id,
        ''
      )
    );
  v_source djm_os.provider_contact_sources%rowtype;
  v_person_name text;
  v_organisation_id uuid;
  v_organisation_name text;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  if not private.user_has_staff_tenant_access(
    v_tenant,
    v_user
  ) then
    raise exception 'workspace_access_denied';
  end if;

  if v_provider not in (
    'google',
    'microsoft'
  ) then
    raise exception 'unsupported_provider';
  end if;

  if v_external_contact_id = '' then
    raise exception 'provider_contact_required';
  end if;

  select
    s.*
  into
    v_source
  from
    djm_os.provider_contact_sources s
  where
    s.tenant_id = v_tenant
    and s.user_id = v_user
    and s.provider = v_provider
    and s.external_contact_id =
      v_external_contact_id
    and s.is_deleted = false
  limit 1;

  if v_source.id is null then
    raise exception 'provider_contact_not_found';
  end if;

  if p_person_id is null then
    update
      djm_os.provider_contact_sources s
    set
      person_id = null,
      updated_at = now()
    where
      s.tenant_id = v_tenant
      and s.user_id = v_user
      and s.provider = v_provider
      and s.is_deleted = false
      and (
        s.external_contact_id =
          v_external_contact_id
        or (
          nullif(
            lower(
              btrim(
                coalesce(
                  v_source.email,
                  ''
                )
              )
            ),
            ''
          ) is not null
          and lower(
            btrim(
              coalesce(
                s.email,
                ''
              )
            )
          ) =
          lower(
            btrim(
              coalesce(
                v_source.email,
                ''
              )
            )
          )
        )
      );

    insert into
      djm_os.events(
        tenant_id,
        event_type,
        actor_user_id,
        payload,
        source,
        confidence,
        occurred_at
      )
    values (
      v_tenant,
      'PROVIDER_CONTACT_NETWORK_UNLINKED',
      v_user,
      jsonb_build_object(
        'provider',
        v_provider,
        'external_contact_id',
        v_external_contact_id,
        'display_name',
        v_source.display_name,
        'email',
        v_source.email
      ),
      'redream_provider_contacts',
      1,
      now()
    );

    return
      jsonb_build_object(
        'bound',
        false,
        'external_contact_id',
        v_external_contact_id,
        'person_id',
        null,
        'person_name',
        null,
        'organisation_id',
        null,
        'organisation_name',
        null
      );
  end if;

  select
    p.full_name
  into
    v_person_name
  from
    djm_os.people p
  where
    p.id = p_person_id
    and p.tenant_id = v_tenant
    and coalesce(
      p.person_type,
      'contact'
    ) <> 'player'
  limit 1;

  if v_person_name is null then
    raise exception 'contact_not_found';
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
    on o.id = e.organisation_id
   and o.tenant_id = v_tenant
  where
    e.tenant_id = v_tenant
    and e.person_id = p_person_id
    and e.is_current = true
  order by
    e.started_on desc nulls last,
    e.updated_at desc,
    e.id
  limit 1;

  update
    djm_os.provider_contact_sources s
  set
    person_id = p_person_id,
    updated_at = now()
  where
    s.tenant_id = v_tenant
    and s.user_id = v_user
    and s.provider = v_provider
    and s.is_deleted = false
    and (
      s.external_contact_id =
        v_external_contact_id
      or (
        nullif(
          lower(
            btrim(
              coalesce(
                v_source.email,
                ''
              )
            )
          ),
          ''
        ) is not null
        and lower(
          btrim(
            coalesce(
              s.email,
              ''
            )
          )
        ) =
        lower(
          btrim(
            coalesce(
              v_source.email,
              ''
            )
          )
        )
      )
    );

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
    v_tenant,
    'PROVIDER_CONTACT_NETWORK_LINKED',
    v_user,
    p_person_id,
    v_organisation_id,
    jsonb_build_object(
      'provider',
      v_provider,
      'external_contact_id',
      v_external_contact_id,
      'display_name',
      v_source.display_name,
      'email',
      v_source.email,
      'person_name',
      v_person_name,
      'organisation_name',
      v_organisation_name
    ),
    'redream_provider_contacts',
    1,
    now()
  );

  return
    jsonb_build_object(
      'bound',
      true,
      'external_contact_id',
      v_external_contact_id,
      'person_id',
      p_person_id,
      'person_name',
      v_person_name,
      'organisation_id',
      v_organisation_id,
      'organisation_name',
      v_organisation_name
    );
end;
$function$;


create or replace function public.platform_server_provider_email_contacts(
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
    raise exception 'unsupported_provider';
  end if;

  if not private.user_has_staff_tenant_access(
    p_tenant_id,
    p_user_id
  ) then
    raise exception 'workspace_access_denied';
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
    c.tenant_id = p_tenant_id
    and c.user_id = p_user_id
    and c.provider = v_provider
    and c.status = 'connected'
    and 'email' = any(c.capabilities)
  limit 1;

  if nullif(
    v_own_email,
    ''
  ) is null then
    raise exception 'provider_email_not_enabled';
  end if;

  with known as (
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
      p.full_name as person_name
    from
      djm_os.contact_methods cm
    join
      djm_os.people p
      on p.id = cm.person_id
     and p.tenant_id = p_tenant_id
    where
      cm.tenant_id = p_tenant_id
      and cm.channel = 'email'
      and coalesce(
        p.person_type,
        'contact'
      ) <> 'player'

    union

    select distinct
      lower(
        btrim(
          s.email
        )
      ) as email,
      p.id as person_id,
      p.full_name as person_name
    from
      djm_os.provider_contact_sources s
    join
      djm_os.people p
      on p.id = s.person_id
     and p.tenant_id = p_tenant_id
    where
      s.tenant_id = p_tenant_id
      and s.user_id = p_user_id
      and s.provider = v_provider
      and s.is_deleted = false
      and s.person_id is not null
      and nullif(
        btrim(
          coalesce(
            s.email,
            ''
          )
        ),
        ''
      ) is not null
  ),
  resolved as (
    select
      email,
      (array_agg(
        person_id
        order by person_id
      ))[1] as person_id,
      (array_agg(
        person_name
        order by person_name
      ))[1] as person_name
    from
      known
    group by
      email
    having
      count(
        distinct person_id
      ) = 1
  ),
  enriched as (
    select
      k.email,
      k.person_id,
      k.person_name,
      ce.organisation_id,
      o.name as organisation_name
    from
      resolved k

    left join lateral (
      select
        e.organisation_id
      from
        djm_os.employments e
      where
        e.tenant_id = p_tenant_id
        and e.person_id = k.person_id
        and e.is_current = true
      order by
        e.started_on desc nulls last,
        e.updated_at desc,
        e.id
      limit 1
    ) ce
      on true

    left join
      djm_os.organisations o
      on o.id = ce.organisation_id
     and o.tenant_id = p_tenant_id
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
    enriched;

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


revoke all on function
  private.redream_provider_contact_person_for_email(
    uuid,
    uuid,
    text,
    text
  )
from public, anon, authenticated;

grant execute on function
  private.redream_provider_contact_person_for_email(
    uuid,
    uuid,
    text,
    text
  )
to service_role;


revoke all on function
  private.redream_enrich_provider_meeting_identity()
from public, anon, authenticated;


revoke all on function
  public.redream_provider_contact_candidates(
    text,
    text,
    integer
  )
from public, anon;

grant execute on function
  public.redream_provider_contact_candidates(
    text,
    text,
    integer
  )
to authenticated, service_role;


revoke all on function
  public.redream_provider_contact_bind(
    text,
    text,
    uuid
  )
from public, anon;

grant execute on function
  public.redream_provider_contact_bind(
    text,
    text,
    uuid
  )
to authenticated, service_role;


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


notify pgrst, 'reload schema';

commit;
