create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function private.can_view_player(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    private.is_admin()
    or exists (select 1 from public.players p where p.id = target_player_id and p.user_id = auth.uid())
    or exists (select 1 from public.staff_player_access a where a.player_id = target_player_id and a.staff_user_id = auth.uid());
$$;

create or replace function private.can_edit_player(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    private.is_admin()
    or exists (select 1 from public.players p where p.id = target_player_id and p.user_id = auth.uid())
    or exists (select 1 from public.staff_player_access a where a.player_id = target_player_id and a.staff_user_id = auth.uid() and a.can_edit = true);
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  assigned_role text := 'player';
begin
  if exists (select 1 from public.admin_allowlist where lower(email) = lower(new.email)) then
    assigned_role := 'admin';
  end if;

  insert into public.profiles(id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1)),
    assigned_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

grant execute on function private.is_admin() to authenticated;
grant execute on function private.can_view_player(uuid) to authenticated;
grant execute on function private.can_edit_player(uuid) to authenticated;

alter policy "admins manage allowlist" on public.admin_allowlist using (private.is_admin()) with check (private.is_admin());
alter policy "users read own profile" on public.profiles using (id = auth.uid() or private.is_admin());
alter policy "users update own profile" on public.profiles using (id = auth.uid() or private.is_admin()) with check (id = auth.uid() or private.is_admin());
alter policy "players and staff view player" on public.players using (private.can_view_player(id));
alter policy "players and staff update player" on public.players using (private.can_edit_player(id)) with check (private.can_edit_player(id));
alter policy "admins create players" on public.players with check (private.is_admin());
alter policy "admins delete players" on public.players using (private.is_admin());
alter policy "player private view" on public.player_private using (private.can_view_player(player_id));
alter policy "player private edit" on public.player_private using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));
alter policy "onboarding view" on public.player_onboarding using (private.can_view_player(player_id));
alter policy "onboarding edit" on public.player_onboarding using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));

drop policy if exists "public club profiles readable" on public.player_public_profiles;
create policy "public profiles published anon"
on public.player_public_profiles for select to anon
using (published = true);
create policy "public profiles authenticated read"
on public.player_public_profiles for select to authenticated
using (published = true or private.can_view_player(player_id));
alter policy "public profiles editable" on public.player_public_profiles using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));

alter policy "career entries view" on public.career_entries using (private.can_view_player(player_id));
alter policy "career entries edit" on public.career_entries using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));
alter policy "videos view" on public.player_videos using (private.can_view_player(player_id));
alter policy "videos edit" on public.player_videos using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));
alter policy "documents view" on public.player_documents using (private.can_view_player(player_id));
alter policy "documents edit" on public.player_documents using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));
alter policy "checkins view" on public.weekly_checkins using (private.can_view_player(player_id));
alter policy "checkins edit" on public.weekly_checkins using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));
alter policy "admin notes staff only" on public.admin_notes using (private.is_admin() or exists (select 1 from public.staff_player_access a where a.player_id = admin_notes.player_id and a.staff_user_id = auth.uid())) with check (private.is_admin() or exists (select 1 from public.staff_player_access a where a.player_id = admin_notes.player_id and a.staff_user_id = auth.uid() and a.can_edit));
alter policy "cv settings view" on public.player_cv_settings using (private.can_view_player(player_id));
alter policy "cv settings edit" on public.player_cv_settings using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));
alter policy "players read resources" on public.resources using ((published = true and audience in ('players','all')) or private.is_admin());
alter policy "admins manage resources" on public.resources using (private.is_admin()) with check (private.is_admin());
alter policy "players read announcements" on public.announcements using (published = true and starts_at <= now() and (ends_at is null or ends_at >= now()) and (target_player_id is null or private.can_view_player(target_player_id)));
alter policy "admins manage announcements" on public.announcements using (private.is_admin()) with check (private.is_admin());
alter policy "admins manage staff access" on public.staff_player_access using (private.is_admin()) with check (private.is_admin());
alter policy "staff can read own access" on public.staff_player_access using (staff_user_id = auth.uid() or private.is_admin());
alter policy "admins read audit" on public.audit_events using (private.is_admin());

