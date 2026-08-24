create or replace function private.protect_document_club_share_approval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.club_shareable, false)
       and not private.is_admin()
       and current_user not in ('postgres', 'service_role', 'supabase_admin') then
      raise exception 'Only DJM admins can approve documents for club sharing';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.club_shareable is distinct from old.club_shareable
       and not private.is_admin()
       and current_user not in ('postgres', 'service_role', 'supabase_admin') then
      raise exception 'Only DJM admins can change club sharing approval';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_document_club_share_approval() from public;

create trigger protect_document_club_share_approval
before insert or update on public.player_documents
for each row
execute function private.protect_document_club_share_approval();
