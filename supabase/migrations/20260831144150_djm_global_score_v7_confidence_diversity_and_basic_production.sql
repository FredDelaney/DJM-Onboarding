create or replace function djm_os.subject_position_production(p_subject_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
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
$$;

create or replace function djm_os.global_score_kernel_v7(p_components jsonb,p_identity_quality numeric default 0)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  kv record;
  v_score_component numeric; v_quality numeric; v_nominal numeric; v_effective numeric; v_eligible boolean;
  v_total numeric:=0; v_observed numeric:=0; v_available numeric:=0; v_prior numeric:=40; v_score numeric:=50;
  v_coverage numeric:=0; v_diversity numeric:=0; v_identity numeric:=greatest(0,least(1,coalesce(p_identity_quality,0)));
  v_used integer:=0; v_current_football_used integer:=0; v_conf integer:=0; v_grade text; v_state text; v_band integer;
  v_has_prod boolean:=false; v_has_match boolean:=false; v_has_comp boolean:=false; v_has_role boolean:=false;
  v_used_detail jsonb:='{}'::jsonb;
begin
  for kv in select key,value from jsonb_each(coalesce(p_components,'{}'::jsonb)) loop
    v_score_component:=djm_os.safe_json_number(kv.value->>'score');
    v_quality:=greatest(0,least(1,coalesce(djm_os.safe_json_number(kv.value->>'quality'),0)));
    v_nominal:=greatest(0,coalesce(djm_os.safe_json_number(kv.value->>'weight'),0));
    v_eligible:=coalesce((kv.value->>'eligible')::boolean,true);
    if v_eligible then v_available:=v_available+v_nominal; end if;
    if not v_eligible or v_score_component is null or v_quality<=0 or v_nominal<=0 then continue; end if;
    v_effective:=v_nominal*v_quality;
    v_total:=v_total+greatest(0,least(100,v_score_component))*v_effective;
    v_observed:=v_observed+v_effective;
    v_used:=v_used+1;
    if kv.key in ('competition','team_context','role','position_production','match_influence') then v_current_football_used:=v_current_football_used+1; end if;
    if kv.key='position_production' then v_has_prod:=true; end if;
    if kv.key='match_influence' then v_has_match:=true; end if;
    if kv.key='competition' then v_has_comp:=true; end if;
    if kv.key='role' then v_has_role:=true; end if;
    v_used_detail:=v_used_detail||jsonb_build_object(kv.key,jsonb_build_object('score',round(v_score_component,2),'quality',round(v_quality,3),'nominal_weight',v_nominal,'effective_weight',round(v_effective,2)));
  end loop;
  v_prior:=greatest(6::numeric,40-.34*v_observed);
  if v_observed>0 then v_score:=greatest(0,least(100,(50*v_prior+v_total)/nullif(v_prior+v_observed,0))); end if;
  if v_available>0 then v_coverage:=least(1,v_observed/v_available); end if;
  v_diversity:=least(1,v_used/5.0);
  v_conf:=least(97,greatest(0,round(100*(.65*v_coverage+.15*v_diversity+.20*v_identity))::int));
  if v_current_football_used=0 then v_conf:=least(v_conf,55); end if;
  if v_identity<.50 then v_conf:=least(v_conf,75); end if;
  if v_coverage<.25 then v_conf:=least(v_conf,55); end if;
  if v_used<3 then v_conf:=least(v_conf,75); elsif v_used<4 then v_conf:=least(v_conf,82); elsif v_used<5 then v_conf:=least(v_conf,88); end if;
  if not v_has_comp then v_conf:=least(v_conf,70); end if;
  if not v_has_role and not v_has_match then v_conf:=least(v_conf,70); end if;
  if not v_has_prod and not v_has_match then v_conf:=least(v_conf,82); end if;
  v_state:=case when v_conf>=90 then 'elite_evidence' when v_conf>=80 then 'ready' when v_conf>=65 then 'usable' else 'enriching' end;
  v_grade:=case when v_conf>=90 then 'A+' when v_conf>=80 then 'A' when v_conf>=65 then 'B' else 'BUILDING' end;
  v_band:=case when v_conf>=92 then 4 when v_conf>=85 then 6 when v_conf>=80 then 7 when v_conf>=65 then 11 when v_conf>=50 then 15 else 22 end;
  return jsonb_build_object('score',round(v_score,2),'confidence',v_conf,'data_coverage',round(100*v_coverage),'evidence_grade',v_grade,'score_state',v_state,'identity_quality',round(v_identity,3),'observed_effective_weight',round(v_observed,2),'available_nominal_weight',round(v_available,2),'neutral_prior_score',50,'neutral_prior_strength',round(v_prior,2),'component_count',v_used,'components_used',v_used_detail,'evidence_band',jsonb_build_object('low',greatest(0,round(v_score)::int-v_band),'high',least(100,round(v_score)::int+v_band),'type','heuristic_evidence_band_not_statistical_confidence_interval'));
end;
$$;

create or replace function djm_os.refresh_football_subject_scorecard(p_subject_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  base jsonb; s djm_os.football_intelligence_subjects%rowtype; sc djm_os.football_subject_scorecards%rowtype; snap djm_os.football_subject_provider_snapshots%rowtype;
  teamctx jsonb; prodctx jsonb; matchctx jsonb; careerctx jsonb; kernel jsonb; components jsonb; missing jsonb:='[]'::jsonb;
  v_country text; v_comp numeric; v_comp_q numeric:=0; v_team numeric; v_team_q numeric:=0; v_role numeric; v_role_q numeric:=0; v_prod numeric; v_prod_q numeric:=0;
  v_match numeric; v_match_q numeric:=0; v_market numeric; v_market_q numeric:=0; v_career numeric; v_career_q numeric:=0; v_identity_q numeric:=0; v_season_q numeric:=0;
  v_minutes numeric:=0; v_apps numeric:=0; v_score integer; v_conf integer; v_coverage integer; v_grade text; v_state text; v_model_score smallint; v_provisional smallint;
  v_team_eligible boolean:=false; v_prod_eligible boolean:=false; v_match_eligible boolean:=false; v_market_eligible boolean:=false; v_career_eligible boolean:=false;
begin
  base:=djm_os.refresh_football_subject_scorecard_v6_core(p_subject_id);
  select * into s from djm_os.football_intelligence_subjects where id=p_subject_id; if not found then raise exception 'Football intelligence subject not found'; end if;
  select * into sc from djm_os.football_subject_scorecards where subject_id=p_subject_id; if not found then raise exception 'Football subject scorecard not initialised'; end if;
  v_comp:=djm_os.safe_json_number(sc.basis->>'competition_level_score'); v_role:=djm_os.safe_json_number(sc.basis->>'role_score'); v_minutes:=coalesce(djm_os.safe_json_number(sc.basis->>'minutes'),0); v_apps:=coalesce(djm_os.safe_json_number(sc.basis->>'appearances'),0); v_country:=s.current_country;
  if s.current_competition_id is not null then select coalesce(v_country,c.country) into v_country from djm_os.competitions c where c.id=s.current_competition_id; end if;
  v_comp_q:=case when v_comp is null then 0 else djm_os.global_country_strength_quality(v_country) end;
  select * into snap from djm_os.football_subject_provider_snapshots x where x.subject_id=p_subject_id order by case x.provider when 'pitchapi' then 1 when 'official_league' then 2 when 'api_football' then 3 when 'thesportsdb' then 4 else 9 end,x.observed_at desc nulls last,x.updated_at desc limit 1;
  v_identity_q:=djm_os.subject_identity_quality(p_subject_id);
  if snap.id is not null then v_season_q:=djm_os.global_subject_season_quality(p_subject_id,snap.provider_season_id); if nullif(snap.provider_player_id,'') is not null then v_identity_q:=greatest(v_identity_q,greatest(0,least(1,coalesce(snap.confidence,.75)))*greatest(.50,v_season_q)); end if; end if;
  if v_role is not null and v_minutes>0 then v_role_q:=private.djm_v5_role_quality(v_minutes,v_apps)*greatest(.15,v_season_q); end if;
  teamctx:=djm_os.subject_team_context(p_subject_id); v_team:=djm_os.safe_json_number(teamctx->>'score'); v_team_q:=coalesce(djm_os.safe_json_number(teamctx->>'quality'),0); v_team_eligible:=v_team is not null;
  prodctx:=djm_os.subject_position_production(p_subject_id); v_prod:=djm_os.safe_json_number(prodctx->>'score'); v_prod_q:=coalesce(djm_os.safe_json_number(prodctx->>'quality'),0); v_prod_eligible:=v_prod is not null;
  matchctx:=djm_os.subject_match_influence(p_subject_id); v_match:=djm_os.safe_json_number(matchctx->>'score'); v_match_q:=coalesce(djm_os.safe_json_number(matchctx->>'quality'),0); v_match_eligible:=v_match is not null;
  v_market:=djm_os.market_consensus_score(s.transfermarkt_market_value,s.transfermarkt_market_value_currency); v_market_q:=djm_os.market_value_quality(s.transfermarkt_value_verified_at,s.transfermarkt_market_value,s.transfermarkt_market_value_currency)*.90; v_market_eligible:=v_market is not null;
  careerctx:=djm_os.subject_career_context(p_subject_id); v_career:=djm_os.safe_json_number(careerctx->>'score'); v_career_q:=coalesce(djm_os.safe_json_number(careerctx->>'quality'),0); v_career_eligible:=v_career is not null;
  components:=jsonb_build_object(
    'competition',jsonb_build_object('score',v_comp,'quality',v_comp_q,'weight',20,'eligible',true),
    'team_context',jsonb_build_object('score',v_team,'quality',v_team_q,'weight',10,'eligible',v_team_eligible),
    'role',jsonb_build_object('score',v_role,'quality',v_role_q,'weight',18,'eligible',true),
    'position_production',jsonb_build_object('score',v_prod,'quality',v_prod_q,'weight',20,'eligible',v_prod_eligible),
    'match_influence',jsonb_build_object('score',v_match,'quality',v_match_q,'weight',12,'eligible',v_match_eligible),
    'market_consensus',jsonb_build_object('score',v_market,'quality',v_market_q,'weight',12,'eligible',v_market_eligible),
    'career_context',jsonb_build_object('score',v_career,'quality',v_career_q,'weight',8,'eligible',v_career_eligible));
  kernel:=djm_os.global_score_kernel_v7(components,v_identity_q); v_score:=round((kernel->>'score')::numeric)::int; v_conf:=(kernel->>'confidence')::int; v_coverage:=(kernel->>'data_coverage')::int; v_grade:=kernel->>'evidence_grade'; v_state:=kernel->>'score_state'; v_model_score:=case when v_conf>=80 then v_score::smallint else null end; v_provisional:=case when v_conf<80 then v_score::smallint else null end;
  if v_comp is null then missing:=missing||jsonb_build_array('competition_strength'); end if; if v_role is null then missing:=missing||jsonb_build_array('role_minutes'); end if; if v_prod is null then missing:=missing||jsonb_build_array('position_specific_peer_production'); end if; if v_match is null then missing:=missing||jsonb_build_array('match_influence'); end if; if v_market is null then missing:=missing||jsonb_build_array('market_consensus'); end if; if v_career is null then missing:=missing||jsonb_build_array('verified_career_context'); end if; if v_identity_q<.75 then missing:=missing||jsonb_build_array('verified_identity'); end if;
  update djm_os.football_subject_scorecards set display_score=v_score::smallint,model_score=v_model_score,provisional_score=v_provisional,score_tier=case when v_conf>=80 then 'global' else 'provisional' end,confidence=v_conf::smallint,data_coverage=v_coverage::smallint,position_group=private.djm_position_group(s.primary_position),basis=coalesce(sc.basis,'{}'::jsonb)||jsonb_build_object('model','DJM Global Score V7.1','model_version','djm_global_score_v7_1_diversity_calibrated','definition','Global current-level score using competition strength, selection role, position-specific peer production and optional team, match, market and career evidence. Confidence is capped by independent source diversity, not inflated by missing optional sources.','kernel',kernel,'components',components,'team_context',teamctx,'position_production',prodctx,'match_influence',matchctx,'career_context',careerctx,'market_consensus_score',case when v_market is null then null else round(v_market,2) end,'market_consensus_quality',round(v_market_q,3),'market_consensus_rule','Transfermarkt value is a capped market-consensus signal. Published research shows age, playing position, team and league affect market value, so it cannot replace football evidence.','market_bias_guard','Market quality is discounted by 10 percent until DJM has enough cross-sectional market data to calibrate age- and position-neutral residual value empirically.','identity_quality',round(v_identity_q,3),'season_recency_quality',round(v_season_q,3),'score_state',v_state,'evidence_grade',v_grade,'confidence',v_conf,'data_coverage',v_coverage,'evidence_band',kernel->'evidence_band','age_used_directly_in_current_score',false,'advanced_data_required',false,'missing_inputs',missing,'input_fingerprint',md5(jsonb_build_object('model','djm_global_score_v7_1_diversity_calibrated','subject',p_subject_id,'components',components,'identity_quality',v_identity_q)::text)),missing_inputs=missing,model_version='djm_global_score_v7_1_diversity_calibrated',calculated_at=now(),provenance=coalesce(sc.provenance,'{}'::jsonb)||jsonb_build_object('source','global_subject_v7_1','subject_id',p_subject_id,'score_state',v_state,'market_used',v_market is not null,'match_influence_used',v_match is not null,'position_production_used',v_prod is not null),updated_at=now() where subject_id=p_subject_id;
  perform djm_os.refresh_football_subject_enrichment_queue(p_subject_id);
  return jsonb_build_object('subject_id',p_subject_id,'display_score',v_score,'confidence',v_conf,'data_coverage',v_coverage,'evidence_grade',v_grade,'score_state',v_state,'model_version','djm_global_score_v7_1_diversity_calibrated','components',components,'missing_inputs',missing);
end;
$$;