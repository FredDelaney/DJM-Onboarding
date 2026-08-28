drop policy if exists "public profiles insert" on public.player_public_profiles;
create policy "admins insert public profiles"
on public.player_public_profiles for insert to authenticated
with check (private.is_admin());
