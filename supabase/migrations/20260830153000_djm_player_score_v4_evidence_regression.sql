begin;

-- DJM Player Score V4
--
-- V4 preserves the existing V2 Full Score and the V3 benchmark auto-resolution
-- pipeline, but replaces V3 provisional neutral-imputation with an evidence-
-- regressed provisional model.
--
-- Key rules:
--   * Missing components never receive a fabricated value.
--   * Provisional component weights favour actual performance evidence.
--   * Only observed components enter the provisional numerator/denominator.
--   * Thin evidence is regressed towards the neutral prior of 50.
--   * Confidence cannot exceed observed model coverage.
--   * Missing position-adjusted performance caps provisional confidence at 50%.
--   * model_score remains reserved for the Full Score only.

-- Preserve the deployed V3 wrapper as an immutable historical core. This keeps
-- benchmark auto-resolution and the V2 Full Score path intact and makes V4
-- reversible without copying that logic again.
do $$
begin
  if to_regprocedure('public.djm_player_scorecard_v3_core(uuid)') is null then
    if to_regprocedure('public.djm_player_scorecard(uuid)') is null then
      raise exception 'public.djm_player_scorecard(uuid) is required before V4';
    end if;

    alter function public.djm_player_scorecard(uuid)
      rename to djm_player_scorecard_v3_core;
  end if;
end
$$;

