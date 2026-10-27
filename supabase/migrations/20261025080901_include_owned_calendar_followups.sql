-- Keep undated, un-tagged follow-ups visible to their canonical owner.
-- Explicit responsibility choices remain authoritative. No task/assignment writes.
do $migration$
declare
 target oid:='public.redream_assigned_work_page_v1(uuid,integer,integer)'::regprocedure;
 original_owner oid; original_acl aclitem[]; original_config text[]; original_definer boolean;
 original_source text; definition text; replacement text;
begin
 perform set_config('lock_timeout','5s',true);
 perform set_config('statement_timeout','30s',true);
 select p.prosrc,p.proowner,p.proacl,p.proconfig,p.prosecdef,pg_get_functiondef(p.oid)
 into original_source,original_owner,original_acl,original_config,original_definer,definition
 from pg_proc p where p.oid=target;
 if md5(original_source)='83a8c5fc79e47fd66db8dc99d0c433ed' then return;end if;
 if md5(original_source) is distinct from '5c4cf06966ddbadd0e2efc849a47417d' then
  raise exception 'Assigned work reader differs from the reviewed baseline';
 end if;
 replacement:=replace(definition,$old$ for c in select * from platform.calendar_tasks$old$,$new$ -- Un-tagged work uses its canonical owner. An explicit responsibility row
 -- remains authoritative, including an empty or reassigned list.
 for r in select owned.id from djm_os.tasks owned
  where owned.tenant_id=t and owned.owner_user_id=auth.uid()
   and owned.due_at is null and owned.status in ('open','in_progress')
   and not exists(select 1 from platform.work_responsibilities assigned
    where assigned.tenant_id=t and assigned.work_kind='task' and assigned.work_id=owned.id) loop
  w:=private.responsibility_work('task',r.id);
  result:=result||jsonb_build_array(w||jsonb_build_object('work_kind','task','work_id',r.id,'responsible_people',private.responsibility_people(t,array[auth.uid()])));
 end loop;
 for c in select * from platform.calendar_tasks$new$);
 if replacement=definition then raise exception 'Assigned work reader insertion was not found';end if;
 execute replacement;
 if target is distinct from to_regprocedure('public.redream_assigned_work_page_v1(uuid,integer,integer)')
  or not exists(select 1 from pg_proc p where p.oid=target
   and md5(p.prosrc)='83a8c5fc79e47fd66db8dc99d0c433ed' and p.proowner=original_owner
   and p.proacl is not distinct from original_acl and p.proconfig is not distinct from original_config
   and p.prosecdef=original_definer) then
  raise exception 'Assigned work reader changed its canonical contract';
 end if;
end;
$migration$;
