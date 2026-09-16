create or replace function platform.enrich_commands_with_access(p_tenant_id uuid, p_commands jsonb, p_route_limit integer default 3)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  if jsonb_typeof(coalesce(p_commands,'[]'::jsonb))<>'array' then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(
    c.value || jsonb_build_object(
      'access_context',public.platform_server_command_access_context(
        p_tenant_id,
        c.value->>'command_id',
        greatest(1,least(coalesce(p_route_limit,3),5))
      )
    ) order by c.ordinality
  ),'[]'::jsonb)
  into v_result
  from jsonb_array_elements(p_commands) with ordinality c(value,ordinality);

  return v_result;
end;
$function$;

create or replace function public.platform_server_agency_home_context(
  p_tenant_id uuid,
  p_command_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_home jsonb;
  v_commands jsonb;
  v_enriched jsonb;
  v_top jsonb;
begin
  v_home := public.platform_server_agency_home(p_tenant_id,p_command_limit);
  v_commands := coalesce(v_home->'attention'->'commands','[]'::jsonb);
  v_enriched := platform.enrich_commands_with_access(p_tenant_id,v_commands,3);
  v_top := case when jsonb_array_length(v_enriched)>0 then v_enriched->0 else null end;

  return jsonb_set(
    jsonb_set(v_home,'{attention,commands}',v_enriched,true),
    '{attention,top_command}',coalesce(v_top,'null'::jsonb),true
  ) || jsonb_build_object(
    'context_policy',jsonb_build_object(
      'access_intelligence','attached_when_club_context_exists',
      'relationship_scoring','deterministic_and_explainable'
    )
  );
end;
$function$;

revoke all on function public.platform_server_agency_home_context(uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_agency_home_context(uuid,integer) to service_role;

create or replace function public.platform_server_agency_brief_context(
  p_tenant_id uuid,
  p_window_hours integer default 24,
  p_decision_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_brief jsonb;
  v_decisions jsonb;
  v_enriched jsonb;
  v_sequence jsonb;
begin
  v_brief := public.platform_server_agency_brief(p_tenant_id,p_window_hours,p_decision_limit);
  v_decisions := coalesce(v_brief->'top_decisions','[]'::jsonb);
  v_enriched := platform.enrich_commands_with_access(p_tenant_id,v_decisions,3);

  select coalesce(jsonb_agg(
    s.value || jsonb_build_object(
      'access_context',public.platform_server_command_access_context(p_tenant_id,s.value->>'command_id',1)
    ) order by s.ordinality
  ),'[]'::jsonb)
  into v_sequence
  from jsonb_array_elements(coalesce(v_brief->'next_best_sequence','[]'::jsonb)) with ordinality s(value,ordinality);

  return jsonb_set(
    jsonb_set(v_brief,'{top_decisions}',v_enriched,true),
    '{next_best_sequence}',v_sequence,true
  ) || jsonb_build_object(
    'access_intelligence',jsonb_build_object(
      'enabled',true,
      'method','deterministic relationship strength + access + trust + recency + role relevance',
      'interpretation','Best-route guidance is evidence-based network context, not a guarantee of club response.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_agency_brief_context(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.platform_server_agency_brief_context(uuid,integer,integer) to service_role;;
