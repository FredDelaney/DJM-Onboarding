-- Small internal task editor for Home. Football verification is never changed.
create function private.home_work_state(kind text,id uuid,t uuid,zone text) returns jsonb
language plpgsql stable set search_path='' as $$
declare s jsonb; a platform.audit_events;
begin
 if kind='task' then
  select jsonb_build_object('title',r.title,'due_at',r.due_at,'status',case when r.status='open' then 'open' else 'done' end,'original_status',r.status,'completed_at',r.completed_at,'version',r.updated_at)
  into s from djm_os.tasks r where r.id=home_work_state.id and r.tenant_id=t;
 elsif kind='player_next_action' then
  select jsonb_build_object('title',coalesce(r.next_action,''),'due_at',r.next_action_due,'status',case when nullif(trim(r.next_action),'') is null then 'done' else 'open' end,'completed_at',null,'version',r.updated_at)
  into s from public.players r where r.id=home_work_state.id and r.tenant_id=t;
 elsif kind='calendar_task' then
  select jsonb_build_object('title',r.title,'note',r.notes,'due_at',r.due_at,'due_on',r.due_on,'due_time',r.due_time,'time_zone',r.time_zone,'status',r.status,'revision',r.revision)
  into s from platform.calendar_tasks r where r.id=home_work_state.id and r.tenant_id=t;
  return s;
 end if;
 if s is null then return null;end if;
 select * into a from platform.audit_events e
 where e.tenant_id=t and e.entity_type=kind and e.entity_id=home_work_state.id::text and e.metadata->>'source'='home_work'
 order by e.occurred_at desc,e.id desc limit 1;
 return s||jsonb_build_object('note',case when kind='task' or a.after_state->>'title'=s->>'title' then coalesce(a.after_state->>'note','') else '' end,'note_event_id',a.id);
end;$$;

