-- DJM Global Intelligence V9 completion
-- Canonicalises V7.1 as the only active signed-player score path and adds a
-- universal subject-level five-year development projection with explicit uncertainty.
-- V5 remains available only via djm_player_scorecard_v5_preview for audit/research.

create table if not exists djm_os.football_subject_projection_snapshots (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references djm_os.football_intelligence_subjects(id) on delete cascade,
  as_of_date date not null default current_date,
  horizon_years smallint not null default 5 check (horizon_years between 1 and 10),
  current_score numeric(5,2),
  forecast_y1 numeric(5,2),
  forecast_y3 numeric(5,2),
  forecast_y5 numeric(5,2),
  ceiling_score numeric(5,2),
  lower_bound_score numeric(5,2),
  upper_bound_score numeric(5,2),
  confidence smallint not null default 0 check (confidence between 0 and 100),
  projection_state text not null default 'unavailable',
  position_group text,
  age_years numeric(5,2),
  career_history_depth integer not null default 0,
  drivers jsonb not null default '{}'::jsonb,
  input_summary jsonb not null default '{}'::jsonb,
  model_version text not null,
  methodology_version text not null,
  input_fingerprint text,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subject_id, as_of_date, horizon_years, model_version)
);

create index if not exists football_subject_projection_subject_date_idx
  on djm_os.football_subject_projection_snapshots(subject_id, as_of_date desc, calculated_at desc);

revoke all on djm_os.football_subject_projection_snapshots from public, anon, authenticated;
grant select, insert, update, delete on djm_os.football_subject_projection_snapshots to service_role;

comment on table djm_os.football_subject_projection_snapshots is
  'Universal signed-player/prospect development projections. These are uncertainty-aware research priors until DJM has enough longitudinal outcomes for a calibrated ML ensemble.';

