revoke select on table public.player_agreements from anon;
revoke select on table public.player_opportunities from anon;

create index if not exists club_share_links_created_by_idx on public.club_share_links(created_by);
create index if not exists player_agreements_document_id_idx on public.player_agreements(document_id);
create index if not exists player_opportunities_owner_id_idx on public.player_opportunities(owner_id);

drop policy if exists "agreements view" on public.player_agreements;
create policy "agreements view" on public.player_agreements
for select to authenticated
using (
  private.is_admin()
  or (
    visible_to_player
    and exists (
      select 1 from public.players p
      where p.id = player_agreements.player_id
        and p.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "admins manage site content" on public.site_content;
create policy "admins insert site content" on public.site_content
for insert to authenticated with check (private.is_admin());
create policy "admins update site content" on public.site_content
for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins delete site content" on public.site_content
for delete to authenticated using (private.is_admin());