alter policy "users upload own public media" on storage.objects with check (bucket_id = 'player-public' and (private.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
alter policy "users update own public media" on storage.objects using (bucket_id = 'player-public' and (private.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)) with check (bucket_id = 'player-public' and (private.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
alter policy "users delete own public media" on storage.objects using (bucket_id = 'player-public' and (private.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
alter policy "users read own private files" on storage.objects using (bucket_id = 'player-private' and (private.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
alter policy "users upload own private files" on storage.objects with check (bucket_id = 'player-private' and (private.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
alter policy "users update own private files" on storage.objects using (bucket_id = 'player-private' and (private.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)) with check (bucket_id = 'player-private' and (private.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
alter policy "users delete own private files" on storage.objects using (bucket_id = 'player-private' and (private.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure private.handle_new_user();

drop trigger if exists profiles_updated_at on public.profiles;
drop trigger if exists players_updated_at on public.players;
drop trigger if exists player_private_updated_at on public.player_private;
drop trigger if exists player_onboarding_updated_at on public.player_onboarding;
drop trigger if exists public_profiles_updated_at on public.player_public_profiles;
drop trigger if exists career_entries_updated_at on public.career_entries;
drop trigger if exists player_videos_updated_at on public.player_videos;
drop trigger if exists admin_notes_updated_at on public.admin_notes;
drop trigger if exists cv_settings_updated_at on public.player_cv_settings;
drop trigger if exists resources_updated_at on public.resources;
drop trigger if exists announcements_updated_at on public.announcements;

create trigger profiles_updated_at before update on public.profiles for each row execute procedure private.set_updated_at();
create trigger players_updated_at before update on public.players for each row execute procedure private.set_updated_at();
create trigger player_private_updated_at before update on public.player_private for each row execute procedure private.set_updated_at();
create trigger player_onboarding_updated_at before update on public.player_onboarding for each row execute procedure private.set_updated_at();
create trigger public_profiles_updated_at before update on public.player_public_profiles for each row execute procedure private.set_updated_at();
create trigger career_entries_updated_at before update on public.career_entries for each row execute procedure private.set_updated_at();
create trigger player_videos_updated_at before update on public.player_videos for each row execute procedure private.set_updated_at();
create trigger admin_notes_updated_at before update on public.admin_notes for each row execute procedure private.set_updated_at();
create trigger cv_settings_updated_at before update on public.player_cv_settings for each row execute procedure private.set_updated_at();
create trigger resources_updated_at before update on public.resources for each row execute procedure private.set_updated_at();
create trigger announcements_updated_at before update on public.announcements for each row execute procedure private.set_updated_at();

revoke all on all tables in schema public from anon;
grant select on public.player_public_profiles to anon;

revoke all on all tables in schema public from authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.players to authenticated;
grant select, insert, update, delete on public.player_private to authenticated;
grant select, insert, update, delete on public.player_onboarding to authenticated;
grant select, insert, update, delete on public.player_public_profiles to authenticated;
grant select, insert, update, delete on public.career_entries to authenticated;
grant select, insert, update, delete on public.player_videos to authenticated;
grant select, insert, update, delete on public.player_documents to authenticated;
grant select, insert, update, delete on public.weekly_checkins to authenticated;
grant select, insert, update, delete on public.admin_notes to authenticated;
grant select, insert, update, delete on public.player_cv_settings to authenticated;
grant select, insert, update, delete on public.resources to authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert, update, delete on public.staff_player_access to authenticated;

revoke execute on function public.is_admin() from anon, authenticated;
revoke execute on function public.can_view_player(uuid) from anon, authenticated;
revoke execute on function public.can_edit_player(uuid) from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.set_updated_at() from anon, authenticated;

drop function public.can_edit_player(uuid);
drop function public.can_view_player(uuid);
drop function public.is_admin();
drop function public.handle_new_user();
drop function public.set_updated_at();
