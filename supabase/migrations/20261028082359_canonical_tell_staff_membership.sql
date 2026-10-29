-- Remove unrelated global team prerequisites from the existing Tell task path.
-- Preserve scoped AI permission, tenant staff roles, approval, matcher and Undo.
-- Keep actor/owner identities tied to auth users, not a legacy global staff row.
do $migration$
declare
 targets jsonb := '[
  {
    "signature": "private.redream_ai_sync_task_responsibility()",
    "source_hash": "8fdce43688adbaca651359b2441f2b34",
    "new_hash": "da8e108d9f867148055c3828437192d4",
    "prosecdef": true,
    "provolatile": "v",
    "acl": null
  },
  {
    "signature": "public.redream_ai_approve_capture(uuid)",
    "source_hash": "96e9737dae1206f5d2ec1c7708c6b2d0",
    "new_hash": "63db499ca33fc9b3fa892b21b37a9196",
    "prosecdef": true,
    "provolatile": "v",
    "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}"
  },
  {
    "signature": "public.redream_ai_resolve_team_member(uuid,text)",
    "source_hash": "56f154d95c0f71d53e080789ca7436c0",
    "new_hash": "5ba91e3bbd2e0a59d61d4df5c934e472",
    "prosecdef": true,
    "provolatile": "s",
    "acl": "{postgres=X/postgres,service_role=X/postgres}"
  },
  {
    "signature": "public.redream_ai_task_context(uuid)",
    "source_hash": "1dbc8c0cb8595276f1833661f9b6a14a",
    "new_hash": "35bcdad6c96c17791ae060301da17158",
    "prosecdef": true,
    "provolatile": "s",
    "acl": "{postgres=X/postgres,service_role=X/postgres}"
  },
  {
    "signature": "public.redream_ai_user_can_process(uuid,uuid)",
    "source_hash": "191a1fdd1857e0f8c044bef69f256339",
    "new_hash": "207aca5ef6414ec03d432d58326acba4",
    "prosecdef": false,
    "provolatile": "s",
    "acl": "{postgres=X/postgres,service_role=X/postgres}"
  }
]'::jsonb;
 item jsonb; target oid; definition text; snapshot jsonb; original jsonb := '{}'::jsonb;
 helper_snapshot jsonb; trigger_snapshot jsonb; identity_fk record; user_column smallint;
 fk jsonb; fk_table regclass; table_snapshots jsonb := '{}'::jsonb; other_constraints jsonb := '{}'::jsonb; orphan_found boolean;
 fk_targets jsonb := '[
  {"table":"djm_os.tell_djm_permissions","column":"user_id","name":"tell_djm_permissions_user_id_fkey","delete":"CASCADE","code":"c"},
  {"table":"djm_os.tasks","column":"owner_user_id","name":"tasks_owner_user_id_fkey","delete":"SET NULL","code":"n"},
  {"table":"djm_os.events","column":"actor_user_id","name":"events_actor_user_id_fkey","delete":"SET NULL","code":"n"},
  {"table":"djm_os.review_items","column":"owner_user_id","name":"review_items_owner_user_id_fkey","delete":"SET NULL","code":"n"},
  {"table":"djm_os.notifications","column":"user_id","name":"notifications_user_id_fkey","delete":"CASCADE","code":"c"},
  {"table":"djm_os.tell_djm_aliases","column":"owner_user_id","name":"tell_djm_aliases_owner_user_id_fkey","delete":"CASCADE","code":"c"}
 ]'::jsonb;
