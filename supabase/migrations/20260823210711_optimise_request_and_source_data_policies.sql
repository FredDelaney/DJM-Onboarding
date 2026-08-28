create index if not exists player_requests_created_by_idx on public.player_requests(created_by);
create index if not exists player_source_refreshes_requested_by_idx on public.player_source_refreshes(requested_by);
create index if not exists player_source_suggestions_reviewed_by_idx on public.player_source_suggestions(reviewed_by);

drop policy if exists "admins create requests" on public.player_requests;
drop policy if exists "players message djm" on public.player_requests;
create policy "requests insert" on public.player_requests
for insert to authenticated
with check (
  private.is_admin()
  or (
    request_type='message'
    and status='open'
    and due_at is null
    and created_by is null
    and completed_at is null
    and message is null
    and player_reply is not null
    and exists (
      select 1 from public.players p
      where p.id=player_id and p.user_id=(select auth.uid())
    )
  )
);
