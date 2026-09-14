do $$
declare
  v_rec record;
  v_def text;
  v_old text := '(''create_search_task'',''create_player_task'',''create_relationship_task'',''create_verification_task'')';
  v_new text := '(''create_search_task'',''create_player_task'',''create_relationship_task'',''create_verification_task'',''create_introduction_task'')';
begin
  for v_rec in
    select p.oid,n.nspname,p.proname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname in ('platform_server_execute_agency_action','platform_server_undo_agency_action'))
       or (n.nspname='platform' and p.proname='sync_commitment_from_proposal')
  loop
    v_def:=pg_get_functiondef(v_rec.oid);
    if position(v_old in v_def)=0 then raise exception 'expected_action_list_not_found in %.%',v_rec.nspname,v_rec.proname; end if;
    execute replace(v_def,v_old,v_new);
  end loop;
end $$;

do $$
declare v_oid oid; v_def text; v_old text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='platform_server_autonomy_eligibility' and pg_get_function_identity_arguments(p.oid)='p_proposal_id uuid';
  v_def:=pg_get_functiondef(v_oid);
  v_old:='(''complete_task'',''create_search_task'',''create_player_task'',''create_relationship_task'',''create_verification_task'')';
  v_new:='(''complete_task'',''create_search_task'',''create_player_task'',''create_relationship_task'',''create_verification_task'',''create_introduction_task'')';
  if position(v_old in v_def)=0 then raise exception 'autonomy_reversibility_list_not_found'; end if;
  execute replace(v_def,v_old,v_new);
end $$;

revoke all on function public.platform_server_execute_agency_action(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_undo_agency_action(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_autonomy_eligibility(uuid) from public,anon,authenticated;
revoke all on function platform.sync_commitment_from_proposal() from public,anon,authenticated;
grant execute on function public.platform_server_execute_agency_action(uuid,uuid) to service_role;
grant execute on function public.platform_server_undo_agency_action(uuid,uuid) to service_role;
grant execute on function public.platform_server_autonomy_eligibility(uuid) to service_role;
grant execute on function platform.sync_commitment_from_proposal() to service_role;;
