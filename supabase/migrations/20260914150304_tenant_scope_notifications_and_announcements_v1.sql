alter table public.notification_outbox
  add column if not exists tenant_id uuid
  references platform.tenants(id)
  on delete cascade;

create index if not exists notification_outbox_tenant_status_created_idx
  on public.notification_outbox(tenant_id, status, created_at);

alter table public.announcements
  add column if not exists tenant_id uuid
  references platform.tenants(id)
  on delete cascade;

update public.announcements a
set tenant_id = (
  select t.id
  from platform.tenants t
  where t.slug = 'djm-sports-management'
  limit 1
)
where a.tenant_id is null;

alter table public.announcements
  alter column tenant_id set not null;

create index if not exists announcements_tenant_published_idx
  on public.announcements(tenant_id, published, starts_at);

create or replace function private.notification_outbox_tenant_id(
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
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_candidate uuid;
  v_tenant_id uuid;
begin
  v_candidate := private.safe_uuid(v_payload ->> 'tenant_id');

  if v_candidate is not null
    and private.user_has_active_tenant_membership(
      v_candidate,
      p_user_id
    )
  then
    return v_candidate;
  end if;

  v_candidate := private.safe_uuid(v_payload ->> 'player_id');

  if v_candidate is not null then
    select p.tenant_id
      into v_tenant_id
    from public.players p
    where p.id = v_candidate
    limit 1;

    if v_tenant_id is not null
      and private.user_has_active_tenant_membership(
        v_tenant_id,
        p_user_id
      )
    then
      return v_tenant_id;
    end if;
  end if;

  v_candidate := private.safe_uuid(v_payload ->> 'request_id');

  if v_candidate is not null then
    select p.tenant_id
      into v_tenant_id
    from public.player_requests r
    join public.players p
      on p.id = r.player_id
    where r.id = v_candidate
    limit 1;

    if v_tenant_id is not null
      and private.user_has_active_tenant_membership(
        v_tenant_id,
        p_user_id
      )
    then
      return v_tenant_id;
    end if;
  end if;

  v_candidate := private.safe_uuid(v_payload ->> 'capture_id');

  if v_candidate is not null then
    select c.tenant_id
      into v_tenant_id
    from djm_os.captures c
    where c.id = v_candidate
    limit 1;

    if v_tenant_id is not null
      and private.user_has_active_tenant_membership(
        v_tenant_id,
        p_user_id
      )
    then
      return v_tenant_id;
    end if;
  end if;

  return private.primary_active_tenant_id(p_user_id);
end;
$$;

revoke all on function private.notification_outbox_tenant_id(uuid, jsonb)
from public, anon;
grant execute on function private.notification_outbox_tenant_id(uuid, jsonb)
to authenticated;

create or replace function private.assign_announcement_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_tenant uuid;
begin
  if new.target_player_id is not null then
    select p.tenant_id
      into v_player_tenant
    from public.players p
    where p.id = new.target_player_id;

    if v_player_tenant is null then
      raise exception 'Target player has no active tenant context';
    end if;

    if new.tenant_id is null then
      new.tenant_id := v_player_tenant;
    elsif new.tenant_id <> v_player_tenant then
      raise exception 'Announcement tenant does not match target player tenant';
    end if;
  end if;

  if new.tenant_id is null then
    new.tenant_id := private.primary_active_tenant_id(auth.uid());
  end if;

  if new.tenant_id is null then
    raise exception 'Tenant context is required for announcements';
  end if;

  if auth.uid() is not null
    and not private.user_is_tenant_admin(new.tenant_id, auth.uid())
  then
    raise exception 'Announcement tenant access denied';
  end if;

  return new;
end;
$$;

drop trigger if exists assign_announcement_tenant on public.announcements;
create trigger assign_announcement_tenant
before insert or update of tenant_id, target_player_id
on public.announcements
for each row
execute function private.assign_announcement_tenant();

create or replace function private.djm_queue_push(
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
  prefs public.notification_preferences;
  v_entity_key text;
  v_tenant_id uuid;
  v_dedupe_key text;
begin
  if p_user_id is null then
    return false;
  end if;

  v_tenant_id := private.notification_outbox_tenant_id(
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

  select *
    into prefs
  from public.notification_preferences
  where user_id = p_user_id;

  if not coalesce(prefs.push_enabled, true) then
    return false;
  end if;

  if p_kind like 'staff_task_%'
    and coalesce(p_payload, '{}'::jsonb) ? 'task_id'
  then
    v_entity_key := p_payload ->> 'task_id';

    if exists (
      select 1
      from public.notification_outbox n
      where n.tenant_id = v_tenant_id
        and n.user_id = p_user_id
        and n.kind like 'staff_task_%'
        and n.payload ->> 'task_id' = v_entity_key
        and n.status in ('pending', 'sent')
        and n.created_at > now() - interval '8 hours'
    ) then
      return false;
    end if;
  elsif p_kind like 'player_request_%'
    and coalesce(p_payload, '{}'::jsonb) ? 'request_id'
  then
    v_entity_key := p_payload ->> 'request_id';

    if exists (
      select 1
      from public.notification_outbox n
      where n.tenant_id = v_tenant_id
        and n.user_id = p_user_id
        and n.kind like 'player_request_%'
        and n.payload ->> 'request_id' = v_entity_key
        and n.status in ('pending', 'sent')
        and n.created_at > now() - interval '8 hours'
    ) then
      return false;
    end if;
  end if;

  v_dedupe_key := case
    when p_dedupe_key is null then null
    else v_tenant_id::text || ':' || p_dedupe_key
  end;

  insert into public.notification_outbox(
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
    left(coalesce(p_title, 'Update'), 120),
    left(coalesce(p_body, ''), 240),
    coalesce(p_url, '/home'),
    coalesce(p_payload, '{}'::jsonb),
    v_dedupe_key
  )
  on conflict(dedupe_key)
  where dedupe_key is not null
  do nothing;

  return found;
end;
$$;

create or replace function private.queue_announcement_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.published is not true then
    return new;
  end if;

  insert into public.notification_outbox(
    tenant_id,
    user_id,
    kind,
    title,
    body,
    url,
    payload
  )
  select
    p.tenant_id,
    p.user_id,
    'announcement',
    new.title,
    new.body,
    '/home',
    jsonb_build_object(
      'announcement_id', new.id,
      'player_id', p.id,
      'tenant_id', p.tenant_id
    )
  from public.players p
  left join public.notification_preferences np
    on np.user_id = p.user_id
  where p.tenant_id = new.tenant_id
    and p.user_id is not null
    and (
      new.target_player_id is null
      or new.target_player_id = p.id
    )
    and coalesce(np.djm_announcements, true)
  on conflict do nothing;

  return new;
end;
$$;

create or replace function private.queue_weekly_checkin_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
  current_week date := date_trunc('week', now())::date;
begin
  insert into public.notification_outbox(
    tenant_id,
    user_id,
    kind,
    title,
    body,
    url,
    payload
  )
  select
    p.tenant_id,
    p.user_id,
    'weekly_checkin',
    'Your weekly check-in is ready',
    'It takes about 60 seconds. Keep your agency current on availability, fitness and anything that changed.',
    '/check-in',
    jsonb_build_object(
      'player_id', p.id,
      'tenant_id', p.tenant_id,
      'week_start', current_week
    )
  from public.players p
  join platform.tenants t
    on t.id = p.tenant_id
   and t.status = 'active'
  left join public.notification_preferences np
    on np.user_id = p.user_id
  where p.user_id is not null
    and coalesce(np.weekly_checkin_reminders, true)
    and not exists (
      select 1
      from public.weekly_checkins w
      where w.player_id = p.id
        and w.week_start = current_week
    )
    and not exists (
      select 1
      from public.notification_outbox o
      where o.tenant_id = p.tenant_id
        and o.user_id = p.user_id
        and o.kind = 'weekly_checkin'
        and o.payload ->> 'week_start' = current_week::text
        and o.status in ('pending', 'sent', 'cancelled')
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function private.queue_admin_inbound_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_name text;
  v_tenant_id uuid;
  admin_row record;
begin
  if new.request_type not in ('message', 'signal') then
    return new;
  end if;

  select
    coalesce(
      nullif(p.preferred_name, ''),
      nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
      'Player'
    ),
    p.tenant_id
  into player_name, v_tenant_id
  from public.players p
  where p.id = new.player_id;

  if v_tenant_id is null then
    return new;
  end if;

  for admin_row in
    select m.user_id
    from platform.tenant_memberships m
    left join public.notification_preferences np
      on np.user_id = m.user_id
    where m.tenant_id = v_tenant_id
      and m.status = 'active'
      and m.role in ('owner', 'admin')
      and coalesce(np.player_requests, true)
  loop
    perform private.djm_queue_push(
      admin_row.user_id,
      case
        when new.request_type = 'message' then 'player_message'
        else 'checkin_signal'
      end,
      case
        when new.request_type = 'message'
          then 'New message from ' || coalesce(player_name, 'Player')
        else coalesce(player_name, 'Player') || ' needs attention'
      end,
      left(
        case
          when new.request_type = 'message'
            then coalesce(
              new.player_reply,
              new.title,
              'Open the player message.'
            )
          else coalesce(
            new.message,
            new.title,
            'Open the player update.'
          )
        end,
        220
      ),
      '/admin/players/' || new.player_id::text || '#inbox',
      jsonb_build_object(
        'tenant_id', v_tenant_id,
        'player_id', new.player_id,
        'request_id', new.id,
        'request_type', new.request_type
      ),
      'player-inbound:' || new.id::text
    );
  end loop;

  return new;
end;
$$;

drop policy if exists "admins delete announcements" on public.announcements;
drop policy if exists "admins insert announcements" on public.announcements;
drop policy if exists "admins update announcements" on public.announcements;
drop policy if exists "players read announcements" on public.announcements;

create policy "tenant admins delete announcements"
on public.announcements
for delete
to authenticated
using (
  private.user_is_tenant_admin(tenant_id, auth.uid())
);

create policy "tenant admins insert announcements"
on public.announcements
for insert
to authenticated
with check (
  private.user_is_tenant_admin(tenant_id, auth.uid())
);

create policy "tenant admins update announcements"
on public.announcements
for update
to authenticated
using (
  private.user_is_tenant_admin(tenant_id, auth.uid())
)
with check (
  private.user_is_tenant_admin(tenant_id, auth.uid())
);

create policy "tenant members read announcements"
on public.announcements
for select
to authenticated
using (
  published = true
  and starts_at <= now()
  and (ends_at is null or ends_at >= now())
  and private.user_has_active_tenant_membership(
    tenant_id,
    auth.uid()
  )
  and (
    target_player_id is null
    or exists (
      select 1
      from public.players p
      where p.id = target_player_id
        and p.tenant_id = announcements.tenant_id
        and (
          p.user_id = auth.uid()
          or private.can_staff_view_player(p.id)
        )
    )
  )
);
