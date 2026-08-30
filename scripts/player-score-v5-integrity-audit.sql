-- DJM Player Score V5 integrity audit
-- READ ONLY. Run this before bulk recalculation and after major player-data imports.

begin transaction read only;

-- 1. Likely duplicate player identities. Date of birth is included where known so
-- common names do not create unnecessary noise.
with normalised as (
  select
    id,
    lower(regexp_replace(trim(coalesce(first_name,'')||' '||coalesce(last_name,'')),'\\s+',' ','g')) as normalised_name,
    date_of_birth,
    current_club,
    current_league
  from public.players
)
select
  'possible_duplicate_player' as issue,
  normalised_name,
  date_of_birth,
  count(*) as records,
  array_agg(id order by id) as player_ids,
  array_agg(coalesce(current_club,'') order by id) as current_clubs
from normalised
where normalised_name<>''
group by normalised_name,date_of_birth
having count(*)>1
order by records desc,normalised_name;

-- 2. Current score model distribution. After V5 activation, unexpected runtime V4
-- rows are evidence that some players have not yet been recalculated.
select
  'score_model_distribution' as audit,
  model_version,
  score_tier,
  count(*) as players,
  min(calculated_at) as oldest_calculation,
  max(calculated_at) as newest_calculation
from djm_os.player_scorecards
group by model_version,score_tier
order by players desc,model_version,score_tier;

-- 3. Scorecards whose canonical evidence changed after the score was calculated.
with latest_input as (
  select
    p.id as player_id,
    greatest(
      max(c.updated_at),
      max(c.source_reviewed_at),
      max(c.source_synced_at),
      max(ps.verified_at)
    ) as latest_input_at
  from public.players p
  left join public.career_entries c on c.player_id=p.id
  left join djm_os.player_performance_snapshots ps on ps.player_id=p.id
  group by p.id
)
select
  'input_newer_than_score' as issue,
  s.player_id,
  s.model_version,
  s.score_tier,
  s.calculated_at,
  i.latest_input_at,
  s.stale_at,
  s.stale_reason
from djm_os.player_scorecards s
join latest_input i using(player_id)
where i.latest_input_at is not null
  and (s.calculated_at is null or i.latest_input_at>s.calculated_at)
order by i.latest_input_at desc;

-- 4. Reviewed current-club evidence with weak date semantics. These rows can make a
-- current score age incorrectly if there is no end date and no reviewed/synchronised
-- observation date.
select
  'current_club_evidence_missing_as_of' as issue,
  p.id as player_id,
  p.first_name,
  p.last_name,
  p.current_club,
  c.id as career_entry_id,
  c.season_label,
  c.start_date,
  c.end_date,
  c.source_reviewed_at,
  c.source_synced_at
from public.players p
join public.career_entries c on c.player_id=p.id
where c.source_reviewed_at is not null
  and lower(coalesce(c.club_name,''))=lower(coalesce(p.current_club,''))
  and c.end_date is null
  and c.source_synced_at is null
  and c.source_reviewed_at is null
order by p.last_name,p.first_name;

-- 5. Incomplete career history risk. V5 protects the score by quality-weighting this
-- evidence, but the audit identifies where enrichment will create the most value.
with history as (
  select
    p.id as player_id,
    p.first_name,
    p.last_name,
    case when p.date_of_birth is null then null
      else date_part('year',age(current_date,p.date_of_birth))::int end as age,
    count(distinct coalesce(nullif(trim(c.season_label),''),c.start_date::text,c.end_date::text)) filter (
      where c.source_reviewed_at is not null and coalesce(c.is_international,false)=false
    ) as reviewed_seasons,
    coalesce(sum(coalesce(c.minutes,0)) filter (
      where c.source_reviewed_at is not null and coalesce(c.is_international,false)=false
    ),0) as reviewed_minutes
  from public.players p
  left join public.career_entries c on c.player_id=p.id
  group by p.id,p.first_name,p.last_name,p.date_of_birth
)
select
  'thin_reviewed_career_history' as issue,
  player_id,
  first_name,
  last_name,
  age,
  reviewed_seasons,
  reviewed_minutes
from history
where age>=22
  and (reviewed_seasons<2 or reviewed_minutes<2500)
order by reviewed_seasons,reviewed_minutes;

-- 6. Fingerprint coverage after V5 rollout.
select
  'missing_v5_input_fingerprint' as issue,
  player_id,
  score_tier,
  model_version,
  calculated_at
from djm_os.player_scorecards
where model_version='djm_player_score_v5_information_fusion'
  and nullif(basis->>'input_fingerprint','') is null
order by calculated_at desc nulls last;

commit;
