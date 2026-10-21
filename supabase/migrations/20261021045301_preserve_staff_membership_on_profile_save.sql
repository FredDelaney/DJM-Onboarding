-- A tenant staff profile deliberately retains a neutral legacy role. Editing
-- that profile must not deactivate its team identity while staff access exists.
do $repair$
declare
  v_definition text := pg_get_functiondef('private.sync_djm_team_membership()'::regprocedure);
  v_anchor text := $anchor$begin
  if new.role in ('admin', 'scout') then$anchor$;
  v_replacement text := $replacement$begin
  -- preserve_tenant_staff_identity_on_profile_save_v1
  if exists (
    select 1
    from platform.tenant_memberships m
    join platform.tenants t on t.id=m.tenant_id and t.status='active'
    where m.user_id=new.id
      and m.status='active'
      and m.role in ('owner','admin','agent','operations','scout')
  ) then
    perform private.platform_server_ensure_team_member(new.id);
    return new;
  end if;

  if new.role in ('admin', 'scout') then$replacement$;
begin
  if position('preserve_tenant_staff_identity_on_profile_save_v1' in v_definition)>0 then return; end if;
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))<>length(v_anchor) then
    raise exception 'Unexpected profile sync definition; tenant staff repair was not applied';
  end if;
  execute replace(v_definition,v_anchor,v_replacement);
end;
$repair$;
