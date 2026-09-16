create or replace function platform.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table platform.tenant_runtime_versions (
  tenant_id uuid primary key references platform.tenants(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);
alter table platform.tenant_runtime_versions enable row level security;
revoke all on platform.tenant_runtime_versions from public, anon, authenticated;
insert into platform.tenant_runtime_versions(tenant_id) select id from platform.tenants on conflict do nothing;

create or replace function platform.bump_tenant_runtime_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_tenant_id uuid;
begin
  v_tenant_id := case when tg_op='DELETE' then old.tenant_id else new.tenant_id end;
  insert into platform.tenant_runtime_versions(tenant_id, version, updated_at)
  values (v_tenant_id, 1, now())
  on conflict (tenant_id) do update
    set version = platform.tenant_runtime_versions.version + 1,
        updated_at = now();
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger tenants_touch_updated_at before update on platform.tenants for each row execute function platform.touch_updated_at();
create trigger tenant_memberships_touch_updated_at before update on platform.tenant_memberships for each row execute function platform.touch_updated_at();
create trigger tenant_branding_touch_updated_at before update on platform.tenant_branding for each row execute function platform.touch_updated_at();
create trigger tenant_domains_touch_updated_at before update on platform.tenant_domains for each row execute function platform.touch_updated_at();
create trigger tenant_entitlements_touch_updated_at before update on platform.tenant_entitlements for each row execute function platform.touch_updated_at();
create trigger plan_catalog_touch_updated_at before update on platform.plan_catalog for each row execute function platform.touch_updated_at();
create trigger plan_features_touch_updated_at before update on platform.plan_features for each row execute function platform.touch_updated_at();
create trigger tenant_plan_assignments_touch_updated_at before update on platform.tenant_plan_assignments for each row execute function platform.touch_updated_at();
create trigger tenant_settings_touch_updated_at before update on platform.tenant_settings for each row execute function platform.touch_updated_at();
create trigger integration_catalog_touch_updated_at before update on platform.integration_catalog for each row execute function platform.touch_updated_at();
create trigger tenant_integrations_touch_updated_at before update on platform.tenant_integrations for each row execute function platform.touch_updated_at();
create trigger idempotency_keys_touch_updated_at before update on platform.idempotency_keys for each row execute function platform.touch_updated_at();
create trigger operational_incidents_touch_updated_at before update on platform.operational_incidents for each row execute function platform.touch_updated_at();

create trigger tenant_branding_bump_runtime after insert or update or delete on platform.tenant_branding for each row execute function platform.bump_tenant_runtime_version();
create trigger tenant_domains_bump_runtime after insert or update or delete on platform.tenant_domains for each row execute function platform.bump_tenant_runtime_version();
create trigger tenant_entitlements_bump_runtime after insert or update or delete on platform.tenant_entitlements for each row execute function platform.bump_tenant_runtime_version();
create trigger tenant_plan_assignments_bump_runtime after insert or update or delete on platform.tenant_plan_assignments for each row execute function platform.bump_tenant_runtime_version();
create trigger tenant_settings_bump_runtime after insert or update or delete on platform.tenant_settings for each row execute function platform.bump_tenant_runtime_version();
create trigger tenant_integrations_bump_runtime after insert or update or delete on platform.tenant_integrations for each row execute function platform.bump_tenant_runtime_version();

revoke all on function platform.touch_updated_at() from public, anon, authenticated;
revoke all on function platform.bump_tenant_runtime_version() from public, anon, authenticated;
