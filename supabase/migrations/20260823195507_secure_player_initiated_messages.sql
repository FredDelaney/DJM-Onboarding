drop policy if exists "players create messages" on public.player_requests;
create policy "players create messages" on public.player_requests
for insert to authenticated
with check (
  request_type = 'message'
  and created_by is null
  and due_at is null
  and private.can_view_sensitive_player(player_id)
  and exists (select 1 from public.players p where p.id = player_id and p.user_id = (select auth.uid()))
);

create or replace function private.protect_player_request_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not private.is_admin() then
    if new.id is distinct from old.id
       or new.player_id is distinct from old.player_id
       or new.title is distinct from old.title
       or new.message is distinct from old.message
       or new.request_type is distinct from old.request_type
       or new.due_at is distinct from old.due_at
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Not permitted to change DJM request fields';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.protect_player_request_admin_fields() from public, anon, authenticated;
grant execute on function private.protect_player_request_admin_fields() to service_role;

drop trigger if exists protect_player_request_admin_fields on public.player_requests;
create trigger protect_player_request_admin_fields
before update on public.player_requests
for each row execute function private.protect_player_request_admin_fields();
