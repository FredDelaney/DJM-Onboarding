-- DJM Global Score V7.1 source reconciliation.
-- Additive only. Player Score V5 maths is not changed here.

create or replace function public.djm_service_official_subject_queue(
  p_subject_id uuid default null,
  p_limit integer default 20
)
returns table(
  subject_id uuid,
  player_id uuid,
  prospect_id uuid,
  representation_status text,
  full_name text,
  primary_position text,
  current_club text,
  current_league text,
  current_country text,
  current_competition_id uuid,
  current_season_label text,
  football_provider_ids jsonb,
  stats_url text
)
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.djm_service_official_subject_queue(uuid, integer) from public, anon, authenticated;
grant execute on function public.djm_service_official_subject_queue(uuid, integer) to service_role;

create or replace function public.djm_service_replace_official_subject_evidence(
  p_subject_id uuid,
  p_snapshot jsonb,
  p_peers jsonb default '[]'::jsonb,
  p_matches jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.djm_service_replace_official_subject_evidence(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.djm_service_replace_official_subject_evidence(uuid, jsonb, jsonb, jsonb) to service_role;

do $$
declare
  v_failed integer;
  v_unknown numeric;
begin
  if to_regprocedure('djm_os.global_score_v7_self_test()') is null then
    raise exception 'Global Score V7 self-test function is missing';
  end if;
  select count(*) into v_failed from djm_os.global_score_v7_self_test() where not passed;
  if v_failed <> 0 then raise exception 'Global Score V7 self-tests failed: %', v_failed; end if;

  if to_regprocedure('djm_os.global_competition_level_score(text,text,integer)') is null then
    raise exception 'Global competition resolver is missing';
  end if;
  select djm_os.global_competition_level_score('England', 'DJM Made Up League', null) into v_unknown;
  if v_unknown is not null then raise exception 'Unknown league guard failed'; end if;
end;
$$;

do $$
declare v_id bigint;
begin
  if to_regclass('cron.job') is not null then
    for v_id in select jobid from cron.job where jobname in (
      'djm-official-football-refresh-probe',
      'djm-official-football-refresh-daily',
      'djm-official-match-level-probe'
    ) loop
      perform cron.unschedule(v_id);
    end loop;
  end if;
end;
$$;