-- The legacy observation table has no tenant_id. Use the canonical subject's
-- tenant and active staff membership; never global team membership or a default agency.
-- Preserve every row, all table grants and the server-only ingestion/cron paths.
do $guard$
declare
  v_legacy text := '( SELECT djm_os.is_team_member() AS is_team_member)';
begin
  if not (select relrowsecurity from pg_class where oid='djm_os.change_observations'::regclass)
     or (select count(*) from pg_policy where polrelid='djm_os.change_observations'::regclass)<>4
     or exists (
       select 1 from pg_policy p where p.polrelid='djm_os.change_observations'::regclass and (
         not p.polpermissive or p.polroles<>array['authenticated'::regrole::oid]
         or case p.polname
           when 'djm_team_select' then p.polcmd::text<>'r' or pg_get_expr(p.polqual,p.polrelid) is distinct from v_legacy or p.polwithcheck is not null
           when 'djm_team_insert' then p.polcmd::text<>'a' or p.polqual is not null or pg_get_expr(p.polwithcheck,p.polrelid) is distinct from v_legacy
           when 'djm_team_update' then p.polcmd::text<>'w' or pg_get_expr(p.polqual,p.polrelid) is distinct from v_legacy or pg_get_expr(p.polwithcheck,p.polrelid) is distinct from v_legacy
           when 'djm_team_delete' then p.polcmd::text<>'d' or pg_get_expr(p.polqual,p.polrelid) is distinct from v_legacy or p.polwithcheck is not null
           else true end
       )
     ) then
    raise exception 'Unexpected change_observations policies; review drift before applying.';
  end if;
end;
$guard$;

drop policy djm_team_select on djm_os.change_observations;
drop policy djm_team_insert on djm_os.change_observations;
drop policy djm_team_update on djm_os.change_observations;
drop policy djm_team_delete on djm_os.change_observations;

create policy tenant_staff_select on djm_os.change_observations for select to authenticated
using (private.user_has_staff_tenant_access(private.workspace_entity_tenant(
  case entity_type when 'organisation' then 'club' when 'person' then 'person' when 'player' then 'player' when 'prospect' then 'prospect' end,
  entity_id),(select auth.uid())));
create policy tenant_staff_insert on djm_os.change_observations for insert to authenticated
with check (private.user_has_staff_tenant_access(private.workspace_entity_tenant(
  case entity_type when 'organisation' then 'club' when 'person' then 'person' when 'player' then 'player' when 'prospect' then 'prospect' end,
  entity_id),(select auth.uid())));
create policy tenant_staff_update on djm_os.change_observations for update to authenticated
using (private.user_has_staff_tenant_access(private.workspace_entity_tenant(
  case entity_type when 'organisation' then 'club' when 'person' then 'person' when 'player' then 'player' when 'prospect' then 'prospect' end,
  entity_id),(select auth.uid())))
with check (private.user_has_staff_tenant_access(private.workspace_entity_tenant(
  case entity_type when 'organisation' then 'club' when 'person' then 'person' when 'player' then 'player' when 'prospect' then 'prospect' end,
  entity_id),(select auth.uid())));
create policy tenant_staff_delete on djm_os.change_observations for delete to authenticated
using (private.user_has_staff_tenant_access(private.workspace_entity_tenant(
  case entity_type when 'organisation' then 'club' when 'person' then 'person' when 'player' then 'player' when 'prospect' then 'prospect' end,
  entity_id),(select auth.uid())));
