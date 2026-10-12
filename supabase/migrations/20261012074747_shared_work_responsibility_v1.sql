-- Several agency members can share a task. Legacy owners remain compatible.
alter table platform.calendar_tasks add column responsible_user_ids uuid[] not null default '{}';
update platform.calendar_tasks set responsible_user_ids=array[owner_user_id];
alter table platform.calendar_tasks add constraint calendar_task_responsibility_limit check(cardinality(responsible_user_ids)<=50);
alter table platform.calendar_tasks add constraint calendar_task_personal_responsibility check(visibility<>'personal' or responsible_user_ids=array[creator_user_id]);
alter table platform.calendar_tasks add constraint calendar_task_primary_responsibility check(cardinality(responsible_user_ids)=0 or owner_user_id=responsible_user_ids[1]);

create function private.calendar_responsible_ids(t uuid,requested jsonb,fallback uuid,visibility text,creator uuid)
returns uuid[] language plpgsql stable set search_path='' as $$
declare ids uuid[];
begin
 if requested is null then ids:=array[fallback];
 else
  if jsonb_typeof(requested)<>'array' or jsonb_array_length(requested)>50 then raise exception 'task_input_invalid';end if;
  if exists(select 1 from jsonb_array_elements(requested) v where jsonb_typeof(v)<>'string') then raise exception 'task_input_invalid';end if;
  select coalesce(array_agg(distinct v::uuid order by v::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(requested) v;
 end if;
 if visibility='personal' and ids is distinct from array[creator] then raise exception 'task_personal_owner_invalid';end if;
 if exists(select 1 from unnest(ids) id where id is null or not private.calendar_staff_active(t,id)) then raise exception 'task_owner_inactive';end if;
 return ids;
exception when invalid_text_representation then raise exception 'task_input_invalid';
end;$$;

create or replace function private.calendar_task_dto(r platform.calendar_tasks) returns jsonb language sql stable set search_path='' as $$
 select (to_jsonb(r)-'create_input')||jsonb_build_object(
  'owner_name',coalesce((select p.display_name from public.profiles p where p.id=r.owner_user_id limit 1),'Team member'),
  'responsible_people',coalesce((select jsonb_agg(jsonb_build_object('user_id',u.id,'display_name',coalesce(p.display_name,'Team member'),'active',private.calendar_staff_active(r.tenant_id,u.id)) order by ordinal) from unnest(r.responsible_user_ids) with ordinality u(id,ordinal) left join public.profiles p on p.id=u.id),'[]'::jsonb),
  'needs_reassignment',exists(select 1 from unnest(r.responsible_user_ids) id where not private.calendar_staff_active(r.tenant_id,id)),
  'can_edit',auth.uid()=any(r.responsible_user_ids) or (r.visibility='company' and (r.creator_user_id=auth.uid() or exists(select 1 from platform.tenant_memberships m where m.tenant_id=r.tenant_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin')))));
$$;
revoke all on function private.calendar_responsible_ids(uuid,jsonb,uuid,text,uuid) from public,anon,authenticated;

create or replace function public.redream_calendar_task_create_v1(p_input jsonb,p_tenant_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t uuid:=private.calendar_staff_tenant(p_tenant_id); u uuid:=auth.uid(); r platform.calendar_tasks; i jsonb;
begin
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('id','title','notes','visibility','owner_user_id','responsible_user_ids','due_on','due_time','time_zone')) then raise exception 'task_input_invalid'; end if;
 r.id:=coalesce((p_input->>'id')::uuid,gen_random_uuid());r.tenant_id:=t;r.creator_user_id:=u;
 r.visibility:=coalesce(p_input->>'visibility','personal');r.owner_user_id:=coalesce((p_input->>'owner_user_id')::uuid,u);
 r.responsible_user_ids:=private.calendar_responsible_ids(t,p_input->'responsible_user_ids',r.owner_user_id,r.visibility,u);
 r.owner_user_id:=coalesce(r.responsible_user_ids[1],u);
 r.title:=trim(coalesce(p_input->>'title',''));r.notes:=coalesce(p_input->>'notes','');
 if length(r.title) not between 1 and 200 or length(r.notes)>2000 or r.visibility not in ('personal','company') then raise exception 'task_input_invalid'; end if;
 if r.visibility='personal' and r.owner_user_id<>u then raise exception 'task_personal_owner_invalid'; end if;
 if not private.calendar_staff_active(t,r.owner_user_id) then raise exception 'task_owner_inactive'; end if;
 r.due_on:=nullif(p_input->>'due_on','')::date;r.due_time:=nullif(p_input->>'due_time','')::time;
 r.time_zone:=case when r.due_time is not null then p_input->>'time_zone' end;r.due_at:=private.calendar_task_time(r.due_on,r.due_time,r.time_zone);
 i:=jsonb_build_object('title',r.title,'notes',r.notes,'visibility',r.visibility,'owner_user_id',r.owner_user_id,'responsible_user_ids',to_jsonb(r.responsible_user_ids),'due_on',r.due_on,'due_time',r.due_time,'time_zone',r.time_zone);
 perform pg_advisory_xact_lock(hashtextextended(r.id::text,0));
 if exists(select 1 from platform.calendar_tasks where id=r.id) then
  select * into r from platform.calendar_tasks where id=r.id;
  if r.tenant_id<>t or r.creator_user_id<>u or (r.create_input||case when not(r.create_input?'responsible_user_ids') then jsonb_build_object('responsible_user_ids',jsonb_build_array(r.create_input->>'owner_user_id')) else '{}'::jsonb end)<>i then raise exception 'task_create_conflict'; end if;
  return jsonb_build_object('task',private.calendar_task_dto(r));
 end if;
 insert into platform.calendar_tasks(id,tenant_id,creator_user_id,owner_user_id,responsible_user_ids,visibility,title,notes,due_on,due_time,time_zone,due_at,create_input)
 values(r.id,t,u,r.owner_user_id,r.responsible_user_ids,r.visibility,r.title,r.notes,r.due_on,r.due_time,r.time_zone,r.due_at,i) returning * into r;
 perform private.calendar_task_audit(r,'created');return jsonb_build_object('task',private.calendar_task_dto(r));
end;$$;


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
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('title','notes','owner_user_id','responsible_user_ids','due_on','due_time','time_zone')) then raise exception 'task_input_invalid'; end if;
 if p_action='edit' then
  if p_input?'title' then r.title:=trim(coalesce(p_input->>'title','')); end if;
  if p_input?'notes' then r.notes:=coalesce(p_input->>'notes','');end if;
  if length(r.title) not between 1 and 200 or length(r.notes)>2000 then raise exception 'task_input_invalid';end if;
  if p_input?'responsible_user_ids' or p_input?'owner_user_id' then
   r.responsible_user_ids:=private.calendar_responsible_ids(t,p_input->'responsible_user_ids',coalesce((p_input->>'owner_user_id')::uuid,r.owner_user_id),r.visibility,r.creator_user_id);
   r.owner_user_id:=coalesce(r.responsible_user_ids[1],r.creator_user_id);
  end if;
  if r.visibility='company' and exists(select 1 from unnest(r.responsible_user_ids) id where not private.calendar_staff_active(t,id)) then raise exception 'task_owner_inactive';end if;
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
 update platform.calendar_tasks set owner_user_id=r.owner_user_id,responsible_user_ids=r.responsible_user_ids,title=r.title,notes=r.notes,due_on=r.due_on,due_time=r.due_time,time_zone=r.time_zone,due_at=r.due_at,status=r.status,archived_at=r.archived_at,revision=revision+1,updated_at=now() where id=r.id returning * into r;
 perform private.calendar_task_audit(r,p_action);return jsonb_build_object('task',private.calendar_task_dto(r));
end;$$;
