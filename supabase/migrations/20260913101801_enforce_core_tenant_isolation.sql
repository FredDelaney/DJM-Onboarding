-- Phase 2: trusted tenant assignment and row-level isolation for core operational data.
-- Staging first. Production remains untouched.

create or replace function private.user_has_active_tenant_membership(
  p_tenant_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_tenant_id is not null
    and p_user_id is not null
    and exists (
      select 1
      from platform.tenant_memberships m
      join platform.tenants t
        on t.id = m.tenant_id
       and t.status = 'active'
      where m.tenant_id = p_tenant_id
        and m.user_id = p_user_id
        and m.status = 'active'
    );
$$;

create or replace function private.user_has_staff_tenant_access(
  p_tenant_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_tenant_id is not null
    and p_user_id is not null
    and exists (
      select 1
      from platform.tenant_memberships m
      join platform.tenants t
        on t.id = m.tenant_id
       and t.status = 'active'
      where m.tenant_id = p_tenant_id
        and m.user_id = p_user_id
        and m.status = 'active'
        and m.role in ('owner','admin','agent','operations','scout')
    );
$$;

create or replace function private.user_is_tenant_admin(
  p_tenant_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_tenant_id is not null
    and p_user_id is not null
    and exists (
      select 1
      from platform.tenant_memberships m
      join platform.tenants t
        on t.id = m.tenant_id
       and t.status = 'active'
      where m.tenant_id = p_tenant_id
        and m.user_id = p_user_id
        and m.status = 'active'
        and m.role in ('owner','admin')
    );
$$;

create or replace function private.primary_active_tenant_id(
  p_user_id uuid default auth.uid()
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_primary integer := 0;
  v_tenant_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  select count(*), count(*) filter (where m.is_primary)
    into v_total, v_primary
  from platform.tenant_memberships m
  join platform.tenants t
    on t.id = m.tenant_id
   and t.status = 'active'
  where m.user_id = p_user_id
    and m.status = 'active';

  if v_primary = 1 then
    select m.tenant_id
      into v_tenant_id
    from platform.tenant_memberships m
    join platform.tenants t
      on t.id = m.tenant_id
     and t.status = 'active'
    where m.user_id = p_user_id
      and m.status = 'active'
      and m.is_primary
    limit 1;
    return v_tenant_id;
  end if;

  if v_total = 1 then
    select m.tenant_id
      into v_tenant_id
    from platform.tenant_memberships m
    join platform.tenants t
      on t.id = m.tenant_id
     and t.status = 'active'
    where m.user_id = p_user_id
      and m.status = 'active'
    limit 1;
    return v_tenant_id;
  end if;

  return null;
end;
$$;

create or replace function private.merge_tenant_candidate(
  p_current uuid,
  p_candidate uuid,
  p_source text
)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_candidate is null then
    return p_current;
  end if;

  if p_current is null then
    return p_candidate;
  end if;

  if p_current <> p_candidate then
    raise exception 'Cross-tenant reference rejected (%).', coalesce(p_source,'unknown')
      using errcode = '23514';
  end if;

  return p_current;
end;
$$;

revoke all on function private.user_has_active_tenant_membership(uuid, uuid) from public;
revoke all on function private.user_has_staff_tenant_access(uuid, uuid) from public;
revoke all on function private.user_is_tenant_admin(uuid, uuid) from public;
revoke all on function private.primary_active_tenant_id(uuid) from public;
grant execute on function private.user_has_active_tenant_membership(uuid, uuid) to authenticated, service_role;
grant execute on function private.user_has_staff_tenant_access(uuid, uuid) to authenticated, service_role;
grant execute on function private.user_is_tenant_admin(uuid, uuid) to authenticated, service_role;
grant execute on function private.primary_active_tenant_id(uuid) to authenticated, service_role;

create or replace function private.assign_core_operational_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_tenant uuid := new.tenant_id;
  v_candidate uuid;
  v_id uuid;
  v_user_id uuid;
begin
  if tg_op = 'UPDATE' and old.tenant_id is distinct from new.tenant_id then
    raise exception 'Tenant ownership is immutable.' using errcode = '23514';
  end if;

  if tg_table_schema = 'public' and tg_table_name = 'players' then
    if v_tenant is null then
      v_tenant := private.primary_active_tenant_id(auth.uid());
    end if;

    if v_tenant is null then
      v_user_id := nullif(v_row->>'primary_staff_user_id','')::uuid;
      v_tenant := private.primary_active_tenant_id(v_user_id);
    end if;

    if v_tenant is null then
      v_user_id := nullif(v_row->>'user_id','')::uuid;
      v_tenant := private.primary_active_tenant_id(v_user_id);
    end if;

    v_user_id := nullif(v_row->>'primary_staff_user_id','')::uuid;
    if v_user_id is not null
       and not private.user_has_staff_tenant_access(v_tenant, v_user_id) then
      raise exception 'Primary staff user is not an active staff member of this tenant.'
        using errcode = '23514';
    end if;

  elsif tg_table_schema = 'public' and tg_table_name = 'player_opportunities' then
    v_id := nullif(v_row->>'player_id','')::uuid;
    select p.tenant_id into v_candidate from public.players p where p.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'player');

  elsif tg_table_schema = 'djm_os' and tg_table_name = 'contact_methods' then
    v_id := nullif(v_row->>'person_id','')::uuid;
    select p.tenant_id into v_candidate from djm_os.people p where p.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'person');

  elsif tg_table_schema = 'djm_os' and tg_table_name = 'relationships' then
    v_id := nullif(v_row->>'person_id','')::uuid;
    select p.tenant_id into v_candidate from djm_os.people p where p.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'person');

    v_user_id := nullif(v_row->>'team_member_id','')::uuid;
    if v_tenant is null then
      v_tenant := private.primary_active_tenant_id(v_user_id);
    end if;
    if v_user_id is not null
       and not private.user_has_staff_tenant_access(v_tenant, v_user_id) then
      raise exception 'Team member is not active in this tenant.' using errcode = '23514';
    end if;

  elsif tg_table_schema = 'djm_os' and tg_table_name = 'interactions' then
    v_id := nullif(v_row->>'person_id','')::uuid;
    select p.tenant_id into v_candidate from djm_os.people p where p.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'person');

    v_id := nullif(v_row->>'organisation_id','')::uuid;
    select o.tenant_id into v_candidate from djm_os.organisations o where o.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'organisation');

    v_user_id := nullif(v_row->>'team_member_id','')::uuid;
    if v_tenant is null then
      v_tenant := private.primary_active_tenant_id(v_user_id);
    end if;
    if v_user_id is not null
       and not private.user_has_staff_tenant_access(v_tenant, v_user_id) then
      raise exception 'Team member is not active in this tenant.' using errcode = '23514';
    end if;

  elsif tg_table_schema = 'djm_os' and tg_table_name = 'club_needs' then
    v_id := nullif(v_row->>'organisation_id','')::uuid;
    select o.tenant_id into v_candidate from djm_os.organisations o where o.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'organisation');

    v_id := nullif(v_row->>'source_person_id','')::uuid;
    select p.tenant_id into v_candidate from djm_os.people p where p.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'source_person');

    v_id := nullif(v_row->>'source_interaction_id','')::uuid;
    select i.tenant_id into v_candidate from djm_os.interactions i where i.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'source_interaction');

    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_tenant is null then
      v_tenant := private.primary_active_tenant_id(v_user_id);
    end if;
    if v_user_id is not null
       and not private.user_has_staff_tenant_access(v_tenant, v_user_id) then
      raise exception 'Owner is not active staff in this tenant.' using errcode = '23514';
    end if;

  elsif tg_table_schema = 'djm_os' and tg_table_name = 'player_matches' then
    v_id := nullif(v_row->>'club_need_id','')::uuid;
    select n.tenant_id into v_candidate from djm_os.club_needs n where n.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'club_need');

    v_id := nullif(v_row->>'player_id','')::uuid;
    select p.tenant_id into v_candidate from public.players p where p.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'player');

  elsif tg_table_schema = 'djm_os' and tg_table_name = 'tasks' then
    v_id := nullif(v_row->>'person_id','')::uuid;
    select p.tenant_id into v_candidate from djm_os.people p where p.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'person');

    v_id := nullif(v_row->>'organisation_id','')::uuid;
    select o.tenant_id into v_candidate from djm_os.organisations o where o.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'organisation');

    v_id := nullif(v_row->>'player_id','')::uuid;
    select p.tenant_id into v_candidate from public.players p where p.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'player');

    v_id := nullif(v_row->>'interaction_id','')::uuid;
    select i.tenant_id into v_candidate from djm_os.interactions i where i.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'interaction');

    v_id := nullif(v_row->>'club_need_id','')::uuid;
    select n.tenant_id into v_candidate from djm_os.club_needs n where n.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'club_need');

    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_tenant is null then
      v_tenant := private.primary_active_tenant_id(v_user_id);
    end if;
    if v_user_id is not null
       and not private.user_has_staff_tenant_access(v_tenant, v_user_id) then
      raise exception 'Owner is not active staff in this tenant.' using errcode = '23514';
    end if;

  elsif tg_table_schema = 'djm_os' and tg_table_name = 'meetings' then
    v_id := nullif(v_row->>'person_id','')::uuid;
    select p.tenant_id into v_candidate from djm_os.people p where p.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'person');

    v_id := nullif(v_row->>'organisation_id','')::uuid;
    select o.tenant_id into v_candidate from djm_os.organisations o where o.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'organisation');

    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_tenant is null then
      v_tenant := private.primary_active_tenant_id(v_user_id);
    end if;
    if v_user_id is not null
       and not private.user_has_staff_tenant_access(v_tenant, v_user_id) then
      raise exception 'Owner is not active staff in this tenant.' using errcode = '23514';
    end if;

  elsif tg_table_schema = 'djm_os' and tg_table_name = 'captures' then
    v_id := nullif(v_row->>'person_id','')::uuid;
    select p.tenant_id into v_candidate from djm_os.people p where p.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'person');

    v_id := nullif(v_row->>'organisation_id','')::uuid;
    select o.tenant_id into v_candidate from djm_os.organisations o where o.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'organisation');

    v_id := nullif(v_row->>'player_id','')::uuid;
    select p.tenant_id into v_candidate from public.players p where p.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'player');

    v_id := nullif(v_row->>'parent_capture_id','')::uuid;
    select c.tenant_id into v_candidate from djm_os.captures c where c.id = v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant, v_candidate, 'parent_capture');

    v_user_id := nullif(v_row->>'submitted_by','')::uuid;
    if v_tenant is null then
      v_tenant := private.primary_active_tenant_id(v_user_id);
    end if;
    if v_user_id is not null
       and not private.user_has_staff_tenant_access(v_tenant, v_user_id) then
      raise exception 'Capture submitter is not active staff in this tenant.' using errcode = '23514';
    end if;
  end if;

  if v_tenant is null then
    v_tenant := private.primary_active_tenant_id(auth.uid());
  end if;

  if v_tenant is null then
    raise exception 'Trusted tenant context is required for %.%', tg_table_schema, tg_table_name
      using errcode = '23514';
  end if;

  new.tenant_id := v_tenant;
  return new;
