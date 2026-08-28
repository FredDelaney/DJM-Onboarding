alter table public.player_private add column if not exists passports_held text[] not null default '{}';
alter table public.player_private add column if not exists work_rights text;
alter table public.player_private add column if not exists preferred_move_timing text;

create table if not exists public.player_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  title text not null,
  message text,
  request_type text not null default 'action' check (request_type in ('action','information','document','video','checkin')),
  status text not null default 'open' check (status in ('open','completed','dismissed')),
  due_at timestamptz,
  player_reply text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists player_requests_player_status_idx on public.player_requests(player_id,status,created_at desc);
alter table public.player_requests enable row level security;
grant select,insert,update,delete on public.player_requests to authenticated;
create policy "requests view" on public.player_requests for select to authenticated using (private.can_view_sensitive_player(player_id));
create policy "admins create requests" on public.player_requests for insert to authenticated with check (private.is_admin());
create policy "requests update" on public.player_requests for update to authenticated using (private.can_view_sensitive_player(player_id)) with check (private.can_view_sensitive_player(player_id));
create policy "admins delete requests" on public.player_requests for delete to authenticated using (private.is_admin());

create or replace function private.protect_player_request_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not private.is_admin() then
    if new.id is distinct from old.id
       or new.player_id is distinct from old.player_id
       or new.title is distinct from old.title
       or new.message is distinct from old.message
       or new.request_type is distinct from old.request_type
       or new.due_at is distinct from old.due_at
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Not permitted to change DJM request fields';
    end if;
  end if;
  new.updated_at := now();
  if new.status='completed' and old.status is distinct from 'completed' then new.completed_at := now(); end if;
  return new;
end;
$$;
drop trigger if exists protect_player_request_fields on public.player_requests;
create trigger protect_player_request_fields before update on public.player_requests for each row execute function private.protect_player_request_fields();

create table if not exists public.player_messages (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_role text not null check (sender_role in ('player','djm')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists player_messages_player_created_idx on public.player_messages(player_id,created_at desc);
alter table public.player_messages enable row level security;
grant select,insert,update on public.player_messages to authenticated;
create policy "messages view" on public.player_messages for select to authenticated using (private.can_view_sensitive_player(player_id));
create policy "messages insert" on public.player_messages for insert to authenticated with check (
  (private.is_admin() and sender_role='djm' and sender_id=auth.uid())
  or (exists(select 1 from public.players p where p.id=player_id and p.user_id=auth.uid()) and sender_role='player' and sender_id=auth.uid())
);
create policy "admins mark messages read" on public.player_messages for update to authenticated using (private.is_admin()) with check (private.is_admin());
