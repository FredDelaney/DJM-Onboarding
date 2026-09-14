do $$
declare r record; v_sig text;
begin
  for r in
    select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname like 'platform_server_%'
  loop
    v_sig:=format('%I.%I(%s)',r.nspname,r.proname,r.args);
    execute 'revoke all on function '||v_sig||' from public';
    execute 'revoke all on function '||v_sig||' from anon';
    execute 'revoke all on function '||v_sig||' from authenticated';
    execute 'grant execute on function '||v_sig||' to service_role';
  end loop;
end $$;;