end;
$$;

-- Install assignment/integrity trigger on every core tenant-owned table.
do $migration$
declare
  r record;
begin
  for r in
    select * from (values
      ('public','players'),
      ('public','player_opportunities'),
      ('djm_os','people'),
      ('djm_os','organisations'),
      ('djm_os','contact_methods'),
      ('djm_os','relationships'),
      ('djm_os','interactions'),
      ('djm_os','club_needs'),
      ('djm_os','player_matches'),
      ('djm_os','tasks'),
      ('djm_os','meetings'),
      ('djm_os','captures')
    ) as x(schema_name, table_name)
  loop
    execute format('drop trigger if exists assign_core_operational_tenant on %I.%I', r.schema_name, r.table_name);
    execute format(
      'create trigger assign_core_operational_tenant before insert or update on %I.%I for each row execute function private.assign_core_operational_tenant()',
      r.schema_name,
      r.table_name
    );
    execute format('alter table %I.%I alter column tenant_id set not null', r.schema_name, r.table_name);
  end loop;
end
$migration$;

-- Staff-facing DJM OS tables become tenant-scoped instead of globally DJM-team scoped.
do $policies$
declare
  r record;
begin
  for r in
    select * from (values
      ('djm_os','people'),
      ('djm_os','organisations'),
      ('djm_os','contact_methods'),
      ('djm_os','relationships'),
      ('djm_os','interactions'),
      ('djm_os','club_needs'),
      ('djm_os','player_matches'),
      ('djm_os','tasks'),
      ('djm_os','meetings'),
      ('djm_os','captures')
    ) as x(schema_name, table_name)
  loop
    execute format('drop policy if exists djm_team_select on %I.%I', r.schema_name, r.table_name);
    execute format('drop policy if exists djm_team_insert on %I.%I', r.schema_name, r.table_name);
    execute format('drop policy if exists djm_team_update on %I.%I', r.schema_name, r.table_name);
    execute format('drop policy if exists djm_team_delete on %I.%I', r.schema_name, r.table_name);

    execute format(
      'create policy tenant_staff_select on %I.%I for select to authenticated using (private.user_has_staff_tenant_access(tenant_id))',
      r.schema_name, r.table_name
    );
    execute format(
      'create policy tenant_staff_insert on %I.%I for insert to authenticated with check (private.user_has_staff_tenant_access(tenant_id))',
      r.schema_name, r.table_name
    );
    execute format(
      'create policy tenant_staff_update on %I.%I for update to authenticated using (private.user_has_staff_tenant_access(tenant_id)) with check (private.user_has_staff_tenant_access(tenant_id))',
      r.schema_name, r.table_name
    );
    execute format(
      'create policy tenant_staff_delete on %I.%I for delete to authenticated using (private.user_has_staff_tenant_access(tenant_id))',
      r.schema_name, r.table_name
    );
  end loop;
