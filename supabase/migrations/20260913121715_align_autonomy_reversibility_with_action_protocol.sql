do $$
declare
  v_oid oid;
  v_def text;
  v_old text := 'v_reversible_by_protocol := v_p.action_type in (''complete_task'',''create_search_task'',''create_player_task'');';
  v_new text := 'v_reversible_by_protocol := v_p.action_type in (''complete_task'',''create_search_task'',''create_player_task'',''create_relationship_task'',''create_verification_task'');';
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='platform_server_autonomy_eligibility'
    and pg_get_function_identity_arguments(p.oid)='p_proposal_id uuid';
  if v_oid is null then raise exception 'autonomy_eligibility_not_found'; end if;
  v_def:=pg_get_functiondef(v_oid);
  if position(v_old in v_def)=0 then raise exception 'expected_reversibility_expression_not_found'; end if;
  execute replace(v_def,v_old,v_new);
end $$;

revoke all on function public.platform_server_autonomy_eligibility(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_autonomy_eligibility(uuid) to service_role;;
