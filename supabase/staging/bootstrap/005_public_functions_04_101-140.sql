-- DJM Player staging public-function bootstrap — batch 04
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- all private/djm_os function batches, and public function batches 01-03.
--
-- Exact current-production definitions for public functions 101-140 of 240,
-- ordered by function name + identity arguments.
-- Production body MD5: 65d39544ba8d6d0d195e7620702d7258
--
-- Existing staging public platform_server_* RPCs were checked for collisions
-- before public bootstrap recovery; no exact production name/signature
-- collision was found.
--
-- Body validation is disabled only during bootstrap because later public
-- batches may provide cross-function dependencies. No function is executed.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.djm_network_meeting_brief(p_meeting_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with m as (
  select * from djm_os.meetings where id=p_meeting_id and (owner_user_id=auth.uid() or djm_os.is_team_member())
)
select jsonb_build_object(
  'meeting',(select to_jsonb(x) from (
    select m.id,m.title,m.starts_at,m.ends_at,m.status,m.person_id,p.full_name person_name,m.organisation_id,o.name organisation_name,o.country organisation_country,m.meeting_url,m.invitee_email,m.notes
    from m left join djm_os.people p on p.id=m.person_id left join djm_os.organisations o on o.id=m.organisation_id
  ) x),
  'relationship',coalesce((select jsonb_agg(to_jsonb(x) order by x.strength_score desc) from (
    select r.team_member_id,tm.display_name,r.strength_score,r.trust_score,r.access_score,r.last_meaningful_at,r.relationship_notes
    from m join djm_os.relationships r on r.person_id=m.person_id join djm_os.team_members tm on tm.user_id=r.team_member_id
  ) x),'[]'::jsonb),
  'recent_interactions',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (
    select i.id,i.occurred_at,i.channel,i.summary,tm.display_name team_member_name
    from m join djm_os.interactions i on (i.person_id=m.person_id or (m.organisation_id is not null and i.organisation_id=m.organisation_id))
    left join djm_os.team_members tm on tm.user_id=i.team_member_id
    order by i.occurred_at desc limit 8
  ) x),'[]'::jsonb),
  'active_needs',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
    select n.id,n.title,n.position,n.preferred_foot,n.status,n.confidence,n.profile_notes,n.updated_at,
      (select count(*) from djm_os.player_matches pm where pm.club_need_id=n.id and pm.status not in ('dismissed','rejected')) match_count
    from m join djm_os.club_needs n on n.organisation_id=m.organisation_id where n.status in ('active','open','confirmed')
  ) x),'[]'::jsonb),
  'open_tasks',coalesce((select jsonb_agg(to_jsonb(x) order by x.priority desc,x.due_at asc nulls last) from (
    select t.id,t.title,t.priority,t.due_at,t.status
    from m join djm_os.tasks t on (t.person_id=m.person_id or (m.organisation_id is not null and t.organisation_id=m.organisation_id))
    where t.status not in ('done','completed','cancelled')
  ) x),'[]'::jsonb),
  'opportunities',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
    select po.id,po.player_id,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'Player') player_name,po.stage,po.summary,po.next_action,po.next_action_due,po.updated_at
    from m join djm_os.opportunity_links l on l.organisation_id=m.organisation_id
    join public.player_opportunities po on po.id=l.opportunity_id join public.players p on p.id=po.player_id
    where lower(po.stage) not in ('closed','lost','placed','won')
  ) x),'[]'::jsonb)
);
$function$


