create or replace function djm_os.refresh_football_subject_scorecard(p_subject_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 r jsonb; s djm_os.football_intelligence_subjects%rowtype; sc djm_os.football_subject_scorecards%rowtype; snap djm_os.football_subject_provider_snapshots%rowtype; career jsonb; teamctx jsonb;
 v_comp numeric; v_team numeric; v_role numeric; v_prod numeric; v_market numeric; v_career numeric; v_minutes numeric:=0; v_apps numeric:=0; v_peers numeric:=0;
 v_country_q numeric:=0; v_team_q numeric:=0; v_season_q numeric:=0; v_role_q numeric:=0; v_peer_q numeric:=0; v_prod_q numeric:=0; v_identity_q numeric:=0; v_market_q numeric:=0; v_career_q numeric:=0;
 v_w_comp numeric:=0; v_w_team numeric:=0; v_w_role numeric:=0; v_w_prod numeric:=0; v_w_market numeric:=0; v_w_career numeric:=0; v_observed_weight numeric:=0; v_available_weight numeric:=88; v_prior_strength numeric:=45;
 v_total numeric:=0; v_score numeric:=50; v_conf integer:=0; v_band integer:=20; v_state text; v_grade text; v_basis jsonb; v_source_diversity numeric:=0;
begin
 r:=djm_os.refresh_football_subject_scorecard_v6_core(p_subject_id);
 select * into s from djm_os.football_intelligence_subjects where id=p_subject_id;
 select * into sc from djm_os.football_subject_scorecards where subject_id=p_subject_id;
 if not found then return r; end if;
 v_basis:=coalesce(sc.basis,'{}'::jsonb);
 v_comp:=djm_os.safe_json_number(v_basis->>'competition_level_score'); v_role:=djm_os.safe_json_number(v_basis->>'role_score'); v_prod:=djm_os.safe_json_number(v_basis->>'production_score');
 v_minutes:=coalesce(djm_os.safe_json_number(v_basis->>'minutes'),0); v_apps:=coalesce(djm_os.safe_json_number(v_basis->>'appearances'),0); v_peers:=coalesce(djm_os.safe_json_number(v_basis->>'peer_count'),0);
 v_country_q:=djm_os.global_country_strength_quality(s.current_country);
 teamctx:=djm_os.subject_team_context(p_subject_id); v_team:=djm_os.safe_json_number(teamctx->>'score'); v_team_q:=coalesce(djm_os.safe_json_number(teamctx->>'quality'),0); if v_team is not null then v_available_weight:=100; end if;
 v_market:=djm_os.market_consensus_score(s.transfermarkt_market_value,s.transfermarkt_market_value_currency); v_market_q:=djm_os.market_value_quality(s.transfermarkt_value_verified_at,s.transfermarkt_market_value,s.transfermarkt_market_value_currency);
 career:=djm_os.subject_career_context(p_subject_id); v_career:=djm_os.safe_json_number(career->>'score'); v_career_q:=coalesce(djm_os.safe_json_number(career->>'quality'),0);
 v_identity_q:=djm_os.subject_identity_quality(p_subject_id);
 select * into snap from djm_os.football_subject_provider_snapshots x where x.subject_id=p_subject_id order by case x.provider when 'pitchapi' then 1 when 'official_league' then 2 when 'api_football' then 3 when 'thesportsdb' then 4 else 9 end,x.observed_at desc nulls last,x.updated_at desc limit 1;
 if snap.id is not null then v_season_q:=djm_os.global_subject_season_quality(p_subject_id,snap.provider_season_id); v_identity_q:=greatest(v_identity_q,greatest(0,least(1,coalesce(snap.confidence,.75)))*greatest(.35,v_season_q)); else v_season_q:=0; end if;
 if v_minutes>0 then v_role_q:=private.djm_v5_role_quality(v_minutes,v_apps)*v_season_q; end if;
 if v_peers>=6 then v_peer_q:=least(1,v_peers/35.0)*v_season_q; end if;
 if v_prod is not null then v_prod_q:=v_peer_q*least(1,v_minutes/900.0)*v_season_q; end if;
 if v_comp is not null then v_w_comp:=26*v_country_q; v_total:=v_total+v_comp*v_w_comp; end if;
 if v_team is not null and v_team_q>0 then v_w_team:=12*v_team_q; v_total:=v_total+v_team*v_w_team; end if;
 if v_role is not null and v_role_q>0 then v_w_role:=22*v_role_q; v_total:=v_total+v_role*v_w_role; end if;
 if v_prod is not null and v_prod_q>0 then v_w_prod:=18*v_prod_q; v_total:=v_total+v_prod*v_w_prod; end if;
 if v_market is not null and v_market_q>0 then v_w_market:=12*v_market_q; v_total:=v_total+v_market*v_w_market; end if;
 if v_career is not null and v_career_q>0 then v_w_career:=10*v_career_q; v_total:=v_total+v_career*v_w_career; end if;
 v_observed_weight:=v_w_comp+v_w_team+v_w_role+v_w_prod+v_w_market+v_w_career;
 v_prior_strength:=greatest(7::numeric,45-.38*v_observed_weight);
 if v_observed_weight>0 then v_score:=greatest(0,least(100,(50*v_prior_strength+v_total)/nullif(v_prior_strength+v_observed_weight,0))); else v_score:=50; end if;
 v_source_diversity:=least(1::numeric,(case when v_comp is not null then .18 else 0 end)+(case when v_team is not null then .12 else 0 end)+(case when snap.id is not null then .22 else 0 end)+(case when v_identity_q>=.75 then .10 else 0 end)+(case when v_peers>=6 then .13 else 0 end)+(case when v_market is not null then .12 else 0 end)+(case when v_career is not null then .13 else 0 end));
 v_conf:=round(100*least(1,.25*least(1,v_observed_weight/nullif(v_available_weight,0))+.12*v_country_q+.05*v_team_q+.18*v_identity_q+.14*v_role_q+.07*v_peer_q+.04*v_market_q+.07*v_career_q+.08*v_source_diversity));
 v_conf:=least(97,greatest(0,v_conf)); if snap.id is null then v_conf:=least(v_conf,60); end if; if v_season_q<.5 and snap.id is not null then v_conf:=least(v_conf,65); end if;
 v_state:=case when v_conf>=90 then 'elite_evidence' when v_conf>=80 then 'ready' when v_conf>=65 then 'usable' else 'enriching' end; v_grade:=case when v_conf>=90 then 'A+' when v_conf>=80 then 'A' when v_conf>=65 then 'B' else 'BUILDING' end;
 v_band:=case when v_conf>=92 then 4 when v_conf>=85 then 6 when v_conf>=80 then 7 when v_conf>=65 then 11 when v_conf>=50 then 15 else 22 end;
 v_basis:=v_basis||jsonb_build_object('model','DJM Global Score V6.7','model_version','djm_global_score_v6_7_optional_source_calibrated','competition_strength_quality',round(v_country_q,3),'team_context_score',case when v_team is null then null else round(v_team,2) end,'team_context_quality',round(v_team_q,3),'team_context',teamctx,'season_recency_quality',round(v_season_q,3),'identity_quality',round(v_identity_q,3),'role_quality',round(v_role_q,3),'peer_quality',round(v_peer_q,3),'production_quality',round(v_prod_q,3),'market_consensus_score',case when v_market is null then null else round(v_market,2) end,'market_consensus_quality',round(v_market_q,3),'career_context_score',case when v_career is null then null else round(v_career,2) end,'career_context_quality',round(v_career_q,3),'career_context',career,'effective_weights',jsonb_build_object('competition',round(v_w_comp,2),'team_context',round(v_w_team,2),'role',round(v_w_role,2),'peer_production',round(v_w_prod,2),'market_consensus',round(v_w_market,2),'career_context',round(v_w_career,2)),'available_nominal_weight',v_available_weight,'neutral_prior_score',50,'neutral_prior_strength',round(v_prior_strength,2),'observed_effective_weight',round(v_observed_weight,2),'score_state',v_state,'evidence_grade',v_grade,'confidence',v_conf,'evidence_band',jsonb_build_object('low',greatest(0,round(v_score)::int-v_band),'high',least(100,round(v_score)::int+v_band),'type','heuristic_evidence_band_not_statistical_confidence_interval'),'optional_source_rule','Unavailable optional team context does not erase confidence earned from other independent evidence. It remains a visible enrichment target.','team_context_rule','ClubElo is used only as a within-league team-strength modifier. It does not replace competition strength and unmatched clubs remain unknown.','market_consensus_rule','Transfermarkt market value has up to 12 nominal score-weight points, logarithmic scaling and freshness decay. It materially influences the score but cannot dominate football evidence.','career_rule','Verified career evidence is recency-, source- and sample-weighted. Missing career history contributes no negative evidence.','age_used_directly_in_current_score',false,'advanced_data_required',false);
 update djm_os.football_subject_scorecards set display_score=round(v_score)::smallint,model_score=case when v_conf>=80 then round(v_score)::smallint else null end,provisional_score=case when v_conf<80 then round(v_score)::smallint else null end,score_tier=case when v_conf>=80 then 'global' else 'provisional' end,confidence=v_conf::smallint,data_coverage=least(100,round(v_observed_weight/nullif(v_available_weight,0)*100))::smallint,basis=v_basis,model_version='djm_global_score_v6_7_optional_source_calibrated',calculated_at=now(),provenance=coalesce(provenance,'{}'::jsonb)||jsonb_build_object('quality_guard','v6_7','team_context_used',v_team is not null,'market_consensus_used',v_market is not null,'career_context_used',v_career is not null),updated_at=now() where subject_id=p_subject_id;
 perform djm_os.refresh_football_subject_enrichment_queue(p_subject_id);
 return jsonb_build_object('subject_id',p_subject_id,'display_score',round(v_score),'confidence',v_conf,'evidence_grade',v_grade,'score_state',v_state,'team_context_score',case when v_team is null then null else round(v_team,2) end,'market_consensus_score',case when v_market is null then null else round(v_market,2) end,'career_context_score',case when v_career is null then null else round(v_career,2) end,'model_version','djm_global_score_v6_7_optional_source_calibrated');
end;$$;
select djm_os.refresh_football_subject_scorecard(id) from djm_os.football_intelligence_subjects;