-- DJM Player staging djm_os-function bootstrap — batch 05
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- all private function bootstrap batches, and djm_os function batches 01-04.
--
-- Exact current-production definitions for djm_os functions 81-95 of 95,
-- ordered by function name + identity arguments.
-- Production body MD5: 8a235b028209d29d345844bff4637e29
--
-- Body validation is disabled only during bootstrap because public-function
-- batches may provide cross-function dependencies. No function is executed.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION djm_os.subject_match_influence(p_subject_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION djm_os.subject_position_production(p_subject_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION djm_os.subject_position_production_provider_v7(p_subject_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s djm_os.football_intelligence_subjects%rowtype;
  snap djm_os.football_subject_provider_snapshots%rowtype;
  v_metrics jsonb:='{}'::jsonb;
  v_role text;
  v_minutes numeric:=0;
  v_used_weight numeric:=0;
  v_total numeric:=0;
  v_value numeric;
  v_pct jsonb;
  v_pct_value numeric;
  v_n integer:=0;
  v_max_n integer:=0;
  v_depth_q numeric:=.55;
  v_metric_q numeric:=0;
  v_quality numeric:=0;
  v_score numeric;
  v_details jsonb:='{}'::jsonb;
  m record;
begin
  select * into s from djm_os.football_intelligence_subjects where id=p_subject_id;
  if not found then return jsonb_build_object('score',null,'quality',0,'reason','subject_not_found'); end if;
  select * into snap from djm_os.football_subject_provider_snapshots x where x.subject_id=p_subject_id
  order by case x.provider when 'pitchapi' then 1 when 'official_league' then 2 when 'api_football' then 3 when 'thesportsdb' then 4 else 9 end,
           x.observed_at desc nulls last,x.updated_at desc limit 1;
  if not found or nullif(snap.provider_competition_id,'') is null or nullif(snap.provider_season_id,'') is null then
    return jsonb_build_object('score',null,'quality',0,'reason','provider_cohort_unavailable');
  end if;
  v_metrics:=coalesce(snap.metrics->'current_window',snap.metrics->'current_season',snap.metrics,'{}'::jsonb);
  v_role:=coalesce(nullif(v_metrics->>'role',''),djm_os.global_broad_role(s.primary_position),snap.metrics->>'role');
  if v_role is null then return jsonb_build_object('score',null,'quality',0,'reason','role_unknown'); end if;
  v_minutes:=coalesce(djm_os.safe_json_number(v_metrics->>'minutes'),0);
  v_depth_q:=case lower(coalesce(snap.data_depth,'')) when 'advanced' then 1 when 'deep' then 1 when 'standard' then .85 when 'basic_official' then .70 when 'basic' then .60 else .55 end;

  for m in select * from djm_os.position_metric_weights(v_role) loop
    v_value:=djm_os.safe_json_number(v_metrics->>m.metric_key);
    if v_value is null then continue; end if;
    v_pct:=djm_os.peer_metric_percentile(snap.provider,snap.provider_competition_id,snap.provider_season_id,v_role,m.metric_key,v_value,m.higher_is_better);
    v_pct_value:=djm_os.safe_json_number(v_pct->>'percentile');
    v_n:=coalesce((v_pct->>'n')::integer,0);
    v_max_n:=greatest(v_max_n,v_n);
    if v_pct_value is null then continue; end if;
    v_total:=v_total+v_pct_value*m.nominal_weight;
    v_used_weight:=v_used_weight+m.nominal_weight;
    v_details:=v_details||jsonb_build_object(m.metric_key,jsonb_build_object('value',v_value,'percentile',round(v_pct_value,2),'weight',m.nominal_weight,'peer_n',v_n));
  end loop;

  if v_used_weight<10 then
    return jsonb_build_object('score',null,'quality',0,'reason','insufficient_position_metric_coverage','role',v_role,'metric_coverage_pct',round(v_used_weight,1),'metrics',v_details,'cohort_size',v_max_n);
  end if;
  v_score:=v_total/v_used_weight;
  v_metric_q:=case when lower(coalesce(snap.data_depth,'')) in ('basic_official','basic') then least(.45,.15+v_used_weight/100.0) else least(1,v_used_weight/100.0) end;
  v_quality:=v_metric_q*least(1,v_max_n/35.0)*least(1,v_minutes/900.0)*v_depth_q;
  return jsonb_build_object(
    'score',round(v_score,2),'quality',round(v_quality,3),'role',v_role,
    'metric_coverage_pct',round(v_used_weight,1),'metric_capture_quality',round(v_metric_q,3),'minutes',v_minutes,'cohort_size',v_max_n,
    'data_depth',snap.data_depth,'provider',snap.provider,'metrics',v_details,
    'evidence_mode',case when lower(coalesce(snap.data_depth,'')) in ('basic_official','basic') and v_used_weight<25 then 'basic_role_signal' when v_used_weight<50 then 'partial_role_signal' else 'rich_role_signal' end,
    'rule','Only position-relevant metrics that exist for both the player and a real same-role cohort are used. Basic official metrics can create a limited-quality role signal; missing metrics are never zero-imputed.'
  );
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.subject_reviewed_performance_signal(p_subject_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION djm_os.subject_team_context(p_subject_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s djm_os.football_intelligence_subjects%rowtype; c djm_os.competitions%rowtype; v_tier integer;
begin
  select * into s from djm_os.football_intelligence_subjects where id=p_subject_id;
  if not found then return jsonb_build_object('score',null,'quality',0,'reason','subject_not_found'); end if;
  if s.current_competition_id is not null then select * into c from djm_os.competitions where id=s.current_competition_id; end if;
  v_tier:=coalesce(c.level_tier,djm_os.infer_global_league_tier(coalesce(s.current_country,c.country),coalesce(s.current_league,c.display_name)));
  return djm_os.clubelo_team_context(s.current_club,coalesce(s.current_country,c.country),v_tier);
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.sync_football_subject_from_player()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name text;
  v_subject_id uuid;
  v_prospect_id uuid;
begin
  v_name := coalesce(nullif(trim(new.preferred_name), ''), nullif(trim(concat_ws(' ', new.first_name, new.last_name)), ''), 'Unnamed player');
  select sp.id into v_prospect_id from djm_os.scouting_prospects sp
  where sp.signed_player_id=new.id or sp.linked_player_id=new.id order by sp.updated_at desc limit 1;
  if v_prospect_id is not null then
    select s.id into v_subject_id from djm_os.football_intelligence_subjects s where s.prospect_id=v_prospect_id limit 1;
  end if;
  if v_subject_id is null then
    select s.id into v_subject_id from djm_os.football_intelligence_subjects s where s.player_id=new.id limit 1;
  end if;
  if v_subject_id is null then
    insert into djm_os.football_intelligence_subjects(
      player_id,prospect_id,representation_status,full_name,date_of_birth,nationality,primary_position,current_club,current_league,current_country,
      current_competition_id,current_season_label,current_season_start,football_provider_ids,stats_url,transfermarkt_url,wyscout_url,canonical_key,
      transfermarkt_market_value,transfermarkt_market_value_currency,transfermarkt_value_verified_at,updated_at)
    values(new.id,v_prospect_id,'signed',v_name,new.date_of_birth,nullif(array_to_string(new.nationalities,', '),''),new.primary_position,new.current_club,new.current_league,new.current_country,
      new.current_competition_id,new.current_season_label,new.current_season_start,coalesce(new.football_provider_ids,'{}'::jsonb),new.stats_url,new.transfermarkt_url,new.wyscout_url,
      coalesce(nullif(new.football_provider_ids->>'canonical',''),lower(regexp_replace(v_name,'[^a-zA-Z0-9]+','-','g'))),
      new.transfermarkt_market_value,new.transfermarkt_market_value_currency,new.transfermarkt_value_verified_at,now());
  else
    update djm_os.football_intelligence_subjects set
      player_id=new.id, prospect_id=coalesce(prospect_id,v_prospect_id), representation_status='signed', full_name=v_name,
      date_of_birth=coalesce(new.date_of_birth,date_of_birth), nationality=coalesce(nullif(array_to_string(new.nationalities,', '),''),nationality),
      primary_position=coalesce(new.primary_position,primary_position), current_club=coalesce(new.current_club,current_club), current_league=coalesce(new.current_league,current_league),
      current_country=coalesce(new.current_country,current_country), current_competition_id=coalesce(new.current_competition_id,current_competition_id),
      current_season_label=coalesce(new.current_season_label,current_season_label), current_season_start=coalesce(new.current_season_start,current_season_start),
      football_provider_ids=coalesce(football_provider_ids,'{}'::jsonb)||coalesce(new.football_provider_ids,'{}'::jsonb), stats_url=coalesce(new.stats_url,stats_url),
      transfermarkt_url=coalesce(new.transfermarkt_url,transfermarkt_url), wyscout_url=coalesce(new.wyscout_url,wyscout_url),
      transfermarkt_market_value=coalesce(new.transfermarkt_market_value,transfermarkt_market_value),
      transfermarkt_market_value_currency=coalesce(new.transfermarkt_market_value_currency,transfermarkt_market_value_currency),
      transfermarkt_value_verified_at=coalesce(new.transfermarkt_value_verified_at,transfermarkt_value_verified_at), updated_at=now()
    where id=v_subject_id;
  end if;
  return new;
end;$function$;


CREATE OR REPLACE FUNCTION djm_os.sync_football_subject_from_prospect()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_subject_id uuid; v_player_id uuid;
begin
  v_player_id:=coalesce(new.signed_player_id,new.linked_player_id);
  select s.id into v_subject_id from djm_os.football_intelligence_subjects s where s.prospect_id=new.id limit 1;
  if v_subject_id is null and v_player_id is not null then
    select s.id into v_subject_id from djm_os.football_intelligence_subjects s where s.player_id=v_player_id limit 1;
  end if;
  if v_subject_id is null then
    insert into djm_os.football_intelligence_subjects(
      player_id,prospect_id,representation_status,full_name,date_of_birth,nationality,primary_position,current_club,current_league,current_country,
      current_competition_id,current_season_label,current_season_start,football_provider_ids,stats_url,transfermarkt_url,wyscout_url,canonical_key,
      external_data_status,external_data_checked_at,external_data_error,transfermarkt_market_value,transfermarkt_market_value_currency,transfermarkt_value_verified_at,updated_at)
    values(v_player_id,new.id,case when v_player_id is null then 'prospect' else 'signed' end,new.full_name,new.date_of_birth,new.nationality,new.primary_position,new.current_club,new.current_league,new.current_country,
      new.current_competition_id,new.current_season_label,new.current_season_start,coalesce(new.football_provider_ids,'{}'::jsonb),new.stats_url,new.transfermarkt_url,new.wyscout_url,
      coalesce(new.canonical_key,lower(regexp_replace(new.full_name,'[^a-zA-Z0-9]+','-','g'))),new.external_data_status,new.external_data_checked_at,new.external_data_error,
      new.market_value,new.market_value_currency,new.market_value_verified_at,now());
  else
    update djm_os.football_intelligence_subjects set
      player_id=coalesce(v_player_id,player_id), prospect_id=new.id, representation_status=case when coalesce(v_player_id,player_id) is null then 'prospect' else 'signed' end,
      full_name=new.full_name,date_of_birth=coalesce(new.date_of_birth,date_of_birth),nationality=coalesce(new.nationality,nationality),primary_position=coalesce(new.primary_position,primary_position),
      current_club=coalesce(new.current_club,current_club),current_league=coalesce(new.current_league,current_league),current_country=coalesce(new.current_country,current_country),
      current_competition_id=coalesce(new.current_competition_id,current_competition_id),current_season_label=coalesce(new.current_season_label,current_season_label),
      current_season_start=coalesce(new.current_season_start,current_season_start),football_provider_ids=coalesce(football_provider_ids,'{}'::jsonb)||coalesce(new.football_provider_ids,'{}'::jsonb),
      stats_url=coalesce(new.stats_url,stats_url),transfermarkt_url=coalesce(new.transfermarkt_url,transfermarkt_url),wyscout_url=coalesce(new.wyscout_url,wyscout_url),
      canonical_key=coalesce(new.canonical_key,canonical_key),external_data_status=new.external_data_status,external_data_checked_at=new.external_data_checked_at,external_data_error=new.external_data_error,
      transfermarkt_market_value=coalesce(new.market_value,transfermarkt_market_value),transfermarkt_market_value_currency=coalesce(new.market_value_currency,transfermarkt_market_value_currency),
      transfermarkt_value_verified_at=coalesce(new.market_value_verified_at,transfermarkt_value_verified_at),updated_at=now()
    where id=v_subject_id;
  end if;
  return new;
end;$function$;


CREATE OR REPLACE FUNCTION djm_os.sync_official_peer_role_to_player_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.provider = 'official_league'
     and nullif(trim(coalesce(new.provider_position, '')), '') is not null then
    update djm_os.player_provider_stat_snapshots s
    set metrics = jsonb_set(
                    jsonb_set(coalesce(s.metrics, '{}'::jsonb), '{role}', to_jsonb(new.provider_position), true),
                    '{current_season,role}',
                    to_jsonb(new.provider_position),
                    true
                  ),
        updated_at = now()
    where s.provider = 'official_league'
      and s.provider_competition_id = new.provider_competition_id
      and s.provider_season_id = new.provider_season_id
      and s.provider_player_id = new.provider_player_id
      and (
        nullif(s.metrics ->> 'role', '') is null
        or nullif(s.metrics #>> '{current_season,role}', '') is null
      );
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.sync_official_subject_career_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_subject djm_os.football_intelligence_subjects%rowtype;
  v_current jsonb := coalesce(new.metrics -> 'current_season', '{}'::jsonb);
  v_entry_id uuid;
  v_source_url text := coalesce(
    nullif(trim(new.metrics #>> '{source,url}'), ''),
    nullif(trim(new.provenance ->> 'source_url'), '')
  );
  v_season text := coalesce(nullif(trim(new.season_label), ''), nullif(trim(new.provider_season_id), ''));
begin
  if new.provider <> 'official_league' then
    return new;
  end if;

  select * into v_subject
  from djm_os.football_intelligence_subjects s
  where s.id = new.subject_id;

  if not found or v_subject.player_id is null then
    return new;
  end if;

  select c.id into v_entry_id
  from public.career_entries c
  where c.player_id = v_subject.player_id
    and c.source_provider = 'official_league'
    and c.source_provider_player_id = new.provider_player_id
    and coalesce(c.season_label, '') = coalesce(v_season, '')
    and lower(c.club_name) = lower(coalesce(new.club_name, v_subject.current_club, ''))
  order by c.source_synced_at desc nulls last, c.updated_at desc
  limit 1;

  if v_entry_id is null then
    insert into public.career_entries (
      player_id, club_name, country, league, season_label,
      appearances, starts, minutes, goals, assists, notes,
      is_international, sort_order, source_name, source_url,
      source_reviewed_at, source_provider, source_acceptance_method,
      source_provider_player_id, source_synced_at, competition_id,
      created_at, updated_at
    ) values (
      v_subject.player_id,
      coalesce(nullif(trim(new.club_name), ''), v_subject.current_club, 'Unknown club'),
      v_subject.current_country,
      coalesce(nullif(trim(new.competition_name), ''), v_subject.current_league),
      v_season,
      nullif(v_current ->> 'apps', '')::integer,
      nullif(v_current ->> 'starts', '')::integer,
      nullif(v_current ->> 'minutes', '')::integer,
      nullif(v_current ->> 'goals', '')::integer,
      nullif(v_current ->> 'assists', '')::integer,
      'Official season totals maintained by the automated football data refresh.',
      false,
      coalesce((select max(c.sort_order) + 1 from public.career_entries c where c.player_id = v_subject.player_id), 0),
      coalesce(nullif(trim(new.metrics #>> '{source,name}'), ''), 'Official league statistics'),
      v_source_url,
      new.observed_at,
      'official_league',
      'official_source_sync',
      new.provider_player_id,
      new.synced_at,
      v_subject.current_competition_id,
      now(),
      now()
    );
  else
    update public.career_entries
    set club_name = coalesce(nullif(trim(new.club_name), ''), club_name),
        country = coalesce(v_subject.current_country, country),
        league = coalesce(nullif(trim(new.competition_name), ''), v_subject.current_league, league),
        season_label = coalesce(v_season, season_label),
        appearances = coalesce(nullif(v_current ->> 'apps', '')::integer, appearances),
        starts = coalesce(nullif(v_current ->> 'starts', '')::integer, starts),
        minutes = coalesce(nullif(v_current ->> 'minutes', '')::integer, minutes),
        goals = coalesce(nullif(v_current ->> 'goals', '')::integer, goals),
        assists = coalesce(nullif(v_current ->> 'assists', '')::integer, assists),
        notes = 'Official season totals maintained by the automated football data refresh.',
        source_name = coalesce(nullif(trim(new.metrics #>> '{source,name}'), ''), source_name),
        source_url = coalesce(v_source_url, source_url),
        source_reviewed_at = new.observed_at,
        source_synced_at = new.synced_at,
        competition_id = coalesce(v_subject.current_competition_id, competition_id),
        updated_at = now()
    where id = v_entry_id;
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.sync_opportunity_identity_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_person uuid; v_owner uuid;
begin
  v_owner:=coalesce(new.owner_id,(select tm.user_id from djm_os.team_members tm where tm.is_active order by tm.created_at limit 1));
  if djm_os.canonical_org_key(new.club_name) is not null then v_org:=djm_os.ensure_organisation(new.club_name,new.country); end if;
  if nullif(trim(coalesce(new.contact_name,'')),'') is not null then
    select p.id into v_person from djm_os.people p where lower(trim(p.full_name))=lower(trim(new.contact_name)) order by p.created_at limit 1;
    if v_person is null then
      insert into djm_os.people(full_name,person_type,source_confidence,last_verified_at) values(trim(new.contact_name),'club_contact',0.95,now()) returning id into v_person;
    end if;
    if v_org is not null then
      update djm_os.employments set is_current=false,ended_on=coalesce(ended_on,current_date),updated_at=now() where person_id=v_person and is_current=true and organisation_id<>v_org;
      insert into djm_os.employments(person_id,organisation_id,role_title,is_current,confidence,last_verified_at)
      select v_person,v_org,nullif(trim(new.contact_role),''),true,0.95,now()
      where not exists(select 1 from djm_os.employments e where e.person_id=v_person and e.organisation_id=v_org and e.is_current=true);
      if new.contact_role is not null then update djm_os.employments set role_title=coalesce(nullif(trim(new.contact_role),''),role_title),last_verified_at=now(),updated_at=now() where person_id=v_person and organisation_id=v_org and is_current=true; end if;
    end if;
    if v_owner is not null and exists(select 1 from djm_os.team_members where user_id=v_owner and is_active) then insert into djm_os.relationships(team_member_id,person_id,strength_score,first_known_at) values(v_owner,v_person,25,coalesce(new.created_at,now())) on conflict(team_member_id,person_id) do nothing; end if;
  end if;
  if v_org is not null then
    insert into djm_os.opportunity_links(opportunity_id,organisation_id,person_id,confidence,linked_by,created_at,updated_at)
    values(new.id,v_org,v_person,case when v_person is null then 0.9 else 0.95 end,v_owner,now(),now())
    on conflict(opportunity_id) do update set organisation_id=excluded.organisation_id,person_id=coalesce(excluded.person_id,djm_os.opportunity_links.person_id),confidence=excluded.confidence,linked_by=coalesce(excluded.linked_by,djm_os.opportunity_links.linked_by),updated_at=now();
  end if;
  return new;
end $function$;


CREATE OR REPLACE FUNCTION djm_os.sync_player_private_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'djm_os'
AS $function$
declare n record;
begin
  insert into djm_os.player_market_facts(player_id,market_preferences,relocation_preferences,salary_expectation,travel_availability,passports_held,work_rights,preferred_move_timing,last_synced_at)
  values(new.player_id,new.market_preferences,new.relocation_preferences,new.salary_expectation,new.travel_availability,coalesce(new.passports_held,'{}'),new.work_rights,new.preferred_move_timing,now())
  on conflict(player_id) do update set market_preferences=excluded.market_preferences,relocation_preferences=excluded.relocation_preferences,salary_expectation=excluded.salary_expectation,travel_availability=excluded.travel_availability,passports_held=excluded.passports_held,work_rights=excluded.work_rights,preferred_move_timing=excluded.preferred_move_timing,last_synced_at=now();
  insert into djm_os.events(event_type,player_id,payload,source,occurred_at) values('PLAYER_MARKET_PREFERENCES_CHANGED',new.player_id,jsonb_build_object('market_preferences',new.market_preferences,'relocation_preferences',new.relocation_preferences,'salary_expectation',new.salary_expectation,'preferred_move_timing',new.preferred_move_timing,'passports_held',new.passports_held,'work_rights',new.work_rights),'djm_player',now());
  for n in select id from djm_os.club_needs where status in ('active','open','confirmed') loop perform djm_os.refresh_need_matches(n.id); end loop;
  return new;
end $function$;


CREATE OR REPLACE FUNCTION djm_os.sync_recruitment_followup_task_title()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update djm_os.tasks
  set title='Follow up recruitment target: '||new.full_name, updated_at=now()
  where source='recruitment:'||new.id::text
    and status not in ('completed','cancelled')
    and title is distinct from 'Follow up recruitment target: '||new.full_name;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.sync_subject_career_from_player_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_subject_id uuid; v_player_id uuid; v_entry_id uuid;
begin
  v_player_id:=coalesce(new.player_id,old.player_id);
  v_entry_id:=coalesce(new.id,old.id);
  select id into v_subject_id from djm_os.football_intelligence_subjects where player_id=v_player_id limit 1;
  if v_subject_id is null then return coalesce(new,old); end if;
  if tg_op='DELETE' then
    delete from djm_os.football_subject_career_entries where source_entry_id=v_entry_id;
  else
    insert into djm_os.football_subject_career_entries(subject_id,source_entry_id,club_name,country,league,competition_id,season_label,start_date,end_date,appearances,starts,minutes,goals,assists,source_provider,source_name,source_url,source_reviewed_at,source_synced_at,provenance,updated_at)
    values(v_subject_id,new.id,new.club_name,new.country,new.league,new.competition_id,new.season_label,new.start_date,new.end_date,new.appearances,new.starts,new.minutes,new.goals,new.assists,new.source_provider,new.source_name,new.source_url,new.source_reviewed_at,new.source_synced_at,jsonb_build_object('source','public.career_entries','player_id',new.player_id),now())
    on conflict(source_entry_id) do update set subject_id=excluded.subject_id,club_name=excluded.club_name,country=excluded.country,league=excluded.league,competition_id=excluded.competition_id,season_label=excluded.season_label,start_date=excluded.start_date,end_date=excluded.end_date,appearances=excluded.appearances,starts=excluded.starts,minutes=excluded.minutes,goals=excluded.goals,assists=excluded.assists,source_provider=excluded.source_provider,source_name=excluded.source_name,source_url=excluded.source_url,source_reviewed_at=excluded.source_reviewed_at,source_synced_at=excluded.source_synced_at,provenance=excluded.provenance,updated_at=now();
  end if;
  perform djm_os.refresh_football_subject_scorecard(v_subject_id);
  return coalesce(new,old);
end;$function$;


CREATE OR REPLACE FUNCTION djm_os.thread_interaction_rollup(p_thread_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare t djm_os.conversation_threads%rowtype; v_interaction uuid; v_summary text; begin
  select * into t from djm_os.conversation_threads where id=p_thread_id; if not found then return null; end if;
  select left(string_agg(coalesce(nullif(trim(coalesce(m.transcript_text,m.raw_text)),''),'['||m.message_type||']'),' | ' order by m.sent_at desc),1200) into v_summary from (select * from djm_os.messages where thread_id=p_thread_id order by sent_at desc limit 8)m;
  select id into v_interaction from djm_os.interactions where source_type='thread_rollup' and source_external_id=p_thread_id::text limit 1;
  if v_interaction is null then
    insert into djm_os.interactions(occurred_at,channel,direction,team_member_id,person_id,organisation_id,source_external_id,source_type,summary,confidence)
    values(coalesce(t.last_message_at,now()),t.channel,'thread',t.owner_user_id,t.person_id,t.organisation_id,p_thread_id::text,'thread_rollup',v_summary,1) returning id into v_interaction;
  else
    update djm_os.interactions set occurred_at=coalesce(t.last_message_at,occurred_at),person_id=coalesce(t.person_id,person_id),organisation_id=coalesce(t.organisation_id,organisation_id),summary=v_summary where id=v_interaction;
  end if;
  update djm_os.conversation_threads set latest_summary=v_summary where id=p_thread_id;
  if t.person_id is not null then insert into djm_os.relationships(team_member_id,person_id,last_meaningful_at,first_known_at,strength_score) values(t.owner_user_id,t.person_id,t.last_message_at,t.first_message_at,35) on conflict(team_member_id,person_id) do update set last_meaningful_at=greatest(coalesce(djm_os.relationships.last_meaningful_at,excluded.last_meaningful_at),excluded.last_meaningful_at),first_known_at=least(coalesce(djm_os.relationships.first_known_at,excluded.first_known_at),excluded.first_known_at),updated_at=now(); end if;
  return v_interaction;
end; $function$;


CREATE OR REPLACE FUNCTION djm_os.validate_player_primary_staff()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.primary_staff_user_id is not null
     and not exists (
       select 1 from djm_os.team_members tm
       where tm.user_id=new.primary_staff_user_id and tm.is_active
     ) then
    raise exception 'Assigned player owner must be an active DJM team member';
  end if;
  return new;
end;
$function$;


commit;
