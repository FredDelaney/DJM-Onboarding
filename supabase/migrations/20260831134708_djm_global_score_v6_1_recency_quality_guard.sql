alter function djm_os.refresh_football_subject_scorecard(uuid) rename to refresh_football_subject_scorecard_v6_core;

create or replace function djm_os.global_subject_season_quality(p_subject_id uuid,p_provider_season_id text)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare s djm_os.football_intelligence_subjects%rowtype; v_provider_year integer; v_expected_year integer; v_current integer:=extract(year from current_date)::integer;
begin
 select * into s from djm_os.football_intelligence_subjects where id=p_subject_id;
 if not found then return 0; end if;
 v_provider_year:=case when coalesce(p_provider_season_id,'')~'(20[0-9]{2})' then substring(p_provider_season_id from '(20[0-9]{2})')::integer else null end;
 v_expected_year:=coalesce(
   case when coalesce(s.current_season_label,'')~'(20[0-9]{2})' then substring(s.current_season_label from '(20[0-9]{2})')::integer end,
   extract(year from s.current_season_start)::integer,
   v_current
 );
 if v_provider_year is null then return .55; end if;
 if v_provider_year=v_expected_year then return 1; end if;
 if v_provider_year=v_current and abs(v_expected_year-v_current)<=1 then return .95; end if;
 if v_provider_year=v_expected_year-1 then return .70; end if;
 if v_provider_year=v_current-1 then return .65; end if;
 if v_provider_year=v_expected_year-2 or v_provider_year=v_current-2 then return .30; end if;
 return .12;
end; $$;

