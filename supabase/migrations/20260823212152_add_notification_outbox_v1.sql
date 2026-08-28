create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  url text not null default '/inbox',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sent','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_outbox_pending_idx on public.notification_outbox(status,created_at) where status='pending';
create index if not exists notification_outbox_user_idx on public.notification_outbox(user_id,created_at desc);
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated;
grant select,insert,update,delete on public.notification_outbox to service_role;

create or replace function private.queue_player_request_notification()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare target_user uuid; pref boolean;
begin
  if new.created_by is null or new.request_type='signal' then return new; end if;
  select user_id into target_user from public.players where id=new.player_id;
  if target_user is null then return new; end if;
  select player_requests into pref from public.notification_preferences where user_id=target_user;
  if coalesce(pref,true) then
    insert into public.notification_outbox(user_id,kind,title,body,url,payload)
    values(target_user,'player_request',coalesce(new.title,'DJM needs you'),coalesce(new.message,'Open DJM Player for the latest update.'),'/inbox',jsonb_build_object('request_id',new.id,'player_id',new.player_id,'request_type',new.request_type));
  end if;
  return new;
end;
$$;
drop trigger if exists queue_player_request_notification on public.player_requests;
create trigger queue_player_request_notification after insert on public.player_requests for each row execute function private.queue_player_request_notification();

create or replace function private.queue_announcement_notifications()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
begin
  if new.published is not true then return new; end if;
  insert into public.notification_outbox(user_id,kind,title,body,url,payload)
  select p.user_id,'announcement',new.title,new.body,'/home',jsonb_build_object('announcement_id',new.id)
  from public.players p
  left join public.notification_preferences np on np.user_id=p.user_id
  where p.user_id is not null
    and (new.target_player_id is null or new.target_player_id=p.id)
    and coalesce(np.djm_announcements,true)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists queue_announcement_notifications on public.announcements;
create trigger queue_announcement_notifications after insert on public.announcements for each row execute function private.queue_announcement_notifications();
