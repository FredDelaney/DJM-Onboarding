create table platform.usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  user_id uuid,
  feature_key text not null references platform.feature_catalog(feature_key) on delete restrict,
  event_key text not null,
  quantity numeric(20,6) not null default 1 check (quantity >= 0),
  unit text not null default 'event',
  estimated_cost_micros bigint not null default 0 check (estimated_cost_micros >= 0),
  actual_cost_micros bigint check (actual_cost_micros is null or actual_cost_micros >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  external_request_id text,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index usage_events_tenant_time_idx
  on platform.usage_events(tenant_id, occurred_at desc);

create index usage_events_feature_time_idx
  on platform.usage_events(tenant_id, feature_key, occurred_at desc);

create unique index usage_events_idempotency_idx
  on platform.usage_events(tenant_id, feature_key, idempotency_key)
  where idempotency_key is not null;

alter table platform.usage_events enable row level security;

revoke all on platform.usage_events from public, anon, authenticated;


create table platform.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  usage_event_id uuid references platform.usage_events(id) on delete set null,
  user_id uuid,
  feature_key text not null references platform.feature_catalog(feature_key) on delete restrict,
  provider text not null,
  model text not null,
  prompt_version text,
  source_fingerprint text,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  estimated_cost_micros bigint not null default 0 check (estimated_cost_micros >= 0),
  actual_cost_micros bigint check (actual_cost_micros is null or actual_cost_micros >= 0),
  status text not null check (status in ('succeeded','failed','cancelled','blocked','cached')),
  external_request_id text,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index ai_usage_events_tenant_time_idx
  on platform.ai_usage_events(tenant_id, occurred_at desc);

create index ai_usage_events_feature_time_idx
  on platform.ai_usage_events(tenant_id, feature_key, occurred_at desc);

create index ai_usage_events_request_idx
  on platform.ai_usage_events(external_request_id)
  where external_request_id is not null;

alter table platform.ai_usage_events enable row level security;

revoke all on platform.ai_usage_events from public, anon, authenticated;
