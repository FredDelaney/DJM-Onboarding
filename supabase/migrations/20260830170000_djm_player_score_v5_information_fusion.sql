begin;

-- DJM Player Score V5: Information Fusion
--
-- Purpose
--   Make the score materially harder to fool when player data is incomplete,
--   unevenly sourced or old, while keeping the model auditable and useful.
--
-- Core principles
--   * Missing evidence is unknown, never average.
--   * The same evidence dimensions underpin Full and Provisional scores.
--   * Evidence quality changes how much a component is allowed to influence the score.
--   * Context-only estimates are pulled harder towards the neutral prior of 50.
--   * Incomplete career history must not be interpreted as poor experience.
--   * Current-season evidence uses the latest reviewed/synchronised as-of date where safe.
--   * Recency decays continuously rather than in stepwise cliffs.
--   * Confidence means evidence strength, not probability of sporting success.
--   * The displayed evidence band is a heuristic uncertainty band, not a statistical CI.
--   * Every calculation stores a compact input fingerprint for auditability.
--   * Changes to score-driving evidence immediately mark the score stale.
--
-- This migration is self-contained with respect to V5. It deliberately relies only on
-- the canonical V2 core and long-lived score helpers already present in the project,
-- not on the uncommitted runtime V4 evidence-fusion helpers discovered in production.

-- -----------------------------------------------------------------------------
-- 0. Preflight: fail loudly rather than silently changing model semantics.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.djm_player_scorecard_v2_core(uuid)') is null then
    raise exception 'DJM Player Score V5 requires public.djm_player_scorecard_v2_core(uuid)';
  end if;
  if to_regprocedure('private.djm_position_group(text)') is null then
    raise exception 'DJM Player Score V5 requires private.djm_position_group(text)';
  end if;
  if to_regprocedure('private.djm_position_performance_score(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric)') is null then
    raise exception 'DJM Player Score V5 requires private.djm_position_performance_score(...)';
  end if;
  if to_regprocedure('public.djm_career_evidence_date(text,date,date)') is null then
    raise exception 'DJM Player Score V5 requires public.djm_career_evidence_date(text,date,date)';
  end if;
end
$$;

-- Preserve the environment-specific pre-V5 public scorer for rollback and forensic
-- comparison. Production currently contains a runtime V4 implementation that is not
-- represented in GitHub. A clean migration replay may instead preserve the repo V4.
do $$
begin
  if to_regprocedure('public.djm_player_scorecard_v4_runtime_core(uuid)') is null
     and to_regprocedure('public.djm_player_scorecard(uuid)') is not null then
    alter function public.djm_player_scorecard(uuid)
      rename to djm_player_scorecard_v4_runtime_core;
  end if;
end
$$;

-- Do not expose the preserved runtime core through the client API.
revoke all on function public.djm_player_scorecard_v4_runtime_core(uuid)
  from public, anon, authenticated;
grant execute on function public.djm_player_scorecard_v4_runtime_core(uuid)
  to service_role;

-- -----------------------------------------------------------------------------
-- 1. Deterministic V5 evidence helpers.
-- -----------------------------------------------------------------------------

create or replace function private.djm_v5_recency_weight(
  p_evidence_date date,
  p_as_of date
)
returns numeric
language sql
immutable
set search_path=''
as $$
  select case
    when p_evidence_date is null or p_as_of is null then 0::numeric
    when p_evidence_date > p_as_of + 1 then 0::numeric
    when p_as_of - p_evidence_date > 730 then 0::numeric
    else least(
      1::numeric,
      greatest(
        0::numeric,
        exp(-ln(2::numeric) * greatest(0, p_as_of - p_evidence_date) / 365.0)
      )
    )
  end;
$$;

comment on function private.djm_v5_recency_weight(date,date) is
  'Continuous current-level recency weight. Half-life 365 days, hard horizon 730 days.';

create or replace function private.djm_v5_career_evidence_date(
  p_club_name text,
  p_current_club text,
  p_season_label text,
  p_start_date date,
  p_end_date date,
  p_source_reviewed_at timestamptz,
  p_source_synced_at timestamptz,
  p_as_of date
)
returns date
language plpgsql
immutable
set search_path=''
as $$
declare
  v_source_date date;
  v_fallback date;
  v_same_current_club boolean := false;
begin
  if p_as_of is null then return null; end if;

  v_same_current_club :=
    nullif(trim(coalesce(p_club_name,'')),'') is not null
    and nullif(trim(coalesce(p_current_club,'')),'') is not null
    and lower(trim(p_club_name)) = lower(trim(p_current_club));

  v_source_date := greatest(
    case
      when p_source_reviewed_at is not null
       and p_source_reviewed_at::date <= p_as_of + 1
      then p_source_reviewed_at::date
    end,
    case
      when p_source_synced_at is not null
       and p_source_synced_at::date <= p_as_of + 1
      then p_source_synced_at::date
    end
  );

  -- For the current club and an open or future-ended stint, reviewed/synchronised
  -- statistics are observations as of the source date. Using the stint start date
  -- here would make live-season evidence become artificially old during the season.
  if v_same_current_club
     and (p_end_date is null or p_end_date >= p_as_of)
     and v_source_date is not null
     and (p_start_date is null or v_source_date >= p_start_date)
  then
    return least(v_source_date, p_as_of);
  end if;

  if p_end_date is not null and p_end_date <= p_as_of then
    return p_end_date;
  end if;

  v_fallback := public.djm_career_evidence_date(
    p_season_label,
    p_start_date,
    case when p_end_date is not null and p_end_date <= p_as_of then p_end_date else null end
  );

  if v_fallback is null or v_fallback > p_as_of + 1 then
    return null;
  end if;

  return v_fallback;
end;
$$;

