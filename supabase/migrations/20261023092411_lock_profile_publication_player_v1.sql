-- Keep verification current through snapshot publication and concurrent photo edits.
-- Upgrade only the reviewed existing writer; preserve the already-locked writer.
do $profile_publication_lock$
declare
  v_oid oid:=pg_catalog.to_regprocedure('public.platform_server_publish_player_profile_snapshot(uuid,uuid,uuid,jsonb)');
  v_source_hash text;
  v_definition text;
  v_anchor text:=E'  where p.id=p_player_id\n    and p.tenant_id=p_tenant_id;';
begin
  select md5(p.prosrc),pg_catalog.pg_get_functiondef(p.oid)
  into v_source_hash,v_definition
  from pg_catalog.pg_proc p
  where p.oid=v_oid and p.prosecdef
    and coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']::text[];
  if v_source_hash is null
     or v_source_hash not in ('243bbc087910c35720266fcdafca9022','14d97ec779ff7e208132581dfb9cf217')
     or pg_catalog.has_function_privilege('anon',v_oid,'execute')
     or pg_catalog.has_function_privilege('authenticated',v_oid,'execute')
     or not pg_catalog.has_function_privilege('service_role',v_oid,'execute') then
    raise exception 'profile_publish_writer_drift: review the current publisher before changing its lock' using errcode='55000';
  end if;
  if v_source_hash='243bbc087910c35720266fcdafca9022' then
    if pg_catalog.strpos(v_definition,v_anchor)=0 then
      raise exception 'profile_publish_writer_drift: expected player read not found' using errcode='55000';
    end if;
    execute pg_catalog.replace(v_definition,v_anchor,
      E'  where p.id=p_player_id\n    and p.tenant_id=p_tenant_id\n  for update;');
  end if;
end;
$profile_publication_lock$;