CREATE OR REPLACE FUNCTION public.djm_network_meetings(p_scope text DEFAULT 'mine'::text, p_from timestamp with time zone DEFAULT (now() - '30 days'::interval), p_to timestamp with time zone DEFAULT (now() + '180 days'::interval))
 RETURNS TABLE(id uuid, owner_user_id uuid, owner_name text, person_id uuid, person_name text, organisation_id uuid, organisation_name text, title text, starts_at timestamp with time zone, ends_at timestamp with time zone, timezone text, provider text, meeting_url text, invitee_email text, status text, source text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select m.id,m.owner_user_id,tm.display_name,m.person_id,p.full_name,m.organisation_id,o.name,m.title,m.starts_at,m.ends_at,m.timezone,m.provider,m.meeting_url,m.invitee_email,m.status,m.source
  from djm_os.meetings m
  join djm_os.team_members tm on tm.user_id=m.owner_user_id
  left join djm_os.people p on p.id=m.person_id
  left join djm_os.organisations o on o.id=m.organisation_id
  where (p_scope='all' or m.owner_user_id=auth.uid()) and m.starts_at>=p_from and m.starts_at<=p_to
  order by m.starts_at;
$function$


CREATE OR REPLACE FUNCTION public.djm_network_opportunities(p_scope text DEFAULT 'mine'::text)
 RETURNS TABLE(id uuid, player_id uuid, player_name text, club_name text, country text, contact_name text, contact_role text, stage text, summary text, next_action text, next_action_due date, owner_id uuid, owner_name text, last_contacted_at timestamp with time zone, outcome_note text, organisation_id uuid, organisation_name text, person_id uuid, person_name text, club_need_id uuid, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select po.id,po.player_id,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'Player'),po.club_name,po.country,po.contact_name,po.contact_role,po.stage,
         po.summary,po.next_action,po.next_action_due,po.owner_id,tm.display_name,po.last_contacted_at,po.outcome_note,
         l.organisation_id,o.name,l.person_id,pe.full_name,l.club_need_id,po.updated_at
  from public.player_opportunities po
  join public.players p on p.id=po.player_id
  left join djm_os.opportunity_links l on l.opportunity_id=po.id
  left join djm_os.organisations o on o.id=l.organisation_id
  left join djm_os.people pe on pe.id=l.person_id
  left join djm_os.team_members tm on tm.user_id=po.owner_id
  where p_scope='all' or po.owner_id is null or po.owner_id=auth.uid()
  order by case when lower(po.stage) in ('closed','lost','placed','won') then 1 else 0 end,po.next_action_due asc nulls last,po.updated_at desc;
$function$


CREATE OR REPLACE FUNCTION public.djm_network_organisations(p_search text DEFAULT NULL::text, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, name text, organisation_type text, country text, city text, contacts_count bigint, active_needs_count bigint, last_interaction_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select o.id, o.name, o.organisation_type, o.country, o.city,
         (select count(distinct e.person_id) from djm_os.employments e where e.organisation_id=o.id and e.is_current=true),
         (select count(*) from djm_os.club_needs n where n.organisation_id=o.id and n.status in ('active','open','confirmed')),
         (select max(i.occurred_at) from djm_os.interactions i where i.organisation_id=o.id)
  from djm_os.organisations o
  where p_search is null or p_search='' or o.name ilike '%' || p_search || '%'
  order by coalesce((select max(i.occurred_at) from djm_os.interactions i where i.organisation_id=o.id), o.updated_at) desc nulls last, o.name
  limit greatest(1, least(coalesce(p_limit,100),250));
$function$


CREATE OR REPLACE FUNCTION public.djm_network_people(p_search text DEFAULT NULL::text, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, full_name text, preferred_name text, person_type text, country text, city text, current_organisation text, role_title text, relationship_score smallint, last_meaningful_at timestamp with time zone, last_interaction_at timestamp with time zone, whatsapp text, email text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select p.id, p.full_name, p.preferred_name, p.person_type, p.country, p.city,
         eo.name, e.role_title, r.strength_score, r.last_meaningful_at, li.last_interaction_at, cmw.value, cme.value
  from djm_os.people p
  left join lateral (
    select e1.* from djm_os.employments e1
    where e1.person_id = p.id and e1.is_current = true
    order by e1.started_on desc nulls last, e1.created_at desc limit 1
  ) e on true
  left join djm_os.organisations eo on eo.id = e.organisation_id
  left join djm_os.relationships r on r.person_id = p.id and r.team_member_id = auth.uid()
  left join lateral (select max(i.occurred_at) as last_interaction_at from djm_os.interactions i where i.person_id = p.id) li on true
  left join lateral (select value from djm_os.contact_methods c where c.person_id=p.id and c.channel='whatsapp' order by c.is_primary desc, c.updated_at desc limit 1) cmw on true
  left join lateral (select value from djm_os.contact_methods c where c.person_id=p.id and c.channel='email' order by c.is_primary desc, c.updated_at desc limit 1) cme on true
  where p_search is null or p_search = '' or p.full_name ilike '%' || p_search || '%' or eo.name ilike '%' || p_search || '%'
  order by coalesce(li.last_interaction_at, r.last_meaningful_at, p.updated_at) desc nulls last, p.full_name
  limit greatest(1, least(coalesce(p_limit,100),250));
$function$


CREATE OR REPLACE FUNCTION public.djm_network_person(p_person_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select jsonb_build_object(
  'person',(select to_jsonb(p) from (select id,full_name,preferred_name,person_type,country,city,linkedin_url,instagram_url,photo_url,last_verified_at,created_at,updated_at from djm_os.people where id=p_person_id) p),
  'contacts',coalesce((select jsonb_agg(to_jsonb(c) order by c.is_primary desc,c.channel) from (select id,channel,value,is_primary,is_verified,last_verified_at from djm_os.contact_methods where person_id=p_person_id) c),'[]'::jsonb),
  'employment',coalesce((select jsonb_agg(to_jsonb(e) order by e.is_current desc,e.started_on desc nulls last) from (select e.id,e.role_title,e.department,e.started_on,e.ended_on,e.is_current,e.confidence,e.last_verified_at,o.id organisation_id,o.name organisation_name,o.country organisation_country from djm_os.employments e join djm_os.organisations o on o.id=e.organisation_id where e.person_id=p_person_id) e),'[]'::jsonb),
  'relationships',coalesce((select jsonb_agg(to_jsonb(r) order by r.strength_score desc nulls last) from (select r.team_member_id,tm.display_name,r.strength_score,r.access_score,r.trust_score,r.first_known_at,r.last_meaningful_at,r.relationship_notes from djm_os.relationships r join djm_os.team_members tm on tm.user_id=r.team_member_id where r.person_id=p_person_id) r),'[]'::jsonb),
  'interactions',coalesce((select jsonb_agg(to_jsonb(i) order by i.occurred_at desc) from (select i.id,i.occurred_at,i.channel,i.direction,i.summary,i.sentiment,i.source_type,i.organisation_id,o.name organisation_name,tm.display_name team_member_name from djm_os.interactions i left join djm_os.organisations o on o.id=i.organisation_id left join djm_os.team_members tm on tm.user_id=i.team_member_id where i.person_id=p_person_id order by i.occurred_at desc limit 40) i),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.due_at asc nulls last,t.priority desc) from (select id,title,task_type,owner_user_id,due_at,status,priority,source from djm_os.tasks where person_id=p_person_id and status not in ('done','completed','cancelled')) t),'[]'::jsonb)
);
$function$


CREATE OR REPLACE FUNCTION public.djm_network_resolve_review(p_review_id uuid, p_resolution text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_item djm_os.review_items%rowtype;v_res text;
begin
  v_res:=lower(trim(coalesce(p_resolution,'')));
  if v_res not in ('approved','rejected','resolved') then raise exception 'Resolution must be approved, rejected or resolved'; end if;
  select * into v_item from djm_os.review_items where id=p_review_id and status='open';
  if not found then raise exception 'Open review item not found'; end if;
  if v_item.owner_user_id is not null and v_item.owner_user_id<>auth.uid() then raise exception 'Only the assigned owner can resolve this item'; end if;

  update djm_os.review_items set status=v_res,resolved_at=now(),payload=payload||jsonb_build_object('resolution_note',nullif(trim(p_note),''),'resolved_by',auth.uid()) where id=p_review_id;
  if v_item.capture_id is not null then
    update djm_os.captures set status=case when v_res='approved' then 'processed' when v_res='rejected' then 'rejected' else 'resolved' end,processed_at=now() where id=v_item.capture_id;
  end if;
  if v_item.claim_id is not null and v_res='approved' then
    update djm_os.claims set last_verified_at=now() where id=v_item.claim_id;
  end if;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,player_id,payload,source,confidence,occurred_at)
  values('REVIEW_RESOLVED',auth.uid(),v_item.person_id,v_item.organisation_id,v_item.player_id,jsonb_build_object('review_id',p_review_id,'resolution',v_res,'note',nullif(trim(p_note),'')),'review_inbox',1,now());
  return jsonb_build_object('review_id',p_review_id,'status',v_res);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_network_review_inbox(p_scope text DEFAULT 'mine'::text)
 RETURNS TABLE(id uuid, review_type text, title text, detail text, owner_user_id uuid, owner_name text, person_id uuid, person_name text, organisation_id uuid, organisation_name text, player_id uuid, club_need_id uuid, capture_id uuid, claim_id uuid, confidence numeric, payload jsonb, status text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select r.id,r.review_type,r.title,r.detail,r.owner_user_id,tm.display_name,
         r.person_id,p.full_name,r.organisation_id,o.name,r.player_id,r.club_need_id,r.capture_id,r.claim_id,r.confidence,r.payload,r.status,r.created_at
  from djm_os.review_items r
  left join djm_os.team_members tm on tm.user_id=r.owner_user_id
  left join djm_os.people p on p.id=r.person_id
  left join djm_os.organisations o on o.id=r.organisation_id
  where r.status='open' and (p_scope='all' or r.owner_user_id is null or r.owner_user_id=auth.uid())
  order by coalesce(r.confidence,0) asc,r.created_at;
$function$


CREATE OR REPLACE FUNCTION public.djm_network_set_task_status(p_task_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_owner uuid; v_new text;
begin
  v_new:=lower(trim(coalesce(p_status,'')));
  if v_new not in ('open','in_progress','done','completed','cancelled','snoozed') then raise exception 'Invalid task status'; end if;
  select owner_user_id into v_owner from djm_os.tasks where id=p_task_id;
  if not found then raise exception 'Task not found'; end if;
  if v_owner is not null and v_owner<>auth.uid() then raise exception 'Only the task owner can change this task'; end if;
  update djm_os.tasks set status=v_new,completed_at=case when v_new in ('done','completed') then now() else null end,updated_at=now() where id=p_task_id;
  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at) values('TASK_STATUS_CHANGED',auth.uid(),jsonb_build_object('task_id',p_task_id,'status',v_new),'network',1,now());
  return jsonb_build_object('task_id',p_task_id,'status',v_new);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_network_suggestions()
 RETURNS TABLE(id uuid, suggestion_type text, title text, reason text, score smallint, person_id uuid, person_name text, organisation_id uuid, organisation_name text, player_id uuid, club_need_id uuid, created_at timestamp with time zone, expires_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select s.id,s.suggestion_type,s.title,s.reason,s.score,s.person_id,p.full_name,s.organisation_id,o.name,s.player_id,s.club_need_id,s.created_at,s.expires_at
  from djm_os.suggestions s
  left join djm_os.people p on p.id=s.person_id
  left join djm_os.organisations o on o.id=s.organisation_id
  where s.status='open' and (s.owner_user_id is null or s.owner_user_id=auth.uid()) and (s.expires_at is null or s.expires_at>now())
  order by s.score desc,s.created_at desc;
$function$


CREATE OR REPLACE FUNCTION public.djm_network_tasks(p_scope text DEFAULT 'mine'::text)
 RETURNS TABLE(id uuid, title text, task_type text, owner_user_id uuid, owner_name text, person_id uuid, person_name text, organisation_id uuid, organisation_name text, due_at timestamp with time zone, status text, priority smallint, source text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select t.id,t.title,t.task_type,t.owner_user_id,tm.display_name,
         t.person_id,p.full_name,t.organisation_id,o.name,t.due_at,t.status,t.priority,t.source,t.created_at
  from djm_os.tasks t
  left join djm_os.team_members tm on tm.user_id=t.owner_user_id
  left join djm_os.people p on p.id=t.person_id
  left join djm_os.organisations o on o.id=t.organisation_id
  where p_scope='all' or t.owner_user_id is null or t.owner_user_id=auth.uid()
  order by case when t.status in ('done','completed','cancelled') then 1 else 0 end,
           t.priority desc,t.due_at asc nulls last,t.created_at desc;
$function$


CREATE OR REPLACE FUNCTION public.djm_network_update_club_profile(p_organisation_id uuid, p_name text, p_country text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_website_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_name text:=nullif(trim(coalesce(p_name,'')),'');
  v_key text;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if v_name is null then raise exception 'Club name is required'; end if;
  if not exists(select 1 from djm_os.organisations where id=p_organisation_id) then raise exception 'Club not found'; end if;
  v_key:=djm_os.canonical_org_key(v_name);
  if exists(select 1 from djm_os.organisations where canonical_key=v_key and id<>p_organisation_id) then
    raise exception 'Another club already uses this name';
  end if;

  update djm_os.organisations
  set name=v_name,
      canonical_key=v_key,
      organisation_type='club',
      country=nullif(trim(coalesce(p_country,'')),''),
      city=nullif(trim(coalesce(p_city,'')),''),
      website_url=nullif(trim(coalesce(p_website_url,'')),''),
      last_verified_at=now(),
      updated_at=now()
  where id=p_organisation_id;

  insert into djm_os.events(event_type,actor_user_id,organisation_id,payload,source,confidence,occurred_at)
  values('CLUB_PROFILE_UPDATED',auth.uid(),p_organisation_id,jsonb_build_object('name',v_name),'network',1,now());
  return jsonb_build_object('organisation_id',p_organisation_id,'updated',true);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_network_update_contact_profile(p_person_id uuid, p_full_name text, p_preferred_name text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_club_name text DEFAULT NULL::text, p_club_country text DEFAULT NULL::text, p_role_title text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_org_id uuid;
  v_old_org uuid;
  v_name text := nullif(trim(p_full_name),'');
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=v_uid and tm.is_active) then raise exception 'DJM team access required'; end if;
  if v_name is null or length(v_name)<2 then raise exception 'Name is required'; end if;
  if not exists(select 1 from djm_os.people p where p.id=p_person_id and coalesce(p.person_type,'club_contact')<>'player') then raise exception 'Club contact not found'; end if;

  update djm_os.people
  set full_name=v_name,
      preferred_name=nullif(trim(p_preferred_name),''),
      country=nullif(trim(p_country),''),
      city=nullif(trim(p_city),''),
      updated_at=now(),
      last_verified_at=now()
  where id=p_person_id;

  select organisation_id into v_old_org from djm_os.employments where person_id=p_person_id and is_current=true order by updated_at desc limit 1;

  if nullif(trim(p_club_name),'') is not null then
    v_org_id := djm_os.ensure_organisation(trim(p_club_name),nullif(trim(p_club_country),''));
    update djm_os.employments
    set is_current=false,ended_on=coalesce(ended_on,current_date),updated_at=now()
    where person_id=p_person_id and is_current=true and organisation_id<>v_org_id;

    if exists(select 1 from djm_os.employments where person_id=p_person_id and organisation_id=v_org_id and is_current=true) then
      update djm_os.employments set role_title=nullif(trim(p_role_title),''),last_verified_at=now(),updated_at=now() where person_id=p_person_id and organisation_id=v_org_id and is_current=true;
    else
      insert into djm_os.employments(person_id,organisation_id,role_title,is_current,confidence,last_verified_at)
      values(p_person_id,v_org_id,nullif(trim(p_role_title),''),true,1,now());
    end if;
  else
    update djm_os.employments set is_current=false,ended_on=coalesce(ended_on,current_date),updated_at=now() where person_id=p_person_id and is_current=true;
    v_org_id := null;
  end if;

  update djm_os.conversation_threads
  set person_id=p_person_id,
      organisation_id=v_org_id,
      thread_label=v_name,
      updated_at=now()
  where person_id=p_person_id;

  update djm_os.interactions set organisation_id=v_org_id where person_id=p_person_id and (organisation_id is null or organisation_id=v_old_org);

  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at)
  values('CONTACT_PROFILE_UPDATED',v_uid,p_person_id,v_org_id,jsonb_build_object('name',v_name,'club',nullif(trim(p_club_name),''),'role',nullif(trim(p_role_title),'')),'network',1,now());

  return jsonb_build_object('person_id',p_person_id,'organisation_id',v_org_id,'full_name',v_name,'club_name',nullif(trim(p_club_name),''),'role_title',nullif(trim(p_role_title),''));
end
$function$


CREATE OR REPLACE FUNCTION public.djm_network_update_relationship(p_person_id uuid, p_strength_score smallint DEFAULT NULL::smallint, p_access_score smallint DEFAULT NULL::smallint, p_trust_score smallint DEFAULT NULL::smallint, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_uid uuid:=(select auth.uid());
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=v_uid and tm.is_active) then raise exception 'DJM team access required'; end if;
  if p_strength_score is not null and (p_strength_score<0 or p_strength_score>100) then raise exception 'Strength must be 0-100'; end if;
  if p_access_score is not null and (p_access_score<0 or p_access_score>100) then raise exception 'Access must be 0-100'; end if;
  if p_trust_score is not null and (p_trust_score<0 or p_trust_score>100) then raise exception 'Trust must be 0-100'; end if;

  insert into djm_os.relationships(team_member_id,person_id,strength_score,access_score,trust_score,relationship_notes,first_known_at,updated_at)
  values(v_uid,p_person_id,coalesce(p_strength_score,20),coalesce(p_access_score,20),coalesce(p_trust_score,50),nullif(trim(coalesce(p_notes,'')),''),now(),now())
  on conflict(team_member_id,person_id) do update set
    strength_score=coalesce(p_strength_score,djm_os.relationships.strength_score),
    access_score=coalesce(p_access_score,djm_os.relationships.access_score),
    trust_score=coalesce(p_trust_score,djm_os.relationships.trust_score),
    relationship_notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),djm_os.relationships.relationship_notes),
    updated_at=now();

  insert into djm_os.events(event_type,actor_user_id,person_id,payload,source,confidence,occurred_at)
  values('RELATIONSHIP_UPDATED',v_uid,p_person_id,jsonb_build_object('strength',p_strength_score,'access',p_access_score,'trust',p_trust_score,'notes',p_notes),'network',1,now());
  return jsonb_build_object('ok',true,'person_id',p_person_id);
end $function$


CREATE OR REPLACE FUNCTION public.djm_network_upsert_club(p_name text, p_country text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_website_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  if p_name is null or length(trim(p_name))<2 then raise exception 'Club name is required'; end if;
  v_id:=djm_os.ensure_organisation(trim(p_name),nullif(trim(p_country),''));
  update djm_os.organisations
  set organisation_type='club',
      country=coalesce(nullif(trim(p_country),''),country),
      city=coalesce(nullif(trim(p_city),''),city),
      website_url=coalesce(nullif(trim(p_website_url),''),website_url),
      updated_at=now()
  where id=v_id;
  insert into djm_os.events(event_type,actor_user_id,organisation_id,payload,source,confidence,occurred_at)
  values('CLUB_UPSERTED',(select auth.uid()),v_id,jsonb_build_object('name',trim(p_name)),'network',1,now());
  return jsonb_build_object('organisation_id',v_id);
end $function$


CREATE OR REPLACE FUNCTION public.djm_network_upsert_person(p_full_name text, p_person_type text DEFAULT 'club_contact'::text, p_whatsapp text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_linkedin_url text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_club_name text DEFAULT NULL::text, p_role_title text DEFAULT NULL::text, p_club_country text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_person_id uuid;
  v_org_id uuid;
  v_phone_norm text;
  v_email_norm text;
  v_created boolean := false;
  v_name text := nullif(trim(p_full_name),'');
  v_club text := nullif(trim(p_club_name),'');
  v_role text := nullif(trim(p_role_title),'');
  v_inferred jsonb;
  v_inferred_conf numeric := 0;
  v_needs_review boolean := false;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  if v_name is null or length(v_name)<2 then raise exception 'Name is required'; end if;

  if v_club is null and v_name ~ '\s+-\s+' then
    v_inferred := djm_os.infer_contact_label(v_name);
    v_inferred_conf := coalesce((v_inferred->>'confidence')::numeric,0);
    v_needs_review := coalesce((v_inferred->>'needs_review')::boolean,false);
    if v_inferred_conf >= 0.70 then
      v_name := coalesce(nullif(v_inferred->>'name',''),v_name);
      v_club := nullif(v_inferred->>'club_name','');
      v_role := coalesce(v_role,nullif(v_inferred->>'role_title',''));
    end if;
  end if;

  v_phone_norm:=nullif(regexp_replace(coalesce(p_whatsapp,''),'[^0-9+]','','g'),'');
  v_email_norm:=nullif(lower(trim(coalesce(p_email,''))),'');
  if v_phone_norm is not null then select person_id into v_person_id from djm_os.contact_methods where channel='whatsapp' and normalised_value=v_phone_norm limit 1; end if;
  if v_person_id is null and v_email_norm is not null then select person_id into v_person_id from djm_os.contact_methods where channel='email' and normalised_value=v_email_norm limit 1; end if;
  if v_person_id is null then select id into v_person_id from djm_os.people where lower(trim(full_name))=lower(v_name) order by created_at limit 1; end if;

  if v_person_id is null then
    insert into djm_os.people(full_name,person_type,country,city,linkedin_url,source_confidence,last_verified_at)
    values(v_name,coalesce(nullif(trim(p_person_type),''),'club_contact'),nullif(trim(p_country),''),nullif(trim(p_city),''),nullif(trim(p_linkedin_url),''),case when v_inferred_conf>0 then v_inferred_conf else 1 end,now()) returning id into v_person_id;
    v_created:=true;
  else
    update djm_os.people
    set full_name=coalesce(v_name,full_name),country=coalesce(nullif(trim(p_country),''),country),city=coalesce(nullif(trim(p_city),''),city),linkedin_url=coalesce(nullif(trim(p_linkedin_url),''),linkedin_url),updated_at=now()
    where id=v_person_id;
  end if;

  if v_phone_norm is not null then
    insert into djm_os.contact_methods(person_id,channel,value,normalised_value,is_primary,is_verified,last_verified_at)
    values(v_person_id,'whatsapp',trim(p_whatsapp),v_phone_norm,true,false,now())
    on conflict(channel,normalised_value) where normalised_value is not null do update set value=excluded.value,person_id=excluded.person_id,updated_at=now();
  end if;
  if v_email_norm is not null then
    insert into djm_os.contact_methods(person_id,channel,value,normalised_value,is_primary,is_verified,last_verified_at)
    values(v_person_id,'email',trim(p_email),v_email_norm,true,false,now())
    on conflict(channel,normalised_value) where normalised_value is not null do update set value=excluded.value,person_id=excluded.person_id,updated_at=now();
  end if;

  if v_club is not null and djm_os.canonical_org_key(v_club) is not null then
    v_org_id:=djm_os.ensure_organisation(v_club,p_club_country);
    update djm_os.employments set is_current=false,ended_on=coalesce(ended_on,current_date),updated_at=now() where person_id=v_person_id and is_current=true and organisation_id<>v_org_id;
    if not exists(select 1 from djm_os.employments where person_id=v_person_id and organisation_id=v_org_id and is_current=true) then
      insert into djm_os.employments(person_id,organisation_id,role_title,is_current,confidence,last_verified_at)
      values(v_person_id,v_org_id,v_role,true,case when v_inferred_conf>0 then v_inferred_conf else 1 end,now());
    elsif v_role is not null then
      update djm_os.employments set role_title=coalesce(v_role,role_title),updated_at=now(),last_verified_at=now() where person_id=v_person_id and organisation_id=v_org_id and is_current=true;
    end if;
  end if;

  insert into djm_os.relationships(team_member_id,person_id,first_known_at,strength_score)
  values((select auth.uid()),v_person_id,now(),case when v_created then 20 else 25 end)
  on conflict(team_member_id,person_id) do nothing;

  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at)
  values(case when v_created then 'CONTACT_CREATED' else 'CONTACT_UPDATED' end,(select auth.uid()),v_person_id,v_org_id,
    jsonb_build_object('name',v_name,'created',v_created,'inferred',v_inferred_conf>0,'inference_confidence',v_inferred_conf,'needs_review',v_needs_review,'raw_name',p_full_name),'network',case when v_inferred_conf>0 then v_inferred_conf else 1 end,now());

  if v_needs_review and v_created then
    insert into djm_os.review_items(owner_user_id,review_type,title,detail,person_id,organisation_id,confidence,payload,status)
    values((select auth.uid()),'contact_identity','Review imported contact','Check the contact name, club and role inferred from the WhatsApp saved name.',v_person_id,v_org_id,v_inferred_conf,
      jsonb_build_object('raw_label',p_full_name,'inferred_name',v_name,'inferred_club',v_club,'inferred_role',v_role),'open');
  end if;

  return jsonb_build_object('person_id',v_person_id,'organisation_id',v_org_id,'created',v_created,'inferred',v_inferred_conf>0,'needs_review',v_needs_review);
end
$function$


CREATE OR REPLACE FUNCTION public.djm_notification_action(p_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v text:=lower(trim(p_action)); begin if v not in ('read','unread','dismissed') then raise exception 'Invalid action'; end if; update djm_os.notifications set status=v,read_at=case when v='read' then now() else read_at end where id=p_id and user_id=auth.uid(); if not found then raise exception 'Notification not found'; end if; return jsonb_build_object('id',p_id,'status',v); end; $function$


CREATE OR REPLACE FUNCTION public.djm_notifications(p_limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, notification_type text, title text, body text, priority smallint, person_id uuid, organisation_id uuid, player_id uuid, club_need_id uuid, task_id uuid, status text, created_at timestamp with time zone, expires_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select n.id,n.notification_type,n.title,n.body,n.priority,n.person_id,n.organisation_id,n.player_id,n.club_need_id,n.task_id,n.status,n.created_at,n.expires_at from djm_os.notifications n where n.user_id=auth.uid() and n.status<>'dismissed' and (n.expires_at is null or n.expires_at>now()) order by case when n.status='unread' then 0 else 1 end,n.priority desc,n.created_at desc limit greatest(1,least(coalesce(p_limit,30),100)); $function$


CREATE OR REPLACE FUNCTION public.djm_operating_home()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_uid uuid:=(select auth.uid());
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=v_uid and tm.is_active) then raise exception 'DJM team access required'; end if;
  return jsonb_build_object(
    'network',jsonb_build_object(
      'clubs',(select count(*) from djm_os.organisations where organisation_type='club'),
      'club_contacts',(select count(*) from djm_os.people where coalesce(person_type,'club_contact')<>'player' and exists(select 1 from djm_os.employments e where e.person_id=people.id and e.is_current=true)),
      'open_commitments',(select count(*) from djm_os.tasks where owner_user_id=v_uid and status not in ('completed','cancelled')),
      'reviews',(select count(*) from djm_os.review_items where status='open')
    ),
    'recruitment',coalesce(public.djm_recruitment_dashboard(),'{}'::jsonb),
    'market',jsonb_build_object(
      'active_needs',(select count(*) from djm_os.club_needs where status in ('active','open','confirmed')),
      'strong_matches',(select count(*) from djm_os.player_matches where status not in ('dismissed','rejected') and overall_score>=80),
      'needs_without_matches',(select count(*) from djm_os.club_needs n where n.status in ('active','open','confirmed') and not exists(select 1 from djm_os.player_matches m where m.club_need_id=n.id and m.status not in ('dismissed','rejected')))
    ),
    'top_actions',coalesce((select jsonb_agg(to_jsonb(x) order by x.rank_score desc,x.due_at nulls last) from (
      select 'task'::text as item_type,t.id,t.title,coalesce(t.due_at,now()+interval '365 days') as due_at,
        least(100,50 + case when t.due_at<now() then 30 else 0 end + t.priority*4)::int as rank_score,
        t.person_id,t.organisation_id,null::uuid as prospect_id
      from djm_os.tasks t where t.owner_user_id=v_uid and t.status not in ('completed','cancelled')
      union all
      select 'recruitment'::text,sp.id,'Recruitment: '||sp.full_name,coalesce(sp.next_action_at,now()+interval '365 days'),
        least(100,sp.recruitment_priority*15 + case when sp.next_action_at<now() then 20 else 0 end + case when sp.recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating') then 20 else 0 end)::int,
        null::uuid,null::uuid,sp.id
      from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.owner_user_id=v_uid and sp.recruitment_stage not in ('signed','declined','lost','paused')
      order by rank_score desc,due_at nulls last limit 12
    ) x),'[]'::jsonb)
  );
end $function$


CREATE OR REPLACE FUNCTION public.djm_opportunities(p_status text DEFAULT 'active'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.next_action_at nulls last, x.probability desc, x.updated_at desc)
    from (
      select d.id, d.title, d.organisation_id, o.name as organisation_name,
        d.source_person_id, pe.full_name as source_person_name, d.player_id, d.prospect_id,
        coalesce(nullif(p.preferred_name, ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), sp.full_name) as player_name,
        d.club_need_id, d.stage, d.status, d.expected_commission, d.currency,
        d.probability, d.model_probability, d.manual_probability, d.probability_source,
        d.probability_basis, d.primary_blocker, d.next_decision, d.next_action_text,
        d.next_action_at, d.pitch_status, d.transfer_fee, d.player_salary, d.salary_period,
        d.financial_notes, tm.display_name as owner_name, d.updated_at
      from djm_os.deal_rooms d
      join djm_os.organisations o on o.id = d.organisation_id
      left join djm_os.people pe on pe.id = d.source_person_id
      left join public.players p on p.id = d.player_id
      left join djm_os.scouting_prospects sp on sp.id = d.prospect_id
      left join djm_os.team_members tm on tm.user_id = d.owner_user_id
      where p_status is null or p_status = '' or d.status = p_status
    ) x
  ), '[]'::jsonb);
end $function$


CREATE OR REPLACE FUNCTION public.djm_opportunity(p_opportunity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  return jsonb_build_object(
    'deal', (
      select to_jsonb(x) from (
        select d.*, o.name as organisation_name, o.country as organisation_country, o.website_url,
          o.linkedin_url as organisation_linkedin_url, o.instagram_url as organisation_instagram_url, o.transfermarkt_url as organisation_transfermarkt_url,
          pe.full_name as source_person_name, pe.linkedin_url as source_person_linkedin_url, pe.instagram_url as source_person_instagram_url,
          (select cm.value from djm_os.contact_methods cm where cm.person_id = pe.id and cm.channel = 'whatsapp' order by cm.is_primary desc limit 1) as source_person_whatsapp,
          (select cm.value from djm_os.contact_methods cm where cm.person_id = pe.id and cm.channel = 'email' order by cm.is_primary desc limit 1) as source_person_email,
          coalesce(nullif(p.preferred_name, ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), sp.full_name) as player_name,
          p.current_club as player_current_club, p.current_country as player_current_country,
          p.transfermarkt_url as player_transfermarkt_url, p.stats_url as player_stats_url, p.instagram_url as player_instagram_url,
          sp.transfermarkt_url as prospect_transfermarkt_url, sp.wyscout_url as prospect_wyscout_url, sp.instagram_url as prospect_instagram_url,
          sp.current_club as prospect_current_club, sp.current_country as prospect_current_country,
          tm.display_name as owner_name, to_jsonb(n) as club_need
        from djm_os.deal_rooms d
        join djm_os.organisations o on o.id = d.organisation_id
        left join djm_os.people pe on pe.id = d.source_person_id
        left join public.players p on p.id = d.player_id
        left join djm_os.scouting_prospects sp on sp.id = d.prospect_id
        left join djm_os.team_members tm on tm.user_id = d.owner_user_id
        left join djm_os.club_needs n on n.id = d.club_need_id
        where d.id = p_opportunity_id
      ) x
    ),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.due_at nulls last)
      from (
        select id, title, due_at, status, priority from djm_os.tasks
        where club_need_id = (select club_need_id from djm_os.deal_rooms where id = p_opportunity_id)
          and status not in ('done', 'completed', 'cancelled')
      ) t
    ), '[]'::jsonb),
    'pitches', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at desc)
      from (
        select id, token, label, active, expires_at, view_count, last_viewed_at,
          pitch_message, pitch_status, selected_sections, sent_at, revoked_at, created_at
        from public.club_share_links where opportunity_id = p_opportunity_id
      ) s
    ), '[]'::jsonb)
  );
