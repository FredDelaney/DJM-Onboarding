create index if not exists tenant_memberships_owner_lookup_idx
  on platform.tenant_memberships(tenant_id,user_id,role,status);
create index if not exists player_opportunities_tenant_created_idx
  on public.player_opportunities(tenant_id,created_at);
create index if not exists relationships_tenant_created_idx
  on djm_os.relationships(tenant_id,created_at);
