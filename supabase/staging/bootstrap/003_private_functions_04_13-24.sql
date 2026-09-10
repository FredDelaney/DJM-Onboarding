-- DJM Player staging private-function bootstrap — batch 04
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- and private function bootstrap batches 01-03.
--
-- Exact current-production definitions for private functions 13-24 of 70,
-- ordered by function name + identity arguments.
-- Production body MD5: e3dc6360d3c3427c069de4388df66cec
--
-- Body validation is disabled only during bootstrap because later batches
-- provide cross-function dependencies. No function is executed by this file.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.djm_experience_recency_weight(p_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case
    when p_date is null or p_date > current_date then 0::numeric
    when current_date - p_date <= 730 then 1::numeric
    when current_date - p_date <= 1460 then 0.65::numeric
    when current_date - p_date <= 2190 then 0.35::numeric
    else 0.15::numeric
  end;
$function$


CREATE OR REPLACE FUNCTION private.djm_mark_player_score_stale(p_player_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_changed integer := 0;
  v_actor uuid;
begin
  select case when exists(
    select 1 from djm_os.team_members tm
    where tm.user_id = auth.uid() and tm.is_active
  ) then auth.uid() else null end into v_actor;

  update djm_os.player_scorecards
  set score_status = 'needs_recalculation',
      stale_at = now(),
      stale_reason = p_reason,
      updated_at = now()
  where player_id = p_player_id
    and (model_score is not null or calculated_at is not null)
    and score_status is distinct from 'needs_recalculation';
  get diagnostics v_changed = row_count;

  if v_changed > 0 then
    insert into djm_os.events(
      event_type, actor_user_id, player_id, payload, source, confidence, occurred_at
    ) values (
      'PLAYER_SCORE_BECAME_STALE', v_actor, p_player_id,
      jsonb_build_object('reason', p_reason), 'intelligence_data_layer', 1, now()
    );
  end if;
end;
$function$


CREATE OR REPLACE FUNCTION private.djm_normalize_season_label(p_label text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select regexp_replace(replace(lower(btrim(coalesce(p_label,''))),'/','-'),'[[:space:]]+','','g')
$function$


CREATE OR REPLACE FUNCTION private.djm_player_competition_score_stale_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.current_competition_id is distinct from old.current_competition_id
     or new.current_league is distinct from old.current_league
     or new.current_country is distinct from old.current_country then
    perform private.djm_mark_player_score_stale(new.id, 'Current competition changed');
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION private.djm_player_score_v5_compute(p_player_id uuid, p_as_of date, p_refresh_base boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION private.djm_position_group(p_position text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v text := upper(regexp_replace(trim(coalesce(p_position,'')), '[.[:space:]-]+', '_', 'g'));
begin
  if v ~ '^(GK|GOALKEEPER)$' then return 'GK'; end if;
  if v ~ '^(CB|LCB|RCB|CENTRE_BACK|CENTER_BACK|CENTRAL_DEFENDER)$' then return 'CB'; end if;
  if v ~ '^(LB|RB|LWB|RWB|WB|FULL_BACK|FULLBACK|WING_BACK|WINGBACK|LEFT_BACK|RIGHT_BACK|LEFT_FULL_BACK|RIGHT_FULL_BACK|LEFT_WING_BACK|RIGHT_WING_BACK)$' then return 'FB_WB'; end if;
  if v ~ '^(DM|CDM|6|DEFENSIVE_MIDFIELDER|DEFENSIVE_MIDFIELD|HOLDING_MIDFIELDER)$' then return 'DM'; end if;
  if v ~ '^(CM|8|CENTRAL_MIDFIELDER|CENTRAL_MIDFIELD|CENTRE_MIDFIELDER|CENTRE_MIDFIELD)$' then return 'CM'; end if;
  if v ~ '^(AM|CAM|10|NO_10|ATTACKING_MIDFIELDER|ATTACKING_MIDFIELD)$' then return 'AM'; end if;
  if v ~ '^(LW|RW|LM|RM|W|WINGER|LEFT_WINGER|RIGHT_WINGER|LEFT_WING|RIGHT_WING|LEFT_MIDFIELDER|RIGHT_MIDFIELDER|LEFT_MIDFIELD|RIGHT_MIDFIELD)$' then return 'W'; end if;
  if v ~ '^(ST|CF|9|STRIKER|CENTRE_FORWARD|CENTER_FORWARD|CENTRAL_FORWARD|FORWARD|SECOND_STRIKER)$' then return 'ST'; end if;
  return 'UNKNOWN';
end;
$function$


CREATE OR REPLACE FUNCTION private.djm_position_performance_score(p_position_group text, p_overall numeric, p_attacking numeric, p_creativity numeric, p_progression numeric, p_possession numeric, p_defending numeric, p_aerial numeric, p_goalkeeping numeric, p_physical numeric, p_discipline numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_weighted numeric := 0;
  v_weight numeric := 0;
  v_group text := coalesce(p_position_group, 'UNKNOWN');
begin
  if p_overall is not null then return least(100, greatest(0, p_overall)); end if;
  if v_group = 'GK' then
    if p_goalkeeping is not null then v_weighted:=v_weighted+least(100,greatest(0,p_goalkeeping))*65; v_weight:=v_weight+65; end if;
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*15; v_weight:=v_weight+15; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*10; v_weight:=v_weight+10; end if;
    if p_aerial is not null then v_weighted:=v_weighted+least(100,greatest(0,p_aerial))*10; v_weight:=v_weight+10; end if;
  elsif v_group = 'CB' then
    if p_defending is not null then v_weighted:=v_weighted+least(100,greatest(0,p_defending))*35; v_weight:=v_weight+35; end if;
    if p_aerial is not null then v_weighted:=v_weighted+least(100,greatest(0,p_aerial))*20; v_weight:=v_weight+20; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*20; v_weight:=v_weight+20; end if;
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*15; v_weight:=v_weight+15; end if;
    if p_physical is not null then v_weighted:=v_weighted+least(100,greatest(0,p_physical))*10; v_weight:=v_weight+10; end if;
  elsif v_group = 'FB_WB' then
    if p_defending is not null then v_weighted:=v_weighted+least(100,greatest(0,p_defending))*25; v_weight:=v_weight+25; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*20; v_weight:=v_weight+20; end if;
    if p_creativity is not null then v_weighted:=v_weighted+least(100,greatest(0,p_creativity))*20; v_weight:=v_weight+20; end if;
    if p_attacking is not null then v_weighted:=v_weighted+least(100,greatest(0,p_attacking))*10; v_weight:=v_weight+10; end if;
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*10; v_weight:=v_weight+10; end if;
    if p_physical is not null then v_weighted:=v_weighted+least(100,greatest(0,p_physical))*15; v_weight:=v_weight+15; end if;
  elsif v_group = 'DM' then
    if p_defending is not null then v_weighted:=v_weighted+least(100,greatest(0,p_defending))*25; v_weight:=v_weight+25; end if;
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*25; v_weight:=v_weight+25; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*25; v_weight:=v_weight+25; end if;
    if p_creativity is not null then v_weighted:=v_weighted+least(100,greatest(0,p_creativity))*10; v_weight:=v_weight+10; end if;
    if p_physical is not null then v_weighted:=v_weighted+least(100,greatest(0,p_physical))*10; v_weight:=v_weight+10; end if;
    if p_aerial is not null then v_weighted:=v_weighted+least(100,greatest(0,p_aerial))*5; v_weight:=v_weight+5; end if;
  elsif v_group = 'CM' then
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*25; v_weight:=v_weight+25; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*25; v_weight:=v_weight+25; end if;
    if p_creativity is not null then v_weighted:=v_weighted+least(100,greatest(0,p_creativity))*20; v_weight:=v_weight+20; end if;
    if p_defending is not null then v_weighted:=v_weighted+least(100,greatest(0,p_defending))*15; v_weight:=v_weight+15; end if;
    if p_attacking is not null then v_weighted:=v_weighted+least(100,greatest(0,p_attacking))*5; v_weight:=v_weight+5; end if;
    if p_physical is not null then v_weighted:=v_weighted+least(100,greatest(0,p_physical))*10; v_weight:=v_weight+10; end if;
  elsif v_group = 'AM' then
    if p_creativity is not null then v_weighted:=v_weighted+least(100,greatest(0,p_creativity))*30; v_weight:=v_weight+30; end if;
    if p_attacking is not null then v_weighted:=v_weighted+least(100,greatest(0,p_attacking))*25; v_weight:=v_weight+25; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*20; v_weight:=v_weight+20; end if;
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*10; v_weight:=v_weight+10; end if;
    if p_physical is not null then v_weighted:=v_weighted+least(100,greatest(0,p_physical))*10; v_weight:=v_weight+10; end if;
    if p_defending is not null then v_weighted:=v_weighted+least(100,greatest(0,p_defending))*5; v_weight:=v_weight+5; end if;
  elsif v_group = 'W' then
    if p_attacking is not null then v_weighted:=v_weighted+least(100,greatest(0,p_attacking))*30; v_weight:=v_weight+30; end if;
    if p_creativity is not null then v_weighted:=v_weighted+least(100,greatest(0,p_creativity))*25; v_weight:=v_weight+25; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*25; v_weight:=v_weight+25; end if;
    if p_physical is not null then v_weighted:=v_weighted+least(100,greatest(0,p_physical))*10; v_weight:=v_weight+10; end if;
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*5; v_weight:=v_weight+5; end if;
    if p_defending is not null then v_weighted:=v_weighted+least(100,greatest(0,p_defending))*5; v_weight:=v_weight+5; end if;
  elsif v_group = 'ST' then
    if p_attacking is not null then v_weighted:=v_weighted+least(100,greatest(0,p_attacking))*45; v_weight:=v_weight+45; end if;
    if p_creativity is not null then v_weighted:=v_weighted+least(100,greatest(0,p_creativity))*15; v_weight:=v_weight+15; end if;
    if p_aerial is not null then v_weighted:=v_weighted+least(100,greatest(0,p_aerial))*15; v_weight:=v_weight+15; end if;
    if p_physical is not null then v_weighted:=v_weighted+least(100,greatest(0,p_physical))*15; v_weight:=v_weight+15; end if;
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*5; v_weight:=v_weight+5; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*5; v_weight:=v_weight+5; end if;
  else
    return null;
  end if;
  if v_weight < 50 then return null; end if;
  return v_weighted / v_weight;
end;
$function$


CREATE OR REPLACE FUNCTION private.djm_potential_age_adjustment(p_age integer, p_position_group text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_peak_start integer := case p_position_group
    when 'GK' then 27 when 'CB' then 26 when 'FB_WB' then 24
    when 'DM' then 25 when 'CM' then 25 when 'AM' then 24
    when 'W' then 23 when 'ST' then 24 else 24 end;
  v_peak_end integer := case p_position_group
    when 'GK' then 32 when 'CB' then 31 when 'FB_WB' then 29
    when 'DM' then 30 when 'CM' then 30 when 'AM' then 29
    when 'W' then 28 when 'ST' then 29 else 29 end;
begin
  if p_age is null then return null; end if;
  if p_age < v_peak_start then return least(12::numeric, 2 + (v_peak_start - p_age) * 2); end if;
  if p_age <= v_peak_end then return 0; end if;
  return -least(18::numeric, (p_age - v_peak_end) * 2);
end;
$function$


CREATE OR REPLACE FUNCTION private.djm_queue_channels(p_user_id uuid, p_kind text, p_title text, p_body text, p_url text, p_payload jsonb, p_dedupe_base text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'private', 'pg_catalog'
AS $function$
declare queued integer := 0;
begin
  if private.djm_queue_push(p_user_id,p_kind,p_title,p_body,p_url,p_payload,'push:' || p_dedupe_base) then queued := queued + 1; end if;
  if private.djm_queue_email(p_user_id,p_kind,p_title,p_body,p_url,p_payload,'email:' || p_dedupe_base) then queued := queued + 1; end if;
  return queued;
end;
$function$


CREATE OR REPLACE FUNCTION private.djm_queue_delivery(p_user_id uuid, p_kind text, p_title text, p_body text, p_url text, p_payload jsonb, p_dedupe_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'private', 'public', 'pg_catalog'
AS $function$
declare
  push_queued boolean:=false;
  email_queued boolean:=false;
  v_task_key text;
begin
  if p_payload ? 'task_id' then
    v_task_key:='system:task:'||coalesce(p_payload->>'task_id','');
    if exists(
      select 1
      from djm_os.home_item_controls c
      where c.user_id=p_user_id
        and c.item_key=v_task_key
        and (
          c.state='dismissed'
          or (c.state='snoozed' and c.snoozed_until>now())
        )
    ) then
      return false;
    end if;
  end if;

  push_queued:=private.djm_queue_push(p_user_id,p_kind,p_title,p_body,p_url,p_payload,p_dedupe_key);
  email_queued:=private.djm_queue_email(p_user_id,p_kind,p_title,p_body,p_url,p_payload,p_dedupe_key);
  return coalesce(push_queued,false) or coalesce(email_queued,false);
end;
$function$


CREATE OR REPLACE FUNCTION private.djm_queue_email(p_user_id uuid, p_kind text, p_title text, p_body text, p_url text, p_payload jsonb, p_dedupe_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare pref_enabled boolean; delivery_enabled boolean;
begin
  if p_user_id is null or p_dedupe_key is null then return false; end if;
  select email_enabled into pref_enabled from public.notification_preferences where user_id=p_user_id;
  select enabled and api_key is not null and from_address is not null into delivery_enabled from private.djm_email_config where singleton=true;
  if not coalesce(pref_enabled,false) or not coalesce(delivery_enabled,false) then return false; end if;
  insert into public.email_outbox(user_id,kind,title,body,url,payload,dedupe_key)
  values(p_user_id,p_kind,p_title,p_body,coalesce(p_url,'/home'),coalesce(p_payload,'{}'::jsonb),p_dedupe_key)
  on conflict(dedupe_key) do nothing;
  return found;
end;
$function$


CREATE OR REPLACE FUNCTION private.djm_queue_player_birthday_emails(p_today date DEFAULT NULL::date, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'djm_os', 'private', 'pg_catalog'
AS $function$
declare
  v_today date := coalesce(p_today,(now() at time zone 'Europe/Rome')::date);
  v_local_hour integer := extract(hour from (now() at time zone 'Europe/Rome'))::integer;
  v_delivery_enabled boolean := false;
  v_candidate_count integer := 0;
  v_recipient_count integer := 0;
  v_queued integer := 0;
  v_row record; v_recipient record; v_target_date date; v_phase text; v_age integer; v_title text; v_body text;
begin
  if p_today is null and not p_dry_run and v_local_hour <> 8 then
    return jsonb_build_object('local_date',v_today,'local_hour',v_local_hour,'skipped','outside_birthday_delivery_hour','queued',0,'dry_run',false);
  end if;
  select coalesce(c.enabled,false) and c.api_key is not null and c.from_address is not null into v_delivery_enabled
  from private.djm_email_config c where c.singleton=true;
  select count(*) into v_recipient_count from djm_os.team_members tm join auth.users au on au.id=tm.user_id where tm.is_active and nullif(trim(coalesce(au.email,'')),'') is not null;
  for v_row in
    select p.id,trim(concat_ws(' ',coalesce(nullif(trim(p.preferred_name),''),nullif(trim(p.first_name),'')),nullif(trim(p.last_name),''))) as display_name,p.date_of_birth,p.current_club
    from public.players p
    where p.date_of_birth is not null and p.football_status in ('active','free_agent','loan','injured')
      and ((extract(month from p.date_of_birth)=extract(month from v_today) and extract(day from p.date_of_birth)=extract(day from v_today))
        or (extract(month from p.date_of_birth)=extract(month from (v_today+1)) and extract(day from p.date_of_birth)=extract(day from (v_today+1))))
  loop
    if extract(month from v_row.date_of_birth)=extract(month from v_today) and extract(day from v_row.date_of_birth)=extract(day from v_today) then v_target_date:=v_today; v_phase:='today'; else v_target_date:=v_today+1; v_phase:='tomorrow'; end if;
    v_age:=extract(year from v_target_date)::integer-extract(year from v_row.date_of_birth)::integer;
    v_candidate_count:=v_candidate_count+1;
    if v_phase='today' then
      v_title:='Birthday today: '||v_row.display_name||' turns '||v_age::text;
      v_body:=v_row.display_name||' has a birthday today and turns '||v_age::text||'.'||case when nullif(trim(coalesce(v_row.current_club,'')),'') is not null then ' Current club: '||v_row.current_club||'.' else '' end||' A quick personal message from DJM is worth sending.';
    else
      v_title:='Tomorrow: '||v_row.display_name||' turns '||v_age::text;
      v_body:=v_row.display_name||' has a birthday tomorrow and turns '||v_age::text||'.'||case when nullif(trim(coalesce(v_row.current_club,'')),'') is not null then ' Current club: '||v_row.current_club||'.' else '' end||' This is an early reminder so DJM can be ready.';
    end if;
    if p_dry_run or not v_delivery_enabled then continue; end if;
    for v_recipient in select tm.user_id from djm_os.team_members tm join auth.users au on au.id=tm.user_id where tm.is_active and nullif(trim(coalesce(au.email,'')),'') is not null loop
      insert into public.email_outbox(user_id,kind,title,body,url,payload,dedupe_key,status)
      values(v_recipient.user_id,'player_birthday_'||v_phase,v_title,v_body,'/admin/players/'||v_row.id::text,
        jsonb_build_object('player_id',v_row.id,'player_name',v_row.display_name,'birthday',v_row.date_of_birth,'turning_age',v_age,'phase',v_phase,'target_date',v_target_date,'critical_agency_alert',true),
        'player-birthday:'||v_recipient.user_id::text||':'||v_row.id::text||':'||extract(year from v_target_date)::integer::text||':'||v_phase,'pending')
      on conflict(dedupe_key) do nothing;
      if found then v_queued:=v_queued+1; end if;
    end loop;
  end loop;
  return jsonb_build_object('local_date',v_today,'local_hour',v_local_hour,'delivery_configured',v_delivery_enabled,'birthday_candidates',v_candidate_count,'active_email_recipients',v_recipient_count,'queued',v_queued,'dry_run',p_dry_run);
end
$function$


commit;
