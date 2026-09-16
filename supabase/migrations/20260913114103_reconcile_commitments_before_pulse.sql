create or replace function public.platform_server_refresh_all_agency_pulses()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tenant record;
  v_result jsonb;
  v_commitments jsonb;
  v_results jsonb := '[]'::jsonb;
  v_ok integer := 0;
  v_failed integer := 0;
  v_pruned integer := 0;
begin
  for v_tenant in select id,slug from platform.tenants where status='active' loop
    begin
      v_commitments := public.platform_server_reconcile_commitments(v_tenant.id);
      v_result := public.platform_server_refresh_agency_pulse(v_tenant.id);
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'tenant_id',v_tenant.id,'slug',v_tenant.slug,'commitments',v_commitments,'result',v_result
      ));
      v_ok := v_ok+1;
    exception when others then
      v_results := v_results || jsonb_build_array(jsonb_build_object('tenant_id',v_tenant.id,'slug',v_tenant.slug,'error',left(sqlerrm,500)));
      v_failed := v_failed+1;
    end;
  end loop;

  delete from platform.agency_pulse_events where created_at < now()-interval '90 days';
  get diagnostics v_pruned=row_count;

  return jsonb_build_object('checked_at',now(),'succeeded',v_ok,'failed',v_failed,'pruned_events',v_pruned,'results',v_results);
end;
$function$;

revoke all on function public.platform_server_refresh_all_agency_pulses() from public, anon, authenticated;
grant execute on function public.platform_server_refresh_all_agency_pulses() to service_role;;
