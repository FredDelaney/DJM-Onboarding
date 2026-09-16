create table platform.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  tenant_type text not null default 'agency',
  status text not null default 'provisioning',
  legal_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint tenants_slug_format_check
    check (
      slug = lower(slug)
      and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(slug) between 2 and 63
    ),
  constraint tenants_type_check
    check (tenant_type in ('agency','sports_management','scouting_company','consultancy','club','other')),
  constraint tenants_status_check
    check (status in ('provisioning','active','suspended','closed'))
);

alter table platform.tenants enable row level security;

create table platform.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  status text not null default 'active',
  is_primary boolean not null default false,
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint tenant_memberships_role_check
    check (role in ('owner','admin','agent','scout','operations','player')),
  constraint tenant_memberships_status_check
    check (status in ('invited','active','suspended','ended')),
  constraint tenant_memberships_dates_check
    check (ended_at is null or ended_at >= joined_at),
  constraint tenant_memberships_tenant_user_key
    unique (tenant_id, user_id)
);

alter table platform.tenant_memberships enable row level security;

create index tenant_memberships_user_active_idx
  on platform.tenant_memberships (user_id, tenant_id)
  where status = 'active';

create index tenant_memberships_tenant_role_active_idx
  on platform.tenant_memberships (tenant_id, role, user_id)
  where status = 'active';

create unique index tenant_memberships_one_primary_active_per_user_idx
  on platform.tenant_memberships (user_id)
  where status = 'active' and is_primary;

revoke all on platform.tenants from public, anon, authenticated;
revoke all on platform.tenant_memberships from public, anon, authenticated;
