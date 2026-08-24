create or replace function private.protect_document_club_share_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.club_shareable, false)
       and not private.is_admin()
       and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
      raise exception 'Only DJM admins can approve documents for club sharing';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.club_shareable is distinct from old.club_shareable
       and not private.is_admin()
       and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
      raise exception 'Only DJM admins can change club sharing approval';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_document_club_share_approval() from public;
