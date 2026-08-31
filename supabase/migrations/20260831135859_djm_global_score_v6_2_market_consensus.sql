alter table djm_os.football_intelligence_subjects
  add column if not exists transfermarkt_market_value numeric,
  add column if not exists transfermarkt_market_value_currency text,
  add column if not exists transfermarkt_value_verified_at timestamptz;

create or replace function djm_os.market_value_eur_equivalent(p_value numeric, p_currency text)
returns numeric
language sql
immutable
set search_path=''
as $$
  select case
    when p_value is null or p_value <= 0 then null
    when upper(coalesce(p_currency,'EUR'))='EUR' then p_value
    when upper(p_currency)='GBP' then p_value * 1.15
    when upper(p_currency)='USD' then p_value * 0.86
    else null
  end;
$$;

create or replace function djm_os.market_consensus_score(p_value numeric, p_currency text)
returns numeric
language plpgsql
immutable
set search_path=''
as $$
declare v_eur numeric;
begin
  v_eur := djm_os.market_value_eur_equivalent(p_value,p_currency);
  if v_eur is null then return null; end if;
  return greatest(10::numeric,least(98::numeric,50 + 20*(ln(v_eur/1000000.0)/ln(10.0))));
end;
$$;

create or replace function djm_os.market_value_quality(p_verified_at timestamptz, p_value numeric, p_currency text)
returns numeric
language sql
stable
set search_path=''
as $$
  select case
    when djm_os.market_value_eur_equivalent(p_value,p_currency) is null then 0::numeric
    when p_verified_at is null then .40::numeric
    when p_verified_at >= now()-interval '120 days' then .92::numeric
    when p_verified_at >= now()-interval '240 days' then .78::numeric
    when p_verified_at >= now()-interval '365 days' then .58::numeric
    else .30::numeric
  end;
$$;

create or replace function djm_os.sync_football_subject_from_player()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
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
end;$$;

create or replace function djm_os.sync_football_subject_from_prospect()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
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
end;$$;

-- Keep subject market data current for both signed players and prospects.
drop trigger if exists sync_football_subject_from_player_trg on public.players;
create trigger sync_football_subject_from_player_trg after insert or update of preferred_name,first_name,last_name,date_of_birth,nationalities,primary_position,current_club,current_league,current_country,current_competition_id,current_season_label,current_season_start,football_provider_ids,stats_url,transfermarkt_url,wyscout_url,transfermarkt_market_value,transfermarkt_market_value_currency,transfermarkt_value_verified_at on public.players
for each row execute function djm_os.sync_football_subject_from_player();

drop trigger if exists sync_football_subject_from_prospect_trg on djm_os.scouting_prospects;
create trigger sync_football_subject_from_prospect_trg after insert or update of full_name,date_of_birth,nationality,primary_position,current_club,current_league,current_country,current_competition_id,current_season_label,current_season_start,football_provider_ids,stats_url,transfermarkt_url,wyscout_url,canonical_key,external_data_status,external_data_checked_at,external_data_error,signed_player_id,linked_player_id,market_value,market_value_currency,market_value_verified_at on djm_os.scouting_prospects
for each row execute function djm_os.sync_football_subject_from_prospect();

-- Backfill existing subjects from their canonical source rows.
update djm_os.football_intelligence_subjects s set
 transfermarkt_market_value=p.transfermarkt_market_value,
 transfermarkt_market_value_currency=p.transfermarkt_market_value_currency,
 transfermarkt_value_verified_at=p.transfermarkt_value_verified_at
from public.players p where s.player_id=p.id;
update djm_os.football_intelligence_subjects s set
 transfermarkt_market_value=coalesce(sp.market_value,s.transfermarkt_market_value),
 transfermarkt_market_value_currency=coalesce(sp.market_value_currency,s.transfermarkt_market_value_currency),
 transfermarkt_value_verified_at=coalesce(sp.market_value_verified_at,s.transfermarkt_value_verified_at)
