with inserted_tenant as (
  insert into platform.tenants (
    slug,
    tenant_type,
    status,
    legal_name,
    metadata
  ) values (
    'djm-sports-management',
    'sports_management',
    'active',
    'DJM Sports Management',
    jsonb_build_object(
      'founding_tenant', true,
      'internal_tenant', true,
      'commercial_tier', 'top_internal',
      'environment', 'staging'
    )
  )
  on conflict (slug) do update set
    status = excluded.status,
    legal_name = excluded.legal_name,
    metadata = platform.tenants.metadata || excluded.metadata,
    updated_at = now()
  returning id
), djm as (
  select id from inserted_tenant
  union all
  select id from platform.tenants where slug = 'djm-sports-management'
  limit 1
)
insert into platform.tenant_branding (
  tenant_id,
  display_name,
  short_name,
  legal_name,
  portal_name,
  primary_color,
  secondary_color,
  accent_color,
  support_email,
  website_url,
  metadata
)
select
  id,
  'DJM Sports Management',
  'DJM',
  'DJM Sports Management',
  'DJM Player',
  '#061F3A',
  '#FFFFFF',
  '#F5E900',
  'jesse.edge@djmsports.com',
  'https://www.djmsports.com',
  jsonb_build_object('environment','staging','founding_tenant',true)
from djm
on conflict (tenant_id) do update set
  display_name = excluded.display_name,
  short_name = excluded.short_name,
  legal_name = excluded.legal_name,
  portal_name = excluded.portal_name,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  accent_color = excluded.accent_color,
  support_email = excluded.support_email,
  website_url = excluded.website_url,
  metadata = platform.tenant_branding.metadata || excluded.metadata,
  updated_at = now();

with djm as (
  select id from platform.tenants where slug = 'djm-sports-management'
)
insert into platform.tenant_domains (
  tenant_id,
  hostname,
  domain_type,
  status,
  is_primary,
  verified_at,
  metadata
)
select
  id,
  'app.djmsports.com',
  'custom',
  'verified',
  true,
  now(),
  jsonb_build_object('environment','staging','mirrors_production_hostname',true)
from djm
on conflict ((lower(hostname))) do nothing;

with djm as (
  select id from platform.tenants where slug = 'djm-sports-management'
)
insert into platform.tenant_entitlements (
  tenant_id,
  feature_key,
  enabled,
  source,
  configuration,
  valid_from
)
select
  djm.id,
  fc.feature_key,
  true,
  'internal',
  case
    when fc.metered then jsonb_build_object('unlimited', true, 'billing_exempt', true)
    else jsonb_build_object('billing_exempt', true)
  end,
  now()
from djm
cross join platform.feature_catalog fc
on conflict (tenant_id, feature_key) do update set
  enabled = true,
  source = 'internal',
  configuration = excluded.configuration,
  valid_from = coalesce(platform.tenant_entitlements.valid_from, excluded.valid_from),
  valid_until = null,
  updated_at = now();
