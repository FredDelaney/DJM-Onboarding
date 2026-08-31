create table if not exists djm_os.football_subject_career_entries(
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references djm_os.football_intelligence_subjects(id) on delete cascade,
  source_entry_id uuid unique,
  club_name text,
  country text,
  league text,
  competition_id uuid,
  season_label text,
  start_date date,
  end_date date,
  appearances integer,
  starts integer,
  minutes integer,
  goals integer,
  assists integer,
  source_provider text,
  source_name text,
  source_url text,
  source_reviewed_at timestamptz,
  source_synced_at timestamptz,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists football_subject_career_entries_subject_idx on djm_os.football_subject_career_entries(subject_id,end_date desc nulls last);
alter table djm_os.football_subject_career_entries enable row level security;
revoke all on djm_os.football_subject_career_entries from anon,authenticated;
grant all on djm_os.football_subject_career_entries to service_role;

create or replace function djm_os.sync_subject_career_from_player_entry()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
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
end;$$;

drop trigger if exists sync_subject_career_from_player_entry_trg on public.career_entries;
create trigger sync_subject_career_from_player_entry_trg after insert or update or delete on public.career_entries for each row execute function djm_os.sync_subject_career_from_player_entry();

insert into djm_os.football_subject_career_entries(subject_id,source_entry_id,club_name,country,league,competition_id,season_label,start_date,end_date,appearances,starts,minutes,goals,assists,source_provider,source_name,source_url,source_reviewed_at,source_synced_at,provenance,updated_at)
select s.id,c.id,c.club_name,c.country,c.league,c.competition_id,c.season_label,c.start_date,c.end_date,c.appearances,c.starts,c.minutes,c.goals,c.assists,c.source_provider,c.source_name,c.source_url,c.source_reviewed_at,c.source_synced_at,jsonb_build_object('source','public.career_entries','player_id',c.player_id),now()
from public.career_entries c join djm_os.football_intelligence_subjects s on s.player_id=c.player_id
on conflict(source_entry_id) do update set subject_id=excluded.subject_id,club_name=excluded.club_name,country=excluded.country,league=excluded.league,competition_id=excluded.competition_id,season_label=excluded.season_label,start_date=excluded.start_date,end_date=excluded.end_date,appearances=excluded.appearances,starts=excluded.starts,minutes=excluded.minutes,goals=excluded.goals,assists=excluded.assists,source_provider=excluded.source_provider,source_name=excluded.source_name,source_url=excluded.source_url,source_reviewed_at=excluded.source_reviewed_at,source_synced_at=excluded.source_synced_at,provenance=excluded.provenance,updated_at=now();

create or replace function djm_os.subject_career_context(p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_score numeric; v_quality numeric:=0; v_weight numeric:=0; v_minutes numeric:=0; v_seasons integer:=0; v_latest date; v_best numeric; v_recent numeric;
begin
  with e as (
    select c.*,
      coalesce((select lb.strength_score::numeric from djm_os.league_benchmarks lb where c.competition_id is not null and lb.competition_id=c.competition_id order by lb.verified_at desc nulls last limit 1),djm_os.global_competition_level_score(c.country,c.league,null)) as level_score,
      coalesce(c.end_date,c.start_date,c.source_reviewed_at::date,c.source_synced_at::date) as evidence_date,
      greatest(0.05,least(1.0,coalesce(c.minutes,c.appearances*90,0)/1800.0)) as sample_q,
      case when c.source_reviewed_at is not null then 1.0 when c.source_provider is not null then .80 else .55 end as source_q
    from djm_os.football_subject_career_entries c where c.subject_id=p_subject_id
  ),u as (
    select *,case when evidence_date is null then .35 else greatest(.10,exp(-ln(2.0)*greatest(0,current_date-evidence_date)/730.0)) end as recency_q from e where level_score is not null
  )
  select sum(level_score*sample_q*source_q*recency_q)/nullif(sum(sample_q*source_q*recency_q),0),
         sum(sample_q*source_q*recency_q),coalesce(sum(coalesce(minutes,appearances*90,0)),0),count(distinct coalesce(nullif(season_label,''),evidence_date::text)),max(evidence_date),max(level_score),
         sum(case when evidence_date>=current_date-interval '24 months' then level_score*sample_q*source_q*recency_q else 0 end)/nullif(sum(case when evidence_date>=current_date-interval '24 months' then sample_q*source_q*recency_q else 0 end),0)
  into v_score,v_weight,v_minutes,v_seasons,v_latest,v_best,v_recent from u;
  if v_score is null then return jsonb_build_object('score',null,'quality',0,'seasons',0,'minutes',0); end if;
  v_quality:=least(1.0,(1-exp(-v_minutes/3600.0))*.65 + least(1.0,v_seasons/3.0)*.20 + least(1.0,v_weight/2.5)*.15);
  if v_latest is not null and v_latest<current_date-interval '3 years' then v_quality:=v_quality*.65; end if;
  return jsonb_build_object('score',round(coalesce(v_recent,v_score),2),'quality',round(v_quality,3),'seasons',v_seasons,'minutes',round(v_minutes),'latest_evidence_date',v_latest,'best_observed_level',v_best,'all_history_weighted_level',round(v_score,2));
end;$$;

create or replace function djm_os.refresh_football_subject_scorecard(p_subject_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 r jsonb; s djm_os.football_intelligence_subjects%rowtype; sc djm_os.football_subject_scorecards%rowtype; snap djm_os.football_subject_provider_snapshots%rowtype; career jsonb;
 v_comp numeric; v_role numeric; v_prod numeric; v_market numeric; v_career numeric; v_minutes numeric:=0; v_apps numeric:=0; v_peers numeric:=0;
 v_country_q numeric:=0; v_season_q numeric:=0; v_role_q numeric:=0; v_peer_q numeric:=0; v_prod_q numeric:=0; v_identity_q numeric:=0; v_market_q numeric:=0; v_career_q numeric:=0;
 v_w_comp numeric:=0; v_w_role numeric:=0; v_w_prod numeric:=0; v_w_market numeric:=0; v_w_career numeric:=0; v_observed_weight numeric:=0; v_prior_strength numeric:=45;
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
 v_market:=djm_os.market_consensus_score(s.transfermarkt_market_value,s.transfermarkt_market_value_currency); v_market_q:=djm_os.market_value_quality(s.transfermarkt_value_verified_at,s.transfermarkt_market_value,s.transfermarkt_market_value_currency);
 career:=djm_os.subject_career_context(p_subject_id); v_career:=djm_os.safe_json_number(career->>'score'); v_career_q:=coalesce(djm_os.safe_json_number(career->>'quality'),0);
 select * into snap from djm_os.football_subject_provider_snapshots x where x.subject_id=p_subject_id order by case x.provider when 'pitchapi' then 1 when 'official_league' then 2 when 'api_football' then 3 when 'thesportsdb' then 4 else 9 end,x.observed_at desc nulls last,x.updated_at desc limit 1;
 if snap.id is not null then v_season_q:=djm_os.global_subject_season_quality(p_subject_id,snap.provider_season_id); v_identity_q:=greatest(0,least(1,coalesce(snap.confidence,.75)))*greatest(.35,v_season_q); else v_season_q:=0; v_identity_q:=0; end if;
 if v_minutes>0 then v_role_q:=private.djm_v5_role_quality(v_minutes,v_apps)*v_season_q; end if;
 if v_peers>=6 then v_peer_q:=least(1,v_peers/35.0)*v_season_q; end if;
 if v_prod is not null then v_prod_q:=v_peer_q*least(1,v_minutes/900.0)*v_season_q; end if;
 if v_comp is not null then v_w_comp:=32*v_country_q; v_total:=v_total+v_comp*v_w_comp; end if;
 if v_role is not null and v_role_q>0 then v_w_role:=26*v_role_q; v_total:=v_total+v_role*v_w_role; end if;
 if v_prod is not null and v_prod_q>0 then v_w_prod:=18*v_prod_q; v_total:=v_total+v_prod*v_w_prod; end if;
 if v_market is not null and v_market_q>0 then v_w_market:=12*v_market_q; v_total:=v_total+v_market*v_w_market; end if;
 if v_career is not null and v_career_q>0 then v_w_career:=12*v_career_q; v_total:=v_total+v_career*v_w_career; end if;
 v_observed_weight:=v_w_comp+v_w_role+v_w_prod+v_w_market+v_w_career;
 v_prior_strength:=greatest(7::numeric,45-.38*v_observed_weight);
 if v_observed_weight>0 then v_score:=greatest(0,least(100,(50*v_prior_strength+v_total)/nullif(v_prior_strength+v_observed_weight,0))); else v_score:=50; end if;
 v_source_diversity:=least(1::numeric,(case when v_comp is not null then .22 else 0 end)+(case when snap.id is not null then .28 else 0 end)+(case when v_peers>=6 then .17 else 0 end)+(case when v_market is not null then .16 else 0 end)+(case when v_career is not null then .17 else 0 end));
 v_conf:=round(100*least(1,.28*least(1,v_observed_weight/100.0)+.14*v_country_q+.17*v_identity_q+.14*v_role_q+.07*v_peer_q+.04*v_market_q+.08*v_career_q+.08*v_source_diversity));
 v_conf:=least(97,greatest(0,v_conf)); if snap.id is null then v_conf:=least(v_conf,60); end if; if v_season_q<.5 and snap.id is not null then v_conf:=least(v_conf,65); end if;
 v_state:=case when v_conf>=90 then 'elite_evidence' when v_conf>=80 then 'ready' when v_conf>=65 then 'usable' else 'enriching' end; v_grade:=case when v_conf>=90 then 'A+' when v_conf>=80 then 'A' when v_conf>=65 then 'B' else 'BUILDING' end;
 v_band:=case when v_conf>=92 then 4 when v_conf>=85 then 6 when v_conf>=80 then 7 when v_conf>=65 then 11 when v_conf>=50 then 15 else 22 end;
 v_basis:=v_basis||jsonb_build_object('model','DJM Global Score V6.4','model_version','djm_global_score_v6_4_market_career','competition_strength_quality',round(v_country_q,3),'season_recency_quality',round(v_season_q,3),'identity_quality',round(v_identity_q,3),'role_quality',round(v_role_q,3),'peer_quality',round(v_peer_q,3),'production_quality',round(v_prod_q,3),'market_consensus_score',case when v_market is null then null else round(v_market,2) end,'market_consensus_quality',round(v_market_q,3),'career_context_score',case when v_career is null then null else round(v_career,2) end,'career_context_quality',round(v_career_q,3),'career_context',career,'effective_weights',jsonb_build_object('competition',round(v_w_comp,2),'role',round(v_w_role,2),'peer_production',round(v_w_prod,2),'market_consensus',round(v_w_market,2),'career_context',round(v_w_career,2)),'neutral_prior_score',50,'neutral_prior_strength',round(v_prior_strength,2),'observed_effective_weight',round(v_observed_weight,2),'score_state',v_state,'evidence_grade',v_grade,'confidence',v_conf,'evidence_band',jsonb_build_object('low',greatest(0,round(v_score)::int-v_band),'high',least(100,round(v_score)::int+v_band),'type','heuristic_evidence_band_not_statistical_confidence_interval'),'market_consensus_rule','Transfermarkt market value has up to 12 nominal score-weight points, logarithmic scaling and freshness decay. It materially influences the score but cannot dominate football evidence.','career_rule','Verified career evidence is recency-, source- and sample-weighted. Missing career history contributes no negative evidence.','age_used_directly_in_current_score',false,'advanced_data_required',false);
 update djm_os.football_subject_scorecards set display_score=round(v_score)::smallint,model_score=case when v_conf>=80 then round(v_score)::smallint else null end,provisional_score=case when v_conf<80 then round(v_score)::smallint else null end,score_tier=case when v_conf>=80 then 'global' else 'provisional' end,confidence=v_conf::smallint,data_coverage=least(100,round(v_observed_weight))::smallint,basis=v_basis,model_version='djm_global_score_v6_4_market_career',calculated_at=now(),provenance=coalesce(provenance,'{}'::jsonb)||jsonb_build_object('quality_guard','v6_4','market_consensus_used',v_market is not null,'career_context_used',v_career is not null),updated_at=now() where subject_id=p_subject_id;
 perform djm_os.refresh_football_subject_enrichment_queue(p_subject_id);
 return jsonb_build_object('subject_id',p_subject_id,'display_score',round(v_score),'confidence',v_conf,'evidence_grade',v_grade,'score_state',v_state,'market_consensus_score',case when v_market is null then null else round(v_market,2) end,'career_context_score',case when v_career is null then null else round(v_career,2) end,'model_version','djm_global_score_v6_4_market_career');
end;$$;
select djm_os.refresh_football_subject_scorecard(id) from djm_os.football_intelligence_subjects;