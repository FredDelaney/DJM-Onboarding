-- ReDream provider Calendar + Contacts sync v1.
--
-- Calendar:
-- - imports only timed events that involve another person
-- - keeps the signed-in agent as the owner
-- - links an attendee to an existing Network person only by exact tenant-scoped email
-- - stores no provider event description/body
--
-- Contacts:
-- - provider contacts remain private source evidence
-- - exact tenant-scoped email matches may link them to existing Network people
-- - unmatched provider contacts do not automatically become Network people
--
-- Automation:
-- - manual sync is available to the connected user
-- - a bounded stale-first job refreshes connected accounts every six hours
-- - refresh tokens stay encrypted in Supabase Vault

begin;

alter table djm_os.meetings
  add column if not exists provider_last_seen_at timestamptz;

create unique index if not exists meetings_provider_event_unique
  on djm_os.meetings(
    tenant_id,
    owner_user_id,
    provider,
    external_event_id
  )
  where external_event_id is not null
    and provider in ('google','microsoft');

create table if not exists djm_os.provider_contact_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references platform.tenants(id)
    on delete cascade,
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  provider text not null
    check(provider in ('google','microsoft')),
  external_contact_id text not null,
  display_name text,
  email text,
  phone text,
  organisation_name text,
  role_title text,
  person_id uuid
    references djm_os.people(id)
    on delete set null,
  is_deleted boolean not null default false,
  provider_updated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(
    tenant_id,
    user_id,
    provider,
    external_contact_id
  )
);

create index if not exists provider_contact_sources_tenant_user_idx
  on djm_os.provider_contact_sources(
    tenant_id,
    user_id,
    provider,
    is_deleted
  );

create index if not exists provider_contact_sources_person_idx
  on djm_os.provider_contact_sources(
    tenant_id,
    person_id
  )
  where person_id is not null
    and is_deleted = false;

create index if not exists provider_contact_sources_email_idx
  on djm_os.provider_contact_sources(
    tenant_id,
    lower(email)
  )
  where email is not null
    and is_deleted = false;

alter table djm_os.provider_contact_sources
  enable row level security;

revoke all on djm_os.provider_contact_sources
  from public, anon, authenticated;

create or replace function public.redream_provider_sync_context(
  p_provider text
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
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_connection djm_os.provider_connections%rowtype;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  if v_provider not in ('google','microsoft') then
    raise exception 'unsupported_provider';
  end if;

  select c.*
  into v_connection
  from djm_os.provider_connections c
  where c.tenant_id = v_tenant
    and c.user_id = v_user
    and c.provider = v_provider
    and c.status = 'connected';

  if v_connection.id is null then
    raise exception 'provider_not_connected';
  end if;

  return jsonb_build_object(
    'tenant_id', v_tenant,
    'user_id', v_user,
    'provider', v_provider,
    'email', v_connection.email,
    'capabilities', v_connection.capabilities,
    'last_synced_at', v_connection.last_synced_at
  );
end;
$function$;

revoke all on function public.redream_provider_sync_context(text)
  from public, anon;
grant execute on function public.redream_provider_sync_context(text)
  to authenticated;

create or replace function public.platform_server_provider_sync_targets(
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_targets jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tenant_id', x.tenant_id,
        'user_id', x.user_id,
        'provider', x.provider
      )
      order by
        x.last_synced_at asc nulls first,
        x.updated_at asc
    ),
    '[]'::jsonb
  )
  into v_targets
  from (
    select
      c.tenant_id,
      c.user_id,
      c.provider,
      c.last_synced_at,
      c.updated_at
    from djm_os.provider_connections c
    join platform.tenant_memberships m
      on m.tenant_id = c.tenant_id
     and m.user_id = c.user_id
     and m.status = 'active'
     and m.role in (
       'owner',
       'admin',
       'agent',
       'operations',
       'scout'
     )
    join platform.tenants t
      on t.id = c.tenant_id
     and t.status = 'active'
    where c.status = 'connected'
      and (
        'calendar' = any(c.capabilities)
        or 'contacts' = any(c.capabilities)
      )
    order by
      c.last_synced_at asc nulls first,
      c.updated_at asc
    limit v_limit
  ) x;

  return jsonb_build_object(
    'targets', v_targets
  );
end;
$function$;

revoke all on function public.platform_server_provider_sync_targets(integer)
  from public, anon, authenticated;
grant execute on function public.platform_server_provider_sync_targets(integer)
  to service_role;

