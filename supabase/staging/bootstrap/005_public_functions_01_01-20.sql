-- DJM Player staging public-function bootstrap — batch 01
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- all private function bootstrap batches, and all djm_os function batches.
--
-- Exact current-production definitions for public functions 1-20 of 240,
-- ordered by function name + identity arguments.
-- Production body MD5: 679eea9262261345164f84d6153d5aaf
--
-- Existing staging public platform_server_* RPCs were checked for collisions.
-- No exact production public function name/signature collision was found.
--
-- Body validation is disabled only during bootstrap because later public
-- batches may provide cross-function dependencies. No function is executed.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.create_player_invitation(invite_email text, player_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_email text := lower(trim(invite_email));
  v_name text := trim(coalesce(player_name,''));
  v_first text;
  v_last text;
  v_player_id uuid;
  v_token uuid;
  v_existing_user uuid;
begin
  if not private.is_admin() then
    raise exception 'Admin access required';
  end if;
  if v_email = '' or position('@' in v_email) < 2 then
    raise exception 'A valid player email is required';
  end if;

  select p.user_id, p.id into v_existing_user, v_player_id
  from public.players p
  join public.player_private pr on pr.player_id=p.id
  where lower(pr.personal_email)=v_email
  order by p.created_at desc
  limit 1;

  if v_existing_user is not null then
    raise exception 'This player already has an account';
  end if;

  select pi.token, pi.player_id into v_token, v_player_id
  from public.player_invites pi
  where lower(pi.email)=v_email and pi.status='pending' and pi.expires_at>now()
  order by pi.created_at desc
  limit 1;

  if v_token is not null then
    return jsonb_build_object('token',v_token,'player_id',v_player_id,'existing',true);
  end if;

  if v_player_id is null then
    v_first := nullif(split_part(v_name,' ',1),'');
    v_last := nullif(trim(substr(v_name,length(coalesce(v_first,''))+1)),'');
    insert into public.players(first_name,last_name,preferred_name,onboarding_status,agency_priority)
    values (v_first,v_last,coalesce(v_first,split_part(v_email,'@',1)),'not_started','normal')
    returning id into v_player_id;
    insert into public.player_private(player_id,personal_email)
    values (v_player_id,v_email);
    insert into public.player_cv_settings(player_id) values (v_player_id)
    on conflict (player_id) do nothing;
  end if;

  insert into public.player_invites(email,player_id,invited_by)
  values (v_email,v_player_id,auth.uid())
  returning token into v_token;

  return jsonb_build_object('token',v_token,'player_id',v_player_id,'existing',false);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_active_team_members()
 RETURNS TABLE(user_id uuid, display_name text, role_title text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select tm.user_id, tm.display_name, tm.role_title
  from djm_os.team_members tm
  where tm.is_active
    and exists(
      select 1 from djm_os.team_members caller
      where caller.user_id=auth.uid() and caller.is_active
    )
  order by lower(coalesce(tm.display_name,'')), tm.created_at;
$function$


CREATE OR REPLACE FUNCTION public.djm_add_memory(p_statement text, p_memory_type text DEFAULT 'observation'::text, p_person_id uuid DEFAULT NULL::uuid, p_organisation_id uuid DEFAULT NULL::uuid, p_player_id uuid DEFAULT NULL::uuid, p_prospect_id uuid DEFAULT NULL::uuid, p_club_need_id uuid DEFAULT NULL::uuid, p_confidence numeric DEFAULT 0.7, p_source_url text DEFAULT NULL::text, p_source_kind text DEFAULT NULL::text, p_source_label text DEFAULT NULL::text, p_observed_at timestamp with time zone DEFAULT now(), p_valid_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_id uuid; begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if coalesce(length(trim(p_statement)),0)<3 then raise exception 'Memory statement is required'; end if;
  insert into djm_os.memories(memory_type,statement,person_id,organisation_id,player_id,prospect_id,club_need_id,confidence,source_url,source_kind,source_label,observed_at,valid_until,created_by)
  values(coalesce(nullif(trim(p_memory_type),''),'observation'),trim(p_statement),p_person_id,p_organisation_id,p_player_id,p_prospect_id,p_club_need_id,greatest(0,least(1,coalesce(p_confidence,0.7))),nullif(trim(p_source_url),''),nullif(trim(p_source_kind),''),nullif(trim(p_source_label),''),coalesce(p_observed_at,now()),p_valid_until,(select auth.uid())) returning id into v_id;
  return jsonb_build_object('memory_id',v_id);
end $function$


CREATE OR REPLACE FUNCTION public.djm_add_relationship_edge(p_from_type text, p_from_id uuid, p_to_type text, p_to_id uuid, p_relation_type text, p_strength smallint DEFAULT 50, p_confidence numeric DEFAULT 0.7, p_source_url text DEFAULT NULL::text, p_source_kind text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_id uuid; begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  insert into djm_os.relationship_edges(from_type,from_id,to_type,to_id,relation_type,strength,confidence,source_url,source_kind,notes,created_by)
  values(trim(p_from_type),p_from_id,trim(p_to_type),p_to_id,trim(p_relation_type),greatest(0,least(100,p_strength)),greatest(0,least(1,p_confidence)),nullif(trim(p_source_url),''),nullif(trim(p_source_kind),''),nullif(trim(p_notes),''),(select auth.uid()))
  on conflict(from_type,from_id,to_type,to_id,relation_type) do update set strength=excluded.strength,confidence=excluded.confidence,source_url=coalesce(excluded.source_url,djm_os.relationship_edges.source_url),source_kind=coalesce(excluded.source_kind,djm_os.relationship_edges.source_kind),notes=coalesce(excluded.notes,djm_os.relationship_edges.notes),observed_at=now(),updated_at=now(),status='active' returning id into v_id;
  return jsonb_build_object('edge_id',v_id);
end $function$


CREATE OR REPLACE FUNCTION public.djm_assign_player(p_player_id uuid, p_assigned_to_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before uuid;
  v_name text;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=auth.uid() and tm.is_active) then
    raise exception 'DJM team access required';
  end if;
  if p_assigned_to_user_id is not null
     and not exists(select 1 from djm_os.team_members tm where tm.user_id=p_assigned_to_user_id and tm.is_active) then
    raise exception 'Active DJM team member not found';
  end if;

  select p.primary_staff_user_id,
         coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player')
  into v_before,v_name
  from public.players p where p.id=p_player_id for update;
  if not found then raise exception 'Player not found'; end if;

  update public.players
  set primary_staff_user_id=p_assigned_to_user_id, updated_at=now()
  where id=p_player_id;

  if p_assigned_to_user_id is not null then
    update public.player_requests
    set assigned_to_user_id=p_assigned_to_user_id, updated_at=now()
    where player_id=p_player_id
      and status='open'
      and assigned_to_user_id is null;
  end if;

  insert into djm_os.events(event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values('PLAYER_ASSIGNMENT_UPDATED',auth.uid(),p_player_id,
    jsonb_build_object('player_id',p_player_id,'player_name',v_name,'previous_assigned_to_user_id',v_before,'assigned_to_user_id',p_assigned_to_user_id),
    'manual_ui',1,now());

  return jsonb_build_object('player_id',p_player_id,'assigned_to_user_id',p_assigned_to_user_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_assign_player_request(p_request_id uuid, p_assigned_to_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before uuid;
  v_player_id uuid;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=auth.uid() and tm.is_active) then
    raise exception 'DJM team access required';
  end if;
  if p_assigned_to_user_id is not null
     and not exists(select 1 from djm_os.team_members tm where tm.user_id=p_assigned_to_user_id and tm.is_active) then
    raise exception 'Active DJM team member not found';
  end if;

  select r.assigned_to_user_id,r.player_id into v_before,v_player_id
  from public.player_requests r where r.id=p_request_id for update;
  if not found then raise exception 'Player request not found'; end if;

  update public.player_requests
  set assigned_to_user_id=p_assigned_to_user_id,updated_at=now()
  where id=p_request_id;

  insert into djm_os.events(event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values('PLAYER_REQUEST_ASSIGNMENT_UPDATED',auth.uid(),v_player_id,
    jsonb_build_object('request_id',p_request_id,'previous_assigned_to_user_id',v_before,'assigned_to_user_id',p_assigned_to_user_id),
    'manual_ui',1,now());

  return jsonb_build_object('request_id',p_request_id,'assigned_to_user_id',p_assigned_to_user_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_attach_whatsapp_thread(p_thread_id uuid, p_person_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_person_name text;
  v_org_id uuid;
  v_org_name text;
begin
  if not exists (
    select 1 from djm_os.team_members tm
    where tm.user_id = (select auth.uid()) and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  select p.full_name into v_person_name
  from djm_os.people p
  where p.id = p_person_id and p.person_type = 'club_contact';

  if v_person_name is null then
    raise exception 'Club contact not found';
  end if;

  if not exists (
    select 1 from djm_os.conversation_threads t
    where t.id = p_thread_id
      and t.channel = 'whatsapp'
      and t.owner_user_id = (select auth.uid())
  ) then
    raise exception 'WhatsApp thread not found';
  end if;

  select e.organisation_id, o.name
    into v_org_id, v_org_name
  from djm_os.employments e
  join djm_os.organisations o on o.id = e.organisation_id
  where e.person_id = p_person_id and e.is_current = true
  order by e.updated_at desc nulls last, e.created_at desc
  limit 1;

  update djm_os.conversation_threads
  set person_id = p_person_id,
      organisation_id = v_org_id,
      thread_label = v_person_name,
      updated_at = now()
  where id = p_thread_id;

  update djm_os.review_items
  set status = 'resolved', resolved_at = now()
  where review_type = 'thread_identity'
    and payload->>'thread_id' = p_thread_id::text
    and status = 'open';

  perform djm_os.thread_interaction_rollup(p_thread_id);

  return jsonb_build_object(
    'thread_id', p_thread_id,
    'person_id', p_person_id,
    'person_name', v_person_name,
    'organisation_id', v_org_id,
    'organisation_name', v_org_name,
    'attached', true
  );
end
$function$


CREATE OR REPLACE FUNCTION public.djm_automation_health()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select jsonb_build_object(
 'open_incidents',(select count(*) from djm_os.automation_incidents where status='open'),
 'incidents',coalesce((select jsonb_agg(to_jsonb(x) order by x.detected_at desc) from (select id,incident_type,severity,title,detail,entity_type,entity_id,detected_at from djm_os.automation_incidents where status='open' order by detected_at desc limit 30)x),'[]'::jsonb),
 'captures',jsonb_build_object(
   'queued',(select count(*) from djm_os.captures where status='queued'),
   'processing',(select count(*) from djm_os.captures where status='processing'),
   'needs_review',(select count(*) from djm_os.captures where status='needs_review')
 ),
 'messages',jsonb_build_object(
   'stored',(select count(*) from djm_os.messages where processing_status='stored'),
   'needs_review',(select count(*) from djm_os.messages where processing_status='needs_review')
 ),
 'freshness',jsonb_build_object(
   'due',(select count(*) from djm_os.freshness_queue where status in ('queued','due','pending','failed') and coalesce(next_check_at,now())<=now()),
   'locked',(select count(*) from djm_os.freshness_queue where locked_at is not null and status not in ('completed','failed'))
 ),
 'last_snapshot',(select max(created_at) from djm_os.system_snapshots where snapshot_type='operational'),
 'cron_jobs',coalesce((select jsonb_agg(jsonb_build_object('jobname',j.jobname,'schedule',j.schedule,'active',j.active) order by j.jobname) from djm_os.scheduler_status j),'[]'::jsonb)
);
$function$


CREATE OR REPLACE FUNCTION public.djm_best_route_to_club(p_organisation_id uuid)
 RETURNS TABLE(person_id uuid, person_name text, role_title text, team_member_id uuid, team_member_name text, relationship_strength smallint, access_score smallint, last_meaningful_at timestamp with time zone, route_score integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with routes as (
   select p.id as person_id,p.full_name as person_name,e.role_title,r.team_member_id,tm.display_name as team_member_name,r.strength_score,r.access_score,r.last_meaningful_at,
     (coalesce(r.strength_score,0)*0.55 + coalesce(r.access_score,0)*0.25 + case when r.last_meaningful_at>=now()-interval '30 days' then 20 when r.last_meaningful_at>=now()-interval '90 days' then 12 when r.last_meaningful_at is not null then 5 else 0 end)::int route_score
   from djm_os.employments e join djm_os.people p on p.id=e.person_id join djm_os.relationships r on r.person_id=p.id join djm_os.team_members tm on tm.user_id=r.team_member_id
   where e.organisation_id=p_organisation_id and e.is_current=true and tm.is_active=true
 ) select routes.person_id,routes.person_name,routes.role_title,routes.team_member_id,routes.team_member_name,routes.strength_score,routes.access_score,routes.last_meaningful_at,routes.route_score from routes order by routes.route_score desc,routes.person_name;
$function$


CREATE OR REPLACE FUNCTION public.djm_best_route_to_person(p_person_id uuid)
 RETURNS TABLE(team_member_id uuid, team_member_name text, relationship_strength smallint, access_score smallint, last_meaningful_at timestamp with time zone, route_reason text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select r.team_member_id,tm.display_name,r.strength_score,r.access_score,r.last_meaningful_at,
   case when coalesce(r.strength_score,0)>=80 then 'Strongest direct DJM relationship' when coalesce(r.access_score,0)>=70 then 'Good direct access' when r.last_meaningful_at>=now()-interval '30 days' then 'Most recent meaningful contact' else 'Best available direct route' end
 from djm_os.relationships r join djm_os.team_members tm on tm.user_id=r.team_member_id
 where r.person_id=p_person_id and tm.is_active=true
 order by coalesce(r.strength_score,0) desc,coalesce(r.access_score,0) desc,r.last_meaningful_at desc nulls last;
$function$


CREATE OR REPLACE FUNCTION public.djm_bootstrap_from_player_app()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'djm_os'
AS $function$
declare r record; v_org uuid; v_orgs int:=0; v_facts int:=0; v_links int:=0;
begin
  if not exists (select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  for r in select id,current_club,current_country from public.players where nullif(trim(current_club),'') is not null loop
    v_org:=djm_os.ensure_organisation(r.current_club,r.current_country); v_orgs:=v_orgs+1;
  end loop;
  for r in select club_name,country from public.career_entries where nullif(trim(club_name),'') is not null loop
    perform djm_os.ensure_organisation(r.club_name,r.country); v_orgs:=v_orgs+1;
  end loop;
  for r in select id,player_id,club_name,country,contact_name,contact_role from public.player_opportunities loop
    v_org:=djm_os.ensure_organisation(r.club_name,r.country);
    insert into djm_os.opportunity_links(opportunity_id,organisation_id,linked_by,created_at)
    values(r.id,v_org,(select tm.user_id from djm_os.team_members tm where tm.is_active order by case when tm.user_id=(select auth.uid()) then 0 else 1 end limit 1),now())
    on conflict(opportunity_id) do update set organisation_id=excluded.organisation_id;
    v_links:=v_links+1;
  end loop;
  insert into djm_os.player_market_facts(player_id,market_preferences,relocation_preferences,salary_expectation,travel_availability,passports_held,work_rights,preferred_move_timing,last_synced_at)
  select p.id,pp.market_preferences,pp.relocation_preferences,pp.salary_expectation,pp.travel_availability,coalesce(pp.passports_held,'{}'),pp.work_rights,pp.preferred_move_timing,now()
  from public.players p left join public.player_private pp on pp.player_id=p.id
  on conflict(player_id) do update set market_preferences=excluded.market_preferences,relocation_preferences=excluded.relocation_preferences,salary_expectation=excluded.salary_expectation,travel_availability=excluded.travel_availability,passports_held=excluded.passports_held,work_rights=excluded.work_rights,preferred_move_timing=excluded.preferred_move_timing,last_synced_at=now();
  get diagnostics v_facts=row_count;
  return jsonb_build_object('organisation_inputs_processed',v_orgs,'player_market_facts_synced',v_facts,'opportunities_linked',v_links);
end $function$


CREATE OR REPLACE FUNCTION public.djm_calendar_feed_items(p_user_id uuid)
 RETURNS TABLE(item_id uuid, title text, due_at timestamp with time zone, url text, kind text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'djm_os', 'pg_catalog'
AS $function$
  with task_items as (
    select t.id,coalesce(t.title,'DJM task'),t.due_at,
      case
        when t.source like 'recruitment:%'
          and split_part(t.source,':',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then '/recruitment/'||split_part(t.source,':',2)
        when t.player_id is not null then '/admin/players/'||t.player_id::text||'#inbox'
        else '/djm'
      end,
      'task'::text
    from djm_os.tasks t
    where t.owner_user_id=p_user_id and t.status='open' and t.due_at is not null
      and t.due_at>=now()-interval '30 days' and t.due_at<=now()+interval '370 days'
  ),
  player_request_items as (
    select r.id,coalesce(r.title,'DJM request'),r.due_at,'/inbox'::text,'request'::text
    from public.player_requests r join public.players p on p.id=r.player_id
    where p.user_id=p_user_id and r.status='open' and r.created_by is not null
      and r.request_type not in ('message','signal') and r.due_at is not null
      and r.due_at>=now()-interval '30 days' and r.due_at<=now()+interval '370 days'
  ),
  staff_request_items as (
    select r.id,'Follow up: '||coalesce(r.title,'Player request'),r.due_at,
      '/admin/players/'||r.player_id::text||'#inbox','staff_request'::text
    from public.player_requests r
    where r.assigned_to_user_id=p_user_id and r.status='open'
      and r.request_type not in ('message','signal') and r.due_at is not null
      and r.due_at>=now()-interval '30 days' and r.due_at<=now()+interval '370 days'
  ),
  staff as (
    select exists(select 1 from djm_os.team_members tm where tm.user_id=p_user_id and tm.is_active) as is_staff
  ),
  birthday_base as (
    select p.id,
      trim(concat_ws(' ',coalesce(nullif(trim(p.preferred_name),''),nullif(trim(p.first_name),'')),nullif(trim(p.last_name),''))) as display_name,
      p.date_of_birth,extract(year from current_date)::int as y
    from public.players p,staff s
    where s.is_staff and p.date_of_birth is not null
      and p.football_status in ('active','free_agent','loan','injured')
  ),
  birthday_dates as (
    select b.*,
      case when extract(month from b.date_of_birth)=2 and extract(day from b.date_of_birth)=29
             and not (b.y%400=0 or (b.y%4=0 and b.y%100<>0))
        then make_date(b.y,2,28)
        else make_date(b.y,extract(month from b.date_of_birth)::int,extract(day from b.date_of_birth)::int)
      end as this_birthday
    from birthday_base b
  ),
  birthday_next as (
    select bd.*,
      case when bd.this_birthday>=current_date-30 then bd.this_birthday else
        case when extract(month from bd.date_of_birth)=2 and extract(day from bd.date_of_birth)=29
               and not ((bd.y+1)%400=0 or ((bd.y+1)%4=0 and (bd.y+1)%100<>0))
          then make_date(bd.y+1,2,28)
          else make_date(bd.y+1,extract(month from bd.date_of_birth)::int,extract(day from bd.date_of_birth)::int)
        end
      end as birthday_date
    from birthday_dates bd
  ),
  birthday_items as (
    select bn.id,
      'Birthday: '||bn.display_name||' turns '||(extract(year from bn.birthday_date)::int-extract(year from bn.date_of_birth)::int)::text,
      (bn.birthday_date::timestamp at time zone 'UTC'),'/admin/players/'||bn.id::text,'birthday'::text
    from birthday_next bn
    where bn.birthday_date>=current_date-30 and bn.birthday_date<=current_date+370
  )
  select * from task_items
  union all select * from player_request_items
  union all select * from staff_request_items
  union all select * from birthday_items
  order by 3;
$function$


CREATE OR REPLACE FUNCTION public.djm_career_evidence_date(p_season_label text, p_start_date date, p_end_date date)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_label text := trim(coalesce(p_season_label, ''));
  v_match text[];
  v_start_year integer;
  v_end_year integer;
begin
  if p_end_date is not null then return p_end_date; end if;
  if p_start_date is not null then return p_start_date; end if;
  if v_label = '' then return null; end if;

  v_match := regexp_match(v_label, '^((?:19|20)[0-9]{2})\s*[/\-]\s*([0-9]{2}|(?:19|20)[0-9]{2})$');
  if v_match is not null then
    v_start_year := v_match[1]::integer;
    if length(v_match[2]) = 2 then
      v_end_year := (v_start_year / 100) * 100 + v_match[2]::integer;
      if v_end_year < v_start_year then v_end_year := v_end_year + 100; end if;
    else
      v_end_year := v_match[2]::integer;
    end if;
    return make_date(v_end_year, 6, 30);
  end if;

  v_match := regexp_match(v_label, '^([0-9]{2})\s*[/\-]\s*([0-9]{2})$');
  if v_match is not null then
    v_start_year := case when v_match[1]::integer <= 50 then 2000 else 1900 end + v_match[1]::integer;
    v_end_year := (v_start_year / 100) * 100 + v_match[2]::integer;
    if v_end_year < v_start_year then v_end_year := v_end_year + 100; end if;
    return make_date(v_end_year, 6, 30);
  end if;

  if v_label ~ '^(19|20)[0-9]{2}$' then
    return make_date(v_label::integer, 12, 31);
  end if;

  return null;
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_catch_me_up(p_person_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
  'person',(select to_jsonb(x) from (select p.id,p.full_name,p.country,p.city,p.linkedin_url,p.instagram_url from djm_os.people p where p.id=p_person_id)x),
  'current_role',(select to_jsonb(x) from (select e.role_title,o.id organisation_id,o.name organisation_name,o.country from djm_os.employments e join djm_os.organisations o on o.id=e.organisation_id where e.person_id=p_person_id and e.is_current=true order by e.created_at desc limit 1)x),
  'employment_history',coalesce((select jsonb_agg(to_jsonb(x) order by x.is_current desc,x.started_on desc nulls last) from (select e.role_title,o.name organisation_name,e.started_on,e.ended_on,e.is_current from djm_os.employments e join djm_os.organisations o on o.id=e.organisation_id where e.person_id=p_person_id)x),'[]'::jsonb),
  'relationships',coalesce((select jsonb_agg(to_jsonb(x) order by x.strength_score desc nulls last) from (select tm.display_name,r.strength_score,r.access_score,r.trust_score,r.last_meaningful_at,r.first_known_at from djm_os.relationships r join djm_os.team_members tm on tm.user_id=r.team_member_id where r.person_id=p_person_id)x),'[]'::jsonb),
  'interaction_count',(select count(*) from djm_os.interactions i where i.person_id=p_person_id),
  'last_interaction',(select to_jsonb(x) from (select i.occurred_at,i.channel,i.summary,tm.display_name team_member from djm_os.interactions i left join djm_os.team_members tm on tm.user_id=i.team_member_id where i.person_id=p_person_id order by i.occurred_at desc limit 1)x),
  'recent_interactions',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (select i.occurred_at,i.channel,i.summary,tm.display_name team_member,o.name organisation_name from djm_os.interactions i left join djm_os.team_members tm on tm.user_id=i.team_member_id left join djm_os.organisations o on o.id=i.organisation_id where i.person_id=p_person_id order by i.occurred_at desc limit 8)x),'[]'::jsonb),
  'open_needs',coalesce((select jsonb_agg(to_jsonb(x)) from (select n.id,n.title,n.position,n.status,n.confirmed_at,o.name organisation_name from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id where n.source_person_id=p_person_id and n.status in ('active','open','confirmed'))x),'[]'::jsonb),
  'open_tasks',coalesce((select jsonb_agg(to_jsonb(x) order by x.due_at asc nulls last) from (select t.id,t.title,t.due_at,t.priority,t.owner_user_id from djm_os.tasks t where t.person_id=p_person_id and t.status not in ('done','completed','cancelled'))x),'[]'::jsonb),
  'best_route',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.djm_best_route_to_person(p_person_id) limit 3)x),'[]'::jsonb)
 );
$function$


CREATE OR REPLACE FUNCTION public.djm_channel_connections()
 RETURNS TABLE(id uuid, channel text, provider text, display_label text, status text, capabilities text[], last_synced_at timestamp with time zone, last_error text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select c.id,c.channel,c.provider,c.display_label,c.status,c.capabilities,c.last_synced_at,c.last_error,c.created_at from djm_os.channel_connections c where c.user_id=auth.uid() order by c.channel,c.provider; $function$


CREATE OR REPLACE FUNCTION public.djm_command_center()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_focus jsonb;
  v_opportunities jsonb;
  v_quality jsonb;
  v_summary jsonb;
begin
  if not exists(
    select 1
    from djm_os.team_members tm
    where tm.user_id = v_uid
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  select jsonb_build_object(
    'open_tasks',(
      select count(*)
      from djm_os.tasks t
      where t.status not in ('done','completed','cancelled')
        and (t.owner_user_id is null or t.owner_user_id = v_uid)
    ),
    'overdue_tasks',(
      select count(*)
      from djm_os.tasks t
      where t.status not in ('done','completed','cancelled')
        and (t.owner_user_id is null or t.owner_user_id = v_uid)
        and t.due_at < now()
    ),
    'reviews',(
      select count(*)
      from djm_os.review_items r
      where r.status = 'open'
        and (r.owner_user_id is null or r.owner_user_id = v_uid)
    ),
    'meetings_7d',(
      select count(*)
      from djm_os.meetings m
      where m.owner_user_id = v_uid
        and m.status not in ('cancelled','no_show')
        and m.starts_at >= now()
        and m.starts_at < now() + interval '7 days'
    ),
    'club_contacts',(
      select count(*)
      from djm_os.people p
      where coalesce(p.person_type,'club_contact') <> 'player'
    ),
    'clubs',(
      select count(*)
      from djm_os.organisations o
      where o.organisation_type = 'club'
    ),
    'recruitment_active',(
      select count(*)
      from djm_os.scouting_prospects sp
      where sp.linked_player_id is null
        and sp.recruitment_stage not in ('signed','declined','lost')
    ),
    'recruitment_hot',(
      select count(*)
      from djm_os.scouting_prospects sp
      where sp.linked_player_id is null
        and sp.recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating')
    ),
    'active_needs',(
      select count(*)
      from djm_os.club_needs n
      where n.status in ('active','open','confirmed')
    ),
    'needs_without_matches',(
      select count(*)
      from djm_os.club_needs n
      where n.status in ('active','open','confirmed')
        and not exists(
          select 1
          from djm_os.player_matches m
          where m.club_need_id = n.id
            and m.status not in ('dismissed','rejected')
        )
    ),
    'active_deals',(
      select count(*)
      from djm_os.deal_rooms d
      where d.status = 'active'
    )
  )
  into v_summary;

  with focus_items as (
    select
      'review'::text kind,
      r.id,
      r.title,
      coalesce(r.detail,'Needs a quick human check') subtitle,
      r.created_at action_at,
      98::int score,
      '/network'::text href,
      null::text action,
      r.created_at created_at
    from djm_os.review_items r
    where r.status = 'open'
      and (r.owner_user_id is null or r.owner_user_id = v_uid)

    union all

    select
      'task',
      t.id,
      t.title,
      concat_ws(
        ' · ',
        nullif(p.full_name,''),
        nullif(concat_ws(' ',pl.first_name,pl.last_name),''),
        nullif(o.name,''),
        case when t.due_at < now() then 'Overdue' else null end
      ),
      t.due_at,
      least(
        100,
        55
        + coalesce(t.priority,3) * 5
        + case
            when t.due_at < now() then 20
            when t.due_at < now() + interval '24 hours' then 10
            else 0
          end
      )::int,
      case
        when t.source like 'recruitment:%'
          then '/recruitment/' || replace(t.source,'recruitment:','')
        when t.player_id is not null
          then '/admin/players/' || t.player_id::text || '#inbox'
        when t.person_id is not null
          then '/network/contacts/' || t.person_id::text
        when t.organisation_id is not null
          then '/network/clubs/' || t.organisation_id::text
        else '/network'
      end,
      'complete',
      t.created_at
    from djm_os.tasks t
    left join djm_os.people p on p.id = t.person_id
    left join public.players pl on pl.id = t.player_id
    left join djm_os.organisations o on o.id = t.organisation_id
    where t.status not in ('done','completed','cancelled')
      and (t.owner_user_id is null or t.owner_user_id = v_uid)

    union all

    select
      'recruitment',
      sp.id,
      'Recruitment · ' || sp.full_name,
      concat_ws(
        ' · ',
        nullif(sp.current_club,''),
        nullif(sp.primary_position,''),
        replace(coalesce(sp.recruitment_stage,'identified'),'_',' ')
      ),
      sp.next_action_at,
      least(
        100,
        45
        + coalesce(sp.recruitment_priority,3) * 8
        + case when sp.recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating') then 20 else 0 end
        + case when sp.next_action_at < now() then 15 else 0 end
      )::int,
      '/recruitment/' || sp.id::text,
      null,
      sp.created_at
    from djm_os.scouting_prospects sp
    where sp.linked_player_id is null
      and sp.recruitment_stage not in ('signed','declined','lost','paused')
      and (sp.owner_user_id is null or sp.owner_user_id = v_uid)
      and (
        sp.recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating')
        or sp.next_action_at is null
        or sp.next_action_at < now() + interval '3 days'
        or (sp.recruitment_priority >= 4 and sp.first_contact_at is null)
      )
      and not exists(
        select 1
        from djm_os.tasks t
        where t.source = 'recruitment:' || sp.id::text
          and t.status not in ('done','completed','cancelled')
      )

    union all

    select
      'meeting',
      m.id,
      'Meeting · ' || m.title,
      concat_ws(' · ',nullif(p.full_name,''),nullif(o.name,'')),
      m.starts_at,
      case when m.starts_at < now() + interval '24 hours' then 90 else 72 end,
      case
        when m.person_id is not null then '/network/contacts/' || m.person_id::text
        when m.organisation_id is not null then '/network/clubs/' || m.organisation_id::text
        else '/network'
      end,
      null,
      m.created_at
    from djm_os.meetings m
    left join djm_os.people p on p.id = m.person_id
    left join djm_os.organisations o on o.id = m.organisation_id
    where m.owner_user_id = v_uid
      and m.status not in ('cancelled','no_show')
      and m.starts_at >= now()
      and m.starts_at < now() + interval '7 days'

    union all

    select
      'need',
      n.id,
      'Club need · ' || coalesce(n.position,n.title),
      o.name
        || case
             when not exists(
               select 1
               from djm_os.player_matches pm
               where pm.club_need_id = n.id
                 and pm.status not in ('dismissed','rejected')
             )
             then ' · No signed-player match yet'
             else ''
           end,
      coalesce(n.updated_at,n.created_at),
      case
        when not exists(
          select 1
          from djm_os.player_matches pm
          where pm.club_need_id = n.id
            and pm.status not in ('dismissed','rejected')
        )
        then 76
        else 58
      end,
      '/market',
      null,
      n.created_at
    from djm_os.club_needs n
    join djm_os.organisations o on o.id = n.organisation_id
    where n.status in ('active','open','confirmed')

    union all

    select
      'deal',
      d.id,
      'Deal · ' || d.title,
      concat_ws(
        ' · ',
        nullif(o.name,''),
        replace(coalesce(d.stage,''),'_',' '),
        case when d.primary_blocker is not null then 'Blocker: ' || d.primary_blocker else null end
      ),
      d.next_action_at,
      least(
        100,
        70
        + coalesce(d.probability,30) / 4
        + case when d.next_action_at < now() then 10 else 0 end
      )::int,
      '/market/deals/' || d.id::text,
      null,
      d.created_at
    from djm_os.deal_rooms d
    left join djm_os.organisations o on o.id = d.organisation_id
    where d.status = 'active'
  )
  select coalesce(
    jsonb_agg(
      to_jsonb(x)
      order by x.score desc,x.action_at asc nulls last,x.created_at desc
    ),
    '[]'::jsonb
  )
  into v_focus
  from (
    select *
    from focus_items
    order by score desc,action_at asc nulls last,created_at desc
    limit 16
  ) x;

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.top_match_score desc nulls last,x.updated_at desc),
    '[]'::jsonb
  )
  into v_opportunities
  from (
    select
      n.id,
      n.title,
      n.position,
      n.organisation_id,
      o.name organisation_name,
      n.updated_at,
      count(pm.id) filter(where pm.status not in ('dismissed','rejected')) match_count,
      max(pm.overall_score) filter(where pm.status not in ('dismissed','rejected')) top_match_score
    from djm_os.club_needs n
    join djm_os.organisations o on o.id = n.organisation_id
    left join djm_os.player_matches pm on pm.club_need_id = n.id
    where n.status in ('active','open','confirmed')
    group by n.id,o.name
    order by
      max(pm.overall_score) filter(where pm.status not in ('dismissed','rejected')) desc nulls last,
      n.updated_at desc
    limit 10
  ) x;

  select jsonb_build_object(
    'contacts_missing_club',(
      select count(*)
      from djm_os.people p
      where coalesce(p.person_type,'club_contact') <> 'player'
        and not exists(
          select 1
          from djm_os.employments e
          where e.person_id = p.id
            and e.is_current = true
        )
    ),
    'contacts_missing_role',(
      select count(*)
      from djm_os.people p
      where coalesce(p.person_type,'club_contact') <> 'player'
        and exists(
          select 1
          from djm_os.employments e
          where e.person_id = p.id
            and e.is_current = true
            and nullif(trim(coalesce(e.role_title,'')),'') is null
        )
    ),
    'recruitment_missing_transfermarkt',(
      select count(*)
      from djm_os.scouting_prospects sp
      where sp.linked_player_id is null
        and sp.recruitment_stage not in ('signed','declined','lost')
        and nullif(trim(coalesce(sp.transfermarkt_url,'')),'') is null
    ),
    'recruitment_missing_contact',(
      select count(*)
      from djm_os.scouting_prospects sp
      where sp.linked_player_id is null
        and sp.recruitment_stage not in ('signed','declined','lost')
        and nullif(trim(coalesce(sp.whatsapp,'')),'') is null
        and nullif(trim(coalesce(sp.email,'')),'') is null
        and nullif(trim(coalesce(sp.instagram_url,'')),'') is null
    ),
    'open_reviews',(
      select count(*)
      from djm_os.review_items r
      where r.status = 'open'
    ),
    'stale_needs',(
      select count(*)
      from djm_os.club_needs n
      where n.status in ('active','open','confirmed')
        and n.updated_at < now() - interval '21 days'
    )
  )
  into v_quality;

  return jsonb_build_object(
    'generated_at',now(),
    'summary',v_summary,
    'focus',v_focus,
    'opportunities',v_opportunities,
    'quality',v_quality,
    'automation',public.djm_automation_health()
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_complete_player_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select djm_os.complete_player_request_internal(p_request_id);
$function$


CREATE OR REPLACE FUNCTION public.djm_contact_readiness(p_person_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_last timestamptz;v_outbound14 integer:=0;v_inbound14 integer:=0;v_strength integer:=0;v_access integer:=0;v_channel text;v_state text;v_reason text;
begin
 select max(occurred_at),count(*) filter(where direction='outbound' and occurred_at>=now()-interval '14 days'),count(*) filter(where direction='inbound' and occurred_at>=now()-interval '14 days') into v_last,v_outbound14,v_inbound14 from djm_os.interactions where person_id=p_person_id;
 select coalesce(max(strength_score),0),coalesce(max(access_score),0) into v_strength,v_access from djm_os.relationships where person_id=p_person_id;
 select channel into v_channel from djm_os.contact_methods where person_id=p_person_id and channel in ('whatsapp','phone','email','linkedin') order by case channel when 'whatsapp' then 1 when 'phone' then 2 when 'email' then 3 else 4 end,is_primary desc limit 1;
 if v_outbound14>=3 and v_inbound14=0 then v_state:='red';v_reason:='Multiple recent outbound attempts without a reply. Do not chase now.';
 elsif v_last is not null and v_last>=now()-interval '3 days' and v_inbound14=0 and v_outbound14>0 then v_state:='amber';v_reason:='Recent outbound contact. Give the relationship space unless there is a genuine deadline.';
 elsif v_strength>=65 or v_access>=70 then v_state:='green';v_reason:='Relationship/access is strong enough for a purposeful approach.';
 else v_state:='amber';v_reason:='Approach relationship-first and only with a clear reason to contact.'; end if;
 return jsonb_build_object('state',v_state,'reason',v_reason,'preferred_channel',coalesce(v_channel,'unknown'),'relationship_strength',v_strength,'access',v_access,'recent_outbound',v_outbound14,'recent_inbound',v_inbound14,'last_interaction_at',v_last);
end $function$


CREATE OR REPLACE FUNCTION public.djm_create_import_batch(p_source_type text, p_source_name text DEFAULT NULL::text, p_source_uri text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_id uuid; begin insert into djm_os.import_batches(submitted_by,source_type,source_name,source_uri) values(auth.uid(),lower(trim(p_source_type)),nullif(trim(coalesce(p_source_name,'')),''),nullif(trim(coalesce(p_source_uri,'')),'')) returning id into v_id; return v_id; end; $function$


CREATE OR REPLACE FUNCTION public.djm_deal_room(p_deal_room_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select jsonb_build_object(
 'deal',(select to_jsonb(x) from (
   select d.*,o.name organisation_name,coalesce(nullif(p.preferred_name,''),trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),sp.full_name) player_name,tm.display_name owner_name
   from djm_os.deal_rooms d join djm_os.organisations o on o.id=d.organisation_id
   left join public.players p on p.id=d.player_id left join djm_os.scouting_prospects sp on sp.id=d.prospect_id
   left join djm_os.team_members tm on tm.user_id=d.owner_user_id where d.id=p_deal_room_id
 ) x),
 'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.due_at nulls last) from (
   select id,title,due_at,status,priority from djm_os.tasks where club_need_id=(select club_need_id from djm_os.deal_rooms where id=p_deal_room_id) and status not in ('done','completed','cancelled')
 ) t),'[]'::jsonb)
);
$function$


commit;
