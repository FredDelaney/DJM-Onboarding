-- DJM Player staging public-function bootstrap — batch 07
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- all private/djm_os function batches, and public function batches 01-06.
--
-- Exact current-production definitions for public functions 221-240 of 240,
-- ordered by function name + identity arguments.
-- Production body MD5: 629be25edba6ec4d54d527dec751ed3a
--
-- Existing staging public platform_server_* RPCs were checked for collisions
-- before public bootstrap recovery; no exact production name/signature
-- collision was found.
--
-- Body validation is disabled only during bootstrap because later public
-- batches may provide cross-function dependencies. No function is executed.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.djm_tell_worker_store_plan(p_capture_id uuid, p_transcript text, p_plan jsonb, p_usage jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  update djm_os.captures
  set transcript_text=p_transcript,
      raw_text=coalesce(raw_text,p_transcript),
      extracted_json=jsonb_set(
        coalesce(extracted_json,'{}'::jsonb),
        '{tell_djm_plan}',
        coalesce(p_plan,'{}'::jsonb),
        true
      ),
      usage_json=coalesce(usage_json,'{}'::jsonb)||coalesce(p_usage,'{}'::jsonb)
  where id=p_capture_id;

  if not found then raise exception 'Capture not found'; end if;

  return jsonb_build_object('capture_id',p_capture_id,'stored',true);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_worker_store_transcript(p_capture_id uuid, p_transcript text, p_usage jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if coalesce(length(trim(p_transcript)),0)=0 then
    raise exception 'Transcript cannot be empty';
  end if;

  update djm_os.captures
  set transcript_text=p_transcript,
      raw_text=coalesce(raw_text,p_transcript),
      usage_json=coalesce(usage_json,'{}'::jsonb)||coalesce(p_usage,'{}'::jsonb)
  where id=p_capture_id;

  if not found then raise exception 'Capture not found'; end if;

  return jsonb_build_object('capture_id',p_capture_id,'stored',true);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_thread_messages(p_thread_id uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, sent_at timestamp with time zone, direction text, sender_label text, raw_text text, message_type text, asset_uri text, transcript_text text, processing_status text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select m.id,m.sent_at,m.direction,m.sender_label,m.raw_text,m.message_type,m.asset_uri,m.transcript_text,m.processing_status from djm_os.messages m join djm_os.conversation_threads t on t.id=m.thread_id where m.thread_id=p_thread_id and (p_before is null or m.sent_at<p_before) and t.owner_user_id=auth.uid() order by m.sent_at desc limit greatest(1,least(coalesce(p_limit,100),500)); $function$


CREATE OR REPLACE FUNCTION public.djm_today()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select jsonb_build_object(
 'summary',jsonb_build_object(
   'open_tasks',(select count(*) from djm_os.tasks where status not in ('done','completed','cancelled') and (owner_user_id is null or owner_user_id=auth.uid())),
   'active_needs',(select count(*) from djm_os.club_needs where status in ('active','open','confirmed')),
   'high_matches',(select count(*) from djm_os.player_matches m join djm_os.club_needs n on n.id=m.club_need_id where n.status in ('active','open','confirmed') and m.status='suggested' and m.overall_score>=80),
   'meetings_today',(select count(*) from djm_os.meetings where owner_user_id=auth.uid() and starts_at>=date_trunc('day',now()) and starts_at<date_trunc('day',now())+interval '1 day' and status not in ('cancelled','no_show'))
 ),
 'suggestions',coalesce((select jsonb_agg(to_jsonb(x) order by x.score desc,x.created_at desc) from (
   select s.id,s.suggestion_type,s.title,s.reason,s.score,s.person_id,p.full_name person_name,s.organisation_id,o.name organisation_name,s.player_id,s.club_need_id,s.created_at,s.expires_at
   from djm_os.suggestions s
   left join djm_os.people p on p.id=s.person_id
   left join djm_os.organisations o on o.id=s.organisation_id
   where s.status='open' and (s.owner_user_id is null or s.owner_user_id=auth.uid()) and (s.expires_at is null or s.expires_at>now())
   order by s.score desc,s.created_at desc limit 12
 ) x),'[]'::jsonb),
 'meetings',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from (
   select m.id,m.title,m.starts_at,m.ends_at,m.status,m.person_id,p.full_name person_name,m.organisation_id,o.name organisation_name,m.meeting_url
   from djm_os.meetings m left join djm_os.people p on p.id=m.person_id left join djm_os.organisations o on o.id=m.organisation_id
   where m.owner_user_id=auth.uid() and m.starts_at>=date_trunc('day',now()) and m.starts_at<date_trunc('day',now())+interval '1 day' and m.status not in ('cancelled','no_show')
 ) x),'[]'::jsonb),
 'tasks',coalesce((select jsonb_agg(to_jsonb(x) order by x.priority desc,x.due_at asc nulls last) from (
   select t.id,t.title,t.task_type,t.priority,t.due_at,t.person_id,p.full_name person_name,t.organisation_id,o.name organisation_name
   from djm_os.tasks t left join djm_os.people p on p.id=t.person_id left join djm_os.organisations o on o.id=t.organisation_id
   where t.status not in ('done','completed','cancelled') and (t.owner_user_id is null or t.owner_user_id=auth.uid())
   order by t.priority desc,t.due_at asc nulls last limit 10
 ) x),'[]'::jsonb)
);
$function$


CREATE OR REPLACE FUNCTION public.djm_universal_search(p_query text, p_limit integer DEFAULT 30)
 RETURNS TABLE(entity_type text, entity_id uuid, title text, subtitle text, detail text, score integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with q as (select lower(trim(coalesce(p_query,''))) v), results(entity_type,entity_id,title,subtitle,detail,score) as (
 select 'club_contact'::text,p.id,p.full_name,coalesce(e.role_title,'')||case when o.name is not null then ' · '||o.name else '' end,coalesce(cm.value,''),case when lower(p.full_name)=q.v then 100 when lower(p.full_name) like q.v||'%' then 90 else 70 end
 from djm_os.people p cross join q left join lateral (select e.* from djm_os.employments e where e.person_id=p.id and e.is_current order by e.updated_at desc limit 1) e on true left join djm_os.organisations o on o.id=e.organisation_id left join lateral (select value from djm_os.contact_methods c where c.person_id=p.id and c.channel='whatsapp' limit 1) cm on true
 where p.person_type in ('club_contact','contact','club_staff','coach','sporting_director','recruitment') and (q.v='' or lower(coalesce(p.full_name,'')||' '||coalesce(e.role_title,'')||' '||coalesce(o.name,'')||' '||coalesce(cm.value,'')) like '%'||q.v||'%')
 union all select 'club',o.id,o.name,coalesce(o.city,'')||case when o.country is not null then ', '||o.country else '' end,coalesce(o.website_url,''),case when lower(o.name)=q.v then 100 when lower(o.name) like q.v||'%' then 90 else 70 end from djm_os.organisations o cross join q where q.v='' or lower(coalesce(o.name,'')||' '||coalesce(o.city,'')||' '||coalesce(o.country,'')) like '%'||q.v||'%'
 union all select 'signed_player',p.id,coalesce(nullif(p.preferred_name,''),trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,''))),coalesce(p.primary_position,'')||case when p.current_club is not null then ' · '||p.current_club else '' end,coalesce(p.current_country,''),80 from public.players p cross join q where q.v='' or lower(coalesce(p.preferred_name,'')||' '||coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')||' '||coalesce(p.current_club,'')||' '||coalesce(p.primary_position,'')) like '%'||q.v||'%'
 union all select 'recruitment_target',s.id,s.full_name,coalesce(s.primary_position,'')||case when s.current_club is not null then ' · '||s.current_club else '' end,coalesce(s.recruitment_stage,''),75 from djm_os.scouting_prospects s cross join q where s.linked_player_id is null and coalesce(s.availability_status,'')<>'signed_djm' and (q.v='' or lower(coalesce(s.full_name,'')||' '||coalesce(s.current_club,'')||' '||coalesce(s.primary_position,'')||' '||coalesce(s.notes,'')) like '%'||q.v||'%')
 union all select 'deal_room',d.id,d.title,o.name||case when coalesce(nullif(p.preferred_name,''),trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),sp.full_name) is not null then ' · '||coalesce(nullif(p.preferred_name,''),trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),sp.full_name) else '' end,coalesce(d.primary_blocker,d.next_decision,d.stage),85 from djm_os.deal_rooms d join djm_os.organisations o on o.id=d.organisation_id left join public.players p on p.id=d.player_id left join djm_os.scouting_prospects sp on sp.id=d.prospect_id cross join q where d.status='active' and (q.v='' or lower(coalesce(d.title,'')||' '||coalesce(o.name,'')||' '||coalesce(p.preferred_name,'')||' '||coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')||' '||coalesce(sp.full_name,'')||' '||coalesce(d.primary_blocker,'')||' '||coalesce(d.next_decision,'')) like '%'||q.v||'%')
 union all select 'memory',m.id,left(m.statement,90),coalesce(m.memory_type,'memory'),coalesce(m.source_label,m.source_kind,''),65 from djm_os.memories m cross join q where m.status='active' and (q.v='' or lower(m.statement) like '%'||q.v||'%')
 union all select 'club_need',n.id,coalesce(n.title,n.position),coalesce(o.name,'')||case when n.position is not null then ' · '||n.position else '' end,coalesce(n.profile_notes,''),70 from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id cross join q where n.status in ('active','open','confirmed') and (q.v='' or lower(coalesce(n.title,'')||' '||coalesce(n.position,'')||' '||coalesce(o.name,'')||' '||coalesce(n.profile_notes,'')) like '%'||q.v||'%')
)
select entity_type,entity_id,title,subtitle,detail,score from results order by score desc,title limit greatest(1,least(coalesce(p_limit,30),100));
$function$


CREATE OR REPLACE FUNCTION public.djm_upsert_clubelo_snapshot(p_snapshot_date date, p_rows jsonb, p_source_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare row jsonb; v_count integer:=0;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required'; end if;
 if p_snapshot_date is null then raise exception 'snapshot date required'; end if;
 if jsonb_typeof(p_rows)<>'array' then raise exception 'rows must be array'; end if;
 for row in select * from jsonb_array_elements(p_rows) loop
   if nullif(trim(row->>'team_name'),'') is null then continue; end if;
   insert into djm_os.football_team_strength_snapshots(provider,snapshot_date,team_name,team_key,country_code,level_tier,elo,rank,provider_from,provider_to,source_url,observed_at,updated_at)
   values('clubelo',p_snapshot_date,row->>'team_name',djm_os.normalise_team_key(row->>'team_name'),nullif(row->>'country_code',''),nullif(row->>'level_tier','')::integer,nullif(row->>'elo','')::numeric,nullif(row->>'rank','')::integer,nullif(row->>'provider_from','')::date,nullif(row->>'provider_to','')::date,p_source_url,now(),now())
   on conflict(provider,snapshot_date,team_key) do update set team_name=excluded.team_name,country_code=excluded.country_code,level_tier=excluded.level_tier,elo=excluded.elo,rank=excluded.rank,provider_from=excluded.provider_from,provider_to=excluded.provider_to,source_url=excluded.source_url,observed_at=now(),updated_at=now();
   v_count:=v_count+1;
 end loop;
 return jsonb_build_object('ok',true,'snapshot_date',p_snapshot_date,'rows',v_count);
end;$function$


CREATE OR REPLACE FUNCTION public.djm_upsert_pitchapi_performance_snapshot(p_snapshot jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_player_id uuid := nullif(p_snapshot ->> 'player_id', '')::uuid;
  v_source_reference text := nullif(trim(p_snapshot ->> 'source_reference'), '');
begin
  if v_player_id is null or v_source_reference is null then
    raise exception 'Player and source reference are required.';
  end if;

  select snapshot.id
  into v_id
  from djm_os.player_performance_snapshots snapshot
  where snapshot.player_id = v_player_id
    and snapshot.provider = 'pitchapi_current_peer_v1'
    and snapshot.source_reference = v_source_reference
  order by snapshot.updated_at desc
  limit 1;

  if v_id is null then
    insert into djm_os.player_performance_snapshots(
      player_id,
      competition_id,
      season_label,
      position_group,
      evidence_date,
      minutes,
      starts,
      appearances,
      possible_minutes,
      overall_performance_percentile,
      attacking_percentile,
      creativity_percentile,
      progression_percentile,
      possession_percentile,
      defending_percentile,
      aerial_percentile,
      goalkeeping_percentile,
      physical_percentile,
      discipline_percentile,
      peer_group_description,
      provider,
      source_name,
      source_url,
      source_reference,
      observed_at,
      verified_at,
      verified_by,
      confidence,
      raw_metrics,
      metadata
    )
    values (
      v_player_id,
      nullif(p_snapshot ->> 'competition_id', '')::uuid,
      nullif(trim(p_snapshot ->> 'season_label'), ''),
      nullif(trim(p_snapshot ->> 'position_group'), ''),
      nullif(p_snapshot ->> 'evidence_date', '')::date,
      nullif(p_snapshot ->> 'minutes', '')::integer,
      nullif(p_snapshot ->> 'starts', '')::integer,
      nullif(p_snapshot ->> 'appearances', '')::integer,
      nullif(p_snapshot ->> 'possible_minutes', '')::integer,
      nullif(p_snapshot ->> 'overall_performance_percentile', '')::numeric,
      nullif(p_snapshot ->> 'attacking_percentile', '')::numeric,
      nullif(p_snapshot ->> 'creativity_percentile', '')::numeric,
      nullif(p_snapshot ->> 'progression_percentile', '')::numeric,
      nullif(p_snapshot ->> 'possession_percentile', '')::numeric,
      nullif(p_snapshot ->> 'defending_percentile', '')::numeric,
      nullif(p_snapshot ->> 'aerial_percentile', '')::numeric,
      nullif(p_snapshot ->> 'goalkeeping_percentile', '')::numeric,
      nullif(p_snapshot ->> 'physical_percentile', '')::numeric,
      nullif(p_snapshot ->> 'discipline_percentile', '')::numeric,
      nullif(trim(p_snapshot ->> 'peer_group_description'), ''),
      'pitchapi_current_peer_v1',
      nullif(trim(p_snapshot ->> 'source_name'), ''),
      nullif(trim(p_snapshot ->> 'source_url'), ''),
      v_source_reference,
      coalesce(nullif(p_snapshot ->> 'observed_at', '')::timestamptz, now()),
      coalesce(nullif(p_snapshot ->> 'verified_at', '')::timestamptz, now()),
      nullif(p_snapshot ->> 'verified_by', '')::uuid,
      nullif(p_snapshot ->> 'confidence', '')::numeric,
      coalesce(p_snapshot -> 'raw_metrics', '{}'::jsonb),
      coalesce(p_snapshot -> 'metadata', '{}'::jsonb)
    )
    returning id into v_id;
  else
    update djm_os.player_performance_snapshots
    set competition_id = nullif(p_snapshot ->> 'competition_id', '')::uuid,
        season_label = nullif(trim(p_snapshot ->> 'season_label'), ''),
        position_group = nullif(trim(p_snapshot ->> 'position_group'), ''),
        evidence_date = nullif(p_snapshot ->> 'evidence_date', '')::date,
        minutes = nullif(p_snapshot ->> 'minutes', '')::integer,
        starts = nullif(p_snapshot ->> 'starts', '')::integer,
        appearances = nullif(p_snapshot ->> 'appearances', '')::integer,
        possible_minutes = nullif(p_snapshot ->> 'possible_minutes', '')::integer,
        overall_performance_percentile = nullif(p_snapshot ->> 'overall_performance_percentile', '')::numeric,
        attacking_percentile = nullif(p_snapshot ->> 'attacking_percentile', '')::numeric,
        creativity_percentile = nullif(p_snapshot ->> 'creativity_percentile', '')::numeric,
        progression_percentile = nullif(p_snapshot ->> 'progression_percentile', '')::numeric,
        possession_percentile = nullif(p_snapshot ->> 'possession_percentile', '')::numeric,
        defending_percentile = nullif(p_snapshot ->> 'defending_percentile', '')::numeric,
        aerial_percentile = nullif(p_snapshot ->> 'aerial_percentile', '')::numeric,
        goalkeeping_percentile = nullif(p_snapshot ->> 'goalkeeping_percentile', '')::numeric,
        physical_percentile = nullif(p_snapshot ->> 'physical_percentile', '')::numeric,
        discipline_percentile = nullif(p_snapshot ->> 'discipline_percentile', '')::numeric,
        peer_group_description = nullif(trim(p_snapshot ->> 'peer_group_description'), ''),
        source_name = nullif(trim(p_snapshot ->> 'source_name'), ''),
        source_url = nullif(trim(p_snapshot ->> 'source_url'), ''),
        observed_at = coalesce(nullif(p_snapshot ->> 'observed_at', '')::timestamptz, now()),
        verified_at = coalesce(nullif(p_snapshot ->> 'verified_at', '')::timestamptz, now()),
        verified_by = nullif(p_snapshot ->> 'verified_by', '')::uuid,
        confidence = nullif(p_snapshot ->> 'confidence', '')::numeric,
        raw_metrics = coalesce(p_snapshot -> 'raw_metrics', '{}'::jsonb),
        metadata = coalesce(p_snapshot -> 'metadata', '{}'::jsonb),
        updated_at = now()
    where id = v_id;
  end if;

  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_upsert_pitchapi_player_snapshot(p_snapshot jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_player_id uuid := nullif(p_snapshot ->> 'player_id', '')::uuid;
  v_provider_player_id text := nullif(trim(p_snapshot ->> 'provider_player_id'), '');
  v_provider_season_id text := nullif(trim(p_snapshot ->> 'provider_season_id'), '');
begin
  if v_player_id is null
     or v_provider_player_id is null
     or v_provider_season_id is null then
    raise exception 'Player, provider player and provider season are required.';
  end if;

  insert into djm_os.player_provider_stat_snapshots(
    player_id,
    provider,
    provider_player_id,
    provider_team_id,
    provider_competition_id,
    provider_season_id,
    season_label,
    club_name,
    competition_name,
    metrics,
    observed_at,
    synced_at
  )
  values (
    v_player_id,
    'pitchapi',
    v_provider_player_id,
    coalesce(p_snapshot ->> 'provider_team_id', ''),
    coalesce(p_snapshot ->> 'provider_competition_id', ''),
    v_provider_season_id,
    nullif(trim(p_snapshot ->> 'season_label'), ''),
    nullif(trim(p_snapshot ->> 'club_name'), ''),
    nullif(trim(p_snapshot ->> 'competition_name'), ''),
    coalesce(p_snapshot -> 'metrics', '{}'::jsonb),
    coalesce(nullif(p_snapshot ->> 'observed_at', '')::timestamptz, now()),
    coalesce(nullif(p_snapshot ->> 'synced_at', '')::timestamptz, now())
  )
  on conflict(
    player_id,
    provider,
    provider_season_id,
    provider_competition_id,
    provider_team_id
  )
  do update set
    provider_player_id = excluded.provider_player_id,
    season_label = excluded.season_label,
    club_name = excluded.club_name,
    competition_name = excluded.competition_name,
    metrics = excluded.metrics,
    observed_at = excluded.observed_at,
    synced_at = excluded.synced_at,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_upsert_thread(p_channel text, p_external_thread_id text, p_person_id uuid DEFAULT NULL::uuid, p_organisation_id uuid DEFAULT NULL::uuid, p_thread_label text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_id uuid; begin
  insert into djm_os.conversation_threads(channel,owner_user_id,person_id,organisation_id,external_thread_id,thread_label,source_metadata)
  values(lower(trim(p_channel)),auth.uid(),p_person_id,p_organisation_id,nullif(trim(coalesce(p_external_thread_id,'')),''),nullif(trim(coalesce(p_thread_label,'')),''),coalesce(p_metadata,'{}'::jsonb))
  on conflict(owner_user_id,channel,external_thread_id) do update set person_id=coalesce(excluded.person_id,djm_os.conversation_threads.person_id),organisation_id=coalesce(excluded.organisation_id,djm_os.conversation_threads.organisation_id),thread_label=coalesce(excluded.thread_label,djm_os.conversation_threads.thread_label),source_metadata=djm_os.conversation_threads.source_metadata||excluded.source_metadata,updated_at=now()
  returning id into v_id; return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.djm_upsert_weekly_provider_snapshot(p_snapshot jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_player_id uuid;
  v_provider_player_id text;
  v_provider_season_id text;
begin
  v_player_id := nullif(trim(p_snapshot ->> 'player_id'), '')::uuid;
  v_provider_player_id := nullif(trim(p_snapshot ->> 'provider_player_id'), '');
  v_provider_season_id := nullif(trim(p_snapshot ->> 'provider_season_id'), '');

  if v_player_id is null
     or v_provider_player_id is null
     or v_provider_season_id is null then
    raise exception 'Player, provider player and provider season are required.';
  end if;

  insert into djm_os.player_provider_stat_snapshots(
    player_id,
    provider,
    provider_player_id,
    provider_team_id,
    provider_competition_id,
    provider_season_id,
    season_label,
    club_name,
    competition_name,
    metrics,
    observed_at,
    synced_at
  )
  values (
    v_player_id,
    'thesportsdb',
    v_provider_player_id,
    coalesce(p_snapshot ->> 'provider_team_id', ''),
    coalesce(p_snapshot ->> 'provider_competition_id', ''),
    v_provider_season_id,
    nullif(trim(p_snapshot ->> 'season_label'), ''),
    nullif(trim(p_snapshot ->> 'club_name'), ''),
    nullif(trim(p_snapshot ->> 'competition_name'), ''),
    coalesce(p_snapshot -> 'metrics', '{}'::jsonb),
    coalesce(nullif(p_snapshot ->> 'observed_at', '')::timestamptz, now()),
    coalesce(nullif(p_snapshot ->> 'synced_at', '')::timestamptz, now())
  )
  on conflict(
    player_id,
    provider,
    provider_season_id,
    provider_competition_id,
    provider_team_id
  )
  do update set
    provider_player_id = excluded.provider_player_id,
    season_label = excluded.season_label,
    club_name = excluded.club_name,
    competition_name = excluded.competition_name,
    metrics = excluded.metrics,
    observed_at = excluded.observed_at,
    synced_at = excluded.synced_at,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_verify_claim(p_claim_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v text:=lower(trim(p_status)); begin if v not in ('verified','contradicted','unverified','stale') then raise exception 'Invalid verification status'; end if; update djm_os.claims set verification_status=v,verified_by=case when v in ('verified','contradicted') then auth.uid() else null end,verified_at=case when v in ('verified','contradicted') then now() else null end,last_verified_at=case when v='verified' then now() else last_verified_at end where id=p_claim_id; if not found then raise exception 'Claim not found'; end if; return jsonb_build_object('claim_id',p_claim_id,'status',v); end; $function$


CREATE OR REPLACE FUNCTION public.djm_web_push_public_key()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'private', 'pg_catalog'
AS $function$
  select public_key from private.web_push_config where singleton=true limit 1
$function$


CREATE OR REPLACE FUNCTION public.djm_weekly_intelligence(p_weeks_back integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with bounds as (
  select date_trunc('week',now())-(greatest(0,p_weeks_back)*interval '1 week') as start_at,
         date_trunc('week',now())-(greatest(0,p_weeks_back)*interval '1 week')+interval '1 week' as end_at
)
select jsonb_build_object(
  'period',jsonb_build_object('start',b.start_at,'end',b.end_at),
  'interactions',(select count(*) from djm_os.interactions i where i.occurred_at>=b.start_at and i.occurred_at<b.end_at),
  'new_contacts',(select count(*) from djm_os.people p where p.created_at>=b.start_at and p.created_at<b.end_at),
  'new_needs',(select count(*) from djm_os.club_needs n where n.created_at>=b.start_at and n.created_at<b.end_at),
  'tasks_completed',(select count(*) from djm_os.tasks t where t.completed_at>=b.start_at and t.completed_at<b.end_at),
  'opportunity_moves',(select count(*) from djm_os.events e where e.event_type='PLAYER_OPPORTUNITY_CHANGED' and e.occurred_at>=b.start_at and e.occurred_at<b.end_at),
  'high_matches',(select count(*) from djm_os.player_matches m join djm_os.club_needs n on n.id=m.club_need_id where m.overall_score>=80 and n.status in ('active','open','confirmed')),
  'top_relationships',coalesce((select jsonb_agg(to_jsonb(x) order by x.strength_score desc) from (
    select p.id,p.full_name,r.strength_score,r.last_meaningful_at,o.name organisation_name,tm.display_name owner_name
    from djm_os.relationships r join djm_os.people p on p.id=r.person_id join djm_os.team_members tm on tm.user_id=r.team_member_id
    left join lateral(select e.organisation_id from djm_os.employments e where e.person_id=p.id and e.is_current=true order by e.created_at desc limit 1) ce on true
    left join djm_os.organisations o on o.id=ce.organisation_id
    order by r.strength_score desc limit 10
  ) x),'[]'::jsonb),
  'needs',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
    select n.id,o.name organisation_name,n.position,n.title,n.status,n.confidence,n.updated_at,
      (select count(*) from djm_os.player_matches m where m.club_need_id=n.id and m.status not in ('dismissed','rejected')) match_count
    from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id
    where n.status in ('active','open','confirmed') order by n.updated_at desc limit 15
  ) x),'[]'::jsonb),
  'thin_clubs',coalesce((select jsonb_agg(to_jsonb(x) order by x.coverage_score asc) from (
    select * from public.djm_network_club_coverage() where coverage_score<45 limit 10
  ) x),'[]'::jsonb)
) from bounds b;
$function$


CREATE OR REPLACE FUNCTION public.djm_weekly_refresh_snapshot_status()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'player_id', latest.player_id,
        'synced_at', latest.synced_at
      )
      order by latest.synced_at desc
    ),
    '[]'::jsonb
  )
  from (
    select distinct on (snapshot.player_id)
      snapshot.player_id,
      snapshot.synced_at
    from djm_os.player_provider_stat_snapshots snapshot
    where snapshot.provider = 'thesportsdb'
    order by snapshot.player_id, snapshot.synced_at desc
  ) latest;
$function$


CREATE OR REPLACE FUNCTION public.get_club_share(share_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'share_id', s.id,
    'expires_at', s.expires_at,
    'pitch_message', s.pitch_message,
    'target_club', o.name,
    'profile', jsonb_build_object(
      'display_name', pp.display_name,
      'headline', pp.headline,
      'primary_position', pp.primary_position,
      'secondary_positions', pp.secondary_positions,
      'preferred_foot', pp.preferred_foot,
      'age_display', pp.age_display,
      'height_display', pp.height_display,
      'nationalities', pp.nationalities,
      'current_status', pp.current_status,
      'current_club', pp.current_club,
      'key_stats', pp.key_stats,
      'why_review', pp.why_review,
      'career_summary', pp.career_summary,
      'profile_photo_path', pp.profile_photo_path,
      'hero_image_path', pp.hero_image_path,
      'primary_video_url', pp.primary_video_url,
      'transfermarkt_url', pp.transfermarkt_url,
      'wyscout_url', pp.wyscout_url,
      'stats_url', pp.stats_url,
      'career_timeline', pp.career_timeline,
      'selected_videos', pp.selected_videos,
      'notable_experience', pp.notable_experience,
      'verified_at', pp.verified_at
    ),
    'documents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'title', d.title,
          'document_type', d.document_type,
          'created_at', d.created_at
        )
        order by d.created_at desc
      )
      from public.player_documents d
      where d.player_id = s.player_id
        and d.club_shareable = true
        and lower(trim(coalesce(d.document_type, ''))) not in (
          'passport', 'visa', 'id', 'medical', 'contract', 'agreement'
        )
    ), '[]'::jsonb)
  )
  from public.club_share_links s
  join public.player_public_profiles pp on pp.player_id = s.player_id
  join public.players p on p.id = s.player_id
  left join djm_os.organisations o on o.id = s.organisation_id
  where s.token = share_token
    and s.active = true
    and (s.expires_at is null or s.expires_at > now())
    and pp.published = true
    and p.verification_status = 'verified'
    and p.verified_at is not null
  limit 1;
