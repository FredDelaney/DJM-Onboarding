create or replace function platform.resolve_tenant_by_hostname(p_hostname text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select td.tenant_id
  from platform.tenant_domains td
  join platform.tenants t on t.id = td.tenant_id
  where td.hostname = regexp_replace(lower(trim(p_hostname)), '\.$', '')
    and td.status = 'verified'
    and t.status = 'active'
  order by td.is_primary desc, td.verified_at desc nulls last, td.created_at asc
  limit 1;
$$;

create or replace function platform.effective_entitlement(
  p_tenant_id uuid,
  p_feature_key text
)
returns table (
  enabled boolean,
  source text,
  plan_key text,
  configuration jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with active_tenant as (
    select t.id
    from platform.tenants t
    where t.id = p_tenant_id
      and t.status = 'active'
  ),
  active_plan as (
    select a.plan_key
    from platform.tenant_plan_assignments a
    join active_tenant t on t.id = a.tenant_id
    where a.status in ('trialing','active')
      and a.effective_from <= now()
      and (a.effective_until is null or a.effective_until > now())
    order by a.effective_from desc
    limit 1
  ),
  plan_value as (
    select pf.enabled, pf.configuration
    from active_plan ap
    join platform.plan_features pf on pf.plan_key = ap.plan_key
    where pf.feature_key = p_feature_key
    limit 1
  ),
  tenant_override as (
    select e.enabled, e.source, e.configuration
    from platform.tenant_entitlements e
    join active_tenant t on t.id = e.tenant_id
    where e.feature_key = p_feature_key
      and (e.valid_from is null or e.valid_from <= now())
      and (e.valid_until is null or e.valid_until > now())
    limit 1
  )
  select
    coalesce((select enabled from tenant_override), (select enabled from plan_value), false) as enabled,
    coalesce((select source from tenant_override), case when exists(select 1 from plan_value) then 'plan' else 'none' end) as source,
    (select plan_key from active_plan) as plan_key,
    coalesce((select configuration from plan_value), '{}'::jsonb)
      || coalesce((select configuration from tenant_override), '{}'::jsonb) as configuration
  where exists (
    select 1 from platform.feature_catalog fc where fc.feature_key = p_feature_key
  );
$$;

revoke all on function platform.resolve_tenant_by_hostname(text) from public, anon, authenticated;
revoke all on function platform.effective_entitlement(uuid, text) from public, anon, authenticated;
