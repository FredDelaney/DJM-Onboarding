-- Staff tags route attention; they do not grant or remove player access.
create table platform.player_staff_tags (
 tenant_id uuid not null references platform.tenants(id),
 player_id uuid primary key references public.players(id) on delete cascade,
 all_staff boolean not null default false,
 user_ids uuid[] not null default '{}',
 revision integer not null default 1,
 updated_by uuid not null,
 updated_at timestamptz not null default now(),
 check(cardinality(user_ids)<=50), check(not all_staff or cardinality(user_ids)=0)
);
alter table platform.player_staff_tags enable row level security;
revoke all on platform.player_staff_tags from public,anon,authenticated;
create policy player_staff_tags_no_direct_access on platform.player_staff_tags
 for all to authenticated using(false) with check(false);
create index player_staff_tags_tenant on platform.player_staff_tags(tenant_id);

create function public.redream_player_staff_tags_v1(
 p_player_id uuid,p_input jsonb default null,p_expected_revision integer default null,p_tenant_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 t uuid:=private.calendar_staff_tenant(p_tenant_id); lead uuid; ids uuid[]; version integer:=0;
 everyone boolean:=false; editable boolean; manager boolean; people jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(t::text||'player_staff_tags'||p_player_id::text,0));
 select primary_staff_user_id into lead from public.players where id=p_player_id and tenant_id=t;
 if not found then raise exception 'player_tags_access_denied';end if;
 select user_ids,all_staff,revision into ids,everyone,version from platform.player_staff_tags where tenant_id=t and player_id=p_player_id;
 if not found then ids:=case when lead is null then '{}'::uuid[] else array[lead] end;everyone:=false;version:=0;end if;
 manager:=exists(select 1 from platform.tenant_memberships where tenant_id=t and user_id=auth.uid() and status='active' and role in ('owner','admin'));
 -- Tagging never becomes a permission escalation. All-staff tags do not confer management rights.
 editable:=manager or coalesce(lead=auth.uid(),false);
 if p_input is not null then
  if not editable then raise exception 'player_tags_edit_denied';end if;
  if p_expected_revision is distinct from version then raise exception 'player_tags_conflict';end if;
  if jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('all_staff','user_ids'))
    or jsonb_typeof(p_input->'all_staff') is distinct from 'boolean' or jsonb_typeof(p_input->'user_ids') is distinct from 'array' then raise exception 'player_tags_input_invalid';end if;
  everyone:=(p_input->>'all_staff')::boolean;
  ids:=private.calendar_responsible_ids(t,p_input->'user_ids',null,'company',auth.uid());
  if everyone and cardinality(ids)>0 then raise exception 'player_tags_input_invalid';end if;
  insert into platform.player_staff_tags(tenant_id,player_id,all_staff,user_ids,revision,updated_by)
  values(t,p_player_id,everyone,ids,version+1,auth.uid())
  on conflict(player_id) do update set all_staff=excluded.all_staff,user_ids=excluded.user_ids,
   revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
  version:=version+1;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,metadata)
  values(t,auth.uid(),'user','player.staff_tags_updated','player',p_player_id::text,jsonb_build_object('revision',version,'all_staff',everyone,'people_count',cardinality(ids)));
 end if;
 people:=private.responsibility_people(t,ids);
 return jsonb_build_object('player_id',p_player_id,'all_staff',everyone,'user_ids',to_jsonb(ids),'people',people,'revision',version,'can_edit',editable);
end;$$;

create function private.player_home_relevant(t uuid,u uuid,p uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.players x left join platform.player_staff_tags tag on tag.player_id=x.id and tag.tenant_id=x.tenant_id
 where x.id=p and x.tenant_id=t and
  case when tag.player_id is not null then tag.all_staff or u=any(tag.user_ids)
   -- Preserve existing lead assignments until a team is explicitly chosen.
   else x.primary_staff_user_id=u end)
 or exists(select 1 from public.players x left join platform.player_staff_tags tag on tag.player_id=x.id and tag.tenant_id=x.tenant_id
  where x.id=p and x.tenant_id=t and ((tag.player_id is null and x.primary_staff_user_id is null) or (not tag.all_staff and cardinality(tag.user_ids)=0))
  and exists(select 1 from platform.tenant_memberships where tenant_id=t and user_id=u and status='active' and role in ('owner','admin')));

$$;