begin
 perform set_config('lock_timeout','5s',true);
 perform set_config('statement_timeout','30s',true);
 select to_jsonb(p) into helper_snapshot from pg_proc p
 where p.oid=to_regprocedure('private.user_has_staff_tenant_access(uuid,uuid)');
 if helper_snapshot is null or md5(helper_snapshot->>'prosrc')<>'18cf9a31b7e202e28785e12972525cda'
    or pg_get_userbyid((helper_snapshot->>'proowner')::oid)<>'postgres'
    or (select proacl::text from pg_proc where oid=to_regprocedure('private.user_has_staff_tenant_access(uuid,uuid)')) is distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
    or not (helper_snapshot->>'prosecdef')::boolean
    or helper_snapshot->>'provolatile'<>'s'
    or helper_snapshot->'proconfig' is distinct from '["search_path=\"\""]'::jsonb
 then raise exception 'Canonical agency staff access helper differs from the reviewed baseline';end if;
 select to_jsonb(t) into trigger_snapshot from pg_trigger t
 where t.tgrelid='djm_os.tell_djm_actions'::regclass and t.tgname='redream_ai_sync_task_responsibility';
 if trigger_snapshot is not null and (
  (trigger_snapshot->>'tgfoid')::oid is distinct from to_regprocedure('private.redream_ai_sync_task_responsibility()')::oid
  or (trigger_snapshot->>'tgtype')::integer<>23 or trigger_snapshot->>'tgenabled'<>'O'
  or (trigger_snapshot->>'tgnargs')::integer<>0 or (trigger_snapshot->>'tgisinternal')::boolean
 ) then raise exception 'Tell responsibility trigger differs from the reviewed baseline';end if;
 for fk in select value from jsonb_array_elements(fk_targets) loop
  fk_table:=(fk->>'table')::regclass;
  table_snapshots:=table_snapshots||jsonb_build_object(fk->>'table',(select jsonb_build_object('owner',relowner,'acl',relacl,'rls',relrowsecurity,'force_rls',relforcerowsecurity) from pg_class where oid=fk_table));
  other_constraints:=other_constraints||jsonb_build_object(fk->>'table',(select coalesce(jsonb_agg(to_jsonb(c) order by c.oid),'[]'::jsonb) from pg_constraint c where c.conrelid=fk_table and c.conname<>fk->>'name'));
  select attnum into user_column from pg_attribute where attrelid=fk_table and attname=fk->>'column' and not attisdropped;
  select * into identity_fk from pg_constraint where conrelid=fk_table and conname=fk->>'name';
  if not found or identity_fk.contype<>'f' or not identity_fk.convalidated
   or identity_fk.condeferrable or identity_fk.condeferred or identity_fk.confdeltype::text<>fk->>'code'
   or identity_fk.confupdtype<>'a' or identity_fk.confmatchtype<>'s' or identity_fk.conkey<>array[user_column]
   or not (
    (identity_fk.confrelid='djm_os.team_members'::regclass and identity_fk.confkey=array[(select attnum from pg_attribute where attrelid='djm_os.team_members'::regclass and attname='user_id')])
    or (identity_fk.confrelid='auth.users'::regclass and identity_fk.confkey=array[(select attnum from pg_attribute where attrelid='auth.users'::regclass and attname='id')])
   ) then raise exception 'Tell identity FK differs from the reviewed baseline: %',fk->>'name';end if;
  execute format('select exists(select 1 from %s p where p.%I is not null and not exists(select 1 from auth.users u where u.id=p.%I))',fk_table,fk->>'column',fk->>'column') into strict orphan_found;
  if orphan_found then raise exception 'Tell records contain a user without a canonical auth identity: %',fk->>'name';end if;
  if exists(select 1 from pg_constraint where conrelid=fk_table and conname='redream_auth_identity_guard')
  then raise exception 'Tell identity repair name is already in use';end if;
 end loop;
 -- Check every target before changing any function, including an already-fixed one.
 for item in select value from jsonb_array_elements(targets) loop
  target:=to_regprocedure(item->>'signature');
  select to_jsonb(p) into snapshot from pg_proc p where p.oid=target;
  if snapshot is null
   or pg_get_userbyid((snapshot->>'proowner')::oid)<>'postgres'
   or (snapshot->>'prosecdef')::boolean is distinct from (item->>'prosecdef')::boolean
   or snapshot->>'provolatile' is distinct from item->>'provolatile'
   or snapshot->'proconfig' is distinct from '["search_path=\"\""]'::jsonb
   or (select proacl::text from pg_proc where oid=target) is distinct from item->>'acl'
   or md5(snapshot->>'prosrc') not in (item->>'source_hash',item->>'new_hash')
  then raise exception 'Tell staff contract differs from the reviewed baseline: %',item->>'signature';end if;
  original:=original||jsonb_build_object(item->>'signature',snapshot-'prosrc');
 end loop;
 -- Validate each canonical identity FK before removing its legacy staff FK.
 for fk in select value from jsonb_array_elements(fk_targets) loop
  fk_table:=(fk->>'table')::regclass;
  if (select confrelid from pg_constraint where conrelid=fk_table and conname=fk->>'name')='djm_os.team_members'::regclass then
   execute format('alter table %s add constraint redream_auth_identity_guard foreign key(%I) references auth.users(id) on delete %s not valid',fk_table,fk->>'column',fk->>'delete');
   execute format('alter table %s validate constraint redream_auth_identity_guard',fk_table);
   execute format('alter table %s drop constraint %I',fk_table,fk->>'name');
   execute format('alter table %s rename constraint redream_auth_identity_guard to %I',fk_table,fk->>'name');
  end if;
 end loop;
 for item in select value from jsonb_array_elements(targets) loop
  target:=to_regprocedure(item->>'signature');
  if (select md5(prosrc) from pg_proc where oid=target)=item->>'new_hash' then continue;end if;
  definition:=pg_get_functiondef(target);
  if item->>'signature'='private.redream_ai_sync_task_responsibility()' then
   if (length(definition)-length(replace(definition,$old_0_0$array_agg(x.id order by x.first_ord)$old_0_0$,'')))/length($old_0_0$array_agg(x.id order by x.first_ord)$old_0_0$)<>1 then raise exception 'Reviewed Tell staff fragment is missing';end if;
   definition:=replace(definition,$old_0_0$array_agg(x.id order by x.first_ord)$old_0_0$,$new_0_0$array_agg(x.id order by x.id)$new_0_0$);
   if (length(definition)-length(replace(definition,$old_0_1$group by e.value$old_0_1$,'')))/length($old_0_1$group by e.value$old_0_1$)<>1 then raise exception 'Reviewed Tell staff fragment is missing';end if;
   definition:=replace(definition,$old_0_1$group by e.value$old_0_1$,$new_0_1$group by (e.value)::uuid$new_0_1$);
   if (length(definition)-length(replace(definition,$old_0_2$    where not exists (
      select 1
      from platform.tenant_memberships m
      join djm_os.team_members tm on tm.user_id=m.user_id
      where m.tenant_id=new.tenant_id
        and m.user_id=responsible.user_id
        and m.status='active'
        and tm.is_active
    )$old_0_2$,'')))/length($old_0_2$    where not exists (
      select 1
      from platform.tenant_memberships m
      join djm_os.team_members tm on tm.user_id=m.user_id
      where m.tenant_id=new.tenant_id
        and m.user_id=responsible.user_id
        and m.status='active'
        and tm.is_active
    )$old_0_2$)<>1 then raise exception 'Reviewed Tell staff fragment is missing';end if;
   definition:=replace(definition,$old_0_2$    where not exists (
      select 1
      from platform.tenant_memberships m
      join djm_os.team_members tm on tm.user_id=m.user_id
      where m.tenant_id=new.tenant_id
        and m.user_id=responsible.user_id
        and m.status='active'
        and tm.is_active
    )$old_0_2$,$new_0_2$    where not private.user_has_staff_tenant_access(new.tenant_id,responsible.user_id)$new_0_2$);
  elsif item->>'signature'='public.redream_ai_approve_capture(uuid)' then
   if (length(definition)-length(replace(definition,$old_1_0$array_agg(distinct value::uuid)$old_1_0$,'')))/length($old_1_0$array_agg(distinct value::uuid)$old_1_0$)<>1 then raise exception 'Reviewed Tell staff fragment is missing';end if;
   definition:=replace(definition,$old_1_0$array_agg(distinct value::uuid)$old_1_0$,$new_1_0$array_agg(distinct value::uuid order by value::uuid)$new_1_0$);
   if (length(definition)-length(replace(definition,$old_1_1$            updated_at=now();
      end if;

      update djm_os.tell_djm_actions a$old_1_1$,'')))/length($old_1_1$            updated_at=now();
      end if;

      update djm_os.tell_djm_actions a$old_1_1$)<>1 then raise exception 'Reviewed Tell staff fragment is missing';end if;
   definition:=replace(definition,$old_1_1$            updated_at=now();
      end if;

      update djm_os.tell_djm_actions a$old_1_1$,$new_1_1$            updated_at=now()
        where platform.work_responsibilities.responsible_user_ids is distinct from excluded.responsible_user_ids;
      end if;

      update djm_os.tell_djm_actions a$new_1_1$);
   if (length(definition)-length(replace(definition,$old_1_2$v_owner is not null and not exists (
        select 1
        from platform.tenant_memberships m
        join djm_os.team_members tm on tm.user_id=m.user_id
        where m.tenant_id=v_tenant
          and m.user_id=v_owner
          and m.status='active'
          and tm.is_active
      )$old_1_2$,'')))/length($old_1_2$v_owner is not null and not exists (
        select 1
        from platform.tenant_memberships m
        join djm_os.team_members tm on tm.user_id=m.user_id
        where m.tenant_id=v_tenant
          and m.user_id=v_owner
          and m.status='active'
          and tm.is_active
      )$old_1_2$)<>1 then raise exception 'Reviewed Tell staff fragment is missing';end if;
   definition:=replace(definition,$old_1_2$v_owner is not null and not exists (
        select 1
        from platform.tenant_memberships m
        join djm_os.team_members tm on tm.user_id=m.user_id
        where m.tenant_id=v_tenant
          and m.user_id=v_owner
          and m.status='active'
          and tm.is_active
      )$old_1_2$,$new_1_2$v_owner is not null and not private.user_has_staff_tenant_access(v_tenant,v_owner)$new_1_2$);
   if (length(definition)-length(replace(definition,$old_1_3$        where not exists (
          select 1
          from platform.tenant_memberships m
          join djm_os.team_members tm on tm.user_id=m.user_id
          where m.tenant_id=v_tenant
            and m.user_id=r.user_id
            and m.status='active'
            and tm.is_active
        )$old_1_3$,'')))/length($old_1_3$        where not exists (
          select 1
          from platform.tenant_memberships m
          join djm_os.team_members tm on tm.user_id=m.user_id
          where m.tenant_id=v_tenant
            and m.user_id=r.user_id
            and m.status='active'
            and tm.is_active
        )$old_1_3$)<>1 then raise exception 'Reviewed Tell staff fragment is missing';end if;
   definition:=replace(definition,$old_1_3$        where not exists (
          select 1
          from platform.tenant_memberships m
          join djm_os.team_members tm on tm.user_id=m.user_id
          where m.tenant_id=v_tenant
            and m.user_id=r.user_id
            and m.status='active'
            and tm.is_active
        )$old_1_3$,$new_1_3$        where not private.user_has_staff_tenant_access(v_tenant,r.user_id)$new_1_3$);
  elsif item->>'signature'='public.redream_ai_resolve_team_member(uuid,text)' then
   if (length(definition)-length(replace(definition,$old_2_0$join djm_os.team_members tm on tm.user_id=m.user_id$old_2_0$,'')))/length($old_2_0$join djm_os.team_members tm on tm.user_id=m.user_id$old_2_0$)<>5 then raise exception 'Reviewed Tell staff fragment is missing';end if;
   definition:=replace(definition,$old_2_0$join djm_os.team_members tm on tm.user_id=m.user_id$old_2_0$,$new_2_0$left join djm_os.team_members tm on tm.user_id=m.user_id
    left join public.profiles profile on profile.id=m.user_id$new_2_0$);
   if (length(definition)-length(replace(definition,$old_2_1$select m.user_id,tm.display_name$old_2_1$,'')))/length($old_2_1$select m.user_id,tm.display_name$old_2_1$)<>4 then raise exception 'Reviewed Tell staff fragment is missing';end if;
   definition:=replace(definition,$old_2_1$select m.user_id,tm.display_name$old_2_1$,$new_2_1$select m.user_id,tm.display_name as display_name$new_2_1$);
   if (length(definition)-length(replace(definition,$old_2_2$tm.display_name$old_2_2$,'')))/length($old_2_2$tm.display_name$old_2_2$)<>14 then raise exception 'Reviewed Tell staff fragment is missing';end if;
   definition:=replace(definition,$old_2_2$tm.display_name$old_2_2$,$new_2_2$coalesce(nullif(trim(tm.display_name),''),nullif(trim(profile.display_name),''))$new_2_2$);
   if (length(definition)-length(replace(definition,$old_2_3$and tm.is_active$old_2_3$,'')))/length($old_2_3$and tm.is_active$old_2_3$)<>5 then raise exception 'Reviewed Tell staff fragment is missing';end if;
   definition:=replace(definition,$old_2_3$and tm.is_active$old_2_3$,$new_2_3$$new_2_3$);
  elsif item->>'signature'='public.redream_ai_task_context(uuid)' then
   if (length(definition)-length(replace(definition,$old_3_0$(select tm.display_name from djm_os.team_members tm where tm.user_id=t.owner_user_id limit 1)$old_3_0$,'')))/length($old_3_0$(select tm.display_name from djm_os.team_members tm where tm.user_id=t.owner_user_id limit 1)$old_3_0$)<>2 then raise exception 'Reviewed Tell staff fragment is missing';end if;
   definition:=replace(definition,$old_3_0$(select tm.display_name from djm_os.team_members tm where tm.user_id=t.owner_user_id limit 1)$old_3_0$,$new_3_0$coalesce((select tm.display_name from djm_os.team_members tm where tm.user_id=t.owner_user_id limit 1),(select p.display_name from public.profiles p where p.id=t.owner_user_id and private.user_has_staff_tenant_access(t.tenant_id,p.id)))$new_3_0$);
  elsif item->>'signature'='public.redream_ai_user_can_process(uuid,uuid)' then
   if (length(definition)-length(replace(definition,$old_4_0$    left join djm_os.team_members tm on tm.user_id=c.submitted_by
$old_4_0$,'')))/length($old_4_0$    left join djm_os.team_members tm on tm.user_id=c.submitted_by
$old_4_0$)<>1 then raise exception 'Reviewed Tell staff fragment is missing';end if;
   definition:=replace(definition,$old_4_0$    left join djm_os.team_members tm on tm.user_id=c.submitted_by
$old_4_0$,$new_4_0$$new_4_0$);
   if (length(definition)-length(replace(definition,$old_4_1$      and tm.is_active=true
$old_4_1$,'')))/length($old_4_1$      and tm.is_active=true
$old_4_1$)<>1 then raise exception 'Reviewed Tell staff fragment is missing';end if;
   definition:=replace(definition,$old_4_1$      and tm.is_active=true
$old_4_1$,$new_4_1$$new_4_1$);
  end if;
  execute definition;
  select to_jsonb(p) into snapshot from pg_proc p where p.oid=target;
  if snapshot-'prosrc' is distinct from original->(item->>'signature')
    or md5(snapshot->>'prosrc')<>item->>'new_hash'
    or target is distinct from to_regprocedure(item->>'signature')
  then raise exception 'Tell staff repair changed function metadata: %',item->>'signature';end if;
 end loop;
 for fk in select value from jsonb_array_elements(fk_targets) loop
  fk_table:=(fk->>'table')::regclass;
  if table_snapshots->(fk->>'table') is distinct from (select jsonb_build_object('owner',relowner,'acl',relacl,'rls',relrowsecurity,'force_rls',relforcerowsecurity) from pg_class where oid=fk_table)
   or other_constraints->(fk->>'table') is distinct from (select coalesce(jsonb_agg(to_jsonb(c) order by c.oid),'[]'::jsonb) from pg_constraint c where c.conrelid=fk_table and c.conname<>fk->>'name')
   or not exists(select 1 from pg_constraint where conrelid=fk_table and conname=fk->>'name' and contype='f' and confrelid='auth.users'::regclass and convalidated and confdeltype::text=fk->>'code')
  then raise exception 'Tell identity repair changed its table contract: %',fk->>'table';end if;
 end loop;
 if trigger_snapshot is distinct from (select to_jsonb(t) from pg_trigger t where t.tgrelid='djm_os.tell_djm_actions'::regclass and t.tgname='redream_ai_sync_task_responsibility')
 then raise exception 'Tell staff repair changed the responsibility trigger';end if;
 if helper_snapshot is distinct from (select to_jsonb(p) from pg_proc p where p.oid=to_regprocedure('private.user_has_staff_tenant_access(uuid,uuid)'))
 then raise exception 'Tell staff repair changed the canonical access helper';end if;
end;
$migration$;
