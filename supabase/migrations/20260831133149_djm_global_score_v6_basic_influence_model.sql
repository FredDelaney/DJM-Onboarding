create or replace function djm_os.global_broad_role(p_position text)
returns text language plpgsql immutable set search_path='' as $$
declare g text:=private.djm_position_group(p_position); n text:=lower(coalesce(p_position,''));
begin
  if g='GK' or n like '%goalkeeper%' then return 'goalkeeper'; end if;
  if g in ('CB','FB_WB') or n like '%defender%' or n like '%back%' then return 'defender'; end if;
  if g in ('DM','CM','AM') or n like '%midfield%' then return 'midfielder'; end if;
  if g in ('W','ST') or n like '%forward%' or n like '%striker%' or n like '%winger%' then return 'attacker'; end if;
  return 'unknown';
end; $$;

create or replace function djm_os.safe_json_number(p_value text)
returns numeric language plpgsql immutable set search_path='' as $$
begin
  if p_value is null or btrim(p_value)='' then return null; end if;
  if btrim(p_value) ~ '^-?[0-9]+([.][0-9]+)?$' then return btrim(p_value)::numeric; end if;
  return null;
end; $$;

create or replace function djm_os.refresh_football_subject_scorecard(p_subject_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  s djm_os.football_intelligence_subjects%rowtype;
  snap djm_os.football_subject_provider_snapshots%rowtype;
  c djm_os.competitions%rowtype;
  v_country text; v_league text; v_tier integer; v_role text;
  v_comp numeric; v_comp_quality numeric:=0;
  v_minutes numeric; v_apps numeric; v_starts numeric; v_goals90 numeric; v_assists90 numeric; v_rating numeric;
  v_max_apps numeric; v_possible_minutes numeric; v_min_share numeric; v_start_share numeric; v_role_score numeric; v_role_quality numeric:=0;
  v_peer_count integer:=0; v_peer_quality numeric:=0;
  v_goal_pct numeric; v_assist_pct numeric; v_rating_pct numeric; v_prod_score numeric; v_prod_quality numeric:=0;
  v_score numeric:=50; v_conf integer:=0; v_coverage integer:=0; v_state text:='enriching'; v_grade text:='building';
  v_band integer:=24; v_fingerprint text; v_basis jsonb; v_missing jsonb:='[]'::jsonb;
  v_weight numeric:=0; v_total numeric:=0;
begin
  select * into s from djm_os.football_intelligence_subjects where id=p_subject_id;
  if not found then raise exception 'Football intelligence subject not found'; end if;

  if s.current_competition_id is not null then select * into c from djm_os.competitions where id=s.current_competition_id; end if;
  v_country:=coalesce(nullif(s.current_country,''),c.country);
  v_league:=coalesce(nullif(s.current_league,''),c.display_name);
  v_tier:=coalesce(c.level_tier,djm_os.infer_global_league_tier(v_country,v_league),1);
  v_role:=djm_os.global_broad_role(s.primary_position);
  v_comp:=djm_os.global_competition_level_score(v_country,v_league,v_tier);
  if v_comp is not null then v_comp_quality:=0.90; else v_missing:=v_missing||jsonb_build_array('competition_strength'); end if;

  select * into snap from djm_os.football_subject_provider_snapshots x where x.subject_id=s.id
  order by case x.provider when 'pitchapi' then 1 when 'official_league' then 2 when 'api_football' then 3 when 'thesportsdb' then 4 else 9 end,
           x.observed_at desc nulls last,x.updated_at desc limit 1;

  if snap.id is not null then
    v_minutes:=coalesce(djm_os.safe_json_number(snap.metrics#>>'{current_season,minutes}'),djm_os.safe_json_number(snap.metrics#>>'{current_window,minutes}'),djm_os.safe_json_number(snap.metrics->>'minutes'));
    v_apps:=coalesce(djm_os.safe_json_number(snap.metrics#>>'{current_season,apps}'),djm_os.safe_json_number(snap.metrics#>>'{current_window,apps}'),djm_os.safe_json_number(snap.metrics->>'apps'));
    v_starts:=coalesce(djm_os.safe_json_number(snap.metrics#>>'{current_season,starts}'),djm_os.safe_json_number(snap.metrics#>>'{current_window,starts}'),djm_os.safe_json_number(snap.metrics->>'starts'));
    v_goals90:=coalesce(djm_os.safe_json_number(snap.metrics#>>'{current_season,goals90}'),djm_os.safe_json_number(snap.metrics#>>'{current_window,goals90}'),djm_os.safe_json_number(snap.metrics->>'goals90'));
    v_assists90:=coalesce(djm_os.safe_json_number(snap.metrics#>>'{current_season,assists90}'),djm_os.safe_json_number(snap.metrics#>>'{current_window,assists90}'),djm_os.safe_json_number(snap.metrics->>'assists90'));
    v_rating:=coalesce(djm_os.safe_json_number(snap.metrics#>>'{current_season,rating}'),djm_os.safe_json_number(snap.metrics#>>'{current_window,rating}'),djm_os.safe_json_number(snap.metrics->>'rating'));

    select max(djm_os.safe_json_number(p.metrics->>'apps')),
           count(*) filter(where coalesce(p.provider_position,'unknown')=v_role and p.minutes>=180)
    into v_max_apps,v_peer_count
    from djm_os.provider_peer_stat_snapshots p
    where p.provider=snap.provider and p.provider_competition_id=snap.provider_competition_id and p.provider_season_id=snap.provider_season_id;

    if coalesce(v_max_apps,0)>0 and coalesce(v_minutes,0)>0 then
      v_possible_minutes:=v_max_apps*90;
      v_min_share:=least(1,greatest(0,v_minutes/nullif(v_possible_minutes,0)));
      v_start_share:=case when v_starts is not null then least(1,greatest(0,v_starts/nullif(v_max_apps,0))) else v_min_share end;
      v_role_score:=25+75*(.72*v_min_share+.28*v_start_share);
      v_role_quality:=least(1,(1-exp(-v_minutes/700.0))*(.75+.25*least(1,v_peer_count/25.0)));
    elsif coalesce(v_minutes,0)>0 then
      v_role_score:=25+75*(1-exp(-v_minutes/900.0));
      v_role_quality:=least(.82,1-exp(-v_minutes/900.0));
    else v_missing:=v_missing||jsonb_build_array('role_minutes'); end if;

    if v_peer_count>=6 then
      v_peer_quality:=least(1,v_peer_count/35.0);
      if v_goals90 is not null then
        select round(100.0*(count(*) filter(where djm_os.safe_json_number(p.metrics->>'goals90')<v_goals90)+.5*count(*) filter(where djm_os.safe_json_number(p.metrics->>'goals90')=v_goals90))/nullif(count(*) filter(where djm_os.safe_json_number(p.metrics->>'goals90') is not null),0),2)
        into v_goal_pct from djm_os.provider_peer_stat_snapshots p where p.provider=snap.provider and p.provider_competition_id=snap.provider_competition_id and p.provider_season_id=snap.provider_season_id and coalesce(p.provider_position,'unknown')=v_role and p.minutes>=180;
      end if;
      if v_assists90 is not null then
        select round(100.0*(count(*) filter(where djm_os.safe_json_number(p.metrics->>'assists90')<v_assists90)+.5*count(*) filter(where djm_os.safe_json_number(p.metrics->>'assists90')=v_assists90))/nullif(count(*) filter(where djm_os.safe_json_number(p.metrics->>'assists90') is not null),0),2)
        into v_assist_pct from djm_os.provider_peer_stat_snapshots p where p.provider=snap.provider and p.provider_competition_id=snap.provider_competition_id and p.provider_season_id=snap.provider_season_id and coalesce(p.provider_position,'unknown')=v_role and p.minutes>=180;
      end if;
      if v_rating is not null then
        select round(100.0*(count(*) filter(where djm_os.safe_json_number(p.metrics->>'rating')<v_rating)+.5*count(*) filter(where djm_os.safe_json_number(p.metrics->>'rating')=v_rating))/nullif(count(*) filter(where djm_os.safe_json_number(p.metrics->>'rating') is not null),0),2)
        into v_rating_pct from djm_os.provider_peer_stat_snapshots p where p.provider=snap.provider and p.provider_competition_id=snap.provider_competition_id and p.provider_season_id=snap.provider_season_id and coalesce(p.provider_position,'unknown')=v_role and p.minutes>=180;
      end if;

      if v_role='attacker' then
        if v_goal_pct is not null then v_total:=v_total+v_goal_pct*.55; v_weight:=v_weight+.55; end if;
        if v_assist_pct is not null then v_total:=v_total+v_assist_pct*.25; v_weight:=v_weight+.25; end if;
        if v_rating_pct is not null then v_total:=v_total+v_rating_pct*.20; v_weight:=v_weight+.20; end if;
      elsif v_role='midfielder' then
        if v_goal_pct is not null then v_total:=v_total+v_goal_pct*.25; v_weight:=v_weight+.25; end if;
        if v_assist_pct is not null then v_total:=v_total+v_assist_pct*.35; v_weight:=v_weight+.35; end if;
        if v_rating_pct is not null then v_total:=v_total+v_rating_pct*.40; v_weight:=v_weight+.40; end if;
      elsif v_role='defender' then
        if v_rating_pct is not null then v_total:=v_total+v_rating_pct*.70; v_weight:=v_weight+.70; end if;
        if v_goal_pct is not null then v_total:=v_total+v_goal_pct*.15; v_weight:=v_weight+.15; end if;
        if v_assist_pct is not null then v_total:=v_total+v_assist_pct*.15; v_weight:=v_weight+.15; end if;
      elsif v_role='goalkeeper' and v_rating_pct is not null then v_total:=v_rating_pct; v_weight:=1; end if;
      if v_weight>0 then v_prod_score:=v_total/v_weight; v_prod_quality:=least(1,v_peer_quality*coalesce(least(1,v_minutes/900.0),0)); end if;
    end if;
  else v_missing:=v_missing||jsonb_build_array('verified_provider_identity','role_minutes','peer_cohort'); end if;

  v_total:=0; v_weight:=0;
  if v_comp is not null then v_total:=v_total+v_comp*.55; v_weight:=v_weight+.55; end if;
  if v_role_score is not null then v_total:=v_total+v_role_score*.35; v_weight:=v_weight+.35; end if;
  if v_prod_score is not null then v_total:=v_total+v_prod_score*.10; v_weight:=v_weight+.10; end if;
  if v_weight>0 then v_score:=greatest(0,least(100,v_total/v_weight)); else v_score:=50; end if;

  v_conf:=round(100*least(1,
    .25*v_comp_quality+
    .20*(case when snap.id is not null and nullif(snap.provider_player_id,'') is not null then coalesce(snap.confidence,.9) else 0 end)+
    .30*v_role_quality+
    .15*v_peer_quality+
    .10*v_prod_quality
  ));
  v_coverage:=least(100,round(100*(case when v_comp is not null then .35 else 0 end+case when v_role_score is not null then .35 else 0 end+case when snap.id is not null then .15 else 0 end+case when v_peer_count>=6 then .10 else 0 end+case when v_prod_score is not null then .05 else 0 end)));
  v_state:=case when v_conf>=85 then 'elite_evidence' when v_conf>=75 then 'ready' when v_conf>=60 then 'usable' else 'enriching' end;
  v_grade:=case when v_conf>=85 then 'A' when v_conf>=75 then 'B' when v_conf>=60 then 'C' else 'BUILDING' end;
  v_band:=case when v_conf>=90 then 5 when v_conf>=80 then 7 when v_conf>=70 then 10 when v_conf>=60 then 13 else 20 end;
  if v_prod_score is null then v_missing:=v_missing||jsonb_build_array('position_peer_performance'); end if;
  if v_role_score is null then v_missing:=v_missing||jsonb_build_array('role_sample'); end if;

  v_fingerprint:=md5(jsonb_build_object('model','djm_global_score_v6_basic_influence','subject',s.id,'country',v_country,'league',v_league,'tier',v_tier,'position',s.primary_position,'provider',snap.provider,'provider_player_id',snap.provider_player_id,'competition',snap.provider_competition_id,'season',snap.provider_season_id,'minutes',v_minutes,'apps',v_apps,'starts',v_starts,'competition_score',v_comp,'role_score',v_role_score,'production_score',v_prod_score,'peer_count',v_peer_count)::text);
  v_basis:=jsonb_build_object(
    'model','DJM Global Score V6','model_version','djm_global_score_v6_basic_influence','definition','Global current-level score built from universally obtainable competition strength, player role/minutes and position-aware peer output. Advanced event data upgrades precision but is not required.','score_state',v_state,'evidence_grade',v_grade,'competition_level_score',case when v_comp is null then null else round(v_comp,2) end,'competition_level_weight',.55,'role_score',case when v_role_score is null then null else round(v_role_score,2) end,'role_weight',.35,'production_score',case when v_prod_score is null then null else round(v_prod_score,2) end,'production_weight',.10,'minutes',v_minutes,'appearances',v_apps,'starts',v_starts,'peer_count',v_peer_count,'broad_role',v_role,'provider',snap.provider,'provider_player_id',snap.provider_player_id,'provider_competition_id',snap.provider_competition_id,'provider_season_id',snap.provider_season_id,'confidence',v_conf,'data_coverage',v_coverage,'missing_inputs',v_missing,'input_fingerprint',v_fingerprint,'age_used_in_current_score',false,'advanced_data_required',false,'bootstrap_prior_only',v_weight=0
  );

  insert into djm_os.football_subject_scorecards(subject_id,display_score,model_score,provisional_score,potential_score,score_tier,confidence,data_coverage,position_group,basis,missing_inputs,model_version,calculated_at,provenance,updated_at)
  values(s.id,round(v_score)::smallint,case when v_conf>=75 then round(v_score)::smallint else null end,case when v_conf<75 then round(v_score)::smallint else null end,null,case when v_conf>=75 then 'global' else 'provisional' end,v_conf::smallint,v_coverage::smallint,private.djm_position_group(s.primary_position),v_basis,v_missing,'djm_global_score_v6_basic_influence',now(),jsonb_build_object('source','global_subject_model','subject_id',s.id,'provider',snap.provider,'score_state',v_state),now())
  on conflict(subject_id) do update set display_score=excluded.display_score,model_score=excluded.model_score,provisional_score=excluded.provisional_score,potential_score=excluded.potential_score,score_tier=excluded.score_tier,confidence=excluded.confidence,data_coverage=excluded.data_coverage,position_group=excluded.position_group,basis=excluded.basis,missing_inputs=excluded.missing_inputs,model_version=excluded.model_version,calculated_at=excluded.calculated_at,provenance=excluded.provenance,updated_at=now();

  return jsonb_build_object('subject_id',s.id,'display_score',round(v_score),'confidence',v_conf,'evidence_grade',v_grade,'score_state',v_state,'competition_level_score',v_comp,'role_score',v_role_score,'production_score',v_prod_score,'peer_count',v_peer_count,'model_version','djm_global_score_v6_basic_influence');
end; $$;

create or replace function public.djm_football_subject_score_v6(p_subject_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  return djm_os.refresh_football_subject_scorecard(p_subject_id);
end; $$;
revoke all on function public.djm_football_subject_score_v6(uuid) from public,anon;
grant execute on function public.djm_football_subject_score_v6(uuid) to authenticated,service_role;

-- Recalculate every existing subject as validation fixtures only; model contains no subject-specific rules.
do $$ declare r record; begin for r in select id from djm_os.football_intelligence_subjects loop perform djm_os.refresh_football_subject_scorecard(r.id); end loop; end $$;