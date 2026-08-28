create or replace function private.can_view_sensitive_player(target_player_id uuid)
returns boolean
language sql
stable security definer
set search_path = public, pg_catalog
as $$
  select private.is_admin()
    or exists (select 1 from public.players p where p.id=target_player_id and p.user_id=auth.uid())
    or exists (select 1 from public.staff_player_access a where a.player_id=target_player_id and a.staff_user_id=auth.uid() and a.can_edit=true);
$$;
revoke all on function private.can_view_sensitive_player(uuid) from public, anon;
grant execute on function private.can_view_sensitive_player(uuid) to authenticated, service_role;

drop policy if exists "player private view" on public.player_private;
create policy "player private view" on public.player_private for select to authenticated using (private.can_view_sensitive_player(player_id));
drop policy if exists "documents view" on public.player_documents;
create policy "documents view" on public.player_documents for select to authenticated using (private.can_view_sensitive_player(player_id));
drop policy if exists "admin notes staff only" on public.admin_notes;
create policy "admin notes admin only" on public.admin_notes for all to authenticated using (private.is_admin()) with check (private.is_admin());
