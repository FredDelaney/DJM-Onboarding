-- Internal responsibility for existing tasks and dated agency work.
create table platform.work_responsibilities (
 tenant_id uuid not null references platform.tenants(id),
 work_kind text not null check(work_kind in ('task','player_next_action','career_strategy_review','target_window_end','deal_next_action','club_need_expiry','player_request_due','representation_record_end','document_expiry','contract_expiry')),
 work_id uuid not null, responsible_user_ids uuid[] not null default '{}',
 revision integer not null default 1, updated_by uuid not null, updated_at timestamptz not null default now(),
 primary key(tenant_id,work_kind,work_id), check(cardinality(responsible_user_ids)<=50)
);
alter table platform.work_responsibilities enable row level security;
create policy work_responsibilities_no_direct_access on platform.work_responsibilities for all to authenticated using(false) with check(false);
revoke all on platform.work_responsibilities from public,anon,authenticated;
create index work_responsibilities_people on platform.work_responsibilities using gin(responsible_user_ids);

create function private.responsibility_work(kind text,id uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 if kind='task' then
  select jsonb_build_object('tenant_id',t.tenant_id,'owner_user_id',t.owner_user_id,'title',t.title,'due_at',t.due_at,'open',t.status='open','context',jsonb_build_object('player_id',t.player_id,'person_id',t.person_id,'organisation_id',t.organisation_id,'club_need_id',t.club_need_id)) into result from djm_os.tasks t where t.id=responsibility_work.id;
 elsif kind in ('player_next_action','contract_expiry') then
  select jsonb_build_object('tenant_id',p.tenant_id,'owner_user_id',p.primary_staff_user_id,'title',concat_ws(': ',coalesce(nullif(p.preferred_name,''),concat_ws(' ',p.first_name,p.last_name)),case when kind='player_next_action' then coalesce(nullif(p.next_action,''),'Player action') else 'Contract expiry' end),'due_at',case when kind='player_next_action' then p.next_action_due else p.contract_expiry end,'date_only',true,'open',coalesce(p.football_status,'active') not in ('retired','inactive'),'context',jsonb_build_object('player_id',p.id)) into result from public.players p where p.id=responsibility_work.id;
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

create function private.responsibility_people(t uuid,ids uuid[]) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('user_id',u.id,'display_name',coalesce(p.display_name,'Team member'),'active',private.calendar_staff_active(t,u.id)) order by u.ordinal),'[]'::jsonb)
 from unnest(ids) with ordinality u(id,ordinal) left join public.profiles p on p.id=u.id;
$$;

create function public.redream_work_responsibility_v1(p_work_kind text,p_work_id uuid,p_user_ids jsonb default null,p_expected_revision integer default null,p_tenant_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=private.calendar_staff_tenant(p_tenant_id); w jsonb; ids uuid[]; version integer:=0; manager boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(t::text||p_work_kind||p_work_id::text,0));
 w:=private.responsibility_work(p_work_kind,p_work_id);
 if w is null or (w->>'tenant_id')::uuid is distinct from t then raise exception 'work_access_denied';end if;
 select r.responsible_user_ids,r.revision into ids,version from platform.work_responsibilities r where r.tenant_id=t and r.work_kind=p_work_kind and r.work_id=p_work_id;
 if not found then ids:=case when nullif(w->>'owner_user_id','') is not null then array[(w->>'owner_user_id')::uuid] else '{}'::uuid[] end;version:=0;end if;
 manager:=exists(select 1 from platform.tenant_memberships m where m.tenant_id=t and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin'));
 if not(manager or coalesce(auth.uid()=(w->>'owner_user_id')::uuid,false) or auth.uid()=any(ids)) then raise exception 'work_access_denied';end if;
 if p_user_ids is not null then
  if p_expected_revision is distinct from version then raise exception 'task_revision_conflict';end if;
  ids:=private.calendar_responsible_ids(t,p_user_ids,null,'company',auth.uid());
  insert into platform.work_responsibilities(tenant_id,work_kind,work_id,responsible_user_ids,revision,updated_by)
  values(t,p_work_kind,p_work_id,ids,version+1,auth.uid())
  on conflict(tenant_id,work_kind,work_id) do update set responsible_user_ids=excluded.responsible_user_ids,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
  version:=version+1;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,metadata)
  values(t,auth.uid(),'user','work.responsibility_updated',p_work_kind,p_work_id::text,jsonb_build_object('revision',version,'people_count',cardinality(ids)));
 end if;
 return jsonb_build_object('work_kind',p_work_kind,'work_id',p_work_id,'revision',version,'user_ids',to_jsonb(ids),'people',private.responsibility_people(t,ids));
end;$$;

create function public.redream_assigned_work_v1(p_tenant_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=private.calendar_staff_tenant(p_tenant_id); result jsonb:='[]'; r record; c platform.calendar_tasks; w jsonb; limited boolean:=false;
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
 limited:=jsonb_array_length(result)>200;
 select coalesce(jsonb_agg(v order by nullif(v->>'due_at','')::timestamptz nulls last,v->>'work_id'),'[]'::jsonb) into result from (select v from jsonb_array_elements(result) v order by nullif(v->>'due_at','')::timestamptz nulls last,v->>'work_id' limit 200) page;
 return jsonb_build_object('items',result,'limited',limited);
end;$$;
revoke all on function private.responsibility_work(text,uuid),private.responsibility_people(uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.redream_work_responsibility_v1(text,uuid,jsonb,integer,uuid),public.redream_assigned_work_v1(uuid) from public,anon;
grant execute on function public.redream_work_responsibility_v1(text,uuid,jsonb,integer,uuid),public.redream_assigned_work_v1(uuid) to authenticated,service_role;
