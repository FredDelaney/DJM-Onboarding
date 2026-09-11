-- DJM Player staging djm_os-function bootstrap — batch 01
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- and all private function bootstrap batches.
--
-- Exact current-production definitions for djm_os functions 1-20 of 95,
-- ordered by function name + identity arguments.
-- Production body MD5: 43cde752a9f39e607967f9fd4a36c51d
--
-- Body validation is disabled only during bootstrap because later djm_os/public
-- batches may provide cross-function dependencies. No function is executed.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION djm_os.apply_employment_observation(p_person_id uuid, p_club_name text, p_role_title text, p_country text, p_source_uri text, p_source_name text, p_confidence numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v_org uuid; v_old_org uuid; v_old_name text; v_key text; v_obs uuid; v_applied boolean:=false; v_owner uuid; begin
  if p_person_id is null or trim(coalesce(p_club_name,''))='' then raise exception 'Person and club required'; end if;
  select e.organisation_id,o.name into v_old_org,v_old_name from djm_os.employments e join djm_os.organisations o on o.id=e.organisation_id where e.person_id=p_person_id and e.is_current=true order by e.created_at desc limit 1;
  v_key:=lower(regexp_replace(trim(p_club_name),'[^a-zA-Z0-9]+','-','g'))||':'||lower(coalesce(nullif(trim(p_country),''),'unknown'));
  select id into v_org from djm_os.organisations where canonical_key=v_key limit 1;
  if v_org is null then insert into djm_os.organisations(name,organisation_type,country,canonical_key,last_verified_at) values(trim(p_club_name),'club',nullif(trim(p_country),''),v_key,now()) returning id into v_org; end if;
  insert into djm_os.change_observations(entity_type,entity_id,change_type,previous_value,observed_value,source_uri,source_name,confidence,status,fingerprint)
  values('person',p_person_id,'employment',jsonb_build_object('organisation_id',v_old_org,'club',v_old_name),jsonb_build_object('organisation_id',v_org,'club',trim(p_club_name),'role_title',nullif(trim(coalesce(p_role_title,'')),''),'country',p_country),p_source_uri,p_source_name,coalesce(p_confidence,0.5),case when coalesce(p_confidence,0)<0.95 then 'pending' else 'applied' end,'employment:'||p_person_id::text||':'||v_org::text)
  on conflict(fingerprint) where fingerprint is not null do update set observed_value=excluded.observed_value,source_uri=excluded.source_uri,source_name=excluded.source_name,confidence=greatest(djm_os.change_observations.confidence,excluded.confidence),detected_at=now() returning id into v_obs;
  if coalesce(p_confidence,0)>=0.95 then
    update djm_os.employments set is_current=false,ended_on=coalesce(ended_on,current_date),updated_at=now() where person_id=p_person_id and is_current=true and organisation_id<>v_org;
    if not exists(select 1 from djm_os.employments where person_id=p_person_id and organisation_id=v_org and is_current=true) then insert into djm_os.employments(person_id,organisation_id,role_title,is_current,confidence,last_verified_at) values(p_person_id,v_org,nullif(trim(coalesce(p_role_title,'')),''),true,p_confidence,now()); else update djm_os.employments set role_title=coalesce(nullif(trim(coalesce(p_role_title,'')),''),role_title),confidence=greatest(confidence,p_confidence),last_verified_at=now(),updated_at=now() where person_id=p_person_id and organisation_id=v_org and is_current=true; end if;
    update djm_os.people set last_verified_at=now(),updated_at=now() where id=p_person_id;
    update djm_os.change_observations set status='applied',applied_at=now() where id=v_obs;
    v_applied:=true;
    select r.team_member_id into v_owner from djm_os.relationships r where r.person_id=p_person_id order by r.strength_score desc nulls last limit 1;
    insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at) values('CONTACT_EMPLOYMENT_CHANGED',null,p_person_id,v_org,jsonb_build_object('old_club',v_old_name,'new_club',trim(p_club_name),'role_title',p_role_title,'source_uri',p_source_uri),'data_freshness',p_confidence,now());
    if v_owner is not null and (v_old_org is distinct from v_org) then insert into djm_os.notifications(user_id,notification_type,title,body,priority,person_id,organisation_id,fingerprint,expires_at) values(v_owner,'contact_moved',coalesce((select full_name from djm_os.people where id=p_person_id),'Contact')||' changed club',coalesce(v_old_name,'Previous club')||' → '||trim(p_club_name),88,p_person_id,v_org,'move:'||p_person_id::text||':'||v_org::text,now()+interval '14 days') on conflict(fingerprint) where fingerprint is not null do nothing; end if;
  else perform djm_os.queue_change_review_items(); end if;
  return jsonb_build_object('observation_id',v_obs,'organisation_id',v_org,'applied',v_applied,'confidence',p_confidence);