create function private.home_work(kind text,id uuid,operation text,input jsonb,expected jsonb,requested_tenant uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 t uuid:=private.calendar_staff_tenant(requested_tenant); u uuid:=auth.uid(); zone text:=coalesce(nullif(input->>'time_zone',''),'UTC');
 r djm_os.tasks; p public.players; c platform.calendar_tasks; s jsonb; before_value jsonb; after_value jsonb; result jsonb;
 ids uuid[]; manager boolean; title_value text; note_value text; due_day date; due_value timestamptz; next_title text;
 event platform.audit_events; event_id uuid; token text; old_flag text; calendar_input jsonb; context_value jsonb:='{}'; display_value text;
begin
 if kind is null or kind not in ('task','player_next_action','calendar_task') then raise exception 'home_work_kind_invalid';end if;
 if operation is null or operation not in ('read','update','complete','undo') then raise exception 'home_work_action_invalid';end if;
 if input is null or jsonb_typeof(input)<>'object' or exists(select 1 from jsonb_object_keys(input) k where k not in ('time_zone','title','note','due_on','next_title','next_due_on','undo_token')) then raise exception 'home_work_input_invalid';end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception 'home_work_input_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text||kind||id::text,0));
 manager:=exists(select 1 from platform.tenant_memberships m where m.tenant_id=t and m.user_id=u and m.status='active' and m.role in ('owner','admin'));
 if kind='calendar_task' then
  select * into c from platform.calendar_tasks where tenant_id=t and platform.calendar_tasks.id=home_work.id for update;
  if not found or c.archived_at is not null or (c.visibility='personal' and c.owner_user_id<>u) or not (private.calendar_task_dto(c)->>'can_edit')::boolean then raise exception 'home_work_access_denied';end if;
 else
  if kind='task' then
   select * into r from djm_os.tasks where tenant_id=t and djm_os.tasks.id=home_work.id for update;
   if not found then raise exception 'home_work_access_denied';end if;
   context_value:=jsonb_build_object('player_id',r.player_id,'person_id',r.person_id,'organisation_id',r.organisation_id,'club_need_id',r.club_need_id);
   ids:=array[r.owner_user_id];
  else
   select * into p from public.players where tenant_id=t and public.players.id=home_work.id for update;
   if not found then raise exception 'home_work_access_denied';end if;
   context_value:=jsonb_build_object('player_id',p.id); ids:=array[p.primary_staff_user_id];
  end if;
  select coalesce(ids,'{}'::uuid[])||w.responsible_user_ids into ids from platform.work_responsibilities w where w.tenant_id=t and w.work_kind=kind and w.work_id=home_work.id;
  if not found then ids:=case when kind='task' then array[r.owner_user_id] else array[p.primary_staff_user_id] end;end if;
  if not (manager or coalesce(u=any(ids),false)) then raise exception 'home_work_access_denied';end if;
 end if;
 s:=private.home_work_state(kind,id,t,zone);
 if operation<>'read' then
  if expected is null or expected is distinct from s then raise exception 'home_work_conflict';end if;
  if operation in ('update','complete') and s->>'status'<>'open' then raise exception 'home_work_closed';end if;
  note_value:=case when input?'note' then coalesce(input->>'note','') else s->>'note' end;
  if length(note_value)>2000 then raise exception 'home_work_input_invalid';end if;
  next_title:=trim(coalesce(input->>'next_title',''));
  if next_title<>'' and (kind<>'player_next_action' or operation<>'complete' or length(next_title)>200 or nullif(input->>'next_due_on','') is null) then raise exception 'home_work_input_invalid';end if;
  before_value:=s-'note_event_id';
  if kind='calendar_task' then
   -- Retain calendar privacy: personal content never enters agency audit snapshots.
   if operation in ('update','complete') then
    calendar_input:=jsonb_build_object('notes',note_value);
    if input?'title' then calendar_input:=calendar_input||jsonb_build_object('title',input->>'title');end if;
    if input?'due_on' then
     calendar_input:=calendar_input||jsonb_build_object('due_on',nullif(input->>'due_on',''));
     if nullif(input->>'due_on','') is null then calendar_input:=calendar_input||jsonb_build_object('due_time',null,'time_zone',null);end if;
    end if;
    if operation='update' or note_value is distinct from c.notes or (input?'title' and input->>'title' is distinct from c.title) or (input?'due_on' and nullif(input->>'due_on','') is distinct from c.due_on::text) then
     result:=public.redream_calendar_task_update_v1(id,c.revision,'edit',calendar_input,t);
     c.revision:=(result#>>'{task,revision}')::integer;
    end if;
   end if;
   if operation='complete' then
    result:=public.redream_calendar_task_update_v1(id,c.revision,'complete','{}',t);
    token:=result#>>'{task,revision}';
   elsif operation='undo' then
    if s->>'status'<>'done' or input->>'undo_token' is distinct from c.revision::text then raise exception 'home_work_undo_conflict';end if;
    result:=public.redream_calendar_task_update_v1(id,c.revision,'reopen','{}',t);
   end if;
  else
   title_value:=s->>'title';
   if operation in ('update','complete') and input?'title' then title_value:=trim(coalesce(input->>'title',''));end if;
   if (operation='update' or input?'title') and length(title_value) not between 1 and 200 then raise exception 'home_work_input_invalid';end if;
   begin
    due_day:=case when kind='player_next_action' then p.next_action_due else (r.due_at at time zone zone)::date end;
    if operation in ('update','complete') and input?'due_on' then due_day:=nullif(input->>'due_on','')::date;end if;
    if operation='complete' and kind='player_next_action' then
     title_value:=next_title; due_day:=case when next_title<>'' then (input->>'next_due_on')::date else null end;
    end if;
   exception when invalid_datetime_format or datetime_field_overflow then raise exception 'home_work_input_invalid';end;
   if operation='undo' then
    begin event_id:=(input->>'undo_token')::uuid;exception when invalid_text_representation then raise exception 'home_work_undo_conflict';end;
    select * into event from platform.audit_events e where e.id=event_id and e.tenant_id=t and e.actor_user_id=u and e.entity_type=kind and e.entity_id=home_work.id::text and e.action='home_work.complete' and e.metadata->>'source'='home_work' and e.occurred_at>now()-interval '24 hours';
    if not found or s->>'note_event_id' is distinct from event_id::text or (s-'note_event_id') is distinct from event.after_state then raise exception 'home_work_undo_conflict';end if;
    title_value:=event.before_state->>'title'; note_value:=event.before_state->>'note';
    due_day:=case when kind='player_next_action' then (event.before_state->>'due_at')::date else null end;
   end if;
   if kind='task' then
    due_value:=r.due_at;
    if operation in ('update','complete') and input?'due_on' and due_day is distinct from (r.due_at at time zone zone)::date then
     due_value:=case when due_day is null then null else private.calendar_task_time(due_day,coalesce((r.due_at at time zone zone)::time,'09:00'::time),zone) end;
    end if;
    if operation='undo' then due_value:=(event.before_state->>'due_at')::timestamptz;end if;
    update djm_os.tasks set title=title_value,due_at=due_value,
     status=case when operation='complete' then 'completed' when operation='undo' then event.before_state->>'original_status' else r.status end,
     completed_at=case when operation='complete' then clock_timestamp() when operation='undo' then (event.before_state->>'completed_at')::timestamptz else r.completed_at end,
     updated_at=clock_timestamp() where tenant_id=t and djm_os.tasks.id=home_work.id;
   else
    old_flag:=current_setting('djm.internal_player_service',true);
    perform set_config('djm.internal_player_service','on',true);
    update public.players set next_action=nullif(title_value,''),next_action_due=due_day,updated_at=clock_timestamp() where tenant_id=t and public.players.id=home_work.id;
    perform set_config('djm.internal_player_service',coalesce(old_flag,''),true);
   end if;
   after_value:=(private.home_work_state(kind,id,t,zone)-'note_event_id')||jsonb_build_object('note',case when operation='complete' and next_title<>'' then '' else note_value end);
   insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata,occurred_at)
   values(t,u,'user','home_work.'||operation,kind,id::text,before_value,after_value,jsonb_build_object('source','home_work','completion_note',case when operation='complete' then note_value end,'undo_of',case when operation='undo' then event_id end),clock_timestamp()) returning platform.audit_events.id into event_id;
   if operation='complete' then token:=event_id::text;end if;
  end if;
  s:=private.home_work_state(kind,id,t,zone);
 end if;
 display_value:=case when kind='player_next_action' then concat_ws(': ',coalesce(nullif(p.preferred_name,''),concat_ws(' ',p.first_name,p.last_name)),nullif(s->>'title','')) else s->>'title' end;
 return jsonb_build_object('work',jsonb_build_object('work_kind',kind,'work_id',id,'title',s->>'title','display_title',display_value,'note',s->>'note','due_at',s->>'due_at','due_on',case when kind='calendar_task' then s->>'due_on' when kind='player_next_action' then s->>'due_at' else ((s->>'due_at')::timestamptz at time zone zone)::date::text end,'status',s->>'status','context',context_value,'state',s),'undo_token',token);
end;$$;

-- The exposed function is an invoker; privileges and validation live privately.
create function public.redream_home_work_v1(p_work_kind text,p_work_id uuid,p_action text default 'read',p_input jsonb default '{}',p_expected_state jsonb default null,p_tenant_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select private.home_work(p_work_kind,p_work_id,p_action,p_input,p_expected_state,p_tenant_id);$$;
revoke all on function private.home_work_state(text,uuid,uuid,text) from public,anon,authenticated;
revoke all on function private.home_work(text,uuid,text,jsonb,jsonb,uuid),public.redream_home_work_v1(text,uuid,text,jsonb,jsonb,uuid) from public,anon;
grant execute on function private.home_work(text,uuid,text,jsonb,jsonb,uuid),public.redream_home_work_v1(text,uuid,text,jsonb,jsonb,uuid) to authenticated,service_role;
create index home_work_audit_lookup on platform.audit_events(tenant_id,entity_type,entity_id,occurred_at desc,id desc) where metadata->>'source'='home_work';

-- Empty player actions are completed, so they leave all assignment feeds.
create or replace function private.responsibility_work(kind text,id uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 if kind='task' then
  select jsonb_build_object('tenant_id',t.tenant_id,'owner_user_id',t.owner_user_id,'title',t.title,'due_at',t.due_at,'open',t.status='open','context',jsonb_build_object('player_id',t.player_id,'person_id',t.person_id,'organisation_id',t.organisation_id,'club_need_id',t.club_need_id)) into result from djm_os.tasks t where t.id=responsibility_work.id;
 elsif kind in ('player_next_action','contract_expiry') then
  select jsonb_build_object('tenant_id',p.tenant_id,'owner_user_id',p.primary_staff_user_id,'title',concat_ws(': ',coalesce(nullif(p.preferred_name,''),concat_ws(' ',p.first_name,p.last_name)),case when kind='player_next_action' then coalesce(nullif(p.next_action,''),'Player action') else 'Contract expiry' end),'due_at',case when kind='player_next_action' then p.next_action_due else p.contract_expiry end,'date_only',true,'open',coalesce(p.football_status,'active') not in ('retired','inactive') and (kind<>'player_next_action' or nullif(trim(p.next_action),'') is not null),'context',jsonb_build_object('player_id',p.id)) into result from public.players p where p.id=responsibility_work.id;
 elsif kind in ('career_strategy_review','target_window_end') then
  select jsonb_build_object('tenant_id',s.tenant_id,'owner_user_id',p.primary_staff_user_id,'title',concat_ws(': ',coalesce(nullif(p.preferred_name,''),concat_ws(' ',p.first_name,p.last_name)),case when kind='career_strategy_review' then 'Career review' else 'Move window' end),'due_at',case when kind='career_strategy_review' then s.review_due_at::text else s.strategy#>>'{target_window,end_date}' end,'date_only',true,'open',s.status in ('draft','approved'),'context',jsonb_build_object('player_id',s.player_id)) into result from platform.player_career_strategies s join public.players p on p.id=s.player_id and p.tenant_id=s.tenant_id where s.id=responsibility_work.id;
 elsif kind='deal_next_action' then
  select jsonb_build_object('tenant_id',d.tenant_id,'owner_user_id',d.owner_user_id,'title',concat_ws(': ',d.title,nullif(d.next_action_text,'')),'due_at',d.next_action_at,'open',d.status='active','context',jsonb_build_object('player_id',d.player_id,'deal_room_id',d.id)) into result from djm_os.deal_rooms d where d.id=responsibility_work.id;
 elsif kind='club_need_expiry' then
  select jsonb_build_object('tenant_id',n.tenant_id,'owner_user_id',n.owner_user_id,'title',n.title,'due_at',n.expires_at,'open',n.status='active','context',jsonb_build_object('club_need_id',n.id,'organisation_id',n.organisation_id)) into result from djm_os.club_needs n where n.id=responsibility_work.id;
 elsif kind='player_request_due' then
  select jsonb_build_object('tenant_id',p.tenant_id,'owner_user_id',r.assigned_to_user_id,'title',r.title,'due_at',r.due_at,'open',r.status<>'completed','context',jsonb_build_object('player_id',r.player_id)) into result from public.player_requests r join public.players p on p.id=r.player_id where r.id=responsibility_work.id;
 elsif kind='representation_record_end' then
  select jsonb_build_object('tenant_id',p.tenant_id,'owner_user_id',p.primary_staff_user_id,'title',coalesce(a.title,a.agreement_type,'Agency agreement'),'due_at',a.end_date,'date_only',true,'open',a.status='active','context',jsonb_build_object('player_id',a.player_id)) into result from public.player_agreements a join public.players p on p.id=a.player_id where a.id=responsibility_work.id;
 elsif kind='document_expiry' then
  select jsonb_build_object('tenant_id',p.tenant_id,'owner_user_id',p.primary_staff_user_id,'title',d.title,'due_at',d.expires_at,'date_only',true,'open',true,'context',jsonb_build_object('player_id',d.player_id)) into result from public.player_documents d join public.players p on p.id=d.player_id where d.id=responsibility_work.id;
 else raise exception 'work_kind_invalid';
 end if;
 return result;
end;$$;
