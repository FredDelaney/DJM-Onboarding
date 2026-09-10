insert into platform.plan_catalog
  (plan_key, display_name, rank, status, customer_segment, limits, metadata)
values
  ('agency','Agency',10,'active','Smaller professional football agencies',jsonb_build_object('active_players',40,'staff_users',5),jsonb_build_object('commercial_promise','Run the agency properly')),
  ('pro','Pro',20,'active','Growing agencies that need intelligence and opportunity creation',jsonb_build_object('active_players',100,'staff_users',15),jsonb_build_object('commercial_promise','Create more and better opportunities','hero_plan',true)),
  ('elite','Elite',30,'active','Established multi-agent businesses',jsonb_build_object('active_players',250,'staff_users',30),jsonb_build_object('commercial_promise','Run the whole agency intelligently')),
  ('enterprise','Enterprise',40,'active','Large or complex football agencies',jsonb_build_object('active_players',null,'staff_users',null),jsonb_build_object('commercial_promise','Scale securely','custom_contract',true))
on conflict (plan_key) do update set
  display_name = excluded.display_name,
  rank = excluded.rank,
  status = excluded.status,
  customer_segment = excluded.customer_segment,
  limits = excluded.limits,
  metadata = excluded.metadata,
  updated_at = now();

with agency_features(feature_key) as (
  values
    ('core_player_management'),
    ('core_network'),
    ('core_opportunities'),
    ('core_deals'),
    ('core_player_portal'),
    ('core_cv'),
    ('core_club_sharing'),
    ('custom_branding')
), pro_features(feature_key) as (
  select feature_key from agency_features
  union all values
    ('intelligence_player_scoring'),
    ('intelligence_potential'),
    ('intelligence_comparison'),
    ('intelligence_club_match'),
    ('intelligence_relationships'),
    ('intelligence_opportunity_engine'),
    ('intelligence_career_engine'),
    ('automation_action_engine'),
    ('ai_assistant'),
    ('ai_player_analysis'),
    ('speech_capture'),
    ('custom_domain')
), elite_features(feature_key) as (
  select feature_key from pro_features
  union all values
    ('business_agency_intelligence'),
    ('business_commissions'),
    ('player_service_intelligence'),
    ('branded_email'),
    ('api_access')
), enterprise_features(feature_key) as (
  select feature_key from elite_features
  union all values
    ('enterprise_sso')
), bundled(plan_key, feature_key) as (
  select 'agency', feature_key from agency_features
  union all
  select 'pro', feature_key from pro_features
  union all
  select 'elite', feature_key from elite_features
  union all
  select 'enterprise', feature_key from enterprise_features
)
insert into platform.plan_features (plan_key, feature_key, enabled)
select plan_key, feature_key, true
from bundled
on conflict (plan_key, feature_key) do update set
  enabled = true,
  updated_at = now();

with djm as (
  select id from platform.tenants where slug = 'djm-sports-management'
)
insert into platform.tenant_plan_assignments (
  tenant_id,
  plan_key,
  status,
  billing_mode,
  configuration
)
select
  id,
  'enterprise',
  'active',
  'internal',
  jsonb_build_object('billing_exempt',true,'founding_tenant',true,'all_optional_capabilities_unlocked',true)
from djm
on conflict (tenant_id) where status in ('trialing','active') do update set
  plan_key = excluded.plan_key,
  status = excluded.status,
  billing_mode = excluded.billing_mode,
  configuration = excluded.configuration,
  effective_until = null,
  updated_at = now();

update platform.tenants
set metadata = metadata || jsonb_build_object('commercial_tier','enterprise','billing_mode','internal','top_plan',true),
    updated_at = now()
where slug = 'djm-sports-management';
