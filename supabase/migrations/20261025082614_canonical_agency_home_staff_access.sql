-- Canonical active agency membership governs Home and task ownership.
-- Keep the existing tenant/role checks; remove only the legacy global staff joins.
-- No data rewrite, grant, new role, profile sync or authentication change.
do $migration$
declare
 contract record; version integer; target oid; original_source text; definition text; replacement text; obsolete text;
 original_owner oid; original_acl aclitem[]; original_config text[]; original_definer boolean;
begin
 perform set_config('lock_timeout','5s',true);
 perform set_config('statement_timeout','30s',true);
 for contract in select * from (values
    ('private.redream_enforce_staff_task_owner()',array['cb1e1c8a44f6cf3762da1e14e108c328'],array['70c4a00b3517ae136c3ed4b6fd23333f']),
    ('public.platform_server_user_task_commands(uuid,uuid,integer)',array['b2cec93693b824128df375b7e7d7dce0','df2fff950cbac860e0b583b999a02536'],array['00ba3e3519f7f9cfa853a50faccc088f','a75e24785b5d9d8165e004be60a2c2c4']),
    ('public.platform_server_personal_home_commands(uuid,uuid,integer)',array['7e40b31e3b3c521d7b59e438d898883a'],array['ccfd7e63313290260efdbe033c5cb990'])
 ) as x(identity,original_hashes,patched_hashes) loop
  target:=to_regprocedure(contract.identity);
  if target is null then raise exception 'Canonical Home contract is missing: %',contract.identity;end if;
  select p.prosrc,p.proowner,p.proacl,p.proconfig,p.prosecdef,pg_get_functiondef(p.oid)
  into original_source,original_owner,original_acl,original_config,original_definer,definition
  from pg_proc p where p.oid=target;
  if md5(original_source)=any(contract.patched_hashes) then continue;end if;
  version:=array_position(contract.original_hashes,md5(original_source));
  if version is null then
   raise exception 'Canonical Home contract differs from the reviewed baseline: %',contract.identity;
  end if;
  replacement:=definition;
  foreach obsolete in array array[
$legacy0$    join djm_os.team_members tm
      on tm.user_id=m.user_id
     and tm.is_active
$legacy0$,
$legacy1$         join djm_os.team_members tm
           on tm.user_id=m.user_id
          and tm.is_active
$legacy1$,
$legacy2$      join djm_os.team_members tm
        on tm.user_id=m.user_id
       and tm.is_active
$legacy2$
  ] loop
   replacement:=replace(replacement,obsolete,'');
  end loop;
  if replacement=definition then raise exception 'Legacy Home staff join was not found';end if;
  execute replacement;
  if target is distinct from to_regprocedure(contract.identity)
   or not exists(select 1 from pg_proc p where p.oid=target
    and md5(p.prosrc)=contract.patched_hashes[version] and p.proowner=original_owner
    and p.proacl is not distinct from original_acl and p.proconfig is not distinct from original_config
    and p.prosecdef=original_definer) then
   raise exception 'Canonical Home contract metadata changed: %',contract.identity;
  end if;
 end loop;
end;
$migration$;
