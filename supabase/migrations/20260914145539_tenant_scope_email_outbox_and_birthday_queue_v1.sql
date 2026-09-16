alter table public.email_outbox
  add column if not exists tenant_id uuid
  references platform.tenants(id)
  on delete cascade;

create index if not exists email_outbox_tenant_status_created_idx
  on public.email_outbox(tenant_id, status, created_at);

update public.email_outbox e
set tenant_id = coalesce(
  (
    select p.tenant_id
    from public.players p
    where p.id = private.safe_uuid(
      e.payload ->> 'player_id'
    )
    limit 1
  ),
  private.primary_active_tenant_id(e.user_id)
)
where e.tenant_id is null;

create or replace function private.email_outbox_tenant_id(
  p_user_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_tenant_id uuid;
begin
  v_player_id := private.safe_uuid(
    coalesce(p_payload, '{}'::jsonb) ->> 'player_id'
  );

  if v_player_id is not null then
    select p.tenant_id
      into v_tenant_id
    from public.players p
    where p.id = v_player_id
    limit 1;

    if v_tenant_id is not null then
      return v_tenant_id;
    end if;
  end if;

  return private.primary_active_tenant_id(p_user_id);
end;
$$;

revoke all on function private.email_outbox_tenant_id(uuid, jsonb)
from public, anon;
grant execute on function private.email_outbox_tenant_id(uuid, jsonb)
to authenticated;

create or replace function private.djm_queue_email(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_url text,
  p_payload jsonb,
  p_dedupe_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  pref_enabled boolean;
  delivery_enabled boolean;
  v_tenant_id uuid;
begin
  if p_user_id is null or p_dedupe_key is null then
    return false;
  end if;

  v_tenant_id := private.email_outbox_tenant_id(
    p_user_id,
    coalesce(p_payload, '{}'::jsonb)
  );

  if v_tenant_id is null
    or not private.user_has_active_tenant_membership(
      v_tenant_id,
      p_user_id
    )
  then
    return false;
  end if;

  select np.email_enabled
    into pref_enabled
  from public.notification_preferences np
  where np.user_id = p_user_id;

  select c.enabled
      and c.api_key is not null
      and c.from_address is not null
    into delivery_enabled
  from private.djm_email_config c
  where c.singleton = true;

  if not coalesce(pref_enabled, false)
    or not coalesce(delivery_enabled, false)
  then
    return false;
  end if;

  insert into public.email_outbox(
    tenant_id,
    user_id,
    kind,
    title,
    body,
    url,
    payload,
    dedupe_key
  )
  values(
    v_tenant_id,
    p_user_id,
    p_kind,
    p_title,
    p_body,
    coalesce(p_url, '/home'),
    coalesce(p_payload, '{}'::jsonb),
    p_dedupe_key
  )
  on conflict(dedupe_key) do nothing;

  return found;
end;
$$;

create or replace function private.djm_queue_player_birthday_emails(
  p_today date default null,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_enabled boolean := false;
  v_candidate_count integer := 0;
  v_recipient_count integer := 0;
  v_queued integer := 0;
  v_row record;
  v_recipient record;
  v_target_date date;
  v_phase text;
  v_age integer;
  v_title text;
  v_body text;
  v_local_date date;
  v_local_hour integer;
begin
  select coalesce(c.enabled, false)
      and c.api_key is not null
      and c.from_address is not null
    into v_delivery_enabled
  from private.djm_email_config c
  where c.singleton = true;

  for v_row in
    select
      p.id,
      p.tenant_id,
      trim(
        concat_ws(
          ' ',
          coalesce(
            nullif(trim(p.preferred_name), ''),
            nullif(trim(p.first_name), '')
          ),
          nullif(trim(p.last_name), '')
        )
      ) as display_name,
      p.date_of_birth,
      p.current_club,
      coalesce(s.timezone, 'UTC') as timezone
    from public.players p
    join platform.tenants t
      on t.id = p.tenant_id
     and t.status = 'active'
    left join platform.tenant_settings s
      on s.tenant_id = p.tenant_id
    where p.tenant_id is not null
      and p.date_of_birth is not null
      and p.football_status in (
        'active',
        'free_agent',
        'loan',
        'injured'
      )
  loop
    v_local_date := coalesce(
      p_today,
      (now() at time zone v_row.timezone)::date
    );

    v_local_hour := extract(
      hour from (now() at time zone v_row.timezone)
    )::integer;

    if p_today is null
      and not p_dry_run
      and v_local_hour <> 8
    then
      continue;
    end if;

    if extract(month from v_row.date_of_birth)
         = extract(month from v_local_date)
      and extract(day from v_row.date_of_birth)
         = extract(day from v_local_date)
    then
      v_target_date := v_local_date;
      v_phase := 'today';
    elsif extract(month from v_row.date_of_birth)
         = extract(month from (v_local_date + 1))
      and extract(day from v_row.date_of_birth)
         = extract(day from (v_local_date + 1))
    then
      v_target_date := v_local_date + 1;
      v_phase := 'tomorrow';
    else
      continue;
    end if;

    v_age :=
      extract(year from v_target_date)::integer
      - extract(year from v_row.date_of_birth)::integer;

    v_candidate_count := v_candidate_count + 1;

    if v_phase = 'today' then
      v_title :=
        'Birthday today: '
        || v_row.display_name
        || ' turns '
        || v_age::text;
      v_body :=
        v_row.display_name
        || ' has a birthday today and turns '
        || v_age::text
        || '.'
        || case
          when nullif(trim(coalesce(v_row.current_club, '')), '')
            is not null
          then ' Current club: ' || v_row.current_club || '.'
          else ''
        end
        || ' A quick personal message is worth sending.';
    else
      v_title :=
        'Tomorrow: '
        || v_row.display_name
        || ' turns '
        || v_age::text;
      v_body :=
        v_row.display_name
        || ' has a birthday tomorrow and turns '
        || v_age::text
        || '.'
        || case
          when nullif(trim(coalesce(v_row.current_club, '')), '')
            is not null
          then ' Current club: ' || v_row.current_club || '.'
          else ''
        end
        || ' This is an early reminder so the agency can be ready.';
    end if;

    for v_recipient in
      select m.user_id
      from platform.tenant_memberships m
      join auth.users au
        on au.id = m.user_id
      where m.tenant_id = v_row.tenant_id
        and m.status = 'active'
        and m.role in (
          'owner',
          'admin',
          'agent',
          'operations',
          'scout'
        )
        and nullif(trim(coalesce(au.email, '')), '')
          is not null
    loop
      v_recipient_count := v_recipient_count + 1;

      if p_dry_run or not v_delivery_enabled then
        continue;
      end if;

      insert into public.email_outbox(
        tenant_id,
        user_id,
        kind,
        title,
        body,
        url,
        payload,
        dedupe_key,
        status
      )
      values(
        v_row.tenant_id,
        v_recipient.user_id,
        'player_birthday_' || v_phase,
        v_title,
        v_body,
        '/admin/players/' || v_row.id::text,
        jsonb_build_object(
          'player_id', v_row.id,
          'player_name', v_row.display_name,
          'birthday', v_row.date_of_birth,
          'turning_age', v_age,
          'phase', v_phase,
          'target_date', v_target_date,
          'critical_agency_alert', true
        ),
        'player-birthday:'
          || v_row.tenant_id::text
          || ':'
          || v_recipient.user_id::text
          || ':'
          || v_row.id::text
          || ':'
          || extract(year from v_target_date)::integer::text
          || ':'
          || v_phase,
        'pending'
      )
      on conflict(dedupe_key) do nothing;

      if found then
        v_queued := v_queued + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'delivery_configured', v_delivery_enabled,
    'birthday_candidates', v_candidate_count,
    'active_email_recipients', v_recipient_count,
    'queued', v_queued,
    'dry_run', p_dry_run
  );
end;
$$;