create or replace function djm_os.refresh_football_subject_scorecard(p_subject_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r jsonb; s djm_os.football_intelligence_subjects%rowtype; sc djm_os.football_subject_scorecards%rowtype; snap djm_os.football_subject_provider_snapshots%rowtype;
 v_comp numeric; v_role numeric; v_prod numeric; v_minutes numeric:=0; v_apps numeric:=0; v_peers numeric:=0;
 v_country_q numeric:=0; v_season_q numeric:=0; v_role_q numeric:=0; v_peer_q numeric:=0; v_prod_q numeric:=0; v_identity_q numeric:=0;
 v_total numeric:=0; v_weight numeric:=0; v_score numeric:=50; v_conf integer:=0; v_band integer:=20; v_state text; v_grade text; v_basis jsonb;
begin
 r:=djm_os.refresh_football_subject_scorecard_v6_core(p_subject_id);
 select * into s from djm_os.football_intelligence_subjects where id=p_subject_id;
 select * into sc from djm_os.football_subject_scorecards where subject_id=p_subject_id;
 if not found then return r; end if;
 v_basis:=coalesce(sc.basis,'{}'::jsonb);
 v_comp:=djm_os.safe_json_number(v_basis->>'competition_level_score');
 v_role:=djm_os.safe_json_number(v_basis->>'role_score');
 v_prod:=djm_os.safe_json_number(v_basis->>'production_score');
 v_minutes:=coalesce(djm_os.safe_json_number(v_basis->>'minutes'),0);
 v_apps:=coalesce(djm_os.safe_json_number(v_basis->>'appearances'),0);
 v_peers:=coalesce(djm_os.safe_json_number(v_basis->>'peer_count'),0);
 v_country_q:=djm_os.global_country_strength_quality(s.current_country);
 select * into snap from djm_os.football_subject_provider_snapshots x where x.subject_id=p_subject_id
 order by case x.provider when 'pitchapi' then 1 when 'official_league' then 2 when 'api_football' then 3 when 'thesportsdb' then 4 else 9 end,x.observed_at desc nulls last,x.updated_at desc limit 1;
 if snap.id is not null then
   v_season_q:=djm_os.global_subject_season_quality(p_subject_id,snap.provider_season_id);
   v_identity_q:=greatest(0,least(1,coalesce(snap.confidence,.75)))*v_season_q;
 else v_season_q:=0; v_identity_q:=0; end if;
 if v_minutes>0 then v_role_q:=private.djm_v5_role_quality(v_minutes,v_apps)*v_season_q; end if;
 if v_peers>=6 then v_peer_q:=least(1,v_peers/35.0)*v_season_q; end if;
 if v_prod is not null then v_prod_q:=v_peer_q*least(1,v_minutes/900.0)*v_season_q; end if;

 -- Current-level score: stale player evidence loses influence continuously. Competition context stays current only when the league itself is identified.
 if v_comp is not null then v_total:=v_total+v_comp*.55*v_country_q; v_weight:=v_weight+.55*v_country_q; end if;
 if v_role is not null and v_role_q>0 then v_total:=v_total+v_role*.35*v_role_q; v_weight:=v_weight+.35*v_role_q; end if;
 if v_prod is not null and v_prod_q>0 then v_total:=v_total+v_prod*.10*v_prod_q; v_weight:=v_weight+.10*v_prod_q; end if;
 if v_weight>0 then v_score:=greatest(0,least(100,v_total/v_weight)); else v_score:=50; end if;

 v_conf:=round(100*least(1,
   .25*v_country_q+
   .20*v_identity_q+
   .30*v_role_q+
   .15*v_peer_q+
   .10*v_prod_q
 ));
 if snap.id is null then v_conf:=least(v_conf,round(25*v_country_q)::int); end if;
 if v_season_q<.5 and snap.id is not null then v_conf:=least(v_conf,55); end if;
 v_state:=case when v_conf>=85 then 'elite_evidence' when v_conf>=75 then 'ready' when v_conf>=60 then 'usable' else 'enriching' end;
 v_grade:=case when v_conf>=85 then 'A' when v_conf>=75 then 'B' when v_conf>=60 then 'C' else 'BUILDING' end;
 v_band:=case when v_conf>=90 then 5 when v_conf>=80 then 7 when v_conf>=70 then 10 when v_conf>=60 then 13 when v_conf>=40 then 17 else 24 end;
 v_basis:=v_basis||jsonb_build_object(
   'model','DJM Global Score V6.1','model_version','djm_global_score_v6_1_quality_guarded',
   'competition_strength_quality',round(v_country_q,3),'season_recency_quality',round(v_season_q,3),
   'identity_quality',round(v_identity_q,3),'role_quality',round(v_role_q,3),'peer_quality',round(v_peer_q,3),'production_quality',round(v_prod_q,3),
   'score_state',v_state,'evidence_grade',v_grade,'confidence',v_conf,
   'evidence_band',jsonb_build_object('low',greatest(0,round(v_score)::int-v_band),'high',least(100,round(v_score)::int+v_band),'type','heuristic_evidence_band_not_statistical_confidence_interval'),
   'recency_rule','Current season evidence receives full influence. Previous-season evidence is discounted; evidence two or more seasons old cannot establish high current-level confidence.',
   'competition_rule','Country alone never implies a competition. A valid league identity and tier are required.',
   'age_used_in_current_score',false,'advanced_data_required',false
 );
 update djm_os.football_subject_scorecards set
   display_score=round(v_score)::smallint,
   model_score=case when v_conf>=75 then round(v_score)::smallint else null end,
   provisional_score=case when v_conf<75 then round(v_score)::smallint else null end,
   score_tier=case when v_conf>=75 then 'global' else 'provisional' end,
   confidence=v_conf::smallint,
   basis=v_basis,
   model_version='djm_global_score_v6_1_quality_guarded',
   calculated_at=now(),
   provenance=coalesce(provenance,'{}'::jsonb)||jsonb_build_object('quality_guard','v6_1','season_quality',v_season_q,'competition_quality',v_country_q),
   updated_at=now()
 where subject_id=p_subject_id;
 return jsonb_build_object('subject_id',p_subject_id,'display_score',round(v_score),'confidence',v_conf,'evidence_grade',v_grade,'score_state',v_state,'season_recency_quality',v_season_q,'competition_strength_quality',v_country_q,'model_version','djm_global_score_v6_1_quality_guarded');
end; $$;

do $$ declare x record; begin for x in select id from djm_os.football_intelligence_subjects loop perform djm_os.refresh_football_subject_scorecard(x.id); end loop; end $$;