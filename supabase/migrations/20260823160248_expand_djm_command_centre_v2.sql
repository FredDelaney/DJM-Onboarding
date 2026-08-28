alter table public.admin_allowlist add column if not exists role text not null default 'admin';
alter table public.admin_allowlist drop constraint if exists admin_allowlist_role_check;
alter table public.admin_allowlist add constraint admin_allowlist_role_check check (role in ('admin','scout'));

alter table public.players add column if not exists agency_priority text not null default 'normal';
alter table public.players drop constraint if exists players_agency_priority_check;
alter table public.players add constraint players_agency_priority_check check (agency_priority in ('low','normal','high','urgent'));
alter table public.players add column if not exists next_action text;
alter table public.players add column if not exists next_action_due date;

create table if not exists public.site_content (
  key text primary key,
  eyebrow text,
  title text not null,
  body text,
  cta_label text,
  cta_href text,
  secondary_label text,
  secondary_href text,
  published boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
grant select on public.site_content to anon, authenticated;
grant insert, update, delete on public.site_content to authenticated;
drop policy if exists "site content readable" on public.site_content;
create policy "site content readable" on public.site_content for select to anon, authenticated using (published = true or private.is_admin());
drop policy if exists "admins manage site content" on public.site_content;
create policy "admins manage site content" on public.site_content for all to authenticated using (private.is_admin()) with check (private.is_admin());

insert into public.site_content(key,eyebrow,title,body,cta_label,cta_href,secondary_label,secondary_href,published)
values ('welcome','DJM PLAYER','Your career. Properly represented.','A private space for your football profile, weekly updates, documents and the information DJM needs to move quickly when opportunities appear.','Player sign in','/sign-in','DJM Sports Management','mailto:jesse.edge@djmsports.com',true)
on conflict (key) do nothing;

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
  select a.role into assigned_role
  from public.admin_allowlist a
  where lower(a.email) = lower(new.email)
  limit 1;
  assigned_role := coalesce(assigned_role,'player');

  full_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1));

  insert into public.profiles(id, email, display_name, role)
  values (new.id, new.email, full_name, assigned_role)
  on conflict (id) do update set email=excluded.email, display_name=coalesce(public.profiles.display_name,excluded.display_name), role=excluded.role;

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

create or replace function private.sync_allowlist_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles set role='player', updated_at=now()
    where lower(email)=lower(old.email) and role in ('admin','scout');
    return old;
  end if;
  update public.profiles set role=new.role, updated_at=now()
  where lower(email)=lower(new.email);
  return new;
end;
$$;

drop trigger if exists sync_allowlist_profile_role on public.admin_allowlist;
create trigger sync_allowlist_profile_role after insert or update or delete on public.admin_allowlist for each row execute function private.sync_allowlist_profile_role();
