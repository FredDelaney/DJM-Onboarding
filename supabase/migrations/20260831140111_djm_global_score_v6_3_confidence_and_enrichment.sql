create table if not exists djm_os.football_intelligence_enrichment_queue(
  subject_id uuid primary key references djm_os.football_intelligence_subjects(id) on delete cascade,
  target_confidence smallint not null default 80 check(target_confidence between 0 and 100),
  current_confidence smallint not null default 0 check(current_confidence between 0 and 100),
  priority smallint not null default 3 check(priority between 1 and 5),
  status text not null default 'queued' check(status in ('queued','running','blocked','ready')),
  missing_evidence jsonb not null default '[]'::jsonb,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table djm_os.football_intelligence_enrichment_queue enable row level security;
revoke all on djm_os.football_intelligence_enrichment_queue from anon, authenticated;
grant all on djm_os.football_intelligence_enrichment_queue to service_role;

create or replace function djm_os.refresh_football_subject_enrichment_queue(p_subject_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare sc djm_os.football_subject_scorecards%rowtype; v_missing jsonb;
begin
  select * into sc from djm_os.football_subject_scorecards where subject_id=p_subject_id;
  if not found then return; end if;
  v_missing:=coalesce(sc.missing_inputs,sc.basis->'missing_inputs','[]'::jsonb);
  if coalesce(sc.confidence,0) >= 80 then
    insert into djm_os.football_intelligence_enrichment_queue(subject_id,target_confidence,current_confidence,status,missing_evidence,next_attempt_at,updated_at)
    values(p_subject_id,80,coalesce(sc.confidence,0),'ready',v_missing,now()+interval '7 days',now())
    on conflict(subject_id) do update set current_confidence=excluded.current_confidence,status='ready',missing_evidence=excluded.missing_evidence,next_attempt_at=excluded.next_attempt_at,updated_at=now(),last_error=null;
  else
    insert into djm_os.football_intelligence_enrichment_queue(subject_id,target_confidence,current_confidence,status,missing_evidence,next_attempt_at,updated_at)
    values(p_subject_id,80,coalesce(sc.confidence,0),'queued',v_missing,now(),now())
    on conflict(subject_id) do update set current_confidence=excluded.current_confidence,status=case when djm_os.football_intelligence_enrichment_queue.status='running' then 'running' else 'queued' end,missing_evidence=excluded.missing_evidence,next_attempt_at=least(djm_os.football_intelligence_enrichment_queue.next_attempt_at,now()),updated_at=now();
  end if;
end;$$;

create or replace function djm_os.refresh_football_subject_scorecard(p_subject_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 r jsonb; s djm_os.football_intelligence_subjects%rowtype; sc djm_os.football_subject_scorecards%rowtype; snap djm_os.football_subject_provider_snapshots%rowtype;
 v_comp numeric; v_role numeric; v_prod numeric; v_market numeric; v_minutes numeric:=0; v_apps numeric:=0; v_peers numeric:=0;
 v_country_q numeric:=0; v_season_q numeric:=0; v_role_q numeric:=0; v_peer_q numeric:=0; v_prod_q numeric:=0; v_identity_q numeric:=0; v_market_q numeric:=0;
 v_w_comp numeric:=0; v_w_role numeric:=0; v_w_prod numeric:=0; v_w_market numeric:=0; v_observed_weight numeric:=0; v_prior_strength numeric:=45;
 v_total numeric:=0; v_score numeric:=50; v_conf integer:=0; v_band integer:=20; v_state text; v_grade text; v_basis jsonb; v_source_diversity numeric:=0;
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
 v_market:=djm_os.market_consensus_score(s.transfermarkt_market_value,s.transfermarkt_market_value_currency);
 v_market_q:=djm_os.market_value_quality(s.transfermarkt_value_verified_at,s.transfermarkt_market_value,s.transfermarkt_market_value_currency);

 select * into snap from djm_os.football_subject_provider_snapshots x where x.subject_id=p_subject_id
 order by case x.provider when 'pitchapi' then 1 when 'official_league' then 2 when 'api_football' then 3 when 'thesportsdb' then 4 else 9 end,x.observed_at desc nulls last,x.updated_at desc limit 1;
 if snap.id is not null then
   v_season_q:=djm_os.global_subject_season_quality(p_subject_id,snap.provider_season_id);
   v_identity_q:=greatest(0,least(1,coalesce(snap.confidence,.75)))*greatest(.35,v_season_q);
 else v_season_q:=0; v_identity_q:=0; end if;
 if v_minutes>0 then v_role_q:=private.djm_v5_role_quality(v_minutes,v_apps)*v_season_q; end if;
 if v_peers>=6 then v_peer_q:=least(1,v_peers/35.0)*v_season_q; end if;
 if v_prod is not null then v_prod_q:=v_peer_q*least(1,v_minutes/900.0)*v_season_q; end if;

 if v_comp is not null then v_w_comp:=32*v_country_q; v_total:=v_total+v_comp*v_w_comp; end if;
 if v_role is not null and v_role_q>0 then v_w_role:=26*v_role_q; v_total:=v_total+v_role*v_w_role; end if;
 if v_prod is not null and v_prod_q>0 then v_w_prod:=18*v_prod_q; v_total:=v_total+v_prod*v_w_prod; end if;
 if v_market is not null and v_market_q>0 then v_w_market:=12*v_market_q; v_total:=v_total+v_market*v_w_market; end if;
 v_observed_weight:=v_w_comp+v_w_role+v_w_prod+v_w_market;
 v_prior_strength:=greatest(8::numeric,45-.38*v_observed_weight);
 if v_observed_weight>0 then v_score:=greatest(0,least(100,(50*v_prior_strength+v_total)/nullif(v_prior_strength+v_observed_weight,0))); else v_score:=50; end if;

 v_source_diversity:=least(1::numeric,
   (case when v_comp is not null then .25 else 0 end)+
   (case when snap.id is not null then .35 else 0 end)+
   (case when v_peers>=6 then .20 else 0 end)+
   (case when v_market is not null then .20 else 0 end));
 -- Calibrated confidence weights sum to exactly 1.00. Market value can help confidence, but only modestly.
 v_conf:=round(100*least(1,
   .30*least(1,v_observed_weight/88.0)+
   .15*v_country_q+
   .18*v_identity_q+
   .15*v_role_q+
   .08*v_peer_q+
   .04*v_market_q+
   .10*v_source_diversity
 ));
 v_conf:=least(97,greatest(0,v_conf));
 if snap.id is null then v_conf:=least(v_conf,55); end if;
 if v_season_q<.5 and snap.id is not null then v_conf:=least(v_conf,60); end if;
 v_state:=case when v_conf>=90 then 'elite_evidence' when v_conf>=80 then 'ready' when v_conf>=65 then 'usable' else 'enriching' end;
 v_grade:=case when v_conf>=90 then 'A+' when v_conf>=80 then 'A' when v_conf>=65 then 'B' else 'BUILDING' end;
 v_band:=case when v_conf>=92 then 4 when v_conf>=85 then 6 when v_conf>=80 then 7 when v_conf>=65 then 11 when v_conf>=50 then 15 else 22 end;

 v_basis:=v_basis||jsonb_build_object(
   'model','DJM Global Score V6.3','model_version','djm_global_score_v6_3_market_calibrated',
   'competition_strength_quality',round(v_country_q,3),'season_recency_quality',round(v_season_q,3),'identity_quality',round(v_identity_q,3),
   'role_quality',round(v_role_q,3),'peer_quality',round(v_peer_q,3),'production_quality',round(v_prod_q,3),
   'market_consensus_score',case when v_market is null then null else round(v_market,2) end,'market_consensus_quality',round(v_market_q,3),
   'transfermarkt_market_value',s.transfermarkt_market_value,'transfermarkt_market_value_currency',s.transfermarkt_market_value_currency,'transfermarkt_value_verified_at',s.transfermarkt_value_verified_at,
   'effective_weights',jsonb_build_object('competition',round(v_w_comp,2),'role',round(v_w_role,2),'peer_production',round(v_w_prod,2),'market_consensus',round(v_w_market,2)),
   'neutral_prior_score',50,'neutral_prior_strength',round(v_prior_strength,2),'observed_effective_weight',round(v_observed_weight,2),
   'score_state',v_state,'evidence_grade',v_grade,'confidence',v_conf,
   'evidence_band',jsonb_build_object('low',greatest(0,round(v_score)::int-v_band),'high',least(100,round(v_score)::int+v_band),'type','heuristic_evidence_band_not_statistical_confidence_interval'),
   'market_consensus_rule','Transfermarkt market value has up to 12 nominal score-weight points, logarithmic scaling and freshness decay. It materially influences the score but cannot dominate football evidence.',
   'confidence_rule','Confidence is independently calibrated from evidence coverage, competition quality, identity, current role, peer depth, market freshness and source diversity. Component weights sum to 1.00 and confidence is capped at 97.',
   'age_used_directly_in_current_score',false,'advanced_data_required',false);

 update djm_os.football_subject_scorecards set display_score=round(v_score)::smallint,model_score=case when v_conf>=80 then round(v_score)::smallint else null end,
 provisional_score=case when v_conf<80 then round(v_score)::smallint else null end,score_tier=case when v_conf>=80 then 'global' else 'provisional' end,
 confidence=v_conf::smallint,data_coverage=least(100,round(v_observed_weight/88.0*100))::smallint,basis=v_basis,model_version='djm_global_score_v6_3_market_calibrated',
 calculated_at=now(),provenance=coalesce(provenance,'{}'::jsonb)||jsonb_build_object('quality_guard','v6_3','market_consensus_used',v_market is not null,'market_value_freshness_quality',v_market_q),updated_at=now()
 where subject_id=p_subject_id;
 perform djm_os.refresh_football_subject_enrichment_queue(p_subject_id);
 return jsonb_build_object('subject_id',p_subject_id,'display_score',round(v_score),'confidence',v_conf,'evidence_grade',v_grade,'score_state',v_state,'market_consensus_score',case when v_market is null then null else round(v_market,2) end,'model_version','djm_global_score_v6_3_market_calibrated');
end;$$;

-- Ensure every current subject is recalculated and queued if confidence is below target.
select djm_os.refresh_football_subject_scorecard(id) from djm_os.football_intelligence_subjects;