create or replace function public.djm_player_scorecard(p_player_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  r jsonb;
  s djm_os.player_scorecards%rowtype;
  b jsonb;
  v_status text;

  v_recent_minutes numeric := 0;
  v_level numeric;
  v_perf numeric;
  v_role numeric;
  v_exp numeric;
  v_trend numeric;
  v_avail numeric;

  v_observed_weight numeric := 0;
  v_weighted_total numeric := 0;
  v_raw_observed numeric;
  v_minutes_reliability numeric := 0;
  v_regression_factor numeric := 0;
  v_regression_prior numeric := 50;
  v_provisional numeric;
  v_conf integer := 0;

  v_missing jsonb := '[]'::jsonb;
  v_benchmark_freshness text := 'unknown';
  v_player_verified boolean := false;
  v_tier text := 'unavailable';
begin
  -- V3 still owns benchmark auto-resolution and the V2 Full Score calculation.
  r := public.djm_player_scorecard_v3_core(p_player_id);

  select * into s
  from djm_os.player_scorecards
  where player_id=p_player_id;

  if not found then
    return r;
  end if;

  b := coalesce(s.basis,'{}'::jsonb);
  v_status := s.score_status;

  select coalesce(p.verification_status='verified',false)
  into v_player_verified
  from public.players p
  where p.id=p_player_id;

  -- Manual judgment is still separate from every modelled value.
  if s.manual_score is not null then
    update djm_os.player_scorecards
    set
      provisional_score=null,
      provisional_confidence=null,
      score_tier='manual_override',
      missing_inputs='[]'::jsonb,
      model_version='djm_player_score_v4_manual_override',
      updated_at=now()
    where player_id=p_player_id;

    return r || jsonb_build_object(
      'display_score',s.manual_score,
      'provisional_score',null,
      'provisional_confidence',null,
      'score_tier','manual_override',
      'model_version','djm_player_score_v4_manual_override'
    );
  end if;

  -- A defensible V2 Full Score always outranks a provisional V4 estimate.
  if s.model_score is not null and v_status='calculated' then
    update djm_os.player_scorecards
    set
      provisional_score=null,
      provisional_confidence=null,
      score_tier='full',
      missing_inputs='[]'::jsonb,
      model_version='djm_player_score_v4_full_v2_core',
      updated_at=now()
    where player_id=p_player_id;

    return r || jsonb_build_object(
      'display_score',s.model_score,
      'provisional_score',null,
      'provisional_confidence',null,
      'score_tier','full',
      'model_version','djm_player_score_v4_full_v2_core'
    );
  end if;

  -- A V4 provisional score is allowed only when the player has meaningful
  -- recent senior minutes, a resolved league benchmark and a current role
  -- signal. Performance evidence is highly valuable but may still be absent.
  if v_status in ('performance_data_required','not_enough_model_coverage')
    and coalesce((b->>'recent_minutes_24m')::numeric,0) >= 500
    and nullif(b->>'level_score','') is not null
    and nullif(b->>'role_score','') is not null
  then
    v_recent_minutes := coalesce((b->>'recent_minutes_24m')::numeric,0);
    v_level := nullif(b->>'level_score','')::numeric;
    v_perf := nullif(b->>'performance_score','')::numeric;
    v_role := nullif(b->>'role_score','')::numeric;
    v_exp := nullif(b->>'experience_score','')::numeric;
    v_trend := nullif(b->>'trend_score','')::numeric;
    v_avail := nullif(b->>'availability_score','')::numeric;
    v_benchmark_freshness := coalesce(b->>'benchmark_freshness','unknown');

    if v_perf is null then
      v_missing := v_missing || jsonb_build_array('position_adjusted_performance');
    end if;
    if v_exp is null then
      v_missing := v_missing || jsonb_build_array('experience');
    end if;
    if v_trend is null then
      v_missing := v_missing || jsonb_build_array('trend');
    end if;
    if v_avail is null then
      v_missing := v_missing || jsonb_build_array('availability');
    end if;

    -- V4 provisional weights. Performance evidence carries the largest single
    -- weight. League context alone can no longer dominate the estimate.
    if v_level is not null then
      v_weighted_total := v_weighted_total + v_level * 20;
      v_observed_weight := v_observed_weight + 20;
    end if;
    if v_perf is not null then
      v_weighted_total := v_weighted_total + v_perf * 40;
      v_observed_weight := v_observed_weight + 40;
    end if;
    if v_role is not null then
      v_weighted_total := v_weighted_total + v_role * 20;
      v_observed_weight := v_observed_weight + 20;
    end if;
    if v_exp is not null then
      v_weighted_total := v_weighted_total + v_exp * 10;
      v_observed_weight := v_observed_weight + 10;
    end if;
    if v_trend is not null then
      v_weighted_total := v_weighted_total + v_trend * 5;
      v_observed_weight := v_observed_weight + 5;
    end if;
    if v_avail is not null then
      v_weighted_total := v_weighted_total + v_avail * 5;
      v_observed_weight := v_observed_weight + 5;
    end if;

    -- Level + role supply 40 points of possible observed coverage. If even that
    -- minimum is not present, publishing a number would imply false precision.
    if v_observed_weight >= 40 then
      v_raw_observed := v_weighted_total / v_observed_weight;

      -- Minutes reliability reaches 1.0 around a substantial 1,800-minute
      -- evidence base. sqrt() avoids treating 500 minutes as equivalent to a
      -- full season while still recognising that it is meaningful evidence.
      v_minutes_reliability := least(
        1::numeric,
        sqrt(greatest(v_recent_minutes,0) / 1800.0)
      );

      -- Evidence regression is the core V4 protection against thin-data
      -- overconfidence. The raw observed score is pulled towards 50 according
      -- to observed component coverage and recent-minute reliability. Even a
      -- near-complete provisional case is capped below full-model certainty.
      v_regression_factor := least(
        .85::numeric,
        (v_observed_weight / 100.0) * (.55 + .45 * v_minutes_reliability)
      );

      v_provisional := least(
        100::numeric,
        greatest(
          0::numeric,
          v_regression_prior
            + (v_raw_observed - v_regression_prior) * v_regression_factor
        )
      );

      -- Confidence is driven by evidence, not by the score itself. It is never
      -- allowed to exceed observed model coverage. Missing deep performance
      -- evidence imposes a hard 50% confidence ceiling.
      v_conf := least(
        round(v_observed_weight)::int,
        case when v_perf is null then 50 else 72 end,
        round(
          10
          + v_observed_weight * .45
          + v_minutes_reliability * 20
          + case v_benchmark_freshness
              when 'fresh' then 8
              when 'aging' then 5
              when 'stale' then 2
              else 0
            end
          + case when v_perf is not null then 10 else 0 end
          + case when v_player_verified then 5 else 0 end
        )::int
      );

      v_tier := 'provisional';

      -- Remove V3 provisional metadata before attaching the V4 methodology.
      b := b
        - 'provisional_score'
        - 'provisional_confidence'
        - 'provisional_methodology'
        - 'provisional_missing_inputs'
        - 'provisional_comparison_rule';

      b := b || jsonb_build_object(
        'score_tier','provisional',
        'provisional_score',round(v_provisional),
        'provisional_confidence',v_conf,
        'provisional_methodology',
          'Evidence-regressed provisional current-level estimate. Only observed components are scored. Missing components are omitted rather than filled. The observed estimate is then regressed towards 50 according to evidence coverage and recent-minute reliability.',
        'provisional_missing_inputs',v_missing,
        'provisional_component_weights',jsonb_build_object(
          'level',20,
          'position_performance',40,
          'role_minutes',20,
          'experience',10,
          'trend',5,
          'availability',5
        ),
        'provisional_observed_weight',round(v_observed_weight),
        'provisional_raw_observed_score',round(v_raw_observed,2),
        'provisional_regression_prior',v_regression_prior,
        'provisional_minutes_reliability',round(v_minutes_reliability,4),
        'provisional_regression_factor',round(v_regression_factor,4),
        'provisional_performance_present',(v_perf is not null),
        'provisional_confidence_rule',
          'Confidence cannot exceed observed component coverage. Without position-adjusted performance evidence it cannot exceed 50%.',
        'provisional_comparison_rule',
          'Compare provisional ratings only with the provisional label, confidence and missing inputs visible. Full Scores remain the preferred cross-player measure.'
      );

      update djm_os.player_scorecards
      set
        provisional_score=round(v_provisional)::smallint,
        provisional_confidence=v_conf::smallint,
        score_tier=v_tier,
        missing_inputs=v_missing,
        basis=b,
        data_coverage=round(v_observed_weight)::smallint,
        model_version='djm_player_score_v4_evidence_regressed',
        calculated_at=now(),
        updated_at=now()
      where player_id=p_player_id;

      insert into djm_os.events(
        event_type,actor_user_id,player_id,payload,source,confidence,occurred_at
      )
      values(
        'PLAYER_SCORE_PROVISIONAL_CALCULATED',
        auth.uid(),
        p_player_id,
        jsonb_build_object(
          'provisional_score',round(v_provisional),
          'provisional_confidence',v_conf,
          'underlying_status',v_status,
          'observed_weight',round(v_observed_weight),
          'raw_observed_score',round(v_raw_observed,2),
          'regression_factor',round(v_regression_factor,4),
          'missing_inputs',v_missing,
          'model_version','djm_player_score_v4_evidence_regressed'
        ),
        'evidence_regressed_model',
        v_conf::numeric/100,
        now()
      );

      return r || jsonb_build_object(
        'display_score',round(v_provisional),
        'provisional_score',round(v_provisional),
        'provisional_confidence',v_conf,
        'score_tier','provisional',
        'missing_inputs',v_missing,
        'model_version','djm_player_score_v4_evidence_regressed',
        'basis',b
      );
    end if;
  end if;

  -- If the minimum evidence gate is not met, V4 publishes no number.
  update djm_os.player_scorecards
  set
    provisional_score=null,
    provisional_confidence=null,
    score_tier='unavailable',
    missing_inputs='[]'::jsonb,
    model_version='djm_player_score_v4_evidence_regressed',
    updated_at=now()
  where player_id=p_player_id;

  return r || jsonb_build_object(
    'display_score',null,
    'provisional_score',null,
    'provisional_confidence',null,
    'score_tier','unavailable',
    'model_version','djm_player_score_v4_evidence_regressed'
  );
end;
$$;

revoke all on function public.djm_player_scorecard(uuid) from public, anon;
grant execute on function public.djm_player_scorecard(uuid) to authenticated, service_role;

comment on function public.djm_player_scorecard(uuid) is
  'DJM Player Score V4 wrapper. Preserves the V2 Full Score and V3 benchmark resolution, while provisional scores use observed-only component weighting, evidence regression and confidence ceilings to prevent thin-data overconfidence.';

notify pgrst,'reload schema';

commit;
