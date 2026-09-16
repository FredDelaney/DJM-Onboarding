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
      pc.limits as plan_limits,
      s.locale,
      s.timezone,
      s.default_currency,
      s.data_region,
      s.ai_monthly_budget_micros,
      s.ai_hard_limit
    from resolved r
    join platform.tenants t on t.id = r.tenant_id
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

create or replace function public.platform_server_feature(p_tenant_id uuid, p_feature_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', ee.enabled,
    'source', ee.source,
    'plan_key', ee.plan_key,
    'configuration', ee.configuration
  )
  from platform.effective_entitlement(p_tenant_id, p_feature_key) ee;
$$;

create or replace function public.platform_server_record_audit(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_kind text,
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_request_id text default null,
  p_correlation_id text default null,
  p_before_state jsonb default null,
  p_after_state jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not exists (select 1 from platform.tenants where id = p_tenant_id and status = 'active') then
    raise exception 'tenant_not_active';
  end if;
  insert into platform.audit_events(tenant_id, actor_user_id, actor_kind, action, entity_type, entity_id, request_id, correlation_id, before_state, after_state, metadata)
  values (p_tenant_id, p_actor_user_id, p_actor_kind, p_action, p_entity_type, p_entity_id, p_request_id, p_correlation_id, p_before_state, p_after_state, coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.platform_server_record_usage(
  p_tenant_id uuid,
  p_user_id uuid,
  p_feature_key text,
  p_event_key text,
  p_quantity numeric default 1,
  p_unit text default 'event',
  p_estimated_cost_micros bigint default 0,
  p_actual_cost_micros bigint default null,
  p_currency text default 'USD',
  p_external_request_id text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not exists (select 1 from platform.tenants where id = p_tenant_id and status = 'active') then
    raise exception 'tenant_not_active';
  end if;
  if not exists (select 1 from platform.feature_catalog where feature_key = p_feature_key) then
    raise exception 'unknown_feature';
  end if;
  insert into platform.usage_events(tenant_id, user_id, feature_key, event_key, quantity, unit, estimated_cost_micros, actual_cost_micros, currency, external_request_id, idempotency_key, metadata)
  values (p_tenant_id, p_user_id, p_feature_key, p_event_key, p_quantity, p_unit, p_estimated_cost_micros, p_actual_cost_micros, upper(p_currency), p_external_request_id, p_idempotency_key, coalesce(p_metadata,'{}'::jsonb))
  on conflict (tenant_id, feature_key, idempotency_key) where idempotency_key is not null
  do update set external_request_id = coalesce(platform.usage_events.external_request_id, excluded.external_request_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.platform_server_enqueue_job(
  p_tenant_id uuid,
  p_job_type text,
  p_payload jsonb default '{}'::jsonb,
  p_correlation_id text default null,
  p_delay_seconds integer default 0
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_msg_id bigint;
begin
  if p_delay_seconds < 0 or p_delay_seconds > 604800 then raise exception 'invalid_delay'; end if;
  if not exists (select 1 from platform.tenants where id = p_tenant_id and status = 'active') then raise exception 'tenant_not_active'; end if;
  select send into v_msg_id from pgmq.send('platform_jobs', jsonb_build_object(
    'tenant_id', p_tenant_id,
    'job_type', p_job_type,
    'payload', coalesce(p_payload,'{}'::jsonb),
    'correlation_id', p_correlation_id,
    'enqueued_at', now()
  ), p_delay_seconds);
  return v_msg_id;
end;
$$;

revoke all on function public.platform_server_tenant_context(text) from public, anon, authenticated;
revoke all on function public.platform_server_feature(uuid,text) from public, anon, authenticated;
revoke all on function public.platform_server_record_audit(uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.platform_server_record_usage(uuid,uuid,text,text,numeric,text,bigint,bigint,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.platform_server_enqueue_job(uuid,text,jsonb,text,integer) from public, anon, authenticated;
grant execute on function public.platform_server_tenant_context(text) to service_role;
grant execute on function public.platform_server_feature(uuid,text) to service_role;
grant execute on function public.platform_server_record_audit(uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.platform_server_record_usage(uuid,uuid,text,text,numeric,text,bigint,bigint,text,text,text,jsonb) to service_role;
grant execute on function public.platform_server_enqueue_job(uuid,text,jsonb,text,integer) to service_role;
