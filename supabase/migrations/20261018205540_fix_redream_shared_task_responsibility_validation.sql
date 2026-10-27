
create or replace function private.redream_ai_sync_task_responsibility()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ids uuid[] := '{}'::uuid[];
  v_actor uuid;
  v_owner uuid;
  v_payload jsonb := coalesce(new.resolved_payload,'{}'::jsonb);
begin
  if new.action_type<>'create_task'
     or new.status<>'applied'
     or new.target_id is null
     or jsonb_typeof(v_payload->'responsible_user_ids')<>'array'
  then
    return new;
  end if;

  begin
    select coalesce(array_agg(x.id order by x.first_ord),'{}'::uuid[])
    into v_ids
    from (
      select (e.value)::uuid as id,min(e.ord) as first_ord
      from jsonb_array_elements_text(v_payload->'responsible_user_ids')
           with ordinality as e(value,ord)
      group by e.value
    ) x;
  exception when invalid_text_representation then
    raise exception 'Invalid task responsibility';
  end;

  if cardinality(v_ids)=0 then return new; end if;

  select c.submitted_by into v_actor
  from djm_os.captures c
  where c.id=new.capture_id and c.tenant_id=new.tenant_id;

  if v_actor is null then raise exception 'Capture owner not found'; end if;

  if exists (
    select 1
    from unnest(v_ids) as responsible(user_id)
    where not exists (
      select 1
      from platform.tenant_memberships m
      join djm_os.team_members tm on tm.user_id=m.user_id
      where m.tenant_id=new.tenant_id
        and m.user_id=responsible.user_id
        and m.status='active'
        and tm.is_active
    )
  ) then
    raise exception 'Task responsible person is no longer an active agency member';
  end if;

  begin
    v_owner:=nullif(v_payload->>'owner_user_id','')::uuid;
  exception when invalid_text_representation then
    raise exception 'Invalid task owner';
  end;
  v_owner:=coalesce(v_owner,v_ids[1]);

  if not (v_owner=any(v_ids)) then
    raise exception 'Task owner must be one of the responsible people';
  end if;

  update djm_os.tasks
  set owner_user_id=v_owner,
      updated_at=now()
  where id=new.target_id and tenant_id=new.tenant_id;

  if not found then raise exception 'Task target not found'; end if;

  insert into platform.work_responsibilities(
    tenant_id,work_kind,work_id,responsible_user_ids,revision,updated_by
  )
  values (
    new.tenant_id,'task',new.target_id,v_ids,1,v_actor
  )
  on conflict (tenant_id,work_kind,work_id)
  do update
  set responsible_user_ids=excluded.responsible_user_ids,
      revision=case
        when platform.work_responsibilities.responsible_user_ids
             is distinct from excluded.responsible_user_ids
          then platform.work_responsibilities.revision+1
        else platform.work_responsibilities.revision
      end,
      updated_by=excluded.updated_by,
      updated_at=case
        when platform.work_responsibilities.responsible_user_ids
             is distinct from excluded.responsible_user_ids
          then now()
        else platform.work_responsibilities.updated_at
      end;

  select to_jsonb(t) into new.after_json
  from djm_os.tasks t
  where t.id=new.target_id and t.tenant_id=new.tenant_id;

  new.verification_json:=coalesce(new.verification_json,'{}'::jsonb)
    || jsonb_build_object(
      'responsible_user_ids',to_jsonb(v_ids),
      'responsibility_synced',true
    );

  return new;
end;
$$;