end; $function$;


CREATE OR REPLACE FUNCTION djm_os.assign_player_request_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_default_owner uuid;
begin
  if tg_op='INSERT' and new.assigned_to_user_id is null then
    if new.created_by is not null
       and exists(select 1 from djm_os.team_members tm where tm.user_id=new.created_by and tm.is_active) then
      v_default_owner := new.created_by;
    elsif v_actor is not null
       and exists(select 1 from djm_os.team_members tm where tm.user_id=v_actor and tm.is_active) then
      v_default_owner := v_actor;
    else
      select p.primary_staff_user_id into v_default_owner
      from public.players p where p.id=new.player_id;
    end if;
    new.assigned_to_user_id := v_default_owner;
  end if;

  if new.assigned_to_user_id is not null
     and not exists (
       select 1 from djm_os.team_members tm
       where tm.user_id=new.assigned_to_user_id and tm.is_active
     ) then
    raise exception 'Request assignee must be an active DJM team member';
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.autopilot_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_titles int:=0;
  v_thread_reviews int:=0;
  v_contact_reviews int:=0;
  v_followups int:=0;
  v_needs int:=0;
  v_suggestions jsonb:='{}'::jsonb;
  r record;
begin
  update djm_os.tasks t
  set title='Follow up recruitment target: '||sp.full_name,updated_at=now()
  from djm_os.scouting_prospects sp
  where t.source='recruitment:'||sp.id::text
    and t.status not in ('completed','cancelled')
    and t.title is distinct from 'Follow up recruitment target: '||sp.full_name;
  get diagnostics v_titles=row_count;

  update djm_os.review_items ri
  set status='resolved',resolved_at=now()
  where ri.status='open'
    and ri.review_type='thread_identity'
    and exists(
      select 1 from djm_os.conversation_threads t
      where t.id=(ri.payload->>'thread_id')::uuid and t.person_id is not null
    );
  get diagnostics v_thread_reviews=row_count;

  update djm_os.review_items ri
  set status='resolved',resolved_at=now()
  where ri.status='open'
    and ri.review_type='contact_identity'
    and ri.person_id is not null
    and exists(
      select 1 from djm_os.employments e
      where e.person_id=ri.person_id and e.is_current=true and nullif(trim(coalesce(e.role_title,'')),'') is not null
    );
  get diagnostics v_contact_reviews=row_count;

  v_followups:=djm_os.refresh_recruitment_followups();

  for r in select id from djm_os.club_needs where status in ('active','open','confirmed') loop
    perform djm_os.refresh_need_matches(r.id);
    v_needs:=v_needs+1;
  end loop;

  v_suggestions:=djm_os.refresh_today_suggestions();

  return jsonb_build_object(
    'task_titles_synced',v_titles,
    'thread_reviews_resolved',v_thread_reviews,
    'contact_reviews_resolved',v_contact_reviews,
    'recruitment_followups_created',v_followups,
    'active_needs_refreshed',v_needs,
    'suggestions',v_suggestions,
    'ran_at',now()
  );
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.canonical_org_key(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select nullif(regexp_replace(lower(trim(coalesce(p_name,''))),'[^a-z0-9]+','','g'),'') $function$;


CREATE OR REPLACE FUNCTION djm_os.clean_recruitment_player_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.full_name is not null then
    new.full_name := btrim(regexp_replace(new.full_name, '^\s*#\s*\d{1,3}\s+', '', 'i'));
  end if;
  return new;
end
$function$;


CREATE OR REPLACE FUNCTION djm_os.club_need_match_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin begin perform djm_os.refresh_need_matches(new.id); exception when others then raise warning 'DJM match refresh failed for need %: %',new.id,sqlerrm; end; return new; end; $function$;


CREATE OR REPLACE FUNCTION djm_os.clubelo_country_code(p_country text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
select case lower(trim(coalesce(p_country,'')))
  when 'england' then 'ENG' when 'eng' then 'ENG'
  when 'scotland' then 'SCO' when 'sco' then 'SCO'
  when 'wales' then 'WAL' when 'wal' then 'WAL'
  when 'northern ireland' then 'NIR' when 'nir' then 'NIR'
  when 'ireland' then 'IRL' when 'republic of ireland' then 'IRL' when 'irl' then 'IRL'
  when 'finland' then 'FIN' when 'fin' then 'FIN'
  when 'sweden' then 'SWE' when 'swe' then 'SWE'
  when 'norway' then 'NOR' when 'nor' then 'NOR'
  when 'denmark' then 'DEN' when 'den' then 'DEN'
  when 'iceland' then 'ISL' when 'isl' then 'ISL'
  when 'germany' then 'GER' when 'ger' then 'GER'
  when 'netherlands' then 'NED' when 'holland' then 'NED' when 'ned' then 'NED'
  when 'belgium' then 'BEL' when 'bel' then 'BEL'
  when 'france' then 'FRA' when 'fra' then 'FRA'
  when 'spain' then 'ESP' when 'esp' then 'ESP'
  when 'portugal' then 'POR' when 'por' then 'POR'
  when 'italy' then 'ITA' when 'ita' then 'ITA'
  when 'austria' then 'AUT' when 'aut' then 'AUT'
  when 'switzerland' then 'SUI' when 'sui' then 'SUI'
  when 'poland' then 'POL' when 'pol' then 'POL'
  when 'czechia' then 'CZE' when 'czech republic' then 'CZE' when 'cze' then 'CZE'
  when 'slovakia' then 'SLK' when 'svk' then 'SLK' when 'slk' then 'SLK'
  when 'slovenia' then 'SVN' when 'svn' then 'SVN'
  when 'croatia' then 'CRO' when 'cro' then 'CRO'
  when 'serbia' then 'SRB' when 'srb' then 'SRB'
  when 'romania' then 'ROM' when 'rou' then 'ROM' when 'rom' then 'ROM'
  when 'hungary' then 'HUN' when 'hun' then 'HUN'
  when 'greece' then 'GRE' when 'grc' then 'GRE' when 'gre' then 'GRE'
  when 'turkey' then 'TUR' when 'türkiye' then 'TUR' when 'tur' then 'TUR'
  when 'cyprus' then 'CYP' when 'cyp' then 'CYP'
  when 'bulgaria' then 'BUL' when 'bul' then 'BUL'
  when 'ukraine' then 'UKR' when 'ukr' then 'UKR'
  when 'russia' then 'RUS' when 'rus' then 'RUS'
  when 'israel' then 'ISR' when 'isr' then 'ISR'
  when 'estonia' then 'EST' when 'est' then 'EST'
  when 'latvia' then 'LAT' when 'lva' then 'LAT' when 'lat' then 'LAT'
  when 'lithuania' then 'LIT' when 'ltu' then 'LIT' when 'lit' then 'LIT'
  when 'georgia' then 'GEO' when 'geo' then 'GEO'
  when 'armenia' then 'ARM' when 'arm' then 'ARM'
  when 'azerbaijan' then 'AZE' when 'aze' then 'AZE'
  when 'kazakhstan' then 'KAZ' when 'kaz' then 'KAZ'
  when 'albania' then 'ALB' when 'alb' then 'ALB'
  when 'bosnia and herzegovina' then 'BHZ' when 'bosnia-herzegovina' then 'BHZ' when 'bih' then 'BHZ'
  when 'montenegro' then 'MNT' when 'mne' then 'MNT'
  when 'north macedonia' then 'MAC' when 'macedonia' then 'MAC' when 'mkd' then 'MAC'
  when 'moldova' then 'MOL' when 'mda' then 'MOL'
  when 'luxembourg' then 'LUX' when 'lux' then 'LUX'
  when 'malta' then 'MLT' when 'mlt' then 'MLT'
  else null end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.clubelo_country_strength_context(p_country text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cc text:=djm_os.clubelo_country_code(p_country);
  v_date date;
  v_avg numeric;
  v_n integer:=0;
  v_pr numeric;
  v_score numeric;
  v_quality numeric:=0;
  v_age integer;
begin
  if v_cc is null then return jsonb_build_object('score',null,'quality',0,'reason','clubelo_country_not_covered'); end if;
  select max(snapshot_date) into v_date from djm_os.football_team_strength_snapshots where provider='clubelo' and country_code=v_cc;
  if v_date is null then return jsonb_build_object('score',null,'quality',0,'reason','clubelo_snapshot_missing'); end if;
  with ranked as (
    select country_code,elo,row_number() over(partition by country_code order by elo desc) rn
    from djm_os.football_team_strength_snapshots
    where provider='clubelo' and snapshot_date=v_date and elo is not null
  ), avgs as (
    select country_code,count(*) filter(where rn<=6) n,avg(elo) filter(where rn<=6) avg_top
    from ranked group by country_code having count(*) filter(where rn<=6)>=4
  ), scored as (
    select *,percent_rank() over(order by avg_top) pr from avgs
  )
  select avg_top,n,pr into v_avg,v_n,v_pr from scored where country_code=v_cc;
  if v_avg is null then return jsonb_build_object('score',null,'quality',0,'reason','insufficient_clubelo_country_depth'); end if;
  v_score:=25+75*v_pr;
  v_age:=greatest(0,current_date-v_date);
  v_quality:=least(.95,least(1,v_n/6.0)*case when v_age<=3 then .95 when v_age<=10 then .88 when v_age<=30 then .72 else .50 end);
  return jsonb_build_object('score',round(v_score,2),'quality',round(v_quality,3),'country_code',v_cc,'clubs_used',v_n,'top_club_average_elo',round(v_avg,2),'snapshot_date',v_date,'provider','clubelo');
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.clubelo_team_context(p_club text, p_country text, p_level_tier integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_key text:=djm_os.normalise_team_key(p_club);
  v_cc text:=djm_os.clubelo_country_code(p_country);
  v_date date;
  t djm_os.football_team_strength_snapshots%rowtype;
  v_avg numeric;
  v_score numeric;
  v_quality numeric:=0;
  v_age integer;
  v_best_id uuid;
  v_best_sim numeric:=0;
  v_second_sim numeric:=0;
  v_match_method text:='exact';
begin
  if v_key is null then return jsonb_build_object('score',null,'quality',0,'reason','club_unknown'); end if;
  if v_cc is null then return jsonb_build_object('score',null,'quality',0,'reason','clubelo_country_not_covered'); end if;
  select max(snapshot_date) into v_date from djm_os.football_team_strength_snapshots where provider='clubelo' and country_code=v_cc;
  if v_date is null then return jsonb_build_object('score',null,'quality',0,'reason','clubelo_country_snapshot_missing'); end if;

  select * into t
  from djm_os.football_team_strength_snapshots x
  where x.provider='clubelo' and x.snapshot_date=v_date and x.country_code=v_cc
    and x.team_key=v_key and (p_level_tier is null or x.level_tier=p_level_tier)
  order by x.elo desc limit 1;

  if not found then
    if djm_os.is_secondary_team_name(p_club) then
      return jsonb_build_object('score',null,'quality',0,'reason','secondary_team_requires_exact_match');
    end if;

    select x.id,extensions.similarity(x.team_key,v_key)
    into v_best_id,v_best_sim
    from djm_os.football_team_strength_snapshots x
    where x.provider='clubelo' and x.snapshot_date=v_date and x.country_code=v_cc
      and (p_level_tier is null or x.level_tier=p_level_tier)
    order by extensions.similarity(x.team_key,v_key) desc,x.elo desc
    limit 1;

    select coalesce(extensions.similarity(x.team_key,v_key),0)
    into v_second_sim
    from djm_os.football_team_strength_snapshots x
    where x.provider='clubelo' and x.snapshot_date=v_date and x.country_code=v_cc
      and (p_level_tier is null or x.level_tier=p_level_tier)
      and x.id is distinct from v_best_id
    order by extensions.similarity(x.team_key,v_key) desc,x.elo desc
    limit 1;
    v_second_sim:=coalesce(v_second_sim,0);

    if v_best_id is null or coalesce(v_best_sim,0)<.78 or (v_second_sim>=.70 and v_best_sim-v_second_sim<.08) then
      return jsonb_build_object('score',null,'quality',0,'reason','clubelo_ambiguous_or_weak_match','best_similarity',round(coalesce(v_best_sim,0),3),'second_similarity',round(v_second_sim,3));
    end if;
    select * into t from djm_os.football_team_strength_snapshots where id=v_best_id;
    v_match_method:='strict_fuzzy';
  else
    v_best_sim:=1;
  end if;

  select avg(x.elo) into v_avg
  from djm_os.football_team_strength_snapshots x
  where x.provider='clubelo' and x.snapshot_date=t.snapshot_date and x.country_code=t.country_code
    and x.level_tier=t.level_tier and x.elo is not null;
  if v_avg is null then return jsonb_build_object('score',null,'quality',0,'reason','league_average_unavailable'); end if;

  v_score:=greatest(20::numeric,least(80::numeric,50+(t.elo-v_avg)/5.0));
  v_age:=greatest(0,current_date-t.snapshot_date);
  v_quality:=case when v_age<=3 then .95 when v_age<=10 then .88 when v_age<=30 then .72 when v_age<=90 then .50 else .30 end;
  if v_match_method='strict_fuzzy' then v_quality:=v_quality*least(1,greatest(.75,v_best_sim)); end if;

  return jsonb_build_object(
    'score',round(v_score,2),'quality',round(v_quality,3),'club_elo',t.elo,
    'league_level_average_elo',round(v_avg,2),'elo_delta',round(t.elo-v_avg,2),
    'snapshot_date',t.snapshot_date,'provider','clubelo','source_url',t.source_url,
    'matched_team_name',t.team_name,'match_method',v_match_method,
    'match_similarity',round(coalesce(v_best_sim,1),3),'country_code',t.country_code,'level_tier',t.level_tier
  );
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.complete_player_request_internal(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_player_id uuid;
  v_updated integer := 0;
begin
  if not exists (
    select 1
    from djm_os.team_members tm
    where tm.user_id = v_uid
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  select r.player_id
  into v_player_id
  from public.player_requests r
  where r.id = p_request_id;

  if v_player_id is null then
    raise exception 'Player request not found';
  end if;

  update public.player_requests
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = p_request_id
    and status not in ('completed','dismissed');

  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'request_id', p_request_id,
    'player_id', v_player_id,
    'completed', v_updated > 0
  );
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.create_system_snapshot()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v_id uuid; begin
 insert into djm_os.system_snapshots(snapshot_type,payload,counts)
 select 'operational',jsonb_build_object(
   'team_members',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select user_id,display_name,role_title,timezone,is_active from djm_os.team_members)x),
   'people',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select id,full_name,person_type,country,city,linkedin_url,instagram_url,last_verified_at from djm_os.people)x),
   'organisations',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select id,name,organisation_type,country,city,website_url,last_verified_at from djm_os.organisations)x),
   'employments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select id,person_id,organisation_id,role_title,started_on,ended_on,is_current,confidence,last_verified_at from djm_os.employments)x),
   'relationships',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select team_member_id,person_id,strength_score,access_score,trust_score,last_meaningful_at,first_known_at from djm_os.relationships)x),
   'active_needs',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from djm_os.club_needs where status in ('active','open','confirmed'))x),
   'open_tasks',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from djm_os.tasks where status not in ('done','completed','cancelled'))x)
 ),jsonb_build_object('people',(select count(*) from djm_os.people),'clubs',(select count(*) from djm_os.organisations where organisation_type='club'),'relationships',(select count(*) from djm_os.relationships),'interactions',(select count(*) from djm_os.interactions),'messages',(select count(*) from djm_os.messages),'active_needs',(select count(*) from djm_os.club_needs where status in ('active','open','confirmed')))
 returning id into v_id;
 delete from djm_os.system_snapshots where snapshot_type='operational' and created_at<now()-interval '90 days';
 return v_id;
