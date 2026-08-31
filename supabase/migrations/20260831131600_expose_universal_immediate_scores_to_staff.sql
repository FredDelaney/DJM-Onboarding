create or replace function public.djm_football_subject_scores()
returns table(
  subject_id uuid,
  player_id uuid,
  prospect_id uuid,
  representation_status text,
  display_score smallint,
  score_tier text,
  confidence smallint,
  data_coverage smallint,
  provisional_grade text,
  model_version text,
  calculated_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  return query
  select
    s.id,
    s.player_id,
    s.prospect_id,
    s.representation_status,
    sc.display_score,
    sc.score_tier,
    sc.confidence,
    sc.data_coverage,
    sc.basis ->> 'provisional_grade',
    sc.model_version,
    sc.calculated_at
  from djm_os.football_intelligence_subjects s
  join djm_os.football_subject_scorecards sc on sc.subject_id=s.id
  order by s.updated_at desc;
end;
$$;

revoke all on function public.djm_football_subject_scores() from public,anon;
grant execute on function public.djm_football_subject_scores() to authenticated,service_role;