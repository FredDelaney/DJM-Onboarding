create table public.player_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid() unique,
  email text not null,
  player_id uuid references public.players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index player_invites_pending_email_idx on public.player_invites(lower(email)) where status='pending';
create index player_invites_player_idx on public.player_invites(player_id);
create index player_invites_invited_by_idx on public.player_invites(invited_by);
alter table public.player_invites enable row level security;
grant select, insert, update, delete on public.player_invites to authenticated;
create policy "admins read invites" on public.player_invites for select to authenticated using (private.is_admin());
create policy "admins insert invites" on public.player_invites for insert to authenticated with check (private.is_admin());
create policy "admins update invites" on public.player_invites for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins delete invites" on public.player_invites for delete to authenticated using (private.is_admin());

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  assigned_role text := 'player';
  new_player_id uuid;
  full_name text;
  invite_token uuid;
  invite_row public.player_invites%rowtype;
begin
  if exists (select 1 from public.admin_allowlist where lower(email) = lower(new.email)) then
    assigned_role := 'admin';
  end if;

  full_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1));

  insert into public.profiles(id, email, display_name, role)
  values (new.id, new.email, full_name, assigned_role)
  on conflict (id) do nothing;

  if assigned_role = 'player' then
    begin
      invite_token := nullif(new.raw_user_meta_data->>'invite_token','')::uuid;
    exception when others then
      invite_token := null;
    end;

    if invite_token is not null then
      select * into invite_row
      from public.player_invites
      where token = invite_token
        and status = 'pending'
        and expires_at > now()
        and lower(email) = lower(new.email)
      for update;
    end if;

    if invite_row.id is not null then
      if invite_row.player_id is not null then
        new_player_id := invite_row.player_id;
        update public.players set user_id = new.id, onboarding_status = case when onboarding_status='not_started' then 'in_progress' else onboarding_status end where id = new_player_id;
      else
        insert into public.players(user_id, preferred_name, onboarding_status)
        values (new.id, nullif(full_name,''), 'in_progress') returning id into new_player_id;
      end if;

      insert into public.player_private(player_id, personal_email) values (new_player_id, new.email)
      on conflict (player_id) do update set personal_email = excluded.personal_email;
      insert into public.player_onboarding(player_id, current_step) values (new_player_id, 1)
      on conflict (player_id) do nothing;
      insert into public.player_cv_settings(player_id) values (new_player_id)
      on conflict (player_id) do nothing;

      update public.player_invites set status='accepted', accepted_at=now() where id=invite_row.id;
    end if;
  end if;

  return new;
end;
$$;
