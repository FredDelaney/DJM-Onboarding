-- Source alignment for the DJM connectivity foundation already deployed on 2026-09-02.
-- This migration is deliberately idempotent and does not enable the smart reminder scheduler.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.calendar_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(32),'hex'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_subscriptions enable row level security;
grant select,insert,update,delete on public.calendar_subscriptions to authenticated;
revoke all on public.calendar_subscriptions from anon;
drop policy if exists "users manage own calendar subscription" on public.calendar_subscriptions;
create policy "users manage own calendar subscription"
on public.calendar_subscriptions
for all to authenticated
using (user_id=(select auth.uid()) or private.is_admin())
with check (user_id=(select auth.uid()) or private.is_admin());

alter table public.notification_preferences
  add column if not exists task_reminders boolean not null default true,
  add column if not exists email_reminders boolean not null default false,
  add column if not exists morning_brief boolean not null default false,
  add column if not exists reminder_intensity text not null default 'normal',
  add column if not exists timezone text not null default 'Europe/London',
  add column if not exists email_address text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='notification_preferences_reminder_intensity_check'
      and conrelid='public.notification_preferences'::regclass
  ) then
    alter table public.notification_preferences
      add constraint notification_preferences_reminder_intensity_check
      check (reminder_intensity in ('minimal','normal','everything'));
  end if;
end $$;

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  url text not null default '/home',
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending','sent','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists email_outbox_pending_idx
  on public.email_outbox(status,created_at)
  where status='pending';
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon,authenticated;
grant select,insert,update,delete on public.email_outbox to service_role;

create table if not exists private.djm_email_config (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  provider text not null default 'resend',
  api_key text,
  from_address text,
  updated_at timestamptz not null default now()
);
insert into private.djm_email_config(singleton)
values(true)
on conflict(singleton) do nothing;

create or replace function public.djm_get_calendar_subscription()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $$
declare
  uid uuid := auth.uid();
  row_data public.calendar_subscriptions;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  insert into public.calendar_subscriptions(user_id)
  values(uid)
  on conflict(user_id) do update set enabled=true,updated_at=now()
  returning * into row_data;
  return jsonb_build_object('token',row_data.token,'enabled',row_data.enabled,'updated_at',row_data.updated_at);
end;
$$;

create or replace function public.djm_rotate_calendar_subscription()
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_catalog'
as $$
declare
  uid uuid := auth.uid();
  row_data public.calendar_subscriptions;
  next_token text := encode(extensions.gen_random_bytes(32),'hex');
begin
  if uid is null then raise exception 'Authentication required'; end if;
  insert into public.calendar_subscriptions(user_id,token,enabled)
  values(uid,next_token,true)
  on conflict(user_id) do update set token=excluded.token,enabled=true,updated_at=now()
  returning * into row_data;
  return jsonb_build_object('token',row_data.token,'enabled',row_data.enabled,'updated_at',row_data.updated_at);
end;
$$;

create or replace function public.djm_disable_calendar_subscription()
returns boolean
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  update public.calendar_subscriptions set enabled=false,updated_at=now() where user_id=uid;
  return true;
end;
$$;

create or replace function public.djm_calendar_feed_items(p_user_id uuid)
returns table(item_id uuid,title text,due_at timestamptz,url text,kind text)
language sql
stable
security definer
set search_path to 'public','djm_os','pg_catalog'
as $$
  select t.id,coalesce(t.title,'DJM task'),t.due_at,
    case when t.player_id is not null then '/admin/players/'||t.player_id::text||'#inbox' else '/djm' end,
    'task'::text
  from djm_os.tasks t
  where t.owner_user_id=p_user_id and t.status='open' and t.due_at is not null
    and t.due_at >= now()-interval '30 days' and t.due_at <= now()+interval '370 days'
  union all
  select r.id,coalesce(r.title,'DJM request'),r.due_at,'/inbox'::text,'request'::text
  from public.player_requests r
  join public.players p on p.id=r.player_id
  where p.user_id=p_user_id and r.status='open' and r.created_by is not null
    and r.request_type not in ('message','signal') and r.due_at is not null
    and r.due_at >= now()-interval '30 days' and r.due_at <= now()+interval '370 days'
  order by 3;
$$;

create or replace function public.djm_web_push_public_key()
returns text
language sql
stable
security definer
set search_path to 'private','pg_catalog'
as $$ select public_key from private.web_push_config where singleton=true limit 1 $$;

create or replace function public.djm_email_delivery_status()
returns jsonb
language sql
stable
security definer
set search_path to 'private','pg_catalog'
as $$
  select jsonb_build_object(
    'enabled',coalesce(enabled,false) and api_key is not null and from_address is not null,
    'provider',provider,
    'from_address',case when from_address is not null then from_address else null end
  )
  from private.djm_email_config where singleton=true limit 1
$$;

revoke all on function public.djm_get_calendar_subscription() from public,anon;
revoke all on function public.djm_rotate_calendar_subscription() from public,anon;
revoke all on function public.djm_disable_calendar_subscription() from public,anon;
revoke all on function public.djm_web_push_public_key() from public,anon;
revoke all on function public.djm_email_delivery_status() from public,anon;
revoke all on function public.djm_calendar_feed_items(uuid) from public,anon,authenticated;

grant execute on function public.djm_get_calendar_subscription() to authenticated,service_role;
grant execute on function public.djm_rotate_calendar_subscription() to authenticated,service_role;
grant execute on function public.djm_disable_calendar_subscription() to authenticated,service_role;
grant execute on function public.djm_web_push_public_key() to authenticated,service_role;
grant execute on function public.djm_email_delivery_status() to authenticated,service_role;
grant execute on function public.djm_calendar_feed_items(uuid) to service_role;
