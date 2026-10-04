-- Require an active resulting company owner for every edit, including unchanged owners.
create or replace function public.redream_calendar_task_update_v1(p_task_id uuid,p_expected_revision integer,p_action text,p_input jsonb default '{}',p_tenant_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t uuid:=private.calendar_staff_tenant(p_tenant_id);r platform.calendar_tasks;
begin
 select * into r from platform.calendar_tasks where id=p_task_id and tenant_id=t for update;
 if not found or (r.visibility='personal' and r.owner_user_id<>auth.uid()) then raise exception 'task_access_denied'; end if;
 if not (private.calendar_task_dto(r)->>'can_edit')::boolean then raise exception 'task_edit_denied'; end if;
 if p_expected_revision is null or p_expected_revision<>r.revision then raise exception 'task_revision_conflict'; end if;
 if p_action is null or p_action not in ('edit','complete','reopen','archive','restore') then raise exception 'task_action_invalid'; end if;
 if r.archived_at is not null and p_action<>'restore' then raise exception 'task_archived'; end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'task_input_invalid'; end if;
 if p_input?'visibility' or p_input?'creator_user_id' then raise exception 'task_visibility_immutable'; end if;
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('title','notes','owner_user_id','due_on','due_time','time_zone')) then raise exception 'task_input_invalid'; end if;
 if p_action='edit' then
  if p_input?'title' then r.title:=trim(coalesce(p_input->>'title','')); end if;
  if p_input?'notes' then r.notes:=coalesce(p_input->>'notes','');end if;
  if length(r.title) not between 1 and 200 or length(r.notes)>2000 then raise exception 'task_input_invalid';end if;
  if p_input?'owner_user_id' then
   r.owner_user_id:=(p_input->>'owner_user_id')::uuid;
   if r.visibility='personal' and r.owner_user_id is distinct from auth.uid() then raise exception 'task_personal_owner_invalid';end if;
   if r.owner_user_id is null or not private.calendar_staff_active(t,r.owner_user_id) then raise exception 'task_owner_inactive';end if;
  end if;
  if r.visibility='company' and not private.calendar_staff_active(t,r.owner_user_id) then raise exception 'task_owner_inactive';end if;
  if p_input?'due_on' then r.due_on:=nullif(p_input->>'due_on','')::date;end if;
  if p_input?'due_time' then r.due_time:=nullif(p_input->>'due_time','')::time;end if;
  if p_input?'time_zone' then r.time_zone:=nullif(p_input->>'time_zone','');end if;
  if r.due_time is null then r.time_zone:=null;end if;
  r.due_at:=private.calendar_task_time(r.due_on,r.due_time,r.time_zone);
 elsif p_action='complete' then r.status:='done';
 elsif p_action='reopen' then r.status:='open';
 elsif p_action='archive' then r.archived_at:=now();
 elsif p_action='restore' then r.archived_at:=null;
 end if;
 update platform.calendar_tasks set owner_user_id=r.owner_user_id,title=r.title,notes=r.notes,due_on=r.due_on,due_time=r.due_time,time_zone=r.time_zone,due_at=r.due_at,status=r.status,archived_at=r.archived_at,revision=revision+1,updated_at=now() where id=r.id returning * into r;
 perform private.calendar_task_audit(r,p_action);return jsonb_build_object('task',private.calendar_task_dto(r));
end;$$;
