create or replace function public.djm_replace_official_league_evidence(
  p_snapshot jsonb,
  p_peers jsonb,
  p_matches jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := nullif(trim(p_snapshot ->> 'player_id'), '')::uuid;
  v_provider_player_id text := nullif(trim(p_snapshot ->> 'provider_player_id'), '');
  v_provider_competition_id text := nullif(trim(p_snapshot ->> 'provider_competition_id'), '');
  v_provider_season_id text := nullif(trim(p_snapshot ->> 'provider_season_id'), '');
  v_peer_count integer := 0;
  v_match_count integer := 0;
  v_snapshot_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if v_player_id is null or not exists(select 1 from public.players p where p.id = v_player_id) then
    raise exception 'Valid player is required';
  end if;

  if v_provider_player_id is null
     or v_provider_competition_id <> 'veikkausliiga'
     or v_provider_season_id !~ '^\d{4}$' then
    raise exception 'Valid official Veikkausliiga provider identity is required';
  end if;

  if jsonb_typeof(p_peers) <> 'array' or jsonb_array_length(p_peers) < 20 then
    raise exception 'At least 20 observed official league players are required';
  end if;

  if p_matches is null then
    p_matches := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_matches) <> 'array' then
    raise exception 'Official match evidence must be an array';
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
    synced_at,
    metric_schema_version,
    data_depth,
    confidence,
    payload_hash,
    request_metadata,
    raw_payload_retention
  )
  values (
    v_player_id,
    'official_league',
    v_provider_player_id,
    coalesce(p_snapshot ->> 'provider_team_id', ''),
    v_provider_competition_id,
    v_provider_season_id,
    nullif(trim(p_snapshot ->> 'season_label'), ''),
    nullif(trim(p_snapshot ->> 'club_name'), ''),
    nullif(trim(p_snapshot ->> 'competition_name'), ''),
    coalesce(p_snapshot -> 'metrics', '{}'::jsonb),
    coalesce(nullif(p_snapshot ->> 'observed_at', '')::timestamptz, now()),
    coalesce(nullif(p_snapshot ->> 'synced_at', '')::timestamptz, now()),
    coalesce(nullif(trim(p_snapshot ->> 'metric_schema_version'), ''), 'djm_official_basic_v1'),
    coalesce(nullif(trim(p_snapshot ->> 'data_depth'), ''), 'basic_official'),
    coalesce(nullif(p_snapshot ->> 'confidence', '')::numeric, 0.99),
    nullif(trim(p_snapshot ->> 'payload_hash'), ''),
    coalesce(p_snapshot -> 'request_metadata', '{}'::jsonb),
    coalesce(nullif(trim(p_snapshot ->> 'raw_payload_retention'), ''), 'normalised_only')
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
    metric_schema_version = excluded.metric_schema_version,
    data_depth = excluded.data_depth,
    confidence = excluded.confidence,
    payload_hash = excluded.payload_hash,
    request_metadata = excluded.request_metadata,
    raw_payload_retention = excluded.raw_payload_retention,
    updated_at = now()
  returning id into v_snapshot_id;

  delete from djm_os.provider_peer_stat_snapshots
  where provider = 'official_league'
    and provider_competition_id = v_provider_competition_id
    and provider_season_id = v_provider_season_id;

  insert into djm_os.provider_peer_stat_snapshots(
    provider,
    provider_competition_id,
    provider_season_id,
    provider_player_id,
    provider_team_id,
    player_name,
    team_name,
    provider_position,
    minutes,
    metrics,
    observed_at,
    synced_at,
    metric_schema_version,
    data_depth,
    confidence,
    payload_hash,
    request_metadata,
    raw_payload_retention
  )
  select
    'official_league',
    v_provider_competition_id,
    v_provider_season_id,
    r.provider_player_id,
    coalesce(r.provider_team_id, ''),
    r.player_name,
    r.team_name,
    r.provider_position,
    r.minutes,
    coalesce(r.metrics, '{}'::jsonb),
    coalesce(r.observed_at, now()),
    coalesce(r.synced_at, now()),
    coalesce(r.metric_schema_version, 'djm_official_basic_v1'),
    coalesce(r.data_depth, 'basic_official'),
    coalesce(r.confidence, 0.99),
    r.payload_hash,
    coalesce(r.request_metadata, '{}'::jsonb),
    coalesce(r.raw_payload_retention, 'normalised_only')
  from jsonb_to_recordset(p_peers) as r(
    provider_player_id text,
    provider_team_id text,
    player_name text,
    team_name text,
    provider_position text,
    minutes integer,
    metrics jsonb,
    observed_at timestamptz,
    synced_at timestamptz,
    metric_schema_version text,
    data_depth text,
    confidence numeric,
    payload_hash text,
    request_metadata jsonb,
    raw_payload_retention text
  )
  where nullif(trim(coalesce(r.provider_player_id, '')), '') is not null;

  get diagnostics v_peer_count = row_count;
  if v_peer_count < 20 then
    raise exception 'Fewer than 20 valid official league players were supplied';
  end if;

  insert into djm_os.player_match_stat_snapshots(
    player_id,
    fixture_id,
    competition_id,
    team_id,
    opponent_team_id,
    provider,
    provider_player_id,
    provider_match_id,
    provider_team_id,
    provider_opponent_id,
    provider_competition_id,
    provider_season_id,
    season_label,
    match_date,
    kickoff_at,
    team_name,
    opponent_name,
    home_away,
    position_group,
    provider_position,
    started,
    minutes,
    metrics,
    metric_schema_version,
    data_depth,
    confidence,
    observed_at,
    synced_at,
    payload_hash,
    request_metadata
  )
  select
    v_player_id,
    r.fixture_id,
    r.competition_id,
    r.team_id,
    r.opponent_team_id,
    'official_league',
    v_provider_player_id,
    r.provider_match_id,
    r.provider_team_id,
    r.provider_opponent_id,
    v_provider_competition_id,
    v_provider_season_id,
    coalesce(r.season_label, v_provider_season_id),
    r.match_date,
    r.kickoff_at,
    r.team_name,
    r.opponent_name,
    r.home_away,
    r.position_group,
    r.provider_position,
    r.started,
    r.minutes,
    coalesce(r.metrics, '{}'::jsonb),
    coalesce(r.metric_schema_version, 'djm_official_match_basic_v1'),
    coalesce(r.data_depth, 'basic_official'),
    coalesce(r.confidence, 0.99),
    coalesce(r.observed_at, now()),
    coalesce(r.synced_at, now()),
    r.payload_hash,
    coalesce(r.request_metadata, '{}'::jsonb)
  from jsonb_to_recordset(p_matches) as r(
    fixture_id uuid,
    competition_id uuid,
    team_id uuid,
    opponent_team_id uuid,
    provider_match_id text,
    provider_team_id text,
    provider_opponent_id text,
    season_label text,
    match_date date,
    kickoff_at timestamptz,
    team_name text,
    opponent_name text,
    home_away text,
    position_group text,
    provider_position text,
    started boolean,
    minutes integer,
    metrics jsonb,
    metric_schema_version text,
    data_depth text,
    confidence numeric,
    observed_at timestamptz,
    synced_at timestamptz,
    payload_hash text,
    request_metadata jsonb
  )
  where nullif(trim(coalesce(r.provider_match_id, '')), '') is not null
    and r.match_date is not null
  on conflict(provider, provider_match_id, provider_player_id)
  do update set
    competition_id = excluded.competition_id,
    provider_team_id = excluded.provider_team_id,
    provider_opponent_id = excluded.provider_opponent_id,
    season_label = excluded.season_label,
    match_date = excluded.match_date,
    kickoff_at = excluded.kickoff_at,
    team_name = excluded.team_name,
    opponent_name = excluded.opponent_name,
    home_away = excluded.home_away,
    position_group = excluded.position_group,
    provider_position = excluded.provider_position,
    started = excluded.started,
    minutes = excluded.minutes,
    metrics = excluded.metrics,
    metric_schema_version = excluded.metric_schema_version,
    data_depth = excluded.data_depth,
    confidence = excluded.confidence,
    observed_at = excluded.observed_at,
    synced_at = excluded.synced_at,
    payload_hash = excluded.payload_hash,
    request_metadata = excluded.request_metadata,
    updated_at = now();

  get diagnostics v_match_count = row_count;

  return jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'peer_count', v_peer_count,
    'match_count', v_match_count,
    'provider', 'official_league',
    'provider_competition_id', v_provider_competition_id,
    'provider_season_id', v_provider_season_id
  );
end;
$$;

revoke all on function public.djm_replace_official_league_evidence(jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.djm_replace_official_league_evidence(jsonb,jsonb,jsonb) to service_role;

comment on function public.djm_replace_official_league_evidence(jsonb,jsonb,jsonb) is
  'Atomic service-role-only writer for verified official league player, peer and match evidence. Does not create advanced metrics or alter Player Score V5.';