$function$


CREATE OR REPLACE FUNCTION public.get_push_scheduler_secret()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'private', 'pg_catalog'
AS $function$ select secret from private.push_scheduler_config where singleton=true limit 1 $function$


CREATE OR REPLACE FUNCTION public.get_web_push_config()
 RETURNS TABLE(subject text, public_key text, private_key text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'private', 'pg_catalog'
AS $function$ select subject,public_key,private_key from private.web_push_config where singleton=true limit 1 $function$


CREATE OR REPLACE FUNCTION public.track_club_share_view(share_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare share_row public.club_share_links%rowtype;
begin
  select s.* into share_row
  from public.club_share_links s
  join public.player_public_profiles pp on pp.player_id = s.player_id
  join public.players p on p.id = s.player_id
  where s.token = share_token and s.active = true and (s.expires_at is null or s.expires_at > now())
    and pp.published = true and p.verification_status = 'verified' and p.verified_at is not null
  for update of s;
  if share_row.id is null then return false; end if;
  insert into public.club_share_views(share_id) values (share_row.id);
  update public.club_share_links set view_count = view_count + 1, last_viewed_at = now(),
    pitch_status = case when pitch_status in ('draft', 'ready', 'sent') then 'opened' else pitch_status end
  where id = share_row.id;
  if share_row.opportunity_id is not null then
    update djm_os.deal_rooms set pitch_status = 'opened', updated_at = now() where id = share_row.opportunity_id;
  end if;
  return true;
end $function$


CREATE OR REPLACE FUNCTION public.validate_player_invite(invite_token uuid)
 RETURNS TABLE(email text, expires_at timestamp with time zone, valid boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select i.email, i.expires_at,
         (i.status='pending' and i.expires_at > now()) as valid
  from public.player_invites i
  where i.token = invite_token
  limit 1;
$function$


CREATE OR REPLACE FUNCTION public.validate_player_invite_v2(invite_token uuid)
 RETURNS TABLE(email text, expires_at timestamp with time zone, valid boolean, full_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select
    i.email,
    i.expires_at,
    (i.status = 'pending' and i.expires_at > now()) as valid,
    coalesce(
      nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name)), ''),
      nullif(pg_catalog.btrim(p.preferred_name), ''),
      'DJM Player'
    ) as full_name
  from public.player_invites i
  left join public.players p on p.id = i.player_id
  where i.token = invite_token
  limit 1;
$function$


commit;