-- This is a relevance filter over already authorised Home records, not a new record reader.
-- All matching uses canonical IDs and tenant-constrained rows; never names or task titles.
create function private.staff_home_item_relevant(t uuid,u uuid,item jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare
 kind text:=coalesce(nullif(item->>'work_kind',''),nullif(item->>'deadline_type',''),nullif(item->>'source_type',''));
 record_id uuid; player uuid; owner_id uuid; ids uuid[]; w jsonb; manager boolean;
begin
 manager:=exists(select 1 from platform.tenant_memberships where tenant_id=t and user_id=u and status='active' and role in ('owner','admin'));
 -- Grouped task commands must never smuggle another person's tasks into My work.
 if jsonb_typeof(item#>'{evidence,tasks}')='array' then
  if jsonb_array_length(item#>'{evidence,tasks}')=0 then return false;end if;
  return not exists(select 1 from jsonb_array_elements(item#>'{evidence,tasks}') task
   where not private.staff_home_item_relevant(t,u,jsonb_build_object('work_kind','task','work_id',coalesce(task->>'task_id',task->>'id'))));
 end if;
 record_id:=nullif(coalesce(item->>'work_id',item->>'task_id',item->>'source_id',item->>'entity_id'),'')::uuid;
 if kind='calendar_task' then
  return exists(select 1 from platform.calendar_tasks c where c.tenant_id=t and c.id=record_id and u=any(c.responsible_user_ids) and c.archived_at is null);
 end if;
 if kind in ('task','player_next_action','career_strategy_review','target_window_end','deal_next_action','club_need_expiry','player_request_due','representation_record_end','document_expiry','contract_expiry') then
  if record_id is null then return false;end if;
  w:=private.responsibility_work(kind,record_id);
  if w is null or (w->>'tenant_id')::uuid is distinct from t then return false;end if;
  select responsible_user_ids into ids from platform.work_responsibilities where tenant_id=t and work_kind=kind and work_id=record_id;
  -- Explicit task/reminder assignments take precedence over the player's team, including an empty selection.
  if found then return u=any(ids) or (manager and cardinality(ids)=0);end if;
  if kind='task' then return coalesce((w->>'owner_user_id')::uuid=u,manager);end if;
  player:=nullif(w#>>'{context,player_id}','')::uuid;
  if player is not null then return private.player_home_relevant(t,u,player);end if;
  return coalesce((w->>'owner_user_id')::uuid=u,manager);
 end if;
 player:=nullif(coalesce(item->>'player_id',item#>>'{context,player_id}',case when kind='player' or item->>'entity_type'='player' then record_id::text end),'')::uuid;
 if player is null and kind='deal_room' then
  select player_id,owner_user_id into player,owner_id from djm_os.deal_rooms where id=record_id and tenant_id=t;
  if not found then return false;end if;
  if owner_id is not null then return owner_id=u;end if;
 end if;
 if player is not null then
  return private.player_home_relevant(t,u,player);
 end if;
 owner_id:=coalesce(owner_id,nullif(item->>'owner_user_id','')::uuid);
 if owner_id is not null then return owner_id=u;end if;
 -- Preserve existing personal meeting/capture and non-player agency signals, which are already scoped by their readers.
 return true;
exception when invalid_text_representation then return false;
end;$$;

-- Showing a tagged reminder never grants the right to complete or reassign it.
create function private.staff_home_item_editable(t uuid,u uuid,item jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare kind text:=coalesce(item->>'work_kind',item->>'deadline_type',item->>'source_type'); record_id uuid; w jsonb;
begin
 if kind not in ('calendar_task','task','player_next_action','career_strategy_review','target_window_end','deal_next_action','club_need_expiry','player_request_due','representation_record_end','document_expiry','contract_expiry') then return false;end if;
 record_id:=nullif(coalesce(item->>'work_id',item->>'task_id',item->>'source_id',item->>'entity_id'),'')::uuid;
 if record_id is null then return false;end if;
 if kind='calendar_task' then return exists(select 1 from platform.calendar_tasks c where c.id=record_id and c.tenant_id=t
  and (c.visibility='company' or c.owner_user_id=u) and (private.calendar_task_dto(c)->>'can_edit')::boolean);end if;
 w:=private.responsibility_work(kind,record_id);
 if w is null or (w->>'tenant_id')::uuid is distinct from t then return false;end if;
 return coalesce((w->>'owner_user_id')::uuid=u,false)
  or exists(select 1 from platform.work_responsibilities where tenant_id=t and work_kind=kind and work_id=record_id and u=any(responsible_user_ids))
  or exists(select 1 from platform.tenant_memberships where tenant_id=t and user_id=u and status='active' and role in ('owner','admin'));
exception when invalid_text_representation then return false;
end;$$;

create function public.redream_home_relevance_v1(p_items jsonb,p_tenant_id uuid default null,p_agency_overview boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t uuid:=private.calendar_staff_tenant(p_tenant_id); manager boolean; visible jsonb; editable jsonb;
begin
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>200 then raise exception 'home_relevance_input_invalid';end if;
 manager:=exists(select 1 from platform.tenant_memberships where tenant_id=t and user_id=auth.uid() and status='active' and role in ('owner','admin'));
 if p_agency_overview and not manager then raise exception 'home_overview_denied';end if;
 select coalesce(jsonb_agg(ordinal-1 order by ordinal),'[]'::jsonb),
  coalesce(jsonb_agg(ordinal-1 order by ordinal) filter(where private.staff_home_item_editable(t,auth.uid(),item)),'[]'::jsonb) into visible,editable
 from jsonb_array_elements(p_items) with ordinality items(item,ordinal)
 where (p_agency_overview and manager) or private.staff_home_item_relevant(t,auth.uid(),item);
 return jsonb_build_object('visible_indices',visible,'editable_indices',editable);
end;$$;
revoke all on function private.player_home_relevant(uuid,uuid,uuid),private.staff_home_item_relevant(uuid,uuid,jsonb),private.staff_home_item_editable(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.redream_player_staff_tags_v1(uuid,jsonb,integer,uuid),public.redream_home_relevance_v1(jsonb,uuid,boolean) from public,anon;
grant execute on function public.redream_player_staff_tags_v1(uuid,jsonb,integer,uuid),public.redream_home_relevance_v1(jsonb,uuid,boolean) to authenticated,service_role;
notify pgrst,'reload schema';
