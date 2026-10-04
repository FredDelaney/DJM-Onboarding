create table platform.calendar_tasks (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references platform.tenants(id),
 creator_user_id uuid not null, owner_user_id uuid not null,
 visibility text not null check(visibility in ('personal','company')),
 title text not null check(length(trim(title)) between 1 and 200),
 notes text not null default '' check(length(notes)<=2000),
 due_on date, due_time time, time_zone text, due_at timestamptz,
 status text not null default 'open' check(status in ('open','done')),
 archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 revision integer not null default 1, create_input jsonb not null,
 check(visibility<>'personal' or owner_user_id=creator_user_id),
 check((due_time is null and time_zone is null and due_at is null) or (due_on is not null and due_time is not null and time_zone is not null and due_at is not null))
);
alter table platform.calendar_tasks enable row level security;
create policy calendar_tasks_no_direct_access on platform.calendar_tasks for all to authenticated using(false) with check(false);
revoke all on platform.calendar_tasks from public,anon,authenticated;
create index calendar_tasks_owner_dates on platform.calendar_tasks(tenant_id,owner_user_id,due_on) where archived_at is null;
create index calendar_tasks_company_dates on platform.calendar_tasks(tenant_id,due_on) where visibility='company' and archived_at is null;

create function private.calendar_staff_tenant(p_tenant uuid default null) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=coalesce(p_tenant,private.redream_request_tenant());
begin
 if auth.uid() is null or not exists(select 1 from platform.tenant_memberships m join platform.tenants n on n.id=m.tenant_id and n.status='active'
  where m.tenant_id=t and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin','agent','scout','operations')) then raise exception 'calendar_access_denied'; end if;
 return t;
end;$$;
create function private.calendar_staff_active(t uuid,u uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from platform.tenant_memberships where tenant_id=t and user_id=u and status='active' and role in ('owner','admin','agent','scout','operations'));
$$;
create function private.calendar_task_time(d date,t time,z text) returns timestamptz language plpgsql stable set search_path='' as $$
declare local_time timestamp; possible timestamptz[];
begin
 if t is null then return null; end if;
 if d is null or z is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=z) then raise exception 'task_time_invalid';end if;
 local_time:=d+t;
 with offsets as (select distinct (probe at time zone z)-(probe at time zone 'UTC') delta from generate_series((local_time at time zone 'UTC')-interval '36 hours',(local_time at time zone 'UTC')+interval '36 hours',interval '30 minutes') probe),
 candidates as (select (local_time at time zone 'UTC')-delta instant from offsets)
 select array_agg(distinct instant) into possible from candidates where instant at time zone z=local_time;
 if coalesce(cardinality(possible),0)=0 then raise exception 'task_time_invalid';end if;
 if cardinality(possible)>1 then raise exception 'task_time_ambiguous';end if;
 return possible[1];
