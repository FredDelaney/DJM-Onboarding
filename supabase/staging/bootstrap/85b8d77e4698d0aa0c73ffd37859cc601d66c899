-- DJM Player staging public-function bootstrap — batch 06
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- all private/djm_os function batches, and public function batches 01-05.
--
-- Exact current-production definitions for public functions 181-220 of 240,
-- ordered by function name + identity arguments.
-- Production body MD5: fff00c1de1ab6b41bb14e2ec2020fa17
--
-- Existing staging public platform_server_* RPCs were checked for collisions
-- before public bootstrap recovery; no exact production name/signature
-- collision was found.
--
-- Body validation is disabled only during bootstrap because later public
-- batches may provide cross-function dependencies. No function is executed.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.djm_service_official_subject_queue(p_subject_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(subject_id uuid, player_id uuid, prospect_id uuid, representation_status text, full_name text, primary_position text, current_club text, current_league text, current_country text, current_competition_id uuid, current_season_label text, football_provider_ids jsonb, stats_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  return query
  select
    s.id,
    s.player_id,
    s.prospect_id,
    s.representation_status,
    s.full_name,
    s.primary_position,
    s.current_club,
    s.current_league,
    s.current_country,
    s.current_competition_id,
    s.current_season_label,
    s.football_provider_ids,
    s.stats_url
  from djm_os.football_intelligence_subjects s
  where (p_subject_id is null or s.id = p_subject_id)
    and nullif(trim(coalesce(s.stats_url, '')), '') is not null
  order by s.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_service_replace_official_subject_evidence(p_subject_id uuid, p_snapshot jsonb, p_peers jsonb DEFAULT '[]'::jsonb, p_matches jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_subject djm_os.football_intelligence_subjects%rowtype;
  v_provider_player_id text := nullif(trim(p_snapshot ->> 'provider_player_id'), '');
  v_provider_team_id text := coalesce(nullif(trim(p_snapshot ->> 'provider_team_id'), ''), '');
  v_provider_competition_id text := nullif(trim(p_snapshot ->> 'provider_competition_id'), '');
  v_provider_season_id text := nullif(trim(p_snapshot ->> 'provider_season_id'), '');
  v_peer_count integer := 0;
  v_match_count integer := 0;
  v_now timestamptz := now();
  v_legacy_snapshot jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_subject_id is null then raise exception 'Subject is required'; end if;
  select * into v_subject from djm_os.football_intelligence_subjects where id = p_subject_id;
  if not found then raise exception 'Football subject not found'; end if;
  if v_provider_player_id is null or v_provider_competition_id is null or v_provider_season_id is null then
    raise exception 'Official provider player, competition and season identities are required';
  end if;
  if v_provider_season_id !~ '^20[0-9]{2}$' then raise exception 'Official season must be a four digit year'; end if;
  if jsonb_typeof(coalesce(p_peers, '[]'::jsonb)) <> 'array' then raise exception 'Peers must be an array'; end if;
  if jsonb_typeof(coalesce(p_matches, '[]'::jsonb)) <> 'array' then raise exception 'Matches must be an array'; end if;
  if jsonb_array_length(coalesce(p_peers, '[]'::jsonb)) < 20 then
    raise exception 'At least 20 verified league peers are required';
  end if;

  insert into djm_os.football_subject_provider_snapshots(
    subject_id, provider, provider_player_id, provider_team_id,
    provider_competition_id, provider_season_id, season_label,
    club_name, competition_name, metrics, metric_schema_version,
    data_depth, confidence, provenance, observed_at, synced_at
  ) values (
    p_subject_id, 'official_league', v_provider_player_id, v_provider_team_id,
    v_provider_competition_id, v_provider_season_id,
    nullif(trim(p_snapshot ->> 'season_label'), ''),
    nullif(trim(p_snapshot ->> 'club_name'), ''),
    nullif(trim(p_snapshot ->> 'competition_name'), ''),
    coalesce(p_snapshot -> 'metrics', '{}'::jsonb),
    coalesce(nullif(trim(p_snapshot ->> 'metric_schema_version'), ''), 'djm_official_basic_v2'),
    coalesce(nullif(trim(p_snapshot ->> 'data_depth'), ''), 'basic_official'),
    greatest(0, least(1, coalesce(nullif(p_snapshot ->> 'confidence', '')::numeric, 0.99))),
    coalesce(p_snapshot -> 'provenance', '{}'::jsonb),
    coalesce(nullif(p_snapshot ->> 'observed_at', '')::timestamptz, v_now),
    v_now
  )
  on conflict(subject_id, provider, provider_season_id, provider_competition_id, provider_team_id)
  do update set
    provider_player_id = excluded.provider_player_id,
    season_label = excluded.season_label,
    club_name = excluded.club_name,
    competition_name = excluded.competition_name,
    metrics = excluded.metrics,
    metric_schema_version = excluded.metric_schema_version,
    data_depth = excluded.data_depth,
    confidence = excluded.confidence,
    provenance = excluded.provenance,
    observed_at = excluded.observed_at,
    synced_at = excluded.synced_at,
    updated_at = now();

  delete from djm_os.provider_peer_stat_snapshots
  where provider = 'official_league'
    and provider_competition_id = v_provider_competition_id
    and provider_season_id = v_provider_season_id;

  insert into djm_os.provider_peer_stat_snapshots(
    provider, provider_competition_id, provider_season_id,
    provider_player_id, provider_team_id, player_name, team_name,
    provider_position, minutes, metrics, observed_at, synced_at,
    metric_schema_version, data_depth, confidence, payload_hash,
    request_metadata, raw_payload_retention
  )
  select
    'official_league', v_provider_competition_id, v_provider_season_id,
    r.provider_player_id, coalesce(r.provider_team_id, ''), r.player_name, r.team_name,
    r.provider_position, r.minutes, coalesce(r.metrics, '{}'::jsonb),
    coalesce(r.observed_at, v_now), v_now,
    coalesce(r.metric_schema_version, 'djm_official_basic_v2'),
    coalesce(r.data_depth, 'basic_official'),
    greatest(0, least(1, coalesce(r.confidence, 0.99))),
    r.payload_hash, coalesce(r.request_metadata, '{}'::jsonb), 'normalised_only'
  from jsonb_to_recordset(coalesce(p_peers, '[]'::jsonb)) as r(
    provider_player_id text, provider_team_id text, player_name text, team_name text,
    provider_position text, minutes integer, metrics jsonb, observed_at timestamptz,
    metric_schema_version text, data_depth text, confidence numeric,
    payload_hash text, request_metadata jsonb
  )
  where nullif(trim(coalesce(r.provider_player_id, '')), '') is not null;
  get diagnostics v_peer_count = row_count;

  delete from djm_os.football_subject_match_snapshots
  where subject_id = p_subject_id
    and provider = 'official_league'
    and provider_competition_id = v_provider_competition_id
    and provider_season_id = v_provider_season_id;

  insert into djm_os.football_subject_match_snapshots(
    subject_id, provider, provider_player_id, provider_match_id,
    provider_team_id, provider_opponent_id, provider_competition_id,
    provider_season_id, competition_id, season_label, match_date,
    team_name, opponent_name, home_away, position_group,
    provider_position, started, minutes, metrics, metric_schema_version,
    data_depth, confidence, provenance, observed_at, synced_at,
    payload_hash, request_metadata
  )
  select
    p_subject_id, 'official_league', v_provider_player_id, r.provider_match_id,
    coalesce(r.provider_team_id, v_provider_team_id), r.provider_opponent_id,
    v_provider_competition_id, v_provider_season_id,
    coalesce(r.competition_id, v_subject.current_competition_id),
    coalesce(r.season_label, v_provider_season_id), r.match_date,
    r.team_name, r.opponent_name, r.home_away, r.position_group,
    r.provider_position, r.started, r.minutes, coalesce(r.metrics, '{}'::jsonb),
    coalesce(r.metric_schema_version, 'djm_official_match_basic_v2'),
    coalesce(r.data_depth, 'basic_official'),
    greatest(0, least(1, coalesce(r.confidence, 0.99))),
    coalesce(r.provenance, '{}'::jsonb), coalesce(r.observed_at, v_now), v_now,
    r.payload_hash, coalesce(r.request_metadata, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_matches, '[]'::jsonb)) as r(
    provider_match_id text, provider_team_id text, provider_opponent_id text,
    competition_id uuid, season_label text, match_date date,
    team_name text, opponent_name text, home_away text, position_group text,
    provider_position text, started boolean, minutes integer, metrics jsonb,
    metric_schema_version text, data_depth text, confidence numeric,
    provenance jsonb, observed_at timestamptz, payload_hash text, request_metadata jsonb
  )
  where nullif(trim(coalesce(r.provider_match_id, '')), '') is not null
    and r.match_date is not null;
  get diagnostics v_match_count = row_count;

  update djm_os.football_intelligence_subjects
  set football_provider_ids = coalesce(football_provider_ids, '{}'::jsonb)
        || jsonb_build_object('official_league', v_provider_competition_id || ':' || v_provider_player_id),
      external_data_status = 'ready',
      external_data_checked_at = v_now,
      external_data_error = null,
      updated_at = v_now
  where id = p_subject_id;

  if v_subject.player_id is not null and to_regprocedure('public.djm_replace_official_league_evidence(jsonb,jsonb,jsonb)') is not null then
    v_legacy_snapshot := p_snapshot || jsonb_build_object('player_id', v_subject.player_id);
    perform public.djm_replace_official_league_evidence(v_legacy_snapshot, p_peers, p_matches);
  end if;

  perform djm_os.refresh_football_subject_scorecard(p_subject_id);

  return jsonb_build_object(
    'subject_id', p_subject_id,
    'provider', 'official_league',
    'provider_player_id', v_provider_player_id,
    'provider_competition_id', v_provider_competition_id,
    'provider_season_id', v_provider_season_id,
    'peer_count', v_peer_count,
    'match_count', v_match_count
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_service_upsert_global_subject_evidence(p_subject_id uuid, p_provider text, p_snapshot jsonb, p_peers jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s djm_os.football_intelligence_subjects%rowtype;
  v_provider_player_id text:=nullif(btrim(p_snapshot->>'provider_player_id'),'');
  v_provider_team_id text:=coalesce(nullif(btrim(p_snapshot->>'provider_team_id'),''),'');
  v_provider_competition_id text:=coalesce(nullif(btrim(p_snapshot->>'provider_competition_id'),''),'');
  v_provider_season_id text:=nullif(btrim(p_snapshot->>'provider_season_id'),'');
  v_count integer:=0;
  v_ids jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required'; end if;
  if nullif(btrim(coalesce(p_provider,'')),'') is null then raise exception 'Provider required'; end if;
  if v_provider_player_id is null or v_provider_season_id is null then raise exception 'Provider player and season required'; end if;
  select * into s from djm_os.football_intelligence_subjects where id=p_subject_id;
  if not found then raise exception 'Football intelligence subject not found'; end if;

  insert into djm_os.football_subject_provider_snapshots(subject_id,provider,provider_player_id,provider_team_id,provider_competition_id,provider_season_id,season_label,club_name,competition_name,metrics,metric_schema_version,data_depth,confidence,provenance,observed_at,synced_at,updated_at)
  values(p_subject_id,p_provider,v_provider_player_id,v_provider_team_id,v_provider_competition_id,v_provider_season_id,nullif(p_snapshot->>'season_label',''),nullif(p_snapshot->>'club_name',''),nullif(p_snapshot->>'competition_name',''),coalesce(p_snapshot->'metrics','{}'::jsonb),coalesce(nullif(p_snapshot->>'metric_schema_version',''),'djm_global_basic_v1'),coalesce(nullif(p_snapshot->>'data_depth',''),'basic_global'),coalesce(nullif(p_snapshot->>'confidence','')::numeric,.9),coalesce(p_snapshot->'provenance','{}'::jsonb),coalesce(nullif(p_snapshot->>'observed_at','')::timestamptz,now()),now(),now())
  on conflict(subject_id,provider,provider_season_id,provider_competition_id,provider_team_id) do update set provider_player_id=excluded.provider_player_id,season_label=excluded.season_label,club_name=excluded.club_name,competition_name=excluded.competition_name,metrics=excluded.metrics,metric_schema_version=excluded.metric_schema_version,data_depth=excluded.data_depth,confidence=excluded.confidence,provenance=excluded.provenance,observed_at=excluded.observed_at,synced_at=now(),updated_at=now();

  if jsonb_typeof(p_peers)='array' and jsonb_array_length(p_peers)>=6 and v_provider_competition_id<>'' then
    delete from djm_os.provider_peer_stat_snapshots where provider=p_provider and provider_competition_id=v_provider_competition_id and provider_season_id=v_provider_season_id;
    insert into djm_os.provider_peer_stat_snapshots(provider,provider_competition_id,provider_season_id,provider_player_id,provider_team_id,player_name,team_name,provider_position,minutes,metrics,metric_schema_version,data_depth,confidence,request_metadata,observed_at,synced_at,updated_at)
    select p_provider,v_provider_competition_id,v_provider_season_id,r.provider_player_id,coalesce(r.provider_team_id,''),r.player_name,r.team_name,r.provider_position,r.minutes,coalesce(r.metrics,'{}'::jsonb),coalesce(r.metric_schema_version,'djm_global_basic_v1'),coalesce(r.data_depth,'basic_global'),coalesce(r.confidence,.9),coalesce(r.request_metadata,'{}'::jsonb),coalesce(r.observed_at,now()),now(),now()
    from jsonb_to_recordset(p_peers) as r(provider_player_id text,provider_team_id text,player_name text,team_name text,provider_position text,minutes integer,metrics jsonb,metric_schema_version text,data_depth text,confidence numeric,request_metadata jsonb,observed_at timestamptz)
    where nullif(btrim(coalesce(r.provider_player_id,'')),'') is not null
    on conflict(provider,provider_competition_id,provider_season_id,provider_player_id,provider_team_id) do update set player_name=excluded.player_name,team_name=excluded.team_name,provider_position=excluded.provider_position,minutes=excluded.minutes,metrics=excluded.metrics,metric_schema_version=excluded.metric_schema_version,data_depth=excluded.data_depth,confidence=excluded.confidence,request_metadata=excluded.request_metadata,observed_at=excluded.observed_at,synced_at=now(),updated_at=now();
    get diagnostics v_count=row_count;
  end if;

  v_ids:=coalesce(s.football_provider_ids,'{}'::jsonb)||jsonb_build_object(p_provider,v_provider_player_id);
  update djm_os.football_intelligence_subjects set football_provider_ids=v_ids,current_club=coalesce(nullif(p_snapshot->>'club_name',''),current_club),current_league=coalesce(nullif(p_snapshot->>'competition_name',''),current_league),current_country=coalesce(nullif(p_snapshot->>'country',''),current_country),current_season_label=coalesce(nullif(p_snapshot->>'season_label',''),current_season_label),external_data_status='ready',external_data_checked_at=now(),external_data_error=null,updated_at=now() where id=p_subject_id;

  perform djm_os.refresh_football_subject_scorecard(p_subject_id);
  return jsonb_build_object('ok',true,'subject_id',p_subject_id,'provider',p_provider,'provider_player_id',v_provider_player_id,'peer_rows',v_count);
end; $function$


CREATE OR REPLACE FUNCTION public.djm_set_whatsapp_export_names(p_names text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from djm_os.team_members where user_id=(select auth.uid()) and is_active) then raise exception 'DJM team access required'; end if;
 update djm_os.team_members set whatsapp_export_names=coalesce(p_names,'{}'::text[]),updated_at=now() where user_id=(select auth.uid());
 return public.djm_my_identity();
end $function$


CREATE OR REPLACE FUNCTION public.djm_signed_player_directory(p_search text DEFAULT NULL::text, p_limit integer DEFAULT 250)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.player_name)
    from (
      select p.id,
        coalesce(nullif(p.preferred_name,''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') as player_name,
        p.current_club,p.current_country,p.current_league,p.primary_position,p.football_status,
        p.transfermarkt_url,p.stats_url,p.instagram_url
      from public.players p
      where p_search is null or p_search='' or concat_ws(' ',p.preferred_name,p.first_name,p.last_name,p.current_club,p.current_country,p.current_league,p.primary_position) ilike '%'||p_search||'%'
      order by coalesce(nullif(p.preferred_name,''),p.first_name),p.last_name
      limit greatest(1,least(coalesce(p_limit,250),500))
    ) x
  ),'[]'::jsonb);
end; $function$


CREATE OR REPLACE FUNCTION public.djm_source_monitor_due(p_limit integer DEFAULT 25)
 RETURNS TABLE(id uuid, entity_type text, entity_id uuid, source_url text, source_kind text, last_hash text, check_interval_hours integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select sm.id,sm.entity_type,sm.entity_id,sm.source_url,sm.source_kind,sm.last_hash,sm.check_interval_hours
from djm_os.source_monitors sm
where sm.status='active' and sm.next_check_at<=now()
order by sm.next_check_at asc,sm.created_at asc
limit greatest(1,least(coalesce(p_limit,25),100));
$function$


CREATE OR REPLACE FUNCTION public.djm_source_monitor_result(p_monitor_id uuid, p_http_status integer, p_hash text, p_changed boolean, p_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_monitor djm_os.source_monitors%rowtype;
begin
 if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
 select * into v_monitor from djm_os.source_monitors where id=p_monitor_id for update;
 if not found then raise exception 'Monitor not found'; end if;
 update djm_os.source_monitors set
   last_status=p_http_status,last_hash=coalesce(nullif(p_hash,''),last_hash),last_checked_at=now(),
   last_changed_at=case when p_changed then now() else last_changed_at end,
   consecutive_failures=case when p_error is null and p_http_status between 200 and 399 then 0 else consecutive_failures+1 end,
   status=case when consecutive_failures+1>=5 and (p_error is not null or p_http_status not between 200 and 399) then 'broken' else status end,
   next_check_at=now()+make_interval(hours=>check_interval_hours),updated_at=now()
 where id=p_monitor_id;
 if p_changed then
   insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,status,reason,next_check_at,source_hint)
   values(v_monitor.entity_type,v_monitor.entity_id,'source_changed',5,'pending','Official/public source content changed and needs semantic re-verification',now(),v_monitor.source_url)
   on conflict do nothing;
   insert into djm_os.review_items(review_type,entity_type,entity_id,title,detail,status,created_at,updated_at)
   values('source_changed',v_monitor.entity_type,v_monitor.entity_id,'Public source changed','Known source changed: '||v_monitor.source_url,'open',now(),now());
 end if;
 return jsonb_build_object('ok',true,'changed',p_changed);
end $function$


CREATE OR REPLACE FUNCTION public.djm_store_message(p_thread_id uuid, p_sent_at timestamp with time zone, p_direction text, p_raw_text text DEFAULT NULL::text, p_external_message_id text DEFAULT NULL::text, p_sender_label text DEFAULT NULL::text, p_message_type text DEFAULT 'text'::text, p_asset_uri text DEFAULT NULL::text, p_transcript_text text DEFAULT NULL::text, p_reply_to_external_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_id uuid; v_hash text; v_new boolean:=false; begin
  if not exists(select 1 from djm_os.conversation_threads t where t.id=p_thread_id and t.owner_user_id=auth.uid()) then raise exception 'Thread not found'; end if;
  v_hash:=encode(extensions.digest(coalesce(p_external_message_id,'')||'|'||coalesce(p_sent_at::text,'')||'|'||coalesce(p_direction,'')||'|'||coalesce(p_raw_text,'')||'|'||coalesce(p_transcript_text,''),'sha256'),'hex');
  insert into djm_os.messages(thread_id,external_message_id,message_hash,sent_at,direction,sender_label,raw_text,message_type,asset_uri,transcript_text,reply_to_external_id)
  values(p_thread_id,nullif(trim(coalesce(p_external_message_id,'')),''),v_hash,coalesce(p_sent_at,now()),lower(trim(p_direction)),nullif(trim(coalesce(p_sender_label,'')),''),p_raw_text,coalesce(nullif(lower(trim(p_message_type)),''),'text'),p_asset_uri,p_transcript_text,p_reply_to_external_id)
  on conflict(thread_id,message_hash) where message_hash is not null do nothing returning id into v_id;
  if v_id is not null then v_new:=true; update djm_os.conversation_threads set first_message_at=least(coalesce(first_message_at,p_sent_at),p_sent_at),last_message_at=greatest(coalesce(last_message_at,p_sent_at),p_sent_at),message_count=message_count+1,updated_at=now() where id=p_thread_id; end if;
  return jsonb_build_object('message_id',v_id,'created',v_new,'duplicate',not v_new);
end; $function$


CREATE OR REPLACE FUNCTION public.djm_subject_global_intelligence(p_subject_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_subject djm_os.football_intelligence_subjects%rowtype;
  v_score djm_os.football_subject_scorecards%rowtype;
  v_snapshot djm_os.football_subject_provider_snapshots%rowtype;
  v_queue djm_os.football_intelligence_enrichment_queue%rowtype;
  v_projection djm_os.football_subject_projection_snapshots%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select * into v_subject from djm_os.football_intelligence_subjects s where s.id=p_subject_id;
  if not found then
    return jsonb_build_object('available', false, 'reason', 'global_subject_not_initialised', 'subject_id', p_subject_id);
  end if;

  select * into v_score from djm_os.football_subject_scorecards sc where sc.subject_id=v_subject.id;
  select * into v_snapshot
  from djm_os.football_subject_provider_snapshots ps
  where ps.subject_id=v_subject.id
  order by case ps.provider when 'pitchapi' then 1 when 'official_league' then 2 when 'wyscout' then 3 when 'api_football' then 4 when 'thesportsdb' then 5 else 9 end,
           ps.observed_at desc nulls last, ps.updated_at desc
  limit 1;
  select * into v_queue from djm_os.football_intelligence_enrichment_queue q where q.subject_id=v_subject.id;
  select * into v_projection
  from djm_os.football_subject_projection_snapshots pr
  where pr.subject_id=v_subject.id
    and (v_score.calculated_at is null or pr.calculated_at >= v_score.calculated_at)
  order by pr.as_of_date desc, pr.calculated_at desc
  limit 1;

  return jsonb_build_object(
    'available', v_score.subject_id is not null,
    'subject', jsonb_build_object(
      'subject_id', v_subject.id,
      'player_id', v_subject.player_id,
      'prospect_id', v_subject.prospect_id,
      'full_name', v_subject.full_name,
      'date_of_birth', v_subject.date_of_birth,
      'primary_position', v_subject.primary_position,
      'current_club', v_subject.current_club,
      'current_league', v_subject.current_league,
      'current_country', v_subject.current_country,
      'external_data_status', v_subject.external_data_status,
      'external_data_checked_at', v_subject.external_data_checked_at,
      'external_data_error', v_subject.external_data_error
    ),
    'scorecard', case when v_score.subject_id is null then null else jsonb_build_object(
      'display_score', v_score.display_score,
      'model_score', v_score.model_score,
      'provisional_score', v_score.provisional_score,
      'score_tier', v_score.score_tier,
      'publishable', (
        coalesce(v_score.basis ->> 'score_state','enriching') in ('usable','decision_ready','ready','elite_evidence')
        or (coalesce(v_score.confidence,0) >= 45 and coalesce(v_score.data_coverage,0) >= 40)
      ),
      'confidence', v_score.confidence,
      'data_coverage', v_score.data_coverage,
      'position_group', v_score.position_group,
      'model_version', v_score.model_version,
      'calculated_at', v_score.calculated_at,
      'definition', v_score.basis ->> 'definition',
      'score_state', v_score.basis ->> 'score_state',
      'evidence_grade', v_score.basis ->> 'evidence_grade',
      'evidence_band', v_score.basis -> 'evidence_band',
      'components', coalesce(v_score.basis -> 'components','{}'::jsonb),
      'missing_inputs', coalesce(v_score.missing_inputs,'[]'::jsonb),
      'identity_quality', v_score.basis -> 'identity_quality',
      'season_recency_quality', v_score.basis -> 'season_recency_quality',
      'advanced_data_required', coalesce((v_score.basis ->> 'advanced_data_required')::boolean,false),
      'basis', v_score.basis,
      'provenance', v_score.provenance
    ) end,
    'projection', case when v_projection.id is null then jsonb_build_object(
      'available', false,
      'reason', case
        when v_score.subject_id is null or v_score.display_score is null then 'current_score_unavailable'
        when v_subject.date_of_birth is null then 'date_of_birth_required'
        when coalesce(nullif(v_score.position_group,'UNKNOWN'),djm_os.normalise_projection_position(v_subject.primary_position)) is null then 'position_group_required'
        when coalesce(v_score.basis ->> 'score_state','enriching') not in ('usable','decision_ready','ready','elite_evidence')
          or coalesce(v_score.confidence,0) < 45
          or coalesce(v_score.data_coverage,0) < 40 then 'current_score_not_yet_projection_grade'
        else 'projection_refresh_required'
      end,
      'current_confidence', v_score.confidence,
      'data_coverage', v_score.data_coverage
    ) else jsonb_build_object(
      'available', true,
      'current_score', v_projection.current_score,
      'forecast_score', v_projection.forecast_y5,
      'forecast_y1', v_projection.forecast_y1,
      'forecast_y3', v_projection.forecast_y3,
      'forecast_y5', v_projection.forecast_y5,
      'ceiling_score', v_projection.ceiling_score,
      'range_low', v_projection.lower_bound_score,
      'range_high', v_projection.upper_bound_score,
      'confidence', v_projection.confidence,
      'projection_state', v_projection.projection_state,
      'age', v_projection.age_years,
      'position_group', v_projection.position_group,
      'career_history_depth', v_projection.career_history_depth,
      'trajectory', v_projection.drivers -> 'trajectory',
      'model_version', v_projection.model_version,
      'methodology_version', v_projection.methodology_version,
      'input_fingerprint', v_projection.input_fingerprint,
      'calculated_at', v_projection.calculated_at,
      'calibrated_probability', false,
      'training_state', 'research_prior_until_longitudinal_outcomes_are_sufficient'
    ) end,
    'evidence', jsonb_build_object(
      'provider_snapshot_count',(select count(*) from djm_os.football_subject_provider_snapshots ps where ps.subject_id=v_subject.id),
      'match_snapshot_count',(select count(*) from djm_os.football_subject_match_snapshots ms where ms.subject_id=v_subject.id),
      'career_entry_count',(select count(*) from djm_os.football_subject_career_entries ce where ce.subject_id=v_subject.id),
      'latest_provider',v_snapshot.provider,
      'provider_player_id',v_snapshot.provider_player_id,
      'season_label',v_snapshot.season_label,
      'competition_name',v_snapshot.competition_name,
      'data_depth',v_snapshot.data_depth,
      'snapshot_confidence',v_snapshot.confidence,
      'latest_observed_at',v_snapshot.observed_at,
      'latest_synced_at',v_snapshot.synced_at,
      'source_name',v_snapshot.metrics #>> '{source,name}',
      'source_url',coalesce(v_snapshot.metrics #>> '{source,url}',v_snapshot.provenance ->> 'source_url')
    ),
    'automation', jsonb_build_object(
      'status',coalesce(v_queue.status,'ready'),
      'target_confidence',coalesce(v_queue.target_confidence,80),
      'current_confidence',coalesce(v_queue.current_confidence,v_score.confidence,0),
      'missing_evidence',coalesce(v_queue.missing_evidence,v_score.missing_inputs,'[]'::jsonb),
      'last_attempt_at',v_queue.last_attempt_at,
      'next_attempt_at',v_queue.next_attempt_at,
      'attempts',coalesce(v_queue.attempts,0),
      'last_error',v_queue.last_error
    )
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_sync_player_market_fact(p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'djm_os'
AS $function$
begin
  if not exists (select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) and auth.uid() is not null then
    raise exception 'DJM team access required';
  end if;
  insert into djm_os.player_market_facts(player_id,market_preferences,relocation_preferences,salary_expectation,travel_availability,passports_held,work_rights,preferred_move_timing,last_synced_at)
  select p.id, pp.market_preferences, pp.relocation_preferences, pp.salary_expectation, pp.travel_availability, coalesce(pp.passports_held,'{}'), pp.work_rights, pp.preferred_move_timing, now()
  from public.players p left join public.player_private pp on pp.player_id=p.id where p.id=p_player_id
  on conflict(player_id) do update set market_preferences=excluded.market_preferences,relocation_preferences=excluded.relocation_preferences,salary_expectation=excluded.salary_expectation,travel_availability=excluded.travel_availability,passports_held=excluded.passports_held,work_rights=excluded.work_rights,preferred_move_timing=excluded.preferred_move_timing,last_synced_at=now();
end $function$


CREATE OR REPLACE FUNCTION public.djm_system_snapshot_latest()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select jsonb_build_object('id',s.id,'created_at',s.created_at,'counts',s.counts,'payload',s.payload) from djm_os.system_snapshots s where s.snapshot_type='operational' order by s.created_at desc limit 1; $function$


CREATE OR REPLACE FUNCTION public.djm_task_assign_owner(p_task_id uuid, p_owner_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before uuid;
  v_player uuid;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=auth.uid() and tm.is_active) then
    raise exception 'DJM team access required';
  end if;
  if p_owner_user_id is not null
     and not exists(select 1 from djm_os.team_members tm where tm.user_id=p_owner_user_id and tm.is_active) then
    raise exception 'Active DJM team member not found';
  end if;

  select t.owner_user_id,t.player_id into v_before,v_player
  from djm_os.tasks t where t.id=p_task_id for update;
  if not found then raise exception 'Task not found'; end if;

  update djm_os.tasks set owner_user_id=p_owner_user_id,updated_at=now() where id=p_task_id;

  insert into djm_os.events(event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values('TASK_OWNER_UPDATED',auth.uid(),v_player,
    jsonb_build_object('task_id',p_task_id,'previous_owner_user_id',v_before,'owner_user_id',p_owner_user_id),
    'manual_ui',1,now());

  return jsonb_build_object('task_id',p_task_id,'owner_user_id',p_owner_user_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_team_members_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',tm.user_id,'display_name',tm.display_name,'role_title',tm.role_title,'timezone',tm.timezone) order by tm.display_name) from djm_os.team_members tm where tm.is_active=true),'[]'::jsonb);
end; $function$


CREATE OR REPLACE FUNCTION public.djm_team_metrics(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with d as (select greatest(1,least(coalesce(p_days,30),365)) days), members as (
   select tm.user_id,tm.display_name,
    (select count(*) from djm_os.interactions i,d where i.team_member_id=tm.user_id and i.occurred_at>=now()-(d.days||' days')::interval) interactions,
    (select count(distinct i.person_id) from djm_os.interactions i,d where i.team_member_id=tm.user_id and i.person_id is not null and i.occurred_at>=now()-(d.days||' days')::interval) relationships_touched,
    (select count(*) from djm_os.club_needs n,d where n.owner_user_id=tm.user_id and n.created_at>=now()-(d.days||' days')::interval) needs_created,
    (select count(*) from djm_os.tasks t,d where t.owner_user_id=tm.user_id and t.completed_at>=now()-(d.days||' days')::interval) tasks_completed,
    (select count(*) from djm_os.meetings m,d where m.owner_user_id=tm.user_id and m.starts_at>=now()-(d.days||' days')::interval and m.status not in ('cancelled')) meetings,
    (select round(avg(r.strength_score)::numeric,1) from djm_os.relationships r where r.team_member_id=tm.user_id) avg_relationship_strength,
    (select count(*) from djm_os.relationships r where r.team_member_id=tm.user_id and coalesce(r.strength_score,0)>=70) strong_relationships
   from djm_os.team_members tm where tm.is_active=true
 ) select jsonb_build_object('days',(select days from d),'team',coalesce(jsonb_agg(to_jsonb(members) order by members.display_name),'[]'::jsonb),'company',jsonb_build_object('people',(select count(*) from djm_os.people),'clubs',(select count(*) from djm_os.organisations where organisation_type='club'),'active_needs',(select count(*) from djm_os.club_needs where status in ('active','open','confirmed')),'open_tasks',(select count(*) from djm_os.tasks where status not in ('done','completed','cancelled')),'messages',(select count(*) from djm_os.messages),'prospects',(select count(*) from djm_os.scouting_prospects)) ) from members;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_answer_question(p_question_id uuid, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_question djm_os.tell_djm_questions%rowtype;
  v_capture djm_os.captures%rowtype;
  v_selected jsonb:=p_value;
  v_entity_type text;
  v_entity_id uuid;
  v_alias text;
  v_action_key text;
  v_actions jsonb;
  v_canonical_label text;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select * into v_question
  from djm_os.tell_djm_questions
  where id=p_question_id and status='open';
  if not found then raise exception 'Question is no longer open'; end if;

  select * into v_capture
  from djm_os.captures
  where id=v_question.capture_id;
  if not found then raise exception 'Capture not found'; end if;

  if v_capture.submitted_by<>auth.uid()
     and not exists (
       select 1
       from djm_os.tell_djm_permissions p
       where p.user_id=auth.uid()
         and p.permission_scope='full'
         and p.is_enabled=true
     ) then
    raise exception 'Only the capture owner or a full-access DJM user can answer this';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(
      coalesce(v_question.candidates,'[]'::jsonb)
    ) candidate
    where candidate=p_value
  ) then
    raise exception 'Selected answer is not one of the available choices';
  end if;

  if p_value->>'kind'='create_club' then
    select public.djm_tell_create_confirmed_club(
      v_capture.id,
      p_value->>'name',
      p_value->>'country'
    ) into v_selected;
  elsif p_value->>'kind'='create_contact' then
    select public.djm_tell_create_confirmed_contact(
      v_capture.id,
      p_value->>'full_name',
      nullif(p_value->>'organisation_id','')::uuid,
      p_value->>'role_title'
    ) into v_selected;
  end if;

  v_canonical_label:=coalesce(
    nullif(v_selected->>'canonical_label',''),
    nullif(split_part(coalesce(v_selected->>'label',''),' · ',1),'')
  );

  if v_question.field_key like 'entity:contact:%'
     and v_selected->>'entity_type'='player'
     and nullif(v_selected->>'entity_id','') is not null then
    v_action_key:=nullif(v_question.context_json->>'action_key','');

    if v_action_key is not null then
      select jsonb_agg(
        case
          when item->>'key'=v_action_key then
            jsonb_set(
              jsonb_set(
                item,
                '{contact_name}',
                'null'::jsonb,
                true
              ),
              '{player_name}',
              to_jsonb(v_canonical_label),
              true
            )
          else item
        end
        order by ord
      )
      into v_actions
      from jsonb_array_elements(
        coalesce(
          v_capture.extracted_json->'tell_djm_plan'->'actions',
          '[]'::jsonb
        )
      ) with ordinality as x(item,ord);

      if v_actions is not null then
        update djm_os.captures
        set extracted_json=jsonb_set(
          extracted_json,
          '{tell_djm_plan,actions}',
          v_actions,
          true
        )
        where id=v_capture.id;
      end if;
    end if;
  end if;

  update djm_os.tell_djm_questions
  set status='resolved',
      selected_value=v_selected,
      resolved_at=now()
  where id=p_question_id;

  update djm_os.captures
  set context_json=jsonb_set(
        coalesce(context_json,'{}'::jsonb),
        '{resolutions}',
        coalesce(context_json->'resolutions','[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'field_key',v_question.field_key,
            'value',v_selected
          )),
        true
      ),
      status='queued',
      next_attempt_at=now(),
      locked_at=null,
      locked_by=null,
      error_message=null,
      last_error_code=null
  where id=v_capture.id;

  v_entity_type:=nullif(v_selected->>'entity_type','');
  v_alias:=nullif(v_question.context_json->>'spoken_name','');

  if nullif(v_selected->>'entity_id','') is not null then
    begin
      v_entity_id:=(v_selected->>'entity_id')::uuid;
    exception when invalid_text_representation then
      v_entity_id:=null;
    end;
  end if;

  if v_entity_type in ('club','contact','player','prospect')
     and v_entity_id is not null
     and v_alias is not null then
    insert into djm_os.tell_djm_aliases(
      entity_type,
      entity_id,
      alias_text,
      normalised_alias,
      owner_user_id,
      source_capture_id
    )
    values (
      v_entity_type,
      v_entity_id,
      v_alias,
      lower(trim(regexp_replace(v_alias,'[^[:alnum:]]+',' ','g'))),
      v_capture.submitted_by,
      v_capture.id
    )
    on conflict (
      entity_type,
      entity_id,
      normalised_alias,
      owner_user_id
    )
    do update set
      confirmed_count=djm_os.tell_djm_aliases.confirmed_count+1,
      source_capture_id=excluded.source_capture_id,
      updated_at=now();
  end if;

  insert into djm_os.events(
    event_type,
    actor_user_id,
    person_id,
    organisation_id,
    player_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (
    'TELL_DJM_QUESTION_ANSWERED',
    auth.uid(),
    v_capture.person_id,
    v_capture.organisation_id,
    v_capture.player_id,
    jsonb_build_object(
      'capture_id',v_capture.id,
      'question_id',v_question.id,
      'field_key',v_question.field_key
    ),
    'tell_djm',
    1,
    now()
  );

  return jsonb_build_object(
    'capture_id',v_capture.id,
    'status','queued'
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_apply_action(p_capture_id uuid, p_action_hash text, p_action_index integer, p_action_type text, p_confidence numeric, p_evidence text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_capture djm_os.captures%rowtype;
  v_permission text;
  v_action djm_os.tell_djm_actions%rowtype;
  v_target_id uuid;
  v_need_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_created boolean:=false;
  v_allowed boolean:=false;
  v_min_conf numeric:=0.80;
  v_org_id uuid;
  v_person_id uuid;
  v_player_id uuid;
  v_position text:=nullif(p_payload->>'position','');
begin
  select * into v_capture
  from djm_os.captures
  where id=p_capture_id;

  if not found then raise exception 'Capture not found'; end if;

  begin
    v_org_id:=nullif(p_payload->>'organisation_id','')::uuid;
  exception when invalid_text_representation then
    v_org_id:=null;
  end;
  begin
    v_person_id:=nullif(p_payload->>'person_id','')::uuid;
  exception when invalid_text_representation then
    v_person_id:=null;
  end;
  begin
    v_player_id:=nullif(p_payload->>'player_id','')::uuid;
  exception when invalid_text_representation then
    v_player_id:=null;
  end;

  select permission_scope into v_permission
  from djm_os.tell_djm_permissions
  where user_id=v_capture.submitted_by
    and is_enabled=true;

  if v_permission is null then v_permission:='read_only'; end if;

  select * into v_action
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id
    and action_hash=p_action_hash;

  if found and v_action.status in ('applied','undone','needs_review') then
    return jsonb_build_object(
      'action_id',v_action.id,
      'status',v_action.status,
      'duplicate',true,
      'target_id',v_action.target_id
    );
  end if;

  v_allowed:=
    v_permission='full'
    or (
      v_permission='scout'
      and p_action_type in (
        'log_interaction',
        'create_task',
        'add_claim',
        'suggest_player',
        'exclude_player'
      )
    );

  v_min_conf:=case p_action_type
    when 'add_claim' then 0.65
    when 'log_interaction' then 0.75
    when 'create_task' then 0.78
    when 'upsert_club_need' then 0.84
    when 'suggest_player' then 0.84
    when 'exclude_player' then 0.88
    else 1
  end;

  if not v_allowed or coalesce(p_confidence,0)<v_min_conf then
    insert into djm_os.tell_djm_actions(
      capture_id,action_hash,action_index,action_type,status,
      confidence,evidence,proposed_payload,resolved_payload
    )
    values (
      p_capture_id,p_action_hash,p_action_index,p_action_type,'needs_review',
      p_confidence,p_evidence,p_payload,p_payload
    )
    on conflict (capture_id,action_hash)
    do update
    set status='needs_review',
        confidence=excluded.confidence,
        evidence=excluded.evidence,
        resolved_payload=excluded.resolved_payload,
        error_message=null,
        updated_at=now()
    returning * into v_action;

    insert into djm_os.review_items(
      owner_user_id,review_type,title,detail,person_id,
      organisation_id,player_id,capture_id,confidence,payload,status
    )
    values (
      v_capture.submitted_by,
      'tell_djm_action_review',
      'Check Tell DJM updates',
      'One or more Tell DJM actions need review before they change DJM data.',
      v_person_id,
      v_org_id,
      v_player_id,
      p_capture_id,
      p_confidence,
      jsonb_build_object(
        'actions',jsonb_build_array(jsonb_build_object(
          'action_id',v_action.id,
          'action_type',p_action_type,
          'evidence',p_evidence,
          'payload',p_payload
        ))
      ),
      'open'
    )
    on conflict (capture_id,review_type)
    do update
    set confidence=greatest(
          coalesce(djm_os.review_items.confidence,0),
          coalesce(excluded.confidence,0)
        ),
        payload=jsonb_build_object(
          'actions',
          coalesce(djm_os.review_items.payload->'actions','[]'::jsonb)
          || coalesce(excluded.payload->'actions','[]'::jsonb)
        ),
        status=case
          when djm_os.review_items.status in ('approved','rejected','resolved','expired') then 'open'
          else djm_os.review_items.status
        end,
        resolved_at=null;

    return jsonb_build_object(
      'action_id',v_action.id,
      'status','needs_review',
      'duplicate',false
    );
  end if;

  if p_action_type='log_interaction' then
    select i.id,to_jsonb(i)
    into v_target_id,v_after
    from djm_os.interactions i
    where i.source_external_id='tell:'||p_capture_id::text||':'||p_action_hash
    limit 1;

    if v_target_id is null then
      insert into djm_os.interactions(
        occurred_at,channel,direction,team_member_id,person_id,
        organisation_id,source_external_id,source_type,source_uri,
        raw_text,summary,confidence
      )
      values (
        v_capture.created_at,
        coalesce(v_capture.channel,'voice_debrief'),
        'logged',
        v_capture.submitted_by,
        v_person_id,
        v_org_id,
        'tell:'||p_capture_id::text||':'||p_action_hash,
        'tell_djm',
        v_capture.source_uri,
        v_capture.transcript_text,
        coalesce(nullif(p_payload->>'summary',''),p_evidence),
        p_confidence
      )
      returning id into v_target_id;
      v_created:=true;

      select to_jsonb(i) into v_after
      from djm_os.interactions i where i.id=v_target_id;
    end if;

  elsif p_action_type='create_task' then
    if nullif(p_payload->>'title','') is null then
      raise exception 'Task title is required';
    end if;

    select t.id,to_jsonb(t)
    into v_target_id,v_after
    from djm_os.tasks t
    where t.source='tell_djm:'||p_capture_id::text||':'||p_action_hash
    limit 1;

    if v_target_id is null then
      insert into djm_os.tasks(
        title,task_type,owner_user_id,person_id,organisation_id,
        player_id,due_at,status,priority,source
      )
      values (
        p_payload->>'title',
        'tell_djm',
        v_capture.submitted_by,
        v_person_id,
        v_org_id,
        v_player_id,
        nullif(p_payload->>'due_at','')::timestamptz,
        'open',
        greatest(
          1,
          least(coalesce(nullif(p_payload->>'priority','')::integer,3),5)
        ),
        'tell_djm:'||p_capture_id::text||':'||p_action_hash
      )
      returning id into v_target_id;
      v_created:=true;

      select to_jsonb(t) into v_after
      from djm_os.tasks t where t.id=v_target_id;
    end if;

  elsif p_action_type='add_claim' then
    if v_org_id is null and v_person_id is null and v_player_id is null then
      raise exception 'Claim target is required';
    end if;
    if nullif(p_payload->>'claim_value','') is null then
      raise exception 'Claim value is required';
    end if;

    select c.id,to_jsonb(c)
    into v_target_id,v_after
    from djm_os.claims c
    where c.source_key='tell:'||p_capture_id::text||':'||p_action_hash
    limit 1;

    if v_target_id is null then
      insert into djm_os.claims(
        person_id,organisation_id,player_id,claim_type,claim_key,
        value_json,confidence,valid_from,last_verified_at,
        source_uri,verification_status,source_key
      )
      values (
        v_person_id,
        v_org_id,
        v_player_id,
        coalesce(nullif(p_payload->>'claim_type',''),'voice_intelligence'),
        nullif(p_payload->>'claim_key',''),
        jsonb_build_object(
          'text',p_payload->>'claim_value',
          'evidence',p_evidence,
          'source','tell_djm'
        ),
        p_confidence,
        v_capture.created_at,
        null,
        v_capture.source_uri,
        'unverified',
        'tell:'||p_capture_id::text||':'||p_action_hash
      )
      returning id into v_target_id;
      v_created:=true;

      select to_jsonb(c) into v_after
      from djm_os.claims c where c.id=v_target_id;
    end if;

  elsif p_action_type='upsert_club_need' then
    if v_org_id is null or v_position is null then
      raise exception 'Club and position are required for a club need';
    end if;

    select n.id,to_jsonb(n)
    into v_need_id,v_before
    from djm_os.club_needs n
    where n.organisation_id=v_org_id
      and n.status in ('active','open')
      and djm_os.normalise_need_position(n.position)=v_position
      and n.received_at>=v_capture.created_at-interval '120 days'
    order by n.received_at desc
    limit 1;

    if v_need_id is null then
      insert into djm_os.club_needs(
        organisation_id,source_person_id,owner_user_id,title,
        position,secondary_position,preferred_foot,min_age,max_age,
        min_height_cm,transfer_type,transfer_budget,salary_budget,
        currency,salary_period,salary_tax_basis,registration_notes,
        profile_notes,playing_style,raw_request,source_context,
        status,confidence,confirmed_at,received_at,priority,need_type
      )
      values (
        v_org_id,
        v_person_id,
        v_capture.submitted_by,
        coalesce(nullif(p_payload->>'title',''),v_position||' requirement'),
        v_position,
        nullif(p_payload->>'secondary_position',''),
        nullif(p_payload->>'preferred_foot',''),
        nullif(p_payload->>'min_age','')::smallint,
        nullif(p_payload->>'max_age','')::smallint,
        nullif(p_payload->>'min_height_cm','')::smallint,
        nullif(p_payload->>'transfer_type',''),
        nullif(p_payload->>'transfer_budget','')::numeric,
        nullif(p_payload->>'salary_budget','')::numeric,
        nullif(p_payload->>'currency',''),
        nullif(p_payload->>'salary_period',''),
        nullif(p_payload->>'salary_tax_basis',''),
        nullif(p_payload->>'registration_notes',''),
        nullif(p_payload->>'profile_notes',''),
        nullif(p_payload->>'playing_style',''),
        v_capture.transcript_text,
        'Tell DJM',
        'active',
        p_confidence,
        v_capture.created_at,
        v_capture.created_at,
        greatest(
          1,
          least(coalesce(nullif(p_payload->>'priority','')::integer,3),5)
        ),
        coalesce(nullif(p_payload->>'need_type',''),'confirmed')
      )
      returning id into v_need_id;

      v_created:=true;
      v_before:=jsonb_build_object('created',true);
    else
      update djm_os.club_needs
      set source_person_id=coalesce(v_person_id,source_person_id),
          secondary_position=coalesce(
            nullif(p_payload->>'secondary_position',''),
            secondary_position
          ),
          preferred_foot=coalesce(
            nullif(p_payload->>'preferred_foot',''),
            preferred_foot
          ),
          min_age=coalesce(nullif(p_payload->>'min_age','')::smallint,min_age),
          max_age=coalesce(nullif(p_payload->>'max_age','')::smallint,max_age),
          min_height_cm=coalesce(
            nullif(p_payload->>'min_height_cm','')::smallint,
            min_height_cm
          ),
          transfer_type=coalesce(
            nullif(p_payload->>'transfer_type',''),
            transfer_type
          ),
          transfer_budget=coalesce(
            nullif(p_payload->>'transfer_budget','')::numeric,
            transfer_budget
          ),
          salary_budget=coalesce(
            nullif(p_payload->>'salary_budget','')::numeric,
            salary_budget
          ),
          currency=coalesce(nullif(p_payload->>'currency',''),currency),
          salary_period=coalesce(
            nullif(p_payload->>'salary_period',''),
            salary_period
          ),
          salary_tax_basis=coalesce(
            nullif(p_payload->>'salary_tax_basis',''),
            salary_tax_basis
          ),
          registration_notes=coalesce(
            nullif(p_payload->>'registration_notes',''),
            registration_notes
          ),
          profile_notes=coalesce(
            nullif(p_payload->>'profile_notes',''),
            profile_notes
          ),
          playing_style=coalesce(
            nullif(p_payload->>'playing_style',''),
            playing_style
          ),
          raw_request=coalesce(raw_request||E'\n\n','')||v_capture.transcript_text,
          source_context='Tell DJM',
          confidence=greatest(confidence,p_confidence),
          updated_at=now()
      where id=v_need_id;
    end if;

    v_target_id:=v_need_id;
    select to_jsonb(n) into v_after
    from djm_os.club_needs n where n.id=v_need_id;

  elsif p_action_type in ('suggest_player','exclude_player') then
    if v_org_id is null or v_player_id is null or v_position is null then
      raise exception 'Club, player and position are required';
    end if;

    select n.id into v_need_id
    from djm_os.club_needs n
    where n.organisation_id=v_org_id
      and n.status in ('active','open')
      and djm_os.normalise_need_position(n.position)=v_position
    order by n.received_at desc
    limit 1;

    if v_need_id is null then
      raise exception 'No active matching club need exists yet';
    end if;

    insert into djm_os.player_matches(
      club_need_id,player_id,overall_score,football_score,
      commercial_score,registration_score,career_score,access_score,
      reasoning,status
    )
    values (
      v_need_id,
      v_player_id,
      null,null,null,null,null,null,
      jsonb_build_object('source','tell_djm','evidence',p_evidence),
      case when p_action_type='suggest_player' then 'suggested' else 'rejected' end
    )
    on conflict (club_need_id,player_id)
    do update
    set status=excluded.status,
        reasoning=excluded.reasoning,
        updated_at=now()
    returning id into v_target_id;

    select to_jsonb(pm) into v_after
    from djm_os.player_matches pm where pm.id=v_target_id;

  else
    raise exception 'Unsupported Tell DJM action type';
  end if;

  if v_target_id is null or v_after is null then
    raise exception 'Tell DJM write could not be verified';
  end if;

  insert into djm_os.tell_djm_actions(
    capture_id,action_hash,action_index,action_type,status,
    confidence,evidence,proposed_payload,resolved_payload,
    target_type,target_id,before_json,after_json,
    verification_json,undo_supported,applied_at
  )
  values (
    p_capture_id,
    p_action_hash,
    p_action_index,
    p_action_type,
    'applied',
    p_confidence,
    p_evidence,
    p_payload,
    p_payload,
    case
      when p_action_type='create_task' then 'task'
      when p_action_type='log_interaction' then 'interaction'
      when p_action_type='add_claim' then 'claim'
      when p_action_type='upsert_club_need' then 'club_need'
      else 'player_match'
    end,
    v_target_id,
    coalesce(v_before,jsonb_build_object('created',v_created)),
    v_after,
    jsonb_build_object(
      'read_back',true,
      'verified_at',now(),
      'target_exists',true
    ),
    (
      p_action_type in ('create_task','log_interaction','add_claim')
      or (
        p_action_type='upsert_club_need'
        and coalesce((v_before->>'created')::boolean,false)=true
      )
    ),
    now()
  )
  on conflict (capture_id,action_hash)
  do update
  set status='applied',
      confidence=excluded.confidence,
      evidence=excluded.evidence,
      resolved_payload=excluded.resolved_payload,
      target_type=excluded.target_type,
      target_id=excluded.target_id,
      before_json=excluded.before_json,
      after_json=excluded.after_json,
      verification_json=excluded.verification_json,
      undo_supported=excluded.undo_supported,
      error_message=null,
      applied_at=excluded.applied_at,
      updated_at=now()
  returning * into v_action;

  insert into djm_os.events(
    event_type,actor_user_id,person_id,organisation_id,player_id,
    payload,source,confidence,occurred_at
  )
  values (
    'TELL_DJM_ACTION_APPLIED',
    v_capture.submitted_by,
    v_person_id,
    v_org_id,
    v_player_id,
    jsonb_build_object(
      'capture_id',p_capture_id,
      'action_id',v_action.id,
      'action_type',p_action_type,
      'target_id',v_target_id
    ),
    'tell_djm',
    p_confidence,
    now()
  );

  return jsonb_build_object(
    'action_id',v_action.id,
    'status','applied',
    'target_id',v_target_id,
    'duplicate',false,
    'verified',true
  );

exception
  when others then
    insert into djm_os.tell_djm_actions(
      capture_id,action_hash,action_index,action_type,status,
      confidence,evidence,proposed_payload,resolved_payload,error_message
    )
    values (
      p_capture_id,p_action_hash,p_action_index,p_action_type,'failed',
      p_confidence,p_evidence,p_payload,p_payload,left(sqlerrm,1000)
    )
    on conflict (capture_id,action_hash)
    do update
    set status='failed',
        error_message=excluded.error_message,
        updated_at=now();

    return jsonb_build_object(
      'status','failed',
      'error',sqlerrm
    );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_apply_scout_observation(p_capture_id uuid, p_action_hash text, p_action_index integer, p_confidence numeric, p_evidence text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_capture djm_os.captures%rowtype;
  v_permission text;
  v_action djm_os.tell_djm_actions%rowtype;
  v_prospect_id uuid;
  v_report_id uuid;
  v_player_id uuid;
  v_name text:=trim(coalesce(p_payload->>'player_name',''));
  v_source_type text:=coalesce(nullif(p_payload->>'scout_source_type',''),'conversation');
  v_recommendation text:=nullif(p_payload->>'scout_recommendation','');
  v_source_key text:='tell:'||p_capture_id::text||':'||p_action_hash;
  v_after jsonb;
  v_created_prospect boolean:=false;
  v_review jsonb;
begin
  select * into v_capture from djm_os.captures where id=p_capture_id;
  if not found then raise exception 'Capture not found'; end if;

  select permission_scope into v_permission
  from djm_os.tell_djm_permissions
  where user_id=v_capture.submitted_by and is_enabled=true;

  if v_permission not in ('full','scout') or coalesce(p_confidence,0)<0.72 then
    select public.djm_tell_apply_action(
      p_capture_id,p_action_hash,p_action_index,'log_scout_observation',0,
      p_evidence,p_payload
    ) into v_review;
    return v_review;
  end if;

  select * into v_action
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and action_hash=p_action_hash;
  if found and v_action.status in ('applied','undone','needs_review') then
    return jsonb_build_object(
      'action_id',v_action.id,'status',v_action.status,'duplicate',true,
      'target_id',v_action.target_id
    );
  end if;

  if length(v_name)<2 then raise exception 'Scout observation player name is required'; end if;

  begin
    v_prospect_id:=nullif(p_payload->>'prospect_id','')::uuid;
  exception when invalid_text_representation then
    v_prospect_id:=null;
  end;

  if v_prospect_id is not null and not exists (
    select 1 from djm_os.scouting_prospects sp where sp.id=v_prospect_id
  ) then
    raise exception 'Recruitment target not found';
  end if;

  if v_prospect_id is null then
    select sp.id into v_prospect_id
    from djm_os.scouting_prospects sp
    where lower(trim(regexp_replace(sp.full_name,'[^[:alnum:]]+',' ','g')))
          =lower(trim(regexp_replace(v_name,'[^[:alnum:]]+',' ','g')))
      and (
        nullif(p_payload->>'player_current_club','') is null
        or sp.current_club is null
        or extensions.similarity(lower(sp.current_club),lower(p_payload->>'player_current_club'))>=0.65
      )
    order by sp.updated_at desc
    limit 1;
  end if;

  if v_prospect_id is null then
    select p.id into v_player_id
    from public.players p
    where greatest(
      extensions.similarity(lower(concat_ws(' ',p.first_name,p.last_name)),lower(v_name)),
      extensions.similarity(lower(coalesce(p.preferred_name,'')),lower(v_name))
    )>=0.94
    order by greatest(
      extensions.similarity(lower(concat_ws(' ',p.first_name,p.last_name)),lower(v_name)),
      extensions.similarity(lower(coalesce(p.preferred_name,'')),lower(v_name))
    ) desc
    limit 1;

    insert into djm_os.scouting_prospects(
      linked_player_id,full_name,current_club,current_country,primary_position,
      availability_status,source,source_confidence,owner_user_id,canonical_key,
      recruitment_stage,recruitment_priority
    ) values (
      v_player_id,
      v_name,
      nullif(p_payload->>'player_current_club',''),
      nullif(p_payload->>'player_current_country',''),
      nullif(p_payload->>'position',''),
      'monitor',
      'tell_djm',
      p_confidence,
      v_capture.submitted_by,
      'tell:'||lower(trim(regexp_replace(v_name,'[^[:alnum:]]+',' ','g'))),
      'identified',
      greatest(1,least(coalesce(nullif(p_payload->>'priority','')::integer,3),5))
    )
    on conflict (canonical_key) where canonical_key is not null
    do update set
      current_club=coalesce(djm_os.scouting_prospects.current_club,excluded.current_club),
      current_country=coalesce(djm_os.scouting_prospects.current_country,excluded.current_country),
      primary_position=coalesce(djm_os.scouting_prospects.primary_position,excluded.primary_position),
      source_confidence=greatest(
        coalesce(djm_os.scouting_prospects.source_confidence,0),
        coalesce(excluded.source_confidence,0)
      ),
      updated_at=now()
    returning id into v_prospect_id;
    v_created_prospect:=true;
  else
    update djm_os.scouting_prospects
    set current_club=coalesce(current_club,nullif(p_payload->>'player_current_club','')),
        current_country=coalesce(current_country,nullif(p_payload->>'player_current_country','')),
        primary_position=coalesce(primary_position,nullif(p_payload->>'position','')),
        source_confidence=greatest(coalesce(source_confidence,0),coalesce(p_confidence,0)),
        updated_at=now()
    where id=v_prospect_id;
  end if;

  insert into djm_os.scouting_reports(
    prospect_id,scout_user_id,report_date,source_type,match_or_context,
    football_score,physical_score,tactical_score,mentality_score,personality_score,
    readiness_score,recommendation,strengths,risks,role_fit,notes,source_key
  ) values (
    v_prospect_id,
    v_capture.submitted_by,
    v_capture.created_at::date,
    case when v_source_type in ('live','video','data','reference','conversation')
      then v_source_type else 'conversation' end,
    nullif(p_payload->>'summary',''),
    null,null,null,null,null,null,
    case when v_recommendation in ('strong_yes','yes','monitor','no','strong_no')
      then v_recommendation else null end,
    nullif(p_payload->>'strengths',''),
    nullif(p_payload->>'risks',''),
    nullif(p_payload->>'profile_notes',''),
    p_evidence,
    v_source_key
  )
  on conflict (source_key)
  do update set updated_at=djm_os.scouting_reports.updated_at
  returning id into v_report_id;

  select jsonb_build_object(
    'report',to_jsonb(r),
    'prospect',to_jsonb(sp),
    'prospect_was_new_at_resolution',v_created_prospect
  ) into v_after
  from djm_os.scouting_reports r
  join djm_os.scouting_prospects sp on sp.id=r.prospect_id
  where r.id=v_report_id;

  if v_after is null then raise exception 'Scout observation write could not be verified'; end if;

  insert into djm_os.tell_djm_actions(
    capture_id,action_hash,action_index,action_type,status,confidence,evidence,
    proposed_payload,resolved_payload,target_type,target_id,before_json,after_json,
    verification_json,undo_supported,applied_at
  ) values (
    p_capture_id,p_action_hash,p_action_index,'log_scout_observation','applied',
    p_confidence,p_evidence,p_payload,p_payload,'scouting_report',v_report_id,
    jsonb_build_object('prospect_was_new_at_resolution',v_created_prospect,'prospect_id',v_prospect_id),
    v_after,
    jsonb_build_object('read_back',true,'verified_at',now(),'target_exists',true),
    true,now()
  )
  on conflict (capture_id,action_hash)
  do update set
    status='applied',target_id=excluded.target_id,after_json=excluded.after_json,
    verification_json=excluded.verification_json,error_message=null,applied_at=excluded.applied_at,
    updated_at=now()
  returning * into v_action;

  insert into djm_os.events(
    event_type,actor_user_id,player_id,payload,source,confidence,occurred_at
  ) values (
    'TELL_DJM_SCOUT_OBSERVATION_LOGGED',v_capture.submitted_by,v_player_id,
    jsonb_build_object(
      'capture_id',p_capture_id,'action_id',v_action.id,
      'prospect_id',v_prospect_id,'report_id',v_report_id
    ),
    'tell_djm',p_confidence,now()
  );

  return jsonb_build_object(
    'action_id',v_action.id,'status','applied','target_id',v_report_id,
    'prospect_id',v_prospect_id,'verified',true,'duplicate',false
  );
exception
  when others then
    insert into djm_os.tell_djm_actions(
      capture_id,action_hash,action_index,action_type,status,confidence,evidence,
      proposed_payload,resolved_payload,error_message
    ) values (
      p_capture_id,p_action_hash,p_action_index,'log_scout_observation','failed',
      p_confidence,p_evidence,p_payload,p_payload,left(sqlerrm,1000)
    )
    on conflict (capture_id,action_hash)
    do update set status='failed',error_message=excluded.error_message,updated_at=now();
    return jsonb_build_object('status','failed','error',sqlerrm);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_audio_cleanup_due(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    jsonb_agg(jsonb_build_object('capture_id',id,'source_uri',source_uri)),
    '[]'::jsonb
  )
  from (
    select c.id,c.source_uri
    from djm_os.captures c
    where c.processing_version='tell_djm_v1'
      and c.capture_type='audio'
      and c.keep_audio=false
      and c.source_uri is not null
      and c.audio_delete_after is not null
      and c.audio_delete_after<=now()
    order by c.audio_delete_after
    limit greatest(1,least(coalesce(p_limit,50),200))
  ) due;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_budget_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_budget numeric;
  v_spend numeric;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  select monthly_ai_budget_usd into v_budget from djm_os.tell_djm_settings where id=1;
  select coalesce(sum(coalesce((usage_json->>'estimated_cost_usd')::numeric,0)),0)
  into v_spend
  from djm_os.captures
  where created_at>=date_trunc('month',now()) and processing_version='tell_djm_v1';
  return jsonb_build_object('budget_usd',v_budget,'estimated_spend_usd',v_spend);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_context_for_route(p_route text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_path text:=split_part(coalesce(p_route,''),'?',1);
  v_match text[];
  v_id uuid;
  v_result jsonb;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  v_match:=regexp_match(v_path,'^/admin/players/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?:/|$)');
  if v_match is not null then
    v_id:=v_match[1]::uuid;
    select jsonb_build_object(
      'route',v_path,
      'player_id',p.id,
      'player_name',coalesce(
        nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
        p.preferred_name,
        'Player'
      ),
      'label',coalesce(
        nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
        p.preferred_name,
        'Player'
      ),
      'context_type','player'
    ) into v_result
    from public.players p
    where p.id=v_id;
    return coalesce(v_result,jsonb_build_object('route',v_path));
  end if;

  v_match:=regexp_match(v_path,'^/network/clubs/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?:/|$)');
  if v_match is not null then
    v_id:=v_match[1]::uuid;
    select jsonb_build_object(
      'route',v_path,
      'organisation_id',o.id,
      'organisation_name',o.name,
      'label',o.name,
      'context_type','club'
    ) into v_result
    from djm_os.organisations o
    where o.id=v_id and o.organisation_type='club';
    return coalesce(v_result,jsonb_build_object('route',v_path));
  end if;

  v_match:=regexp_match(v_path,'^/network/contacts/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?:/|$)');
  if v_match is not null then
    v_id:=v_match[1]::uuid;
    select jsonb_build_object(
      'route',v_path,
      'person_id',p.id,
      'person_name',p.full_name,
      'organisation_id',e.organisation_id,
      'organisation_name',e.organisation_name,
      'label',p.full_name,
      'context_type','contact'
    ) into v_result
    from djm_os.people p
    left join lateral (
      select employment.organisation_id,o.name as organisation_name
      from djm_os.employments employment
      left join djm_os.organisations o on o.id=employment.organisation_id
      where employment.person_id=p.id and employment.is_current=true
      order by employment.updated_at desc
      limit 1
    ) e on true
    where p.id=v_id;
    return coalesce(v_result,jsonb_build_object('route',v_path));
  end if;

  v_match:=regexp_match(v_path,'^/recruitment/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?:/|$)');
  if v_match is not null then
    v_id:=v_match[1]::uuid;
    select jsonb_build_object(
      'route',v_path,
      'prospect_id',sp.id,
      'prospect_name',sp.full_name,
      'player_id',sp.linked_player_id,
      'label',sp.full_name,
      'context_type','recruitment'
    ) into v_result
    from djm_os.scouting_prospects sp
    where sp.id=v_id;
    return coalesce(v_result,jsonb_build_object('route',v_path));
  end if;

  v_match:=regexp_match(v_path,'^/(?:opportunities|market/deals)/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?:/|$)');
  if v_match is not null then
    v_id:=v_match[1]::uuid;
    select jsonb_build_object(
      'route',v_path,
      'opportunity_id',d.id,
      'organisation_id',d.organisation_id,
      'organisation_name',o.name,
      'person_id',d.source_person_id,
      'person_name',pe.full_name,
      'player_id',d.player_id,
      'player_name',coalesce(
        nullif(trim(concat_ws(' ',pl.first_name,pl.last_name)),''),
        pl.preferred_name
      ),
      'prospect_id',d.prospect_id,
      'prospect_name',sp.full_name,
      'club_need_id',d.club_need_id,
      'label',concat_ws(
        ' -> ',
        coalesce(
          nullif(trim(concat_ws(' ',pl.first_name,pl.last_name)),''),
          pl.preferred_name,
          sp.full_name,
          'Player'
        ),
        o.name
      ),
      'context_type','opportunity'
    ) into v_result
    from djm_os.deal_rooms d
    join djm_os.organisations o on o.id=d.organisation_id
    left join djm_os.people pe on pe.id=d.source_person_id
    left join public.players pl on pl.id=d.player_id
    left join djm_os.scouting_prospects sp on sp.id=d.prospect_id
    where d.id=v_id;
    return coalesce(v_result,jsonb_build_object('route',v_path));
  end if;

  return jsonb_build_object('route',v_path);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_create_confirmed_club(p_capture_id uuid, p_name text, p_country text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_capture djm_os.captures%rowtype;
  v_name text:=trim(coalesce(p_name,''));
  v_key text;
  v_id uuid;
  v_existing_type text;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  if length(v_name)<2 then raise exception 'Club name is required'; end if;

  select * into v_capture from djm_os.captures where id=p_capture_id;
  if not found then raise exception 'Capture not found'; end if;

  if not exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=auth.uid() and p.permission_scope='full' and p.is_enabled=true
  ) then
    raise exception 'Only full-access DJM users can create a new club from Tell DJM';
  end if;

  v_key:=lower(trim(regexp_replace(v_name,'[^[:alnum:]]+',' ','g')));

  select o.id,o.organisation_type
  into v_id,v_existing_type
  from djm_os.organisations o
  where lower(trim(regexp_replace(o.name,'[^[:alnum:]]+',' ','g')))=v_key
  order by o.updated_at desc
  limit 1;

  if v_id is not null and v_existing_type<>'club' then
    raise exception 'A non-club organisation with this name already exists. Review it first.';
  end if;

  if v_id is null then
    if exists (
      select 1 from djm_os.organisations o
      where o.organisation_type='club'
        and extensions.similarity(lower(o.name),lower(v_name))>=0.90
    ) then
      raise exception 'A very similar club now exists. Re-open the question and choose the existing club.';
    end if;

    insert into djm_os.organisations(
      name,organisation_type,country,canonical_key
    ) values (
      v_name,'club',nullif(trim(coalesce(p_country,'')),''),'club:'||v_key
    ) returning id into v_id;

    insert into djm_os.events(
      event_type,actor_user_id,organisation_id,payload,source,confidence,occurred_at
    ) values (
      'TELL_DJM_CLUB_CREATED',auth.uid(),v_id,
      jsonb_build_object('capture_id',p_capture_id,'name',v_name),
      'tell_djm',1,now()
    );
  end if;

  return jsonb_build_object(
    'entity_type','club',
    'entity_id',v_id,
    'label',v_name,
    'country',nullif(trim(coalesce(p_country,'')),''),
    'score',1
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_create_confirmed_contact(p_capture_id uuid, p_full_name text, p_organisation_id uuid, p_role_title text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_capture djm_os.captures%rowtype;
  v_name text:=trim(coalesce(p_full_name,''));
  v_id uuid;
  v_org_name text;
  v_other_org uuid;
  v_key text;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  if length(v_name)<2 or p_organisation_id is null then
    raise exception 'Contact name and club are required';
  end if;

  select * into v_capture from djm_os.captures where id=p_capture_id;
  if not found then raise exception 'Capture not found'; end if;

  if v_capture.submitted_by<>auth.uid()
     and not exists (
       select 1 from djm_os.tell_djm_permissions p
       where p.user_id=auth.uid() and p.permission_scope='full' and p.is_enabled=true
     ) then
    raise exception 'Only the capture owner or a full-access DJM user can create this contact';
  end if;

  select o.name into v_org_name
  from djm_os.organisations o
  where o.id=p_organisation_id and o.organisation_type='club';
  if not found then raise exception 'Club not found'; end if;

  select p.id
  into v_id
  from djm_os.people p
  join djm_os.employments e on e.person_id=p.id
  where lower(trim(p.full_name))=lower(v_name)
    and e.organisation_id=p_organisation_id
    and e.is_current=true
  order by e.updated_at desc
  limit 1;

  if v_id is null then
    select e.organisation_id
    into v_other_org
    from djm_os.people p
    join djm_os.employments e on e.person_id=p.id and e.is_current=true
    where lower(trim(p.full_name))=lower(v_name)
      and e.organisation_id<>p_organisation_id
    limit 1;

    if v_other_org is not null then
      raise exception 'A same-name contact is already current at another organisation. Review the identity first.';
    end if;

    select p.id into v_id
    from djm_os.people p
    where lower(trim(p.full_name))=lower(v_name)
      and not exists (
        select 1 from djm_os.employments e
        where e.person_id=p.id and e.is_current=true
      )
    order by p.updated_at desc
    limit 1;

    if v_id is null then
      v_key:=lower(trim(regexp_replace(v_name,'[^[:alnum:]]+',' ','g')));
      insert into djm_os.people(
        full_name,person_type,canonical_key,source_confidence
      ) values (
        v_name,'club_contact','contact:'||v_key||':'||p_organisation_id::text,1
      ) returning id into v_id;
    end if;

    insert into djm_os.employments(
      person_id,organisation_id,role_title,is_current,confidence,last_verified_at
    ) values (
      v_id,p_organisation_id,nullif(trim(coalesce(p_role_title,'')),''),true,1,now()
    );
  end if;

  insert into djm_os.relationships(
    team_member_id,person_id,last_meaningful_at,first_known_at,relationship_notes
  ) values (
    v_capture.submitted_by,v_id,v_capture.created_at,v_capture.created_at,'Created or confirmed through Tell DJM.'
  )
  on conflict (team_member_id,person_id)
  do update set
    last_meaningful_at=greatest(
      coalesce(djm_os.relationships.last_meaningful_at,excluded.last_meaningful_at),
      excluded.last_meaningful_at
    ),
    updated_at=now();

  insert into djm_os.events(
    event_type,actor_user_id,organisation_id,person_id,payload,source,confidence,occurred_at
  ) values (
    'TELL_DJM_CONTACT_CREATED_OR_LINKED',auth.uid(),p_organisation_id,v_id,
    jsonb_build_object('capture_id',p_capture_id,'name',v_name,'club',v_org_name),
    'tell_djm',1,now()
  );

  return jsonb_build_object(
    'entity_type','contact',
    'entity_id',v_id,
    'label',v_name,
    'organisation_id',p_organisation_id,
    'organisation_name',v_org_name,
    'role_title',nullif(trim(coalesce(p_role_title,'')),''),
    'score',1
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_current_access()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_scope text;
  v_enabled boolean;
  v_system_live boolean;
  v_limit integer;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select p.permission_scope,p.is_enabled
  into v_scope,v_enabled
  from djm_os.tell_djm_permissions p
  where p.user_id=auth.uid();

  select s.is_live,s.max_audio_seconds
  into v_system_live,v_limit
  from djm_os.tell_djm_settings s
  where s.id=1;

  return jsonb_build_object(
    'enabled',coalesce(v_enabled,false) and coalesce(v_system_live,false),
    'system_live',coalesce(v_system_live,false),
    'permission_scope',coalesce(v_scope,'read_only'),
    'max_audio_seconds',coalesce(v_limit,240)
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_delete_capture(p_capture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_capture djm_os.captures%rowtype;
  v_applied_count integer := 0;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select *
  into v_capture
  from djm_os.captures c
  where c.id = p_capture_id
  for update;

  if v_capture.id is null then
    raise exception 'Tell DJM update not found';
  end if;

  if v_capture.processing_version is distinct from 'tell_djm_v1' then
    raise exception 'Only Tell DJM updates can be deleted here';
  end if;

  if v_capture.status in ('queued','processing','retry') then
    raise exception 'This Tell DJM update is still processing';
  end if;

  if not (
    v_capture.submitted_by = v_uid
    or exists (
      select 1
      from djm_os.tell_djm_permissions p
      where p.user_id = v_uid
        and p.permission_scope = 'full'
        and p.is_enabled = true
    )
  ) then
    raise exception 'You do not have access to delete this Tell DJM update';
  end if;

  select count(*)
  into v_applied_count
  from djm_os.tell_djm_actions a
  where a.capture_id = p_capture_id
    and a.status = 'applied';

  if v_applied_count > 0 then
    raise exception 'This Tell DJM update has already changed DJM. Undo the applied updates before deleting it.';
  end if;

  delete from djm_os.captures
  where id = p_capture_id;

  insert into djm_os.events(
    event_type,
    actor_user_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (
    'TELL_DJM_CAPTURE_DELETED',
    v_uid,
    jsonb_build_object(
      'capture_id', p_capture_id,
      'previous_status', v_capture.status,
      'capture_type', v_capture.capture_type
    ),
    'tell_djm',
    1,
    now()
  );

  return jsonb_build_object(
    'deleted', true,
    'capture_id', p_capture_id
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_enqueue_capture(p_client_capture_id uuid, p_capture_type text, p_source_uri text DEFAULT NULL::text, p_raw_text text DEFAULT NULL::text, p_channel text DEFAULT 'voice_debrief'::text, p_person_id uuid DEFAULT NULL::uuid, p_organisation_id uuid DEFAULT NULL::uuid, p_player_id uuid DEFAULT NULL::uuid, p_context_json jsonb DEFAULT '{}'::jsonb, p_duration_seconds numeric DEFAULT NULL::numeric, p_parent_capture_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_capture djm_os.captures%rowtype;
  v_days integer;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  if p_client_capture_id is null then
    raise exception 'Client capture ID is required';
  end if;
  if p_capture_type not in ('audio','text') then
    raise exception 'Tell DJM currently supports audio and text captures';
  end if;
  if coalesce(length(trim(p_raw_text)),0)=0 and p_source_uri is null then
    raise exception 'Capture content is required';
  end if;
  if not exists (
    select 1
    from djm_os.tell_djm_permissions p
    cross join djm_os.tell_djm_settings s
    where p.user_id=auth.uid()
      and p.is_enabled=true
      and s.id=1
      and s.is_live=true
  ) then
    raise exception 'Tell DJM is not enabled for this account';
  end if;

  select * into v_capture
  from djm_os.captures
  where submitted_by=auth.uid() and client_capture_id=p_client_capture_id
  limit 1;

  if found then
    return jsonb_build_object('capture_id',v_capture.id,'status',v_capture.status,'duplicate',true);
  end if;

  select audio_retention_days into v_days from djm_os.tell_djm_settings where id=1;

  insert into djm_os.captures(
    submitted_by,channel,capture_type,raw_text,source_uri,person_id,organisation_id,player_id,
    status,confidence,client_capture_id,context_json,parent_capture_id,audio_duration_seconds,
    audio_delete_after,next_attempt_at,processing_version
  )
  values (
    auth.uid(),coalesce(nullif(trim(p_channel),''),'voice_debrief'),p_capture_type,
    nullif(trim(coalesce(p_raw_text,'')),''),p_source_uri,p_person_id,p_organisation_id,p_player_id,
    'queued',null,p_client_capture_id,coalesce(p_context_json,'{}'::jsonb),p_parent_capture_id,
    p_duration_seconds,
    case when p_capture_type='audio' then now()+make_interval(days=>coalesce(v_days,7)) else null end,
    now(),'tell_djm_v1'
  )
  returning * into v_capture;

  insert into djm_os.events(
    event_type,actor_user_id,person_id,organisation_id,player_id,payload,source,confidence,occurred_at
  )
  values (
    'TELL_DJM_CAPTURE_QUEUED',auth.uid(),p_person_id,p_organisation_id,p_player_id,
    jsonb_build_object('capture_id',v_capture.id,'capture_type',p_capture_type,'client_capture_id',p_client_capture_id),
    'tell_djm',1,now()
  );

  return jsonb_build_object('capture_id',v_capture.id,'status',v_capture.status,'duplicate',false);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_mark_audio_deleted(p_capture_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  update djm_os.captures
  set source_uri=null,
      context_json=jsonb_set(
        context_json,
        '{audio_deleted_at}',
        to_jsonb(now()),
        true
      )
  where id=p_capture_id;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_notify_attention(p_capture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_capture djm_os.captures%rowtype;
  v_title text;
  v_body text;
  v_fingerprint text;
  v_inserted integer:=0;
  v_has_open_work boolean:=false;
begin
  select * into v_capture
  from djm_os.captures
  where id=p_capture_id;
  if not found then raise exception 'Capture not found'; end if;

  if v_capture.status not in ('needs_input','needs_review','partial','failed','budget_blocked') then
    return jsonb_build_object('queued',false,'status',v_capture.status);
  end if;

  select exists(
    select 1 from djm_os.tell_djm_questions q
    where q.capture_id=v_capture.id and q.status not in ('answered','superseded','cancelled')
    union all
    select 1 from djm_os.tell_djm_actions a
    where a.capture_id=v_capture.id and a.status in ('needs_review','failed')
  ) into v_has_open_work;

  if v_capture.status='needs_review' and not v_has_open_work then
    return jsonb_build_object('queued',false,'status',v_capture.status,'reason','no_action_required');
  end if;

  v_title:=case v_capture.status
    when 'needs_input' then 'Tell DJM needs an answer'
    when 'needs_review' then 'Tell DJM needs a quick check'
    when 'failed' then 'Tell DJM could not finish'
    when 'partial' then 'Tell DJM saved part of this'
    else 'Tell DJM is paused'
  end;
  v_body:=left(coalesce(nullif(v_capture.summary,''),'Open Tell DJM to check this update.'),240);
  v_fingerprint:='tell:'||v_capture.id::text;

  insert into djm_os.notifications(
    user_id,notification_type,title,body,priority,
    person_id,organisation_id,player_id,payload,fingerprint,expires_at
  ) values (
    v_capture.submitted_by,
    'tell_djm_attention',
    v_title,
    v_body,
    case when v_capture.status in ('failed','partial','budget_blocked') then 92 else 82 end,
    v_capture.person_id,
    v_capture.organisation_id,
    v_capture.player_id,
    jsonb_build_object('capture_id',v_capture.id,'status',v_capture.status,'url','/tell?capture='||v_capture.id::text),
    v_fingerprint,
    now()+interval '14 days'
  )
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics v_inserted=row_count;

  if v_inserted=1 then
    perform private.djm_queue_push(
      v_capture.submitted_by,
      'tell_djm_attention',
      v_title,
      v_body,
      '/tell?capture='||v_capture.id::text,
      jsonb_build_object('capture_id',v_capture.id,'status',v_capture.status),
      'tell:'||v_capture.id::text
    );
  end if;

  return jsonb_build_object(
    'queued',v_inserted=1,
    'status',v_capture.status,
    'fingerprint',v_fingerprint
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_orphan_audio_cleanup_due(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    jsonb_agg(jsonb_build_object('bucket_id',bucket_id,'name',name)),
    '[]'::jsonb
  )
  from (
    select o.bucket_id,o.name
    from storage.objects o
    where o.bucket_id='djm-network-captures'
      and o.name like '%/tell-djm/%'
      and o.created_at<now()-interval '8 days'
      and not exists (
        select 1
        from djm_os.captures c
        where c.source_uri=o.bucket_id||'/'||o.name
      )
    order by o.created_at
    limit greatest(1,least(coalesce(p_limit,50),200))
  ) orphan;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_receipt(p_capture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  if not exists (
    select 1 from djm_os.captures c
    where c.id=p_capture_id
      and c.submitted_by=auth.uid()
  ) and not exists (
    select 1 from djm_os.tell_djm_permissions p
    where p.user_id=auth.uid()
      and p.permission_scope='full'
      and p.is_enabled=true
  ) then
    raise exception 'Tell DJM capture access denied';
  end if;

  select jsonb_build_object(
    'capture',jsonb_build_object(
      'id',c.id,'status',c.status,'summary',c.summary,'transcript_text',c.transcript_text,
      'created_at',c.created_at,'completed_at',c.completed_at,'error_message',c.error_message
    ),
    'actions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'action_type',a.action_type,'status',a.status,'confidence',a.confidence,
        'evidence',a.evidence,'target_type',a.target_type,'target_id',a.target_id,
        'undo_supported',a.undo_supported,'error_message',a.error_message
      ) order by a.action_index,a.created_at)
      from djm_os.tell_djm_actions a
      where a.capture_id=c.id and a.status<>'superseded'
    ),'[]'::jsonb),
    'questions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',q.id,'field_key',q.field_key,'prompt',q.prompt,'reason',q.reason,
        'candidates',q.candidates,'status',q.status
      ) order by q.created_at)
      from djm_os.tell_djm_questions q
      where q.capture_id=c.id and q.status<>'superseded'
    ),'[]'::jsonb)
  )
  into v_result
  from djm_os.captures c
  where c.id=p_capture_id;

  if v_result is null then raise exception 'Capture not found'; end if;
  return v_result;
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_recent_captures(p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,8),20));
  v_result jsonb;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb)
  into v_result
  from (
    select
      c.created_at,
      jsonb_build_object(
        'id',c.id,
        'status',c.status,
        'summary',c.summary,
        'channel',c.channel,
        'created_at',c.created_at,
        'completed_at',c.completed_at,
        'action_count',(
          select count(*)
          from djm_os.tell_djm_actions a
          where a.capture_id=c.id
            and a.status not in ('superseded','undone')
        ),
        'question_count',(
          select count(*)
          from djm_os.tell_djm_questions q
          where q.capture_id=c.id
            and q.status='open'
        )
      ) item
    from djm_os.captures c
    where c.submitted_by=(select auth.uid())
      and c.processing_version='tell_djm_v1'
    order by c.created_at desc
    limit v_limit
  ) recent;

  return v_result;
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_record_question(p_capture_id uuid, p_field_key text, p_prompt text, p_reason text, p_candidates jsonb, p_context_json jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  select id into v_id
  from djm_os.tell_djm_questions
  where capture_id=p_capture_id
    and field_key=p_field_key
    and prompt=p_prompt
    and status='open'
  limit 1;

  if found then return v_id; end if;

  insert into djm_os.tell_djm_questions(
    capture_id,field_key,prompt,reason,candidates,context_json
  )
  values (
    p_capture_id,p_field_key,p_prompt,p_reason,
    coalesce(p_candidates,'[]'::jsonb),coalesce(p_context_json,'{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_resolve_entity(p_user_id uuid, p_entity_type text, p_name text, p_organisation_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_primary jsonb;
  v_player jsonb;
  v_candidates jsonb:='[]'::jsonb;
begin
  v_primary:=public.djm_tell_resolve_entity_typed(
    p_user_id,p_entity_type,p_name,p_organisation_name
  );

  if p_entity_type<>'contact'
     or nullif(v_primary->>'resolved_id','') is not null then
    return v_primary;
  end if;

  v_player:=public.djm_tell_resolve_entity_typed(
    p_user_id,'player',p_name,null
  );

  select coalesce(
    jsonb_agg(
      candidate
      order by coalesce((candidate->>'score')::numeric,0) desc,
               candidate->>'label'
    ),
    '[]'::jsonb
  )
  into v_candidates
  from (
    select case
      when candidate->>'entity_type'='contact' then
        jsonb_set(
          jsonb_set(
            candidate,
            '{canonical_label}',
            to_jsonb(candidate->>'label'),
            true
          ),
          '{label}',
          to_jsonb(
            concat_ws(
              ' · ',
              candidate->>'label',
              'Contact',
              nullif(candidate->>'organisation_name','')
            )
          ),
          true
        )
      else candidate
    end as candidate
    from jsonb_array_elements(
      coalesce(v_primary->'candidates','[]'::jsonb)
    ) candidate

    union all

    select jsonb_set(
      jsonb_set(
        candidate,
        '{canonical_label}',
        to_jsonb(candidate->>'label'),
        true
      ),
      '{label}',
      to_jsonb(
        concat_ws(
          ' · ',
          candidate->>'label',
          'Player',
          nullif(candidate->>'club','')
        )
      ),
      true
    ) as candidate
    from jsonb_array_elements(
      coalesce(v_player->'candidates','[]'::jsonb)
    ) candidate
  ) merged;

  return jsonb_build_object(
    'resolved_id',null,
    'resolved_label',null,
    'candidates',v_candidates,
    'matched_by','person_candidates'
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_resolve_entity_typed(p_user_id uuid, p_entity_type text, p_name text, p_organisation_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_query text:=lower(trim(regexp_replace(coalesce(p_name,''),'[^[:alnum:]]+',' ','g')));
  v_org_query text:=lower(trim(regexp_replace(coalesce(p_organisation_name,''),'[^[:alnum:]]+',' ','g')));
  v_result jsonb:='[]'::jsonb;
  v_alias_id uuid;
  v_alias_label text;
  v_alias_candidate jsonb;
begin
  if p_entity_type not in ('club','contact','player','prospect') or v_query='' then
    return jsonb_build_object(
      'resolved_id',null,
      'resolved_label',null,
      'candidates','[]'::jsonb,
      'matched_by',null
    );
  end if;

  select a.entity_id
  into v_alias_id
  from djm_os.tell_djm_aliases a
  where a.entity_type=p_entity_type
    and a.normalised_alias=v_query
    and (a.owner_user_id=p_user_id or a.owner_user_id is null)
  order by
    case when a.owner_user_id=p_user_id then 0 else 1 end,
    a.confirmed_count desc,
    a.updated_at desc
  limit 1;

  if v_alias_id is not null then
    if p_entity_type='club' then
      select
        o.name,
        jsonb_build_object(
          'entity_type','club',
          'entity_id',o.id,
          'label',o.name,
          'country',o.country,
          'score',1
        )
      into v_alias_label,v_alias_candidate
      from djm_os.organisations o
      where o.id=v_alias_id
        and o.organisation_type='club';

    elsif p_entity_type='contact' then
      select
        p.full_name,
        jsonb_build_object(
          'entity_type','contact',
          'entity_id',p.id,
          'label',p.full_name,
          'organisation_id',e.organisation_id,
          'organisation_name',o.name,
          'role_title',e.role_title,
          'score',1
        )
      into v_alias_label,v_alias_candidate
      from djm_os.people p
      left join lateral (
        select employment.organisation_id,employment.role_title
        from djm_os.employments employment
        where employment.person_id=p.id
          and employment.is_current=true
        order by employment.updated_at desc
        limit 1
      ) e on true
      left join djm_os.organisations o on o.id=e.organisation_id
      where p.id=v_alias_id
        and coalesce(p.person_type,'contact')<>'player';

    elsif p_entity_type='player' then
      select
        coalesce(
          nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
          p.preferred_name
        ),
        jsonb_build_object(
          'entity_type','player',
          'entity_id',p.id,
          'label',coalesce(
            nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
            p.preferred_name
          ),
          'club',p.current_club,
          'score',1
        )
      into v_alias_label,v_alias_candidate
      from public.players p
      where p.id=v_alias_id;

    elsif p_entity_type='prospect' then
      select
        sp.full_name,
        jsonb_build_object(
          'entity_type','prospect',
          'entity_id',sp.id,
          'label',sp.full_name,
          'club',sp.current_club,
          'country',sp.current_country,
          'score',1
        )
      into v_alias_label,v_alias_candidate
      from djm_os.scouting_prospects sp
      where sp.id=v_alias_id;
    end if;

    if v_alias_label is not null then
      return jsonb_build_object(
        'resolved_id',v_alias_id,
        'resolved_label',v_alias_label,
        'candidates',jsonb_build_array(v_alias_candidate),
        'matched_by','confirmed_alias'
      );
    end if;
  end if;

  if p_entity_type='club' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'entity_type','club',
          'entity_id',candidate.id,
          'label',candidate.name,
          'country',candidate.country,
          'score',candidate.score
        )
        order by candidate.score desc,candidate.name
      ),
      '[]'::jsonb
    )
    into v_result
    from (
      select scored.*
      from (
        select
          o.id,
          o.name,
          o.country,
          greatest(
            extensions.similarity(lower(o.name),lower(p_name)),
            case
              when lower(trim(regexp_replace(o.name,'[^[:alnum:]]+',' ','g')))=v_query
                then 1
              when length(v_query)>=5 and (
                lower(o.name) like lower(p_name)||'%'
                or lower(p_name) like lower(o.name)||'%'
              ) then 0.93
              else 0
            end
          ) as score
        from djm_os.organisations o
        where o.organisation_type='club'
      ) scored
      where scored.score>=0.28
      order by scored.score desc,scored.name
      limit 5
    ) candidate;

  elsif p_entity_type='contact' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'entity_type','contact',
          'entity_id',candidate.id,
          'label',candidate.full_name,
          'organisation_id',candidate.organisation_id,
          'organisation_name',candidate.organisation_name,
          'role_title',candidate.role_title,
          'score',candidate.score
        )
        order by candidate.score desc,candidate.full_name
      ),
      '[]'::jsonb
    )
    into v_result
    from (
      select scored.*
      from (
        select
          p.id,
          p.full_name,
          e.organisation_id,
          o.name as organisation_name,
          e.role_title,
          least(
            1,
            greatest(
              extensions.similarity(lower(p.full_name),lower(p_name)),
              case
                when lower(trim(regexp_replace(p.full_name,'[^[:alnum:]]+',' ','g')))=v_query
                  then 1
                when split_part(lower(p.full_name),' ',1)=lower(trim(p_name))
                     and v_org_query<>''
                     and extensions.similarity(lower(coalesce(o.name,'')),lower(p_organisation_name))>=0.60
                  then 0.94
                else 0
              end
            )
            + case
                when v_org_query<>''
                 and extensions.similarity(lower(coalesce(o.name,'')),lower(p_organisation_name))>=0.60
                then 0.12 else 0
              end
          ) as score
        from djm_os.people p
        left join lateral (
          select employment.organisation_id,employment.role_title,employment.updated_at
          from djm_os.employments employment
          where employment.person_id=p.id
            and employment.is_current=true
          order by employment.updated_at desc
          limit 1
        ) e on true
        left join djm_os.organisations o on o.id=e.organisation_id
        where coalesce(p.person_type,'contact')<>'player'
      ) scored
      where scored.score>=0.28
      order by scored.score desc,scored.full_name
      limit 5
    ) candidate;

  elsif p_entity_type='player' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'entity_type','player',
          'entity_id',candidate.id,
          'label',candidate.player_name,
          'club',candidate.current_club,
          'score',candidate.score
        )
        order by candidate.score desc,candidate.player_name
      ),
      '[]'::jsonb
    )
    into v_result
    from (
      select scored.*
      from (
        select
          p.id,
          coalesce(
            nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
            p.preferred_name
          ) as player_name,
          p.current_club,
          greatest(
            extensions.similarity(lower(concat_ws(' ',p.first_name,p.last_name)),lower(p_name)),
            extensions.similarity(lower(coalesce(p.preferred_name,'')),lower(p_name)),
            case
              when lower(trim(concat_ws(' ',p.first_name,p.last_name)))=v_query then 1
              when lower(trim(coalesce(p.preferred_name,'')))=v_query then 1
              else 0
            end
          ) as score
        from public.players p
      ) scored
      where scored.score>=0.28
      order by scored.score desc,scored.player_name
      limit 5
    ) candidate;
  elsif p_entity_type='prospect' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'entity_type','prospect',
          'entity_id',candidate.id,
          'label',candidate.full_name,
          'club',candidate.current_club,
          'country',candidate.current_country,
          'score',candidate.score
        )
        order by candidate.score desc,candidate.full_name
      ),
      '[]'::jsonb
    )
    into v_result
    from (
      select scored.*
      from (
        select
          sp.id,
          sp.full_name,
          sp.current_club,
          sp.current_country,
          least(
            1,
            greatest(
              extensions.similarity(lower(sp.full_name),lower(p_name)),
              case
                when lower(trim(regexp_replace(sp.full_name,'[^[:alnum:]]+',' ','g')))=v_query then 1
                else 0
              end
            )
            + case
                when v_org_query<>''
                 and extensions.similarity(lower(coalesce(sp.current_club,'')),lower(p_organisation_name))>=0.60
                then 0.08 else 0
              end
          ) as score
        from djm_os.scouting_prospects sp
      ) scored
      where scored.score>=0.34
      order by scored.score desc,scored.full_name
      limit 5
    ) candidate;
  end if;

  return jsonb_build_object(
    'resolved_id',
    case
      when jsonb_array_length(v_result)=0 then null
      when coalesce((v_result->0->>'score')::numeric,0)>=0.88
       and (
         jsonb_array_length(v_result)=1
         or coalesce((v_result->0->>'score')::numeric,0)
            -coalesce((v_result->1->>'score')::numeric,0)>=0.10
       )
      then v_result->0->>'entity_id'
      else null
    end,
    'resolved_label',
    case
      when jsonb_array_length(v_result)>0
       and coalesce((v_result->0->>'score')::numeric,0)>=0.88
       and (
         jsonb_array_length(v_result)=1
         or coalesce((v_result->0->>'score')::numeric,0)
            -coalesce((v_result->1->>'score')::numeric,0)>=0.10
       )
      then v_result->0->>'label'
      else null
    end,
    'candidates',v_result,
    'matched_by','fuzzy'
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_retry_capture(p_capture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_capture djm_os.captures%rowtype;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select * into v_capture
  from djm_os.captures
  where id=p_capture_id
    and processing_version='tell_djm_v1';

  if not found then raise exception 'Capture not found'; end if;

  if v_capture.submitted_by<>(select auth.uid())
     and not exists (
       select 1 from djm_os.tell_djm_permissions p
       where p.user_id=(select auth.uid())
         and p.permission_scope='full'
         and p.is_enabled=true
     ) then
    raise exception 'Only the capture owner or a full-access DJM user can retry this';
  end if;

  if v_capture.status not in ('partial','failed') then
    raise exception 'This Tell DJM capture does not need a manual retry';
  end if;

  if coalesce(v_capture.attempt_count,0)>=8 then
    raise exception 'This capture has already retried several times. Review it instead of retrying again.';
  end if;

  update djm_os.captures
  set status='queued',
      next_attempt_at=now(),
      locked_at=null,
      locked_by=null,
      error_message=null,
      last_error_code=null,
      completed_at=null
  where id=p_capture_id;

  insert into djm_os.events(
    event_type,actor_user_id,person_id,organisation_id,player_id,
    payload,source,confidence,occurred_at
  ) values (
    'TELL_DJM_RETRY_REQUESTED',
    (select auth.uid()),
    v_capture.person_id,
    v_capture.organisation_id,
    v_capture.player_id,
    jsonb_build_object('capture_id',p_capture_id),
    'tell_djm',1,now()
  );

  return jsonb_build_object('capture_id',p_capture_id,'status','queued');
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_undo_action(p_action_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_action djm_os.tell_djm_actions%rowtype;
  v_capture djm_os.captures%rowtype;
  v_deleted integer:=0;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select * into v_action
  from djm_os.tell_djm_actions
  where id=p_action_id
    and status='applied'
    and undo_supported=true;

  if not found then
    raise exception 'This action cannot be undone';
  end if;

  select * into v_capture
  from djm_os.captures
  where id=v_action.capture_id;

  if not found then
    raise exception 'Capture not found';
  end if;

  if v_capture.submitted_by<>auth.uid()
     and not exists (
       select 1
       from djm_os.tell_djm_permissions p
       where p.user_id=auth.uid()
         and p.permission_scope='full'
         and p.is_enabled=true
     ) then
    raise exception 'Only the capture owner or a full-access DJM user can undo this';
  end if;

  if v_action.action_type='create_task' then
    delete from djm_os.tasks
    where id=v_action.target_id
      and source='tell_djm:'||v_action.capture_id::text||':'||v_action.action_hash
      and updated_at<=coalesce(v_action.applied_at,now())+interval '5 seconds';
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='log_interaction' then
    delete from djm_os.interactions
    where id=v_action.target_id
      and source_type='tell_djm';
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='add_claim' then
    delete from djm_os.claims
    where id=v_action.target_id
      and source_key='tell:'||v_action.capture_id::text||':'||v_action.action_hash;
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='log_scout_observation' then
    delete from djm_os.scouting_reports
    where id=v_action.target_id
      and source_key='tell:'||v_action.capture_id::text||':'||v_action.action_hash
      and updated_at<=coalesce(v_action.applied_at,now())+interval '5 seconds';
    get diagnostics v_deleted=row_count;

  elsif v_action.action_type='upsert_club_need'
        and coalesce((v_action.before_json->>'created')::boolean,false)=true then
    delete from djm_os.club_needs
    where id=v_action.target_id
      and updated_at<=coalesce(v_action.applied_at,now())+interval '5 seconds';
    get diagnostics v_deleted=row_count;
  end if;

  if v_deleted<>1 then
    raise exception 'This record changed after Tell DJM created it. Review it manually instead of rolling it back.';
  end if;

  update djm_os.tell_djm_actions
  set status='undone',
      undone_at=now(),
      updated_at=now()
  where id=v_action.id;

  insert into djm_os.events(
    event_type,actor_user_id,payload,source,confidence,occurred_at
  )
  values (
    'TELL_DJM_ACTION_UNDONE',
    auth.uid(),
    jsonb_build_object(
      'capture_id',v_action.capture_id,
      'action_id',v_action.id,
      'action_type',v_action.action_type,
      'target_id',v_action.target_id
    ),
    'tell_djm',
    1,
    now()
  );

  return jsonb_build_object(
    'capture_id',v_action.capture_id,
    'action_id',v_action.id,
    'undone',true
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_user_can_process(p_user_id uuid, p_capture_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from djm_os.captures c
    join djm_os.tell_djm_permissions p on p.user_id=c.submitted_by
    join djm_os.team_members tm on tm.user_id=c.submitted_by
    where c.id=p_capture_id
      and c.submitted_by=p_user_id
      and p.is_enabled=true
      and tm.is_active=true
  );
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_vocabulary(p_limit integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'players',coalesce((
      select jsonb_agg(name)
      from (
        select coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name) name
        from public.players p
        where coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name) is not null
        order by p.updated_at desc
        limit greatest(10,least(coalesce(p_limit,120),250))
      ) x
    ),'[]'::jsonb),
    'prospects',coalesce((
      select jsonb_agg(name)
      from (
        select sp.full_name as name
        from djm_os.scouting_prospects sp
        where sp.full_name is not null
        order by sp.updated_at desc
        limit greatest(10,least(coalesce(p_limit,120),250))
      ) x
    ),'[]'::jsonb),
    'clubs',coalesce((
      select jsonb_agg(name)
      from (
        select o.name
        from djm_os.organisations o
        where o.organisation_type='club'
        order by o.updated_at desc
        limit greatest(10,least(coalesce(p_limit,120),250))
      ) x
    ),'[]'::jsonb),
    'contacts',coalesce((
      select jsonb_agg(full_name)
      from (
        select p.full_name
        from djm_os.people p
        where coalesce(p.person_type,'contact')<>'player'
        order by p.updated_at desc
        limit greatest(10,least(coalesce(p_limit,120),250))
      ) x
    ),'[]'::jsonb)
  );
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_worker_claim(p_capture_id uuid DEFAULT NULL::uuid, p_worker text DEFAULT 'tell-djm-worker'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_payload jsonb;
begin
  with candidate as (
    select c.id
    from djm_os.captures c
    where c.processing_version='tell_djm_v1'
      and (
        (c.status in ('queued','retry') and c.next_attempt_at<=now())
        or (c.status='processing' and c.locked_at<now()-interval '5 minutes')
      )
      and (p_capture_id is null or c.id=p_capture_id)
      and exists (
        select 1
        from djm_os.tell_djm_permissions p
        where p.user_id=c.submitted_by
          and p.is_enabled=true
      )
    order by case when c.id=p_capture_id then 0 else 1 end,c.created_at
    for update skip locked
    limit 1
  )
  update djm_os.captures c
  set status='processing',
      attempt_count=c.attempt_count+1,
      locked_at=now(),
      locked_by=p_worker,
      error_message=null
  from candidate
  where c.id=candidate.id
  returning c.id into v_id;

  if v_id is null then
    return null;
  end if;

  update djm_os.tell_djm_actions
  set status='superseded',updated_at=now()
  where capture_id=v_id
    and status in ('pending','failed');

  update djm_os.tell_djm_questions
  set status='superseded'
  where capture_id=v_id
    and status='open';

  select jsonb_build_object(
    'capture_id',c.id,
    'submitted_by',c.submitted_by,
    'capture_type',c.capture_type,
    'raw_text',c.raw_text,
    'source_uri',c.source_uri,
    'transcript_text',c.transcript_text,
    'extracted_json',c.extracted_json,
    'usage_json',c.usage_json,
    'person_id',c.person_id,
    'organisation_id',c.organisation_id,
    'player_id',c.player_id,
    'context_json',c.context_json,
    'created_at',c.created_at,
    'duration_seconds',c.audio_duration_seconds,
    'attempt_count',c.attempt_count,
    'timezone',coalesce(tm.timezone,'Europe/Rome'),
    'permission_scope',coalesce(p.permission_scope,'read_only'),
    'settings',to_jsonb(s),
    'estimated_month_spend',coalesce((
      select sum(coalesce((x.usage_json->>'estimated_cost_usd')::numeric,0))
      from djm_os.captures x
      where x.created_at>=date_trunc('month',now())
        and x.processing_version='tell_djm_v1'
    ),0)
  )
  into v_payload
  from djm_os.captures c
  join djm_os.team_members tm on tm.user_id=c.submitted_by
  left join djm_os.tell_djm_permissions p on p.user_id=c.submitted_by
  cross join djm_os.tell_djm_settings s
  where c.id=v_id and s.id=1;

  return v_payload;
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_worker_complete(p_capture_id uuid, p_transcript text, p_summary text, p_usage jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_status text;
  v_open_questions integer;
  v_failed integer;
  v_review integer;
begin
  select count(*) into v_open_questions
  from djm_os.tell_djm_questions
  where capture_id=p_capture_id and status='open';

  select count(*) into v_failed
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and status='failed';

  select count(*) into v_review
  from djm_os.tell_djm_actions
  where capture_id=p_capture_id and status='needs_review';

  v_status:=case
    when v_open_questions>0 then 'needs_input'
    when v_failed>0 then 'partial'
    when v_review>0 then 'needs_review'
    else 'done'
  end;

  update djm_os.captures
  set transcript_text=p_transcript,
      raw_text=coalesce(raw_text,p_transcript),
      summary=p_summary,
      usage_json=coalesce(usage_json,'{}'::jsonb)||coalesce(p_usage,'{}'::jsonb),
      status=v_status,
      completed_at=now(),
      processed_at=now(),
      locked_at=null,
      locked_by=null,
      error_message=null,
      last_error_code=null,
      receipt_json=jsonb_build_object(
        'status',v_status,
        'open_questions',v_open_questions,
        'failed_actions',v_failed,
        'review_actions',v_review
      )
  where id=p_capture_id;

  if not found then raise exception 'Capture not found'; end if;

  return jsonb_build_object('capture_id',p_capture_id,'status',v_status);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_tell_worker_fail(p_capture_id uuid, p_error text, p_code text DEFAULT 'processing_failed'::text, p_retryable boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_attempt integer;
  v_status text;
begin
  select attempt_count into v_attempt
  from djm_os.captures where id=p_capture_id;

  if not found then raise exception 'Capture not found'; end if;

  v_status:=case
    when p_code='budget_exhausted' then 'budget_blocked'
    when p_retryable and coalesce(v_attempt,0)<5 then 'retry'
    else 'failed'
  end;

  update djm_os.captures
  set status=v_status,
      error_message=left(coalesce(p_error,'Processing failed'),1000),
      last_error_code=p_code,
      next_attempt_at=case
        when v_status='retry'
        then now()+make_interval(
          secs=>least(
            900,
            15*(2^greatest(coalesce(v_attempt,1)-1,0))::integer
          )
        )
        else next_attempt_at
      end,
      locked_at=null,
      locked_by=null
  where id=p_capture_id;

  return jsonb_build_object('capture_id',p_capture_id,'status',v_status);
end;
$function$


commit;
