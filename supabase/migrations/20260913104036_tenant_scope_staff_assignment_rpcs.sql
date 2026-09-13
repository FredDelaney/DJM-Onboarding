-- Make staff lists and assignment RPCs tenant-aware.
create or replace function public.djm_active_team_members()
returns table(user_id uuid, display_name text, role_title text)
language sql
stable
security definer
set search_path=''
as $$
  with caller as (
    select private.primary_active_tenant_id(auth.uid()) as tenant_id
  )
  select tm.user_id,tm.display_name,tm.role_title
  from caller c
  join platform.tenant_memberships m
    on m.tenant_id=c.tenant_id
   and m.status='active'
   and m.role in ('owner','admin','agent','operations','scout')
  join djm_os.team_members tm
    on tm.user_id=m.user_id
   and tm.is_active
  where c.tenant_id is not null
    and private.user_has_staff_tenant_access(c.tenant_id)
  order by lower(coalesce(tm.display_name,'')),tm.created_at;
$$;

create or replace function public.djm_assign_player(p_player_id uuid,p_assigned_to_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_before uuid;
  v_name text;
  v_tenant uuid;
begin
  select p.primary_staff_user_id,
         coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player'),
         p.tenant_id
    into v_before,v_name,v_tenant
  from public.players p
  where p.id=p_player_id
  for update;

  if not found then raise exception 'Player not found'; end if;
  if not private.user_has_staff_tenant_access(v_tenant) then raise exception 'Agency staff access required'; end if;
  if p_assigned_to_user_id is not null and not private.user_has_staff_tenant_access(v_tenant,p_assigned_to_user_id) then
    raise exception 'Active agency staff member not found';
  end if;

  update public.players
  set primary_staff_user_id=p_assigned_to_user_id,updated_at=now()
  where id=p_player_id and tenant_id=v_tenant;

  if p_assigned_to_user_id is not null then
    update public.player_requests
    set assigned_to_user_id=p_assigned_to_user_id,updated_at=now()
    where player_id=p_player_id and status='open' and assigned_to_user_id is null;
  end if;

  insert into djm_os.events(tenant_id,event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values(v_tenant,'PLAYER_ASSIGNMENT_UPDATED',auth.uid(),p_player_id,
    jsonb_build_object('player_id',p_player_id,'player_name',v_name,'previous_assigned_to_user_id',v_before,'assigned_to_user_id',p_assigned_to_user_id),
    'manual_ui',1,now());

  return jsonb_build_object('player_id',p_player_id,'assigned_to_user_id',p_assigned_to_user_id);
end;
$$;

create or replace function public.djm_assign_player_request(p_request_id uuid,p_assigned_to_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_before uuid;
  v_player_id uuid;
  v_tenant uuid;
begin
  select r.assigned_to_user_id,r.player_id,p.tenant_id
    into v_before,v_player_id,v_tenant
  from public.player_requests r
  join public.players p on p.id=r.player_id
  where r.id=p_request_id
  for update of r;

  if not found then raise exception 'Player request not found'; end if;
  if not private.user_has_staff_tenant_access(v_tenant) then raise exception 'Agency staff access required'; end if;
  if p_assigned_to_user_id is not null and not private.user_has_staff_tenant_access(v_tenant,p_assigned_to_user_id) then
    raise exception 'Active agency staff member not found';
  end if;

  update public.player_requests
  set assigned_to_user_id=p_assigned_to_user_id,updated_at=now()
  where id=p_request_id;

  insert into djm_os.events(tenant_id,event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values(v_tenant,'PLAYER_REQUEST_ASSIGNMENT_UPDATED',auth.uid(),v_player_id,
    jsonb_build_object('request_id',p_request_id,'previous_assigned_to_user_id',v_before,'assigned_to_user_id',p_assigned_to_user_id),
    'manual_ui',1,now());

  return jsonb_build_object('request_id',p_request_id,'assigned_to_user_id',p_assigned_to_user_id);
end;
$$;

create or replace function public.djm_recruitment_assign_owner(p_prospect_id uuid,p_owner_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_before uuid;
  v_name text;
  v_tenant uuid;
begin
  select sp.owner_user_id,sp.full_name,sp.tenant_id
    into v_before,v_name,v_tenant
  from djm_os.scouting_prospects sp
  where sp.id=p_prospect_id and sp.linked_player_id is null
  for update;

  if not found then raise exception 'Recruitment target not found'; end if;
  if not private.user_has_staff_tenant_access(v_tenant) then raise exception 'Agency staff access required'; end if;
  if p_owner_user_id is not null and not private.user_has_staff_tenant_access(v_tenant,p_owner_user_id) then
    raise exception 'Active agency staff member not found';
  end if;

  update djm_os.scouting_prospects
  set owner_user_id=p_owner_user_id,updated_at=now()
  where id=p_prospect_id and tenant_id=v_tenant;

  update djm_os.tasks
  set owner_user_id=p_owner_user_id,updated_at=now()
  where tenant_id=v_tenant
    and source='recruitment:'||p_prospect_id::text
    and status not in ('done','completed','cancelled');

  insert into djm_os.events(tenant_id,event_type,actor_user_id,payload,source,confidence,occurred_at)
  values(v_tenant,'RECRUITMENT_OWNER_UPDATED',auth.uid(),
    jsonb_build_object('prospect_id',p_prospect_id,'player_name',v_name,'previous_owner_user_id',v_before,'owner_user_id',p_owner_user_id),
    'recruitment',1,now());

  return jsonb_build_object('prospect_id',p_prospect_id,'owner_user_id',p_owner_user_id);
end;
$$;

create or replace function public.djm_task_assign_owner(p_task_id uuid,p_owner_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_before uuid;
  v_player uuid;
  v_tenant uuid;
begin
  select t.owner_user_id,t.player_id,t.tenant_id
    into v_before,v_player,v_tenant
  from djm_os.tasks t
  where t.id=p_task_id
  for update;

  if not found then raise exception 'Task not found'; end if;
  if not private.user_has_staff_tenant_access(v_tenant) then raise exception 'Agency staff access required'; end if;
  if p_owner_user_id is not null and not private.user_has_staff_tenant_access(v_tenant,p_owner_user_id) then
    raise exception 'Active agency staff member not found';
  end if;

  update djm_os.tasks set owner_user_id=p_owner_user_id,updated_at=now()
  where id=p_task_id and tenant_id=v_tenant;

  insert into djm_os.events(tenant_id,event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values(v_tenant,'TASK_OWNER_UPDATED',auth.uid(),v_player,
    jsonb_build_object('task_id',p_task_id,'previous_owner_user_id',v_before,'owner_user_id',p_owner_user_id),
    'manual_ui',1,now());

  return jsonb_build_object('task_id',p_task_id,'owner_user_id',p_owner_user_id);
end;
$$;

-- These are signed-in application RPCs, never anonymous APIs.
revoke execute on function public.djm_active_team_members() from anon;
revoke execute on function public.djm_assign_player(uuid,uuid) from anon;
revoke execute on function public.djm_assign_player_request(uuid,uuid) from anon;
revoke execute on function public.djm_recruitment_assign_owner(uuid,uuid) from anon;
revoke execute on function public.djm_task_assign_owner(uuid,uuid) from anon;
revoke execute on function public.djm_player_voice_settings() from anon;
grant execute on function public.djm_active_team_members() to authenticated;
grant execute on function public.djm_assign_player(uuid,uuid) to authenticated;
grant execute on function public.djm_assign_player_request(uuid,uuid) to authenticated;
grant execute on function public.djm_recruitment_assign_owner(uuid,uuid) to authenticated;
grant execute on function public.djm_task_assign_owner(uuid,uuid) to authenticated;
grant execute on function public.djm_player_voice_settings() to authenticated;;