comment on function private.djm_v5_career_evidence_date(text,text,text,date,date,timestamptz,timestamptz,date) is
  'V5 evidence-as-of resolver. Current-club live-season rows may use reviewed/synchronised source dates; historical rows remain historically dated.';

create or replace function private.djm_v5_role_score(
  p_effective_minutes numeric,
  p_effective_appearances numeric,
  p_effective_starts numeric,
  p_starts_known boolean
)
returns numeric
language plpgsql
immutable
set search_path=''
as $$
declare
  v_minutes numeric;
  v_starter numeric;
begin
  if coalesce(p_effective_minutes,0) <= 0 then return null; end if;

  v_minutes := 100 * (
    1 - exp(-least(greatest(p_effective_minutes,0),4000) / 1500.0)
  );

  if p_starts_known and coalesce(p_effective_appearances,0) > 0 then
    v_starter := least(
      100::numeric,
      greatest(0::numeric, p_effective_starts / p_effective_appearances * 100)
    );
    return least(100::numeric, greatest(0::numeric, v_minutes * .82 + v_starter * .18));
  end if;

  return least(100::numeric, greatest(0::numeric, v_minutes));
end;
$$;

create or replace function private.djm_v5_role_quality(
  p_effective_minutes numeric,
  p_effective_appearances numeric
)
returns numeric
language sql
immutable
set search_path=''
as $$
  select case
    when coalesce(p_effective_minutes,0) <= 0 then 0::numeric
    else least(
      1::numeric,
      greatest(
        0::numeric,
        sqrt(
          (1 - exp(-greatest(p_effective_minutes,0) / 900.0))
          * (1 - exp(-greatest(coalesce(p_effective_appearances,0),0) / 8.0))
        )
      )
    )
  end;
$$;

create or replace function private.djm_v5_snapshot_quality(
  p_minutes numeric,
  p_source_confidence numeric
)
returns numeric
language sql
immutable
set search_path=''
as $$
  select least(
    1::numeric,
    greatest(
      0::numeric,
      (1 - exp(-least(greatest(coalesce(p_minutes,0),0),2700) / 900.0))
      * greatest(.35::numeric, least(1::numeric, coalesce(p_source_confidence,.60)))
    )
  );
$$;

create or replace function private.djm_v5_benchmark_quality(
  p_provider text,
  p_freshness text
)
returns numeric
language plpgsql
immutable
set search_path=''
as $$
declare
  v_provider numeric;
  v_freshness numeric;
begin
  v_provider := case lower(coalesce(p_provider,''))
    when 'opta' then .97
    when 'stats_perform' then .97
    when 'wyscout' then .92
    when 'playerelo' then .90
    when 'iffhs_2025' then .82
    when 'manual_reviewed' then .80
    when 'djm_iffhs_tier_decay_v1' then .68
    else .72
  end;

  v_freshness := case lower(coalesce(p_freshness,'unknown'))
    when 'fresh' then 1
    when 'aging' then .82
    when 'stale' then .55
    else .65
  end;

  return least(1::numeric, greatest(0::numeric, v_provider * v_freshness));
end;
$$;

create or replace function private.djm_v5_experience_quality(
  p_age integer,
  p_reviewed_seasons integer,
  p_reviewed_career_minutes numeric
)
returns numeric
language plpgsql
immutable
set search_path=''
as $$
declare
  v_expected_seasons numeric;
  v_season_quality numeric;
  v_minutes_quality numeric;
begin
  if coalesce(p_reviewed_seasons,0) <= 0 or coalesce(p_reviewed_career_minutes,0) <= 0 then
    return 0;
  end if;

  v_expected_seasons := greatest(
    1::numeric,
    least(4::numeric, coalesce(p_age,21) - 18)
  );

  v_season_quality := least(1::numeric, p_reviewed_seasons::numeric / v_expected_seasons);
  v_minutes_quality := least(1::numeric, p_reviewed_career_minutes / 6000.0);

  return least(1::numeric, greatest(0::numeric, sqrt(v_season_quality * v_minutes_quality)));
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Pure V5 computation layer.
--
-- p_refresh_base=false is read-only with respect to V5 and is used by preview/shadow.
-- p_refresh_base=true refreshes the canonical V2 basis before computing V5.
-- -----------------------------------------------------------------------------

