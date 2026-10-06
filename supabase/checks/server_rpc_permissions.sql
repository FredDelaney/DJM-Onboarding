-- Run against staging and production after migrations, before promoting a release.
-- This examines permissions only; it reads no customer rows.
do $check$
declare exposed text;
begin
 select string_agg(p.oid::regprocedure::text,', ' order by p.proname) into exposed
 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'platform_server_%'
  and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'));
 if exposed is not null then raise exception 'Server RPCs exposed to client roles: %',exposed; end if;
end $check$;
select count(*) as checked_server_functions from pg_catalog.pg_proc p
 join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'platform_server_%';
