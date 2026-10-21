-- One read-only, caller-scoped bridge to existing work and record evidence.
-- No new work store, model request, mutation or sharing permission.
create or replace function public.redream_agency_work_brief_v1(
 p_kind text default null,p_id uuid default null,p_search text default null
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare
 t uuid := private.tell_request_tenant(); u uuid := auth.uid(); admin boolean;
 detail jsonb; entity jsonb; candidate jsonb; found jsonb; candidates jsonb := '[]';
 shared jsonb; shared_item jsonb; work jsonb := '[]'; item jsonb; tasks jsonb; notes jsonb := '[]'; blockers jsonb := '[]';
 record_ref jsonb := null; title text; context_key text; zone text; total integer; limited boolean := false;
begin
 if u is null or not private.user_has_staff_tenant_access(t,u) then raise exception 'staff_tenant_access_required' using errcode='42501';end if;
 admin := private.user_is_tenant_admin(t,u);
 select timezone into zone from public.notification_preferences where user_id=u;
 if zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then zone:='Europe/Rome';end if;
 if p_search is not null then
  if length(trim(p_search)) < 2 then return jsonb_build_object('mode','choose','search',trim(p_search),'candidates','[]'::jsonb,'as_of',now());end if;
  if length(trim(p_search)) > 120 then raise exception 'record_search_required';end if;
  found := public.platform_server_workspace_search(t,u,trim(p_search),12);
  for candidate in select v from jsonb_array_elements(coalesce(found->'items','[]')) v where v->>'kind' in ('player','contact','club','recruitment') loop
   detail := public.platform_server_redream_agent_context(t,u,candidate->>'kind',(candidate->>'id')::uuid);
   if detail is not null then candidates:=candidates||jsonb_build_array(jsonb_build_object('kind',candidate->>'kind','id',candidate->>'id','title',left(candidate->>'title',180)));end if;
  end loop;
  if jsonb_array_length(candidates)<>1 or coalesce((found->>'has_more')::boolean,false) then
   return jsonb_build_object('mode','choose','search',trim(p_search),'candidates',candidates,'limited',coalesce((found->>'has_more')::boolean,false),'as_of',now());
  end if;
  p_kind:=candidates->0->>'kind';p_id:=(candidates->0->>'id')::uuid;
 end if;
 if p_kind is not null or p_id is not null then
  if p_kind is null or p_id is null or p_kind not in ('player','contact','club','recruitment') then raise exception 'record_required';end if;
  detail:=public.platform_server_redream_agent_context(t,u,p_kind,p_id);
  if detail is null then raise exception 'record_access_denied' using errcode='42501';end if;
  entity:=detail->p_kind;
  title:=coalesce(nullif(entity->>'full_name',''),nullif(entity->>'name',''),nullif(entity->>'preferred_name',''),nullif(concat_ws(' ',entity->>'first_name',entity->>'last_name'),''),'Record');
  record_ref:=jsonb_build_object('kind',p_kind,'id',p_id,'title',title);
  context_key:=case p_kind when 'player' then 'player_id' when 'contact' then 'person_id' when 'club' then 'organisation_id' else 'prospect_id' end;
  if admin then
   if p_kind='recruitment' and nullif(trim(concat_ws(' ',entity->>'notes',entity->>'recruitment_notes')),'') is not null then
    notes:=jsonb_build_array(jsonb_build_object('id',p_id,'summary',left(concat_ws(E'\n\n',nullif(entity->>'notes',''),nullif(entity->>'recruitment_notes','')),1600),'source_type','recruitment_record'));
   else
   select coalesce(jsonb_agg(jsonb_build_object('id',v->>'id','occurred_at',v->'occurred_at','summary',left(v->>'summary',1600),'channel',v->'channel','source_type',v->'source_type','confidence',v->'confidence')),'[]') into notes
   from jsonb_array_elements(coalesce(detail->'recent_interactions','[]')) v;
   end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'blocker',left(d.primary_blocker,1000),'next_decision',left(d.next_decision,1000),'due_at',d.next_action_at) order by d.next_action_at nulls last),'[]') into blockers
   from (select * from djm_os.deal_rooms d where d.tenant_id=t and d.status='active' and (to_jsonb(d)->>'archived_at') is null
    and ((p_kind='player' and d.player_id=p_id) or (p_kind='contact' and d.source_person_id=p_id) or (p_kind='club' and d.organisation_id=p_id) or (p_kind='recruitment' and d.prospect_id=p_id))
    and (nullif(trim(d.primary_blocker),'') is not null or nullif(trim(d.next_decision),'') is not null)
    order by d.next_action_at nulls last,d.id limit 8) d;
  end if;
 end if;
 -- Owned legacy tasks; record links are structural, never guessed from task titles.
 select coalesce(jsonb_agg(jsonb_build_object('kind','task','id',w.id,'title',w.title,'status',w.status,'due_at',w.due_at,'date_only',false,'owner_user_id',w.owner_user_id,
  'context',jsonb_strip_nulls(jsonb_build_object('player_id',w.player_id,'person_id',w.person_id,'organisation_id',w.organisation_id,'club_need_id',w.club_need_id))) order by w.due_at nulls last,w.id),'[]') into work
 from (select * from djm_os.tasks x where x.tenant_id=t and x.owner_user_id=u and x.status not in ('completed','done','cancelled','archived') and (to_jsonb(x)->>'archived_at') is null
  and (p_id is null or (p_kind='player' and x.player_id=p_id) or (p_kind='contact' and x.person_id=p_id) or (p_kind='club' and x.organisation_id=p_id)) order by x.due_at nulls last,x.id limit 51) w;
 -- Standalone Calendar tasks have no record association. Include them only in My work.
 if p_id is null then
  select work||coalesce(jsonb_agg(jsonb_build_object('kind','calendar_task','id',w.id,'title',w.title,'status',w.status,'due_at',w.due_at,'due_on',w.due_on,'date_only',w.due_at is null,'owner_user_id',w.owner_user_id,'context','{}'::jsonb) order by w.due_on nulls last,w.id),'[]') into work
  from (select * from platform.calendar_tasks x where x.tenant_id=t and x.owner_user_id=u and x.status='open' and x.archived_at is null order by x.due_on nulls last,x.id limit 51) w;
 end if;
 -- Reuse the established responsibility reader, including jointly assigned work.
 shared:=public.redream_assigned_work_v1(t);
 limited:=coalesce((shared->>'limited')::boolean,false);
 for item in select v from jsonb_array_elements(coalesce(shared->'items','[]')) v loop
  if p_id is null or item->'context'->>context_key=p_id::text then
   shared_item:=jsonb_build_object('kind',item->>'work_kind','id',item->>'work_id','title',left(item->>'title',500),'status','open',
    'due_at',case when coalesce((item->>'date_only')::boolean,false) then null else item->>'due_at' end,
    'due_on',coalesce(item->'task'->>'due_on',case when coalesce((item->>'date_only')::boolean,false) then left(item->>'due_at',10) else null end),
    'date_only',coalesce((item->>'date_only')::boolean,false),'owner_user_id',coalesce(item->>'owner_user_id',item->'task'->>'owner_user_id'),
    'shared',jsonb_array_length(coalesce(item->'responsible_people','[]'))>1,
    'people',coalesce(item->'responsible_people','[]'),'context',coalesce(item->'context','{}'));
   if exists(select 1 from jsonb_array_elements(work) v where v->>'kind'=item->>'work_kind' and v->>'id'=item->>'work_id') then
    select jsonb_agg(case when v->>'kind'=item->>'work_kind' and v->>'id'=item->>'work_id' then v||jsonb_build_object('shared',shared_item->'shared','people',shared_item->'people') else v end) into work from jsonb_array_elements(work) v;
   else work:=work||jsonb_build_array(shared_item);
   end if;
  end if;
 end loop;
 total:=jsonb_array_length(work);limited:=limited or total>40;
 select coalesce(jsonb_agg(v order by nullif(coalesce(v->>'due_at',v->>'due_on'),'')::timestamptz nulls last,v->>'id'),'[]') into tasks
 from (select v||jsonb_build_object('owner_name',coalesce((select display_name from public.profiles where id=nullif(v->>'owner_user_id','')::uuid),'Team member'),
  'overdue',case when coalesce((v->>'date_only')::boolean,false) then nullif(v->>'due_on','')::date<(now() at time zone zone)::date else nullif(v->>'due_at','')::timestamptz<now() end) v
  from jsonb_array_elements(work) v order by nullif(coalesce(v->>'due_at',v->>'due_on'),'')::timestamptz nulls last,v->>'id' limit 40) page;
 return jsonb_build_object('mode','brief','record',record_ref,'tasks',tasks,'notes',notes,'blockers',blockers,'notes_visible',admin,'limited',limited,'as_of',now(),'time_zone',zone,'user_id',u);
end;
$function$;
revoke all on function public.redream_agency_work_brief_v1(text,uuid,text) from public,anon;
grant execute on function public.redream_agency_work_brief_v1(text,uuid,text) to authenticated,service_role;
notify pgrst,'reload schema';
