create or replace function public.platform_server_public_demo_snapshot_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_metadata jsonb;
begin
  select t.id, coalesce(t.metadata, '{}'::jsonb)
    into v_tenant_id, v_metadata
  from platform.tenants t
  where t.slug = 'northstar-football-management'
    and t.status = 'active'
  limit 1;

  if v_tenant_id is null then
    raise exception 'public_demo_tenant_unavailable';
  end if;

  if coalesce((v_metadata->>'synthetic_test_tenant')::boolean, false) is not true
     or coalesce(v_metadata->>'environment', '') <> 'staging' then
    raise exception 'public_demo_tenant_safety_check_failed';
  end if;

  return jsonb_build_object(
    'contract_version', 'redream_public_demo_source_v1',
    'synthetic', true,
    'generated_at', now(),
    'home', public.platform_server_agency_home(v_tenant_id, 8),
    'network', public.platform_server_network_coverage(v_tenant_id),
    'demand', public.platform_server_demand_control_fast(v_tenant_id, 8),
    'pursuits', public.platform_server_career_aligned_pursuit_board(v_tenant_id, 8),
    'revenue', public.platform_server_revenue_command(v_tenant_id, 8)
  );
end;
$$;

revoke all on function public.platform_server_public_demo_snapshot_v1()
  from public, anon, authenticated;
grant execute on function public.platform_server_public_demo_snapshot_v1()
  to service_role;

comment on function public.platform_server_public_demo_snapshot_v1() is
  'Service-role-only source contract for the public ReDream website demo. It resolves only the staging synthetic tenant and refuses non-synthetic or non-staging data.';
