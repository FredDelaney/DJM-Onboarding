create or replace function djm_os.subject_identity_quality(p_subject_id uuid)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
  select greatest(
    coalesce((select case when s.identity_confidence is null then 0::numeric else greatest(0::numeric,least(1::numeric,s.identity_confidence))*case when s.identity_verified_at is null then .75 when s.identity_verified_at>=now()-interval '2 years' then 1.0 when s.identity_verified_at>=now()-interval '5 years' then .85 else .65 end end from djm_os.football_intelligence_subjects s where s.id=p_subject_id),0),
    coalesce((select max(greatest(0::numeric,least(1::numeric,e.confidence))) from djm_os.football_subject_identity_evidence e where e.subject_id=p_subject_id),0)
  );
$$;
select djm_os.refresh_football_subject_scorecard(id) from djm_os.football_intelligence_subjects;