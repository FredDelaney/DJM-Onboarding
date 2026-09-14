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
  v_outcomes jsonb;
  v_results jsonb := '[]'::jsonb;
  v_ok integer := 0;
  v_failed integer := 0;
  v_pruned integer := 0;
begin
  for v_tenant in select id,slug from platform.tenants where status='active' loop
    begin
      v_commitments := public.platform_server_reconcile_commitments(v_tenant.id);
      v_outcomes := public.platform_server_evaluate_action_outcomes(v_tenant.id);
      v_result := public.platform_server_refresh_agency_pulse(v_tenant.id);
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'tenant_id',v_tenant.id,'slug',v_tenant.slug,'commitments',v_commitments,'outcomes',v_outcomes,'result',v_result
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
grant execute on function public.platform_server_refresh_all_agency_pulses() to service_role;

create or replace function public.platform_server_agency_home_executive(
  p_tenant_id uuid,
  p_command_limit integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select public.platform_server_agency_home_full(p_tenant_id,p_command_limit)
         || jsonb_build_object(
              'strategic_plays',public.platform_server_agency_playbook(p_tenant_id,3),
              'pursuit_summary',public.platform_server_pursuit_board(p_tenant_id,20)->'summary',
              'outcome_learning',public.platform_server_outcome_learning(p_tenant_id,90)
            );
$function$;

revoke all on function public.platform_server_agency_home_executive(uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_agency_home_executive(uuid,integer) to service_role;

create or replace function public.platform_server_agency_brief_executive(
  p_tenant_id uuid,
  p_window_hours integer default 24,
  p_decision_limit integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select public.platform_server_agency_brief_full(p_tenant_id,p_window_hours,p_decision_limit)
         || jsonb_build_object(
              'pursuit_board',public.platform_server_pursuit_board(p_tenant_id,10),
              'strategic_playbook',public.platform_server_agency_playbook(p_tenant_id,8),
              'outcome_learning',public.platform_server_outcome_learning(p_tenant_id,90)
            );
$function$;

revoke all on function public.platform_server_agency_brief_executive(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.platform_server_agency_brief_executive(uuid,integer,integer) to service_role;;
