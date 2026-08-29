-- DJM Benchmark Acquisition V1
-- Additive follow-up to intelligence_data_layer_v1.
-- Do not rerun or modify the already-live intelligence_data_layer_v1 migration.

begin;

alter table djm_os.league_benchmarks
  add column if not exists raw_strength_value numeric,
  add column if not exists raw_strength_scale text,
  add column if not exists benchmark_provider text,
  add column if not exists benchmark_metric text,
  add column if not exists methodology text,
  add column if not exists methodology_version text,
  add column if not exists source_reference text,
  add column if not exists observed_at timestamptz,
  add column if not exists next_review_at timestamptz;

create index if not exists djm_os_league_benchmarks_next_review_idx
  on djm_os.league_benchmarks(next_review_at)
  where next_review_at is not null;

comment on column djm_os.league_benchmarks.raw_strength_value is
  'Raw provider or reviewed-source value before DJM rounds to the effective 0-100 strength_score.';
comment on column djm_os.league_benchmarks.benchmark_provider is
  'Named provider or reviewed source. A provider name is provenance, not permission to scrape it.';
comment on column djm_os.league_benchmarks.methodology is
  'Human-readable methodology for deriving the competition strength input.';

create or replace function public.djm_career_evidence_date(
  p_season_label text,
  p_start_date date,
  p_end_date date
) returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_label text := trim(coalesce(p_season_label, ''));
  v_match text[];
  v_start_year integer;
  v_end_year integer;
begin
  if p_end_date is not null then return p_end_date; end if;
  if p_start_date is not null then return p_start_date; end if;
  if v_label = '' then return null; end if;

  -- 2025/26, 2025-26, 2025/2026 or 2025-2026.
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

  -- 21/22 or 21-22. The 00-50 range is treated as 2000s.
  v_match := regexp_match(v_label, '^([0-9]{2})\s*[/\-]\s*([0-9]{2})$');
  if v_match is not null then
    v_start_year := case when v_match[1]::integer <= 50 then 2000 else 1900 end + v_match[1]::integer;
    v_end_year := (v_start_year / 100) * 100 + v_match[2]::integer;
    if v_end_year < v_start_year then v_end_year := v_end_year + 100; end if;
    return make_date(v_end_year, 6, 30);
  end if;

  -- Calendar-year competitions such as 2026.
  if v_label ~ '^(19|20)[0-9]{2}$' then
    return make_date(v_label::integer, 12, 31);
  end if;

  return null;
end;
$$;

