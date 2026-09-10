create table platform.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references platform.tenants(id) on delete restrict,
  actor_user_id uuid,
  actor_kind text not null default 'system' check (actor_kind in ('user','player','system','service','support')),
  action text not null,
  entity_type text,
  entity_id text,
  request_id text,
  correlation_id text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_events_tenant_occurred_idx
  on platform.audit_events(tenant_id, occurred_at desc);

create index audit_events_entity_idx
  on platform.audit_events(tenant_id, entity_type, entity_id, occurred_at desc);

create index audit_events_correlation_idx
  on platform.audit_events(correlation_id)
  where correlation_id is not null;

alter table platform.audit_events enable row level security;

revoke all on platform.audit_events from public, anon, authenticated;


create table platform.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  scope text not null,
  idempotency_key text not null,
  request_hash text,
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  result_json jsonb,
  error_code text,
  locked_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, scope, idempotency_key)
);

create index idempotency_keys_expiry_idx
  on platform.idempotency_keys(expires_at);

create index idempotency_keys_pending_idx
  on platform.idempotency_keys(tenant_id, status, created_at)
  where status='pending';

alter table platform.idempotency_keys enable row level security;

revoke all on platform.idempotency_keys from public, anon, authenticated;