end; $function$;


CREATE OR REPLACE FUNCTION djm_os.detach_retained_football_intelligence_before_player_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_prospect_id uuid;
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(old.preferred_name), ''),
    nullif(trim(concat_ws(' ', old.first_name, old.last_name)), ''),
    'Former DJM player'
  );

  select sp.id
  into v_prospect_id
  from djm_os.scouting_prospects sp
  where sp.signed_player_id = old.id
     or sp.linked_player_id = old.id
  order by sp.updated_at desc
  limit 1;

  if v_prospect_id is null
     and exists (
       select 1
       from djm_os.football_intelligence_subjects s
       where s.player_id = old.id
         and s.prospect_id is null
     ) then
    insert into djm_os.scouting_prospects(
      linked_player_id,
      full_name,
      date_of_birth,
      nationality,
      current_club,
      current_country,
      primary_position,
      transfermarkt_url,
      wyscout_url,
      canonical_key,
      source,
      recruitment_source,
      notes
    ) values (
      old.id,
      v_name,
      old.date_of_birth,
      nullif(array_to_string(old.nationalities, ', '), ''),
      old.current_club,
      old.current_country,
      old.primary_position,
      old.transfermarkt_url,
      old.wyscout_url,
      coalesce(
        nullif(old.football_provider_ids->>'canonical', ''),
        lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'))
      ),
      'player_removal_archive',
      'former_signed_player',
      'Retained automatically when the signed DJM player record was removed.'
    )
    returning id into v_prospect_id;
  end if;

  update djm_os.football_intelligence_subjects
  set
    prospect_id = coalesce(prospect_id, v_prospect_id),
    player_id = null,
    representation_status = 'prospect',
    updated_at = now()
  where player_id = old.id
    and (prospect_id is not null or v_prospect_id is not null);

  update djm_os.scouting_prospects
  set
    signed_player_id = case when signed_player_id = old.id then null else signed_player_id end,
    linked_player_id = case when linked_player_id = old.id then null else linked_player_id end,
    updated_at = now()
  where signed_player_id = old.id
     or linked_player_id = old.id;

  return old;
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.detect_automation_incidents()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v integer:=0; x integer; begin
 insert into djm_os.automation_incidents(incident_type,severity,title,detail,entity_type,entity_id,fingerprint)
 select 'capture_stuck','warning','Capture processing is stuck','Capture has remained in processing/queued state for more than 2 hours.','capture',c.id,'capture-stuck:'||c.id::text
 from djm_os.captures c where c.status in ('queued','processing') and c.created_at<now()-interval '2 hours'
 on conflict(fingerprint) where fingerprint is not null and status='open' do nothing;
 get diagnostics x=row_count; v:=v+x;
 insert into djm_os.automation_incidents(incident_type,severity,title,detail,entity_type,entity_id,fingerprint)
 select 'message_review','info','Message requires review','A captured message could not be processed automatically.','message',m.id,'message-review:'||m.id::text
 from djm_os.messages m where m.processing_status='needs_review' and m.created_at<now()-interval '15 minutes'
 on conflict(fingerprint) where fingerprint is not null and status='open' do nothing;
 get diagnostics x=row_count; v:=v+x;
 insert into djm_os.automation_incidents(incident_type,severity,title,detail,entity_type,entity_id,fingerprint)
 select 'freshness_locked','warning','Freshness check appears stuck','A data refresh item has been locked for more than one hour.','freshness',f.id,'freshness-stuck:'||f.id::text
 from djm_os.freshness_queue f where f.locked_at is not null and f.locked_at<now()-interval '1 hour' and f.status not in ('completed','failed')
 on conflict(fingerprint) where fingerprint is not null and status='open' do nothing;
 get diagnostics x=row_count; v:=v+x;
 update djm_os.automation_incidents a set status='resolved',resolved_at=now()
 where a.status='open' and ((a.incident_type='capture_stuck' and not exists(select 1 from djm_os.captures c where c.id=a.entity_id and c.status in ('queued','processing') and c.created_at<now()-interval '2 hours')) or (a.incident_type='message_review' and not exists(select 1 from djm_os.messages m where m.id=a.entity_id and m.processing_status='needs_review')) or (a.incident_type='freshness_locked' and not exists(select 1 from djm_os.freshness_queue f where f.id=a.entity_id and f.locked_at is not null and f.locked_at<now()-interval '1 hour' and f.status not in ('completed','failed'))));
 return jsonb_build_object('new_incidents',v,'open_incidents',(select count(*) from djm_os.automation_incidents where status='open'));
