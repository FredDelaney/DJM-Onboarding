drop trigger if exists protect_player_request_admin_fields on public.player_requests;
drop function if exists private.protect_player_request_admin_fields();
drop policy if exists "players message djm" on public.player_requests;
create policy "players message djm" on public.player_requests
for insert to authenticated
with check (
  request_type='message'
  and status='open'
  and due_at is null
  and created_by is null
  and completed_at is null
  and message is null
  and player_reply is not null
  and exists (select 1 from public.players p where p.id=player_id and p.user_id=auth.uid())
);
