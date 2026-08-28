grant select, insert, update, delete on table public.admin_allowlist to authenticated;
revoke all on table public.admin_allowlist from anon;