end;$$;
create function private.calendar_task_dto(r platform.calendar_tasks) returns jsonb language sql stable set search_path='' as $$
 select (to_jsonb(r)-'create_input')||jsonb_build_object(
  'owner_name',coalesce((select p.display_name from public.profiles p where p.id=r.owner_user_id limit 1),'Team member'),
  'needs_reassignment',not private.calendar_staff_active(r.tenant_id,r.owner_user_id),
  'can_edit',r.owner_user_id=auth.uid() or (r.visibility='company' and (r.creator_user_id=auth.uid() or exists(select 1 from platform.tenant_memberships m where m.tenant_id=r.tenant_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin')))));
$$;
create function private.calendar_task_audit(r platform.calendar_tasks,action_name text) returns void language sql set search_path='' as $$
 insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,metadata)
 values(r.tenant_id,auth.uid(),'user','calendar_task.'||action_name,'calendar_task',r.id::text,jsonb_build_object('revision',r.revision,'visibility',r.visibility));
$$;

create function public.redream_calendar_task_create_v1(p_input jsonb,p_tenant_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t uuid:=private.calendar_staff_tenant(p_tenant_id); u uuid:=auth.uid(); r platform.calendar_tasks; i jsonb;
begin
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('id','title','notes','visibility','owner_user_id','due_on','due_time','time_zone')) then raise exception 'task_input_invalid'; end if;
 r.id:=coalesce((p_input->>'id')::uuid,gen_random_uuid());r.tenant_id:=t;r.creator_user_id:=u;
 r.visibility:=coalesce(p_input->>'visibility','personal');r.owner_user_id:=coalesce((p_input->>'owner_user_id')::uuid,u);
 r.title:=trim(coalesce(p_input->>'title',''));r.notes:=coalesce(p_input->>'notes','');
 if length(r.title) not between 1 and 200 or length(r.notes)>2000 or r.visibility not in ('personal','company') then raise exception 'task_input_invalid'; end if;
 if r.visibility='personal' and r.owner_user_id<>u then raise exception 'task_personal_owner_invalid'; end if;
 if not private.calendar_staff_active(t,r.owner_user_id) then raise exception 'task_owner_inactive'; end if;
 r.due_on:=nullif(p_input->>'due_on','')::date;r.due_time:=nullif(p_input->>'due_time','')::time;
 r.time_zone:=case when r.due_time is not null then p_input->>'time_zone' end;r.due_at:=private.calendar_task_time(r.due_on,r.due_time,r.time_zone);
 i:=jsonb_build_object('title',r.title,'notes',r.notes,'visibility',r.visibility,'owner_user_id',r.owner_user_id,'due_on',r.due_on,'due_time',r.due_time,'time_zone',r.time_zone);
 perform pg_advisory_xact_lock(hashtextextended(r.id::text,0));
 if exists(select 1 from platform.calendar_tasks where id=r.id) then
  select * into r from platform.calendar_tasks where id=r.id;
  if r.tenant_id<>t or r.creator_user_id<>u or r.create_input<>i then raise exception 'task_create_conflict'; end if;
  return jsonb_build_object('task',private.calendar_task_dto(r));
 end if;
 insert into platform.calendar_tasks(id,tenant_id,creator_user_id,owner_user_id,visibility,title,notes,due_on,due_time,time_zone,due_at,create_input)
 values(r.id,t,u,r.owner_user_id,r.visibility,r.title,r.notes,r.due_on,r.due_time,r.time_zone,r.due_at,i) returning * into r;
 perform private.calendar_task_audit(r,'created');return jsonb_build_object('task',private.calendar_task_dto(r));
end;$$;

create function public.redream_calendar_task_update_v1(p_task_id uuid,p_expected_revision integer,p_action text,p_input jsonb default '{}',p_tenant_id uuid default null) returns jsonb
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

create function public.redream_calendar_tasks_v1(p_start date,p_end date,p_timezone text,p_mode text default 'range',p_include_done boolean default false,p_include_archived boolean default false,p_cursor jsonb default null,p_limit integer default 100,p_tenant_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=private.calendar_staff_tenant(p_tenant_id);n integer:=greatest(1,least(coalesce(p_limit,100),200));items jsonb; total integer; next_id uuid; cursor_id uuid:=(p_cursor->>'id')::uuid;
begin
 if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>124 or p_mode is null or p_mode not in ('range','undated','overdue') or p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'task_range_invalid';end if;
 with visible as materialized(select r.* from platform.calendar_tasks r where r.tenant_id=t and (r.visibility='company' or r.owner_user_id=auth.uid())
  and (coalesce(p_include_done,false) or r.status='open') and (coalesce(p_include_archived,false) or r.archived_at is null)
  and case p_mode
   when 'undated' then r.due_on is null
   when 'overdue' then r.status='open' and r.archived_at is null and case when r.due_at is not null then r.due_at<now() else r.due_on<(now() at time zone p_timezone)::date end
   else case when r.due_at is not null then r.due_at>=(p_start::timestamp at time zone p_timezone) and r.due_at<(p_end::timestamp at time zone p_timezone) else r.due_on>=p_start and r.due_on<p_end end
  end), page as materialized(select * from visible where cursor_id is null or id>cursor_id order by id limit n+1), chosen as (select * from page order by id limit n)
 select coalesce((select jsonb_agg(private.calendar_task_dto(chosen) order by id) from chosen),'[]'),(select count(*) from visible),case when (select count(*) from page)>n then (select id from chosen order by id desc limit 1) end into items,total,next_id;
 return jsonb_build_object('items',items,'count',total,'next_cursor',case when next_id is not null then jsonb_build_object('id',next_id) end,'limited',next_id is not null);
end;$$;
create function public.redream_calendar_task_assignees_v1(p_tenant_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t uuid:=private.calendar_staff_tenant(p_tenant_id);result jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',coalesce(p.display_name,'Team member')) order by p.display_name,m.user_id),'[]') into result
 from platform.tenant_memberships m left join public.profiles p on p.id=m.user_id where m.tenant_id=t and m.status='active' and m.role in ('owner','admin','agent','scout','operations');
 return jsonb_build_object('items',result);
end;$$;

revoke all on function private.calendar_staff_tenant(uuid),private.calendar_staff_active(uuid,uuid),private.calendar_task_time(date,time,text),private.calendar_task_dto(platform.calendar_tasks),private.calendar_task_audit(platform.calendar_tasks,text) from public,anon,authenticated;
revoke all on function public.redream_calendar_task_create_v1(jsonb,uuid),public.redream_calendar_task_update_v1(uuid,integer,text,jsonb,uuid),public.redream_calendar_tasks_v1(date,date,text,text,boolean,boolean,jsonb,integer,uuid),public.redream_calendar_task_assignees_v1(uuid) from public,anon;
grant execute on function public.redream_calendar_task_create_v1(jsonb,uuid),public.redream_calendar_task_update_v1(uuid,integer,text,jsonb,uuid),public.redream_calendar_tasks_v1(date,date,text,text,boolean,boolean,jsonb,integer,uuid),public.redream_calendar_task_assignees_v1(uuid) to authenticated,service_role;