create or replace function djm_os.normalise_projection_position(p_position text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when upper(coalesce(p_position,'')) in ('GK','GOALKEEPER') then 'GK'
    when upper(coalesce(p_position,'')) in ('CB','CENTRE BACK','CENTER BACK','CENTRE-BACK','CENTER-BACK') then 'CB'
    when upper(coalesce(p_position,'')) in ('FB_WB','LB','RB','LWB','RWB','FULL BACK','FULLBACK','WING BACK','WINGBACK') then 'FB_WB'
    when upper(coalesce(p_position,'')) in ('DM','CDM','DEFENSIVE MIDFIELD','DEFENSIVE MIDFIELDER') then 'DM'
    when upper(coalesce(p_position,'')) in ('CM','CENTRAL MIDFIELD','CENTRAL MIDFIELDER') then 'CM'
    when upper(coalesce(p_position,'')) in ('AM','CAM','ATTACKING MIDFIELD','ATTACKING MIDFIELDER','10','NO.10','NO 10') then 'AM'
    when upper(coalesce(p_position,'')) in ('W','LW','RW','WINGER','LEFT WINGER','RIGHT WINGER') then 'W'
    when upper(coalesce(p_position,'')) in ('ST','CF','STRIKER','CENTRE FORWARD','CENTER FORWARD') then 'ST'
    else null
  end;
$$;


-- Bridge reviewed deep-performance imports into the universal V7.1 production signal.
-- The original provider/cohort model stays intact and wins whenever it has equal or
-- better evidence quality. A reviewed snapshot is therefore additive, not a shortcut.
create or replace function djm_os.position_category_weights(p_position_group text)
returns table(category text, nominal_weight numeric)
language sql
immutable
set search_path = ''
as $$
  select v.category, v.nominal_weight
  from (values
    ('GK','goalkeeping',55::numeric),('GK','aerial',15),('GK','possession',15),('GK','physical',10),('GK','discipline',5),
    ('CB','defending',30),('CB','aerial',25),('CB','possession',20),('CB','progression',15),('CB','physical',10),
    ('FB_WB','defending',20),('FB_WB','progression',25),('FB_WB','creativity',15),('FB_WB','possession',10),('FB_WB','physical',20),('FB_WB','attacking',10),
    ('DM','defending',20),('DM','possession',25),('DM','progression',25),('DM','creativity',10),('DM','physical',10),('DM','discipline',10),
    ('CM','possession',25),('CM','progression',25),('CM','creativity',20),('CM','attacking',10),('CM','defending',10),('CM','physical',5),('CM','discipline',5),
    ('AM','creativity',30),('AM','attacking',25),('AM','progression',20),('AM','possession',10),('AM','physical',5),('AM','discipline',10),
    ('W','attacking',30),('W','creativity',25),('W','progression',20),('W','physical',15),('W','possession',5),('W','discipline',5),
    ('ST','attacking',50),('ST','creativity',15),('ST','physical',15),('ST','aerial',10),('ST','possession',5),('ST','discipline',5)
  ) as v(position_group, category, nominal_weight)
  where v.position_group = p_position_group;
$$;

create or replace function djm_os.subject_reviewed_performance_signal(p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subject djm_os.football_intelligence_subjects%rowtype;
  snap djm_os.player_performance_snapshots%rowtype;
  v_position text;
  v_percentiles jsonb;
  v_total numeric := 0;
  v_used_weight numeric := 0;
  v_score numeric;
  v_value numeric;
  v_confidence numeric;
  v_recency_q numeric;
  v_minutes_q numeric;
  v_coverage_q numeric;
  v_source_q numeric;
  v_quality numeric;
  v_peer_n integer := 0;
  v_details jsonb := '{}'::jsonb;
  w record;
begin
  select * into v_subject
  from djm_os.football_intelligence_subjects s
  where s.id = p_subject_id;

  if not found or v_subject.player_id is null then
    return jsonb_build_object('score',null,'quality',0,'reason','signed_player_snapshot_unavailable');
  end if;

  select * into snap
  from djm_os.player_performance_snapshots ps
  where ps.player_id = v_subject.player_id
    and ps.verified_at is not null
    and coalesce(ps.minutes,0) >= 180
    and coalesce(ps.evidence_date, current_date) >= current_date - 730
  order by ps.evidence_date desc nulls last, ps.verified_at desc nulls last, ps.updated_at desc
  limit 1;

  if not found then
    return jsonb_build_object('score',null,'quality',0,'reason','reviewed_performance_snapshot_unavailable');
  end if;

  v_position := coalesce(
    nullif(snap.position_group,'UNKNOWN'),
    nullif(private.djm_position_group(v_subject.primary_position),'UNKNOWN'),
    djm_os.normalise_projection_position(v_subject.primary_position)
  );
  if v_position is null then
    return jsonb_build_object('score',null,'quality',0,'reason','position_group_required');
  end if;

  v_percentiles := jsonb_build_object(
    'attacking',snap.attacking_percentile,
    'creativity',snap.creativity_percentile,
    'progression',snap.progression_percentile,
    'possession',snap.possession_percentile,
    'defending',snap.defending_percentile,
    'aerial',snap.aerial_percentile,
    'goalkeeping',snap.goalkeeping_percentile,
    'physical',snap.physical_percentile,
    'discipline',snap.discipline_percentile
  );

  for w in select * from djm_os.position_category_weights(v_position) loop
    v_value := djm_os.safe_json_number(v_percentiles ->> w.category);
    if v_value is null then continue; end if;
    v_total := v_total + v_value * w.nominal_weight;
    v_used_weight := v_used_weight + w.nominal_weight;
    v_details := v_details || jsonb_build_object(
      w.category,
      jsonb_build_object('percentile',round(v_value,2),'weight',w.nominal_weight)
    );
  end loop;

  if v_used_weight >= 35 then
    v_score := v_total / v_used_weight;
  elsif snap.overall_performance_percentile is not null then
    v_score := snap.overall_performance_percentile;
    v_used_weight := greatest(v_used_weight, 50);
    v_details := v_details || jsonb_build_object(
      'overall',jsonb_build_object('percentile',round(snap.overall_performance_percentile,2),'fallback',true)
    );
  else
    return jsonb_build_object(
      'score',null,'quality',0,'reason','insufficient_reviewed_percentile_coverage',
      'position_group',v_position,'category_coverage_pct',round(v_used_weight,1)
    );
  end if;

  v_confidence := greatest(.35, least(.95, coalesce(snap.confidence,.65)));
  v_recency_q := case
    when snap.evidence_date is null then .65
    when snap.evidence_date >= current_date - 180 then 1
    when snap.evidence_date >= current_date - 365 then .85
    when snap.evidence_date >= current_date - 730 then .65
    else .40
  end;
  v_minutes_q := least(1::numeric, coalesce(snap.minutes,0) / 900.0);
  v_coverage_q := least(1::numeric, v_used_weight / 70.0);
  v_peer_n := coalesce(round(djm_os.safe_json_number(snap.metadata ->> 'peer_cohort_size'))::integer,0);
  v_source_q := case
    when lower(coalesce(snap.provider,'')) in ('pitchapi','wyscout') then 1
    when lower(coalesce(snap.provider,'')) = 'official_league' then .90
    when lower(coalesce(snap.provider,'')) = 'json_import'
      and coalesce(djm_os.safe_json_number(snap.metadata #>> '{percentile_derivation,peer_count}'),v_peer_n,0) >= 10 then .85
    when lower(coalesce(snap.provider,'')) = 'json_import' then .70
    else .78
  end;
  v_quality := least(.88::numeric, v_confidence * v_recency_q * v_minutes_q * v_coverage_q * v_source_q);

  return jsonb_build_object(
    'score',round(v_score,2),
    'quality',round(v_quality,3),
    'role',v_position,
    'provider',snap.provider,
    'source_name',snap.source_name,
    'source_reference',snap.source_reference,
    'evidence_date',snap.evidence_date,
    'minutes',snap.minutes,
    'category_coverage_pct',round(v_used_weight,1),
    'peer_cohort_size',v_peer_n,
    'metrics',v_details,
    'evidence_mode','reviewed_percentile_snapshot',
    'rule','A reviewed percentile snapshot may replace the provider/cohort production signal only when its evidence-quality score is higher. Missing categories are never zero-imputed.'
  );
end;
$$;

do $$
begin
  if to_regprocedure('djm_os.subject_position_production_provider_v7(uuid)') is null
     and to_regprocedure('djm_os.subject_position_production(uuid)') is not null then
    alter function djm_os.subject_position_production(uuid) rename to subject_position_production_provider_v7;
  end if;
end;
$$;

create or replace function djm_os.subject_position_production(p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  provider_signal jsonb;
  reviewed_signal jsonb;
  provider_quality numeric;
  reviewed_quality numeric;
begin
  provider_signal := djm_os.subject_position_production_provider_v7(p_subject_id);
  reviewed_signal := djm_os.subject_reviewed_performance_signal(p_subject_id);
  provider_quality := coalesce(djm_os.safe_json_number(provider_signal ->> 'quality'),0);
  reviewed_quality := coalesce(djm_os.safe_json_number(reviewed_signal ->> 'quality'),0);

  if djm_os.safe_json_number(reviewed_signal ->> 'score') is not null
     and reviewed_quality > provider_quality then
    return reviewed_signal || jsonb_build_object(
      'selected_over_provider_quality',round(provider_quality,3),
      'selection_rule','highest_quality_verified_position_signal'
    );
  end if;

  return provider_signal || jsonb_build_object(
    'reviewed_snapshot_quality',round(reviewed_quality,3),
    'selection_rule','highest_quality_verified_position_signal'
  );
end;
$$;


create or replace function djm_os.refresh_subject_from_player_performance_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := coalesce(new.player_id, old.player_id);
  v_subject_id uuid;
begin
  select s.id into v_subject_id
  from djm_os.football_intelligence_subjects s
  where s.player_id = v_player_id
  limit 1;

  if v_subject_id is not null then
    perform djm_os.refresh_football_subject_scorecard(v_subject_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_global_score_from_reviewed_performance on djm_os.player_performance_snapshots;
create trigger trg_global_score_from_reviewed_performance
after insert or update or delete on djm_os.player_performance_snapshots
for each row execute function djm_os.refresh_subject_from_player_performance_trigger();

revoke all on function djm_os.refresh_subject_from_player_performance_trigger() from public, anon, authenticated;
revoke all on function djm_os.position_category_weights(text) from public, anon, authenticated;
revoke all on function djm_os.subject_reviewed_performance_signal(uuid) from public, anon, authenticated;
revoke all on function djm_os.subject_position_production(uuid) from public, anon, authenticated;
revoke all on function djm_os.subject_position_production_provider_v7(uuid) from public, anon, authenticated;
grant execute on function djm_os.refresh_subject_from_player_performance_trigger() to service_role;
grant execute on function djm_os.position_category_weights(text) to service_role;
grant execute on function djm_os.subject_reviewed_performance_signal(uuid) to service_role;
grant execute on function djm_os.subject_position_production(uuid) to service_role;
grant execute on function djm_os.subject_position_production_provider_v7(uuid) to service_role;

create or replace function djm_os.refresh_football_subject_projection(p_subject_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject djm_os.football_intelligence_subjects%rowtype;
  v_score djm_os.football_subject_scorecards%rowtype;
  v_position text;
  v_age numeric;
  v_age_integer integer;
  v_age_prior numeric;
  v_headroom numeric;
  v_current numeric;
  v_y1 numeric;
  v_y3 numeric;
  v_y5 numeric;
  v_ceiling numeric;
  v_confidence integer;
  v_width numeric;
  v_low numeric;
  v_high numeric;
  v_career_depth integer;
  v_source_diversity integer;
  v_fingerprint text;
  v_state text;
  v_projection jsonb;
begin
  select * into v_subject
  from djm_os.football_intelligence_subjects s
  where s.id = p_subject_id;

  if not found then
    return jsonb_build_object('available', false, 'reason', 'subject_not_found');
  end if;

  select * into v_score
  from djm_os.football_subject_scorecards sc
  where sc.subject_id = p_subject_id;

  if v_score.subject_id is null or v_score.display_score is null then
    return jsonb_build_object('available', false, 'reason', 'current_score_unavailable');
  end if;

  if v_subject.date_of_birth is null then
    return jsonb_build_object('available', false, 'reason', 'date_of_birth_required');
  end if;

  v_position := coalesce(nullif(v_score.position_group, 'UNKNOWN'), djm_os.normalise_projection_position(v_subject.primary_position));
  if v_position is null then
    return jsonb_build_object('available', false, 'reason', 'position_group_required');
  end if;

  if coalesce(v_score.basis ->> 'score_state', 'enriching') not in ('usable', 'decision_ready', 'ready', 'elite_evidence')
     or coalesce(v_score.confidence, 0) < 45
     or coalesce(v_score.data_coverage, 0) < 40 then
    return jsonb_build_object(
      'available', false,
      'reason', 'current_score_not_yet_projection_grade',
      'current_score', v_score.display_score,
      'current_confidence', v_score.confidence,
      'data_coverage', v_score.data_coverage,
      'score_state', v_score.basis ->> 'score_state'
    );
  end if;

  v_age := extract(year from age(current_date, v_subject.date_of_birth))
           + extract(month from age(current_date, v_subject.date_of_birth)) / 12.0
           + extract(day from age(current_date, v_subject.date_of_birth)) / 365.25;
  v_age_integer := floor(v_age)::integer;
  v_age_prior := private.djm_potential_age_adjustment(v_age_integer, v_position);
  v_current := v_score.display_score::numeric;

  -- This is deliberately a conservative development prior, not a trained success model.
  -- Positive headroom is damped into the expected path. Post-peak priors model decline.
  v_headroom := case
    when v_age_prior > 0 then least(10::numeric, v_age_prior)
    when v_age_prior = 0 then 1.25
    else greatest(-12::numeric, v_age_prior * 0.65)
  end;

  v_y1 := greatest(0, least(100, v_current + v_headroom * 0.375));
  v_y3 := greatest(0, least(100, v_current + v_headroom * 0.65));
  v_y5 := greatest(0, least(100, v_current + v_headroom * 0.75));
  v_ceiling := greatest(
    v_current,
    least(100, v_current + case when v_headroom > 0 then v_headroom * 2.45 else 2 end)
  );

  select count(*)::integer into v_career_depth
  from djm_os.football_subject_career_entries ce
  where ce.subject_id = p_subject_id;

  select count(distinct provider)::integer into v_source_diversity
  from djm_os.football_subject_provider_snapshots ps
  where ps.subject_id = p_subject_id;

  v_confidence := round(least(
    85::numeric,
    greatest(
      20::numeric,
      coalesce(v_score.confidence,0) * 0.58
      + coalesce(v_score.data_coverage,0) * 0.22
      + least(v_career_depth, 5) * 2
      + least(v_source_diversity, 3) * 1.5
    )
  ))::integer;

  v_width := greatest(6::numeric, least(18::numeric, 18 - v_confidence * 0.12));
  v_low := greatest(0, v_y5 - v_width);
  v_high := least(100, v_y5 + v_width);
  v_state := case
    when v_confidence >= 70 then 'decision_support'
    when v_confidence >= 50 then 'directional'
    else 'early_prior'
  end;

  v_fingerprint := md5(concat_ws('|',
    p_subject_id::text,
    v_score.model_version,
    v_score.display_score::text,
    v_score.confidence::text,
    v_score.data_coverage::text,
    v_score.calculated_at::text,
    v_subject.date_of_birth::text,
    v_position,
    v_career_depth::text,
    v_source_diversity::text
  ));

  insert into djm_os.football_subject_projection_snapshots (
    subject_id, as_of_date, horizon_years, current_score,
    forecast_y1, forecast_y3, forecast_y5, ceiling_score,
    lower_bound_score, upper_bound_score, confidence, projection_state,
    position_group, age_years, career_history_depth,
    drivers, input_summary, model_version, methodology_version,
    input_fingerprint, calculated_at, updated_at
  ) values (
    p_subject_id, current_date, 5, v_current,
    round(v_y1,2), round(v_y3,2), round(v_y5,2), round(v_ceiling,2),
    round(v_low,2), round(v_high,2), v_confidence, v_state,
    v_position, round(v_age,2), v_career_depth,
    jsonb_build_object(
      'age_position_headroom', round(v_headroom,2),
      'age_position_prior', round(v_age_prior,2),
      'source_diversity', v_source_diversity,
      'trajectory', jsonb_build_array(
        jsonb_build_object('year',0,'score',round(v_current,2)),
        jsonb_build_object('year',1,'score',round(v_y1,2)),
        jsonb_build_object('year',3,'score',round(v_y3,2)),
        jsonb_build_object('year',5,'score',round(v_y5,2))
      ),
      'interpretation', 'Expected development path under a conservative position-and-age prior. Ceiling is an upside scenario, not a promise.'
    ),
    jsonb_build_object(
      'current_model_version', v_score.model_version,
      'current_score', v_score.display_score,
      'evidence_confidence', v_score.confidence,
      'data_coverage', v_score.data_coverage,
      'evidence_grade', v_score.basis ->> 'evidence_grade',
      'age', round(v_age,2),
      'position_group', v_position,
      'career_history_depth', v_career_depth,
      'independent_provider_count', v_source_diversity
    ),
    'djm_projection_prior_v1',
    'age_position_uncertainty_prior_v1',
    v_fingerprint,
    now(), now()
  )
  on conflict (subject_id, as_of_date, horizon_years, model_version)
  do update set
    current_score = excluded.current_score,
    forecast_y1 = excluded.forecast_y1,
    forecast_y3 = excluded.forecast_y3,
    forecast_y5 = excluded.forecast_y5,
    ceiling_score = excluded.ceiling_score,
    lower_bound_score = excluded.lower_bound_score,
    upper_bound_score = excluded.upper_bound_score,
    confidence = excluded.confidence,
    projection_state = excluded.projection_state,
    position_group = excluded.position_group,
    age_years = excluded.age_years,
    career_history_depth = excluded.career_history_depth,
    drivers = excluded.drivers,
    input_summary = excluded.input_summary,
    methodology_version = excluded.methodology_version,
    input_fingerprint = excluded.input_fingerprint,
    calculated_at = excluded.calculated_at,
    updated_at = now();

  select jsonb_build_object(
    'available', true,
    'subject_id', p_subject_id,
    'current_score', round(v_current,2),
    'forecast_score', round(v_y5,2),
    'forecast_y1', round(v_y1,2),
    'forecast_y3', round(v_y3,2),
    'forecast_y5', round(v_y5,2),
    'ceiling_score', round(v_ceiling,2),
    'range_low', round(v_low,2),
    'range_high', round(v_high,2),
    'confidence', v_confidence,
    'projection_state', v_state,
    'age', round(v_age,2),
    'position_group', v_position,
    'career_history_depth', v_career_depth,
    'model_version', 'djm_projection_prior_v1',
    'methodology_version', 'age_position_uncertainty_prior_v1',
    'input_fingerprint', v_fingerprint,
    'trajectory', jsonb_build_array(
      jsonb_build_object('year',0,'score',round(v_current,2)),
      jsonb_build_object('year',1,'score',round(v_y1,2)),
      jsonb_build_object('year',3,'score',round(v_y3,2)),
      jsonb_build_object('year',5,'score',round(v_y5,2))
    ),
    'calibrated_probability', false,
    'training_state', 'research_prior_until_longitudinal_outcomes_are_sufficient'
  ) into v_projection;

  return v_projection;
end;
$$;

comment on function djm_os.refresh_football_subject_projection(uuid) is
  'Creates an uncertainty-aware five-year development prior for a universal football subject. Not a calibrated career-success probability.';

create or replace function djm_os.refresh_projection_from_score_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform djm_os.refresh_football_subject_projection(new.subject_id);
  return new;
end;
$$;

drop trigger if exists trg_football_subject_projection_refresh on djm_os.football_subject_scorecards;
create trigger trg_football_subject_projection_refresh
after insert or update of display_score, confidence, data_coverage, position_group, model_version
on djm_os.football_subject_scorecards
for each row execute function djm_os.refresh_projection_from_score_trigger();

create or replace function public.djm_subject_global_intelligence(p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.djm_player_global_intelligence(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_subject_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  select s.id into v_subject_id from djm_os.football_intelligence_subjects s where s.player_id=p_player_id limit 1;
  if v_subject_id is null then
    return jsonb_build_object('available',false,'reason','global_subject_not_initialised','player_id',p_player_id);
  end if;
  return public.djm_subject_global_intelligence(v_subject_id);
end;
$$;

create or replace function public.djm_refresh_subject_global_intelligence(p_subject_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  -- The scorecard write triggers the projection refresh, so one canonical rebuild is enough.
  perform djm_os.refresh_football_subject_scorecard(p_subject_id);
  return public.djm_subject_global_intelligence(p_subject_id);
end;
$$;

create or replace function public.djm_refresh_player_global_intelligence(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_subject_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  select s.id into v_subject_id from djm_os.football_intelligence_subjects s where s.player_id=p_player_id limit 1;
  if v_subject_id is null then
    return jsonb_build_object('available',false,'reason','global_subject_not_initialised','player_id',p_player_id);
  end if;
  return public.djm_refresh_subject_global_intelligence(v_subject_id);
end;
$$;

-- Compatibility contract: old callers now receive the canonical global model.
-- V5 compute remains available explicitly through djm_player_scorecard_v5_preview.
create or replace function public.djm_player_scorecard(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intel jsonb;
  v_score jsonb;
  v_projection jsonb;
  v_tier text;
  v_display numeric;
begin
  if not djm_os.is_team_member() and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'DJM team access required';
  end if;
  v_intel := public.djm_refresh_player_global_intelligence(p_player_id);
  v_score := coalesce(v_intel -> 'scorecard','{}'::jsonb);
  v_projection := coalesce(v_intel -> 'projection','{}'::jsonb);
  v_tier := coalesce(v_score ->> 'score_tier','unavailable');
  v_display := nullif(v_score ->> 'display_score','')::numeric;
  return v_score || jsonb_build_object(
    'display_score',v_display,
    'model_score',case when v_tier='full' then v_display else null end,
    'provisional_score',case when v_tier<>'full' then v_display else null end,
    'provisional_confidence',nullif(v_score ->> 'confidence','')::numeric,
    'potential_score',nullif(v_projection ->> 'forecast_score','')::numeric,
    'potential_model_score',nullif(v_projection ->> 'forecast_score','')::numeric,
    'model_status',coalesce(v_score ->> 'score_state',v_tier),
    'basis',jsonb_build_object(
      'evidence_band',v_score -> 'evidence_band',
      'effective_evidence_coverage',v_score -> 'data_coverage',
      'global_model',true,
      'projection',v_projection
    )
  );
end;
$$;

comment on function public.djm_player_scorecard(uuid) is
  'Backward-compatible RPC name. Since V9 it returns the authoritative global score and no longer computes or writes V5.';

-- Preserve the existing peer/league comparison machinery, but replace its score payload
-- with the authoritative global score and the uncertainty-aware five-year forecast.
do $$
begin
  if to_regprocedure('public.djm_player_comparison_legacy_v5(uuid,uuid)') is null
     and to_regprocedure('public.djm_player_comparison(uuid,uuid)') is not null then
    alter function public.djm_player_comparison(uuid,uuid) rename to djm_player_comparison_legacy_v5;
  end if;
end;
$$;

revoke all on function public.djm_player_comparison_legacy_v5(uuid,uuid) from public, anon, authenticated;
grant execute on function public.djm_player_comparison_legacy_v5(uuid,uuid) to service_role;
comment on function public.djm_player_comparison_legacy_v5(uuid,uuid) is
  'Legacy V5 comparison payload retained only as an internal peer/league data source for the V9 global wrapper.';

create or replace function public.djm_player_comparison(p_player_id uuid, p_compare_competition_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base jsonb;
  v_intel jsonb;
  v_score jsonb;
  v_projection jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' and not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  v_base := public.djm_player_comparison_legacy_v5(p_player_id,p_compare_competition_id);
  v_intel := public.djm_player_global_intelligence(p_player_id);
  v_score := coalesce(v_intel -> 'scorecard','{}'::jsonb);
  v_projection := coalesce(v_intel -> 'projection','{}'::jsonb);
  v_base := jsonb_set(v_base,'{scorecard}',v_score || jsonb_build_object(
    'potential_score',nullif(v_projection ->> 'forecast_score','')::numeric,
    'projection',v_projection
  ),true);
  v_base := jsonb_set(v_base,'{projection}',v_projection,true);
  v_base := jsonb_set(v_base,'{semantics,current_level}',to_jsonb('DJM Global Score V7.1 current demonstrated level'::text),true);
  v_base := jsonb_set(v_base,'{semantics,potential}',to_jsonb('Five-year uncertainty-aware development forecast. Not a calibrated probability of career success.'::text),true);
  return v_base;
end;
$$;

revoke all on function public.djm_subject_global_intelligence(uuid) from public, anon;
revoke all on function public.djm_refresh_subject_global_intelligence(uuid) from public, anon;
revoke all on function public.djm_player_global_intelligence(uuid) from public, anon;
revoke all on function public.djm_refresh_player_global_intelligence(uuid) from public, anon;
revoke all on function public.djm_player_scorecard(uuid) from public, anon;
revoke all on function public.djm_player_comparison(uuid,uuid) from public, anon;

grant execute on function public.djm_subject_global_intelligence(uuid) to authenticated, service_role;
grant execute on function public.djm_refresh_subject_global_intelligence(uuid) to authenticated, service_role;
grant execute on function public.djm_player_global_intelligence(uuid) to authenticated, service_role;
grant execute on function public.djm_refresh_player_global_intelligence(uuid) to authenticated, service_role;
grant execute on function public.djm_player_scorecard(uuid) to authenticated, service_role;
grant execute on function public.djm_player_comparison(uuid,uuid) to authenticated, service_role;

-- Backfill projections only where the current global scorer and identity make one defensible.
do $$
declare r record;
begin
  for r in
    select s.id
    from djm_os.football_intelligence_subjects s
    join djm_os.football_subject_scorecards sc on sc.subject_id=s.id
    where sc.display_score is not null and s.date_of_birth is not null
  loop
    begin
      perform djm_os.refresh_football_subject_projection(r.id);
    exception when others then
      -- A missing/ambiguous position remains unknown rather than blocking the migration.
      null;
    end;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
