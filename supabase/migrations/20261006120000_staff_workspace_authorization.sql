-- Close authenticated database bypasses without changing customer records.
-- Function patches preserve each environment's reviewed implementation and ACL.
begin;
create or replace function private.redream_admin_tenant()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_tenant uuid:=private.redream_request_tenant();
begin
  if not private.user_is_tenant_admin(v_tenant,auth.uid()) then
    raise exception 'agency_admin_access_required' using errcode='42501';
  end if;
  return v_tenant;
end;
$$;
revoke all on function private.redream_admin_tenant() from public,anon,authenticated;
grant execute on function private.redream_admin_tenant() to service_role;

create or replace function private.assert_staff_proposal_access(p_proposal_id uuid,p_actor_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_p platform.agency_action_proposals%rowtype; v_task djm_os.tasks%rowtype;
begin
  select * into v_p from platform.agency_action_proposals where id=p_proposal_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if not private.user_has_staff_tenant_access(v_p.tenant_id,p_actor_user_id) then
    raise exception 'proposal_access_denied' using errcode='42501';
  end if;
  if private.user_is_tenant_admin(v_p.tenant_id,p_actor_user_id) then return; end if;
  if v_p.requested_by is distinct from p_actor_user_id
    or v_p.action_type is distinct from 'complete_task' or v_p.target_type is distinct from 'task'
    or v_p.proposed_payload->>'task_id' is distinct from v_p.target_id::text then
    raise exception 'proposal_access_denied' using errcode='42501';
  end if;
  select * into v_task from djm_os.tasks
    where id=v_p.target_id and tenant_id=v_p.tenant_id for update;
  if not found or v_task.owner_user_id is distinct from p_actor_user_id then
    raise exception 'proposal_access_denied' using errcode='42501';
  end if;
end;
$$;
revoke all on function private.assert_staff_proposal_access(uuid,uuid) from public,anon,authenticated;
grant execute on function private.assert_staff_proposal_access(uuid,uuid) to service_role;

drop policy tenant_staff_select on djm_os.deal_rooms;
create policy tenant_staff_select on djm_os.deal_rooms for select to authenticated using (private.user_is_tenant_admin(tenant_id)) ;
drop policy tenant_staff_insert on djm_os.deal_rooms;
create policy tenant_staff_insert on djm_os.deal_rooms for insert to authenticated with check (private.user_is_tenant_admin(tenant_id));
drop policy tenant_staff_update on djm_os.deal_rooms;
create policy tenant_staff_update on djm_os.deal_rooms for update to authenticated using (private.user_is_tenant_admin(tenant_id)) with check (private.user_is_tenant_admin(tenant_id));
drop policy tenant_staff_delete on djm_os.deal_rooms;
create policy tenant_staff_delete on djm_os.deal_rooms for delete to authenticated using (private.user_is_tenant_admin(tenant_id)) ;
drop policy tenant_staff_select on djm_os.club_needs;
create policy tenant_staff_select on djm_os.club_needs for select to authenticated using (private.user_is_tenant_admin(tenant_id)) ;
drop policy tenant_staff_insert on djm_os.club_needs;
create policy tenant_staff_insert on djm_os.club_needs for insert to authenticated with check (private.user_is_tenant_admin(tenant_id));
drop policy tenant_staff_update on djm_os.club_needs;
create policy tenant_staff_update on djm_os.club_needs for update to authenticated using (private.user_is_tenant_admin(tenant_id)) with check (private.user_is_tenant_admin(tenant_id));
drop policy tenant_staff_delete on djm_os.club_needs;
create policy tenant_staff_delete on djm_os.club_needs for delete to authenticated using (private.user_is_tenant_admin(tenant_id)) ;
drop policy djm_team_select on djm_os.player_market_facts;
create policy djm_team_select on djm_os.player_market_facts for select to authenticated
using (private.user_is_player_tenant_admin(player_id));
drop policy djm_team_select on djm_os.player_evidence;
create policy djm_team_select on djm_os.player_evidence for select to authenticated using (private.can_staff_view_player(player_id)) ;
drop policy djm_team_insert on djm_os.player_evidence;
create policy djm_team_insert on djm_os.player_evidence for insert to authenticated with check (private.can_staff_edit_player(player_id));
drop policy djm_team_update on djm_os.player_evidence;
create policy djm_team_update on djm_os.player_evidence for update to authenticated using (private.can_staff_edit_player(player_id)) with check (private.can_staff_edit_player(player_id));
drop policy djm_team_delete on djm_os.player_evidence;
create policy djm_team_delete on djm_os.player_evidence for delete to authenticated using (private.can_staff_edit_player(player_id)) ;
drop policy djm_team_select on djm_os.player_performance_snapshots;
create policy djm_team_select on djm_os.player_performance_snapshots for select to authenticated using (private.can_staff_view_player(player_id)) ;
drop policy djm_team_insert on djm_os.player_performance_snapshots;
create policy djm_team_insert on djm_os.player_performance_snapshots for insert to authenticated with check (private.can_staff_edit_player(player_id));
drop policy djm_team_update on djm_os.player_performance_snapshots;
create policy djm_team_update on djm_os.player_performance_snapshots for update to authenticated using (private.can_staff_edit_player(player_id)) with check (private.can_staff_edit_player(player_id));
drop policy djm_team_delete on djm_os.player_performance_snapshots;
create policy djm_team_delete on djm_os.player_performance_snapshots for delete to authenticated using (private.can_staff_edit_player(player_id)) ;

create or replace function pg_temp.patch_staff_boundary(p_target regprocedure,p_before text,p_after text)
returns void language plpgsql as $$
declare v_definition text;
begin
  select pg_get_functiondef(p_target::oid) into v_definition;
  if (length(v_definition)-length(replace(v_definition,p_before,'')))/length(p_before)<>1 then
    raise exception 'staff_boundary_definition_drift: %',p_target;
  end if;
  execute replace(v_definition,p_before,p_after);
end;
$$;

select pg_temp.patch_staff_boundary('public.redream_autopilot_players(integer)'::regprocedure,
$boundary$private.redream_request_tenant()$boundary$,
$boundary$private.redream_admin_tenant()$boundary$);

select pg_temp.patch_staff_boundary('public.redream_autopilot_market(integer)'::regprocedure,
$boundary$private.redream_request_tenant()$boundary$,
$boundary$private.redream_admin_tenant()$boundary$);

select pg_temp.patch_staff_boundary('public.redream_autopilot_deals(integer)'::regprocedure,
$boundary$private.redream_request_tenant()$boundary$,
$boundary$private.redream_admin_tenant()$boundary$);

select pg_temp.patch_staff_boundary('public.redream_autopilot_clubs(integer)'::regprocedure,
$boundary$private.redream_request_tenant()$boundary$,
$boundary$private.redream_admin_tenant()$boundary$);

select pg_temp.patch_staff_boundary('public.redream_autopilot_operations(integer,integer)'::regprocedure,
$boundary$private.redream_request_tenant()$boundary$,
$boundary$private.redream_admin_tenant()$boundary$);

select pg_temp.patch_staff_boundary('public.redream_player_service(uuid)'::regprocedure,
$boundary$private.redream_request_tenant()$boundary$,
$boundary$private.redream_admin_tenant()$boundary$);

select pg_temp.patch_staff_boundary('public.redream_deal_war_room(uuid)'::regprocedure,
$boundary$private.redream_request_tenant()$boundary$,
$boundary$private.redream_admin_tenant()$boundary$);

select pg_temp.patch_staff_boundary('public.redream_opportunity_connected_context(integer)'::regprocedure,
$boundary$private.redream_request_tenant()$boundary$,
$boundary$private.redream_admin_tenant()$boundary$);

select pg_temp.patch_staff_boundary('public.redream_market_create_dossier_draft(uuid)'::regprocedure,
$boundary$private.redream_request_tenant()$boundary$,
$boundary$private.redream_admin_tenant()$boundary$);

select pg_temp.patch_staff_boundary('public.redream_market_update_dossier_draft(uuid,jsonb)'::regprocedure,
$boundary$private.redream_request_tenant()$boundary$,
$boundary$private.redream_admin_tenant()$boundary$);

select pg_temp.patch_staff_boundary('public.redream_market_create_pitch_draft(uuid,jsonb)'::regprocedure,
$boundary$private.redream_request_tenant()$boundary$,
$boundary$private.redream_admin_tenant()$boundary$);

select pg_temp.patch_staff_boundary('public.redream_market_convert_pursuit_to_deal(uuid,jsonb)'::regprocedure,
$boundary$private.redream_request_tenant()$boundary$,
$boundary$private.redream_admin_tenant()$boundary$);

select pg_temp.patch_staff_boundary('public.redream_market_prepare_pitch_response(uuid,jsonb)'::regprocedure,
$boundary$private.redream_request_tenant()$boundary$,
$boundary$private.redream_admin_tenant()$boundary$);

select pg_temp.patch_staff_boundary('public.redream_market_execute_pitch_response(uuid)'::regprocedure,
$boundary$private.redream_request_tenant()$boundary$,
$boundary$private.redream_admin_tenant()$boundary$);

select pg_temp.patch_staff_boundary('public.redream_market_undo_pitch_response(uuid)'::regprocedure,
$boundary$private.redream_request_tenant()$boundary$,
$boundary$private.redream_admin_tenant()$boundary$);

select pg_temp.patch_staff_boundary('public.djm_entity_archive_v1(text,uuid,boolean)'::regprocedure,
$boundary$if not private.user_has_staff_tenant_access(v_tenant,auth.uid()) then raise exception 'Tenant access required'; end if;$boundary$,
$boundary$if not private.user_is_tenant_admin(v_tenant,auth.uid()) then raise exception 'agency_admin_access_required' using errcode='42501'; end if;$boundary$);

select pg_temp.patch_staff_boundary('public.djm_entity_patch_v1(text,uuid,jsonb)'::regprocedure,
$boundary$if not private.user_has_staff_tenant_access(v_tenant,auth.uid()) then raise exception 'Tenant access required'; end if;$boundary$,
$boundary$if not private.user_is_tenant_admin(v_tenant,auth.uid()) then raise exception 'agency_admin_access_required' using errcode='42501'; end if;$boundary$);

select pg_temp.patch_staff_boundary('public.djm_assign_player(uuid,uuid)'::regprocedure,
$boundary$if not private.user_has_staff_tenant_access(v_tenant) then raise exception 'Agency staff access required'; end if;$boundary$,
$boundary$if not private.user_is_tenant_admin(v_tenant) then raise exception 'agency_admin_access_required' using errcode='42501'; end if;$boundary$);

select pg_temp.patch_staff_boundary('public.djm_assign_player_request(uuid,uuid)'::regprocedure,
$boundary$if not private.user_has_staff_tenant_access(v_tenant) then raise exception 'Agency staff access required'; end if;$boundary$,
$boundary$if not private.user_is_tenant_admin(v_tenant) then raise exception 'agency_admin_access_required' using errcode='42501'; end if;$boundary$);

select pg_temp.patch_staff_boundary('public.platform_server_prepare_command_action(uuid,text,uuid,jsonb)'::regprocedure,
$boundary$  v_feed := public.platform_server_agency_decisions(p_tenant_id,25);$boundary$,
$boundary$  if v_role in ('owner','admin') then
    v_feed := public.platform_server_agency_decisions(p_tenant_id,25);
  else
    v_feed := public.platform_server_user_task_commands(p_tenant_id,p_actor_user_id,25);
  end if;$boundary$);

select pg_temp.patch_staff_boundary('public.platform_server_prepare_command_action(uuid,text,uuid,jsonb)'::regprocedure,
$boundary$  if v_source_type='player' and v_command_type='Player review required' then$boundary$,
$boundary$  if v_role not in ('owner','admin') and not (
    v_source_type='task' and v_command_type='Complete follow-up'
    and exists(select 1 from djm_os.tasks t where t.id=v_source_id
      and t.tenant_id=p_tenant_id and t.owner_user_id=p_actor_user_id and t.status='open')
  ) then raise exception 'proposal_access_denied' using errcode='42501'; end if;

  if v_source_type='player' and v_command_type='Player review required' then$boundary$);

select pg_temp.patch_staff_boundary('public.platform_server_prepare_command_action(uuid,text,uuid,jsonb)'::regprocedure,
$boundary$  v_idempotency := md5(p_command_id||'|'||v_action_type||'|'||coalesce(p_input,'{}'::jsonb)::text);$boundary$,
$boundary$  v_idempotency := md5(p_command_id||'|'||v_action_type||'|'||coalesce(p_input,'{}'::jsonb)::text
    ||case when v_role in ('owner','admin') then '' else '|'||p_actor_user_id::text end);$boundary$);

select pg_temp.patch_staff_boundary('public.platform_server_execute_agency_action(uuid,uuid)'::regprocedure,
$boundary$
begin
$boundary$,
$boundary$
begin
  perform private.assert_staff_proposal_access(p_proposal_id,p_actor_user_id);
$boundary$);

select pg_temp.patch_staff_boundary('public.platform_server_undo_agency_action(uuid,uuid)'::regprocedure,
$boundary$
begin
$boundary$,
$boundary$
begin
  perform private.assert_staff_proposal_access(p_proposal_id,p_actor_user_id);
$boundary$);

select pg_temp.patch_staff_boundary('public.platform_server_action_history(uuid,uuid,integer)'::regprocedure,
$boundary$where tenant_id=p_tenant_id order by created_at desc limit v_limit$boundary$,
$boundary$where tenant_id=p_tenant_id and (
    v_role in ('owner','admin') or (
      requested_by=p_actor_user_id and action_type='complete_task' and target_type='task'
      and proposed_payload->>'task_id'=target_id::text
      and exists(select 1 from djm_os.tasks t where t.id=agency_action_proposals.target_id
        and t.tenant_id=p_tenant_id and t.owner_user_id=p_actor_user_id)
    )
  ) order by created_at desc limit v_limit$boundary$);

select pg_temp.patch_staff_boundary('public.platform_server_personal_home_commands(uuid,uuid,integer)'::regprocedure,
$boundary$  v_shared:=coalesce(
    public.platform_server_agency_decisions(
      p_tenant_id,
      25
    )->'commands',
    '[]'::jsonb
  );$boundary$,
$boundary$  v_shared:='[]'::jsonb;
  if private.user_is_tenant_admin(p_tenant_id,p_user_id) then
    v_shared:=coalesce(public.platform_server_agency_decisions(p_tenant_id,25)->'commands','[]'::jsonb);
  end if;$boundary$);

select pg_temp.patch_staff_boundary('public.platform_server_personal_home_commands(uuid,uuid,integer)'::regprocedure,
$boundary$Non-task player, club, market and deal signals remain shared agency evidence.$boundary$,
$boundary$Agency signals require administrator access; other staff receive their own assigned tasks.$boundary$);

select pg_temp.patch_staff_boundary('public.platform_server_agency_create_options(uuid,uuid)'::regprocedure,
$boundary$      and p.football_status <> 'retired'$boundary$,
$boundary$      and p.football_status <> 'retired'
      and p.archived_at is null
      and (private.user_is_tenant_admin(p_tenant_id,p_actor_user_id) or exists(
        select 1 from public.staff_player_access a where a.player_id=p.id and a.staff_user_id=p_actor_user_id))$boundary$);

select pg_temp.patch_staff_boundary('public.platform_server_agency_create_player(uuid,uuid,text,text,text,text,text,date,text)'::regprocedure,
$boundary$  if v_existing_id is not null then$boundary$,
$boundary$  if v_existing_id is not null and not (private.user_is_tenant_admin(p_tenant_id,p_actor_user_id)
    or exists(select 1 from public.staff_player_access a where a.player_id=v_existing_id and a.staff_user_id=p_actor_user_id)) then
    raise exception 'workspace_access_denied' using errcode='42501';
  end if;
  if v_existing_id is not null then$boundary$);

select pg_temp.patch_staff_boundary('public.platform_server_agency_create_player(uuid,uuid,text,text,text,text,text,date,text)'::regprocedure,
$boundary$  returning id into v_player_id;$boundary$,
$boundary$  returning id into v_player_id;

  -- A new record's creator is its explicit editor. Existing assignments are untouched.
  insert into public.staff_player_access(staff_user_id,player_id,can_edit)
  values(p_actor_user_id,v_player_id,true) on conflict (staff_user_id,player_id) do nothing;$boundary$);

commit;
