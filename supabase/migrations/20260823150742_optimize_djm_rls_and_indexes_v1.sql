create index if not exists admin_notes_author_idx on public.admin_notes(author_id);
create index if not exists announcements_created_by_idx on public.announcements(created_by);
create index if not exists audit_events_actor_idx on public.audit_events(actor_id);
create index if not exists player_documents_player_idx on public.player_documents(player_id);
create index if not exists player_documents_uploaded_by_idx on public.player_documents(uploaded_by);
create index if not exists resources_created_by_idx on public.resources(created_by);
create index if not exists staff_player_access_player_idx on public.staff_player_access(player_id);

alter policy "users read own profile" on public.profiles using (id = (select auth.uid()) or private.is_admin());
alter policy "users update own profile" on public.profiles using (id = (select auth.uid()) or private.is_admin()) with check (id = (select auth.uid()) or private.is_admin());
alter policy "admin notes staff only" on public.admin_notes using (private.is_admin() or exists (select 1 from public.staff_player_access a where a.player_id = admin_notes.player_id and a.staff_user_id = (select auth.uid()))) with check (private.is_admin() or exists (select 1 from public.staff_player_access a where a.player_id = admin_notes.player_id and a.staff_user_id = (select auth.uid()) and a.can_edit));
alter policy "staff can read own access" on public.staff_player_access using (staff_user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "player private edit" on public.player_private;
create policy "player private insert" on public.player_private for insert to authenticated with check (private.can_edit_player(player_id));
create policy "player private update" on public.player_private for update to authenticated using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));
create policy "player private delete" on public.player_private for delete to authenticated using (private.can_edit_player(player_id));

drop policy if exists "onboarding edit" on public.player_onboarding;
create policy "onboarding insert" on public.player_onboarding for insert to authenticated with check (private.can_edit_player(player_id));
create policy "onboarding update" on public.player_onboarding for update to authenticated using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));
create policy "onboarding delete" on public.player_onboarding for delete to authenticated using (private.can_edit_player(player_id));

drop policy if exists "public profiles editable" on public.player_public_profiles;
create policy "public profiles insert" on public.player_public_profiles for insert to authenticated with check (private.can_edit_player(player_id));
create policy "public profiles update" on public.player_public_profiles for update to authenticated using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));
create policy "public profiles delete" on public.player_public_profiles for delete to authenticated using (private.can_edit_player(player_id));

drop policy if exists "career entries edit" on public.career_entries;
create policy "career entries insert" on public.career_entries for insert to authenticated with check (private.can_edit_player(player_id));
create policy "career entries update" on public.career_entries for update to authenticated using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));
create policy "career entries delete" on public.career_entries for delete to authenticated using (private.can_edit_player(player_id));

drop policy if exists "videos edit" on public.player_videos;
create policy "videos insert" on public.player_videos for insert to authenticated with check (private.can_edit_player(player_id));
create policy "videos update" on public.player_videos for update to authenticated using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));
create policy "videos delete" on public.player_videos for delete to authenticated using (private.can_edit_player(player_id));

drop policy if exists "documents edit" on public.player_documents;
create policy "documents insert" on public.player_documents for insert to authenticated with check (private.can_edit_player(player_id));
create policy "documents update" on public.player_documents for update to authenticated using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));
create policy "documents delete" on public.player_documents for delete to authenticated using (private.can_edit_player(player_id));

drop policy if exists "checkins edit" on public.weekly_checkins;
create policy "checkins insert" on public.weekly_checkins for insert to authenticated with check (private.can_edit_player(player_id));
create policy "checkins update" on public.weekly_checkins for update to authenticated using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));
create policy "checkins delete" on public.weekly_checkins for delete to authenticated using (private.can_edit_player(player_id));

drop policy if exists "cv settings edit" on public.player_cv_settings;
create policy "cv settings insert" on public.player_cv_settings for insert to authenticated with check (private.can_edit_player(player_id));
create policy "cv settings update" on public.player_cv_settings for update to authenticated using (private.can_edit_player(player_id)) with check (private.can_edit_player(player_id));
create policy "cv settings delete" on public.player_cv_settings for delete to authenticated using (private.can_edit_player(player_id));

drop policy if exists "admins manage resources" on public.resources;
create policy "admins insert resources" on public.resources for insert to authenticated with check (private.is_admin());
create policy "admins update resources" on public.resources for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins delete resources" on public.resources for delete to authenticated using (private.is_admin());

drop policy if exists "admins manage announcements" on public.announcements;
create policy "admins insert announcements" on public.announcements for insert to authenticated with check (private.is_admin());
create policy "admins update announcements" on public.announcements for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins delete announcements" on public.announcements for delete to authenticated using (private.is_admin());

drop policy if exists "admins manage staff access" on public.staff_player_access;
create policy "admins insert staff access" on public.staff_player_access for insert to authenticated with check (private.is_admin());
create policy "admins update staff access" on public.staff_player_access for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins delete staff access" on public.staff_player_access for delete to authenticated using (private.is_admin());
