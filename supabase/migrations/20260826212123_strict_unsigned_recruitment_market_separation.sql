create or replace function public.djm_scout_need_matches(p_need_id uuid)
returns table(prospect_id uuid, full_name text, current_club text, primary_position text, preferred_foot text, date_of_birth date, availability_status text, scouting_score numeric, recommendation text, match_score smallint, reasoning jsonb)
language sql
stable
set search_path=''
as $$
with n as (select * from djm_os.club_needs where id=p_need_id), candidates as (
  select s.*,
    (select round(avg((coalesce(r.football_score,0)+coalesce(r.physical_score,0)+coalesce(r.tactical_score,0)+coalesce(r.mentality_score,0)+coalesce(r.personality_score,0)+coalesce(r.readiness_score,0))::numeric/nullif((case when r.football_score is not null then 1 else 0 end+case when r.physical_score is not null then 1 else 0 end+case when r.tactical_score is not null then 1 else 0 end+case when r.mentality_score is not null then 1 else 0 end+case when r.personality_score is not null then 1 else 0 end+case when r.readiness_score is not null then 1 else 0 end),0)),1) from djm_os.scouting_reports r where r.prospect_id=s.id) as scouting_score,
    (select r.recommendation from djm_os.scouting_reports r where r.prospect_id=s.id order by r.report_date desc,r.created_at desc limit 1) as recommendation
  from djm_os.scouting_prospects s,n
  where s.linked_player_id is null
    and s.signed_player_id is null
    and s.recruitment_stage not in ('signed','declined','lost')
    and s.availability_status in ('unknown','monitor','approachable','available')
    and djm_os.position_matches_player(n.position,s.primary_position,s.secondary_positions)
), scored as (
  select c.*,n.preferred_foot as need_foot,n.min_age as need_min_age,n.max_age as need_max_age,
    least(100,
      55
      +case when n.preferred_foot is null then 8 when lower(coalesce(c.preferred_foot,''))=lower(n.preferred_foot) then 15 else 0 end
      +case when n.min_age is null and n.max_age is null then 8 when c.date_of_birth is null then 3 when (n.min_age is null or date_part('year',age(current_date,c.date_of_birth))>=n.min_age) and (n.max_age is null or date_part('year',age(current_date,c.date_of_birth))<=n.max_age) then 12 else 0 end
      +case c.availability_status when 'available' then 10 when 'approachable' then 8 when 'monitor' then 4 else 2 end
      +case c.recommendation when 'strong_yes' then 8 when 'yes' then 6 when 'monitor' then 3 else 0 end
    )::smallint as score
  from candidates c,n
  where (n.preferred_foot is null or c.preferred_foot is null or lower(c.preferred_foot)=lower(n.preferred_foot))
    and (n.min_age is null or c.date_of_birth is null or date_part('year',age(current_date,c.date_of_birth))>=n.min_age)
    and (n.max_age is null or c.date_of_birth is null or date_part('year',age(current_date,c.date_of_birth))<=n.max_age)
)
select s.id,s.full_name,s.current_club,s.primary_position,s.preferred_foot,s.date_of_birth,s.availability_status,s.scouting_score,s.recommendation,s.score,
  jsonb_build_object('position_match',true,'foot_match',case when s.need_foot is null then null else lower(coalesce(s.preferred_foot,''))=lower(s.need_foot) end,'availability',s.availability_status,'scouting_score',s.scouting_score,'recommendation',s.recommendation)
from scored s
order by s.score desc,s.scouting_score desc nulls last,s.full_name;
$$;
