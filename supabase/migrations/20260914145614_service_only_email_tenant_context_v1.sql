create or replace function public.platform_server_email_tenant_context(
  p_tenant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tenantId', t.id,
    'slug', t.slug,
    'branding', jsonb_build_object(
      'displayName', coalesce(nullif(b.display_name, ''), 'Agency'),
      'shortName', nullif(b.short_name, ''),
      'portalName', nullif(b.portal_name, ''),
      'primaryColor', coalesce(nullif(b.primary_color, ''), '#111827'),
      'secondaryColor', coalesce(nullif(b.secondary_color, ''), '#FFFFFF'),
      'accentColor', coalesce(nullif(b.accent_color, ''), '#64748B'),
      'supportEmail', nullif(b.support_email, '')
    ),
    'domain', case
      when d.hostname is null then null
      else jsonb_build_object('hostname', d.hostname)
    end
  )
  from platform.tenants t
  left join platform.tenant_branding b
    on b.tenant_id = t.id
  left join lateral (
    select td.hostname
    from platform.tenant_domains td
    where td.tenant_id = t.id
      and td.status = 'verified'
    order by td.is_primary desc, td.created_at asc
    limit 1
  ) d on true
  where t.id = p_tenant_id
    and t.status = 'active'
  limit 1;
$$;

revoke all on function public.platform_server_email_tenant_context(uuid)
from public, anon, authenticated;
grant execute on function public.platform_server_email_tenant_context(uuid)
to service_role;
