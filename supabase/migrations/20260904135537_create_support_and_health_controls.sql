create table platform.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  support_user_id uuid not null,
  approved_by_user_id uuid,
  reason text not null,
  scope jsonb not null default '{}'::jsonb,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by_user_id uuid,
  created_at timestamptz not null default now(),
  check (expires_at > starts_at)
);
create index support_access_active_idx on platform.support_access_grants(tenant_id, expires_at) where revoked_at is null;
alter table platform.support_access_grants enable row level security;
revoke all on platform.support_access_grants from public, anon, authenticated;

create table platform.service_health_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references platform.tenants(id) on delete cascade,
  component text not null,
  status text not null check (status in ('healthy','degraded','down','recovered')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);
create index service_health_component_idx on platform.service_health_events(component, observed_at desc);
create index service_health_tenant_idx on platform.service_health_events(tenant_id, observed_at desc) where tenant_id is not null;
alter table platform.service_health_events enable row level security;
revoke all on platform.service_health_events from public, anon, authenticated;

create table platform.operational_incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references platform.tenants(id) on delete cascade,
  severity text not null check (severity in ('info','minor','major','critical')),
  component text not null,
  status text not null default 'open' check (status in ('open','monitoring','resolved')),
  title text not null,
  summary text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index operational_incidents_open_idx on platform.operational_incidents(status, severity, detected_at desc) where status <> 'resolved';
alter table platform.operational_incidents enable row level security;
revoke all on platform.operational_incidents from public, anon, authenticated;
