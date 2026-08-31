-- Service-only bridges for deployed player-data Edge Functions.
-- The private djm_os schema remains outside the public Data API schema list.

create or replace function public.djm_refresh_player_data_context(
  p_mode text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_provider text;
  v_provider_competition_id text;
  v_league text;
  v_country text;
  v_tier integer;
  v_user_id uuid;
  v_canonical_key text;
  v_benchmark_key text;
  v_penalty integer;
  v_strength integer;
  v_competition djm_os.competitions%rowtype;
  v_anchor djm_os.country_league_strength_anchors%rowtype;
  v_benchmark_id uuid;
  v_aliases text[];
begin
  if p_mode = 'status' then
    return jsonb_build_object(
      'benchmark_anchors',
      (select count(*) from djm_os.country_league_strength_anchors)
    );
  end if;

  if p_mode <> 'benchmark' then
    raise exception 'Unsupported player-data context mode.';
  end if;

  v_provider := lower(trim(coalesce(p_payload ->> 'provider', '')));
  v_provider_competition_id := nullif(trim(p_payload ->> 'provider_competition_id'), '');
  v_league := nullif(trim(p_payload ->> 'league'), '');
  v_country := nullif(trim(p_payload ->> 'country'), '');
  v_tier := nullif(p_payload ->> 'tier', '')::integer;
  v_user_id := nullif(p_payload ->> 'user_id', '')::uuid;

  if v_provider <> 'pitchapi'
     or v_provider_competition_id is null
     or v_league is null then
    raise exception 'PitchAPI competition identity and league are required.';
  end if;

  if v_tier is not null and (v_tier < 1 or v_tier > 5) then
    raise exception 'Competition tier must be between one and five.';
  end if;

  v_canonical_key := v_provider || ':' || v_provider_competition_id;

  select *
  into v_competition
  from djm_os.competitions competition
  where competition.canonical_key = v_canonical_key
  limit 1;

  if found then
    v_aliases := array(
      select distinct aliases.alias
      from unnest(
        coalesce(v_competition.aliases, '{}'::text[]) || array[v_league]
      ) as aliases(alias)
      where nullif(trim(aliases.alias), '') is not null
    );

    update djm_os.competitions
    set display_name = v_league,
        country = v_country,
        level_tier = v_tier,
        aliases = v_aliases,
        provider_ids = coalesce(provider_ids, '{}'::jsonb)
          || jsonb_build_object(v_provider, v_provider_competition_id),
        updated_by = v_user_id,
        updated_at = now()
    where id = v_competition.id
    returning * into v_competition;
  else
    insert into djm_os.competitions(
      canonical_key,
      display_name,
      country,
      level_tier,
      aliases,
      provider_ids,
      created_by,
      updated_by
    )
    values (
      v_canonical_key,
      v_league,
      v_country,
      v_tier,
      array[v_league],
      jsonb_build_object(v_provider, v_provider_competition_id),
      v_user_id,
      v_user_id
    )
    returning * into v_competition;
  end if;

  if v_tier is null or v_country is null then
    return jsonb_build_object(
      'competitionId', v_competition.id,
      'benchmark', null
    );
  end if;

  select *
  into v_anchor
  from djm_os.country_league_strength_anchors anchor
  where lower(anchor.country) = lower(v_country)
  limit 1;

  if not found then
    return jsonb_build_object(
      'competitionId', v_competition.id,
      'benchmark', null
    );
  end if;

  v_penalty := case v_tier
    when 1 then 0
    when 2 then 12
    when 3 then 20
    when 4 then 27
    when 5 then 33
    else null
  end;
  v_strength := greatest(10, v_anchor.strength_score - v_penalty);
  v_benchmark_key := v_canonical_key || ':iffhs_2025:t' || v_tier;

  select benchmark.id
  into v_benchmark_id
  from djm_os.league_benchmarks benchmark
  where benchmark.canonical_key = v_benchmark_key
     or benchmark.competition_id = v_competition.id
  order by (benchmark.canonical_key = v_benchmark_key) desc
  limit 1;

  if v_benchmark_id is null then
    insert into djm_os.league_benchmarks(
      canonical_key,
      league_name,
      country,
      strength_score,
      source_url,
      source_note,
      verified_at,
      updated_by,
      competition_id,
      review_cadence_days,
      raw_strength_value,
      raw_strength_scale,
      benchmark_provider,
      benchmark_metric,
      methodology,
      methodology_version,
      source_reference,
      observed_at,
      next_review_at
    )
    values (
      v_benchmark_key,
      v_league,
      v_country,
      v_strength,
      v_anchor.source_url,
      case
        when v_tier = 1 then
          'IFFHS 2025 national top-division anchor, rank ' || v_anchor.iffhs_rank || '.'
        else
          'Derived from IFFHS 2025 national top-division anchor with DJM tier-'
          || v_tier || ' penalty of ' || v_penalty || ' points.'
      end,
      now(),
      v_user_id,
      v_competition.id,
      365,
      v_anchor.iffhs_points,
      'IFFHS 2025 national league points',
      case when v_tier = 1 then 'iffhs_2025' else 'djm_iffhs_tier_decay_v1' end,
      'national_league_strength',
      case
        when v_tier = 1 then v_anchor.methodology
        else v_anchor.methodology
          || ' Lower division adjustment is model-derived and explicitly tier-based.'
      end,
      'djm_global_league_strength_v1',
      'IFFHS rank ' || v_anchor.iffhs_rank || '; tier ' || v_tier,
      v_anchor.observed_at,
      '2027-02-01T00:00:00Z'::timestamptz
    );
  else
    update djm_os.league_benchmarks
    set canonical_key = v_benchmark_key,
        league_name = v_league,
        country = v_country,
        strength_score = v_strength,
        source_url = v_anchor.source_url,
        source_note = case
          when v_tier = 1 then
            'IFFHS 2025 national top-division anchor, rank ' || v_anchor.iffhs_rank || '.'
          else
            'Derived from IFFHS 2025 national top-division anchor with DJM tier-'
            || v_tier || ' penalty of ' || v_penalty || ' points.'
        end,
        verified_at = now(),
        updated_by = v_user_id,
        competition_id = v_competition.id,
        review_cadence_days = 365,
        raw_strength_value = v_anchor.iffhs_points,
        raw_strength_scale = 'IFFHS 2025 national league points',
        benchmark_provider = case
          when v_tier = 1 then 'iffhs_2025'
          else 'djm_iffhs_tier_decay_v1'
        end,
        benchmark_metric = 'national_league_strength',
        methodology = case
          when v_tier = 1 then v_anchor.methodology
          else v_anchor.methodology
            || ' Lower division adjustment is model-derived and explicitly tier-based.'
        end,
        methodology_version = 'djm_global_league_strength_v1',
        source_reference = 'IFFHS rank ' || v_anchor.iffhs_rank || '; tier ' || v_tier,
        observed_at = v_anchor.observed_at,
        next_review_at = '2027-02-01T00:00:00Z'::timestamptz,
        updated_at = now()
    where id = v_benchmark_id;
  end if;

  return jsonb_build_object(
    'competitionId', v_competition.id,
    'benchmark', jsonb_build_object(
      'strength_score', v_strength,
      'tier', v_tier,
      'source', case
        when v_tier = 1 then 'IFFHS 2025'
        else 'IFFHS 2025 + DJM tier decay'
      end
    )
  );
end;
$function$;

revoke all on function public.djm_refresh_player_data_context(text, jsonb) from public;
revoke all on function public.djm_refresh_player_data_context(text, jsonb) from anon;
revoke all on function public.djm_refresh_player_data_context(text, jsonb) from authenticated;
grant execute on function public.djm_refresh_player_data_context(text, jsonb) to service_role;

create or replace function public.djm_upsert_pitchapi_player_snapshot(
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

revoke all on function public.djm_upsert_pitchapi_player_snapshot(jsonb) from public;
revoke all on function public.djm_upsert_pitchapi_player_snapshot(jsonb) from anon;
revoke all on function public.djm_upsert_pitchapi_player_snapshot(jsonb) from authenticated;
grant execute on function public.djm_upsert_pitchapi_player_snapshot(jsonb) to service_role;

create or replace function public.djm_upsert_pitchapi_performance_snapshot(
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

revoke all on function public.djm_upsert_pitchapi_performance_snapshot(jsonb) from public;
revoke all on function public.djm_upsert_pitchapi_performance_snapshot(jsonb) from anon;
revoke all on function public.djm_upsert_pitchapi_performance_snapshot(jsonb) from authenticated;
grant execute on function public.djm_upsert_pitchapi_performance_snapshot(jsonb) to service_role;

comment on function public.djm_refresh_player_data_context(text, jsonb) is
  'Service-role-only competition and benchmark context for the player-data refresh function.';

comment on function public.djm_upsert_pitchapi_player_snapshot(jsonb) is
  'Service-role-only upsert of a validated current PitchAPI player snapshot.';

comment on function public.djm_upsert_pitchapi_performance_snapshot(jsonb) is
  'Service-role-only upsert of a current PitchAPI peer performance snapshot.';

notify pgrst, 'reload schema';
