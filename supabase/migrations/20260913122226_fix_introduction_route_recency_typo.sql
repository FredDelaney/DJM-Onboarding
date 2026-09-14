do $$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='platform_server_introduction_routes'
    and pg_get_function_identity_arguments(p.oid)='p_tenant_id uuid, p_organisation_id uuid, p_limit integer';
  if v_oid is null then raise exception 'introduction_routes_not_found'; end if;
  v_def:=pg_get_functiondef(v_oid);
  if position('r.last_meaning_at' in v_def)=0 then raise exception 'expected_typo_not_found'; end if;
  execute replace(v_def,'r.last_meaning_at','r.last_meaningful_at');
end $$;

revoke all on function public.platform_server_introduction_routes(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_introduction_routes(uuid,uuid,integer) to service_role;;
