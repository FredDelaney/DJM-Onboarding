create or replace function public.platform_server_operator_access(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select to_jsonb(x)
  from (
    select a.role, a.status
    from platform.platform_admins a
    where a.user_id = p_user_id
      and a.status = 'active'
    limit 1
  ) x;
$function$;

create or replace function public.platform_server_operator_plans()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'plan_key', p.plan_key,
        'display_name', p.display_name,
        'rank', p.rank,
        'status', p.status,
        'customer_segment', p.customer_segment,
        'limits', p.limits,
        'metadata', p.metadata,
        'monthly_price_cents', p.monthly_price_cents,
        'price_currency', p.price_currency,
        'price_is_from', p.price_is_from
      )
      order by p.rank
    ),
    '[]'::jsonb
  )
  from platform.plan_catalog p
  where p.status = 'active';
$function$;

create or replace function public.platform_server_operator_customer_detail(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select case when exists(
    select 1
    from platform.tenants t0
    where t0.id = p_tenant_id
  ) then
    jsonb_build_object(
      'tenant', (
        select to_jsonb(x) from (
          select
            t.id,
            t.slug,
            t.tenant_type,
            t.status,
            t.legal_name,
            t.metadata,
            t.created_at,
            t.updated_at
          from platform.tenants t
          where t.id = p_tenant_id
        ) x
      ),
      'branding', (
        select to_jsonb(x) from (
          select b.*
          from platform.tenant_branding b
          where b.tenant_id = p_tenant_id
        ) x
      ),
      'lifecycle', (
        select to_jsonb(x) from (
          select l.*
          from platform.tenant_customer_lifecycle l
          where l.tenant_id = p_tenant_id
        ) x
      ),
      'plan', (
        select to_jsonb(x) from (
          select
            a.plan_key,
            a.status,
            a.billing_mode,
            a.effective_from,
            a.effective_until,
            a.configuration
          from platform.tenant_plan_assignments a
          where a.tenant_id = p_tenant_id
            and a.status in ('trialing', 'active')
          order by a.effective_from desc
          limit 1
        ) x
      ),
      'domains', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.created_at)
        from (
          select
            d.id,
            d.hostname,
            d.domain_type,
            d.status,
            d.is_primary,
            d.verified_at,
            d.created_at
          from platform.tenant_domains d
          where d.tenant_id = p_tenant_id
        ) x
      ), '[]'::jsonb),
      'onboarding_tasks', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.sort_order)
        from (
          select
            o.task_key,
            o.category,
            o.title,
            o.description,
            o.status,
            o.required,
            o.sort_order,
            o.blocked_reason,
            o.completed_at
          from platform.tenant_onboarding_tasks o
          where o.tenant_id = p_tenant_id
        ) x
      ), '[]'::jsonb),
      'memberships', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.joined_at)
        from (
          select
            m.user_id,
            m.role,
            m.status,
            m.is_primary,
            m.joined_at
          from platform.tenant_memberships m
          where m.tenant_id = p_tenant_id
        ) x
      ), '[]'::jsonb),
      'feature_overrides', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.feature_key)
        from (
          select
            e.feature_key,
            e.enabled,
            e.source,
            e.configuration,
            e.valid_from,
            e.valid_until,
            e.updated_at
          from platform.tenant_entitlements e
          where e.tenant_id = p_tenant_id
        ) x
      ), '[]'::jsonb),
      'audit', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.occurred_at desc)
        from (
          select
            a.id,
            a.actor_user_id,
            a.actor_kind,
            a.action,
            a.entity_type,
            a.entity_id,
            a.after_state,
            a.metadata,
            a.occurred_at
          from platform.audit_events a
          where a.tenant_id = p_tenant_id
          order by a.occurred_at desc
          limit 50
        ) x
      ), '[]'::jsonb)
    )
  else null end;
$function$;

revoke all on function public.platform_server_operator_access(uuid) from public;
revoke all on function public.platform_server_operator_access(uuid) from anon;
revoke all on function public.platform_server_operator_access(uuid) from authenticated;
grant execute on function public.platform_server_operator_access(uuid) to service_role;

revoke all on function public.platform_server_operator_plans() from public;
revoke all on function public.platform_server_operator_plans() from anon;
revoke all on function public.platform_server_operator_plans() from authenticated;
grant execute on function public.platform_server_operator_plans() to service_role;

revoke all on function public.platform_server_operator_customer_detail(uuid) from public;
revoke all on function public.platform_server_operator_customer_detail(uuid) from anon;
revoke all on function public.platform_server_operator_customer_detail(uuid) from authenticated;
grant execute on function public.platform_server_operator_customer_detail(uuid) to service_role;
