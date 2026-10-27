-- Refuse creation Undo after a newer canonical task or responsibility change.
-- Preserve the existing function OID, ownership, configuration and execution ACL.
do $migration$
declare
  target oid:='public.redream_ai_undo_action_core_pre_email(uuid)'::regprocedure;
  original_owner oid; original_acl aclitem[]; original_config text[]; original_definer boolean;
  original_source text; definition text; replacement text;
begin
  perform set_config('lock_timeout','5s',true);
  perform set_config('statement_timeout','30s',true);
  select p.prosrc,p.proowner,p.proacl,p.proconfig,p.prosecdef,pg_get_functiondef(p.oid)
  into original_source,original_owner,original_acl,original_config,original_definer,definition
  from pg_proc p where p.oid=target;
  if md5(original_source)='2ce689440904c71ecdc92e0451806005' then return; end if;
  if md5(original_source) is distinct from 'feb0e58af6269bee3d0abd1425b5724a' then
    raise exception 'Task creation Undo definition differs from the reviewed baseline';
  end if;
  replacement:=replace(definition,$old_task_guard$  if v_action.action_type='create_task' then
    delete from djm_os.tasks
    where tenant_id=v_capture.tenant_id and id=v_action.target_id
      and source='tell_djm:'||v_action.capture_id::text||':'||v_action.action_hash
      and updated_at<=coalesce(v_action.applied_at,now())+interval '5 seconds';
    get diagnostics v_deleted=row_count;
$old_task_guard$,$new_task_guard$  if v_action.action_type='create_task' then
    -- canonical_task_creation_undo_snapshot_v1: use the same work lock as Home
    -- and responsibility edits; never infer unchanged work from elapsed time.
    perform pg_advisory_xact_lock(hashtextextended(v_capture.tenant_id::text||'task'||v_action.target_id::text,0));
    perform 1 from djm_os.tasks t
    where t.tenant_id=v_capture.tenant_id and t.id=v_action.target_id
      and t.source='tell_djm:'||v_action.capture_id::text||':'||v_action.action_hash
      and jsonb_typeof(v_action.after_json)='object'
      and jsonb_strip_nulls(to_jsonb(t))=jsonb_strip_nulls(v_action.after_json)
    for update;
    if not found then
      raise exception 'This task changed after it was created. Review it instead of undoing newer work';
    end if;

    perform 1 from platform.work_responsibilities r
    where r.tenant_id=v_capture.tenant_id and r.work_kind='task' and r.work_id=v_action.target_id for update;
    if (case when jsonb_typeof(v_action.verification_json->'responsible_user_ids')='array'
      then jsonb_array_length(v_action.verification_json->'responsible_user_ids')>0 else false end) then
      if not exists(select 1 from platform.work_responsibilities r
        where r.tenant_id=v_capture.tenant_id and r.work_kind='task' and r.work_id=v_action.target_id
          and to_jsonb(r.responsible_user_ids)=v_action.verification_json->'responsible_user_ids'
          and r.revision=1
          and r.updated_at is not distinct from nullif(v_action.verification_json->>'approved_at','')::timestamptz) then
        raise exception 'This task responsibility changed. Review it instead of undoing newer work';
      end if;
    elsif exists(select 1 from platform.work_responsibilities r
      where r.tenant_id=v_capture.tenant_id and r.work_kind='task' and r.work_id=v_action.target_id) then
      raise exception 'This task responsibility changed. Review it instead of undoing newer work';
    end if;

    delete from djm_os.tasks where tenant_id=v_capture.tenant_id and id=v_action.target_id;
    get diagnostics v_deleted=row_count;
    if v_deleted=1 then
      delete from platform.work_responsibilities
      where tenant_id=v_capture.tenant_id and work_kind='task' and work_id=v_action.target_id;
    end if;
$new_task_guard$);
  if replacement=definition then raise exception 'Task creation Undo guard was not found'; end if;
  execute replacement;
  if target is distinct from to_regprocedure('public.redream_ai_undo_action_core_pre_email(uuid)')
    or not exists(select 1 from pg_proc p where p.oid=target
      and md5(p.prosrc)='2ce689440904c71ecdc92e0451806005'
      and p.proowner=original_owner and p.proacl is not distinct from original_acl
      and p.proconfig is not distinct from original_config and p.prosecdef=original_definer) then
    raise exception 'Task creation Undo guard changed its canonical function contract';
  end if;
end;
$migration$;
