drop policy if exists "requests view" on public.player_requests;
create policy "requests view" on public.player_requests for select to authenticated using (
  private.is_admin() or (request_type <> 'signal' and private.can_view_sensitive_player(player_id))
);

drop policy if exists "requests update" on public.player_requests;
create policy "requests update" on public.player_requests for update to authenticated using (
  private.is_admin() or (request_type not in ('message','signal') and private.can_view_sensitive_player(player_id))
) with check (
  private.is_admin() or (request_type not in ('message','signal') and private.can_view_sensitive_player(player_id))
);