create or replace function public.platform_server_provider_sync_secret(
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
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_connection djm_os.provider_connections%rowtype;
  v_refresh_token text;
begin
  if v_provider not in ('google','microsoft') then
    raise exception 'unsupported_provider';
  end if;

  if not private.user_has_staff_tenant_access(
    p_tenant_id,
    p_user_id
  ) then
    raise exception 'workspace_access_denied';
  end if;

  select c.*
  into v_connection
  from djm_os.provider_connections c
  where c.tenant_id = p_tenant_id
    and c.user_id = p_user_id
    and c.provider = v_provider
    and c.status = 'connected';

  if v_connection.id is null then
    raise exception 'provider_not_connected';
  end if;

  select s.decrypted_secret
  into v_refresh_token
  from vault.decrypted_secrets s
  where s.id = v_connection.refresh_secret_id
  limit 1;

  if nullif(btrim(coalesce(v_refresh_token, '')), '') is null then
    raise exception 'provider_refresh_token_unavailable';
  end if;

  return jsonb_build_object(
    'tenant_id', v_connection.tenant_id,
    'user_id', v_connection.user_id,
    'provider', v_connection.provider,
    'email', v_connection.email,
    'capabilities', v_connection.capabilities,
    'scopes', v_connection.scopes,
    'metadata', v_connection.metadata,
    'refresh_token', v_refresh_token
  );
end;
$function$;

revoke all on function public.platform_server_provider_sync_secret(
  uuid,
  uuid,
  text
)
from public, anon, authenticated;
grant execute on function public.platform_server_provider_sync_secret(
  uuid,
  uuid,
  text
)
to service_role;

create or replace function public.platform_server_provider_sync_mark_error(
  p_tenant_id uuid,
  p_user_id uuid,
  p_provider text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.user_has_staff_tenant_access(
    p_tenant_id,
    p_user_id
  ) then
    raise exception 'workspace_access_denied';
  end if;

  update djm_os.provider_connections c
  set last_error = left(
        nullif(btrim(coalesce(p_error, '')), ''),
        1000
      ),
      updated_at = now()
  where c.tenant_id = p_tenant_id
    and c.user_id = p_user_id
    and c.provider = lower(btrim(coalesce(p_provider, '')));
end;
$function$;

revoke all on function public.platform_server_provider_sync_mark_error(
  uuid,
  uuid,
  text,
  text
)
from public, anon, authenticated;
grant execute on function public.platform_server_provider_sync_mark_error(
  uuid,
  uuid,
  text,
  text
)
to service_role;

create or replace function public.platform_server_provider_sync_commit(
  p_tenant_id uuid,
  p_user_id uuid,
  p_provider text,
  p_sync_started_at timestamptz,
  p_calendar_window_start timestamptz,
  p_calendar_window_end timestamptz,
  p_meetings jsonb default '[]'::jsonb,
  p_contacts jsonb default '[]'::jsonb,
  p_contacts_full_snapshot boolean default false,
  p_sync_state jsonb default '{}'::jsonb,
  p_new_refresh_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_sync_started_at timestamptz := coalesce(p_sync_started_at, now());
  v_item jsonb;
  v_external_id text;
  v_email text;
  v_phone text;
  v_person_id uuid;
  v_org_id uuid;
  v_status text;
  v_title text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_timezone text;
  v_meeting_url text;
  v_secret_id uuid;
  v_contact_count integer := 0;
  v_linked_contact_count integer := 0;
  v_meeting_count integer := 0;
  v_cancelled_count integer := 0;
  v_missing_cancelled integer := 0;
  v_row_count integer := 0;
begin
  if v_provider not in ('google','microsoft') then
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
  ) then
    raise exception 'provider_not_connected';
  end if;

  if jsonb_typeof(coalesce(p_meetings, '[]'::jsonb)) <> 'array' then
    raise exception 'meetings_must_be_array';
  end if;

  if jsonb_typeof(coalesce(p_contacts, '[]'::jsonb)) <> 'array' then
    raise exception 'contacts_must_be_array';
  end if;

  if jsonb_array_length(coalesce(p_meetings, '[]'::jsonb)) > 0
     and not exists (
       select 1
       from djm_os.team_members tm
       where tm.user_id = p_user_id
         and tm.is_active = true
     ) then
    raise exception 'agency_team_member_not_initialized';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_contacts, '[]'::jsonb))
  loop
    v_external_id := nullif(btrim(coalesce(v_item ->> 'external_contact_id', '')), '');

    if v_external_id is null then
      continue;
    end if;

    v_email := nullif(lower(btrim(coalesce(v_item ->> 'email', ''))), '');
    v_phone := nullif(btrim(coalesce(v_item ->> 'phone', '')), '');
    v_person_id := null;

    if v_email is not null
       and not coalesce((v_item ->> 'deleted')::boolean, false) then
      select cm.person_id
      into v_person_id
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
      order by
        cm.is_verified desc nulls last,
        cm.is_primary desc,
        cm.updated_at desc
      limit 1;
    end if;

    insert into djm_os.provider_contact_sources (
      tenant_id,
      user_id,
      provider,
      external_contact_id,
      display_name,
      email,
      phone,
      organisation_name,
      role_title,
      person_id,
      is_deleted,
      provider_updated_at,
      last_seen_at,
      metadata,
      updated_at
    )
    values (
      p_tenant_id,
      p_user_id,
      v_provider,
      v_external_id,
      nullif(btrim(coalesce(v_item ->> 'display_name', '')), ''),
      v_email,
      v_phone,
      nullif(btrim(coalesce(v_item ->> 'organisation_name', '')), ''),
      nullif(btrim(coalesce(v_item ->> 'role_title', '')), ''),
      v_person_id,
      coalesce((v_item ->> 'deleted')::boolean, false),
      nullif(v_item ->> 'provider_updated_at', '')::timestamptz,
      v_sync_started_at,
      coalesce(v_item -> 'metadata', '{}'::jsonb),
      now()
    )
    on conflict (
      tenant_id,
      user_id,
      provider,
      external_contact_id
    )
    do update
    set display_name = excluded.display_name,
        email = excluded.email,
        phone = excluded.phone,
        organisation_name = excluded.organisation_name,
        role_title = excluded.role_title,
        person_id = excluded.person_id,
        is_deleted = excluded.is_deleted,
        provider_updated_at = excluded.provider_updated_at,
        last_seen_at = excluded.last_seen_at,
        metadata = excluded.metadata,
        updated_at = now();

    v_contact_count := v_contact_count + 1;

    if v_person_id is not null then
      v_linked_contact_count := v_linked_contact_count + 1;
    end if;
  end loop;

  if coalesce(p_contacts_full_snapshot, false) then
    update djm_os.provider_contact_sources s
    set is_deleted = true,
        updated_at = now()
    where s.tenant_id = p_tenant_id
      and s.user_id = p_user_id
      and s.provider = v_provider
      and s.is_deleted = false
      and s.last_seen_at < v_sync_started_at;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_meetings, '[]'::jsonb))
  loop
    v_external_id := nullif(btrim(coalesce(v_item ->> 'external_event_id', '')), '');

    if v_external_id is null then
      continue;
    end if;

    v_status := case
      when lower(coalesce(v_item ->> 'status', '')) = 'cancelled'
        then 'cancelled'
      else 'scheduled'
    end;

    if v_status = 'cancelled' then
      update djm_os.meetings m
      set status = 'cancelled',
          provider_last_seen_at = v_sync_started_at,
          updated_at = now()
      where m.tenant_id = p_tenant_id
        and m.owner_user_id = p_user_id
        and m.provider = v_provider
        and m.external_event_id = v_external_id;

      get diagnostics v_row_count = row_count;

      if v_row_count > 0 then
        v_cancelled_count := v_cancelled_count + v_row_count;
        continue;
      end if;
    end if;

    if nullif(v_item ->> 'starts_at', '') is null
       or nullif(v_item ->> 'ends_at', '') is null then
      continue;
    end if;

    v_starts_at := (v_item ->> 'starts_at')::timestamptz;
    v_ends_at := (v_item ->> 'ends_at')::timestamptz;

    if v_ends_at <= v_starts_at then
      continue;
    end if;

    v_title := coalesce(
      nullif(btrim(coalesce(v_item ->> 'title', '')), ''),
      'Meeting'
    );

    v_timezone := nullif(btrim(coalesce(v_item ->> 'timezone', '')), '');
    v_meeting_url := nullif(btrim(coalesce(v_item ->> 'meeting_url', '')), '');
    v_email := nullif(lower(btrim(coalesce(v_item ->> 'invitee_email', ''))), '');
    v_person_id := null;
    v_org_id := null;

    if v_email is not null then
      select cm.person_id
      into v_person_id
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
      order by
        cm.is_verified desc nulls last,
        cm.is_primary desc,
        cm.updated_at desc
      limit 1;
    end if;

    if v_person_id is not null then
      select e.organisation_id
      into v_org_id
      from djm_os.employments e
      where e.tenant_id = p_tenant_id
        and e.person_id = v_person_id
        and e.is_current = true
      order by
        e.started_on desc nulls last,
        e.updated_at desc,
        e.id
      limit 1;
    end if;

    insert into djm_os.meetings (
      tenant_id,
      owner_user_id,
      person_id,
      organisation_id,
      title,
      starts_at,
      ends_at,
      timezone,
      provider,
      external_event_id,
      meeting_url,
      invitee_email,
      status,
      source,
      notes,
      provider_last_seen_at,
      updated_at
    )
    values (
      p_tenant_id,
      p_user_id,
      v_person_id,
      v_org_id,
      v_title,
      v_starts_at,
      v_ends_at,
      v_timezone,
      v_provider,
      v_external_id,
      v_meeting_url,
      v_email,
      v_status,
      'provider_sync:' || v_provider,
      null,
      v_sync_started_at,
      now()
    )
    on conflict (
      tenant_id,
      owner_user_id,
      provider,
      external_event_id
    )
    where external_event_id is not null
      and provider in ('google','microsoft')
    do update
    set person_id = excluded.person_id,
        organisation_id = excluded.organisation_id,
        title = excluded.title,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        timezone = excluded.timezone,
        meeting_url = excluded.meeting_url,
        invitee_email = excluded.invitee_email,
        status = excluded.status,
        source = excluded.source,
        notes = null,
        provider_last_seen_at = excluded.provider_last_seen_at,
        updated_at = now();

    v_meeting_count := v_meeting_count + 1;
  end loop;

  if p_calendar_window_start is not null
     and p_calendar_window_end is not null
     and p_calendar_window_end > p_calendar_window_start then
    update djm_os.meetings m
    set status = 'cancelled',
        updated_at = now()
    where m.tenant_id = p_tenant_id
      and m.owner_user_id = p_user_id
      and m.provider = v_provider
      and m.external_event_id is not null
      and m.source = 'provider_sync:' || v_provider
      and m.status <> 'cancelled'
      and m.starts_at >= p_calendar_window_start
      and m.starts_at <= p_calendar_window_end
      and (
        m.provider_last_seen_at is null
        or m.provider_last_seen_at < v_sync_started_at
      );

    get diagnostics v_missing_cancelled = row_count;
  end if;

  if nullif(btrim(coalesce(p_new_refresh_token, '')), '') is not null then
    select c.refresh_secret_id
    into v_secret_id
    from djm_os.provider_connections c
    where c.tenant_id = p_tenant_id
      and c.user_id = p_user_id
      and c.provider = v_provider
    for update;

    if v_secret_id is not null then
      perform vault.update_secret(
        v_secret_id,
        btrim(p_new_refresh_token)
      );
    end if;
  end if;

  update djm_os.provider_connections c
  set last_synced_at = now(),
      last_error = null,
      metadata = coalesce(c.metadata, '{}'::jsonb)
        || coalesce(p_sync_state, '{}'::jsonb),
      updated_at = now()
  where c.tenant_id = p_tenant_id
    and c.user_id = p_user_id
    and c.provider = v_provider;

  update djm_os.calendar_connections c
  set last_synced_at = now(),
      updated_at = now()
  where c.tenant_id = p_tenant_id
    and c.user_id = p_user_id
    and c.provider = v_provider;

  insert into platform.audit_events (
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
    'platform.provider.synced',
    'provider_connection',
    v_provider,
    jsonb_build_object(
      'meetings_seen', v_meeting_count,
      'meetings_cancelled', v_cancelled_count + v_missing_cancelled,
      'contacts_seen', v_contact_count,
      'contacts_linked', v_linked_contact_count
    ),
    jsonb_build_object(
      'provider', v_provider,
      'source', 'provider_sync'
    )
  );

  return jsonb_build_object(
    'provider', v_provider,
    'meetings_seen', v_meeting_count,
    'meetings_cancelled', v_cancelled_count + v_missing_cancelled,
    'contacts_seen', v_contact_count,
    'contacts_linked', v_linked_contact_count,
    'synced_at', now()
  );
end;
$function$;

revoke all on function public.platform_server_provider_sync_commit(
  uuid,
  uuid,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  jsonb,
  jsonb,
  boolean,
  jsonb,
  text
)
from public, anon, authenticated;
grant execute on function public.platform_server_provider_sync_commit(
  uuid,
  uuid,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  jsonb,
  jsonb,
  boolean,
  jsonb,
  text
)
to service_role;

do $schedule$
declare
  v_job_id bigint;
begin
  select j.jobid
  into v_job_id
  from cron.job j
  where j.jobname = 'redream-provider-sync'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$schedule$;

select cron.schedule(
  'redream-provider-sync',
  '37 */6 * * *',
  $cron$
    select net.http_post(
      url := 'https://xogoigaaskmuspiehkba.supabase.co/functions/v1/redream-provider-sync',
      headers := jsonb_build_object(
        'Content-Type',
        'application/json',
        'x-djm-cron',
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'djm_push_cron_secret'
          limit 1
        )
      ),
      body := jsonb_build_object(
        'source',
        'scheduled-provider-sync'
      ),
      timeout_milliseconds := 120000
    );
  $cron$
);

notify pgrst, 'reload schema';

commit;