end; $function$;


CREATE OR REPLACE FUNCTION djm_os.ensure_organisation(p_name text, p_country text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'djm_os', 'public'
AS $function$
declare v_id uuid; v_key text;
begin
  v_key:=djm_os.canonical_org_key(p_name);
  if v_key is null then return null; end if;
  select id into v_id from djm_os.organisations where canonical_key=v_key limit 1;
  if v_id is null then
    insert into djm_os.organisations(name,organisation_type,country,canonical_key,last_verified_at)
    values(trim(p_name),'club',nullif(trim(p_country),''),v_key,now()) returning id into v_id;
  else
    update djm_os.organisations set country=coalesce(country,nullif(trim(p_country),'')),name=coalesce(nullif(trim(p_name),''),name),updated_at=now() where id=v_id;
  end if;
  return v_id;
end $function$;


CREATE OR REPLACE FUNCTION djm_os.generate_merge_candidates()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v integer:=0; begin
  insert into djm_os.merge_candidates(entity_type,left_id,right_id,confidence,reasons)
  select 'person',a.id,b.id,
    case when exists(select 1 from djm_os.contact_methods ca join djm_os.contact_methods cb on ca.normalised_value=cb.normalised_value and ca.channel=cb.channel where ca.person_id=a.id and cb.person_id=b.id) then 0.99 else 0.82 end,
    jsonb_build_array(case when lower(trim(a.full_name))=lower(trim(b.full_name)) then 'same_name' else 'similar_name' end)
  from djm_os.people a join djm_os.people b on a.id<b.id and extensions.similarity(lower(a.full_name),lower(b.full_name))>=0.82
  where not exists(select 1 from djm_os.merge_candidates m where m.entity_type='person' and ((m.left_id=a.id and m.right_id=b.id) or (m.left_id=b.id and m.right_id=a.id)))
  on conflict(entity_type,left_id,right_id) do nothing;
  get diagnostics v=row_count;
  return jsonb_build_object('candidates',v);
end; $function$;


CREATE OR REPLACE FUNCTION djm_os.generate_notifications()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count integer:=0; x integer;
begin
  insert into djm_os.notifications(user_id,notification_type,title,body,priority,person_id,organisation_id,task_id,fingerprint,expires_at)
  select t.owner_user_id,'task_due',case when t.due_at<now() then 'Overdue: ' else 'Due soon: ' end||t.title,
    coalesce(p.full_name,o.name,'DJM task'),case when t.due_at<now() then 95 else 80 end,t.person_id,t.organisation_id,t.id,
    'task:'||t.id::text||':'||to_char(current_date,'YYYYMMDD'),now()+interval '2 days'
  from djm_os.tasks t left join djm_os.people p on p.id=t.person_id left join djm_os.organisations o on o.id=t.organisation_id
  where t.owner_user_id is not null and t.status not in ('done','completed','cancelled') and t.due_at is not null and t.due_at<=now()+interval '24 hours'
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics x=row_count; v_count:=v_count+x;
  insert into djm_os.notifications(user_id,notification_type,title,body,priority,person_id,organisation_id,club_need_id,fingerprint,expires_at)
  select n.owner_user_id,'need_reconfirm','Reconfirm '||coalesce(n.position,'club')||' need',o.name||' has not been reconfirmed recently.',78,n.source_person_id,n.organisation_id,n.id,
    'need-reconfirm:'||n.id::text||':'||to_char(current_date,'IYYY-IW'),now()+interval '7 days'
  from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id
  where n.owner_user_id is not null and n.status in ('active','open','confirmed') and coalesce(n.confirmed_at,n.created_at)<now()-interval '21 days'
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics x=row_count; v_count:=v_count+x;
  insert into djm_os.notifications(user_id,notification_type,title,body,priority,person_id,fingerprint,expires_at)
  select r.team_member_id,'relationship_cooling','Relationship cooling: '||p.full_name,'Strong relationship with no meaningful contact for more than 75 days.',72,r.person_id,
    'cooling:'||r.team_member_id::text||':'||r.person_id::text||':'||to_char(current_date,'YYYY-MM'),date_trunc('month',now())+interval '1 month'
  from djm_os.relationships r join djm_os.people p on p.id=r.person_id
  where coalesce(r.strength_score,0)>=65 and r.last_meaningful_at<now()-interval '75 days'
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics x=row_count; v_count:=v_count+x;
  return jsonb_build_object('notifications_generated',v_count);
end;$function$;


CREATE OR REPLACE FUNCTION djm_os.global_broad_role(p_position text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare g text:=private.djm_position_group(p_position); n text:=lower(coalesce(p_position,''));
begin
  if g='GK' or n like '%goalkeeper%' then return 'goalkeeper'; end if;
  if g in ('CB','FB_WB') or n like '%defender%' or n like '%back%' then return 'defender'; end if;
  if g in ('DM','CM','AM') or n like '%midfield%' then return 'midfielder'; end if;
  if g in ('W','ST') or n like '%forward%' or n like '%striker%' or n like '%winger%' then return 'attacker'; end if;
  return 'unknown';
end; $function$;


CREATE OR REPLACE FUNCTION djm_os.global_competition_level_score(p_country text, p_league text, p_level_tier integer DEFAULT NULL::integer)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_base numeric;
  v_tier integer;
  v_inferred integer;
  v_penalty numeric;
  v_league text:=lower(btrim(coalesce(p_league,'')));
  v_known boolean:=false;
begin
  if v_league in ('','n/a','na','unknown','none','all competitions','all competition') then return null; end if;
  v_inferred:=djm_os.infer_global_league_tier(p_country,p_league);
  select exists(
    select 1 from djm_os.competitions c
    where (nullif(trim(coalesce(p_country,'')),'') is null or lower(trim(coalesce(c.country,'')))=lower(trim(p_country)))
      and (
        lower(trim(c.display_name))=lower(trim(p_league))
        or exists(select 1 from unnest(coalesce(c.aliases,'{}'::text[])) a where lower(trim(a))=lower(trim(p_league)))
      )
      and (p_level_tier is null or c.level_tier=p_level_tier)
  ) into v_known;
  if p_level_tier is not null and v_inferred is null and not v_known then return null; end if;
  v_tier:=coalesce(p_level_tier,v_inferred);
  if v_tier is null then return null; end if;
  v_base:=djm_os.global_country_top_league_score(p_country); if v_base is null then return null; end if;
  v_penalty:=case v_tier when 0 then 0 when 1 then 0 when 2 then 8 when 3 then 15 when 4 then 22 else 28 end;
  return round(greatest(15,least(100,v_base-v_penalty)),2);
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.global_country_strength_quality(p_country text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_iffhs boolean; v_confed boolean; v_rank boolean; v_club jsonb; v_club_q numeric:=0;
begin
  select exists(select 1 from djm_os.global_league_strength_sources s where lower(s.country)=lower(p_country) and s.source='iffhs_2025') into v_iffhs;
  select exists(select 1 from djm_os.global_league_strength_sources s where lower(s.country)=lower(p_country) and s.source in ('uefa_live_2026_08_31','afc_2025_26')) into v_confed;
  select exists(select 1 from djm_os.global_league_strength_sources s where lower(s.country)=lower(p_country) and s.source='iffhs_world_rank_2025_rank_only') into v_rank;
  v_club:=djm_os.clubelo_country_strength_context(p_country); v_club_q:=coalesce(djm_os.safe_json_number(v_club->>'quality'),0);
  if v_iffhs and v_confed and v_club_q>=.6 then return .96;
  elsif v_iffhs and v_confed then return .92;
  elsif (v_iffhs or v_confed) and v_club_q>=.6 then return .90;
  elsif v_confed then return .88;
  elsif v_iffhs then return .82;
  elsif v_club_q>=.6 then return .78;
  elsif v_rank then return .65;
  else return 0; end if;
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.global_country_top_league_score(p_country text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_iffhs numeric; v_confed numeric; v_rank integer; v_iffhs_score numeric; v_confed_score numeric; v_rank_score numeric; v_has_uefa boolean:=false;
  v_club jsonb; v_club_score numeric; v_base numeric;
begin
  select s.raw_value into v_iffhs from djm_os.global_league_strength_sources s where lower(s.country)=lower(p_country) and s.source='iffhs_2025' order by s.observed_on desc limit 1;
  select s.raw_value,(s.source='uefa_live_2026_08_31') into v_confed,v_has_uefa from djm_os.global_league_strength_sources s where lower(s.country)=lower(p_country) and s.source in ('uefa_live_2026_08_31','afc_2025_26') order by s.observed_on desc limit 1;
  select s.raw_rank into v_rank from djm_os.global_league_strength_sources s where lower(s.country)=lower(p_country) and s.source='iffhs_world_rank_2025_rank_only' order by s.observed_on desc limit 1;
  if v_iffhs is not null then v_iffhs_score:=greatest(25,least(100,25+75*(ln(greatest(v_iffhs,155.75)/155.75)/nullif(ln(2359.0/155.75),0)))); end if;
  if v_confed is not null then
    if v_has_uefa then v_confed_score:=greatest(35,least(100,35+65*(ln(greatest(v_confed,5)/5.0)/nullif(ln(102.019/5.0),0))));
    else v_confed_score:=greatest(25,least(85,25+60*(ln(greatest(v_confed,0.5)/0.5)/nullif(ln(122.195/0.5),0)))); end if;
  end if;
  if v_rank is not null then v_rank_score:=greatest(18,least(25,25-.35*greatest(0,v_rank-100))); end if;
  if v_iffhs_score is not null and v_confed_score is not null then v_base:=v_iffhs_score*.70+v_confed_score*.30; else v_base:=coalesce(v_iffhs_score,v_confed_score,v_rank_score); end if;
  v_club:=djm_os.clubelo_country_strength_context(p_country); v_club_score:=djm_os.safe_json_number(v_club->>'score');
  if v_base is not null and v_club_score is not null then return round(v_base*.80+v_club_score*.20,2); end if;
  return round(coalesce(v_base,v_club_score),2);
end;
$function$;


commit;