from djm_os.scouting_prospects sp where s.prospect_id=sp.id;

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
   v_identity_q:=greatest(0,least(1,coalesce(snap.confidence,.75)))*v_season_q;
 else v_season_q:=0; v_identity_q:=0; end if;
 if v_minutes>0 then v_role_q:=private.djm_v5_role_quality(v_minutes,v_apps)*v_season_q; end if;
 if v_peers>=6 then v_peer_q:=least(1,v_peers/35.0)*v_season_q; end if;
 if v_prod is not null then v_prod_q:=v_peer_q*least(1,v_minutes/900.0)*v_season_q; end if;

 -- Nominal V6.2 weights: competition 32, role 26, peer production 18, market consensus 12.
 -- Remaining 12 points are reserved for the next universal team/match/career layers and are not imputed.
 if v_comp is not null then v_w_comp:=32*v_country_q; v_total:=v_total+v_comp*v_w_comp; end if;
 if v_role is not null and v_role_q>0 then v_w_role:=26*v_role_q; v_total:=v_total+v_role*v_w_role; end if;
 if v_prod is not null and v_prod_q>0 then v_w_prod:=18*v_prod_q; v_total:=v_total+v_prod*v_w_prod; end if;
 if v_market is not null and v_market_q>0 then v_w_market:=12*v_market_q; v_total:=v_total+v_market*v_w_market; end if;
 v_observed_weight:=v_w_comp+v_w_role+v_w_prod+v_w_market;

 -- Dynamic shrinkage: strong multi-source evidence weakens the neutral prior; sparse evidence strengthens it.
 v_prior_strength:=greatest(8::numeric,45 - .38*v_observed_weight);
 if v_observed_weight>0 then
   v_score:=(50*v_prior_strength+v_total)/nullif(v_prior_strength+v_observed_weight,0);
   v_score:=greatest(0,least(100,v_score));
 else v_score:=50; end if;

 v_source_diversity:=least(1::numeric,
   (case when v_comp is not null then .25 else 0 end)+
   (case when snap.id is not null then .35 else 0 end)+
   (case when v_peers>=6 then .20 else 0 end)+
   (case when v_market is not null then .20 else 0 end));
 v_conf:=round(100*least(1,
   .34*least(1,v_observed_weight/88.0)+
   .18*v_country_q+
   .20*v_identity_q+
   .14*v_role_q+
   .08*v_peer_q+
   .06*v_market_q+
   .10*v_source_diversity
 ));
 if snap.id is null then v_conf:=least(v_conf,55); end if;
 if v_season_q<.5 and snap.id is not null then v_conf:=least(v_conf,60); end if;
 v_state:=case when v_conf>=88 then 'elite_evidence' when v_conf>=78 then 'ready' when v_conf>=65 then 'usable' else 'enriching' end;
 v_grade:=case when v_conf>=88 then 'A+' when v_conf>=78 then 'A' when v_conf>=65 then 'B' else 'BUILDING' end;
 v_band:=case when v_conf>=92 then 4 when v_conf>=85 then 6 when v_conf>=78 then 8 when v_conf>=65 then 11 when v_conf>=50 then 15 else 22 end;

 v_basis:=v_basis||jsonb_build_object(
   'model','DJM Global Score V6.2','model_version','djm_global_score_v6_2_market_consensus',
   'competition_strength_quality',round(v_country_q,3),'season_recency_quality',round(v_season_q,3),'identity_quality',round(v_identity_q,3),
   'role_quality',round(v_role_q,3),'peer_quality',round(v_peer_q,3),'production_quality',round(v_prod_q,3),
   'market_consensus_score',case when v_market is null then null else round(v_market,2) end,'market_consensus_quality',round(v_market_q,3),
   'transfermarkt_market_value',s.transfermarkt_market_value,'transfermarkt_market_value_currency',s.transfermarkt_market_value_currency,
   'transfermarkt_value_verified_at',s.transfermarkt_value_verified_at,
   'effective_weights',jsonb_build_object('competition',round(v_w_comp,2),'role',round(v_w_role,2),'peer_production',round(v_w_prod,2),'market_consensus',round(v_w_market,2)),
   'neutral_prior_score',50,'neutral_prior_strength',round(v_prior_strength,2),'observed_effective_weight',round(v_observed_weight,2),
   'score_state',v_state,'evidence_grade',v_grade,'confidence',v_conf,
   'evidence_band',jsonb_build_object('low',greatest(0,round(v_score)::int-v_band),'high',least(100,round(v_score)::int+v_band),'type','heuristic_evidence_band_not_statistical_confidence_interval'),
   'market_consensus_rule','Transfermarkt market value is a 12% maximum market-consensus signal. It uses logarithmic scaling and freshness quality; it cannot replace football evidence or dominate the score.',
   'market_value_semantics','Market value contains performance, reputation, age, contract and market sentiment. DJM therefore treats it as an external consensus signal rather than direct performance.',
   'age_used_directly_in_current_score',false,'advanced_data_required',false);

 update djm_os.football_subject_scorecards set
   display_score=round(v_score)::smallint,
   model_score=case when v_conf>=78 then round(v_score)::smallint else null end,
   provisional_score=case when v_conf<78 then round(v_score)::smallint else null end,
   score_tier=case when v_conf>=78 then 'global' else 'provisional' end,
   confidence=v_conf::smallint,
   data_coverage=least(100,round(v_observed_weight/88.0*100))::smallint,
   basis=v_basis,
   model_version='djm_global_score_v6_2_market_consensus',
   calculated_at=now(),
   provenance=coalesce(provenance,'{}'::jsonb)||jsonb_build_object('quality_guard','v6_2','market_consensus_used',v_market is not null,'market_value_freshness_quality',v_market_q),
   updated_at=now()
 where subject_id=p_subject_id;
 return jsonb_build_object('subject_id',p_subject_id,'display_score',round(v_score),'confidence',v_conf,'evidence_grade',v_grade,'score_state',v_state,'market_consensus_score',case when v_market is null then null else round(v_market,2) end,'market_consensus_quality',round(v_market_q,3),'model_version','djm_global_score_v6_2_market_consensus');
end;$$;

-- Recalculate all current subjects through the universal formula.
select djm_os.refresh_football_subject_scorecard(id) from djm_os.football_intelligence_subjects;