create or replace function public.djm_player_score_competition_context(
  p_player_id uuid
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
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
$$;

create or replace function public.djm_player_scorecard(p_player_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.players%rowtype;
  b djm_os.league_benchmarks%rowtype;
  s djm_os.player_scorecards%rowtype;
  v_context jsonb;
  v_competition_id uuid;
  v_competition_name text;
  v_competition_country text;
  v_competition_basis text;
  v_minutes integer;
  v_appearances integer;
  v_playing_time_score integer;
  v_model smallint;
  v_potential smallint;
  v_confidence smallint := 0;
  v_status text := 'not_enough_playing_time_data';
  v_age integer;
  v_headroom integer := 0;
  v_basis jsonb;
  v_benchmark_freshness text := 'unknown';
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  select * into p from public.players where id = p_player_id;
  if not found then raise exception 'Player not found'; end if;

  select sum(c.minutes)::int, sum(c.appearances)::int
  into v_minutes, v_appearances
  from public.career_entries c
  where c.player_id = p_player_id
    and c.source_reviewed_at is not null
    and public.djm_career_evidence_date(c.season_label, c.start_date, c.end_date) >= current_date - interval '24 months';

  v_context := public.djm_player_score_competition_context(p_player_id);
  v_competition_id := nullif(v_context->>'competition_id', '')::uuid;
  v_competition_name := nullif(v_context->>'competition_name', '');
  v_competition_country := nullif(v_context->>'country', '');
  v_competition_basis := coalesce(v_context->>'basis', 'unresolved');

  select lb.* into b
  from djm_os.league_benchmarks lb
  left join djm_os.competitions c on c.id = lb.competition_id
  where lb.verified_at is not null
    and (
      (v_competition_id is not null and lb.competition_id = v_competition_id)
      or (
        v_competition_name is not null
        and lower(lb.league_name) = lower(v_competition_name)
        and (lb.country is null or v_competition_country is null or lower(lb.country) = lower(v_competition_country))
      )
      or (
        v_competition_name is not null
        and (
          lower(c.display_name) = lower(v_competition_name)
          or exists (
            select 1 from unnest(c.aliases) alias_name
            where lower(alias_name) = lower(v_competition_name)
          )
        )
        and (c.country is null or v_competition_country is null or lower(c.country) = lower(v_competition_country))
      )
    )
  order by
    (v_competition_id is not null and lb.competition_id = v_competition_id) desc,
    lb.verified_at desc
  limit 1;

  if b.id is not null then
    v_benchmark_freshness := case
      when coalesce(b.next_review_at, b.verified_at + interval '90 days') < now() then 'stale'
      when now() > b.verified_at + interval '30 days' then 'aging'
      else 'fresh'
    end;
  end if;

  if p.date_of_birth is not null then
    v_age := date_part('year', age(current_date, p.date_of_birth))::int;
  end if;

  if v_minutes is not null then
    v_playing_time_score := least(100, round(v_minutes::numeric / 2500 * 100))::int;
  end if;

  if v_minutes is null or v_minutes < 500 then
    v_status := 'not_enough_playing_time_data';
  elsif v_competition_name is null then
    v_status := 'competition_evidence_required';
  elsif b.id is null then
    v_status := 'benchmark_required';
  else
    v_model := least(100, greatest(0, round(b.strength_score * .75 + v_playing_time_score * .25)))::smallint;
    v_status := 'calculated';
    if v_age is not null then
      v_headroom := case when v_age <= 19 then 12 when v_age <= 21 then 9 when v_age <= 23 then 6 when v_age <= 25 then 3 else 0 end;
      v_potential := least(100, v_model + v_headroom)::smallint;
    end if;
  end if;

  v_confidence := least(100, round(
    (case when v_minutes is null then 0 when v_minutes >= 500 then 45 else v_minutes::numeric / 500 * 45 end)
    + (case when v_competition_name is not null then 15 else 0 end)
    + (case when b.id is not null then 30 else 0 end)
    + (case when p.verification_status = 'verified' then 10 else 0 end)
  ))::smallint;

  v_basis := jsonb_build_object(
    'model', 'DJM Player Score v1',
    'status', v_status,
    'recent_minutes_24m', v_minutes,
    'recent_appearances_24m', v_appearances,
    'competition_id', v_competition_id,
    'competition_name', v_competition_name,
    'competition_country', v_competition_country,
    'competition_basis', v_competition_basis,
    'competition_is_current', coalesce((v_context->>'is_current')::boolean, false),
    'competition_career_entry_id', nullif(v_context->>'career_entry_id',''),
    'competition_career_club', nullif(v_context->>'career_club',''),
    'competition_season_label', nullif(v_context->>'season_label',''),
    'competition_evidence_date', nullif(v_context->>'evidence_date',''),
    'current_club', p.current_club,
    'current_league', p.current_league,
    'current_country', p.current_country,
    'league_strength_score', b.strength_score,
    'league_benchmark_raw_strength_value', b.raw_strength_value,
    'league_benchmark_raw_strength_scale', b.raw_strength_scale,
    'league_benchmark_provider', b.benchmark_provider,
    'league_benchmark_metric', b.benchmark_metric,
    'league_benchmark_methodology', b.methodology,
    'league_benchmark_methodology_version', b.methodology_version,
    'league_benchmark_source_url', b.source_url,
    'league_benchmark_source_reference', b.source_reference,
    'league_benchmark_observed_at', b.observed_at,
    'league_benchmark_verified_at', b.verified_at,
    'league_benchmark_next_review_at', b.next_review_at,
    'league_benchmark_freshness', v_benchmark_freshness,
    'recommended_benchmark_source', case when b.id is null and v_competition_name is not null then 'Opta Power Rankings / Stats Perform league average' else null end,
    'benchmark_acquisition_mode', case when b.id is null and v_competition_name is not null then 'licensed_or_reviewed_import' else null end,
    'benchmark_reference_url', case when b.id is null and v_competition_name is not null then 'https://theanalyst.com/articles/strongest-football-leagues-in-the-world-opta-power-rankings' else null end,
    'playing_time_score', v_playing_time_score,
    'age', v_age,
    'potential_headroom', v_headroom,
    'evidence_window_months', 24,
    'rules', jsonb_build_array(
      'Minimum 500 verified senior minutes in the previous 24 months',
      'Missing career dates use a parseable season label; source review time never makes old minutes recent',
      'Current competition is preferred; an unattached player may use the most recent verified senior competition inside the evidence window',
      'Competition strength requires a verified benchmark and is never invented',
      'Current score is 75% competition benchmark and 25% playing-time signal',
      'Potential remains separate from current score'
    ),
    'calculated_at', now()
  );

  insert into djm_os.player_scorecards(
    player_id, model_score, potential_model_score, score_status, confidence,
    basis, model_version, calculated_at, stale_at, stale_reason,
    evidence_freshness, updated_by
  ) values (
    p_player_id, v_model, v_potential, v_status, v_confidence,
    v_basis, 'djm_player_score_v1', now(), null, null,
    case when v_status = 'calculated' and v_benchmark_freshness = 'fresh' then 'fresh'
         when v_status = 'calculated' then v_benchmark_freshness
         else 'unknown' end,
    auth.uid()
  )
  on conflict (player_id) do update set
    model_score = excluded.model_score,
    potential_model_score = excluded.potential_model_score,
    score_status = excluded.score_status,
    confidence = excluded.confidence,
    basis = excluded.basis,
    model_version = excluded.model_version,
    calculated_at = excluded.calculated_at,
    stale_at = null,
    stale_reason = null,
    evidence_freshness = excluded.evidence_freshness,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into s;

  insert into djm_os.events(
    event_type, actor_user_id, player_id, payload, source, confidence, occurred_at
  ) values (
    case when v_status = 'benchmark_required' then 'PLAYER_SCORE_BENCHMARK_REQUIRED'
         when v_status = 'competition_evidence_required' then 'PLAYER_SCORE_COMPETITION_REQUIRED'
         else 'PLAYER_SCORE_CALCULATED' end,
    auth.uid(), p_player_id,
    jsonb_build_object(
      'status', v_status,
      'model_score', v_model,
      'model_version', 'djm_player_score_v1',
      'competition_name', v_competition_name,
      'competition_basis', v_competition_basis,
      'benchmark_id', b.id
    ),
    'deterministic_model', v_confidence::numeric / 100, now()
  );

  return jsonb_build_object(
    'player_id', p_player_id,
    'score', coalesce(s.manual_score, s.model_score),
    'model_score', s.model_score,
    'manual_score', s.manual_score,
    'potential_score', coalesce(s.manual_potential_score, s.potential_model_score),
    'potential_model_score', s.potential_model_score,
    'manual_potential_score', s.manual_potential_score,
    'source', case when s.manual_score is not null then 'manual_override' when s.model_score is not null then 'model' else 'insufficient_data' end,
    'status', case when s.manual_score is not null then 'manual_override' else s.score_status end,
    'model_status', s.score_status,
    'confidence', s.confidence,
    'override_reason', s.override_reason,
    'basis', s.basis,
    'model_version', s.model_version,
    'calculated_at', s.calculated_at
  );
end;
$$;

create or replace function public.djm_intelligence_benchmark_upsert(
  p_id uuid default null,
  p_competition_id uuid default null,
  p_display_name text default null,
  p_country text default null,
  p_gender text default null,
  p_level_tier smallint default null,
  p_aliases text[] default '{}'::text[],
  p_provider_ids jsonb default '{}'::jsonb,
  p_strength_score smallint default null,
  p_source_url text default null,
  p_source_note text default null,
  p_verified_at timestamptz default now(),
  p_review_cadence_days integer default 365
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_competition_id uuid := p_competition_id;
  v_benchmark_id uuid;
  v_key text;
  v_event text;
  v_target_id uuid := p_id;
  v_existing boolean := false;
  v_player_id uuid;
  v_recalculated integer := 0;
  v_cadence integer;
  v_source_text text;
  v_is_opta boolean;
  v_provider text;
  v_metric text;
  v_methodology text;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if nullif(trim(coalesce(p_display_name,'')),'') is null then raise exception 'Competition name is required'; end if;
  if p_strength_score is null or p_strength_score < 0 or p_strength_score > 100 then raise exception 'Strength score must be between 0 and 100'; end if;
  if nullif(trim(coalesce(p_source_url,'')),'') is null and nullif(trim(coalesce(p_source_note,'')),'') is null then
    raise exception 'Add a benchmark source URL or evidence note';
  end if;
  if p_verified_at is null then raise exception 'Verification date is required'; end if;
  if p_review_cadence_days < 30 or p_review_cadence_days > 1095 then raise exception 'Review cadence must be between 30 and 1095 days'; end if;

  v_source_text := lower(coalesce(p_source_url,'') || ' ' || coalesce(p_source_note,''));
  v_is_opta := v_source_text ~ '(theanalyst\.com|statsperform|opta)';
  v_cadence := case when v_is_opta then least(p_review_cadence_days, 90) else p_review_cadence_days end;
  v_provider := case when v_is_opta then 'Opta / Stats Perform reviewed source' else 'DJM reviewed source' end;
  v_metric := case when v_is_opta then 'league_average_power_rating' else 'competition_strength_0_100' end;
  v_methodology := case when v_is_opta
    then 'Reviewed league-average competition strength on the provider 0-100 scale. Use the mean across active clubs, not only the strongest teams.'
    else 'DJM reviewed competition-strength evidence on a documented 0-100 scale.' end;

  v_key := lower(regexp_replace(trim(coalesce(p_country,'') || '|' || p_display_name), '\s+', ' ', 'g'));
  if v_competition_id is null then
    insert into djm_os.competitions(
      canonical_key, display_name, country, gender, level_tier,
      aliases, provider_ids, created_by, updated_by
    ) values (
      v_key, trim(p_display_name), nullif(trim(coalesce(p_country,'')),''),
      nullif(trim(coalesce(p_gender,'')),''), p_level_tier,
      coalesce(p_aliases,'{}'::text[]), coalesce(p_provider_ids,'{}'::jsonb), auth.uid(), auth.uid()
    )
    on conflict (canonical_key) do update set
      display_name = excluded.display_name,
      country = excluded.country,
      gender = excluded.gender,
      level_tier = excluded.level_tier,
      aliases = excluded.aliases,
      provider_ids = excluded.provider_ids,
      updated_by = auth.uid(),
      updated_at = now()
    returning id into v_competition_id;
  else
    update djm_os.competitions set
      display_name = trim(p_display_name),
      country = nullif(trim(coalesce(p_country,'')),''),
      gender = nullif(trim(coalesce(p_gender,'')),''),
      level_tier = p_level_tier,
      aliases = coalesce(p_aliases,'{}'::text[]),
      provider_ids = coalesce(p_provider_ids,'{}'::jsonb),
      updated_by = auth.uid(),
      updated_at = now()
    where id = v_competition_id;
    select canonical_key into v_key from djm_os.competitions where id = v_competition_id;
  end if;

  if v_target_id is null then
    select id into v_target_id
    from djm_os.league_benchmarks
    where competition_id = v_competition_id or canonical_key = v_key
    order by (competition_id = v_competition_id) desc
    limit 1;
  end if;
  v_existing := v_target_id is not null;
  v_event := case when v_existing then 'BENCHMARK_CHANGED' else 'BENCHMARK_CREATED' end;

  insert into djm_os.league_benchmarks(
    id, competition_id, canonical_key, league_name, country, strength_score,
    raw_strength_value, raw_strength_scale, benchmark_provider, benchmark_metric,
    methodology, methodology_version, source_reference,
    source_url, source_note, observed_at, verified_at, next_review_at,
    review_cadence_days, stale_at, stale_reason, updated_by
  ) values (
    coalesce(v_target_id, gen_random_uuid()), v_competition_id, v_key,
    trim(p_display_name), nullif(trim(coalesce(p_country,'')),''), p_strength_score,
    p_strength_score::numeric, '0-100', v_provider, v_metric,
    v_methodology, case when v_is_opta then 'opta_league_average_v1' else 'djm_reviewed_strength_v1' end,
    trim(p_display_name),
    nullif(trim(coalesce(p_source_url,'')),''), nullif(trim(coalesce(p_source_note,'')),''),
    p_verified_at, p_verified_at, p_verified_at + make_interval(days => v_cadence),
    v_cadence, null, null, auth.uid()
  )
  on conflict (id) do update set
    competition_id = excluded.competition_id,
    canonical_key = excluded.canonical_key,
    league_name = excluded.league_name,
    country = excluded.country,
    strength_score = excluded.strength_score,
    raw_strength_value = excluded.raw_strength_value,
    raw_strength_scale = excluded.raw_strength_scale,
    benchmark_provider = excluded.benchmark_provider,
    benchmark_metric = excluded.benchmark_metric,
    methodology = excluded.methodology,
    methodology_version = excluded.methodology_version,
    source_reference = excluded.source_reference,
    source_url = excluded.source_url,
    source_note = excluded.source_note,
    observed_at = excluded.observed_at,
    verified_at = excluded.verified_at,
    next_review_at = excluded.next_review_at,
    review_cadence_days = excluded.review_cadence_days,
    stale_at = null,
    stale_reason = null,
    updated_by = auth.uid(),
    updated_at = now()
  returning id into v_benchmark_id;

  for v_player_id in
    select p.id
    from public.players p
    cross join lateral public.djm_player_score_competition_context(p.id) context
    where (nullif(context->>'competition_id','') is not null and (context->>'competition_id')::uuid = v_competition_id)
       or lower(coalesce(context->>'competition_name','')) = lower(trim(p_display_name))
  loop
    perform public.djm_player_scorecard(v_player_id);
    v_recalculated := v_recalculated + 1;
  end loop;

  insert into djm_os.events(event_type, actor_user_id, payload, source, confidence, occurred_at)
  values(v_event, auth.uid(), jsonb_build_object(
    'benchmark_id', v_benchmark_id,
    'competition_id', v_competition_id,
    'strength_score', p_strength_score,
    'benchmark_provider', v_provider,
    'benchmark_metric', v_metric,
    'methodology_version', case when v_is_opta then 'opta_league_average_v1' else 'djm_reviewed_strength_v1' end,
    'verified_at', p_verified_at,
    'next_review_at', p_verified_at + make_interval(days => v_cadence),
    'player_scores_recalculated', v_recalculated
  ), 'manual_ui', 1, now());

  return jsonb_build_object(
    'id', v_benchmark_id,
    'competition_id', v_competition_id,
    'canonical_key', v_key,
    'benchmark_provider', v_provider,
    'benchmark_metric', v_metric,
    'next_review_at', p_verified_at + make_interval(days => v_cadence),
    'player_scores_recalculated', v_recalculated
  );
end;
$$;

create or replace function public.djm_intelligence_benchmark_import(
  p_source_name text,
  p_source_url text,
  p_observed_at timestamptz,
  p_records jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_record jsonb;
  v_name text;
  v_country text;
  v_note text;
  v_raw numeric;
  v_effective smallint;
  v_aliases text[];
  v_tier smallint;
  v_result jsonb;
  v_id uuid;
  v_competition_id uuid;
  v_player_id uuid;
  v_count integer := 0;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if nullif(trim(coalesce(p_source_name,'')),'') is null then raise exception 'Source name is required'; end if;
  if nullif(trim(coalesce(p_source_url,'')),'') is null then raise exception 'Source URL is required'; end if;
  if p_observed_at is null then raise exception 'Observed date is required'; end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then raise exception 'Add at least one benchmark record'; end if;

  for v_record in select value from jsonb_array_elements(p_records)
  loop
    v_name := nullif(trim(coalesce(v_record->>'competition', v_record->>'display_name', v_record->>'league_name', '')), '');
    v_country := nullif(trim(coalesce(v_record->>'country','')), '');
    v_note := nullif(trim(coalesce(v_record->>'note', v_record->>'source_note', '')), '');
    if v_name is null then raise exception 'Every benchmark row requires a competition name'; end if;

    begin
      v_raw := coalesce(nullif(v_record->>'raw_strength_value','')::numeric, nullif(v_record->>'strength_score','')::numeric);
    exception when invalid_text_representation then
      raise exception 'Benchmark value for % is not numeric', v_name;
    end;
    if v_raw is null or v_raw < 0 or v_raw > 100 then raise exception 'Benchmark value for % must be between 0 and 100', v_name; end if;
    v_effective := round(v_raw)::smallint;

    if jsonb_typeof(v_record->'aliases') = 'array' then
      select coalesce(array_agg(trim(value)), '{}'::text[]) into v_aliases
      from jsonb_array_elements_text(v_record->'aliases') value
      where trim(value) <> '';
    else
      v_aliases := array(
        select trim(value)
        from unnest(string_to_array(coalesce(v_record->>'aliases',''), ',')) value
        where trim(value) <> ''
      );
    end if;

    begin
      v_tier := nullif(v_record->>'level_tier','')::smallint;
    exception when invalid_text_representation then
      v_tier := null;
    end;

    v_result := public.djm_intelligence_benchmark_upsert(
      null,
      null,
      v_name,
      v_country,
      coalesce(nullif(v_record->>'gender',''), 'male'),
      v_tier,
      coalesce(v_aliases, '{}'::text[]),
      '{}'::jsonb,
      v_effective,
      p_source_url,
      concat_ws(' | ', nullif(trim(p_source_name),''), v_note),
      p_observed_at,
      90
    );

    v_id := (v_result->>'id')::uuid;
    v_competition_id := (v_result->>'competition_id')::uuid;
    update djm_os.league_benchmarks
    set raw_strength_value = v_raw,
        raw_strength_scale = '0-100',
        benchmark_provider = case when lower(p_source_name || ' ' || p_source_url) ~ '(opta|stats perform|theanalyst\.com)'
          then 'Opta / Stats Perform reviewed source' else trim(p_source_name) end,
        benchmark_metric = case when lower(p_source_name || ' ' || p_source_url) ~ '(opta|stats perform|theanalyst\.com)'
          then 'league_average_power_rating' else 'competition_strength_0_100' end,
        methodology = case when lower(p_source_name || ' ' || p_source_url) ~ '(opta|stats perform|theanalyst\.com)'
          then 'Reviewed league-average competition strength on the provider 0-100 scale. Mean across active clubs, not top-five or top-ten average.'
          else coalesce(v_note, 'Reviewed competition-strength evidence on a documented 0-100 scale.') end,
        methodology_version = case when lower(p_source_name || ' ' || p_source_url) ~ '(opta|stats perform|theanalyst\.com)'
          then 'opta_league_average_v1' else 'djm_reviewed_strength_v1' end,
        source_reference = v_name,
        observed_at = p_observed_at,
        next_review_at = p_observed_at + interval '90 days',
        review_cadence_days = least(review_cadence_days, 90),
        updated_at = now()
    where id = v_id;

    -- Recalculate once more after the exact raw decimal and methodology snapshot are stored.
    for v_player_id in
      select p.id
      from public.players p
      cross join lateral public.djm_player_score_competition_context(p.id) context
      where (nullif(context->>'competition_id','') is not null and (context->>'competition_id')::uuid = v_competition_id)
         or lower(coalesce(context->>'competition_name','')) = lower(v_name)
    loop
      perform public.djm_player_scorecard(v_player_id);
    end loop;

    v_count := v_count + 1;
  end loop;

  insert into djm_os.events(event_type, actor_user_id, payload, source, confidence, occurred_at)
  values(
    'BENCHMARK_IMPORT_COMPLETED', auth.uid(),
    jsonb_build_object(
      'source_name', trim(p_source_name),
      'source_url', trim(p_source_url),
      'observed_at', p_observed_at,
      'records', v_count
    ),
    'reviewed_import', 1, now()
  );

  return jsonb_build_object('imported', v_count, 'source_name', trim(p_source_name), 'observed_at', p_observed_at);
end;
$$;

create or replace function public.djm_intelligence_data()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with verified_minutes as (
    select ce.player_id,
      sum(ce.minutes)::integer as minutes_24m,
      max(public.djm_career_evidence_date(ce.season_label, ce.start_date, ce.end_date)) as latest_playing_date,
      max(ce.source_reviewed_at) as latest_verified_at
    from public.career_entries ce
    where ce.source_reviewed_at is not null
      and public.djm_career_evidence_date(ce.season_label, ce.start_date, ce.end_date) >= current_date - interval '24 months'
    group by ce.player_id
  ), player_state as (
    select p.id,
      trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) as player_name,
      p.current_club, p.current_league, p.current_country, p.current_competition_id,
      p.transfermarkt_url, p.wyscout_url, p.stats_url, p.updated_at,
      (select coalesce(jsonb_agg(to_jsonb(ce) order by ce.sort_order, ce.start_date desc nulls last), '[]'::jsonb)
       from public.career_entries ce where ce.player_id = p.id) as career_entries,
      vm.minutes_24m, vm.latest_playing_date, vm.latest_verified_at,
      public.djm_player_score_competition_context(p.id) as competition_context,
      ps.model_score, ps.manual_score, ps.score_status, ps.confidence,
      ps.basis, ps.model_version, ps.calculated_at, ps.stale_at, ps.stale_reason, ps.override_reason
    from public.players p
    left join verified_minutes vm on vm.player_id = p.id
    left join djm_os.player_scorecards ps on ps.player_id = p.id
  ), player_with_benchmark as (
    select p.*,
      lb.id as benchmark_id,
      lb.strength_score,
      lb.verified_at as benchmark_verified_at,
      lb.benchmark_provider,
      lb.next_review_at
    from player_state p
    left join lateral (
      select b.*
      from djm_os.league_benchmarks b
      left join djm_os.competitions c on c.id = b.competition_id
      where b.verified_at is not null and (
        (nullif(p.competition_context->>'competition_id','') is not null and b.competition_id = (p.competition_context->>'competition_id')::uuid)
        or (
          nullif(p.competition_context->>'competition_name','') is not null
          and lower(b.league_name) = lower(p.competition_context->>'competition_name')
          and (b.country is null or nullif(p.competition_context->>'country','') is null or lower(b.country) = lower(p.competition_context->>'country'))
        )
        or (
          nullif(p.competition_context->>'competition_name','') is not null
          and (
            lower(c.display_name) = lower(p.competition_context->>'competition_name')
            or exists (select 1 from unnest(c.aliases) alias_name where lower(alias_name) = lower(p.competition_context->>'competition_name'))
          )
          and (c.country is null or nullif(p.competition_context->>'country','') is null or lower(c.country) = lower(p.competition_context->>'country'))
        )
      )
      order by (nullif(p.competition_context->>'competition_id','') is not null and b.competition_id = (p.competition_context->>'competition_id')::uuid) desc,
        b.verified_at desc
      limit 1
    ) lb on true
  ), gaps as (
    select 100 as priority, psu.player_id, p.player_name,
      'Incoming source suggestion awaiting review'::text as missing,
      'External evidence cannot become DJM truth before review.'::text as why,
      'Verified career evidence and downstream intelligence'::text as blocks,
      'Review the incoming evidence'::text as action,
      null::text as competition_name,
      null::text as recommended_source
    from public.player_source_suggestions psu join player_with_benchmark p on p.id = psu.player_id
    where psu.decision in ('pending','review_later')
    union all
    select 95, p.id, p.player_name, 'Competition evidence required',
      'The player has enough recent verified minutes, but DJM cannot resolve a current or recent verified senior competition.',
      'Player Score and competition-level comparisons', 'Verify recent competition evidence',
      null, null
    from player_with_benchmark p
    where p.minutes_24m >= 500 and nullif(p.competition_context->>'competition_name','') is null
    union all
    select 92, p.id, p.player_name,
      'Benchmark required: ' || (p.competition_context->>'competition_name'),
      'The player has enough recent verified minutes and a resolvable competition. The competition benchmark is the only missing model input.',
      'Player Score', 'Resolve benchmark',
      p.competition_context->>'competition_name', 'Opta Power Rankings / Stats Perform league average'
    from player_with_benchmark p
    where p.minutes_24m >= 500
      and nullif(p.competition_context->>'competition_name','') is not null
      and p.benchmark_id is null
    union all
    select 85, p.id, p.player_name, coalesce(p.stale_reason,'Player Score needs recalculation'),
      'Evidence changed after the last model calculation.', 'Current Player Score', 'Recalculate the Player Score',
      p.competition_context->>'competition_name', null
    from player_with_benchmark p where p.score_status = 'needs_recalculation' or p.stale_at is not null
    union all
    select 70, p.id, p.player_name, 'Not enough verified recent playing-time data',
      'Fewer than 500 verified senior minutes with defensible playing dates are recorded in the previous 24 months.',
      'Player Score', 'Import or verify recent season evidence',
      p.competition_context->>'competition_name', null
    from player_with_benchmark p where p.minutes_24m is null or p.minutes_24m < 500
    union all
    select 55, p.id, p.player_name, 'No football source links',
      'Staff has no direct route to supporting external evidence.',
      'Faster verification', 'Add a Wyscout, Transfermarkt or statistics reference',
      p.competition_context->>'competition_name', null
    from player_with_benchmark p where p.transfermarkt_url is null and p.wyscout_url is null and p.stats_url is null
  )
  select case when not djm_os.is_team_member() then
    jsonb_build_object('error','DJM team access required')
  else jsonb_build_object(
    'metrics', jsonb_build_object(
      'players', (select count(*) from player_with_benchmark),
      'players_with_source_links', (select count(*) from player_with_benchmark where transfermarkt_url is not null or wyscout_url is not null or stats_url is not null),
      'players_with_verified_career', (select count(*) from player_with_benchmark where latest_verified_at is not null),
      'players_eligible_for_score', (select count(*) from player_with_benchmark where minutes_24m >= 500 and benchmark_id is not null),
      'blocked_missing_benchmark', (select count(*) from player_with_benchmark where minutes_24m >= 500 and nullif(competition_context->>'competition_name','') is not null and benchmark_id is null),
      'blocked_competition_evidence', (select count(*) from player_with_benchmark where minutes_24m >= 500 and nullif(competition_context->>'competition_name','') is null),
      'blocked_insufficient_minutes', (select count(*) from player_with_benchmark where minutes_24m is null or minutes_24m < 500),
      'stale_scores', (select count(*) from player_with_benchmark where score_status = 'needs_recalculation' or stale_at is not null),
      'unresolved_suggestions', (select count(*) from public.player_source_suggestions where decision in ('pending','review_later')),
      'competitions_without_benchmark', (select count(*) from djm_os.competitions c where c.active and not exists(select 1 from djm_os.league_benchmarks lb where lb.competition_id = c.id and lb.verified_at is not null)),
      'benchmarks_due_review', (select count(*) from djm_os.league_benchmarks where coalesce(next_review_at, verified_at + interval '90 days') < now()),
      'recent_ingestion_failures', (select count(*) from public.player_source_refreshes where status = 'failed' and requested_at >= now() - interval '30 days')
    ),
    'players', coalesce((select jsonb_agg(to_jsonb(p) order by p.player_name) from player_with_benchmark p), '[]'::jsonb),
    'benchmarks', coalesce((select jsonb_agg(to_jsonb(x) order by x.league_name) from (
      select lb.*, c.display_name, c.gender, c.level_tier, c.aliases, c.provider_ids,
        tm.display_name as updated_by_name,
        case when lb.verified_at is null then 'unknown'
             when coalesce(lb.next_review_at, lb.verified_at + interval '90 days') < now() then 'stale'
             when lb.verified_at + interval '30 days' < now() then 'aging'
             else 'fresh' end as freshness
      from djm_os.league_benchmarks lb
      left join djm_os.competitions c on c.id = lb.competition_id
      left join djm_os.team_members tm on tm.user_id = lb.updated_by
    ) x), '[]'::jsonb),
    'competitions', coalesce((select jsonb_agg(to_jsonb(c) order by c.display_name) from djm_os.competitions c), '[]'::jsonb),
    'gaps', coalesce((select jsonb_agg(to_jsonb(g) order by g.priority desc, g.player_name) from (select * from gaps limit 100) g), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r.requested_at desc) from (
      select pr.*, trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) as player_name
      from public.player_source_refreshes pr join public.players p on p.id = pr.player_id
      order by pr.requested_at desc limit 50
    ) r), '[]'::jsonb),
    'suggestions', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from (
      select ps.*, trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) as player_name,
        pe.source_name, pe.source_url, pe.observed_at as evidence_observed_at, pe.freshness_state
      from public.player_source_suggestions ps
      join public.players p on p.id = ps.player_id
      left join djm_os.player_evidence pe on pe.id = ps.evidence_id
      where ps.decision in ('pending','review_later')
      order by ps.created_at desc limit 100
    ) s), '[]'::jsonb)
  ) end;
$$;

revoke all on function public.djm_career_evidence_date(text,date,date) from public, anon;
revoke all on function public.djm_player_score_competition_context(uuid) from public, anon;
revoke all on function public.djm_intelligence_benchmark_import(text,text,timestamptz,jsonb) from public, anon;

grant execute on function public.djm_career_evidence_date(text,date,date) to authenticated, service_role;
grant execute on function public.djm_player_score_competition_context(uuid) to authenticated, service_role;
grant execute on function public.djm_intelligence_benchmark_import(text,text,timestamptz,jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
