create table platform.tenant_branding (
  tenant_id uuid primary key references platform.tenants(id) on delete cascade,
  display_name text not null,
  short_name text,
  legal_name text,
  portal_name text,
  logo_asset text,
  compact_logo_asset text,
  light_logo_asset text,
  favicon_asset text,
  primary_color text,
  secondary_color text,
  accent_color text,
  support_email text,
  website_url text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint tenant_branding_primary_color_check
    check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint tenant_branding_secondary_color_check
    check (secondary_color is null or secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint tenant_branding_accent_color_check
    check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$')
);

alter table platform.tenant_branding enable row level security;

create table platform.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  hostname text not null,
  domain_type text not null,
  status text not null default 'pending',
  is_primary boolean not null default false,
  verification_token_hash text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint tenant_domains_hostname_check
    check (
      hostname = lower(hostname)
      and hostname !~ '\s'
      and char_length(hostname) between 1 and 253
    ),
  constraint tenant_domains_type_check
    check (domain_type in ('platform_subdomain','custom')),
  constraint tenant_domains_status_check
    check (status in ('pending','verifying','verified','disabled'))
);

alter table platform.tenant_domains enable row level security;

create unique index tenant_domains_hostname_unique_idx
  on platform.tenant_domains (lower(hostname));

create index tenant_domains_tenant_idx
  on platform.tenant_domains (tenant_id, status);

create unique index tenant_domains_one_primary_verified_per_tenant_idx
  on platform.tenant_domains (tenant_id)
  where is_primary and status = 'verified';

revoke all on platform.tenant_branding from public, anon, authenticated;
revoke all on platform.tenant_domains from public, anon, authenticated;
