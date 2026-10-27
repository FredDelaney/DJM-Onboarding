-- Use existing canonical agency staff membership for Calendar access.
-- Retain role/tenant/owner checks, restricted staff projection and active-work status.
do $migration$
declare
 target oid:='public.redream_calendar_range(date,date,text)'::regprocedure;
 original_source text;original_owner oid;original_acl aclitem[];original_config text[];original_definer boolean;
 definition text;
begin
 perform set_config('lock_timeout','5s',true);
 perform set_config('statement_timeout','30s',true);
 select prosrc,proowner,proacl,proconfig,prosecdef into original_source,original_owner,original_acl,original_config,original_definer from pg_proc where oid=target;
 if md5(original_source)='1c6035407151fbbd2545d83f879bbdaa' then return;end if;
 if md5(original_source)<>'0df2efa05dd397890a42d89ac52f5419' then
  raise exception 'Calendar range differs from the reviewed agency-access baseline';
 end if;
 definition:=pg_get_functiondef(target);
 if strpos(definition,$legacy$    join djm_os.team_members tm
      on tm.user_id=m.user_id
     and tm.is_active
$legacy$)=0 then raise exception 'Reviewed Calendar staff join is missing';end if;
 execute replace(definition,$legacy$    join djm_os.team_members tm
      on tm.user_id=m.user_id
     and tm.is_active
$legacy$,'');
 if target is distinct from to_regprocedure('public.redream_calendar_range(date,date,text)')
 or not exists(select 1 from pg_proc where oid=target and md5(prosrc)='1c6035407151fbbd2545d83f879bbdaa'
  and proowner=original_owner and proacl is not distinct from original_acl and proconfig is not distinct from original_config and prosecdef=original_definer)
 then raise exception 'Calendar range changed its reviewed agency-access contract';end if;
end;
$migration$;
