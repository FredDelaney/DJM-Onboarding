create table platform.plan_catalog (
  plan_key text primary key,
  display_name text not null,
  rank smallint not null,
  status text not null default 'active',
  customer_segment text not null,
  limits jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_catalog_key_check
    check (plan_key = lower(plan_key) and plan_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint plan_catalog_status_check
    check (status in ('draft','active','retired')),
  constraint plan_catalog_rank_check
    check (rank > 0)
);

alter table platform.plan_catalog enable row level security;

create table platform.plan_features (
  plan_key text not null references platform.plan_catalog(plan_key) on delete cascade,
  feature_key text not null references platform.feature_catalog(feature_key) on delete cascade,
  enabled boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_key, feature_key)
);

alter table platform.plan_features enable row level security;

create index plan_features_feature_key_idx
  on platform.plan_features (feature_key);

create table platform.tenant_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  plan_key text not null references platform.plan_catalog(plan_key) on delete restrict,
  status text not null default 'active',
  billing_mode text not null default 'manual',
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_plan_assignments_status_check
    check (status in ('trialing','active','suspended','ended')),
  constraint tenant_plan_assignments_billing_mode_check
    check (billing_mode in ('internal','manual','invoice','stripe')),
  constraint tenant_plan_assignments_dates_check
    check (effective_until is null or effective_until > effective_from)
);

alter table platform.tenant_plan_assignments enable row level security;

create index tenant_plan_assignments_plan_key_idx
  on platform.tenant_plan_assignments (plan_key);

create unique index tenant_plan_assignments_one_current_per_tenant_idx
  on platform.tenant_plan_assignments (tenant_id)
  where status in ('trialing','active');

revoke all on platform.plan_catalog from public, anon, authenticated;
revoke all on platform.plan_features from public, anon, authenticated;
revoke all on platform.tenant_plan_assignments from public, anon, authenticated;
