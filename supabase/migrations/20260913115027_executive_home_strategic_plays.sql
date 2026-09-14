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
              'pursuit_summary',public.platform_server_pursuit_board(p_tenant_id,20)->'summary'
            );
$function$;

revoke all on function public.platform_server_agency_home_executive(uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_agency_home_executive(uuid,integer) to service_role;;
