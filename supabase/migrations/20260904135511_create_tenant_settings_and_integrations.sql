create table platform.tenant_settings (
  tenant_id uuid primary key references platform.tenants(id) on delete cascade,
  locale text not null default 'en-GB',
  timezone text not null default 'Europe/Rome',
  default_currency text not null default 'EUR' check (default_currency ~ '^[A-Z]{3}$'),
  data_region text,
  ai_monthly_budget_micros bigint check (ai_monthly_budget_micros is null or ai_monthly_budget_micros >= 0),
  ai_hard_limit boolean not null default true,
  retention_policy jsonb not null default '{}'::jsonb,
  notification_defaults jsonb not null default '{}'::jsonb,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table platform.tenant_settings enable row level security;

revoke all on platform.tenant_settings from public, anon, authenticated;


create table platform.integration_catalog (
  provider_key text primary key,
  display_name text not null,
  integration_type text not null,
  supports_platform_managed boolean not null default false,
  supports_tenant_credentials boolean not null default true,
  billable boolean not null default false,
  status text not null default 'available' check (status in ('available','preview','disabled','deprecated')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table platform.integration_catalog enable row level security;

revoke all on platform.integration_catalog from public, anon, authenticated;


create table platform.tenant_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  provider_key text not null references platform.integration_catalog(provider_key) on delete restrict,
  mode text not null default 'disabled' check (mode in ('disabled','platform_managed','tenant_credentials')),
  status text not null default 'not_configured' check (status in ('not_configured','pending','healthy','degraded','error','disabled')),
  credential_reference text,
  configuration jsonb not null default '{}'::jsonb,
  last_health_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_key)
);

create index tenant_integrations_status_idx
  on platform.tenant_integrations(tenant_id, status);

create index tenant_integrations_provider_idx
  on platform.tenant_integrations(provider_key);

alter table platform.tenant_integrations enable row level security;

revoke all on platform.tenant_integrations from public, anon, authenticated;


insert into platform.integration_catalog(
  provider_key,
  display_name,
  integration_type,
  supports_platform_managed,
  supports_tenant_credentials,
  billable,
  metadata
) values
('openai','OpenAI','ai',true,false,true,'{"secret_storage":"server_only","commercial_note":"meter usage separately"}'::jsonb),
('wyscout','Wyscout','football_data',false,true,true,'{"licensing":"tenant_or_negotiated","raw_redistribution":"not_assumed"}'::jsonb),
('api_football','API-Football','football_data',true,true,true,'{"licensing":"verify_before_commercial_use"}'::jsonb),
('transfermarkt','Transfermarkt','football_reference',false,false,false,'{"usage":"reference_or_permitted_enrichment_only","licensing":"do_not_assume_api_redistribution"}'::jsonb),
('resend','Resend','email',true,true,true,'{"secret_storage":"server_only"}'::jsonb)
on conflict (provider_key) do nothing;


insert into platform.tenant_settings(
  tenant_id,
  locale,
  timezone,
  default_currency,
  ai_monthly_budget_micros,
  ai_hard_limit
)
select id, 'en-GB', 'Europe/Rome', 'EUR', null, false
from platform.tenants
where slug='djm-sports-management'
on conflict (tenant_id) do nothing;

insert into platform.tenant_settings(
  tenant_id,
  locale,
  timezone,
  default_currency,
  ai_monthly_budget_micros,
  ai_hard_limit
)
select id, 'en-GB', 'Europe/London', 'EUR', 50000000, true
from platform.tenants
where slug='northstar-football-management'
on conflict (tenant_id) do nothing;