create or replace function private.djm_player_score_v5_compute(
  p_player_id uuid,
  p_as_of date,
  p_refresh_base boolean
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  p public.players%rowtype;
  s djm_os.player_scorecards%rowtype;
  core jsonb := '{}'::jsonb;
  b jsonb := '{}'::jsonb;

  v_underlying_status text := 'not_calculated';
  v_position_group text;
  v_age integer;

  v_recent_minutes numeric := 0;
  v_effective_minutes numeric := 0;
  v_effective_apps numeric := 0;
  v_effective_starts numeric := 0;
  v_starts_known boolean := false;
  v_latest_evidence_date date;
  v_reviewed_seasons integer := 0;
  v_reviewed_career_minutes numeric := 0;

  v_level numeric;
  v_perf numeric;
  v_role numeric;
  v_exp numeric;
  v_trend numeric;
  v_avail numeric;

  v_level_quality numeric := 0;
  v_perf_quality numeric := 0;
  v_role_quality numeric := 0;
  v_exp_quality numeric := 0;
  v_trend_quality numeric := 0;
  v_avail_quality numeric := 0;
  v_verification_quality numeric := .55;

  v_recent_perf numeric;
  v_prior_perf numeric;
  v_recent_perf_quality numeric := 0;
  v_prior_perf_quality numeric := 0;

  v_w_level numeric := 0;
  v_w_perf numeric := 0;
  v_w_role numeric := 0;
  v_w_exp numeric := 0;
  v_w_trend numeric := 0;
  v_w_avail numeric := 0;
  v_effective_weight numeric := 0;
  v_nominal_observed_weight numeric := 0;
  v_weighted_total numeric := 0;
  v_raw_score numeric;
  v_component_variance numeric := 0;
  v_component_disagreement numeric := 0;

  v_grade text := 'unavailable';
  v_tier text := 'unavailable';
  v_prior_strength numeric := 45;
  v_prior_score numeric := 50;
  v_posterior_information numeric := 0;
  v_score numeric;
  v_potential numeric;
  v_quality_mean numeric := 0;
  v_conf integer := 0;
  v_band_half integer := 24;
  v_band_low integer;
  v_band_high integer;
  v_freshness text := 'unknown';
  v_missing jsonb := '[]'::jsonb;
  v_fingerprint text;
  v_model_version text := 'djm_player_score_v5_information_fusion';
begin
  if p_as_of is null then
    raise exception 'p_as_of is required';
  end if;

  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select * into p
  from public.players
  where id=p_player_id;

  if not found then
    raise exception 'Player not found';
  end if;

  if p_refresh_base then
    core := public.djm_player_scorecard_v2_core(p_player_id);

    if coalesce(core->>'model_status', core->>'status')='benchmark_required'
       and to_regprocedure('private.djm_autoresolve_player_benchmark(uuid)') is not null
    then
      perform private.djm_autoresolve_player_benchmark(p_player_id);
      core := public.djm_player_scorecard_v2_core(p_player_id);
    end if;
  end if;

  select * into s
  from djm_os.player_scorecards
  where player_id=p_player_id;

  if not found then
    return jsonb_build_object(
      'player_id',p_player_id,
      'score_tier','unavailable',
      'status','not_calculated',
      'model_version',v_model_version,
      'reason','scorecard_not_initialised'
    );
  end if;

  b := coalesce(s.basis,'{}'::jsonb);
  v_underlying_status := coalesce(s.score_status,'not_calculated');
  v_position_group := coalesce(nullif(s.position_group,''), private.djm_position_group(p.primary_position));

  if p.date_of_birth is not null then
    v_age := date_part('year', age(p_as_of,p.date_of_birth))::int;
  end if;

  v_level := nullif(b->>'level_score','')::numeric;
  v_exp := nullif(b->>'experience_score','')::numeric;

  -- Reviewed senior club evidence. International rows do not define current club role.
  with career as (
    select
      c.*,
      private.djm_v5_career_evidence_date(
        c.club_name,
        p.current_club,
        c.season_label,
        c.start_date,
        c.end_date,
        c.source_reviewed_at,
        c.source_synced_at,
        p_as_of
      ) as evidence_date
    from public.career_entries c
    where c.player_id=p_player_id
      and c.source_reviewed_at is not null
      and coalesce(c.is_international,false)=false
  ), recent as (
    select
      *,
      private.djm_v5_recency_weight(evidence_date,p_as_of) as recency
    from career
    where evidence_date >= p_as_of - interval '24 months'
  )
  select
    coalesce(sum(coalesce(minutes,0)),0),
    coalesce(sum(coalesce(minutes,0)*recency),0),
    coalesce(sum(coalesce(appearances,0)*recency),0),
    coalesce(sum(coalesce(starts,0)*recency),0),
    coalesce(bool_or(starts is not null),false),
    max(evidence_date),
    (
      select count(distinct coalesce(nullif(trim(season_label),''),evidence_date::text))
      from career
      where evidence_date is not null
    ),
    (
      select coalesce(sum(coalesce(minutes,0)),0)
      from career
      where evidence_date is not null
    )
  into
    v_recent_minutes,
    v_effective_minutes,
    v_effective_apps,
    v_effective_starts,
    v_starts_known,
    v_latest_evidence_date,
    v_reviewed_seasons,
    v_reviewed_career_minutes
  from recent;

  if v_effective_minutes > 0 then
    v_role := private.djm_v5_role_score(
      v_effective_minutes,
      v_effective_apps,
      v_effective_starts,
      v_starts_known
    );
    v_role_quality := private.djm_v5_role_quality(v_effective_minutes,v_effective_apps);
  end if;

  -- Performance snapshots remain position-adjusted. Snapshot source confidence and
  -- sample size determine how much each snapshot can influence the aggregated signal.
  with raw as (
    select
      snap.*,
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
      private.djm_v5_recency_weight(snap.evidence_date,p_as_of) as recency,
      private.djm_v5_snapshot_quality(snap.minutes,snap.confidence) as quality
    from djm_os.player_performance_snapshots snap
    where snap.player_id=p_player_id
      and snap.verified_at is not null
      and snap.evidence_date between p_as_of - interval '18 months' and p_as_of + 1
      and coalesce(snap.minutes,0) >= 180
      and (snap.position_group=v_position_group or v_position_group='UNKNOWN')
  ), usable as (
    select
      *,
      sqrt(greatest(coalesce(minutes,180),180)::numeric) * recency * greatest(quality,.01) as evidence_weight,
      sqrt(greatest(coalesce(minutes,180),180)::numeric) * recency as quality_weight
    from raw
    where raw_perf is not null and recency > 0 and quality > 0
  )
  select
    sum(raw_perf*evidence_weight)/nullif(sum(evidence_weight),0),
    sum(quality*quality_weight)/nullif(sum(quality_weight),0),
    sum(case when evidence_date >= p_as_of-interval '6 months' then raw_perf*evidence_weight else 0 end)
      / nullif(sum(case when evidence_date >= p_as_of-interval '6 months' then evidence_weight else 0 end),0),
    sum(case when evidence_date < p_as_of-interval '6 months' then raw_perf*evidence_weight else 0 end)
      / nullif(sum(case when evidence_date < p_as_of-interval '6 months' then evidence_weight else 0 end),0),
    sum(case when evidence_date >= p_as_of-interval '6 months' then quality*quality_weight else 0 end)
      / nullif(sum(case when evidence_date >= p_as_of-interval '6 months' then quality_weight else 0 end),0),
    sum(case when evidence_date < p_as_of-interval '6 months' then quality*quality_weight else 0 end)
      / nullif(sum(case when evidence_date < p_as_of-interval '6 months' then quality_weight else 0 end),0),
    case
      when coalesce(sum(case when possible_minutes > 0 and evidence_date >= p_as_of-interval '12 months'
        then possible_minutes*recency else 0 end),0) > 0
      then least(
        100::numeric,
        greatest(
          0::numeric,
          sum(case when possible_minutes > 0 and evidence_date >= p_as_of-interval '12 months'
              then coalesce(minutes,0)*recency else 0 end)::numeric
          / nullif(sum(case when possible_minutes > 0 and evidence_date >= p_as_of-interval '12 months'
              then possible_minutes*recency else 0 end),0)
          * 100
        )
      )
      else null
    end,
    case
      when coalesce(sum(case when possible_minutes > 0 and evidence_date >= p_as_of-interval '12 months'
        then possible_minutes*recency else 0 end),0) > 0
      then least(
        1::numeric,
        greatest(
          0::numeric,
          (1-exp(-coalesce(sum(case when possible_minutes > 0 and evidence_date >= p_as_of-interval '12 months'
            then possible_minutes*recency else 0 end),0)/1200.0))
          * coalesce(
              sum(case when possible_minutes > 0 and evidence_date >= p_as_of-interval '12 months'
                then quality*quality_weight else 0 end)
              / nullif(sum(case when possible_minutes > 0 and evidence_date >= p_as_of-interval '12 months'
                then quality_weight else 0 end),0),
              0
            )
        )
      )
      else 0
    end
  into
    v_perf,
    v_perf_quality,
    v_recent_perf,
    v_prior_perf,
    v_recent_perf_quality,
    v_prior_perf_quality,
    v_avail,
    v_avail_quality
  from usable;

  if v_recent_perf is not null and v_prior_perf is not null then
    v_trend := least(100::numeric,greatest(0::numeric,50 + (v_recent_perf-v_prior_perf)*.85));
    v_trend_quality := least(
      1::numeric,
      greatest(0::numeric,least(coalesce(v_recent_perf_quality,0),coalesce(v_prior_perf_quality,0)))
    );
  end if;

  v_level_quality := case
    when v_level is null then 0
    else private.djm_v5_benchmark_quality(
      b->>'league_benchmark_provider',
      b->>'benchmark_freshness'
    )
  end;

  v_exp_quality := case
    when v_exp is null then 0
    else private.djm_v5_experience_quality(
      v_age,
      v_reviewed_seasons,
      v_reviewed_career_minutes
    )
  end;

  v_verification_quality := case lower(coalesce(p.verification_status,''))
    when 'verified' then 1
    when 'reviewing' then .75
    else .55
  end;

  -- Incomplete career history is unknown rather than evidence of poor experience.
  -- A low experience score is not allowed to influence the player until the history
  -- quality clears a conservative 0.35 threshold.
  v_w_level := case when v_level is not null then 30*v_level_quality else 0 end;
  v_w_perf := case when v_perf is not null then 30*v_perf_quality else 0 end;
  v_w_role := case when v_role is not null then 15*v_role_quality else 0 end;
  v_w_exp := case when v_exp is not null and v_exp_quality >= .35 then 10*v_exp_quality else 0 end;
  v_w_trend := case when v_trend is not null then 10*v_trend_quality else 0 end;
  v_w_avail := case when v_avail is not null then 5*v_avail_quality else 0 end;

  v_nominal_observed_weight :=
    case when v_level is not null then 30 else 0 end
    + case when v_perf is not null then 30 else 0 end
    + case when v_role is not null then 15 else 0 end
    + case when v_exp is not null and v_exp_quality >= .35 then 10 else 0 end
    + case when v_trend is not null then 10 else 0 end
    + case when v_avail is not null then 5 else 0 end;

  v_effective_weight := v_w_level+v_w_perf+v_w_role+v_w_exp+v_w_trend+v_w_avail;

  v_weighted_total :=
    coalesce(v_level*v_w_level,0)
    + coalesce(v_perf*v_w_perf,0)
    + coalesce(v_role*v_w_role,0)
    + coalesce(v_exp*v_w_exp,0)
    + coalesce(v_trend*v_w_trend,0)
    + coalesce(v_avail*v_w_avail,0);

  if v_effective_weight > 0 then
    v_raw_score := v_weighted_total/v_effective_weight;
  end if;

  if v_level is null then v_missing:=v_missing||jsonb_build_array('competition_level'); end if;
  if v_perf is null then v_missing:=v_missing||jsonb_build_array('position_adjusted_performance'); end if;
  if v_role is null then v_missing:=v_missing||jsonb_build_array('role_minutes'); end if;
  if v_exp is null or v_exp_quality < .35 then v_missing:=v_missing||jsonb_build_array('experience_history'); end if;
  if v_trend is null then v_missing:=v_missing||jsonb_build_array('trend'); end if;
  if v_avail is null then v_missing:=v_missing||jsonb_build_array('availability'); end if;

  -- Tier qualification uses quality-adjusted evidence mass, not just field presence.
  if v_perf is not null
     and v_perf_quality >= .60
     and v_effective_weight >= 68
     and v_recent_minutes >= 500
     and v_effective_minutes >= 400
     and v_level is not null
     and v_role is not null
     and v_level_quality >= .60
     and v_latest_evidence_date >= p_as_of - interval '240 days'
  then
    v_grade := 'full';
    v_tier := 'full';
    v_prior_strength := 5;
  elsif v_perf is not null
     and v_effective_weight >= 38
     and v_recent_minutes >= 500
     and v_effective_minutes >= 350
     and v_level is not null
     and v_role is not null
     and v_latest_evidence_date >= p_as_of - interval '365 days'
  then
    v_grade := 'performance_backed';
    v_tier := 'provisional';
    v_prior_strength := 20;
  elsif v_perf is null
     and v_effective_weight >= 30
     and v_recent_minutes >= 500
     and v_effective_minutes >= 350
     and v_level is not null
     and v_role is not null
     and v_latest_evidence_date >= p_as_of - interval '365 days'
  then
    v_grade := 'context_only';
    v_tier := 'provisional';
    v_prior_strength := 45;
  else
    v_grade := 'unavailable';
    v_tier := 'unavailable';
    v_prior_strength := 45;
  end if;

  if v_tier <> 'unavailable' and v_raw_score is not null then
    -- Bayesian-style shrinkage. The prior is intentionally stronger when no deep
    -- performance evidence exists. Prior strength is model configuration, not hidden
    -- imputation of any missing component.
    v_score := least(
      100::numeric,
      greatest(
        0::numeric,
        (v_prior_score*v_prior_strength + v_weighted_total)
        / nullif(v_prior_strength+v_effective_weight,0)
      )
    );

    v_posterior_information := least(
      1::numeric,
      greatest(0::numeric,v_effective_weight/nullif(v_effective_weight+v_prior_strength,0))
    );

    v_quality_mean := least(
      1::numeric,
      greatest(
        0::numeric,
        (
          v_level_quality
          + v_role_quality
          + case when v_perf is null then v_verification_quality else v_perf_quality end
        ) / 3.0
      )
    );

    v_conf := round(
      100*v_posterior_information*(.65+.35*v_quality_mean)
    )::int;

    v_conf := least(
      case v_grade
        when 'context_only' then 45
        when 'performance_backed' then 72
        else 92
      end,
      greatest(15,v_conf)
    );

    -- Weighted component disagreement widens the evidence band when signals conflict.
    v_component_variance := (
      coalesce(v_w_level*power(v_level-v_raw_score,2),0)
      + coalesce(v_w_perf*power(v_perf-v_raw_score,2),0)
      + coalesce(v_w_role*power(v_role-v_raw_score,2),0)
      + coalesce(v_w_exp*power(v_exp-v_raw_score,2),0)
      + coalesce(v_w_trend*power(v_trend-v_raw_score,2),0)
      + coalesce(v_w_avail*power(v_avail-v_raw_score,2),0)
    ) / nullif(v_effective_weight,0);

    v_component_disagreement := sqrt(greatest(0::numeric,coalesce(v_component_variance,0)));

    v_band_half := greatest(
      6,
      least(
        24,
        round(
          5
          + (100-v_conf)*.13
          + least(6::numeric,v_component_disagreement*.10)
          + case v_grade when 'context_only' then 3 when 'performance_backed' then 1 else 0 end
        )::int
      )
    );

    v_band_low := greatest(0,round(v_score)::int-v_band_half);
    v_band_high := least(100,round(v_score)::int+v_band_half);
  else
    v_conf := 0;
  end if;

  if v_latest_evidence_date is null then
    v_freshness := 'unknown';
  elsif v_latest_evidence_date >= p_as_of - interval '90 days'
    and lower(coalesce(b->>'benchmark_freshness','unknown'))='fresh'
  then
    v_freshness := 'fresh';
  elsif v_latest_evidence_date >= p_as_of - interval '240 days'
    and lower(coalesce(b->>'benchmark_freshness','unknown')) <> 'stale'
  then
    v_freshness := 'aging';
  else
    v_freshness := 'stale';
  end if;

  if v_tier='full' and to_regprocedure('private.djm_potential_age_adjustment(integer,text)') is not null then
    if private.djm_potential_age_adjustment(v_age,v_position_group) is not null then
      v_potential := least(
        100::numeric,
        greatest(
          0::numeric,
          v_score
          + private.djm_potential_age_adjustment(v_age,v_position_group)
          + case when v_trend is null then 0 else greatest(-5::numeric,least(5::numeric,(v_trend-50)*.10)) end
        )
      );
    end if;
  end if;

  v_fingerprint := md5(
    jsonb_build_object(
      'model_version',v_model_version,
      'as_of',p_as_of,
      'player_id',p_player_id,
      'position_group',v_position_group,
      'current_club',p.current_club,
      'current_league',p.current_league,
      'verification_status',p.verification_status,
      'benchmark_provider',b->>'league_benchmark_provider',
      'benchmark_freshness',b->>'benchmark_freshness',
      'recent_minutes',round(v_recent_minutes,2),
      'effective_minutes',round(v_effective_minutes,2),
      'latest_evidence_date',v_latest_evidence_date,
      'components',jsonb_build_object(
        'level',v_level,'performance',v_perf,'role',v_role,
        'experience',v_exp,'trend',v_trend,'availability',v_avail
      ),
      'component_quality',jsonb_build_object(
        'level',v_level_quality,'performance',v_perf_quality,'role',v_role_quality,
        'experience',v_exp_quality,'trend',v_trend_quality,'availability',v_avail_quality
      )
    )::text
  );

  -- Remove obsolete provisional descriptions before adding the V5 audit contract.
  b := b
    - 'provisional_methodology'
    - 'provisional_regression_factor'
    - 'provisional_minutes_reliability'
    - 'provisional_component_weights'
    - 'provisional_observed_weight'
    - 'provisional_raw_observed_score'
    - 'provisional_confidence_rule'
    - 'provisional_comparison_rule';

  b := b || jsonb_build_object(
    'model','DJM Player Score V5',
    'model_version',v_model_version,
    'model_definition','Current demonstrated football level. Missing evidence remains unknown; component influence is quality-weighted; provisional estimates are explicitly shrunk towards a neutral prior.',
    'score_tier',v_tier,
    'provisional_grade',case when v_tier='provisional' then v_grade else null end,
    'component_weights',jsonb_build_object(
      'competition_level',30,
      'position_performance',30,
      'role_minutes',15,
      'experience',10,
      'trend',10,
      'availability',5
    ),
    'effective_component_weights',jsonb_build_object(
      'competition_level',round(v_w_level,2),
      'position_performance',round(v_w_perf,2),
      'role_minutes',round(v_w_role,2),
      'experience',round(v_w_exp,2),
      'trend',round(v_w_trend,2),
      'availability',round(v_w_avail,2)
    ),
    'component_quality',jsonb_build_object(
      'competition_level',round(v_level_quality,3),
      'position_performance',round(v_perf_quality,3),
      'role_minutes',round(v_role_quality,3),
      'experience',round(v_exp_quality,3),
      'trend',round(v_trend_quality,3),
      'availability',round(v_avail_quality,3)
    ),
    'level_score',case when v_level is null then null else round(v_level) end,
    'performance_score',case when v_perf is null then null else round(v_perf) end,
    'role_score',case when v_role is null then null else round(v_role) end,
    'experience_score',case when v_exp is null then null else round(v_exp) end,
    'trend_score',case when v_trend is null then null else round(v_trend) end,
    'availability_score',case when v_avail is null then null else round(v_avail) end,
    'recent_minutes_24m',round(v_recent_minutes),
    'effective_recent_minutes',round(v_effective_minutes),
    'effective_recent_appearances',round(v_effective_apps,2),
    'latest_evidence_date',v_latest_evidence_date,
    'reviewed_career_seasons',v_reviewed_seasons,
    'reviewed_career_minutes',round(v_reviewed_career_minutes),
    'nominal_observed_coverage',round(v_nominal_observed_weight),
    'effective_evidence_coverage',round(v_effective_weight),
    'data_coverage',round(v_effective_weight),
    'raw_evidence_score',case when v_raw_score is null then null else round(v_raw_score,2) end,
    'prior_score',v_prior_score,
    'prior_strength',v_prior_strength,
    'posterior_information',round(v_posterior_information,3),
    'evidence_confidence',v_conf,
    'evidence_confidence_semantics','Evidence strength only. It is not a probability of sporting success, transfer success or future performance.',
    'evidence_band',case when v_band_low is null then null else jsonb_build_object(
      'low',v_band_low,
      'high',v_band_high,
      'type','heuristic_evidence_band_not_statistical_confidence_interval'
    ) end,
    'score_range',case when v_band_low is null then null else jsonb_build_object('low',v_band_low,'high',v_band_high) end,
    'component_disagreement',round(v_component_disagreement,2),
    'recency_model',jsonb_build_object(
      'type','continuous_exponential_decay',
      'half_life_days',365,
      'hard_horizon_days',730
    ),
    'career_evidence_date_rule','Current-club live-season evidence may use its latest reviewed/synchronised as-of date. Historical evidence keeps its historical date.',
    'experience_quality_rule','Experience influences the score only when reviewed career-history quality is at least 0.35. Thin history is treated as unknown, not low experience.',
    'full_score_rule','Requires deep position-adjusted performance quality >= 0.60, effective evidence coverage >= 68, >= 500 reviewed recent senior minutes, >= 400 recency-weighted minutes, a trustworthy competition benchmark and current role evidence.',
    'provisional_methodology','Quality-weighted evidence fusion with explicit shrinkage to a neutral prior. Context-only estimates use a stronger prior than performance-backed provisional estimates.',
    'provisional_comparison_rule','Never compare a Provisional score as if it has Full-score certainty. Keep provisional grade, evidence confidence, effective evidence coverage and evidence band visible.',
    'calculation_as_of',p_as_of,
    'input_fingerprint',v_fingerprint
  );

  return jsonb_build_object(
    'player_id',p_player_id,
    'underlying_status',v_underlying_status,
    'score_tier',v_tier,
    'provisional_grade',case when v_tier='provisional' then v_grade else null end,
    'model_score',case when v_tier='full' then round(v_score) else null end,
    'provisional_score',case when v_tier='provisional' then round(v_score) else null end,
    'potential_model_score',case when v_tier='full' and v_potential is not null then round(v_potential) else null end,
    'confidence',v_conf,
    'data_coverage',round(v_effective_weight),
    'nominal_observed_coverage',round(v_nominal_observed_weight),
    'raw_evidence_score',case when v_raw_score is null then null else round(v_raw_score,2) end,
    'prior_strength',v_prior_strength,
    'posterior_information',round(v_posterior_information,3),
    'score_range',case when v_band_low is null then null else jsonb_build_object('low',v_band_low,'high',v_band_high) end,
    'evidence_freshness',v_freshness,
    'latest_evidence_date',v_latest_evidence_date,
    'effective_recent_minutes',round(v_effective_minutes),
    'missing_inputs',v_missing,
    'input_fingerprint',v_fingerprint,
    'model_version',v_model_version,
    'basis',b
  );
end;
$$;

revoke all on function private.djm_player_score_v5_compute(uuid,date,boolean)
  from public, anon;
grant execute on function private.djm_player_score_v5_compute(uuid,date,boolean)
  to authenticated, service_role;

-- Authenticated DJM staff can preview the V5 calculation without persisting V5 output.
create or replace function public.djm_player_scorecard_v5_preview(p_player_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
begin
  return private.djm_player_score_v5_compute(p_player_id,current_date,false);
end;
$$;

revoke all on function public.djm_player_scorecard_v5_preview(uuid)
  from public, anon;
grant execute on function public.djm_player_scorecard_v5_preview(uuid)
  to authenticated, service_role;

comment on function public.djm_player_scorecard_v5_preview(uuid) is
  'Read-only V5 shadow calculation against the currently stored canonical score basis. Does not persist V5 score output.';

-- -----------------------------------------------------------------------------
-- 3. Active V5 scorer.
-- -----------------------------------------------------------------------------

create or replace function public.djm_player_scorecard(p_player_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  before_s djm_os.player_scorecards%rowtype;
  after_s djm_os.player_scorecards%rowtype;
  v jsonb;
  v_basis jsonb;
  v_tier text;
  v_conf integer;
  v_previous_display integer;
  v_new_display integer;
  v_event_type text;
  v_manual_active boolean := false;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select * into before_s
  from djm_os.player_scorecards
  where player_id=p_player_id;

  if found then
    v_previous_display := coalesce(before_s.manual_score,before_s.model_score,before_s.provisional_score);
  end if;

  v := private.djm_player_score_v5_compute(p_player_id,current_date,true);
  v_basis := coalesce(v->'basis','{}'::jsonb);
  v_tier := coalesce(v->>'score_tier','unavailable');
  v_conf := coalesce((v->>'confidence')::integer,0);

  select * into after_s
  from djm_os.player_scorecards
  where player_id=p_player_id;

  if not found then
    raise exception 'Player scorecard was not initialised by the canonical core';
  end if;

  v_manual_active := after_s.manual_score is not null;

  if v_tier='full' then
    update djm_os.player_scorecards
    set
      model_score=(v->>'model_score')::smallint,
      provisional_score=null,
      provisional_confidence=null,
      potential_model_score=nullif(v->>'potential_model_score','')::smallint,
      score_status='calculated',
      confidence=v_conf::smallint,
      basis=v_basis,
      model_version='djm_player_score_v5_information_fusion',
      calculated_at=now(),
      stale_at=now()+interval '45 days',
      stale_reason=null,
      evidence_freshness=coalesce(v->>'evidence_freshness','unknown'),
      ability_core_score=nullif(v->>'raw_evidence_score','')::numeric::smallint,
      performance_score=nullif(v_basis->>'performance_score','')::smallint,
      role_score=nullif(v_basis->>'role_score','')::smallint,
      experience_score=nullif(v_basis->>'experience_score','')::smallint,
      trend_score=nullif(v_basis->>'trend_score','')::smallint,
      availability_score=nullif(v_basis->>'availability_score','')::smallint,
      age_adjustment=0,
      data_coverage=(v->>'data_coverage')::smallint,
      position_group=coalesce(nullif(v_basis->>'position_group',''),after_s.position_group),
      score_tier=case when v_manual_active then 'manual_override' else 'full' end,
      missing_inputs=coalesce(v->'missing_inputs','[]'::jsonb),
      updated_by=auth.uid(),
      updated_at=now()
    where player_id=p_player_id;

    v_event_type := 'PLAYER_SCORE_V5_FULL_CALCULATED';

  elsif v_tier='provisional' then
    update djm_os.player_scorecards
    set
      model_score=null,
      potential_model_score=null,
      provisional_score=(v->>'provisional_score')::smallint,
      provisional_confidence=v_conf::smallint,
      confidence=v_conf::smallint,
      basis=v_basis,
      model_version='djm_player_score_v5_information_fusion',
      calculated_at=now(),
      stale_at=now()+interval '45 days',
      stale_reason=null,
      evidence_freshness=coalesce(v->>'evidence_freshness','unknown'),
      ability_core_score=null,
      performance_score=nullif(v_basis->>'performance_score','')::smallint,
      role_score=nullif(v_basis->>'role_score','')::smallint,
      experience_score=nullif(v_basis->>'experience_score','')::smallint,
      trend_score=nullif(v_basis->>'trend_score','')::smallint,
      availability_score=nullif(v_basis->>'availability_score','')::smallint,
      age_adjustment=0,
      data_coverage=(v->>'data_coverage')::smallint,
      position_group=coalesce(nullif(v_basis->>'position_group',''),after_s.position_group),
      score_tier=case when v_manual_active then 'manual_override' else 'provisional' end,
      missing_inputs=coalesce(v->'missing_inputs','[]'::jsonb),
      updated_by=auth.uid(),
      updated_at=now()
    where player_id=p_player_id;

    v_event_type := 'PLAYER_SCORE_V5_PROVISIONAL_CALCULATED';

  else
    update djm_os.player_scorecards
    set
      model_score=null,
      potential_model_score=null,
      provisional_score=null,
      provisional_confidence=null,
      confidence=0,
      basis=v_basis,
      model_version='djm_player_score_v5_information_fusion',
      calculated_at=now(),
      stale_at=now(),
      stale_reason='insufficient_current_evidence',
      evidence_freshness=coalesce(v->>'evidence_freshness','unknown'),
      ability_core_score=null,
      performance_score=nullif(v_basis->>'performance_score','')::smallint,
      role_score=nullif(v_basis->>'role_score','')::smallint,
      experience_score=nullif(v_basis->>'experience_score','')::smallint,
      trend_score=nullif(v_basis->>'trend_score','')::smallint,
      availability_score=nullif(v_basis->>'availability_score','')::smallint,
      age_adjustment=0,
      data_coverage=coalesce((v->>'data_coverage')::smallint,0),
      position_group=coalesce(nullif(v_basis->>'position_group',''),after_s.position_group),
      score_tier=case when v_manual_active then 'manual_override' else 'unavailable' end,
      missing_inputs=coalesce(v->'missing_inputs','[]'::jsonb),
      updated_by=auth.uid(),
      updated_at=now()
    where player_id=p_player_id;

    v_event_type := 'PLAYER_SCORE_V5_UNAVAILABLE';
  end if;

  select * into after_s
  from djm_os.player_scorecards
  where player_id=p_player_id;

  v_new_display := coalesce(after_s.manual_score,after_s.model_score,after_s.provisional_score);

  insert into djm_os.events(
    event_type,actor_user_id,player_id,payload,source,confidence,occurred_at
  )
  values(
    v_event_type,
    auth.uid(),
    p_player_id,
    jsonb_build_object(
      'score_tier',v_tier,
      'provisional_grade',v->>'provisional_grade',
      'previous_display_score',v_previous_display,
      'new_display_score',v_new_display,
      'score_delta',case when v_previous_display is null or v_new_display is null then null else v_new_display-v_previous_display end,
      'confidence',v_conf,
      'effective_evidence_coverage',v->>'data_coverage',
      'nominal_observed_coverage',v->>'nominal_observed_coverage',
      'raw_evidence_score',v->>'raw_evidence_score',
      'prior_strength',v->>'prior_strength',
      'posterior_information',v->>'posterior_information',
      'score_range',v->'score_range',
      'missing_inputs',v->'missing_inputs',
      'input_fingerprint',v->>'input_fingerprint',
      'model_version','djm_player_score_v5_information_fusion'
    ),
    'djm_player_score_v5_information_fusion',
    v_conf::numeric/100,
    now()
  );

  return v || jsonb_build_object(
    'display_score',v_new_display,
    'score_tier',after_s.score_tier,
    'manual_override_active',v_manual_active,
    'model_version','djm_player_score_v5_information_fusion'
  );
end;
$$;

revoke all on function public.djm_player_scorecard(uuid)
  from public, anon;
grant execute on function public.djm_player_scorecard(uuid)
  to authenticated, service_role;

comment on function public.djm_player_scorecard(uuid) is
  'DJM Player Score V5. Quality-weighted evidence fusion, continuous recency, explicit shrinkage/uncertainty, incomplete-history protection and auditable input fingerprints.';

-- -----------------------------------------------------------------------------
-- 4. Automatic score invalidation when canonical inputs change.
--
-- These triggers do not recalculate synchronously. They only prevent a previous score
-- from continuing to look current after its evidence has changed.
-- -----------------------------------------------------------------------------

create or replace function private.djm_v5_mark_player_score_stale_from_input()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player_id uuid;
begin
  v_player_id := case when tg_op='DELETE' then old.player_id else new.player_id end;

  if v_player_id is not null then
    update djm_os.player_scorecards
    set
      stale_at=now(),
      stale_reason=tg_table_schema||'.'||tg_table_name||'_changed',
      evidence_freshness='stale',
      updated_at=now()
    where player_id=v_player_id;
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.djm_v5_mark_player_score_stale_from_player()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  update djm_os.player_scorecards
  set
    stale_at=now(),
    stale_reason='public.players_score_inputs_changed',
    evidence_freshness='stale',
    updated_at=now()
  where player_id=new.id;
  return new;
end;
$$;

create or replace function private.djm_v5_mark_score_stale_from_benchmark()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_competition_id uuid;
  v_league_name text;
begin
  v_competition_id := case when tg_op='DELETE' then old.competition_id else new.competition_id end;
  v_league_name := case when tg_op='DELETE' then old.league_name else new.league_name end;

  update djm_os.player_scorecards
  set
    stale_at=now(),
    stale_reason='djm_os.league_benchmarks_changed',
    evidence_freshness='stale',
    updated_at=now()
  where
    (v_competition_id is not null and basis->>'competition_id'=v_competition_id::text)
    or (
      nullif(trim(coalesce(v_league_name,'')),'') is not null
      and lower(coalesce(basis->>'competition_name',''))=lower(v_league_name)
    );

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.djm_v5_mark_player_score_stale_from_input()
  from public, anon, authenticated;
revoke all on function private.djm_v5_mark_player_score_stale_from_player()
  from public, anon, authenticated;
revoke all on function private.djm_v5_mark_score_stale_from_benchmark()
  from public, anon, authenticated;

-- Replace only V5-owned trigger names, leaving unrelated application triggers intact.
drop trigger if exists djm_v5_score_stale_career_entries on public.career_entries;
create trigger djm_v5_score_stale_career_entries
after insert or update or delete on public.career_entries
for each row execute function private.djm_v5_mark_player_score_stale_from_input();

drop trigger if exists djm_v5_score_stale_performance on djm_os.player_performance_snapshots;
create trigger djm_v5_score_stale_performance
after insert or update or delete on djm_os.player_performance_snapshots
for each row execute function private.djm_v5_mark_player_score_stale_from_input();

drop trigger if exists djm_v5_score_stale_player_identity on public.players;
create trigger djm_v5_score_stale_player_identity
after update of current_club,current_league,primary_position,date_of_birth,verification_status on public.players
for each row
when (
  old.current_club is distinct from new.current_club
  or old.current_league is distinct from new.current_league
  or old.primary_position is distinct from new.primary_position
  or old.date_of_birth is distinct from new.date_of_birth
  or old.verification_status is distinct from new.verification_status
)
execute function private.djm_v5_mark_player_score_stale_from_player();

drop trigger if exists djm_v5_score_stale_benchmark on djm_os.league_benchmarks;
create trigger djm_v5_score_stale_benchmark
after insert or update or delete on djm_os.league_benchmarks
for each row execute function private.djm_v5_mark_score_stale_from_benchmark();

notify pgrst,'reload schema';

commit;
