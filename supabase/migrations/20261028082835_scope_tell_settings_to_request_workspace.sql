-- Resolve settings access through the existing guarded request-workspace helper.
-- Correct the earlier policy without granting browsers membership-table access.
-- SELECT only: do not change settings, writes, grants or any other policy.
do $migration$
declare
 target oid; original jsonb; table_contract jsonb; other_policies jsonb; expression_hash text;
begin
 perform set_config('lock_timeout','5s',true);
 perform set_config('statement_timeout','30s',true);
 select p.oid,to_jsonb(p),md5(pg_get_expr(p.polqual,p.polrelid))
 into target,original,expression_hash from pg_policy p
 where p.polrelid='djm_os.tell_djm_settings'::regclass and p.polname='tell_djm_settings_select';
 if target is null or original->>'polcmd'<>'r' or not (original->>'polpermissive')::boolean
  or original->'polwithcheck'<>'null'::jsonb
  or original->'polroles' is distinct from jsonb_build_array((select oid::text from pg_roles where rolname='authenticated'))
  or expression_hash not in ('c8d00d7e6d520fc046bcdfe2396f5203','f28f546b1f2622c9eedc0feab99fd1e5','f2df0a28e21e3f819134b8374a962dc5')
 then raise exception 'Tell settings read policy differs from the reviewed baseline';end if;
 if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.user_has_staff_tenant_access(uuid,uuid)')
  and md5(p.prosrc)='18cf9a31b7e202e28785e12972525cda' and p.prosecdef and p.provolatile='s'
  and pg_get_userbyid(p.proowner)='postgres' and p.proconfig=array['search_path=""']
  and p.proacl::text='{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}')
 then raise exception 'Canonical agency staff helper differs from the reviewed baseline';end if;
 select jsonb_build_object('owner',relowner,'acl',relacl,'rls',relrowsecurity,'force_rls',relforcerowsecurity)
 into table_contract from pg_class where oid='djm_os.tell_djm_settings'::regclass;
 if not (table_contract->>'rls')::boolean or pg_get_userbyid((table_contract->>'owner')::oid)<>'postgres'
 then raise exception 'Tell settings table differs from the reviewed baseline';end if;
 select coalesce(jsonb_agg(to_jsonb(p) order by p.oid),'[]'::jsonb) into other_policies
 from pg_policy p where p.polrelid='djm_os.tell_djm_settings'::regclass and p.oid<>target;
 if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.tell_request_tenant()')
  and md5(p.prosrc)='c87c391eecb3d3918cb284edbba48423' and p.prosecdef and p.provolatile='s'
  and pg_get_userbyid(p.proowner)='postgres' and p.proconfig=array['search_path=""']
  and p.proacl::text='{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}')
 then raise exception 'Tell request-workspace resolver differs from the reviewed baseline';end if;
 if expression_hash<>'f2df0a28e21e3f819134b8374a962dc5' then
  alter policy tell_djm_settings_select on djm_os.tell_djm_settings using (
   (select private.user_has_staff_tenant_access(private.tell_request_tenant(),auth.uid()))
  );
 end if;
 if original-'polqual' is distinct from (select to_jsonb(p)-'polqual' from pg_policy p where p.oid=target)
  or (select md5(pg_get_expr(polqual,polrelid)) from pg_policy where oid=target)<>'f2df0a28e21e3f819134b8374a962dc5'
  or table_contract is distinct from (select jsonb_build_object('owner',relowner,'acl',relacl,'rls',relrowsecurity,'force_rls',relforcerowsecurity) from pg_class where oid='djm_os.tell_djm_settings'::regclass)
  or other_policies is distinct from (select coalesce(jsonb_agg(to_jsonb(p) order by p.oid),'[]'::jsonb) from pg_policy p where p.polrelid='djm_os.tell_djm_settings'::regclass and p.oid<>target)
 then raise exception 'Tell settings repair changed the reviewed read-only contract';end if;
end;
$migration$;
