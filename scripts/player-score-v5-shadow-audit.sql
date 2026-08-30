-- DJM Player Score V5 shadow audit
-- READ ONLY. This does not change scorecards, evidence or model functions.
--
-- It reproduces the V5 context/evidence-quality mechanics from the currently stored
-- score basis. It is particularly useful before/after deploying V5 to compare the
-- current displayed score with the proposed V5 evidence state.

begin transaction read only;

with base as (
  select
    s.player_id,
    p.first_name,
    p.last_name,
    p.current_club,
    p.current_league,
    p.primary_position,
    p.verification_status,
    case when p.date_of_birth is null then null
      else date_part('year',age(current_date,p.date_of_birth))::int end as age,
    s.model_score as current_full_score,
    s.provisional_score as current_provisional_score,
    s.provisional_confidence as current_provisional_confidence,
    s.confidence as current_confidence,
    s.score_tier as current_tier,
    s.model_version as current_model_version,
    s.basis,
    nullif(s.basis->>'level_score','')::numeric as level_score,
    nullif(s.basis->>'performance_score','')::numeric as performance_score,
    nullif(s.basis->>'experience_score','')::numeric as experience_score,
    nullif(s.basis->>'trend_score','')::numeric as trend_score,
    nullif(s.basis->>'availability_score','')::numeric as availability_score
  from djm_os.player_scorecards s
  join public.players p on p.id=s.player_id
), career_rows as (
  select
    b.player_id,
    c.minutes,
    c.appearances,
    c.starts,
    c.season_label,
    case
      when c.end_date is null
       and lower(coalesce(c.club_name,''))=lower(coalesce(b.current_club,''))
       and coalesce(c.source_synced_at,c.source_reviewed_at) is not null
       and coalesce(c.source_synced_at,c.source_reviewed_at)::date <= current_date + 1
      then coalesce(c.source_synced_at,c.source_reviewed_at)::date
      else public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date)
    end as evidence_date
  from base b
  join public.career_entries c on c.player_id=b.player_id
  where c.source_reviewed_at is not null
    and coalesce(c.is_international,false)=false
), recent as (
  select
    player_id,
    coalesce(sum(coalesce(minutes,0)) filter (
      where evidence_date>=current_date-interval '24 months'
    ),0)::numeric as raw_minutes,
    coalesce(sum(
      coalesce(minutes,0)
      * case
          when evidence_date is null or evidence_date>current_date or current_date-evidence_date>730 then 0
          else exp(-ln(2::numeric)*(current_date-evidence_date)/365.0)
        end
    ) filter (where evidence_date>=current_date-interval '24 months'),0)::numeric as effective_minutes,
    coalesce(sum(
      coalesce(appearances,0)
      * case
          when evidence_date is null or evidence_date>current_date or current_date-evidence_date>730 then 0
          else exp(-ln(2::numeric)*(current_date-evidence_date)/365.0)
        end
    ) filter (where evidence_date>=current_date-interval '24 months'),0)::numeric as effective_apps,
    coalesce(sum(
      coalesce(starts,0)
      * case
          when evidence_date is null or evidence_date>current_date or current_date-evidence_date>730 then 0
          else exp(-ln(2::numeric)*(current_date-evidence_date)/365.0)
        end
    ) filter (where evidence_date>=current_date-interval '24 months'),0)::numeric as effective_starts,
    coalesce(bool_or(starts is not null) filter (
      where evidence_date>=current_date-interval '24 months'
    ),false) as starts_known,
    max(evidence_date) filter (
      where evidence_date>=current_date-interval '24 months'
    ) as latest_evidence_date,
    count(distinct coalesce(nullif(trim(season_label),''),evidence_date::text)) filter (
      where evidence_date is not null
    ) as reviewed_seasons,
    coalesce(sum(coalesce(minutes,0)) filter (where evidence_date is not null),0)::numeric as career_minutes
  from career_rows
  group by player_id
), quality as (
  select
    b.*,
    coalesce(r.raw_minutes,0) as raw_minutes,
    coalesce(r.effective_minutes,0) as effective_minutes,
    coalesce(r.effective_apps,0) as effective_apps,
    coalesce(r.effective_starts,0) as effective_starts,
    coalesce(r.starts_known,false) as starts_known,
    r.latest_evidence_date,
    coalesce(r.reviewed_seasons,0) as reviewed_seasons,
    coalesce(r.career_minutes,0) as career_minutes,
    case lower(coalesce(b.basis->>'league_benchmark_provider',''))
      when 'opta' then .97
      when 'stats_perform' then .97
      when 'wyscout' then .92
      when 'playerelo' then .90
      when 'iffhs_2025' then .82
      when 'manual_reviewed' then .80
      when 'djm_iffhs_tier_decay_v1' then .68
      else .72
    end
    * case lower(coalesce(b.basis->>'benchmark_freshness','unknown'))
        when 'fresh' then 1
        when 'aging' then .82
        when 'stale' then .55
        else .65
      end as level_quality,
    case when coalesce(r.effective_minutes,0)>0 then
      sqrt(
        (1-exp(-coalesce(r.effective_minutes,0)/900.0))
        * (1-exp(-coalesce(r.effective_apps,0)/8.0))
      )
      else 0 end as role_quality,
    case when coalesce(r.effective_minutes,0)>0 then
      100*(1-exp(-least(coalesce(r.effective_minutes,0),4000)/1500.0))
      else null end as role_score_v5,
    coalesce(
      nullif(b.basis->>'performance_sample_reliability','')::numeric,
      case when b.performance_score is not null then .55 else 0 end
    ) as performance_quality,
    case when b.age is null then 0 else
      sqrt(
        least(1,coalesce(r.reviewed_seasons,0)::numeric/greatest(1,least(4,b.age-18)))
        * least(1,coalesce(r.career_minutes,0)/6000.0)
      )
    end as experience_quality,
    case lower(coalesce(b.verification_status,''))
      when 'verified' then 1
      when 'reviewing' then .75
      else .55
    end as verification_quality
  from base b
  left join recent r using(player_id)
), weights as (
  select
    q.*,
    case when level_score is not null then 30*level_quality else 0 end as w_level,
    case when performance_score is not null then 30*performance_quality else 0 end as w_perf,
    case when role_score_v5 is not null then 15*role_quality else 0 end as w_role,
    case when experience_quality>=.35 and experience_score is not null then 10*experience_quality else 0 end as w_exp,
    case when trend_score is not null and performance_quality>0 then 10*least(1,performance_quality*.8) else 0 end as w_trend,
    case when availability_score is not null and performance_quality>0 then 5*least(1,performance_quality*.7) else 0 end as w_avail
  from quality q
), calc as (
  select
    w.*,
    (w_level+w_perf+w_role+w_exp+w_trend+w_avail) as effective_weight,
    (
      coalesce(level_score*w_level,0)
      + coalesce(performance_score*w_perf,0)
      + coalesce(role_score_v5*w_role,0)
      + coalesce(experience_score*w_exp,0)
      + coalesce(trend_score*w_trend,0)
      + coalesce(availability_score*w_avail,0)
    ) as weighted_total
  from weights w
), classified as (
  select
    c.*,
    weighted_total/nullif(effective_weight,0) as raw_evidence_score,
    case
      when performance_score is not null
       and performance_quality>=.60
       and effective_weight>=68
       and raw_minutes>=500
       and effective_minutes>=400
       and level_score is not null
       and role_score_v5 is not null
       and level_quality>=.60
       and latest_evidence_date>=current_date-interval '240 days'
      then 'full'
      when performance_score is not null
       and effective_weight>=38
       and raw_minutes>=500
       and effective_minutes>=350
       and level_score is not null
       and role_score_v5 is not null
       and latest_evidence_date>=current_date-interval '365 days'
      then 'performance_backed'
      when performance_score is null
       and effective_weight>=30
       and raw_minutes>=500
       and effective_minutes>=350
       and level_score is not null
       and role_score_v5 is not null
       and latest_evidence_date>=current_date-interval '365 days'
      then 'context_only'
      else 'unavailable'
    end as v5_grade
  from calc c
), posterior as (
  select
    x.*,
    case v5_grade
      when 'full' then 5::numeric
      when 'performance_backed' then 20::numeric
      else 45::numeric
    end as prior_strength
  from classified x
), final as (
  select
    p.*,
    case when v5_grade='unavailable' then null else
      (50*prior_strength+weighted_total)/nullif(prior_strength+effective_weight,0)
    end as v5_score_raw,
    case when v5_grade='unavailable' then null else
      least(
        case v5_grade when 'context_only' then 45 when 'performance_backed' then 72 else 92 end,
        greatest(
          15,
          round(
            100
            * effective_weight/nullif(effective_weight+prior_strength,0)
            * (
                .65
                + .35*(
                    level_quality
                    + role_quality
                    + case when performance_score is null then verification_quality else performance_quality end
                  )/3.0
              )
          )
        )
      )
    end as v5_confidence
  from posterior p
)
select
  first_name||' '||last_name as player,
  current_tier,
  coalesce(current_full_score,current_provisional_score) as current_score,
  coalesce(current_provisional_confidence,current_confidence) as current_confidence,
  current_model_version,
  v5_grade,
  case when v5_score_raw is null then null else round(v5_score_raw) end as v5_shadow_score,
  v5_confidence as v5_shadow_confidence,
  case
    when v5_score_raw is null or coalesce(current_full_score,current_provisional_score) is null then null
    else round(v5_score_raw)-coalesce(current_full_score,current_provisional_score)
  end as score_delta,
  round(effective_weight,1) as effective_evidence_coverage,
  round(raw_evidence_score,2) as raw_evidence_score,
  round(level_quality,3) as benchmark_quality,
  round(role_quality,3) as role_quality,
  round(experience_quality,3) as experience_history_quality,
  round(effective_minutes) as effective_recent_minutes,
  latest_evidence_date
from final
order by player;

commit;
