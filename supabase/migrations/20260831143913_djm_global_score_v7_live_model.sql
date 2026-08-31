create or replace function djm_os.refresh_football_subject_scorecard(p_subject_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  base jsonb;
  s djm_os.football_intelligence_subjects%rowtype;
  sc djm_os.football_subject_scorecards%rowtype;
  snap djm_os.football_subject_provider_snapshots%rowtype;
  teamctx jsonb;
  prodctx jsonb;
  matchctx jsonb;
  careerctx jsonb;
  kernel jsonb;
  components jsonb;
  missing jsonb:='[]'::jsonb;
  v_country text;
  v_comp numeric;
  v_comp_q numeric:=0;
  v_team numeric;
  v_team_q numeric:=0;
  v_team_eligible boolean:=false;
  v_role numeric;
  v_role_q numeric:=0;
  v_prod numeric;
  v_prod_q numeric:=0;
  v_match numeric;
  v_match_q numeric:=0;
  v_market numeric;
  v_market_q numeric:=0;
  v_career numeric;
  v_career_q numeric:=0;
  v_identity_q numeric:=0;
  v_season_q numeric:=0;
  v_minutes numeric:=0;
  v_apps numeric:=0;
  v_score integer;
  v_conf integer;
  v_coverage integer;
  v_grade text;
  v_state text;
  v_model_score smallint;
  v_provisional smallint;
begin
  base:=djm_os.refresh_football_subject_scorecard_v6_core(p_subject_id);
  select * into s from djm_os.football_intelligence_subjects where id=p_subject_id;
  if not found then raise exception 'Football intelligence subject not found'; end if;
  select * into sc from djm_os.football_subject_scorecards where subject_id=p_subject_id;
  if not found then raise exception 'Football subject scorecard not initialised'; end if;

  v_comp:=djm_os.safe_json_number(sc.basis->>'competition_level_score');
  v_role:=djm_os.safe_json_number(sc.basis->>'role_score');
  v_minutes:=coalesce(djm_os.safe_json_number(sc.basis->>'minutes'),0);
  v_apps:=coalesce(djm_os.safe_json_number(sc.basis->>'appearances'),0);
  v_country:=s.current_country;
  if s.current_competition_id is not null then
    select coalesce(v_country,c.country) into v_country from djm_os.competitions c where c.id=s.current_competition_id;
  end if;
  v_comp_q:=case when v_comp is null then 0 else djm_os.global_country_strength_quality(v_country) end;

  select * into snap from djm_os.football_subject_provider_snapshots x where x.subject_id=p_subject_id
  order by case x.provider when 'pitchapi' then 1 when 'official_league' then 2 when 'api_football' then 3 when 'thesportsdb' then 4 else 9 end,
           x.observed_at desc nulls last,x.updated_at desc limit 1;
  v_identity_q:=djm_os.subject_identity_quality(p_subject_id);
  if snap.id is not null then
    v_season_q:=djm_os.global_subject_season_quality(p_subject_id,snap.provider_season_id);
    if nullif(snap.provider_player_id,'') is not null then
      v_identity_q:=greatest(v_identity_q,greatest(0,least(1,coalesce(snap.confidence,.75)))*greatest(.50,v_season_q));
    end if;
  end if;
  if v_role is not null and v_minutes>0 then v_role_q:=private.djm_v5_role_quality(v_minutes,v_apps)*greatest(.15,v_season_q); end if;

  teamctx:=djm_os.subject_team_context(p_subject_id);
  v_team:=djm_os.safe_json_number(teamctx->>'score');
  v_team_q:=coalesce(djm_os.safe_json_number(teamctx->>'quality'),0);
  v_team_eligible:=djm_os.clubelo_country_code(v_country) is not null and nullif(trim(coalesce(s.current_club,'')),'') is not null and not djm_os.is_secondary_team_name(s.current_club);

  prodctx:=djm_os.subject_position_production(p_subject_id);
  v_prod:=djm_os.safe_json_number(prodctx->>'score');
  v_prod_q:=coalesce(djm_os.safe_json_number(prodctx->>'quality'),0);

  matchctx:=djm_os.subject_match_influence(p_subject_id);
  v_match:=djm_os.safe_json_number(matchctx->>'score');
  v_match_q:=coalesce(djm_os.safe_json_number(matchctx->>'quality'),0);

  v_market:=djm_os.market_consensus_score(s.transfermarkt_market_value,s.transfermarkt_market_value_currency);
  v_market_q:=djm_os.market_value_quality(s.transfermarkt_value_verified_at,s.transfermarkt_market_value,s.transfermarkt_market_value_currency)*.90;

  careerctx:=djm_os.subject_career_context(p_subject_id);
  v_career:=djm_os.safe_json_number(careerctx->>'score');
  v_career_q:=coalesce(djm_os.safe_json_number(careerctx->>'quality'),0);

  components:=jsonb_build_object(
    'competition',jsonb_build_object('score',v_comp,'quality',v_comp_q,'weight',20,'eligible',true),
    'team_context',jsonb_build_object('score',v_team,'quality',v_team_q,'weight',10,'eligible',v_team_eligible),
    'role',jsonb_build_object('score',v_role,'quality',v_role_q,'weight',18,'eligible',true),
    'position_production',jsonb_build_object('score',v_prod,'quality',v_prod_q,'weight',20,'eligible',true),
    'match_influence',jsonb_build_object('score',v_match,'quality',v_match_q,'weight',12,'eligible',true),
    'market_consensus',jsonb_build_object('score',v_market,'quality',v_market_q,'weight',12,'eligible',true),
    'career_context',jsonb_build_object('score',v_career,'quality',v_career_q,'weight',8,'eligible',true)
  );
  kernel:=djm_os.global_score_kernel_v7(components,v_identity_q);
  v_score:=round((kernel->>'score')::numeric)::int;
  v_conf:=(kernel->>'confidence')::int;
  v_coverage:=(kernel->>'data_coverage')::int;
  v_grade:=kernel->>'evidence_grade';
  v_state:=kernel->>'score_state';
  v_model_score:=case when v_conf>=80 then v_score::smallint else null end;
  v_provisional:=case when v_conf<80 then v_score::smallint else null end;

  if v_comp is null then missing:=missing||jsonb_build_array('competition_strength'); end if;
  if v_role is null then missing:=missing||jsonb_build_array('role_minutes'); end if;
  if v_prod is null then missing:=missing||jsonb_build_array('position_specific_peer_production'); end if;
  if v_match is null then missing:=missing||jsonb_build_array('match_influence'); end if;
  if v_market is null then missing:=missing||jsonb_build_array('market_consensus'); end if;
  if v_career is null then missing:=missing||jsonb_build_array('verified_career_context'); end if;
  if v_identity_q<.75 then missing:=missing||jsonb_build_array('verified_identity'); end if;
  if v_team_eligible and v_team is null then missing:=missing||jsonb_build_array('team_strength_context'); end if;

  update djm_os.football_subject_scorecards set
    display_score=v_score::smallint,
    model_score=v_model_score,
    provisional_score=v_provisional,
    score_tier=case when v_conf>=80 then 'global' else 'provisional' end,
    confidence=v_conf::smallint,
    data_coverage=v_coverage::smallint,
    position_group=private.djm_position_group(s.primary_position),
    basis=coalesce(sc.basis,'{}'::jsonb)||jsonb_build_object(
      'model','DJM Global Score V7','model_version','djm_global_score_v7_match_position_market',
      'definition','Global current-level score using competition strength, team context, selection role, position-specific peer production, match influence, market consensus and verified career context. Missing evidence is omitted and never zero-imputed.',
      'kernel',kernel,
      'components',components,
      'team_context',teamctx,
      'position_production',prodctx,
      'match_influence',matchctx,
      'career_context',careerctx,
      'market_consensus_score',case when v_market is null then null else round(v_market,2) end,
      'market_consensus_quality',round(v_market_q,3),
      'market_consensus_rule','Transfermarkt value is a capped market-consensus signal. Published research shows age, playing position, team and league affect market value, so it cannot replace football evidence.',
      'market_bias_guard','Market quality is discounted by 10 percent until DJM has enough cross-sectional market data to calibrate age- and position-neutral residual value empirically.',
      'identity_quality',round(v_identity_q,3),
      'season_recency_quality',round(v_season_q,3),
      'score_state',v_state,'evidence_grade',v_grade,'confidence',v_conf,'data_coverage',v_coverage,
      'evidence_band',kernel->'evidence_band',
      'age_used_directly_in_current_score',false,
      'advanced_data_required',false,
      'missing_inputs',missing,
      'input_fingerprint',md5(jsonb_build_object('model','djm_global_score_v7_match_position_market','subject',p_subject_id,'components',components,'identity_quality',v_identity_q)::text)
    ),
    missing_inputs=missing,
    model_version='djm_global_score_v7_match_position_market',
    calculated_at=now(),
    provenance=coalesce(sc.provenance,'{}'::jsonb)||jsonb_build_object('source','global_subject_v7','subject_id',p_subject_id,'score_state',v_state,'market_used',v_market is not null,'match_influence_used',v_match is not null,'position_production_used',v_prod is not null),
    updated_at=now()
  where subject_id=p_subject_id;

  perform djm_os.refresh_football_subject_enrichment_queue(p_subject_id);
  return jsonb_build_object('subject_id',p_subject_id,'display_score',v_score,'confidence',v_conf,'data_coverage',v_coverage,'evidence_grade',v_grade,'score_state',v_state,'model_version','djm_global_score_v7_match_position_market','components',components,'missing_inputs',missing);
end;
$$;

create or replace function djm_os.refresh_football_subject_from_match_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform djm_os.refresh_football_subject_scorecard(coalesce(new.subject_id,old.subject_id));
  return coalesce(new,old);
end;
$$;

drop trigger if exists trg_football_subject_match_score on djm_os.football_subject_match_snapshots;
create trigger trg_football_subject_match_score
after insert or update or delete on djm_os.football_subject_match_snapshots
for each row execute function djm_os.refresh_football_subject_from_match_trigger();

create or replace function djm_os.refresh_football_subject_from_career_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform djm_os.refresh_football_subject_scorecard(coalesce(new.subject_id,old.subject_id));
  return coalesce(new,old);
end;
$$;

drop trigger if exists trg_football_subject_career_score on djm_os.football_subject_career_entries;
create trigger trg_football_subject_career_score
after insert or update or delete on djm_os.football_subject_career_entries
for each row execute function djm_os.refresh_football_subject_from_career_trigger();