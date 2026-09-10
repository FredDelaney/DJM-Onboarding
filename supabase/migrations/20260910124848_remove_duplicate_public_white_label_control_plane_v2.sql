drop function if exists public.platform_brand_for_hostname(text);
drop function if exists public.platform_my_agencies();
drop function if exists public.platform_feature_enabled(uuid, text);

drop table if exists public.platform_agency_infrastructure;
drop table if exists public.platform_agency_subscriptions;
drop table if exists public.platform_agency_feature_overrides;
drop table if exists public.platform_agency_memberships;
drop table if exists public.platform_agency_domains;
drop table if exists public.platform_agency_branding;
drop table if exists public.platform_agencies;
drop table if exists public.platform_plan_catalog;

drop function if exists private.platform_protect_last_owner();
drop function if exists private.platform_has_agency_role(uuid, text[]);
drop function if exists private.platform_is_agency_member(uuid);
drop function if exists private.platform_set_updated_at();
