-- Phase 3: tenant-scope Tell DJM support data and agency-private workspaces.
-- Staging only. Production remains untouched.

-- Existing staging business data predates SaaS and belongs to DJM.
do $migration$
declare
  v_djm_tenant_id uuid;
  r record;
  v_constraint_name text;
  v_index_name text;
begin
  select id into v_djm_tenant_id
  from platform.tenants
  where slug='djm-sports-management' and status='active'
  limit 1;

  if v_djm_tenant_id is null then
    raise exception 'Active DJM tenant not found; refusing workspace tenant backfill';
  end if;

  for r in
    select * from (values
      ('djm_os','tell_djm_permissions'),
      ('djm_os','tell_djm_actions'),
      ('djm_os','tell_djm_questions'),
      ('djm_os','tell_djm_aliases'),
      ('djm_os','claims'),
      ('djm_os','employments'),
      ('djm_os','events'),
      ('djm_os','review_items'),
      ('djm_os','notifications'),
      ('djm_os','scouting_prospects'),
      ('djm_os','recruitment_interactions'),
      ('djm_os','scouting_reports'),
      ('djm_os','scouting_watchlists'),
      ('djm_os','scouting_watchlist_entries'),
      ('djm_os','deal_rooms'),
      ('djm_os','market_signals'),
      ('djm_os','memories'),
      ('djm_os','suggestions'),
      ('djm_os','opportunity_links')
    ) as x(schema_name, table_name)
  loop
    execute format('alter table %I.%I add column if not exists tenant_id uuid', r.schema_name, r.table_name);
    execute format('update %I.%I set tenant_id=$1 where tenant_id is null', r.schema_name, r.table_name)
      using v_djm_tenant_id;

    v_constraint_name := r.table_name || '_tenant_id_fkey';
    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid=c.conrelid
      join pg_namespace n on n.oid=t.relnamespace
      where n.nspname=r.schema_name
        and t.relname=r.table_name
        and c.conname=v_constraint_name
    ) then
      execute format(
        'alter table %I.%I add constraint %I foreign key (tenant_id) references platform.tenants(id)',
        r.schema_name,r.table_name,v_constraint_name
      );
    end if;

    v_index_name := 'idx_' || r.table_name || '_tenant_id';
    execute format('create index if not exists %I on %I.%I (tenant_id)', v_index_name,r.schema_name,r.table_name);
    execute format('alter table %I.%I alter column tenant_id set not null', r.schema_name,r.table_name);
  end loop;
end
$migration$;

