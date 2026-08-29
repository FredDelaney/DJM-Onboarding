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
  v_position_group text;
  v_age integer;
  v_recent_minutes integer := 0;
  v_recent_apps numeric := 0;
  v_recent_starts numeric := 0;
  v_weighted_minutes numeric := 0;
  v_weighted_apps numeric := 0;
  v_weighted_starts numeric := 0;
  v_minutes_signal numeric;
  v_starter_signal numeric;
  v_role_score numeric;
  v_performance_score numeric;
  v_performance_confidence numeric;
  v_recent_perf numeric;
  v_prior_perf numeric;
  v_trend_score numeric;
  v_availability_score numeric;
  v_experience_score numeric;
  v_experience_minutes numeric := 0;
  v_international_apps integer := 0;
  v_level_score numeric;
  v_core_score numeric;
  v_age_adjustment numeric := 0;
  v_potential_adjustment numeric;
  v_potential numeric;
  v_model numeric;
  v_status text := 'not_enough_playing_time_data';
  v_coverage integer := 0;
  v_weighted_total numeric := 0;
  v_benchmark_freshness text := 'unknown';
  v_confidence integer := 0;
  v_basis jsonb;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  select * into p from public.players where id = p_player_id;
  if not found then raise exception 'Player not found'; end if;

  v_position_group := private.djm_position_group(p.primary_position);
  if p.date_of_birth is not null then v_age := date_part('year', age(current_date, p.date_of_birth))::int; end if;

  select
    coalesce(sum(coalesce(c.minutes,0)),0)::int,
    coalesce(sum(coalesce(c.appearances,0)),0),
    coalesce(sum(coalesce(c.starts,0)),0),
    coalesce(sum(coalesce(c.minutes,0) * private.djm_current_recency_weight(public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date))),0),
    coalesce(sum(coalesce(c.appearances,0) * private.djm_current_recency_weight(public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date))),0),
    coalesce(sum(coalesce(c.starts,0) * private.djm_current_recency_weight(public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date))),0)
  into v_recent_minutes, v_recent_apps, v_recent_starts, v_weighted_minutes, v_weighted_apps, v_weighted_starts
  from public.career_entries c
  where c.player_id = p_player_id
    and c.source_reviewed_at is not null
    and public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date) >= current_date - interval '24 months';

  if v_recent_minutes >= 500 then
    v_minutes_signal := least(100, v_weighted_minutes / 2200 * 100);
    if v_weighted_apps > 0 then v_starter_signal := least(100, greatest(0, v_weighted_starts / v_weighted_apps * 100)); end if;
    v_role_score := case when v_starter_signal is null then v_minutes_signal else v_minutes_signal * .8 + v_starter_signal * .2 end;
  end if;

  v_context := public.djm_player_score_competition_context(p_player_id);
  v_competition_id := nullif(v_context->>'competition_id','')::uuid;
  v_competition_name := nullif(v_context->>'competition_name','');
  v_competition_country := nullif(v_context->>'country','');
  v_competition_basis := coalesce(v_context->>'basis','unresolved');

  select lb.* into b
  from djm_os.league_benchmarks lb
  left join djm_os.competitions c on c.id = lb.competition_id
  where lb.verified_at is not null
    and (
      (v_competition_id is not null and lb.competition_id = v_competition_id)
      or (v_competition_name is not null and lower(lb.league_name)=lower(v_competition_name)
        and (lb.country is null or v_competition_country is null or lower(lb.country)=lower(v_competition_country)))
      or (v_competition_name is not null and (lower(c.display_name)=lower(v_competition_name)
        or exists(select 1 from unnest(c.aliases) a where lower(a)=lower(v_competition_name)))
        and (c.country is null or v_competition_country is null or lower(c.country)=lower(v_competition_country)))
    )
  order by (v_competition_id is not null and lb.competition_id=v_competition_id) desc, lb.verified_at desc
  limit 1;

  if b.id is not null then
    v_level_score := b.strength_score;
    v_benchmark_freshness := case
      when coalesce(b.next_review_at, b.verified_at + interval '90 days') < now() then 'stale'
      when now() > b.verified_at + interval '30 days' then 'aging'
      else 'fresh' end;
  end if;

  with scored as (
    select snap.*,
      private.djm_position_performance_score(
        snap.position_group, snap.overall_performance_percentile, snap.attacking_percentile,
        snap.creativity_percentile, snap.progression_percentile, snap.possession_percentile,
        snap.defending_percentile, snap.aerial_percentile, snap.goalkeeping_percentile,
        snap.physical_percentile, snap.discipline_percentile
      ) as perf_score,
      private.djm_current_recency_weight(snap.evidence_date) as recency
    from djm_os.player_performance_snapshots snap
    where snap.player_id = p_player_id
      and snap.verified_at is not null
      and snap.evidence_date >= current_date - interval '18 months'
      and coalesce(snap.minutes,0) >= 180
      and (snap.position_group = v_position_group or v_position_group = 'UNKNOWN')
  )
  select
    sum(perf_score * greatest(coalesce(minutes,180),180) * recency) / nullif(sum(greatest(coalesce(minutes,180),180) * recency),0),
    sum(coalesce(confidence,1) * greatest(coalesce(minutes,180),180) * recency) / nullif(sum(greatest(coalesce(minutes,180),180) * recency),0),
    sum(case when evidence_date >= current_date - interval '6 months' then perf_score * greatest(coalesce(minutes,180),180) else 0 end)
      / nullif(sum(case when evidence_date >= current_date - interval '6 months' then greatest(coalesce(minutes,180),180) else 0 end),0),
    sum(case when evidence_date < current_date - interval '6 months' then perf_score * greatest(coalesce(minutes,180),180) else 0 end)
      / nullif(sum(case when evidence_date < current_date - interval '6 months' then greatest(coalesce(minutes,180),180) else 0 end),0),
    least(100, sum(case when possible_minutes > 0 and evidence_date >= current_date - interval '12 months' then coalesce(minutes,0) else 0 end)::numeric
      / nullif(sum(case when possible_minutes > 0 and evidence_date >= current_date - interval '12 months' then possible_minutes else 0 end),0) * 100)
  into v_performance_score, v_performance_confidence, v_recent_perf, v_prior_perf, v_availability_score
  from scored
  where perf_score is not null and recency > 0;

  if v_recent_perf is not null and v_prior_perf is not null then
    v_trend_score := least(100, greatest(0, 50 + (v_recent_perf - v_prior_perf) * 1.25));
  end if;

  with career_level as (
    select c.*,
      public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date) as evidence_date,
      lb.strength_score as level_score
    from public.career_entries c
    left join lateral (
      select x.strength_score
      from djm_os.league_benchmarks x
      left join djm_os.competitions xc on xc.id=x.competition_id
      where x.verified_at is not null and (
        (c.competition_id is not null and x.competition_id=c.competition_id)
        or (c.league is not null and lower(x.league_name)=lower(c.league)
          and (x.country is null or c.country is null or lower(x.country)=lower(c.country)))
        or (c.league is not null and (lower(xc.display_name)=lower(c.league)
          or exists(select 1 from unnest(xc.aliases) a where lower(a)=lower(c.league)))
          and (xc.country is null or c.country is null or lower(xc.country)=lower(c.country)))
      ) order by (c.competition_id is not null and x.competition_id=c.competition_id) desc, x.verified_at desc limit 1
    ) lb on true
    where c.player_id=p_player_id and c.source_reviewed_at is not null
  )
  select
    coalesce(sum(case when level_score is not null then coalesce(minutes,0) * private.djm_experience_recency_weight(evidence_date)
      * (.5 + level_score / 200) else 0 end),0),
    coalesce(sum(case when is_international then coalesce(appearances,0) else 0 end),0)::int
  into v_experience_minutes, v_international_apps
  from career_level where evidence_date is not null;

  if v_experience_minutes > 0 then
    v_experience_score := least(100, v_experience_minutes / 8000 * 100 + least(8, v_international_apps * .5));
  end if;

  if v_recent_minutes < 500 then
    v_status := 'not_enough_playing_time_data';
  elsif v_competition_name is null then
    v_status := 'competition_evidence_required';
  elsif b.id is null then
    v_status := 'benchmark_required';
  elsif v_performance_score is null then
    v_status := 'performance_data_required';
  else
    v_coverage := 30 + 30 + 15
      + case when v_experience_score is not null then 10 else 0 end
      + case when v_trend_score is not null then 10 else 0 end
      + case when v_availability_score is not null then 5 else 0 end;

    v_weighted_total := v_level_score * 30 + v_performance_score * 30 + v_role_score * 15
      + coalesce(v_experience_score * 10,0) + coalesce(v_trend_score * 10,0) + coalesce(v_availability_score * 5,0);

    if v_coverage < 75 then
      v_status := 'not_enough_model_coverage';
    else
      v_core_score := v_weighted_total / v_coverage;
      v_age_adjustment := private.djm_age_performance_adjustment(v_age, v_position_group, v_performance_score);
      v_model := least(100, greatest(0, v_core_score + v_age_adjustment));
      v_potential_adjustment := private.djm_potential_age_adjustment(v_age, v_position_group);
      if v_potential_adjustment is not null then
        v_potential := least(100, greatest(0, v_model + v_potential_adjustment
          + case when v_trend_score is null then 0 else greatest(-6,least(6,(v_trend_score-50)*.12)) end));
      end if;
      v_status := 'calculated';
    end if;
  end if;

  if v_status <> 'calculated' then
    v_coverage := case
      when b.id is null then 0
      else 30 + case when v_performance_score is not null then 30 else 0 end
        + case when v_role_score is not null then 15 else 0 end
        + case when v_experience_score is not null then 10 else 0 end
        + case when v_trend_score is not null then 10 else 0 end
        + case when v_availability_score is not null then 5 else 0 end
      end;
  end if;

  v_confidence := least(100, greatest(0, round(
    v_coverage * .5
    + least(20, v_recent_minutes::numeric / 1800 * 20)
    + case v_benchmark_freshness when 'fresh' then 10 when 'aging' then 7 when 'stale' then 3 else 0 end
    + coalesce(v_performance_confidence * 15,0)
    + case when p.verification_status='verified' then 5 else 0 end
  )))::int;

  v_basis := jsonb_build_object(
    'model','DJM Player Score v2',
    'model_definition','Current demonstrated football level, not readiness, Club Match, transfer probability or market price',
    'status',v_status,
    'position_group',v_position_group,
    'competition_id',v_competition_id,
    'competition_name',v_competition_name,
    'competition_country',v_competition_country,
    'competition_basis',v_competition_basis,
    'current_club',p.current_club,
    'league_strength_score',b.strength_score,
    'league_benchmark_provider',b.benchmark_provider,
    'league_benchmark_metric',b.benchmark_metric,
    'league_benchmark_raw_value',b.raw_strength_value,
    'league_benchmark_verified_at',b.verified_at,
    'league_benchmark_methodology',b.methodology,
    'benchmark_freshness',v_benchmark_freshness,
    'recent_minutes_24m',v_recent_minutes,
    'weighted_recent_minutes',round(v_weighted_minutes,0),
    'playing_time_score',case when v_role_score is null then null else round(v_role_score) end,
    'level_score',case when v_level_score is null then null else round(v_level_score) end,
    'performance_score',case when v_performance_score is null then null else round(v_performance_score) end,
    'role_score',case when v_role_score is null then null else round(v_role_score) end,
    'experience_score',case when v_experience_score is null then null else round(v_experience_score) end,
    'trend_score',case when v_trend_score is null then null else round(v_trend_score) end,
    'availability_score',case when v_availability_score is null then null else round(v_availability_score) end,
    'ability_core_score',case when v_core_score is null then null else round(v_core_score) end,
    'age',v_age,
    'age_performance_adjustment',round(v_age_adjustment,2),
    'potential_age_adjustment',round(v_potential_adjustment,2),
    'data_coverage',v_coverage,
    'evidence_window_months',24,
    'current_recency_weights',jsonb_build_object('0_6_months',1,'7_12_months',.85,'13_18_months',.65,'19_24_months',.45,'older',0),
    'experience_recency_weights',jsonb_build_object('0_24_months',1,'25_48_months',.65,'49_72_months',.35,'older',.15),
    'component_weights',jsonb_build_object('level',30,'position_performance',30,'role_minutes',15,'experience',10,'trend',10,'availability',5),
    'performance_peer_rule','Performance percentiles must be benchmarked against a relevant position and competition or level peer group',
    'age_rule','Age is a modest position-specific performance prior. Strong recent performance reduces the age penalty. Potential carries the larger future age effect.',
    'recommended_performance_source','Licensed Wyscout Data or another authorised position-adjusted dataset',
    'recommended_benchmark_source','Opta Power Rankings / licensed Stats Perform league-strength data or a reviewed authorised equivalent',
    'calculated_at',now()
  );

  insert into djm_os.player_scorecards(
    player_id, model_score, potential_model_score, score_status, confidence, basis,
    model_version, calculated_at, stale_at, stale_reason, evidence_freshness, updated_by,
    ability_core_score, performance_score, role_score, experience_score, trend_score,
    availability_score, age_adjustment, data_coverage, position_group
  ) values (
    p_player_id, case when v_model is null then null else round(v_model)::smallint end,
    case when v_potential is null then null else round(v_potential)::smallint end,
    v_status, v_confidence::smallint, v_basis, 'djm_player_score_v2', now(), null, null,
    case when v_status='calculated' and v_benchmark_freshness='fresh' then 'fresh'
         when v_status='calculated' then v_benchmark_freshness else 'unknown' end,
    auth.uid(),
    case when v_core_score is null then null else round(v_core_score)::smallint end,
    case when v_performance_score is null then null else round(v_performance_score)::smallint end,
    case when v_role_score is null then null else round(v_role_score)::smallint end,
    case when v_experience_score is null then null else round(v_experience_score)::smallint end,
    case when v_trend_score is null then null else round(v_trend_score)::smallint end,
    case when v_availability_score is null then null else round(v_availability_score)::smallint end,
    round(v_age_adjustment,2), v_coverage::smallint, v_position_group
  ) on conflict (player_id) do update set
    model_score=excluded.model_score,
    potential_model_score=excluded.potential_model_score,
    score_status=excluded.score_status,
    confidence=excluded.confidence,
    basis=excluded.basis,
    model_version=excluded.model_version,
    calculated_at=excluded.calculated_at,
    stale_at=null,
    stale_reason=null,
    evidence_freshness=excluded.evidence_freshness,
    updated_by=auth.uid(),
    ability_core_score=excluded.ability_core_score,
    performance_score=excluded.performance_score,
    role_score=excluded.role_score,
    experience_score=excluded.experience_score,
    trend_score=excluded.trend_score,
    availability_score=excluded.availability_score,
    age_adjustment=excluded.age_adjustment,
    data_coverage=excluded.data_coverage,
    position_group=excluded.position_group,
    updated_at=now()
  returning * into s;

  insert into djm_os.events(event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values('PLAYER_SCORE_CALCULATED',auth.uid(),p_player_id,
    jsonb_build_object('status',v_status,'model_score',s.model_score,'model_version','djm_player_score_v2','coverage',v_coverage,'position_group',v_position_group),
    'deterministic_model',v_confidence::numeric/100,now());

  return jsonb_build_object(
    'player_id',p_player_id,
    'score',coalesce(s.manual_score,s.model_score),
    'model_score',s.model_score,
    'manual_score',s.manual_score,
    'potential_score',coalesce(s.manual_potential_score,s.potential_model_score),
    'potential_model_score',s.potential_model_score,
    'manual_potential_score',s.manual_potential_score,
    'source',case when s.manual_score is not null then 'manual_override' when s.model_score is not null then 'model' else 'insufficient_data' end,
    'status',case when s.manual_score is not null then 'manual_override' else s.score_status end,
    'model_status',s.score_status,
    'confidence',s.confidence,
    'data_coverage',s.data_coverage,
    'override_reason',s.override_reason,
    'basis',s.basis,
    'model_version',s.model_version,
    'calculated_at',s.calculated_at
  );
end;
$$;

notify pgrst, 'reload schema';
