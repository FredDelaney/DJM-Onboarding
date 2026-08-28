create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  platform text,
  device_label text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;
drop policy if exists "users manage own push subscriptions" on public.push_subscriptions;
create policy "users manage own push subscriptions" on public.push_subscriptions for all to authenticated using (user_id=(select auth.uid()) or private.is_admin()) with check (user_id=(select auth.uid()) or private.is_admin());

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  player_requests boolean not null default true,
  weekly_checkin_reminders boolean not null default true,
  djm_announcements boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
grant select,insert,update,delete on public.notification_preferences to authenticated;
revoke all on public.notification_preferences from anon;
drop policy if exists "users manage own notification preferences" on public.notification_preferences;
create policy "users manage own notification preferences" on public.notification_preferences for all to authenticated using (user_id=(select auth.uid()) or private.is_admin()) with check (user_id=(select auth.uid()) or private.is_admin());
