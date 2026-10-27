-- Keep supported in-progress work active across Home, Calendar and receipts.
-- These are guarded read-model changes, with no task-row or permission rewrite.
do $migration$
declare
  contract record; target oid; original_source text; definition text; replacement text;
  original_owner oid; original_acl aclitem[]; original_config text[]; original_definer boolean;
begin
  perform set_config('lock_timeout','5s',true);
  perform set_config('statement_timeout','30s',true);
  for contract in select * from (values
    ('private.home_work_state(text,uuid,uuid,text)','12b7e80d1263f379fca9eb49b86afe56','696b90172e06941bcc0e1ac96b6e6489',
     $old$case when r.status='open' then 'open' else 'done' end$old$,
     $new$case when r.status in ('open','in_progress') then 'open' else 'done' end$new$),
    ('private.responsibility_work(text,uuid)','b6d2ede49bd2071d40ef835fc361fbe2','cf662d2a4b50d75dec9464daac8cbe32',
     $old$'open',t.status='open','context'$old$,
     $new$'open',t.status in ('open','in_progress'),'context'$new$)
  ) as x(identity,original_hash,patched_hash,old_fragment,new_fragment) loop
    target:=to_regprocedure(contract.identity);
    if target is null then raise exception 'Canonical follow-up reader is missing: %',contract.identity; end if;
    select p.prosrc,p.proowner,p.proacl,p.proconfig,p.prosecdef,pg_get_functiondef(p.oid)
    into original_source,original_owner,original_acl,original_config,original_definer,definition
    from pg_proc p where p.oid=target;
    if md5(original_source)=contract.patched_hash then continue; end if;
    if md5(original_source) is distinct from contract.original_hash then
      raise exception 'Canonical follow-up reader differs from reviewed baseline: %',contract.identity;
    end if;
    replacement:=replace(definition,contract.old_fragment,contract.new_fragment);
    if replacement=definition then raise exception 'Active follow-up state mapper was not found'; end if;
    execute replacement;
    if target is distinct from to_regprocedure(contract.identity)
      or not exists(select 1 from pg_proc p where p.oid=target
        and md5(p.prosrc)=contract.patched_hash and p.proowner=original_owner
        and p.proacl is not distinct from original_acl and p.proconfig is not distinct from original_config
        and p.prosecdef=original_definer) then
      raise exception 'Active follow-up state changed its canonical reader contract';
    end if;
  end loop;
end;
$migration$;
