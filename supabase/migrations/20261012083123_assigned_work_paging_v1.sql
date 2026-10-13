-- Paginated internal assignments, so later and undated work stays available.
create function public.redream_assigned_work_page_v1(p_tenant_id uuid default null,p_cursor integer default null,p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=private.calendar_staff_tenant(p_tenant_id); result jsonb:='[]'; r record; c platform.calendar_tasks; w jsonb; limited boolean:=false; offset_value integer:=greatest(0,coalesce(p_cursor,0)); limit_value integer:=greatest(1,least(coalesce(p_limit,200),200));
begin
 for r in select * from platform.work_responsibilities where tenant_id=t and auth.uid()=any(responsible_user_ids) loop
  w:=private.responsibility_work(r.work_kind,r.work_id);
  if w is not null and (w->>'tenant_id')::uuid=t and (w->>'open')::boolean then
   result:=result||jsonb_build_array(w||jsonb_build_object('work_kind',r.work_kind,'work_id',r.work_id,'responsible_people',private.responsibility_people(t,r.responsible_user_ids)));
  end if;
 end loop;
 for c in select * from platform.calendar_tasks where tenant_id=t and auth.uid()=any(responsible_user_ids) and status='open' and archived_at is null loop
  result:=result||jsonb_build_array(jsonb_build_object('work_kind','calendar_task','work_id',c.id,'title',c.title,'due_at',coalesce(c.due_at::text,c.due_on::text),'date_only',c.due_at is null,'task',private.calendar_task_dto(c),'responsible_people',private.responsibility_people(t,c.responsible_user_ids)));
 end loop;
 limited:=jsonb_array_length(result)>offset_value+limit_value;
 select coalesce(jsonb_agg(v order by nullif(v->>'due_at','')::timestamptz nulls last,v->>'work_id'),'[]'::jsonb) into result from (select v from jsonb_array_elements(result) v order by nullif(v->>'due_at','')::timestamptz nulls last,v->>'work_id' offset offset_value limit limit_value) page;
 return jsonb_build_object('items',result,'limited',limited,'next_cursor',case when limited then offset_value+limit_value end);
end;$$;
revoke all on function public.redream_assigned_work_page_v1(uuid,integer,integer) from public,anon;
grant execute on function public.redream_assigned_work_page_v1(uuid,integer,integer) to authenticated,service_role;
create index calendar_tasks_responsible_people on platform.calendar_tasks using gin(responsible_user_ids);