end
$policies$;

-- Player self-access remains valid, while staff access is now tenant-bound.
create or replace function private.can_staff_view_player(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players p
    where p.id = target_player_id
      and (
        private.user_is_tenant_admin(p.tenant_id)
        or (
          private.user_has_staff_tenant_access(p.tenant_id)
          and exists (
            select 1
            from public.staff_player_access a
            where a.player_id = p.id
              and a.staff_user_id = auth.uid()
          )
        )
      )
  );
$$;

create or replace function private.can_staff_edit_player(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players p
    where p.id = target_player_id
      and (
        private.user_is_tenant_admin(p.tenant_id)
        or (
          private.user_has_staff_tenant_access(p.tenant_id)
          and exists (
            select 1
            from public.staff_player_access a
            where a.player_id = p.id
              and a.staff_user_id = auth.uid()
              and a.can_edit = true
          )
        )
      )
  );
$$;

create or replace function private.can_view_player(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players p
    where p.id = target_player_id
      and (
        p.user_id = auth.uid()
        or private.can_staff_view_player(p.id)
      )
  );
$$;

create or replace function private.can_edit_player(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players p
    where p.id = target_player_id
      and (
        p.user_id = auth.uid()
        or private.can_staff_edit_player(p.id)
      )
  );
$$;

-- Replace global-admin player create/delete with tenant-admin create/delete.
drop policy if exists "admins create players" on public.players;
create policy "tenant admins create players"
on public.players
for insert
to authenticated
with check (private.user_is_tenant_admin(tenant_id));

drop policy if exists "admins delete players" on public.players;
create policy "tenant admins delete players"
on public.players
for delete
to authenticated
using (private.user_is_tenant_admin(tenant_id));

-- Keep opportunity policies but make tenant ownership structurally mandatory via the trigger.
comment on function private.assign_core_operational_tenant() is
  'Assigns immutable tenant ownership from trusted membership or related records and rejects cross-tenant references.';;
