create index if not exists tenant_owner_invites_created_by_idx on platform.tenant_owner_invites(created_by);
create index if not exists tenant_owner_invites_accepted_by_idx on platform.tenant_owner_invites(accepted_by);
