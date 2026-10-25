-- Keep existing owned dated follow-ups visible while work is in progress.
-- Preserve the reviewed staff projection, identity, permissions and task rows.
do $migration$
declare
 target oid:='public.redream_calendar_range(date,date,text)'::regprocedure;
 original_source text;original_owner oid;original_acl aclitem[];original_config text[];original_definer boolean;
 definition text;
begin
 perform set_config('lock_timeout','5s',true);
 perform set_config('statement_timeout','30s',true);
 select prosrc,proowner,proacl,proconfig,prosecdef into original_source,original_owner,original_acl,original_config,original_definer from pg_proc where oid=target;
 if md5(original_source)='0df2efa05dd397890a42d89ac52f5419' then return;end if;
 if md5(original_source)<>'8df71af6543a18b6adb65c29ae5affba' then
  raise exception 'Calendar range differs from the reviewed active-work baseline';
 end if;
 definition:=pg_get_functiondef(target);
 if strpos(definition,$before$and task.status='open'$before$)=0 then raise exception 'Reviewed Calendar task predicate is missing';end if;
 execute replace(definition,$before$and task.status='open'$before$,$after$and task.status in ('open','in_progress')$after$);
 if target is distinct from to_regprocedure('public.redream_calendar_range(date,date,text)')
 or not exists(select 1 from pg_proc where oid=target and md5(prosrc)='0df2efa05dd397890a42d89ac52f5419'
  and proowner=original_owner and proacl is not distinct from original_acl and proconfig is not distinct from original_config and prosecdef=original_definer)
 then raise exception 'Calendar range changed its reviewed function contract';end if;
end;
$migration$;
