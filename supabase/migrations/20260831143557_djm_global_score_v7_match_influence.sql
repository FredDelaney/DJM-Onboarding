create or replace function djm_os.subject_match_influence(p_subject_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  s djm_os.football_intelligence_subjects%rowtype;
  m record;
  c djm_os.competitions%rowtype;
  f djm_os.football_fixtures%rowtype;
  v_country text;
  v_league text;
  v_tier integer;
  v_comp numeric;
  v_comp_q numeric;
  v_team_ctx jsonb;
  v_opp_ctx jsonb;
  v_team_rel numeric;
  v_opp_rel numeric;
  v_team_abs numeric;
  v_opp_abs numeric;
  v_rating numeric;
  v_rating_score numeric;
  v_actual numeric;
  v_expected numeric;
  v_result_score numeric;
  v_match_score numeric;
  v_weight numeric;
  v_total numeric:=0;
  v_weight_total numeric:=0;
  v_weighted_minutes numeric:=0;
  v_matches integer:=0;
  v_result_matches integer:=0;
  v_rating_matches integer:=0;
  v_quality numeric:=0;
  v_recency numeric;
  v_source_q numeric;
  v_team_goals integer;
  v_opp_goals integer;
  v_details jsonb:='[]'::jsonb;
begin
  select * into s from djm_os.football_intelligence_subjects where id=p_subject_id;
  if not found then return jsonb_build_object('score',null,'quality',0,'reason','subject_not_found'); end if;

  for m in
    select x.* from djm_os.football_subject_match_snapshots x
    where x.subject_id=p_subject_id and coalesce(x.minutes,0)>0
      and coalesce(x.match_date,current_date) >= current_date-interval '540 days'
    order by x.match_date desc nulls last,x.observed_at desc nulls last
    limit 40
  loop
    c:=null; f:=null;
    if m.competition_id is not null then select * into c from djm_os.competitions where id=m.competition_id; end if;
    if m.fixture_id is not null then select * into f from djm_os.football_fixtures where id=m.fixture_id; end if;
    v_country:=coalesce(c.country,s.current_country);
    v_league:=coalesce(c.display_name,s.current_league);
    v_tier:=coalesce(c.level_tier,djm_os.infer_global_league_tier(v_country,v_league));
    v_comp:=djm_os.global_competition_level_score(v_country,v_league,v_tier);
    if v_comp is null then continue; end if;
    v_comp_q:=djm_os.global_country_strength_quality(v_country);

    v_team_ctx:=djm_os.clubelo_team_context(coalesce(m.team_name,s.current_club),v_country,v_tier);
    v_opp_ctx:=djm_os.clubelo_team_context(m.opponent_name,v_country,v_tier);
    v_team_rel:=djm_os.safe_json_number(v_team_ctx->>'score');
    v_opp_rel:=djm_os.safe_json_number(v_opp_ctx->>'score');
    v_team_abs:=greatest(0,least(100,v_comp+coalesce(v_team_rel-50,0)*.25));
    v_opp_abs:=greatest(0,least(100,v_comp+coalesce(v_opp_rel-50,0)*.25));

    v_rating:=djm_os.safe_json_number(m.metrics->>'rating');
    v_rating_score:=case when v_rating is null then null else greatest(20,least(95,50+(v_rating-6.5)*20)) end;
    v_actual:=null; v_expected:=null; v_result_score:=null;
    if f.id is not null and f.home_score is not null and f.away_score is not null and m.home_away in ('home','away') then
      if m.home_away='home' then v_team_goals:=f.home_score; v_opp_goals:=f.away_score; else v_team_goals:=f.away_score; v_opp_goals:=f.home_score; end if;
      v_actual:=case when v_team_goals>v_opp_goals then 1 when v_team_goals=v_opp_goals then .5 else 0 end;
      v_expected:=1/(1+power(10,(v_opp_abs-v_team_abs)/20.0));
      v_result_score:=greatest(15,least(85,50+45*(v_actual-v_expected)));
      v_result_matches:=v_result_matches+1;
    end if;
    if v_rating_score is not null then v_rating_matches:=v_rating_matches+1; end if;

    if v_result_score is not null and v_rating_score is not null then
      v_match_score=.50*v_opp_abs+.25*v_result_score+.25*v_rating_score;
    elsif v_result_score is not null then
      v_match_score=.65*v_opp_abs+.35*v_result_score;
    elsif v_rating_score is not null then
      v_match_score=.70*v_opp_abs+.30*v_rating_score;
    else
      v_match_score=v_opp_abs;
    end if;

    v_recency:=exp(-0.005776*greatest(0,current_date-coalesce(m.match_date,current_date)));
    v_source_q:=greatest(.35,least(1,coalesce(m.confidence,.75)))*greatest(.4,coalesce(v_comp_q,.5));
    v_weight:=least(1,m.minutes/90.0)*v_recency*v_source_q;
    if v_weight<=0 then continue; end if;
    v_total:=v_total+v_match_score*v_weight;
    v_weight_total:=v_weight_total+v_weight;
    v_weighted_minutes:=v_weighted_minutes+m.minutes*v_recency*v_source_q;
    v_matches:=v_matches+1;
    if jsonb_array_length(v_details)<8 then
      v_details:=v_details||jsonb_build_array(jsonb_build_object(
        'match_date',m.match_date,'competition',v_league,'team',coalesce(m.team_name,s.current_club),'opponent',m.opponent_name,
        'minutes',m.minutes,'opponent_level',round(v_opp_abs,2),'result_score',case when v_result_score is null then null else round(v_result_score,2) end,
        'rating',v_rating,'match_influence',round(v_match_score,2),'recency_weight',round(v_recency,3),'source_quality',round(v_source_q,3)
      ));
    end if;
  end loop;

  if v_weight_total<=0 or v_matches<2 then return jsonb_build_object('score',null,'quality',0,'reason','insufficient_match_evidence','matches',v_matches); end if;
  v_quality:=least(1,v_weighted_minutes/900.0)*least(1,v_matches/10.0)*(.75+.15*least(1,v_result_matches/6.0)+.10*least(1,v_rating_matches/6.0));
  return jsonb_build_object(
    'score',round(v_total/v_weight_total,2),'quality',round(v_quality,3),'matches',v_matches,
    'weighted_recent_minutes',round(v_weighted_minutes,1),'result_matches',v_result_matches,'rated_matches',v_rating_matches,
    'recent_examples',v_details,
    'rule','Match Influence is minutes- and recency-weighted. Opponent difficulty is primary; team result is adjusted for expected strength; provider match rating is used only when present.'
  );
end;
$$;