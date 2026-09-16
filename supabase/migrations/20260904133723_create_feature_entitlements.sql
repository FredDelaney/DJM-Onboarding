create table platform.feature_catalog (
  feature_key text primary key,
  display_name text not null,
  category text not null,
  description text,
  billable boolean not null default false,
  metered boolean not null default false,
  default_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint feature_catalog_key_check
    check (
      feature_key = lower(feature_key)
      and feature_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
    ),
  constraint feature_catalog_category_check
    check (category in ('core','intelligence','automation','business','player_service','ai','speech','branding','integration','enterprise'))
);

alter table platform.feature_catalog enable row level security;

create table platform.tenant_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  feature_key text not null references platform.feature_catalog(feature_key) on delete restrict,
  enabled boolean not null default false,
  source text not null default 'manual',
  configuration jsonb not null default '{}'::jsonb,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_entitlements_source_check
    check (source in ('manual','plan','trial','enterprise','internal')),
  constraint tenant_entitlements_dates_check
    check (valid_until is null or valid_from is null or valid_until > valid_from),
  constraint tenant_entitlements_tenant_feature_key
    unique (tenant_id, feature_key)
);

alter table platform.tenant_entitlements enable row level security;

create index tenant_entitlements_tenant_enabled_idx
  on platform.tenant_entitlements (tenant_id, feature_key)
  where enabled;

revoke all on platform.feature_catalog from public, anon, authenticated;
revoke all on platform.tenant_entitlements from public, anon, authenticated;