end; $function$


CREATE OR REPLACE FUNCTION public.djm_opportunity_assign_owner(p_opportunity_id uuid, p_owner_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_before uuid; v_org uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_owner_user_id is not null and not exists(select 1 from djm_os.team_members where user_id=p_owner_user_id and is_active=true) then raise exception 'Active DJM team member not found'; end if;
  select owner_user_id,organisation_id into v_before,v_org from djm_os.deal_rooms where id=p_opportunity_id;
  if not found then raise exception 'Opportunity not found'; end if;
  update djm_os.deal_rooms set owner_user_id=p_owner_user_id,updated_at=now() where id=p_opportunity_id;
  insert into djm_os.events(event_type,actor_user_id,organisation_id,payload,source,confidence,occurred_at)
  values('OPPORTUNITY_OWNER_UPDATED',auth.uid(),v_org,jsonb_build_object('opportunity_id',p_opportunity_id,'previous_owner_user_id',v_before,'owner_user_id',p_owner_user_id),'manual_ui',1,now());
  return jsonb_build_object('opportunity_id',p_opportunity_id,'owner_user_id',p_owner_user_id);
end; $function$


CREATE OR REPLACE FUNCTION public.djm_opportunity_close(p_opportunity_id uuid, p_outcome text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_stage text := lower(trim(coalesce(p_outcome, '')));
  v_status text;
  v_probability smallint;
  v_deal djm_os.deal_rooms%rowtype;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if v_stage not in ('done', 'closed') then raise exception 'Outcome must be done or closed'; end if;
  v_status := case when v_stage = 'done' then 'won' else 'lost' end;
  v_probability := case when v_stage = 'done' then 100 else 0 end;
  update djm_os.deal_rooms set stage = v_stage, status = v_status, probability = v_probability,
    model_probability = v_probability, probability_source = 'outcome', outcome_reason = nullif(trim(coalesce(p_reason, '')), ''),
    closed_at = now(), last_meaningful_at = now(), updated_at = now()
  where id = p_opportunity_id returning * into v_deal;
  if not found then raise exception 'Opportunity not found'; end if;
  insert into djm_os.events(event_type, actor_user_id, organisation_id, person_id, player_id, payload, source, confidence, occurred_at)
  values('OPPORTUNITY_OUTCOME_RECORDED', auth.uid(), v_deal.organisation_id, v_deal.source_person_id, v_deal.player_id,
    jsonb_build_object('opportunity_id', v_deal.id, 'outcome', v_stage, 'reason', nullif(trim(coalesce(p_reason, '')), '')),
    'opportunity_os', 1, now());
  return jsonb_build_object('opportunity_id', v_deal.id, 'stage', v_stage, 'status', v_status);
end $function$


CREATE OR REPLACE FUNCTION public.djm_opportunity_create_pitch(p_opportunity_id uuid, p_message text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_selected_sections jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_deal djm_os.deal_rooms%rowtype;
  v_share_id uuid;
  v_token uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  select * into v_deal from djm_os.deal_rooms where id = p_opportunity_id;
  if not found then raise exception 'Opportunity not found'; end if;
  if v_deal.player_id is null then raise exception 'A club dossier pitch requires a signed player'; end if;

  insert into public.club_share_links(
    player_id, label, active, expires_at, created_by, opportunity_id, organisation_id,
    source_person_id, pitch_message, pitch_status, selected_sections, sent_at
  ) values (
    v_deal.player_id, v_deal.title, true, coalesce(p_expires_at, now() + interval '30 days'), auth.uid(),
    v_deal.id, v_deal.organisation_id, v_deal.source_person_id, nullif(trim(coalesce(p_message, '')), ''),
    'ready', coalesce(p_selected_sections, '{}'::jsonb), null
  ) returning id, token into v_share_id, v_token;

  update djm_os.deal_rooms set pitch_status = 'ready', updated_at = now() where id = v_deal.id;
  insert into djm_os.events(event_type, actor_user_id, organisation_id, person_id, player_id, payload, source, confidence, occurred_at)
  values('PITCH_CREATED', auth.uid(), v_deal.organisation_id, v_deal.source_person_id, v_deal.player_id,
    jsonb_build_object('opportunity_id', v_deal.id, 'share_id', v_share_id, 'expires_at', coalesce(p_expires_at, now() + interval '30 days')),
    'opportunity_os', 1, now());

  return jsonb_build_object('share_id', v_share_id, 'token', v_token, 'pitch_status', 'ready');
end $function$


CREATE OR REPLACE FUNCTION public.djm_opportunity_mark_pitch_sent(p_share_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_opportunity uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  update public.club_share_links set pitch_status = 'sent', sent_at = coalesce(sent_at, now())
  where id = p_share_id and active = true returning opportunity_id into v_opportunity;
  if not found then raise exception 'Pitch not found'; end if;
  update djm_os.deal_rooms set pitch_status = 'sent', stage = case when stage = 'potential' then 'pitched' else stage end, updated_at = now()
  where id = v_opportunity;
  return jsonb_build_object('share_id', p_share_id, 'pitch_status', 'sent');
end $function$


CREATE OR REPLACE FUNCTION public.djm_opportunity_probability(p_need_id uuid, p_player_id uuid DEFAULT NULL::uuid, p_prospect_id uuid DEFAULT NULL::uuid, p_stage text DEFAULT 'potential'::text, p_primary_blocker text DEFAULT NULL::text, p_next_action_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_fit jsonb;
  v_stage text := lower(trim(coalesce(p_stage, 'potential')));
  v_stage_probability integer;
  v_probability integer;
  v_adjustments jsonb := '[]'::jsonb;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  v_fit := public.djm_market_deal_probability(p_need_id, p_player_id, p_prospect_id);
  v_stage_probability := case v_stage
    when 'potential' then 10 when 'qualifying' then 10
    when 'pitched' then 20 when 'contacted' then 20
    when 'talking' then 35 when 'interest' then 35
    when 'trial' then 55
    when 'negotiation' then 68 when 'negotiating' then 68
    when 'offer' then 84 when 'contracting' then 90
    when 'done' then 100 when 'won' then 100
    when 'closed' then 0 when 'lost' then 0
    else 12 end;

  v_probability := round(v_stage_probability * .58 + coalesce((v_fit ->> 'probability')::numeric, 45) * .42);
  if p_need_id is null then
    v_probability := v_probability - 8;
    v_adjustments := v_adjustments || jsonb_build_array('No confirmed club need linked: -8');
  else
    v_adjustments := v_adjustments || jsonb_build_array('Club need linked: demand evidence included');
  end if;
  if nullif(trim(coalesce(p_primary_blocker, '')), '') is not null then
    v_probability := v_probability - 12;
    v_adjustments := v_adjustments || jsonb_build_array('Primary blocker recorded: -12');
  end if;
  if p_next_action_at is not null then
    v_probability := v_probability + 5;
    v_adjustments := v_adjustments || jsonb_build_array('Dated next action: +5');
  end if;
  if v_stage in ('done', 'won') then v_probability := 100; end if;
  if v_stage in ('closed', 'lost') then v_probability := 0; end if;
  v_probability := greatest(0, least(case when v_stage in ('done', 'won') then 100 else 95 end, v_probability));

  return jsonb_build_object(
    'probability', v_probability,
    'stage_probability', v_stage_probability,
    'player_club_fit', coalesce((v_fit ->> 'football_fit')::int, 50),
    'djm_access', coalesce((v_fit ->> 'djm_access')::int, 40),
    'demand_confidence', coalesce((v_fit ->> 'demand_confidence')::int, 50),
    'player_willingness', coalesce((v_fit ->> 'player_willingness')::int, 50),
    'timing', coalesce((v_fit ->> 'timing')::int, 50),
    'adjustments', v_adjustments,
    'model', 'DJM opportunity model v2',
    'calculated_at', now()
  );
end $function$


CREATE OR REPLACE FUNCTION public.djm_opportunity_update_identity(p_opportunity_id uuid, p_organisation_id uuid, p_source_person_id uuid DEFAULT NULL::uuid, p_player_id uuid DEFAULT NULL::uuid, p_prospect_id uuid DEFAULT NULL::uuid, p_club_need_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_before jsonb;
  v_before_player uuid;
  v_prediction jsonb;
  v_model smallint;
  v_manual smallint;
  v_effective smallint;
  v_stage text;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_organisation_id is null or not exists(select 1 from djm_os.organisations where id=p_organisation_id and organisation_type='club') then raise exception 'Club is required'; end if;
  if num_nonnulls(p_player_id,p_prospect_id) <> 1 then raise exception 'Choose exactly one signed player or recruitment target'; end if;
  if p_source_person_id is not null and not exists(select 1 from djm_os.people where id=p_source_person_id) then raise exception 'Source contact not found'; end if;
  if p_club_need_id is not null and not exists(select 1 from djm_os.club_needs where id=p_club_need_id and organisation_id=p_organisation_id) then raise exception 'Club Need must belong to the selected club'; end if;

  select to_jsonb(d),d.player_id,d.stage,d.manual_probability into v_before,v_before_player,v_stage,v_manual from djm_os.deal_rooms d where d.id=p_opportunity_id;
  if v_before is null then raise exception 'Opportunity not found'; end if;
  if exists(select 1 from public.club_share_links s where s.opportunity_id=p_opportunity_id and s.active=true)
     and p_player_id is distinct from v_before_player then
    raise exception 'Revoke active pitch links before changing the pitched player';
  end if;

  v_prediction:=public.djm_opportunity_probability(p_club_need_id,p_player_id,p_prospect_id,v_stage,null,null);
  v_model:=(v_prediction->>'probability')::smallint;
  v_effective:=coalesce(v_manual,v_model);

  update djm_os.deal_rooms set
    organisation_id=p_organisation_id,
    source_person_id=p_source_person_id,
    player_id=p_player_id,
    prospect_id=p_prospect_id,
    club_need_id=p_club_need_id,
    model_probability=v_model,
    probability=v_effective,
    probability_source=case when v_manual is null then 'model' else 'manual' end,
    probability_basis=v_prediction,
    last_meaningful_at=now(),
    updated_at=now()
  where id=p_opportunity_id;

  insert into djm_os.events(event_type,actor_user_id,organisation_id,person_id,player_id,payload,source,confidence,occurred_at)
  values('OPPORTUNITY_IDENTITY_UPDATED',auth.uid(),p_organisation_id,p_source_person_id,p_player_id,
    jsonb_build_object('opportunity_id',p_opportunity_id,'before',v_before,'organisation_id',p_organisation_id,'source_person_id',p_source_person_id,'player_id',p_player_id,'prospect_id',p_prospect_id,'club_need_id',p_club_need_id,'model_probability',v_model,'effective_probability',v_effective),
    'manual_ui',1,now());

  return jsonb_build_object('opportunity_id',p_opportunity_id,'model_probability',v_model,'probability',v_effective,'probability_source',case when v_manual is null then 'model' else 'manual' end);
end; $function$


CREATE OR REPLACE FUNCTION public.djm_opportunity_update_pitch(p_share_id uuid, p_label text DEFAULT NULL::text, p_message text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_selected_sections jsonb DEFAULT NULL::jsonb, p_active boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_opportunity uuid; v_player uuid; v_org uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  update public.club_share_links s set
    label=coalesce(nullif(trim(coalesce(p_label,'')),''),s.label),
    pitch_message=nullif(trim(coalesce(p_message,'')),''),
    expires_at=p_expires_at,
    selected_sections=coalesce(p_selected_sections,s.selected_sections,'{}'::jsonb),
    active=coalesce(p_active,true),
    revoked_at=case when coalesce(p_active,true)=false then coalesce(s.revoked_at,now()) else null end
  where s.id=p_share_id and s.opportunity_id is not null
  returning s.opportunity_id,s.player_id,s.organisation_id into v_opportunity,v_player,v_org;
  if not found then raise exception 'Opportunity pitch not found'; end if;
  update djm_os.deal_rooms set pitch_status=case when coalesce(p_active,true) then pitch_status else 'revoked' end,updated_at=now() where id=v_opportunity;
  insert into djm_os.events(event_type,actor_user_id,organisation_id,player_id,payload,source,confidence,occurred_at)
  values('PITCH_UPDATED',auth.uid(),v_org,v_player,jsonb_build_object('opportunity_id',v_opportunity,'share_id',p_share_id,'active',coalesce(p_active,true),'expires_at',p_expires_at),'manual_ui',1,now());
  return jsonb_build_object('share_id',p_share_id,'opportunity_id',v_opportunity,'active',coalesce(p_active,true));
end; $function$


CREATE OR REPLACE FUNCTION public.djm_opportunity_upsert(p_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_organisation_id uuid DEFAULT NULL::uuid, p_source_person_id uuid DEFAULT NULL::uuid, p_player_id uuid DEFAULT NULL::uuid, p_prospect_id uuid DEFAULT NULL::uuid, p_club_need_id uuid DEFAULT NULL::uuid, p_stage text DEFAULT 'potential'::text, p_expected_commission numeric DEFAULT NULL::numeric, p_currency text DEFAULT 'EUR'::text, p_primary_blocker text DEFAULT NULL::text, p_next_decision text DEFAULT NULL::text, p_next_action_text text DEFAULT NULL::text, p_next_action_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_transfer_fee numeric DEFAULT NULL::numeric, p_player_salary numeric DEFAULT NULL::numeric, p_salary_period text DEFAULT NULL::text, p_financial_notes text DEFAULT NULL::text, p_manual_probability smallint DEFAULT NULL::smallint, p_source text DEFAULT 'opportunity_os'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_owner uuid := auth.uid();
  v_stage text := lower(trim(coalesce(p_stage, 'potential')));
  v_status text;
  v_prediction jsonb;
  v_model_probability smallint;
  v_probability smallint;
  v_org uuid;
  v_person uuid;
  v_player uuid;
  v_prospect uuid;
  v_need uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if v_stage not in ('potential', 'pitched', 'talking', 'trial', 'negotiation', 'offer', 'done', 'closed', 'paused') then raise exception 'Invalid opportunity stage'; end if;
  v_status := case when v_stage = 'done' then 'won' when v_stage = 'closed' then 'lost' when v_stage = 'paused' then 'paused' else 'active' end;

  if p_id is null then
    v_org := p_organisation_id; v_person := p_source_person_id; v_player := p_player_id; v_prospect := p_prospect_id; v_need := p_club_need_id;
    if v_org is null then raise exception 'Club is required'; end if;
    if num_nonnulls(v_player, v_prospect) <> 1 then raise exception 'Choose exactly one signed player or recruitment target'; end if;
  else
    select organisation_id, source_person_id, player_id, prospect_id, club_need_id
    into v_org, v_person, v_player, v_prospect, v_need
    from djm_os.deal_rooms where id = p_id;
    if not found then raise exception 'Opportunity not found'; end if;
    v_org := coalesce(p_organisation_id, v_org); v_person := coalesce(p_source_person_id, v_person);
    v_player := coalesce(p_player_id, v_player); v_prospect := coalesce(p_prospect_id, v_prospect); v_need := coalesce(p_club_need_id, v_need);
  end if;

  v_prediction := public.djm_opportunity_probability(v_need, v_player, v_prospect, v_stage, p_primary_blocker, p_next_action_at);
  v_model_probability := (v_prediction ->> 'probability')::smallint;
  v_probability := case when p_manual_probability is not null then p_manual_probability else v_model_probability end;

  if p_id is null then
    insert into djm_os.deal_rooms(
      title, organisation_id, source_person_id, player_id, prospect_id, club_need_id,
      owner_user_id, stage, status, expected_commission, currency, probability,
      model_probability, manual_probability, probability_source, probability_basis,
      primary_blocker, next_decision, next_action_text, next_action_at,
      transfer_fee, player_salary, salary_period, financial_notes, last_meaningful_at, source
    ) values (
      coalesce(nullif(trim(p_title), ''), 'DJM opportunity'), v_org, v_person, v_player, v_prospect, v_need,
      v_owner, v_stage, v_status, p_expected_commission, coalesce(nullif(trim(p_currency), ''), 'EUR'), v_probability,
      v_model_probability, p_manual_probability, case when p_manual_probability is null then 'model' else 'manual' end, v_prediction,
      nullif(trim(coalesce(p_primary_blocker, '')), ''), nullif(trim(coalesce(p_next_decision, '')), ''),
      nullif(trim(coalesce(p_next_action_text, '')), ''), p_next_action_at, p_transfer_fee, p_player_salary,
      nullif(trim(coalesce(p_salary_period, '')), ''), nullif(trim(coalesce(p_financial_notes, '')), ''), now(),
      coalesce(nullif(trim(p_source), ''), 'opportunity_os')
    ) returning id into v_id;
  else
    update djm_os.deal_rooms set
      title = coalesce(nullif(trim(p_title), ''), title), stage = v_stage, status = v_status,
      expected_commission = p_expected_commission, currency = coalesce(nullif(trim(p_currency), ''), currency),
      probability = v_probability, model_probability = v_model_probability, manual_probability = p_manual_probability,
      probability_source = case when p_manual_probability is null then 'model' else 'manual' end,
      probability_basis = v_prediction, primary_blocker = nullif(trim(coalesce(p_primary_blocker, '')), ''),
      next_decision = nullif(trim(coalesce(p_next_decision, '')), ''), next_action_text = nullif(trim(coalesce(p_next_action_text, '')), ''),
      next_action_at = p_next_action_at, transfer_fee = p_transfer_fee, player_salary = p_player_salary,
      salary_period = nullif(trim(coalesce(p_salary_period, '')), ''), financial_notes = nullif(trim(coalesce(p_financial_notes, '')), ''),
      closed_at = case when v_status in ('won', 'lost') then coalesce(closed_at, now()) else null end,
      last_meaningful_at = now(), updated_at = now()
    where id = p_id returning id into v_id;
  end if;

  insert into djm_os.events(event_type, actor_user_id, organisation_id, person_id, player_id, payload, source, confidence, occurred_at)
  values(
    case when p_id is null then 'OPPORTUNITY_CREATED' else 'OPPORTUNITY_UPDATED' end,
    auth.uid(), v_org, v_person, v_player,
    jsonb_build_object('opportunity_id', v_id, 'stage', v_stage, 'model_probability', v_model_probability, 'effective_probability', v_probability, 'probability_source', case when p_manual_probability is null then 'model' else 'manual' end),
    'opportunity_os', 1, now()
  );

  return jsonb_build_object('opportunity_id', v_id, 'model_probability', v_model_probability, 'probability', v_probability, 'probability_source', case when p_manual_probability is null then 'model' else 'manual' end);
end $function$


CREATE OR REPLACE FUNCTION public.djm_peer_refresh_context(p_mode text, p_player_id uuid DEFAULT NULL::uuid, p_competition_id uuid DEFAULT NULL::uuid, p_provider_competition_id text DEFAULT NULL::text, p_display_name text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_competition djm_os.competitions%rowtype;
  v_provider jsonb;
  v_canonical_key text;
  v_aliases text[];
begin
  if p_mode = 'player' then
    select jsonb_build_object(
      'provider_player_id', s.provider_player_id,
      'provider_competition_id', s.provider_competition_id,
      'provider_season_id', s.provider_season_id,
      'competition_name', s.competition_name,
      'metrics', s.metrics,
      'synced_at', s.synced_at
    )
    into v_provider
    from djm_os.player_provider_stat_snapshots s
    where s.player_id = p_player_id
      and s.provider = 'pitchapi'
    order by s.synced_at desc nulls last, s.updated_at desc
    limit 1;

    if v_provider is null then
      raise exception 'Update player data first so DJM can resolve a current PitchAPI competition and season.';
    end if;

    return v_provider;
  end if;

  if p_mode = 'competition' then
    select *
    into v_competition
    from djm_os.competitions c
    where c.id = p_competition_id
    limit 1;

    if not found then
      raise exception 'DJM competition not found.';
    end if;

    return jsonb_build_object(
      'competition_id', v_competition.id,
      'display_name', v_competition.display_name,
      'country', v_competition.country,
      'provider_competition_id', nullif(v_competition.provider_ids ->> 'pitchapi', '')
    );
  end if;

  if p_mode = 'provider' then
    if nullif(trim(coalesce(p_provider_competition_id, '')), '') is null then
      raise exception 'PitchAPI competition identity is required.';
    end if;

    v_canonical_key := 'pitchapi:' || p_provider_competition_id;

    select *
    into v_competition
    from djm_os.competitions c
    where c.canonical_key = v_canonical_key
       or c.provider_ids ->> 'pitchapi' = p_provider_competition_id
    order by (c.canonical_key = v_canonical_key) desc, c.updated_at desc
    limit 1;

    if found then
      v_aliases := array(
        select distinct alias
        from unnest(
          coalesce(v_competition.aliases, '{}'::text[])
          || array[nullif(trim(coalesce(p_display_name, '')), '')]
        ) alias
        where alias is not null
      );

      update djm_os.competitions
      set display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
          country = coalesce(nullif(trim(p_country), ''), country),
          aliases = v_aliases,
          provider_ids = provider_ids || jsonb_build_object('pitchapi', p_provider_competition_id),
          updated_by = p_user_id,
          updated_at = now()
      where id = v_competition.id
      returning * into v_competition;
    else
      insert into djm_os.competitions(
        canonical_key,
        display_name,
        country,
        aliases,
        provider_ids,
        created_by,
        updated_by
      )
      values (
        v_canonical_key,
        coalesce(nullif(trim(p_display_name), ''), 'PitchAPI ' || p_provider_competition_id),
        nullif(trim(p_country), ''),
        array_remove(array[nullif(trim(coalesce(p_display_name, '')), '')], null),
        jsonb_build_object('pitchapi', p_provider_competition_id),
        p_user_id,
        p_user_id
      )
      returning * into v_competition;
    end if;

    return jsonb_build_object(
      'competition_id', v_competition.id,
      'display_name', v_competition.display_name,
      'country', v_competition.country,
      'provider_competition_id', p_provider_competition_id
    );
  end if;

  raise exception 'Unsupported peer refresh context mode.';
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_player_comparison(p_player_id uuid, p_compare_competition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_base jsonb;
  v_intel jsonb;
  v_score jsonb;
  v_projection jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' and not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  v_base := public.djm_player_comparison_legacy_v5(p_player_id,p_compare_competition_id);
  v_intel := public.djm_player_global_intelligence(p_player_id);
  v_score := coalesce(v_intel -> 'scorecard','{}'::jsonb);
  v_projection := coalesce(v_intel -> 'projection','{}'::jsonb);
  v_base := jsonb_set(v_base,'{scorecard}',v_score || jsonb_build_object(
    'potential_score',nullif(v_projection ->> 'forecast_score','')::numeric,
    'projection',v_projection
  ),true);
  v_base := jsonb_set(v_base,'{projection}',v_projection,true);
  v_base := jsonb_set(v_base,'{semantics,current_level}',to_jsonb('DJM Global Score V7.1 current demonstrated level'::text),true);
  v_base := jsonb_set(v_base,'{semantics,potential}',to_jsonb('Five-year uncertainty-aware development forecast. Not a calibrated probability of career success.'::text),true);
  return v_base;
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_player_comparison_legacy_v5(p_player_id uuid, p_compare_competition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  if not djm_os.is_team_member() and auth.role() <> 'service_role' then
    raise exception 'DJM team access required';
  end if;

  if p_player_id is null then
    raise exception 'Player is required';
  end if;

  if not exists(select 1 from public.players p where p.id = p_player_id) then
    raise exception 'Player not found';
  end if;

  if auth.role() <> 'service_role' and not (
    exists(select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin')
    or exists(
      select 1
      from public.staff_player_access a
      where a.player_id = p_player_id
        and a.staff_user_id = auth.uid()
    )
  ) then
    raise exception 'Player access required';
  end if;

  with player_row as (
    select
      p.id,
      p.first_name,
      p.last_name,
      p.preferred_name,
      p.date_of_birth,
      p.primary_position,
      p.current_club,
      p.current_league,
      p.current_country,
      p.current_competition_id,
      p.football_status,
      p.contract_status,
      p.contract_expiry
    from public.players p
    where p.id = p_player_id
  ),
  score_row as (
    select s.*
    from djm_os.player_scorecards s
    where s.player_id = p_player_id
    limit 1
  ),
  performance_row as (
    select ps.*
    from djm_os.player_performance_snapshots ps
    where ps.player_id = p_player_id
    order by ps.evidence_date desc nulls last, ps.verified_at desc nulls last, ps.updated_at desc
    limit 1
  ),
  provider_row as (
    select pp.*
    from djm_os.player_provider_stat_snapshots pp
    where pp.player_id = p_player_id
      and pp.provider in ('pitchapi', 'official_league')
    order by
      case pp.provider when 'pitchapi' then 1 when 'official_league' then 2 else 9 end,
      pp.synced_at desc nulls last,
      pp.updated_at desc
    limit 1
  ),
  current_cohort as (
    select pc.*
    from djm_os.provider_peer_stat_snapshots pc
    join provider_row pr
      on pc.provider = pr.provider
      and pc.provider_competition_id = pr.provider_competition_id
      and pc.provider_season_id = pr.provider_season_id
    where pc.minutes >= 180
      and (
        coalesce(
          pr.metrics #>> '{current_window,role}',
          pr.metrics #>> '{current_season,role}',
          pr.metrics ->> 'role'
        ) is null
        or pc.provider_position = coalesce(
          pr.metrics #>> '{current_window,role}',
          pr.metrics #>> '{current_season,role}',
          pr.metrics ->> 'role'
        )
      )
    order by pc.minutes desc, pc.player_name
  ),
  target_competition as (
    select
      c.id,
      c.display_name,
      c.country,
      c.level_tier,
      c.provider_ids,
      nullif(c.provider_ids ->> 'pitchapi', '') as provider_competition_id
    from djm_os.competitions c
    where c.id = p_compare_competition_id
    limit 1
  ),
  target_cache_key as (
    select
      tc.id as competition_id,
      tc.display_name,
      tc.country,
      tc.provider_competition_id,
      (
        select pc.provider_season_id
        from djm_os.provider_peer_stat_snapshots pc
        where pc.provider = 'pitchapi'
          and pc.provider_competition_id = tc.provider_competition_id
        order by pc.synced_at desc nulls last, pc.updated_at desc
        limit 1
      ) as provider_season_id
    from target_competition tc
  ),
  target_cohort as (
    select pc.*
    from djm_os.provider_peer_stat_snapshots pc
    join target_cache_key tk
      on pc.provider = 'pitchapi'
      and pc.provider_competition_id = tk.provider_competition_id
      and pc.provider_season_id = tk.provider_season_id
    where pc.minutes >= 180
    order by pc.minutes desc, pc.player_name
  ),
  benchmark_rows as (
    select distinct on (lb.competition_id)
      lb.id,
      lb.competition_id,
      lb.league_name,
      lb.country,
      lb.strength_score,
      lb.benchmark_provider,
      lb.methodology_version,
      lb.source_note,
      lb.verified_at,
      lb.stale_at,
      c.level_tier,
      c.provider_ids
    from djm_os.league_benchmarks lb
    left join djm_os.competitions c on c.id = lb.competition_id
    where lb.competition_id is not null
    order by lb.competition_id, lb.verified_at desc nulls last, lb.updated_at desc
  ),
  competition_rows as (
    select
      c.id as competition_id,
      c.display_name as league_name,
      c.country,
      c.level_tier,
      c.provider_ids,
      lb.strength_score,
      lb.benchmark_provider,
      lb.methodology_version,
      lb.verified_at,
      lb.stale_at
    from djm_os.competitions c
    left join lateral (
      select b.strength_score, b.benchmark_provider, b.methodology_version, b.verified_at, b.stale_at
      from djm_os.league_benchmarks b
      where b.competition_id = c.id
      order by b.verified_at desc nulls last, b.updated_at desc
      limit 1
    ) lb on true
    where c.active is distinct from false
  ),
  cached_peer_leagues as (
    select
      c.id as competition_id,
      c.display_name as league_name,
      c.country,
      pc.provider,
      max(pc.synced_at) as synced_at,
      count(*)::int as peer_count,
      max(pc.provider_season_id) as provider_season_id
    from djm_os.competitions c
    join djm_os.provider_peer_stat_snapshots pc
      on (
        (pc.provider = 'pitchapi' and pc.provider_competition_id = c.provider_ids ->> 'pitchapi')
        or
        (pc.provider = 'official_league' and pc.provider_competition_id = c.provider_ids ->> 'official_league')
      )
    where pc.provider in ('pitchapi', 'official_league')
    group by c.id, c.display_name, c.country, pc.provider
  )
  select jsonb_build_object(
    'player', coalesce((select to_jsonb(p) from player_row p), '{}'::jsonb),
    'scorecard', coalesce((
      select jsonb_build_object(
        'display_score', coalesce(s.manual_score, s.model_score, s.provisional_score),
        'model_score', s.model_score,
        'manual_score', s.manual_score,
        'provisional_score', s.provisional_score,
        'potential_score', coalesce(s.manual_potential_score, s.potential_model_score),
        'potential_model_score', s.potential_model_score,
        'manual_potential_score', s.manual_potential_score,
        'score_status', s.score_status,
        'score_tier', s.score_tier,
        'confidence', case when s.score_tier = 'provisional' then coalesce(s.provisional_confidence, s.confidence) else s.confidence end,
        'data_coverage', s.data_coverage,
        'model_version', s.model_version,
        'calculated_at', s.calculated_at,
        'evidence_freshness', s.evidence_freshness,
        'evidence_band_low', nullif(s.basis #>> '{evidence_band,low}', '')::numeric,
        'evidence_band_high', nullif(s.basis #>> '{evidence_band,high}', '')::numeric,
        'provisional_grade', s.basis ->> 'provisional_grade',
        'effective_evidence_coverage', nullif(s.basis ->> 'effective_evidence_coverage', '')::numeric,
        'missing_inputs', s.missing_inputs,
        'basis', s.basis
      )
      from score_row s
    ), '{}'::jsonb),
    'performance', coalesce((select to_jsonb(ps) from performance_row ps), 'null'::jsonb),
    'provider_snapshot', coalesce((select to_jsonb(pr) from provider_row pr), 'null'::jsonb),
    'peers', coalesce((select jsonb_agg(to_jsonb(pc)) from current_cohort pc), '[]'::jsonb),
    'target_peers', coalesce((select jsonb_agg(to_jsonb(tc)) from target_cohort tc), '[]'::jsonb),
    'target_peer_context', coalesce((
      select jsonb_build_object(
        'competition_id', tk.competition_id,
        'display_name', tk.display_name,
        'country', tk.country,
        'provider', 'pitchapi',
        'provider_competition_id', tk.provider_competition_id,
        'provider_season_id', tk.provider_season_id,
        'peer_count', (select count(*) from target_cohort)
      )
      from target_cache_key tk
    ), 'null'::jsonb),
    'benchmarks', coalesce((select jsonb_agg(to_jsonb(br) order by br.strength_score desc nulls last, br.league_name) from benchmark_rows br), '[]'::jsonb),
    'competitions', coalesce((select jsonb_agg(to_jsonb(cr) order by cr.country nulls last, cr.league_name) from competition_rows cr), '[]'::jsonb),
    'cached_peer_leagues', coalesce((select jsonb_agg(to_jsonb(cp) order by cp.synced_at desc nulls last) from cached_peer_leagues cp), '[]'::jsonb),
    'semantics', jsonb_build_object(
      'current_level', 'DJM Player Score V5 current demonstrated level',
      'position_profile', 'Observed provider percentile evidence against a relevant current peer cohort when deep performance evidence exists',
      'peer_plot', 'Observed real players only. PitchAPI is preferred; verified official-league basic evidence is used when deep provider coverage is unavailable. No synthetic player dots.',
      'league_strength', 'Competition context; never the same thing as player ability',
      'cross_league', 'Current observed metric placed against a PitchAPI target league cohort without translating it into a synthetic percentile',
      'potential', 'Stored DJM potential only; not presented as a calibrated career-success probability',
      'confidence', 'Evidence strength, not probability of sporting, transfer or career success'
    )
  ) into v_result;

  return v_result;
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_player_global_intelligence(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_subject_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  select s.id into v_subject_id from djm_os.football_intelligence_subjects s where s.player_id=p_player_id limit 1;
  if v_subject_id is null then
    return jsonb_build_object('available',false,'reason','global_subject_not_initialised','player_id',p_player_id);
  end if;
  return public.djm_subject_global_intelligence(v_subject_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_player_performance_data(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case when not djm_os.is_team_member() then jsonb_build_object('error','DJM team access required')
  else jsonb_build_object(
    'player', (select jsonb_build_object(
      'id', p.id,
      'name', trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')),
      'primary_position', p.primary_position,
      'position_group', private.djm_position_group(p.primary_position),
      'date_of_birth', p.date_of_birth
    ) from public.players p where p.id = p_player_id),
    'snapshots', coalesce((select jsonb_agg(to_jsonb(s) order by s.evidence_date desc, s.verified_at desc)
      from djm_os.player_performance_snapshots s where s.player_id = p_player_id), '[]'::jsonb),
    'scorecard', (select to_jsonb(ps) from djm_os.player_scorecards ps where ps.player_id = p_player_id)
  ) end;
$function$


CREATE OR REPLACE FUNCTION public.djm_player_performance_snapshot_upsert(p_player_id uuid, p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid := nullif(p_snapshot->>'id','')::uuid;
  v_group text := private.djm_position_group(coalesce(p_snapshot->>'position_group', p_snapshot->>'position'));
  v_source_name text := nullif(trim(coalesce(p_snapshot->>'source_name','')), '');
  v_provider text := nullif(trim(coalesce(p_snapshot->>'provider','')), '');
  v_peer text := nullif(trim(coalesce(p_snapshot->>'peer_group_description','')), '');
  v_evidence_date date := nullif(p_snapshot->>'evidence_date','')::date;
  v_observed_at timestamptz := nullif(p_snapshot->>'observed_at','')::timestamptz;
  v_verified_at timestamptz := nullif(p_snapshot->>'verified_at','')::timestamptz;
  v_score numeric;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if not exists(select 1 from public.players where id = p_player_id) then raise exception 'Player not found'; end if;
  if v_source_name is null then raise exception 'Source name is required'; end if;
  if v_provider is null then raise exception 'Provider is required'; end if;
  if v_peer is null then raise exception 'Peer group is required'; end if;
  if v_evidence_date is null then raise exception 'Evidence date is required'; end if;
  if v_observed_at is null then raise exception 'Observed date is required'; end if;
  if v_verified_at is null then raise exception 'Verification date is required'; end if;

  v_score := private.djm_position_performance_score(
    v_group,
    nullif(p_snapshot->>'overall_performance_percentile','')::numeric,
    nullif(p_snapshot->>'attacking_percentile','')::numeric,
    nullif(p_snapshot->>'creativity_percentile','')::numeric,
    nullif(p_snapshot->>'progression_percentile','')::numeric,
    nullif(p_snapshot->>'possession_percentile','')::numeric,
    nullif(p_snapshot->>'defending_percentile','')::numeric,
    nullif(p_snapshot->>'aerial_percentile','')::numeric,
    nullif(p_snapshot->>'goalkeeping_percentile','')::numeric,
    nullif(p_snapshot->>'physical_percentile','')::numeric,
    nullif(p_snapshot->>'discipline_percentile','')::numeric
  );
  if v_score is null then raise exception 'Add an overall performance percentile or enough position-specific percentile evidence'; end if;

  if v_id is null then
    insert into djm_os.player_performance_snapshots(
      player_id, competition_id, season_label, position_group, evidence_date,
      minutes, starts, appearances, possible_minutes,
      overall_performance_percentile, attacking_percentile, creativity_percentile,
      progression_percentile, possession_percentile, defending_percentile,
      aerial_percentile, goalkeeping_percentile, physical_percentile,
      discipline_percentile, peer_group_description, provider, source_name,
      source_url, source_reference, observed_at, verified_at, verified_by,
      confidence, raw_metrics, metadata
    ) values (
      p_player_id, nullif(p_snapshot->>'competition_id','')::uuid,
      nullif(trim(coalesce(p_snapshot->>'season_label','')), ''), v_group, v_evidence_date,
      nullif(p_snapshot->>'minutes','')::integer, nullif(p_snapshot->>'starts','')::integer,
      nullif(p_snapshot->>'appearances','')::integer, nullif(p_snapshot->>'possible_minutes','')::integer,
      nullif(p_snapshot->>'overall_performance_percentile','')::numeric,
      nullif(p_snapshot->>'attacking_percentile','')::numeric,
      nullif(p_snapshot->>'creativity_percentile','')::numeric,
      nullif(p_snapshot->>'progression_percentile','')::numeric,
      nullif(p_snapshot->>'possession_percentile','')::numeric,
      nullif(p_snapshot->>'defending_percentile','')::numeric,
      nullif(p_snapshot->>'aerial_percentile','')::numeric,
      nullif(p_snapshot->>'goalkeeping_percentile','')::numeric,
      nullif(p_snapshot->>'physical_percentile','')::numeric,
      nullif(p_snapshot->>'discipline_percentile','')::numeric,
      v_peer, v_provider, v_source_name, nullif(trim(coalesce(p_snapshot->>'source_url','')), ''),
      nullif(trim(coalesce(p_snapshot->>'source_reference','')), ''), v_observed_at, v_verified_at,
      auth.uid(), nullif(p_snapshot->>'confidence','')::numeric,
      coalesce(p_snapshot->'raw_metrics','{}'::jsonb), coalesce(p_snapshot->'metadata','{}'::jsonb)
    ) returning id into v_id;
  else
    update djm_os.player_performance_snapshots set
      competition_id = nullif(p_snapshot->>'competition_id','')::uuid,
      season_label = nullif(trim(coalesce(p_snapshot->>'season_label','')), ''),
      position_group = v_group,
      evidence_date = v_evidence_date,
      minutes = nullif(p_snapshot->>'minutes','')::integer,
      starts = nullif(p_snapshot->>'starts','')::integer,
      appearances = nullif(p_snapshot->>'appearances','')::integer,
      possible_minutes = nullif(p_snapshot->>'possible_minutes','')::integer,
      overall_performance_percentile = nullif(p_snapshot->>'overall_performance_percentile','')::numeric,
      attacking_percentile = nullif(p_snapshot->>'attacking_percentile','')::numeric,
      creativity_percentile = nullif(p_snapshot->>'creativity_percentile','')::numeric,
      progression_percentile = nullif(p_snapshot->>'progression_percentile','')::numeric,
      possession_percentile = nullif(p_snapshot->>'possession_percentile','')::numeric,
      defending_percentile = nullif(p_snapshot->>'defending_percentile','')::numeric,
      aerial_percentile = nullif(p_snapshot->>'aerial_percentile','')::numeric,
      goalkeeping_percentile = nullif(p_snapshot->>'goalkeeping_percentile','')::numeric,
      physical_percentile = nullif(p_snapshot->>'physical_percentile','')::numeric,
      discipline_percentile = nullif(p_snapshot->>'discipline_percentile','')::numeric,
      peer_group_description = v_peer,
      provider = v_provider,
      source_name = v_source_name,
      source_url = nullif(trim(coalesce(p_snapshot->>'source_url','')), ''),
      source_reference = nullif(trim(coalesce(p_snapshot->>'source_reference','')), ''),
      observed_at = v_observed_at,
      verified_at = v_verified_at,
      verified_by = auth.uid(),
      confidence = nullif(p_snapshot->>'confidence','')::numeric,
      raw_metrics = coalesce(p_snapshot->'raw_metrics', raw_metrics),
      metadata = coalesce(p_snapshot->'metadata', metadata),
      updated_at = now()
    where id = v_id and player_id = p_player_id;
    if not found then raise exception 'Performance snapshot not found'; end if;
  end if;

  perform private.djm_mark_player_score_stale(p_player_id, 'Verified performance evidence changed');
  insert into djm_os.events(event_type, actor_user_id, player_id, payload, source, confidence, occurred_at)
  values('PLAYER_PERFORMANCE_EVIDENCE_SAVED', auth.uid(), p_player_id,
    jsonb_build_object('snapshot_id', v_id, 'position_group', v_group, 'performance_score', round(v_score,2), 'peer_group', v_peer),
    'performance_evidence', coalesce(nullif(p_snapshot->>'confidence','')::numeric, 1), now());

  return jsonb_build_object('id', v_id, 'position_group', v_group, 'performance_score', round(v_score,2));
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_player_score_competition_context(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  p public.players%rowtype;
  c djm_os.competitions%rowtype;
  ce record;
  v_unattached boolean;
  v_league text;
  v_country text;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  select * into p from public.players where id = p_player_id;
  if not found then return jsonb_build_object('basis', 'unresolved'); end if;

  v_unattached := lower(trim(coalesce(p.current_club, ''))) in ('', 'n/a', 'na', 'none', 'free agent', 'free-agent', 'unattached', 'available')
    or lower(trim(coalesce(p.contract_status, ''))) in ('free agent', 'free-agent', 'unattached', 'expired');

  if p.current_competition_id is not null then
    select * into c from djm_os.competitions where id = p.current_competition_id and active;
    if found then
      return jsonb_build_object(
        'competition_id', c.id,
        'competition_name', c.display_name,
        'country', c.country,
        'basis', 'current_competition',
        'is_current', true,
        'career_entry_id', null,
        'season_label', null,
        'evidence_date', null
      );
    end if;
  end if;

  v_league := nullif(trim(coalesce(p.current_league, '')), '');
  v_country := nullif(trim(coalesce(p.current_country, '')), '');

  if not v_unattached
     and lower(coalesce(v_league, '')) not in ('', 'n/a', 'na', 'none', 'unknown', 'all competitions') then
    select * into c
    from djm_os.competitions x
    where x.active
      and (x.country is null or v_country is null or lower(x.country) = lower(v_country))
      and (
        lower(x.display_name) = lower(v_league)
        or exists (
          select 1 from unnest(x.aliases) alias_name
          where lower(alias_name) = lower(v_league)
        )
      )
    order by (lower(coalesce(x.country,'')) = lower(coalesce(v_country,''))) desc
    limit 1;

    return jsonb_build_object(
      'competition_id', case when found then c.id else null end,
      'competition_name', case when found then c.display_name else v_league end,
      'country', case when found then c.country else v_country end,
      'basis', 'current_league_text',
      'is_current', true,
      'career_entry_id', null,
      'season_label', null,
      'evidence_date', null
    );
  end if;

  select
    e.id,
    e.competition_id,
    e.league,
    e.country,
    e.club_name,
    e.season_label,
    public.djm_career_evidence_date(e.season_label, e.start_date, e.end_date) as evidence_date
  into ce
  from public.career_entries e
  where e.player_id = p_player_id
    and e.source_reviewed_at is not null
    and coalesce(e.minutes, 0) > 0
    and public.djm_career_evidence_date(e.season_label, e.start_date, e.end_date) >= current_date - interval '24 months'
    and lower(trim(coalesce(e.league, ''))) not in ('', 'n/a', 'na', 'none', 'unknown', 'all competitions')
  order by
    public.djm_career_evidence_date(e.season_label, e.start_date, e.end_date) desc,
    e.source_reviewed_at desc,
    e.sort_order asc nulls last
  limit 1;

  if ce.id is null then
    return jsonb_build_object(
      'competition_id', null,
      'competition_name', null,
      'country', null,
      'basis', 'unresolved',
      'is_current', false,
      'career_entry_id', null,
      'season_label', null,
      'evidence_date', null
    );
  end if;

  if ce.competition_id is not null then
    select * into c from djm_os.competitions where id = ce.competition_id and active;
  else
    select * into c
    from djm_os.competitions x
    where x.active
      and (x.country is null or ce.country is null or lower(x.country) = lower(ce.country))
      and (
        lower(x.display_name) = lower(ce.league)
        or exists (
          select 1 from unnest(x.aliases) alias_name
          where lower(alias_name) = lower(ce.league)
        )
      )
    order by (lower(coalesce(x.country,'')) = lower(coalesce(ce.country,''))) desc
    limit 1;
  end if;

  return jsonb_build_object(
    'competition_id', case when found then c.id else ce.competition_id end,
    'competition_name', case when found then c.display_name else ce.league end,
    'country', case when found then c.country else ce.country end,
    'basis', 'most_recent_verified_competition',
    'is_current', false,
    'career_entry_id', ce.id,
    'career_club', ce.club_name,
    'season_label', ce.season_label,
    'evidence_date', ce.evidence_date
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_player_score_override(p_player_id uuid, p_score smallint DEFAULT NULL::smallint, p_potential_score smallint DEFAULT NULL::smallint, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_removing boolean := p_score is null and p_potential_score is null;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if not exists(select 1 from public.players where id = p_player_id) then raise exception 'Player not found'; end if;
  if p_score is not null and (p_score < 0 or p_score > 100) then raise exception 'Player score must be between 0 and 100'; end if;
  if p_potential_score is not null and (p_potential_score < 0 or p_potential_score > 100) then raise exception 'Potential score must be between 0 and 100'; end if;
  if not v_removing and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Add a reason for the manual override'; end if;

  insert into djm_os.player_scorecards(
    player_id, manual_score, manual_potential_score, override_reason, updated_by
  ) values (
    p_player_id, p_score, p_potential_score,
    case when v_removing then null else trim(p_reason) end, auth.uid()
  )
  on conflict (player_id) do update set
    manual_score = excluded.manual_score,
    manual_potential_score = excluded.manual_potential_score,
    override_reason = excluded.override_reason,
    updated_by = auth.uid(),
    updated_at = now();

  insert into djm_os.events(event_type, actor_user_id, player_id, payload, source, confidence, occurred_at)
  values(
    case when v_removing then 'PLAYER_SCORE_OVERRIDE_REMOVED' else 'PLAYER_SCORE_OVERRIDE_UPDATED' end,
    auth.uid(), p_player_id,
    jsonb_build_object('manual_score', p_score, 'manual_potential_score', p_potential_score, 'reason', case when v_removing then null else trim(p_reason) end),
    'manual_ui', 1, now()
  );

  return public.djm_player_scorecard(p_player_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_player_scorecard(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_intel jsonb;
  v_score jsonb;
  v_projection jsonb;
  v_tier text;
  v_display numeric;
begin
  if not djm_os.is_team_member() and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'DJM team access required';
  end if;
  v_intel := public.djm_refresh_player_global_intelligence(p_player_id);
  v_score := coalesce(v_intel -> 'scorecard','{}'::jsonb);
  v_projection := coalesce(v_intel -> 'projection','{}'::jsonb);
  v_tier := coalesce(v_score ->> 'score_tier','unavailable');
  v_display := nullif(v_score ->> 'display_score','')::numeric;
  return v_score || jsonb_build_object(
    'display_score',v_display,
    'model_score',case when v_tier='full' then v_display else null end,
    'provisional_score',case when v_tier<>'full' then v_display else null end,
    'provisional_confidence',nullif(v_score ->> 'confidence','')::numeric,
    'potential_score',nullif(v_projection ->> 'forecast_score','')::numeric,
    'potential_model_score',nullif(v_projection ->> 'forecast_score','')::numeric,
    'model_status',coalesce(v_score ->> 'score_state',v_tier),
    'basis',jsonb_build_object(
      'evidence_band',v_score -> 'evidence_band',
      'effective_evidence_coverage',v_score -> 'data_coverage',
      'global_model',true,
      'projection',v_projection
    )
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_player_scorecard_v2_core(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  p public.players%rowtype;
  b djm_os.league_benchmarks%rowtype;
  s djm_os.player_scorecards%rowtype;
  v_context jsonb;
  v_competition_id uuid;
  v_competition_name text;
  v_competition_country text;
  v_competition_basis text;
  v_position_group text;
  v_age integer;
  v_recent_minutes integer := 0;
  v_recent_apps numeric := 0;
  v_recent_starts numeric := 0;
  v_weighted_minutes numeric := 0;
  v_weighted_apps numeric := 0;
  v_weighted_starts numeric := 0;
  v_minutes_signal numeric;
  v_starter_signal numeric;
  v_role_score numeric;
  v_performance_score numeric;
  v_performance_confidence numeric;
  v_recent_perf numeric;
  v_prior_perf numeric;
  v_trend_score numeric;
  v_availability_score numeric;
  v_experience_score numeric;
  v_experience_minutes numeric := 0;
  v_international_apps integer := 0;
  v_level_score numeric;
  v_core_score numeric;
  v_age_adjustment numeric := 0;
  v_potential_adjustment numeric;
  v_potential numeric;
  v_model numeric;
  v_status text := 'not_enough_playing_time_data';
  v_coverage integer := 0;
  v_weighted_total numeric := 0;
  v_benchmark_freshness text := 'unknown';
  v_confidence integer := 0;
  v_basis jsonb;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  select * into p from public.players where id = p_player_id;
  if not found then raise exception 'Player not found'; end if;

  v_position_group := private.djm_position_group(p.primary_position);
  if p.date_of_birth is not null then v_age := date_part('year', age(current_date, p.date_of_birth))::int; end if;

  select
    coalesce(sum(coalesce(c.minutes,0)),0)::int,
    coalesce(sum(coalesce(c.appearances,0)),0),
    coalesce(sum(coalesce(c.starts,0)),0),
    coalesce(sum(coalesce(c.minutes,0) * private.djm_current_recency_weight(public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date))),0),
    coalesce(sum(coalesce(c.appearances,0) * private.djm_current_recency_weight(public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date))),0),
    coalesce(sum(coalesce(c.starts,0) * private.djm_current_recency_weight(public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date))),0)
  into v_recent_minutes, v_recent_apps, v_recent_starts, v_weighted_minutes, v_weighted_apps, v_weighted_starts
  from public.career_entries c
  where c.player_id = p_player_id
    and c.source_reviewed_at is not null
    and public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date) >= current_date - interval '24 months';

  if v_recent_minutes >= 500 then
    v_minutes_signal := least(100, v_weighted_minutes / 2200 * 100);
    if v_weighted_apps > 0 then v_starter_signal := least(100, greatest(0, v_weighted_starts / v_weighted_apps * 100)); end if;
    v_role_score := case when v_starter_signal is null then v_minutes_signal else v_minutes_signal * .8 + v_starter_signal * .2 end;
  end if;

  v_context := public.djm_player_score_competition_context(p_player_id);
  v_competition_id := nullif(v_context->>'competition_id','')::uuid;
  v_competition_name := nullif(v_context->>'competition_name','');
  v_competition_country := nullif(v_context->>'country','');
  v_competition_basis := coalesce(v_context->>'basis','unresolved');

  select lb.* into b
  from djm_os.league_benchmarks lb
  left join djm_os.competitions c on c.id = lb.competition_id
  where lb.verified_at is not null
    and (
      (v_competition_id is not null and lb.competition_id = v_competition_id)
      or (v_competition_name is not null and lower(lb.league_name)=lower(v_competition_name)
        and (lb.country is null or v_competition_country is null or lower(lb.country)=lower(v_competition_country)))
      or (v_competition_name is not null and (lower(c.display_name)=lower(v_competition_name)
        or exists(select 1 from unnest(c.aliases) a where lower(a)=lower(v_competition_name)))
        and (c.country is null or v_competition_country is null or lower(c.country)=lower(v_competition_country)))
    )
  order by (v_competition_id is not null and lb.competition_id=v_competition_id) desc, lb.verified_at desc
  limit 1;

  if b.id is not null then
    v_level_score := b.strength_score;
    v_benchmark_freshness := case
      when coalesce(b.next_review_at, b.verified_at + interval '90 days') < now() then 'stale'
      when now() > b.verified_at + interval '30 days' then 'aging'
      else 'fresh' end;
  end if;

  with scored as (
    select snap.*,
      private.djm_position_performance_score(
        snap.position_group, snap.overall_performance_percentile, snap.attacking_percentile,
        snap.creativity_percentile, snap.progression_percentile, snap.possession_percentile,
        snap.defending_percentile, snap.aerial_percentile, snap.goalkeeping_percentile,
        snap.physical_percentile, snap.discipline_percentile
      ) as perf_score,
      private.djm_current_recency_weight(snap.evidence_date) as recency
    from djm_os.player_performance_snapshots snap
    where snap.player_id = p_player_id
      and snap.verified_at is not null
      and snap.evidence_date >= current_date - interval '18 months'
      and coalesce(snap.minutes,0) >= 180
      and (snap.position_group = v_position_group or v_position_group = 'UNKNOWN')
  )
  select
    sum(perf_score * greatest(coalesce(minutes,180),180) * recency) / nullif(sum(greatest(coalesce(minutes,180),180) * recency),0),
    sum(coalesce(confidence,1) * greatest(coalesce(minutes,180),180) * recency) / nullif(sum(greatest(coalesce(minutes,180),180) * recency),0),
    sum(case when evidence_date >= current_date - interval '6 months' then perf_score * greatest(coalesce(minutes,180),180) else 0 end)
      / nullif(sum(case when evidence_date >= current_date - interval '6 months' then greatest(coalesce(minutes,180),180) else 0 end),0),
    sum(case when evidence_date < current_date - interval '6 months' then perf_score * greatest(coalesce(minutes,180),180) else 0 end)
      / nullif(sum(case when evidence_date < current_date - interval '6 months' then greatest(coalesce(minutes,180),180) else 0 end),0),
    least(100, sum(case when possible_minutes > 0 and evidence_date >= current_date - interval '12 months' then coalesce(minutes,0) else 0 end)::numeric
      / nullif(sum(case when possible_minutes > 0 and evidence_date >= current_date - interval '12 months' then possible_minutes else 0 end),0) * 100)
  into v_performance_score, v_performance_confidence, v_recent_perf, v_prior_perf, v_availability_score
  from scored
  where perf_score is not null and recency > 0;

  if v_recent_perf is not null and v_prior_perf is not null then
    v_trend_score := least(100, greatest(0, 50 + (v_recent_perf - v_prior_perf) * 1.25));
  end if;

  with career_level as (
    select c.*,
      public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date) as evidence_date,
      lb.strength_score as level_score
    from public.career_entries c
    left join lateral (
      select x.strength_score
      from djm_os.league_benchmarks x
      left join djm_os.competitions xc on xc.id=x.competition_id
      where x.verified_at is not null and (
        (c.competition_id is not null and x.competition_id=c.competition_id)
        or (c.league is not null and lower(x.league_name)=lower(c.league)
          and (x.country is null or c.country is null or lower(x.country)=lower(c.country)))
        or (c.league is not null and (lower(xc.display_name)=lower(c.league)
          or exists(select 1 from unnest(xc.aliases) a where lower(a)=lower(c.league)))
          and (xc.country is null or c.country is null or lower(xc.country)=lower(c.country)))
      ) order by (c.competition_id is not null and x.competition_id=c.competition_id) desc, x.verified_at desc limit 1
    ) lb on true
    where c.player_id=p_player_id and c.source_reviewed_at is not null
  )
  select
    coalesce(sum(case when level_score is not null then coalesce(minutes,0) * private.djm_experience_recency_weight(evidence_date)
      * (.5 + level_score / 200) else 0 end),0),
    coalesce(sum(case when is_international then coalesce(appearances,0) else 0 end),0)::int
  into v_experience_minutes, v_international_apps
  from career_level where evidence_date is not null;

  if v_experience_minutes > 0 then
    v_experience_score := least(100, v_experience_minutes / 8000 * 100 + least(8, v_international_apps * .5));
  end if;

  if v_recent_minutes < 500 then
    v_status := 'not_enough_playing_time_data';
  elsif v_competition_name is null then
    v_status := 'competition_evidence_required';
  elsif b.id is null then
    v_status := 'benchmark_required';
  elsif v_performance_score is null then
    v_status := 'performance_data_required';
  else
    v_coverage := 30 + 30 + 15
      + case when v_experience_score is not null then 10 else 0 end
      + case when v_trend_score is not null then 10 else 0 end
      + case when v_availability_score is not null then 5 else 0 end;

    v_weighted_total := v_level_score * 30 + v_performance_score * 30 + v_role_score * 15
      + coalesce(v_experience_score * 10,0) + coalesce(v_trend_score * 10,0) + coalesce(v_availability_score * 5,0);

    if v_coverage < 75 then
      v_status := 'not_enough_model_coverage';
    else
      v_core_score := v_weighted_total / v_coverage;
      v_age_adjustment := private.djm_age_performance_adjustment(v_age, v_position_group, v_performance_score);
      v_model := least(100, greatest(0, v_core_score + v_age_adjustment));
      v_potential_adjustment := private.djm_potential_age_adjustment(v_age, v_position_group);
      if v_potential_adjustment is not null then
        v_potential := least(100, greatest(0, v_model + v_potential_adjustment
          + case when v_trend_score is null then 0 else greatest(-6,least(6,(v_trend_score-50)*.12)) end));
      end if;
      v_status := 'calculated';
    end if;
  end if;

  if v_status <> 'calculated' then
    v_coverage := case
      when b.id is null then 0
      else 30 + case when v_performance_score is not null then 30 else 0 end
        + case when v_role_score is not null then 15 else 0 end
        + case when v_experience_score is not null then 10 else 0 end
        + case when v_trend_score is not null then 10 else 0 end
        + case when v_availability_score is not null then 5 else 0 end
      end;
  end if;

  v_confidence := least(100, greatest(0, round(
    v_coverage * .5
    + least(20, v_recent_minutes::numeric / 1800 * 20)
    + case v_benchmark_freshness when 'fresh' then 10 when 'aging' then 7 when 'stale' then 3 else 0 end
    + coalesce(v_performance_confidence * 15,0)
    + case when p.verification_status='verified' then 5 else 0 end
  )))::int;

  v_basis := jsonb_build_object(
    'model','DJM Player Score v2',
    'model_definition','Current demonstrated football level, not readiness, Club Match, transfer probability or market price',
    'status',v_status,
    'position_group',v_position_group,
    'competition_id',v_competition_id,
    'competition_name',v_competition_name,
    'competition_country',v_competition_country,
    'competition_basis',v_competition_basis,
    'current_club',p.current_club,
    'league_strength_score',b.strength_score,
    'league_benchmark_provider',b.benchmark_provider,
    'league_benchmark_metric',b.benchmark_metric,
    'league_benchmark_raw_value',b.raw_strength_value,
    'league_benchmark_verified_at',b.verified_at,
    'league_benchmark_methodology',b.methodology,
    'benchmark_freshness',v_benchmark_freshness,
    'recent_minutes_24m',v_recent_minutes,
    'weighted_recent_minutes',round(v_weighted_minutes,0),
    'playing_time_score',case when v_role_score is null then null else round(v_role_score) end,
    'level_score',case when v_level_score is null then null else round(v_level_score) end,
    'performance_score',case when v_performance_score is null then null else round(v_performance_score) end,
    'role_score',case when v_role_score is null then null else round(v_role_score) end,
    'experience_score',case when v_experience_score is null then null else round(v_experience_score) end,
    'trend_score',case when v_trend_score is null then null else round(v_trend_score) end,
    'availability_score',case when v_availability_score is null then null else round(v_availability_score) end,
    'ability_core_score',case when v_core_score is null then null else round(v_core_score) end,
    'age',v_age,
    'age_performance_adjustment',round(v_age_adjustment,2),
    'potential_age_adjustment',round(v_potential_adjustment,2),
    'data_coverage',v_coverage,
    'evidence_window_months',24,
    'current_recency_weights',jsonb_build_object('0_6_months',1,'7_12_months',.85,'13_18_months',.65,'19_24_months',.45,'older',0),
    'experience_recency_weights',jsonb_build_object('0_24_months',1,'25_48_months',.65,'49_72_months',.35,'older',.15),
    'component_weights',jsonb_build_object('level',30,'position_performance',30,'role_minutes',15,'experience',10,'trend',10,'availability',5),
    'performance_peer_rule','Performance percentiles must be benchmarked against a relevant position and competition or level peer group',
    'age_rule','Age is a modest position-specific performance prior. Strong recent performance reduces the age penalty. Potential carries the larger future age effect.',
    'recommended_performance_source','Licensed Wyscout Data or another authorised position-adjusted dataset',
    'recommended_benchmark_source','Opta Power Rankings / licensed Stats Perform league-strength data or a reviewed authorised equivalent',
    'calculated_at',now()
  );

  insert into djm_os.player_scorecards(
    player_id, model_score, potential_model_score, score_status, confidence, basis,
    model_version, calculated_at, stale_at, stale_reason, evidence_freshness, updated_by,
    ability_core_score, performance_score, role_score, experience_score, trend_score,
    availability_score, age_adjustment, data_coverage, position_group
  ) values (
    p_player_id, case when v_model is null then null else round(v_model)::smallint end,
    case when v_potential is null then null else round(v_potential)::smallint end,
    v_status, v_confidence::smallint, v_basis, 'djm_player_score_v2', now(), null, null,
    case when v_status='calculated' and v_benchmark_freshness='fresh' then 'fresh'
         when v_status='calculated' then v_benchmark_freshness else 'unknown' end,
    auth.uid(),
    case when v_core_score is null then null else round(v_core_score)::smallint end,
    case when v_performance_score is null then null else round(v_performance_score)::smallint end,
    case when v_role_score is null then null else round(v_role_score)::smallint end,
    case when v_experience_score is null then null else round(v_experience_score)::smallint end,
    case when v_trend_score is null then null else round(v_trend_score)::smallint end,
    case when v_availability_score is null then null else round(v_availability_score)::smallint end,
    round(v_age_adjustment,2), v_coverage::smallint, v_position_group
  ) on conflict (player_id) do update set
    model_score=excluded.model_score,
    potential_model_score=excluded.potential_model_score,
    score_status=excluded.score_status,
    confidence=excluded.confidence,
    basis=excluded.basis,
    model_version=excluded.model_version,
    calculated_at=excluded.calculated_at,
    stale_at=null,
    stale_reason=null,
    evidence_freshness=excluded.evidence_freshness,
    updated_by=auth.uid(),
    ability_core_score=excluded.ability_core_score,
    performance_score=excluded.performance_score,
    role_score=excluded.role_score,
    experience_score=excluded.experience_score,
    trend_score=excluded.trend_score,
    availability_score=excluded.availability_score,
    age_adjustment=excluded.age_adjustment,
    data_coverage=excluded.data_coverage,
    position_group=excluded.position_group,
    updated_at=now()
  returning * into s;

  insert into djm_os.events(event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values('PLAYER_SCORE_CALCULATED',auth.uid(),p_player_id,
    jsonb_build_object('status',v_status,'model_score',s.model_score,'model_version','djm_player_score_v2','coverage',v_coverage,'position_group',v_position_group),
    'deterministic_model',v_confidence::numeric/100,now());

  return jsonb_build_object(
    'player_id',p_player_id,
    'score',coalesce(s.manual_score,s.model_score),
    'model_score',s.model_score,
    'manual_score',s.manual_score,
    'potential_score',coalesce(s.manual_potential_score,s.potential_model_score),
    'potential_model_score',s.potential_model_score,
    'manual_potential_score',s.manual_potential_score,
    'source',case when s.manual_score is not null then 'manual_override' when s.model_score is not null then 'model' else 'insufficient_data' end,
    'status',case when s.manual_score is not null then 'manual_override' else s.score_status end,
    'model_status',s.score_status,
    'confidence',s.confidence,
    'data_coverage',s.data_coverage,
    'override_reason',s.override_reason,
    'basis',s.basis,
    'model_version',s.model_version,
    'calculated_at',s.calculated_at
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_player_scorecard_v4_runtime_core(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  p public.players%rowtype;
  core jsonb;
  s djm_os.player_scorecards%rowtype;
  b jsonb;
  v_underlying_status text;
  v_position_group text;
  v_age integer;
  v_recent_minutes numeric := 0;
  v_weighted_minutes numeric := 0;
  v_weighted_apps numeric := 0;
  v_weighted_starts numeric := 0;
  v_starts_known boolean := false;
  v_level numeric;
  v_perf numeric;
  v_perf_conf numeric;
  v_recent_perf numeric;
  v_prior_perf numeric;
  v_role numeric;
  v_exp numeric;
  v_trend numeric;
  v_avail numeric;
  v_coverage integer := 0;
  v_weighted_total numeric := 0;
  v_core_score numeric;
  v_age_adjust numeric := 0;
  v_potential_adjust numeric;
  v_model numeric;
  v_potential numeric;
  v_benchmark_quality numeric := 0;
  v_freshness_quality numeric := .65;
  v_minutes_quality numeric := 0;
  v_verified_quality numeric := 0;
  v_conf integer := 0;
  v_range_half integer := 0;
  v_range_low integer;
  v_range_high integer;
  v_missing jsonb := '[]'::jsonb;
  v_tier text := 'unavailable';
  v_provisional numeric;
  v_provisional_conf integer;
  v_context_weight numeric := 0;
  v_context_total numeric := 0;
  v_context_estimate numeric;
  v_context_shrink numeric;
  v_event_type text;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;

  select * into p from public.players where id=p_player_id;
  if not found then raise exception 'Player not found'; end if;

  core := public.djm_player_scorecard_v2_core(p_player_id);
  if coalesce(core->>'model_status',core->>'status')='benchmark_required' then
    perform private.djm_autoresolve_player_benchmark(p_player_id);
    core := public.djm_player_scorecard_v2_core(p_player_id);
  end if;

  select * into s from djm_os.player_scorecards where player_id=p_player_id;
  b := coalesce(s.basis,'{}'::jsonb);
  v_underlying_status := coalesce(s.score_status,'not_calculated');
  v_position_group := coalesce(nullif(s.position_group,''),private.djm_position_group(p.primary_position));
  if p.date_of_birth is not null then v_age := date_part('year',age(current_date,p.date_of_birth))::int; end if;

  v_recent_minutes := coalesce(nullif(b->>'recent_minutes_24m','')::numeric,0);
  v_level := nullif(b->>'level_score','')::numeric;
  v_exp := nullif(b->>'experience_score','')::numeric;
  v_avail := nullif(b->>'availability_score','')::numeric;

  select
    coalesce(sum(coalesce(c.minutes,0) * private.djm_current_recency_weight(public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date))),0),
    coalesce(sum(coalesce(c.appearances,0) * private.djm_current_recency_weight(public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date))),0),
    coalesce(sum(coalesce(c.starts,0) * private.djm_current_recency_weight(public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date))),0),
    count(*) filter (where c.starts is not null) > 0
  into v_weighted_minutes,v_weighted_apps,v_weighted_starts,v_starts_known
  from public.career_entries c
  where c.player_id=p_player_id
    and c.source_reviewed_at is not null
    and public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date) >= current_date - interval '24 months';

  if v_recent_minutes >= 500 then
    v_role := private.djm_v4_role_score(v_weighted_minutes,v_weighted_apps,v_weighted_starts,v_starts_known);
  end if;

  with raw as (
    select snap.*,
      private.djm_position_performance_score(
        snap.position_group,
        snap.overall_performance_percentile,
        snap.attacking_percentile,
        snap.creativity_percentile,
        snap.progression_percentile,
        snap.possession_percentile,
        snap.defending_percentile,
        snap.aerial_percentile,
        snap.goalkeeping_percentile,
        snap.physical_percentile,
        snap.discipline_percentile
      ) as raw_perf,
      private.djm_current_recency_weight(snap.evidence_date) as recency,
      private.djm_v4_sample_reliability(snap.minutes,snap.confidence) as reliability
    from djm_os.player_performance_snapshots snap
    where snap.player_id=p_player_id
      and snap.verified_at is not null
      and snap.evidence_date >= current_date - interval '18 months'
      and coalesce(snap.minutes,0) >= 180
      and (snap.position_group=v_position_group or v_position_group='UNKNOWN')
  ), adjusted as (
    select *,
      50 + (raw_perf-50)*reliability as adjusted_perf,
      sqrt(greatest(coalesce(minutes,180),180)::numeric) * recency as evidence_weight
    from raw
    where raw_perf is not null and recency > 0
  )
  select
    sum(adjusted_perf*evidence_weight)/nullif(sum(evidence_weight),0),
    sum(reliability*evidence_weight)/nullif(sum(evidence_weight),0),
    sum(case when evidence_date >= current_date-interval '6 months' then adjusted_perf*evidence_weight else 0 end)
      / nullif(sum(case when evidence_date >= current_date-interval '6 months' then evidence_weight else 0 end),0),
    sum(case when evidence_date < current_date-interval '6 months' then adjusted_perf*evidence_weight else 0 end)
      / nullif(sum(case when evidence_date < current_date-interval '6 months' then evidence_weight else 0 end),0)
  into v_perf,v_perf_conf,v_recent_perf,v_prior_perf
  from adjusted;

  if v_recent_perf is not null and v_prior_perf is not null then
    v_trend := least(100,greatest(0,50 + (v_recent_perf-v_prior_perf)*.85));
  end if;

  if v_level is null then v_missing := v_missing || jsonb_build_array('competition_level'); end if;
  if v_perf is null then v_missing := v_missing || jsonb_build_array('position_adjusted_performance'); end if;
  if v_role is null then v_missing := v_missing || jsonb_build_array('role_minutes'); end if;
  if v_exp is null then v_missing := v_missing || jsonb_build_array('experience'); end if;
  if v_trend is null then v_missing := v_missing || jsonb_build_array('trend'); end if;
  if v_avail is null then v_missing := v_missing || jsonb_build_array('availability'); end if;

  v_coverage :=
    case when v_level is not null then 22 else 0 end +
    case when v_perf is not null then 40 else 0 end +
    case when v_role is not null then 12 else 0 end +
    case when v_exp is not null then 8 else 0 end +
    case when v_trend is not null then 10 else 0 end +
    case when v_avail is not null then 8 else 0 end;

  v_weighted_total :=
    coalesce(v_level*22,0) +
    coalesce(v_perf*40,0) +
    coalesce(v_role*12,0) +
    coalesce(v_exp*8,0) +
    coalesce(v_trend*10,0) +
    coalesce(v_avail*8,0);

  v_benchmark_quality := private.djm_v4_benchmark_quality(
    b->>'league_benchmark_provider',
    b->>'benchmark_freshness'
  );
  v_freshness_quality := case lower(coalesce(b->>'benchmark_freshness','unknown'))
    when 'fresh' then 1 when 'aging' then .82 when 'stale' then .55 else .65 end;
  v_minutes_quality := least(1,sqrt(least(v_recent_minutes,1800)/1800.0));
  v_verified_quality := case when p.verification_status='verified' then 1 else .55 end;

  if v_recent_minutes >= 500 and v_level is not null and v_perf is not null and v_role is not null and v_coverage >= 82 then
    v_core_score := v_weighted_total / v_coverage;
    v_age_adjust := coalesce(private.djm_age_performance_adjustment(v_age,v_position_group,v_perf),0);
    v_model := least(100,greatest(0,v_core_score+v_age_adjust));
    v_potential_adjust := private.djm_potential_age_adjustment(v_age,v_position_group);
    if v_potential_adjust is not null then
      v_potential := least(100,greatest(0,v_model+v_potential_adjust+
        case when v_trend is null then 0 else greatest(-5,least(5,(v_trend-50)*.10)) end));
    end if;

    v_conf := least(100,greatest(0,round(100*(
      .35*(v_coverage/100.0) +
      .25*coalesce(v_perf_conf,.45) +
      .15*v_minutes_quality +
      .15*v_benchmark_quality +
      .05*v_verified_quality +
      .05*v_freshness_quality
    ))))::int;

    v_range_half := greatest(3,least(10,round(3+(100-v_conf)/15.0)::int));
    v_range_low := greatest(0,round(v_model)::int-v_range_half);
    v_range_high := least(100,round(v_model)::int+v_range_half);
    v_tier := 'full';
    v_event_type := 'PLAYER_SCORE_V4_FULL_CALCULATED';
  elsif v_recent_minutes >= 500 and v_level is not null and v_role is not null then
    if v_level is not null then v_context_total:=v_context_total+v_level*22; v_context_weight:=v_context_weight+22; end if;
    if v_role is not null then v_context_total:=v_context_total+v_role*12; v_context_weight:=v_context_weight+12; end if;
    if v_exp is not null then v_context_total:=v_context_total+v_exp*8; v_context_weight:=v_context_weight+8; end if;
    if v_trend is not null then v_context_total:=v_context_total+v_trend*10; v_context_weight:=v_context_weight+10; end if;
    if v_avail is not null then v_context_total:=v_context_total+v_avail*8; v_context_weight:=v_context_weight+8; end if;

    v_context_estimate := v_context_total/nullif(v_context_weight,0);
    v_context_shrink := least(.55,v_context_weight/100.0);
    v_provisional := 50 + (v_context_estimate-50)*v_context_shrink;
    v_provisional_conf := least(58,greatest(18,round(100*(
      .45*least(1,v_context_weight/60.0) +
      .20*v_minutes_quality +
      .20*v_benchmark_quality +
      .10*v_verified_quality +
      .05*v_freshness_quality
    ))))::int;
    v_range_half := greatest(8,least(18,round(8+(100-v_provisional_conf)/10.0)::int));
    v_range_low := greatest(0,round(v_provisional)::int-v_range_half);
    v_range_high := least(100,round(v_provisional)::int+v_range_half);
    v_tier := 'provisional';
    v_event_type := 'PLAYER_SCORE_V4_PROVISIONAL_CALCULATED';
  else
    v_tier := 'unavailable';
    v_event_type := 'PLAYER_SCORE_V4_UNAVAILABLE';
  end if;

  b := b || jsonb_build_object(
    'model','DJM Player Score V4',
    'model_version','djm_player_score_v4_evidence_fusion',
    'model_definition','Current demonstrated football level. Performance is the largest signal; competition provides context; sample reliability and uncertainty are explicit.',
    'component_weights',jsonb_build_object(
      'position_performance',40,
      'competition_level',22,
      'role_minutes',12,
      'experience',8,
      'trend',10,
      'availability',8
    ),
    'performance_score_raw_v2',s.performance_score,
    'performance_score',case when v_perf is null then null else round(v_perf) end,
    'performance_sample_reliability',case when v_perf_conf is null then null else round(v_perf_conf,3) end,
    'role_score',case when v_role is null then null else round(v_role) end,
    'trend_score',case when v_trend is null then null else round(v_trend) end,
    'experience_score',case when v_exp is null then null else round(v_exp) end,
    'availability_score',case when v_avail is null then null else round(v_avail) end,
    'level_score',case when v_level is null then null else round(v_level) end,
    'data_coverage',v_coverage,
    'score_tier',v_tier,
    'missing_inputs',v_missing,
    'benchmark_quality',round(v_benchmark_quality,3),
    'minutes_quality',round(v_minutes_quality,3),
    'sample_shrinkage_rule','Each performance snapshot is shrunk toward the 50th percentile using minutes and source confidence before aggregation.',
    'full_score_rule','Requires at least 500 verified recent senior minutes, competition level, position-adjusted performance, role evidence, and at least 82% weighted model coverage.',
    'provisional_methodology','Context-only estimate shrunk toward 50. Missing performance is not imputed as if observed and provisional confidence is capped at 58%.',
    'score_range',case when v_range_low is null then null else jsonb_build_object('low',v_range_low,'high',v_range_high) end,
    'calculated_at',now()
  );

  if v_tier='full' then
    update djm_os.player_scorecards set
      model_score=round(v_model)::smallint,
      potential_model_score=case when v_potential is null then null else round(v_potential)::smallint end,
      score_status='calculated',
      confidence=v_conf::smallint,
      basis=b,
      model_version='djm_player_score_v4_evidence_fusion',
      calculated_at=now(),
      stale_at=null,
      stale_reason=null,
      evidence_freshness=case when v_freshness_quality>=.95 then 'fresh' when v_freshness_quality>=.7 then 'aging' else 'stale' end,
      ability_core_score=round(v_core_score)::smallint,
      performance_score=round(v_perf)::smallint,
      role_score=round(v_role)::smallint,
      experience_score=case when v_exp is null then null else round(v_exp)::smallint end,
      trend_score=case when v_trend is null then null else round(v_trend)::smallint end,
      availability_score=case when v_avail is null then null else round(v_avail)::smallint end,
      age_adjustment=round(v_age_adjust,2),
      data_coverage=v_coverage::smallint,
      position_group=v_position_group,
      provisional_score=null,
      provisional_confidence=null,
      score_tier=case when s.manual_score is not null then 'manual_override' else 'full' end,
      missing_inputs=v_missing,
      updated_by=auth.uid(),
      updated_at=now()
    where player_id=p_player_id;
  elsif v_tier='provisional' then
    update djm_os.player_scorecards set
      model_score=null,
      potential_model_score=null,
      confidence=v_provisional_conf::smallint,
      basis=b,
      model_version='djm_player_score_v4_evidence_fusion',
      calculated_at=now(),
      ability_core_score=null,
      performance_score=case when v_perf is null then null else round(v_perf)::smallint end,
      role_score=round(v_role)::smallint,
      experience_score=case when v_exp is null then null else round(v_exp)::smallint end,
      trend_score=case when v_trend is null then null else round(v_trend)::smallint end,
      availability_score=case when v_avail is null then null else round(v_avail)::smallint end,
      age_adjustment=0,
      data_coverage=v_coverage::smallint,
      position_group=v_position_group,
      provisional_score=round(v_provisional)::smallint,
      provisional_confidence=v_provisional_conf::smallint,
      score_tier=case when s.manual_score is not null then 'manual_override' else 'provisional' end,
      missing_inputs=v_missing,
      updated_by=auth.uid(),
      updated_at=now()
    where player_id=p_player_id;
  else
    update djm_os.player_scorecards set
      model_score=null,
      potential_model_score=null,
      provisional_score=null,
      provisional_confidence=null,
      confidence=least(coalesce(confidence,0),35),
      basis=b,
      model_version='djm_player_score_v4_evidence_fusion',
      calculated_at=now(),
      data_coverage=v_coverage::smallint,
      position_group=v_position_group,
      score_tier=case when s.manual_score is not null then 'manual_override' else 'unavailable' end,
      missing_inputs=v_missing,
      updated_by=auth.uid(),
      updated_at=now()
    where player_id=p_player_id;
  end if;

  insert into djm_os.events(event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values(
    v_event_type,
    auth.uid(),
    p_player_id,
    jsonb_build_object(
      'score_tier',v_tier,
      'model_score',case when v_model is null then null else round(v_model) end,
      'provisional_score',case when v_provisional is null then null else round(v_provisional) end,
      'coverage',v_coverage,
      'missing_inputs',v_missing,
      'score_range',case when v_range_low is null then null else jsonb_build_object('low',v_range_low,'high',v_range_high) end
    ),
    'djm_player_score_v4_evidence_fusion',
    case when v_tier='full' then v_conf::numeric/100 when v_tier='provisional' then v_provisional_conf::numeric/100 else 0 end,
    now()
  );

  select * into s from djm_os.player_scorecards where player_id=p_player_id;

  return jsonb_build_object(
    'player_id',p_player_id,
    'display_score',coalesce(s.manual_score,s.model_score,s.provisional_score),
    'score',coalesce(s.manual_score,s.model_score,s.provisional_score),
    'model_score',s.model_score,
    'manual_score',s.manual_score,
    'provisional_score',s.provisional_score,
    'potential_score',coalesce(s.manual_potential_score,s.potential_model_score),
    'potential_model_score',s.potential_model_score,
    'manual_potential_score',s.manual_potential_score,
    'source',case when s.manual_score is not null then 'manual_override' when s.model_score is not null then 'model' when s.provisional_score is not null then 'provisional_model' else 'insufficient_data' end,
    'status',case when s.manual_score is not null then 'manual_override' else s.score_status end,
    'model_status',s.score_status,
    'score_tier',s.score_tier,
    'confidence',case when s.score_tier='provisional' then s.provisional_confidence else s.confidence end,
    'provisional_confidence',s.provisional_confidence,
    'data_coverage',s.data_coverage,
    'missing_inputs',s.missing_inputs,
    'basis',s.basis,
    'model_version',s.model_version,
    'calculated_at',s.calculated_at
  );
end;
$function$


commit;
