-- The canonical publisher already validates/locks the player and selects the
-- agent-approved figures. Preserve that snapshot instead of summing it again.
-- Keep the reviewed career projection and every existing source-link guard.
do $repair_profile_stats$
declare
  v_oid oid:=pg_catalog.to_regprocedure('private.set_public_profile_career_timeline()');
  v_definition text;
  v_anchor text:='  new.key_stats := private.player_authoritative_key_stats(new.player_id, new.key_stats);';
begin
  select pg_catalog.pg_get_functiondef(p.oid) into v_definition
  from pg_catalog.pg_proc p
  where p.oid=v_oid and pg_catalog.md5(p.prosrc)='0c664e69200fe0dea818336f10165ff8'
    and p.prosecdef and p.provolatile='v' and p.prorettype='trigger'::regtype
    and p.proconfig=array['search_path=""']::text[]
    and pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    and not exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
      where a.grantee not in (0,p.proowner) or a.privilege_type<>'EXECUTE' or a.is_grantable);
  if v_definition is null or pg_catalog.strpos(v_definition,v_anchor)=0 then
    raise exception 'profile_stat_trigger_drift: review the current trigger before changing snapshot handling' using errcode='55000';
  end if;
  execute pg_catalog.replace(v_definition,v_anchor,$snapshot_stats$
  if pg_catalog.current_setting('djm.internal_tenant_dossier_mode',true)='publish_snapshot' then
    if pg_catalog.current_setting('role',true) in ('anon','authenticated')
       or pg_catalog.jsonb_typeof(new.key_stats) is distinct from 'array'
       or not exists(select 1 from public.players p where p.id=new.player_id
         and p.tenant_id::text=pg_catalog.current_setting('djm.internal_tenant_dossier_tenant',true)) then
      raise exception 'Approved profile statistics require matching server publication context' using errcode='42501';
    end if;
  elsif tg_op='UPDATE' and new.key_stats is not distinct from old.key_stats then
    -- Metadata/refresh writes must not silently replace a reviewed selection.
    null;
  else
    -- Existing legacy/raw writes retain their original authoritative filtering.
    new.key_stats := private.player_authoritative_key_stats(new.player_id, new.key_stats);
  end if;
$snapshot_stats$);
end;
$repair_profile_stats$;