create or replace function private.workspace_entity_tenant(
  p_entity_type text,
  p_entity_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_tenant uuid;
begin
  if p_entity_id is null then return null; end if;

  case p_entity_type
    when 'club' then
      select tenant_id into v_tenant from djm_os.organisations where id=p_entity_id;
    when 'contact' then
      select tenant_id into v_tenant from djm_os.people where id=p_entity_id;
    when 'person' then
      select tenant_id into v_tenant from djm_os.people where id=p_entity_id;
    when 'player' then
      select tenant_id into v_tenant from public.players where id=p_entity_id;
    when 'prospect' then
      select tenant_id into v_tenant from djm_os.scouting_prospects where id=p_entity_id;
    when 'club_need' then
      select tenant_id into v_tenant from djm_os.club_needs where id=p_entity_id;
    when 'task' then
      select tenant_id into v_tenant from djm_os.tasks where id=p_entity_id;
    when 'interaction' then
      select tenant_id into v_tenant from djm_os.interactions where id=p_entity_id;
    when 'capture' then
      select tenant_id into v_tenant from djm_os.captures where id=p_entity_id;
    when 'claim' then
      select tenant_id into v_tenant from djm_os.claims where id=p_entity_id;
    when 'opportunity' then
      select tenant_id into v_tenant from public.player_opportunities where id=p_entity_id;
    else
      v_tenant := null;
  end case;

  return v_tenant;
end;
$$;

revoke all on function private.workspace_entity_tenant(text,uuid) from public;
grant execute on function private.workspace_entity_tenant(text,uuid) to authenticated, service_role;

create or replace function private.assign_workspace_tenant()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_tenant uuid := new.tenant_id;
  v_candidate uuid;
  v_id uuid;
  v_user_id uuid;
  v_type text;
begin
  if tg_op='UPDATE' and old.tenant_id is distinct from new.tenant_id then
    raise exception 'Tenant ownership is immutable.' using errcode='23514';
  end if;

  if tg_table_name='tell_djm_permissions' then
    v_user_id := nullif(v_row->>'user_id','')::uuid;
    v_candidate := private.primary_active_tenant_id(v_user_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'permission_user');

  elsif tg_table_name in ('tell_djm_actions','tell_djm_questions') then
    v_id := nullif(v_row->>'capture_id','')::uuid;
    select tenant_id into v_candidate from djm_os.captures where id=v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'capture');

  elsif tg_table_name='tell_djm_aliases' then
    v_id := nullif(v_row->>'source_capture_id','')::uuid;
    select tenant_id into v_candidate from djm_os.captures where id=v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'source_capture');

    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_user_id is not null then
      v_candidate := private.primary_active_tenant_id(v_user_id);
      v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'alias_owner');
    end if;

    v_type := nullif(v_row->>'entity_type','');
    v_id := nullif(v_row->>'entity_id','')::uuid;
    v_candidate := private.workspace_entity_tenant(v_type,v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'alias_entity');

  elsif tg_table_name='claims' then
    v_id := nullif(v_row->>'interaction_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('interaction',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'interaction');
    v_id := nullif(v_row->>'person_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('person',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'person');
    v_id := nullif(v_row->>'organisation_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('club',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'organisation');
    v_id := nullif(v_row->>'player_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('player',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'player');
    v_user_id := nullif(v_row->>'verified_by','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='employments' then
    v_id := nullif(v_row->>'person_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('person',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'person');
    v_id := nullif(v_row->>'organisation_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('club',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'organisation');

  elsif tg_table_name='events' then
    v_id := nullif(v_row->>'person_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('person',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'person');
    v_id := nullif(v_row->>'organisation_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('club',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'organisation');
    v_id := nullif(v_row->>'player_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('player',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'player');
    v_id := nullif(v_row->>'interaction_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('interaction',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'interaction');
    v_user_id := nullif(v_row->>'actor_user_id','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='review_items' then
    foreach v_type in array array['person','club','player','club_need','capture','claim'] loop
      v_id := case v_type
        when 'person' then nullif(v_row->>'person_id','')::uuid
        when 'club' then nullif(v_row->>'organisation_id','')::uuid
        when 'player' then nullif(v_row->>'player_id','')::uuid
        when 'club_need' then nullif(v_row->>'club_need_id','')::uuid
        when 'capture' then nullif(v_row->>'capture_id','')::uuid
        when 'claim' then nullif(v_row->>'claim_id','')::uuid
      end;
      v_candidate := private.workspace_entity_tenant(v_type,v_id);
      v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,v_type);
    end loop;
    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='notifications' then
    foreach v_type in array array['person','club','player','club_need','task'] loop
      v_id := case v_type
        when 'person' then nullif(v_row->>'person_id','')::uuid
        when 'club' then nullif(v_row->>'organisation_id','')::uuid
        when 'player' then nullif(v_row->>'player_id','')::uuid
        when 'club_need' then nullif(v_row->>'club_need_id','')::uuid
        when 'task' then nullif(v_row->>'task_id','')::uuid
      end;
      v_candidate := private.workspace_entity_tenant(v_type,v_id);
      v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,v_type);
    end loop;
    v_user_id := nullif(v_row->>'user_id','')::uuid;
    if v_tenant is null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='scouting_prospects' then
    v_id := nullif(v_row->>'linked_player_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('player',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'linked_player');
    v_id := nullif(v_row->>'signed_player_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('player',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'signed_player');
    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='recruitment_interactions' then
    v_id := nullif(v_row->>'prospect_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('prospect',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'prospect');
    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='scouting_reports' then
    v_id := nullif(v_row->>'prospect_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('prospect',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'prospect');
    v_user_id := nullif(v_row->>'scout_user_id','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='scouting_watchlists' then
    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_user_id is not null then v_tenant := private.merge_tenant_candidate(v_tenant,private.primary_active_tenant_id(v_user_id),'watchlist_owner'); end if;

  elsif tg_table_name='scouting_watchlist_entries' then
    v_id := nullif(v_row->>'watchlist_id','')::uuid;
    select tenant_id into v_candidate from djm_os.scouting_watchlists where id=v_id;
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'watchlist');
    v_id := nullif(v_row->>'prospect_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('prospect',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'prospect');
    v_user_id := nullif(v_row->>'added_by','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='deal_rooms' then
    foreach v_type in array array['club','person','player','prospect','club_need'] loop
      v_id := case v_type
        when 'club' then nullif(v_row->>'organisation_id','')::uuid
        when 'person' then nullif(v_row->>'source_person_id','')::uuid
        when 'player' then nullif(v_row->>'player_id','')::uuid
        when 'prospect' then nullif(v_row->>'prospect_id','')::uuid
        when 'club_need' then nullif(v_row->>'club_need_id','')::uuid
      end;
      v_candidate := private.workspace_entity_tenant(v_type,v_id);
      v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,v_type);
    end loop;
    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='market_signals' then
    foreach v_type in array array['club','person','player','prospect'] loop
      v_id := case v_type
        when 'club' then nullif(v_row->>'organisation_id','')::uuid
        when 'person' then nullif(v_row->>'person_id','')::uuid
        when 'player' then nullif(v_row->>'player_id','')::uuid
        when 'prospect' then nullif(v_row->>'prospect_id','')::uuid
      end;
      v_candidate := private.workspace_entity_tenant(v_type,v_id);
      v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,v_type);
    end loop;
    v_user_id := nullif(v_row->>'created_by','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='memories' then
    foreach v_type in array array['person','club','player','prospect','club_need'] loop
      v_id := case v_type
        when 'person' then nullif(v_row->>'person_id','')::uuid
        when 'club' then nullif(v_row->>'organisation_id','')::uuid
        when 'player' then nullif(v_row->>'player_id','')::uuid
        when 'prospect' then nullif(v_row->>'prospect_id','')::uuid
        when 'club_need' then nullif(v_row->>'club_need_id','')::uuid
      end;
      v_candidate := private.workspace_entity_tenant(v_type,v_id);
      v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,v_type);
    end loop;
    v_user_id := nullif(v_row->>'created_by','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='suggestions' then
    foreach v_type in array array['person','club','player','club_need'] loop
      v_id := case v_type
        when 'person' then nullif(v_row->>'person_id','')::uuid
        when 'club' then nullif(v_row->>'organisation_id','')::uuid
        when 'player' then nullif(v_row->>'player_id','')::uuid
        when 'club_need' then nullif(v_row->>'club_need_id','')::uuid
      end;
      v_candidate := private.workspace_entity_tenant(v_type,v_id);
      v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,v_type);
    end loop;
    v_user_id := nullif(v_row->>'owner_user_id','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;

  elsif tg_table_name='opportunity_links' then
    v_id := nullif(v_row->>'opportunity_id','')::uuid;
    v_candidate := private.workspace_entity_tenant('opportunity',v_id);
    v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,'opportunity');
    foreach v_type in array array['club','person','club_need'] loop
      v_id := case v_type
        when 'club' then nullif(v_row->>'organisation_id','')::uuid
        when 'person' then nullif(v_row->>'person_id','')::uuid
        when 'club_need' then nullif(v_row->>'club_need_id','')::uuid
      end;
      v_candidate := private.workspace_entity_tenant(v_type,v_id);
      v_tenant := private.merge_tenant_candidate(v_tenant,v_candidate,v_type);
    end loop;
    v_user_id := nullif(v_row->>'linked_by','')::uuid;
    if v_tenant is null and v_user_id is not null then v_tenant := private.primary_active_tenant_id(v_user_id); end if;
  end if;

  if v_tenant is null then
    v_tenant := private.primary_active_tenant_id(auth.uid());
  end if;

  if v_tenant is null then
    raise exception 'Trusted tenant context is required for %.%',tg_table_schema,tg_table_name using errcode='23514';
  end if;

  new.tenant_id := v_tenant;
  return new;
end;
$$;

revoke all on function private.assign_workspace_tenant() from public;

-- Install ownership trigger.
do $triggers$
declare r record;
begin
  for r in
    select * from (values
      ('tell_djm_permissions'),('tell_djm_actions'),('tell_djm_questions'),('tell_djm_aliases'),
      ('claims'),('employments'),('events'),('review_items'),('notifications'),('scouting_prospects'),
      ('recruitment_interactions'),('scouting_reports'),('scouting_watchlists'),('scouting_watchlist_entries'),
      ('deal_rooms'),('market_signals'),('memories'),('suggestions'),('opportunity_links')
    ) as x(table_name)
  loop
    execute format('drop trigger if exists assign_workspace_tenant on djm_os.%I',r.table_name);
    execute format('create trigger assign_workspace_tenant before insert or update on djm_os.%I for each row execute function private.assign_workspace_tenant()',r.table_name);
  end loop;
end
$triggers$;

create or replace function private.user_has_tell_djm_full(
  p_tenant_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.user_has_staff_tenant_access(p_tenant_id,p_user_id)
    and exists (
      select 1 from djm_os.tell_djm_permissions p
      where p.tenant_id=p_tenant_id
        and p.user_id=p_user_id
        and p.permission_scope='full'
        and p.is_enabled=true
    );
$$;
revoke all on function private.user_has_tell_djm_full(uuid,uuid) from public;
grant execute on function private.user_has_tell_djm_full(uuid,uuid) to authenticated,service_role;

-- Replace global-team policies with tenant policies on agency-private workspace tables.
do $policies$
declare r record;
begin
  for r in
    select * from (values
      ('claims'),('employments'),('events'),('review_items'),('scouting_prospects'),('recruitment_interactions'),
      ('scouting_reports'),('scouting_watchlists'),('scouting_watchlist_entries'),('deal_rooms'),('market_signals'),
      ('memories'),('suggestions'),('opportunity_links')
    ) as x(table_name)
  loop
    execute format('drop policy if exists djm_team_select on djm_os.%I',r.table_name);
    execute format('drop policy if exists djm_team_insert on djm_os.%I',r.table_name);
    execute format('drop policy if exists djm_team_update on djm_os.%I',r.table_name);
    execute format('drop policy if exists djm_team_delete on djm_os.%I',r.table_name);
    execute format('drop policy if exists team_deal_rooms_all on djm_os.%I',r.table_name);
    execute format('drop policy if exists team_market_signals_all on djm_os.%I',r.table_name);
    execute format('drop policy if exists team_memories_all on djm_os.%I',r.table_name);
    execute format('drop policy if exists recruitment_interactions_team_all on djm_os.%I',r.table_name);

    execute format('drop policy if exists tenant_staff_select on djm_os.%I',r.table_name);
    execute format('drop policy if exists tenant_staff_insert on djm_os.%I',r.table_name);
    execute format('drop policy if exists tenant_staff_update on djm_os.%I',r.table_name);
    execute format('drop policy if exists tenant_staff_delete on djm_os.%I',r.table_name);

    execute format('create policy tenant_staff_select on djm_os.%I for select to authenticated using (private.user_has_staff_tenant_access(tenant_id))',r.table_name);
    execute format('create policy tenant_staff_insert on djm_os.%I for insert to authenticated with check (private.user_has_staff_tenant_access(tenant_id))',r.table_name);
    execute format('create policy tenant_staff_update on djm_os.%I for update to authenticated using (private.user_has_staff_tenant_access(tenant_id)) with check (private.user_has_staff_tenant_access(tenant_id))',r.table_name);
    execute format('create policy tenant_staff_delete on djm_os.%I for delete to authenticated using (private.user_has_staff_tenant_access(tenant_id))',r.table_name);
  end loop;
end
$policies$;

-- Notifications stay private to the recipient and their tenant.
drop policy if exists djm_notification_select on djm_os.notifications;
drop policy if exists djm_notification_update on djm_os.notifications;
drop policy if exists tenant_notification_select on djm_os.notifications;
drop policy if exists tenant_notification_update on djm_os.notifications;
create policy tenant_notification_select on djm_os.notifications for select to authenticated
using (user_id=auth.uid() and private.user_has_active_tenant_membership(tenant_id));
create policy tenant_notification_update on djm_os.notifications for update to authenticated
using (user_id=auth.uid() and private.user_has_active_tenant_membership(tenant_id))
with check (user_id=auth.uid() and private.user_has_active_tenant_membership(tenant_id));

-- Tell DJM permissions are tenant-bound.
drop policy if exists tell_djm_permissions_select on djm_os.tell_djm_permissions;
create policy tell_djm_permissions_select on djm_os.tell_djm_permissions for select to authenticated
using (user_id=auth.uid() or private.user_is_tenant_admin(tenant_id));

-- Tell DJM actions/questions are visible only to the capture owner or full-access staff in that tenant.
drop policy if exists tell_djm_actions_select on djm_os.tell_djm_actions;
drop policy if exists tell_djm_actions_update on djm_os.tell_djm_actions;
create policy tell_djm_actions_select on djm_os.tell_djm_actions for select to authenticated
using (
  exists(select 1 from djm_os.captures c where c.id=capture_id and c.tenant_id=tenant_id and c.submitted_by=auth.uid())
  or private.user_has_tell_djm_full(tenant_id)
);
create policy tell_djm_actions_update on djm_os.tell_djm_actions for update to authenticated
using (
  exists(select 1 from djm_os.captures c where c.id=capture_id and c.tenant_id=tenant_id and c.submitted_by=auth.uid())
  or private.user_has_tell_djm_full(tenant_id)
)
with check (
  exists(select 1 from djm_os.captures c where c.id=capture_id and c.tenant_id=tenant_id and c.submitted_by=auth.uid())
  or private.user_has_tell_djm_full(tenant_id)
);

drop policy if exists tell_djm_questions_select on djm_os.tell_djm_questions;
drop policy if exists tell_djm_questions_update on djm_os.tell_djm_questions;
create policy tell_djm_questions_select on djm_os.tell_djm_questions for select to authenticated
using (
  exists(select 1 from djm_os.captures c where c.id=capture_id and c.tenant_id=tenant_id and c.submitted_by=auth.uid())
  or private.user_has_tell_djm_full(tenant_id)
);
create policy tell_djm_questions_update on djm_os.tell_djm_questions for update to authenticated
using (
  exists(select 1 from djm_os.captures c where c.id=capture_id and c.tenant_id=tenant_id and c.submitted_by=auth.uid())
  or private.user_has_tell_djm_full(tenant_id)
)
with check (
  exists(select 1 from djm_os.captures c where c.id=capture_id and c.tenant_id=tenant_id and c.submitted_by=auth.uid())
  or private.user_has_tell_djm_full(tenant_id)
);

-- Aliases cannot cross tenants.
drop policy if exists tell_djm_aliases_select on djm_os.tell_djm_aliases;
drop policy if exists tell_djm_aliases_insert on djm_os.tell_djm_aliases;
drop policy if exists tell_djm_aliases_update on djm_os.tell_djm_aliases;
drop policy if exists tell_djm_aliases_delete on djm_os.tell_djm_aliases;
create policy tell_djm_aliases_select on djm_os.tell_djm_aliases for select to authenticated
using (
  private.user_has_staff_tenant_access(tenant_id)
  and (owner_user_id=auth.uid() or owner_user_id is null or private.user_has_tell_djm_full(tenant_id))
);
create policy tell_djm_aliases_insert on djm_os.tell_djm_aliases for insert to authenticated
with check (
  private.user_has_staff_tenant_access(tenant_id)
  and (owner_user_id=auth.uid() or private.user_has_tell_djm_full(tenant_id))
);
create policy tell_djm_aliases_update on djm_os.tell_djm_aliases for update to authenticated
using (
  private.user_has_staff_tenant_access(tenant_id)
  and (owner_user_id=auth.uid() or private.user_has_tell_djm_full(tenant_id))
)
with check (
  private.user_has_staff_tenant_access(tenant_id)
  and (owner_user_id=auth.uid() or private.user_has_tell_djm_full(tenant_id))
);
create policy tell_djm_aliases_delete on djm_os.tell_djm_aliases for delete to authenticated
using (
  private.user_has_staff_tenant_access(tenant_id)
  and (owner_user_id=auth.uid() or private.user_has_tell_djm_full(tenant_id))
);

-- Preserve the old resolver logic under an internal name, then filter its result by the caller's trusted tenant.
do $rename$
begin
  if to_regprocedure('public.djm_tell_resolve_entity_typed_unscoped(uuid,text,text,text)') is null
     and to_regprocedure('public.djm_tell_resolve_entity_typed(uuid,text,text,text)') is not null then
    execute 'alter function public.djm_tell_resolve_entity_typed(uuid,text,text,text) rename to djm_tell_resolve_entity_typed_unscoped';
  end if;
end
$rename$;

revoke all on function public.djm_tell_resolve_entity_typed_unscoped(uuid,text,text,text) from public;
grant execute on function public.djm_tell_resolve_entity_typed_unscoped(uuid,text,text,text) to service_role;

create or replace function public.djm_tell_resolve_entity_typed(
  p_user_id uuid,
  p_entity_type text,
  p_name text,
  p_organisation_name text default null
)
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_tenant uuid;
  v_raw jsonb;
  v_candidates jsonb := '[]'::jsonb;
  v_top numeric := 0;
  v_second numeric := 0;
  v_resolved_id text;
  v_resolved_label text;
begin
  v_tenant := private.primary_active_tenant_id(p_user_id);
  if v_tenant is null then
    return jsonb_build_object('resolved_id',null,'resolved_label',null,'candidates','[]'::jsonb,'matched_by','tenant_not_resolved');
  end if;

  v_raw := public.djm_tell_resolve_entity_typed_unscoped(p_user_id,p_entity_type,p_name,p_organisation_name);

  select coalesce(jsonb_agg(c order by coalesce((c->>'score')::numeric,0) desc,c->>'label'),'[]'::jsonb)
  into v_candidates
  from jsonb_array_elements(coalesce(v_raw->'candidates','[]'::jsonb)) c
  where private.workspace_entity_tenant(
    c->>'entity_type',
    nullif(c->>'entity_id','')::uuid
  ) = v_tenant;

  if jsonb_array_length(v_candidates)>0 then
    v_top := coalesce((v_candidates->0->>'score')::numeric,0);
    if jsonb_array_length(v_candidates)>1 then v_second := coalesce((v_candidates->1->>'score')::numeric,0); end if;
    if v_top>=0.88 and (jsonb_array_length(v_candidates)=1 or v_top-v_second>=0.10) then
      v_resolved_id := v_candidates->0->>'entity_id';
      v_resolved_label := v_candidates->0->>'label';
    end if;
  end if;

  return jsonb_build_object(
    'resolved_id',v_resolved_id,
    'resolved_label',v_resolved_label,
    'candidates',v_candidates,
    'matched_by',coalesce(v_raw->>'matched_by','tenant_scoped')
  );
end;
$$;

create or replace function public.djm_tell_resolve_entity(
  p_user_id uuid,
  p_entity_type text,
  p_name text,
  p_organisation_name text default null
)
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_primary jsonb;
  v_player jsonb;
  v_candidates jsonb:='[]'::jsonb;
begin
  v_primary:=public.djm_tell_resolve_entity_typed(p_user_id,p_entity_type,p_name,p_organisation_name);
  if p_entity_type<>'contact' or nullif(v_primary->>'resolved_id','') is not null then return v_primary; end if;

  v_player:=public.djm_tell_resolve_entity_typed(p_user_id,'player',p_name,null);
  select coalesce(jsonb_agg(candidate order by coalesce((candidate->>'score')::numeric,0) desc,candidate->>'label'),'[]'::jsonb)
  into v_candidates
  from (
    select case when candidate->>'entity_type'='contact' then
      jsonb_set(jsonb_set(candidate,'{canonical_label}',to_jsonb(candidate->>'label'),true),'{label}',to_jsonb(concat_ws(' · ',candidate->>'label','Contact',nullif(candidate->>'organisation_name',''))),true)
      else candidate end as candidate
    from jsonb_array_elements(coalesce(v_primary->'candidates','[]'::jsonb)) candidate
    union all
    select jsonb_set(jsonb_set(candidate,'{canonical_label}',to_jsonb(candidate->>'label'),true),'{label}',to_jsonb(concat_ws(' · ',candidate->>'label','Player',nullif(candidate->>'club',''))),true)
    from jsonb_array_elements(coalesce(v_player->'candidates','[]'::jsonb)) candidate
  ) merged;

  return jsonb_build_object('resolved_id',null,'resolved_label',null,'candidates',v_candidates,'matched_by','person_candidates');
end;
$$;

-- Tenant-aware vocabulary overload for the service worker.
create or replace function public.djm_tell_vocabulary(
  p_limit integer,
  p_user_id uuid
)
returns jsonb
language sql
stable
set search_path=''
as $$
  with tenant as (select private.primary_active_tenant_id(p_user_id) as tenant_id)
  select jsonb_build_object(
    'players',coalesce((select jsonb_agg(name) from (
      select coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name) name
      from public.players p, tenant t
      where p.tenant_id=t.tenant_id
        and coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name) is not null
      order by p.updated_at desc limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb),
    'prospects',coalesce((select jsonb_agg(name) from (
      select sp.full_name name from djm_os.scouting_prospects sp, tenant t
      where sp.tenant_id=t.tenant_id and sp.full_name is not null
      order by sp.updated_at desc limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb),
    'clubs',coalesce((select jsonb_agg(name) from (
      select o.name from djm_os.organisations o, tenant t
      where o.tenant_id=t.tenant_id and o.organisation_type='club'
      order by o.updated_at desc limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb),
    'contacts',coalesce((select jsonb_agg(full_name) from (
      select p.full_name from djm_os.people p, tenant t
      where p.tenant_id=t.tenant_id and coalesce(p.person_type,'contact')<>'player'
      order by p.updated_at desc limit greatest(10,least(coalesce(p_limit,120),250))
    ) x),'[]'::jsonb)
  );
$$;

revoke all on function public.djm_tell_vocabulary(integer,uuid) from public;
grant execute on function public.djm_tell_vocabulary(integer,uuid) to service_role;

-- Frontend enqueue checks Tell DJM permission inside the user's primary tenant.
create or replace function public.djm_tell_enqueue_capture(
  p_client_capture_id uuid,
  p_capture_type text,
  p_source_uri text default null,
  p_raw_text text default null,
  p_channel text default 'voice_debrief',
  p_person_id uuid default null,
  p_organisation_id uuid default null,
  p_player_id uuid default null,
  p_context_json jsonb default '{}'::jsonb,
  p_duration_seconds numeric default null,
  p_parent_capture_id uuid default null
)
returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_capture djm_os.captures%rowtype;
  v_days integer;
  v_tenant uuid;
begin
  v_tenant := private.primary_active_tenant_id(auth.uid());
  if v_tenant is null or not private.user_has_staff_tenant_access(v_tenant) then
    raise exception 'Agency staff access required';
  end if;
  if p_client_capture_id is null then raise exception 'Client capture ID is required'; end if;
  if p_capture_type not in ('audio','text') then raise exception 'Tell DJM currently supports audio and text captures'; end if;
  if coalesce(length(trim(p_raw_text)),0)=0 and p_source_uri is null then raise exception 'Capture content is required'; end if;

  if not exists (
    select 1 from djm_os.tell_djm_permissions p cross join djm_os.tell_djm_settings s
    where p.user_id=auth.uid() and p.tenant_id=v_tenant and p.is_enabled=true and s.id=1 and s.is_live=true
  ) then raise exception 'Tell DJM is not enabled for this account'; end if;

  select * into v_capture from djm_os.captures
  where tenant_id=v_tenant and submitted_by=auth.uid() and client_capture_id=p_client_capture_id limit 1;
  if found then return jsonb_build_object('capture_id',v_capture.id,'status',v_capture.status,'duplicate',true); end if;

  select audio_retention_days into v_days from djm_os.tell_djm_settings where id=1;
  insert into djm_os.captures(
    tenant_id,submitted_by,channel,capture_type,raw_text,source_uri,person_id,organisation_id,player_id,
    status,confidence,client_capture_id,context_json,parent_capture_id,audio_duration_seconds,audio_delete_after,next_attempt_at,processing_version
  ) values (
    v_tenant,auth.uid(),coalesce(nullif(trim(p_channel),''),'voice_debrief'),p_capture_type,
    nullif(trim(coalesce(p_raw_text,'')),''),p_source_uri,p_person_id,p_organisation_id,p_player_id,
    'queued',null,p_client_capture_id,coalesce(p_context_json,'{}'::jsonb),p_parent_capture_id,p_duration_seconds,
    case when p_capture_type='audio' then now()+make_interval(days=>coalesce(v_days,7)) else null end,
    now(),'tell_djm_v1'
  ) returning * into v_capture;

  insert into djm_os.events(tenant_id,event_type,actor_user_id,person_id,organisation_id,player_id,payload,source,confidence,occurred_at)
  values (v_tenant,'TELL_DJM_CAPTURE_QUEUED',auth.uid(),p_person_id,p_organisation_id,p_player_id,
    jsonb_build_object('capture_id',v_capture.id,'capture_type',p_capture_type,'client_capture_id',p_client_capture_id),'tell_djm',1,now());

  return jsonb_build_object('capture_id',v_capture.id,'status',v_capture.status,'duplicate',false);
end;
$$;

-- Worker claim is tenant-aware for permissions and monthly spend.
create or replace function public.djm_tell_worker_claim(
  p_capture_id uuid default null,
  p_worker text default 'tell-djm-worker'
)
returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_id uuid;
  v_payload jsonb;
begin
  with candidate as (
    select c.id
    from djm_os.captures c
    where c.processing_version='tell_djm_v1'
      and ((c.status in ('queued','retry') and c.next_attempt_at<=now()) or (c.status='processing' and c.locked_at<now()-interval '5 minutes'))
      and (p_capture_id is null or c.id=p_capture_id)
      and exists (
        select 1 from djm_os.tell_djm_permissions p
        where p.user_id=c.submitted_by and p.tenant_id=c.tenant_id and p.is_enabled=true
      )
    order by case when c.id=p_capture_id then 0 else 1 end,c.created_at
    for update skip locked limit 1
  )
  update djm_os.captures c
  set status='processing',attempt_count=c.attempt_count+1,locked_at=now(),locked_by=p_worker,error_message=null
  from candidate where c.id=candidate.id returning c.id into v_id;

  if v_id is null then return null; end if;

  update djm_os.tell_djm_actions set status='superseded',updated_at=now()
  where capture_id=v_id and status in ('pending','failed');
  update djm_os.tell_djm_questions set status='superseded'
  where capture_id=v_id and status='open';

  select jsonb_build_object(
    'capture_id',c.id,'tenant_id',c.tenant_id,'submitted_by',c.submitted_by,'capture_type',c.capture_type,
    'raw_text',c.raw_text,'source_uri',c.source_uri,'transcript_text',c.transcript_text,'extracted_json',c.extracted_json,
    'usage_json',c.usage_json,'person_id',c.person_id,'organisation_id',c.organisation_id,'player_id',c.player_id,
    'context_json',c.context_json,'created_at',c.created_at,'duration_seconds',c.audio_duration_seconds,
    'attempt_count',c.attempt_count,'timezone',coalesce(tm.timezone,'Europe/Rome'),
    'permission_scope',coalesce(p.permission_scope,'read_only'),'settings',to_jsonb(s),
    'estimated_month_spend',coalesce((
      select sum(coalesce((x.usage_json->>'estimated_cost_usd')::numeric,0))
      from djm_os.captures x
      where x.tenant_id=c.tenant_id and x.created_at>=date_trunc('month',now()) and x.processing_version='tell_djm_v1'
    ),0)
  ) into v_payload
  from djm_os.captures c
  join djm_os.team_members tm on tm.user_id=c.submitted_by
  left join djm_os.tell_djm_permissions p on p.user_id=c.submitted_by and p.tenant_id=c.tenant_id
  cross join djm_os.tell_djm_settings s
  where c.id=v_id and s.id=1;

  return v_payload;
end;
$$;

-- Worker-only RPCs must not be directly callable by browser clients.
revoke execute on function public.djm_tell_worker_claim(uuid,text) from anon,authenticated;
revoke execute on function public.djm_tell_apply_action(uuid,text,integer,text,numeric,text,jsonb) from anon,authenticated;
revoke execute on function public.djm_tell_record_question(uuid,text,text,text,jsonb,jsonb) from anon,authenticated;
revoke execute on function public.djm_tell_notify_attention(uuid) from anon,authenticated;
grant execute on function public.djm_tell_worker_claim(uuid,text) to service_role;
grant execute on function public.djm_tell_apply_action(uuid,text,integer,text,numeric,text,jsonb) to service_role;
grant execute on function public.djm_tell_record_question(uuid,text,text,text,jsonb,jsonb) to service_role;
grant execute on function public.djm_tell_notify_attention(uuid) to service_role;

comment on function private.assign_workspace_tenant() is 'Assigns immutable tenant ownership to Tell DJM support records and agency-private workspace data from trusted related entities or memberships.';;
