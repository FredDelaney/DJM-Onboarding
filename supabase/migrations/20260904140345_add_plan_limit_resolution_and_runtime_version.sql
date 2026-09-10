create or replace function platform.effective_plan_limits(p_tenant_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with active_assignment as (
    select a.plan_key, a.configuration
    from platform.tenant_plan_assignments a
    join platform.tenants t on t.id=a.tenant_id and t.status='active'
    where a.tenant_id=p_tenant_id
      and a.status in ('trialing','active')
      and a.effective_from <= now()
      and (a.effective_until is null or a.effective_until > now())
    order by a.effective_from desc
    limit 1
  )
  select coalesce(pc.limits,'{}'::jsonb) || coalesce(aa.configuration->'limit_overrides','{}'::jsonb)
  from active_assignment aa
  join platform.plan_catalog pc on pc.plan_key=aa.plan_key;
$$;

create or replace function public.platform_server_plan_limits(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(platform.effective_plan_limits(p_tenant_id),'{}'::jsonb);
$$;

create or replace function public.platform_server_runtime_version(p_tenant_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select version from platform.tenant_runtime_versions where tenant_id=p_tenant_id;
$$;

revoke all on function public.platform_server_plan_limits(uuid) from public, anon, authenticated;
revoke all on function public.platform_server_runtime_version(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_plan_limits(uuid) to service_role;
grant execute on function public.platform_server_runtime_version(uuid) to service_role;

create or replace function public.platform_server_tenant_context(p_hostname text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with resolved as (
    select platform.resolve_tenant_by_hostname(p_hostname) as tenant_id
  ),
  base as (
    select
      t.id as tenant_id,
      t.slug,
      t.tenant_type,
      t.status,
      rv.version as runtime_version,
      b.display_name,
      b.short_name,
      b.portal_name,
      b.logo_asset,
      b.compact_logo_asset,
      b.light_logo_asset,
      b.favicon_asset,
      b.primary_color,
      b.secondary_color,
      b.accent_color,
      b.support_email,
      b.website_url,
      b.phone,
      d.hostname,
      d.domain_type,
      pa.plan_key,
      pc.display_name as plan_name,
      pc.rank as plan_rank,
      platform.effective_plan_limits(t.id) as plan_limits,
      s.locale,
      s.timezone,
      s.default_currency,
      s.data_region,
      s.ai_monthly_budget_micros,
      s.ai_hard_limit
    from resolved r
    join platform.tenants t on t.id = r.tenant_id
    left join platform.tenant_runtime_versions rv on rv.tenant_id=t.id
    left join platform.tenant_branding b on b.tenant_id = t.id
    left join platform.tenant_domains d on d.tenant_id = t.id and d.hostname = regexp_replace(lower(trim(p_hostname)), '\.$', '') and d.status = 'verified'
    left join lateral (
      select a.plan_key
      from platform.tenant_plan_assignments a
      where a.tenant_id = t.id
        and a.status in ('trialing','active')
        and a.effective_from <= now()
        and (a.effective_until is null or a.effective_until > now())
      order by a.effective_from desc
      limit 1
    ) pa on true
    left join platform.plan_catalog pc on pc.plan_key = pa.plan_key
    left join platform.tenant_settings s on s.tenant_id = t.id
  )
  select case when not exists(select 1 from base) then null else (
    select jsonb_build_object(
      'tenant_id', base.tenant_id,
      'slug', base.slug,
      'tenant_type', base.tenant_type,
      'status', base.status,
      'runtime_version', base.runtime_version,
      'branding', jsonb_build_object(
        'display_name', base.display_name,
        'short_name', base.short_name,
        'portal_name', base.portal_name,
        'logo_asset', base.logo_asset,
        'compact_logo_asset', base.compact_logo_asset,
        'light_logo_asset', base.light_logo_asset,
        'favicon_asset', base.favicon_asset,
        'primary_color', base.primary_color,
        'secondary_color', base.secondary_color,
        'accent_color', base.accent_color,
        'support_email', base.support_email,
        'website_url', base.website_url,
        'phone', base.phone
      ),
      'domain', jsonb_build_object('hostname', base.hostname, 'domain_type', base.domain_type),
      'plan', jsonb_build_object('key', base.plan_key, 'name', base.plan_name, 'rank', base.plan_rank, 'limits', coalesce(base.plan_limits, '{}'::jsonb)),
      'settings', jsonb_build_object(
        'locale', base.locale,
        'timezone', base.timezone,
        'default_currency', base.default_currency,
        'data_region', base.data_region,
        'ai_monthly_budget_micros', base.ai_monthly_budget_micros,
        'ai_hard_limit', base.ai_hard_limit
      ),
      'features', coalesce((
        select jsonb_object_agg(fc.feature_key, jsonb_build_object(
          'enabled', ee.enabled,
          'source', ee.source,
          'configuration', ee.configuration
        ) order by fc.feature_key)
        from platform.feature_catalog fc
        cross join lateral platform.effective_entitlement(base.tenant_id, fc.feature_key) ee
      ), '{}'::jsonb)
    ) from base
  ) end;
$$;

revoke all on function public.platform_server_tenant_context(text) from public, anon, authenticated;
grant execute on function public.platform_server_tenant_context(text) to service_role;
