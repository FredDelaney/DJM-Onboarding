-- DJM Player staging djm_os-function bootstrap — batch 04
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- all private function bootstrap batches, and djm_os function batches 01-03.
--
-- Exact current-production definitions for djm_os functions 61-80 of 95,
-- ordered by function name + identity arguments.
-- Production body MD5: 7cfc8043e269e68235108012e08ec0eb
--
-- Body validation is disabled only during bootstrap because later djm_os/public
-- batches may provide cross-function dependencies. No function is executed.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION djm_os.refresh_football_subject_scorecard_v6_core(p_subject_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end; $function$;


CREATE OR REPLACE FUNCTION djm_os.refresh_global_scorecards_batch(p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; v_ok integer:=0; v_failed integer:=0; v_errors jsonb:='[]'::jsonb;
begin
  for r in select id from djm_os.football_intelligence_subjects order by updated_at desc limit greatest(1,least(coalesce(p_limit,1000),5000)) loop
    begin
      perform djm_os.refresh_football_subject_scorecard(r.id);
      v_ok:=v_ok+1;
    exception when others then
      v_failed:=v_failed+1;
      if jsonb_array_length(v_errors)<20 then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('subject_id',r.id,'error',sqlerrm)); end if;
    end;
  end loop;
  return jsonb_build_object('ok',v_failed=0,'refreshed',v_ok,'failed',v_failed,'errors',v_errors,'completed_at',now());
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.refresh_need_matches(p_need_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n djm_os.club_needs%rowtype;
  v_country text;
begin
  select * into n from djm_os.club_needs where id = p_need_id;
  if not found then return; end if;
  select country into v_country from djm_os.organisations where id = n.organisation_id;

  if n.status not in ('active', 'open', 'confirmed') then
    delete from djm_os.player_matches where club_need_id = p_need_id and status = 'suggested';
    return;
  end if;

  delete from djm_os.player_matches m using public.players p
  where m.club_need_id = p_need_id and m.player_id = p.id and m.status = 'suggested'
    and not (
      djm_os.position_matches_player(n.position, p.primary_position, p.secondary_positions)
      and (n.preferred_foot is null or p.preferred_foot is null or lower(p.preferred_foot) = lower(n.preferred_foot))
      and (n.min_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) >= n.min_age)
      and (n.max_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) <= n.max_age)
      and (n.min_height_cm is null or p.height_cm is null or p.height_cm >= n.min_height_cm)
    );

  insert into djm_os.player_matches(
    club_need_id, player_id, overall_score, football_score, commercial_score,
    registration_score, career_score, access_score, reasoning, status
  )
  select
    n.id, p.id,
    round((s.football_score * .45 + s.commercial_score * .10 + s.registration_score * .15 + s.career_score * .20 + s.availability_score * .10)::numeric, 1),
    s.football_score, s.commercial_score, s.registration_score, s.career_score, null::numeric,
    jsonb_build_object(
      'source', 'djm_fit_prediction_v3',
      'model', 'DJM fit model v3',
      'coverage', s.coverage,
      'components', jsonb_build_object(
        'football_fit', s.football_score,
        'commercial_fit', s.commercial_score,
        'registration_fit', s.registration_score,
        'career_fit', s.career_score,
        'availability', s.availability_score
      ),
      'strengths', to_jsonb(array_remove(array[
        'Primary or secondary position fits the requested role',
        case when n.preferred_foot is not null and p.preferred_foot is not null then 'Preferred foot matches' end,
        case when n.min_height_cm is not null and p.height_cm is not null then 'Minimum height is met' end,
        case when n.min_age is not null or n.max_age is not null then 'Recorded age is within range' end
      ], null)),
      'concerns', '[]'::jsonb,
      'hard_blockers', '[]'::jsonb,
      'missing_information', to_jsonb(array_remove(array[
        case when p.date_of_birth is null and (n.min_age is not null or n.max_age is not null) then 'Player date of birth is not recorded' end,
        case when p.preferred_foot is null and n.preferred_foot is not null then 'Player preferred foot is not recorded' end,
        case when p.height_cm is null and n.min_height_cm is not null then 'Player height is not recorded' end,
        case when nullif(trim(coalesce(f.salary_expectation, '')), '') is null and n.salary_budget is not null then 'Player salary expectation is not recorded' end,
        case when nullif(trim(coalesce(n.passport_requirements, n.registration_notes, '')), '') is not null and cardinality(coalesce(f.passports_held, '{}')) = 0 then 'Passport evidence is not recorded' end
      ], null)),
      'sample', jsonb_build_object('career_minutes', coalesce(c.minutes, 0), 'career_appearances', coalesce(c.appearances, 0)),
      'calculated_at', now()
    ),
    'suggested'
  from public.players p
  left join djm_os.player_market_facts f on f.player_id = p.id
  left join lateral (
    select coalesce(sum(ce.minutes), 0)::numeric as minutes, coalesce(sum(ce.appearances), 0)::numeric as appearances
    from public.career_entries ce where ce.player_id = p.id
  ) c on true
  cross join lateral (
    select
      least(100, 70
        + case when n.preferred_foot is null then 6 when p.preferred_foot is null then 3 else 10 end
        + case when n.min_age is null and n.max_age is null then 6 when p.date_of_birth is null then 3 else 8 end
        + case when n.min_height_cm is null then 5 when p.height_cm is null then 2 else 7 end)::numeric as football_score,
      case when n.salary_budget is null then 72 when nullif(trim(coalesce(f.salary_expectation, '')), '') is null then 55 else 68 end::numeric as commercial_score,
      djm_os.registration_fit_score(coalesce(n.passport_requirements, n.registration_notes), f.work_rights, f.passports_held, v_country)::numeric as registration_score,
      least(100, 45 + least(35, coalesce(c.minutes, 0) / 180) + least(20, coalesce(c.appearances, 0) / 5))::numeric as career_score,
      case when lower(coalesce(p.football_status, '')) in ('free_agent', 'free agent', 'available') then 95 when lower(coalesce(p.football_status, '')) = 'active' then 82 when lower(coalesce(p.football_status, '')) = 'injured' then 30 else 60 end::numeric as availability_score,
      round((
        1
        + case when n.preferred_foot is null or p.preferred_foot is not null then 1 else 0 end
        + case when (n.min_age is null and n.max_age is null) or p.date_of_birth is not null then 1 else 0 end
        + case when n.min_height_cm is null or p.height_cm is not null then 1 else 0 end
        + case when n.salary_budget is null or nullif(trim(coalesce(f.salary_expectation, '')), '') is not null then 1 else 0 end
        + case when nullif(trim(coalesce(n.passport_requirements, n.registration_notes, '')), '') is null or cardinality(coalesce(f.passports_held, '{}')) > 0 then 1 else 0 end
      )::numeric / 6 * 100)::int as coverage
  ) s
  where djm_os.position_matches_player(n.position, p.primary_position, p.secondary_positions)
    and (n.preferred_foot is null or p.preferred_foot is null or lower(p.preferred_foot) = lower(n.preferred_foot))
    and (n.min_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) >= n.min_age)
    and (n.max_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) <= n.max_age)
    and (n.min_height_cm is null or p.height_cm is null or p.height_cm >= n.min_height_cm)
  on conflict (club_need_id, player_id) do update set
    overall_score = excluded.overall_score,
    football_score = excluded.football_score,
    commercial_score = excluded.commercial_score,
    registration_score = excluded.registration_score,
    career_score = excluded.career_score,
    reasoning = excluded.reasoning,
    updated_at = now()
  where djm_os.player_matches.status = 'suggested';
end $function$;


CREATE OR REPLACE FUNCTION djm_os.refresh_projection_from_score_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform djm_os.refresh_football_subject_projection(new.subject_id);
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.refresh_recruitment_followups()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count int := 0;
  v_changed int := 0;
begin
  update djm_os.tasks t
  set status='cancelled', completed_at=coalesce(t.completed_at,now()), updated_at=now()
  from djm_os.scouting_prospects sp
  where t.source=('recruitment:'||sp.id::text)
    and t.status not in ('completed','cancelled')
    and sp.recruitment_stage in ('signed','declined','lost','paused');
  get diagnostics v_changed = row_count;
  v_count := v_count + v_changed;

  update djm_os.tasks t
  set title='Follow up recruitment target: '||sp.full_name,
      task_type='recruitment_followup',
      owner_user_id=coalesce(sp.owner_user_id,t.owner_user_id,(select tm.user_id from djm_os.team_members tm where tm.is_active order by tm.created_at limit 1)),
      due_at=sp.next_action_at,
      priority=least(5,greatest(1,coalesce(sp.recruitment_priority,3))),
      updated_at=now()
  from djm_os.scouting_prospects sp
  where t.source=('recruitment:'||sp.id::text)
    and t.status not in ('completed','cancelled')
    and sp.linked_player_id is null
    and sp.recruitment_stage not in ('signed','declined','lost','paused')
    and sp.next_action_at is not null;
  get diagnostics v_changed = row_count;
  v_count := v_count + v_changed;

  insert into djm_os.tasks(title,task_type,owner_user_id,due_at,status,priority,source)
  select 'Follow up recruitment target: '||sp.full_name,
         'recruitment_followup',
         coalesce(sp.owner_user_id,(select tm.user_id from djm_os.team_members tm where tm.is_active order by tm.created_at limit 1)),
         sp.next_action_at,'open',least(5,greatest(1,coalesce(sp.recruitment_priority,3))),
         'recruitment:'||sp.id::text
  from djm_os.scouting_prospects sp
  where sp.linked_player_id is null
    and sp.recruitment_stage not in ('signed','declined','lost','paused')
    and sp.next_action_at is not null
    and sp.next_action_at <= now()+interval '3 days'
    and not exists(select 1 from djm_os.tasks t where t.source=('recruitment:'||sp.id::text) and t.status not in ('completed','cancelled'));
  get diagnostics v_changed = row_count;
  v_count := v_count + v_changed;

  insert into djm_os.tasks(title,task_type,owner_user_id,due_at,status,priority,source)
  select 'Set next step: '||sp.full_name,
         'recruitment_next_step',
         coalesce(sp.owner_user_id,(select tm.user_id from djm_os.team_members tm where tm.is_active order by tm.created_at limit 1)),
         now(),'open',least(5,greatest(1,coalesce(sp.recruitment_priority,3))),
         'recruitment:'||sp.id::text
  from djm_os.scouting_prospects sp
  where sp.linked_player_id is null
    and sp.recruitment_stage not in ('signed','declined','lost','paused')
    and sp.first_contact_at is not null
    and sp.next_action_at is null
    and not exists(select 1 from djm_os.tasks t where t.source=('recruitment:'||sp.id::text) and t.status not in ('completed','cancelled'));
  get diagnostics v_changed = row_count;
  v_count := v_count + v_changed;
  return v_count;
end
$function$;


CREATE OR REPLACE FUNCTION djm_os.refresh_recruitment_suggestions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count int:=0; v_rows int:=0;
begin
  delete from djm_os.suggestions where suggestion_type in ('recruitment_overdue','recruitment_high_priority_untouched') and status='open' and expires_at<now();
  insert into djm_os.suggestions(owner_user_id,suggestion_type,title,reason,score,status,fingerprint,source,created_at,expires_at)
  select coalesce(sp.owner_user_id,(select tm.user_id from djm_os.team_members tm where tm.is_active order by tm.created_at limit 1)),'recruitment_overdue','Follow up with '||sp.full_name,'Recruitment follow-up is overdue'||case when sp.current_club is not null then ' · '||sp.current_club else '' end,least(100,70+greatest(0,extract(day from now()-sp.next_action_at)::int))::smallint,'open','recruitment-overdue:'||sp.id::text,'recruitment',now(),now()+interval '2 days'
  from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.recruitment_stage not in ('signed','declined','lost','paused') and sp.next_action_at<now() and not exists(select 1 from djm_os.suggestions s where s.fingerprint='recruitment-overdue:'||sp.id::text and s.status='open' and s.expires_at>now());
  get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
  insert into djm_os.suggestions(owner_user_id,suggestion_type,title,reason,score,status,fingerprint,source,created_at,expires_at)
  select coalesce(sp.owner_user_id,(select tm.user_id from djm_os.team_members tm where tm.is_active order by tm.created_at limit 1)),'recruitment_high_priority_untouched','Make first contact: '||sp.full_name,'High-priority recruitment target has not been contacted yet'||case when sp.current_club is not null then ' · '||sp.current_club else '' end,least(100,sp.recruitment_priority*20)::smallint,'open','recruitment-untouched:'||sp.id::text,'recruitment',now(),now()+interval '7 days'
  from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.recruitment_stage in ('identified','researching','ready_to_contact') and sp.recruitment_priority>=4 and sp.first_contact_at is null and not exists(select 1 from djm_os.suggestions s where s.fingerprint='recruitment-untouched:'||sp.id::text and s.status='open' and s.expires_at>now());
  get diagnostics v_rows=row_count; v_count:=v_count+v_rows; return v_count;
end $function$;


CREATE OR REPLACE FUNCTION djm_os.refresh_relationship_graph()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_count integer:=0;v_rows integer;begin
 insert into djm_os.relationship_edges(from_type,from_id,to_type,to_id,relation_type,strength,confidence,source_kind,observed_at,status,created_by)
 select 'team_member',r.team_member_id,'person',r.person_id,'knows',coalesce(r.strength_score,50),0.95,'djm_relationship',now(),'active',r.team_member_id from djm_os.relationships r
 on conflict(from_type,from_id,to_type,to_id,relation_type) do update set strength=excluded.strength,confidence=excluded.confidence,observed_at=now(),status='active',updated_at=now();
 get diagnostics v_rows=row_count;v_count:=v_count+v_rows;
 insert into djm_os.relationship_edges(from_type,from_id,to_type,to_id,relation_type,strength,confidence,source_kind,observed_at,status)
 select 'person',e.person_id,'club',e.organisation_id,'works_at',90,coalesce(e.confidence,0.8),'employment',now(),'active' from djm_os.employments e where e.is_current=true
 on conflict(from_type,from_id,to_type,to_id,relation_type) do update set strength=excluded.strength,confidence=excluded.confidence,observed_at=now(),status='active',updated_at=now();
 get diagnostics v_rows=row_count;v_count:=v_count+v_rows;
 return v_count;
end $function$;


CREATE OR REPLACE FUNCTION djm_os.refresh_relationship_scores()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_count integer:=0;
  v_strength integer;
  v_access integer;
  v_recency integer;
  v_recip integer;
  v_commercial integer;
  v_30 integer;
  v_180 integer;
  v_meet integer;
  v_last timestamptz;
begin
  for r in
    select rel.team_member_id,rel.person_id,coalesce(rel.trust_score,50) trust_score
    from djm_os.relationships rel
  loop
    select count(*) filter(where occurred_at>=now()-interval '30 days'),
           count(*) filter(where occurred_at>=now()-interval '180 days'),
           max(occurred_at)
      into v_30,v_180,v_last
    from djm_os.interactions
    where team_member_id=r.team_member_id and person_id=r.person_id;

    select count(*) into v_meet
    from djm_os.meetings
    where owner_user_id=r.team_member_id
      and person_id=r.person_id
      and starts_at>=now()-interval '365 days'
      and status not in ('cancelled');

    v_recency := case
      when v_last is null then 10
      when v_last>=now()-interval '14 days' then 100
      when v_last>=now()-interval '30 days' then 85
      when v_last>=now()-interval '60 days' then 70
      when v_last>=now()-interval '120 days' then 50
      when v_last>=now()-interval '240 days' then 30
      else 15
    end;

    v_access := least(100,20 + least(v_180,10)*5 + least(v_meet,5)*6);
    v_recip := least(100,25 + least(v_30,8)*6 + least(v_meet,4)*7);
    v_commercial := least(
      100,
      20
      + (select count(*)*10 from djm_os.club_needs n where n.source_person_id=r.person_id and n.owner_user_id=r.team_member_id)
      + (select count(*)*8 from djm_os.opportunity_links ol where ol.person_id=r.person_id and ol.linked_by=r.team_member_id)
    );

    v_strength := round(v_recency*.28 + v_access*.24 + v_recip*.18 + v_commercial*.15 + r.trust_score*.15);

    update djm_os.relationships
    set strength_score=v_strength::smallint,
        access_score=v_access::smallint,
        last_meaningful_at=coalesce(v_last,last_meaningful_at),
        updated_at=now()
    where team_member_id=r.team_member_id and person_id=r.person_id;

    insert into djm_os.relationship_snapshots(
      team_member_id,person_id,strength_score,access_score,reciprocity_score,
      recency_score,commercial_score,interactions_30d,interactions_180d,
      meetings_365d,last_meaningful_at
    )
    values(
      r.team_member_id,r.person_id,v_strength,v_access,v_recip,v_recency,
      v_commercial,v_30,v_180,v_meet,v_last
    );

    v_count:=v_count+1;
  end loop;

  delete from djm_os.relationship_snapshots
  where calculated_at<now()-interval '400 days';

  return jsonb_build_object('relationships_scored',v_count);
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.refresh_review_inbox()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_caps int:=0; v_claims int:=0;
begin
  insert into djm_os.review_items(owner_user_id,review_type,title,detail,person_id,organisation_id,capture_id,confidence,payload,status)
  select c.submitted_by,'capture_review',
         case when c.capture_type='image' then 'Review screenshot capture' when c.capture_type='audio' then 'Review voice capture' else 'Review captured item' end,
         coalesce(c.error_message,'Automatic extraction needs confirmation before it becomes trusted data.'),
         c.person_id,c.organisation_id,c.id,c.confidence,c.extracted_json,'open'
  from djm_os.captures c
  where c.status='needs_review'
  on conflict(capture_id,review_type) do nothing;
  get diagnostics v_caps=row_count;

  insert into djm_os.review_items(owner_user_id,review_type,title,detail,person_id,organisation_id,player_id,claim_id,confidence,payload,status)
  select coalesce(
           i.team_member_id,
           (select tm.user_id from djm_os.team_members tm where tm.is_active=true order by tm.created_at asc limit 1)
         ),
         'claim_review','Verify extracted intelligence',
         cl.claim_type||coalesce(': '||cl.claim_key,''),
         cl.person_id,cl.organisation_id,cl.player_id,cl.id,cl.confidence,cl.value_json,'open'
  from djm_os.claims cl
  left join djm_os.interactions i on i.id=cl.interaction_id
  where coalesce(cl.confidence,0)<0.8 and cl.last_verified_at is null
  on conflict(claim_id,review_type) do nothing;
  get diagnostics v_claims=row_count;

  return jsonb_build_object('captures_added',v_caps,'claims_added',v_claims);
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.refresh_scheduler_status()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v integer;
begin
 delete from djm_os.scheduler_status;
 insert into djm_os.scheduler_status(jobname,schedule,active,refreshed_at)
 select j.jobname,j.schedule,j.active,now()
 from cron.job j
 where j.jobname like 'djm-%';
 get diagnostics v=row_count;
 return v;
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.refresh_source_trust()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v integer:=0; begin
  insert into djm_os.source_trust(source_type,source_key,reliability_score,verified_claims,contradicted_claims,last_calculated_at)
  select coalesce(c.claim_type,'claim'),c.source_key,
    greatest(5,least(98,50 + count(*) filter(where c.verification_status='verified')*5 - count(*) filter(where c.verification_status='contradicted')*8))::smallint,
    count(*) filter(where c.verification_status='verified')::int,
    count(*) filter(where c.verification_status='contradicted')::int,
    now()
  from djm_os.claims c where c.source_key is not null group by coalesce(c.claim_type,'claim'),c.source_key
  on conflict(source_type,source_key) do update set reliability_score=excluded.reliability_score,verified_claims=excluded.verified_claims,contradicted_claims=excluded.contradicted_claims,last_calculated_at=now(),updated_at=now();
  get diagnostics v=row_count; return jsonb_build_object('sources_refreshed',v);
end;$function$;


CREATE OR REPLACE FUNCTION djm_os.refresh_subject_from_player_performance_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player_id uuid := coalesce(new.player_id, old.player_id);
  v_subject_id uuid;
begin
  select s.id into v_subject_id
  from djm_os.football_intelligence_subjects s
  where s.player_id = v_player_id
  limit 1;

  if v_subject_id is not null then
    perform djm_os.refresh_football_subject_scorecard(v_subject_id);
  end if;
  return coalesce(new, old);
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.refresh_today_suggestions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rel int:=0;v_need int:=0;v_match int:=0;v_task int:=0;
begin
  perform djm_os.recalculate_relationship_scores(null);

  insert into djm_os.suggestions(owner_user_id,suggestion_type,title,reason,person_id,organisation_id,score,status,fingerprint,source,expires_at)
  select r.team_member_id,'relationship_reengage','Reconnect with '||p.full_name,
         coalesce(o.name||' · ','')||'Relationship score '||coalesce(r.strength_score,0)||'. No meaningful interaction for '||greatest(1,floor(extract(epoch from (now()-r.last_meaningful_at))/86400))::int||' days.',
         p.id,o.id,
         least(95,greatest(60,coalesce(r.strength_score,50)))::smallint,
         'open','today:reengage:'||r.team_member_id::text||':'||r.person_id::text||':'||to_char(current_date,'IYYY-IW'),'today_engine',now()+interval '8 days'
  from djm_os.relationships r
  join djm_os.people p on p.id=r.person_id
  left join lateral(select e.organisation_id from djm_os.employments e where e.person_id=p.id and e.is_current=true order by e.created_at desc limit 1) ce on true
  left join djm_os.organisations o on o.id=ce.organisation_id
  where r.strength_score>=55 and r.last_meaningful_at is not null and r.last_meaningful_at<now()-interval '45 days'
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics v_rel=row_count;

  insert into djm_os.suggestions(owner_user_id,suggestion_type,title,reason,organisation_id,club_need_id,score,status,fingerprint,source,expires_at)
  select n.owner_user_id,'need_reconfirm','Reconfirm '||coalesce(o.name,'club')||' need: '||coalesce(n.position,n.title),
         'This club need is still active but has not been updated for '||greatest(1,floor(extract(epoch from (now()-n.updated_at))/86400))::int||' days. Reconfirm before presenting players.',
         n.organisation_id,n.id,75,'open','today:need:'||n.id::text||':'||to_char(current_date,'IYYY-IW'),'today_engine',now()+interval '8 days'
  from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id
  where n.status in ('active','open','confirmed') and n.updated_at<now()-interval '21 days'
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics v_need=row_count;

  insert into djm_os.suggestions(owner_user_id,suggestion_type,title,reason,organisation_id,player_id,club_need_id,score,status,fingerprint,source,expires_at)
  select n.owner_user_id,'high_match','Review '||coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'player')||' for '||o.name,
         'Automatic first-pass match scored '||round(m.overall_score)||'/100 for the '||coalesce(n.position,n.title)||' requirement.',
         n.organisation_id,p.id,n.id,
         least(98,greatest(70,round(m.overall_score)::int))::smallint,
         'open','today:match:'||m.id::text||':'||to_char(current_date,'IYYY-IW'),'today_engine',now()+interval '8 days'
  from djm_os.player_matches m
  join djm_os.club_needs n on n.id=m.club_need_id
  join djm_os.organisations o on o.id=n.organisation_id
  join public.players p on p.id=m.player_id
  where n.status in ('active','open','confirmed') and m.status='suggested' and m.overall_score>=80
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics v_match=row_count;

  insert into djm_os.suggestions(owner_user_id,suggestion_type,title,reason,person_id,organisation_id,score,status,fingerprint,source,expires_at)
  select t.owner_user_id,'task_due',t.title,
         case when t.due_at<now() then 'Overdue follow-up' else 'Follow-up due soon' end||coalesce(' · '||p.full_name,'')||coalesce(' · '||o.name,''),
         t.person_id,t.organisation_id,
         case when t.due_at<now() then 92 else 82 end,
         'open','today:task:'||t.id::text||':'||to_char(current_date,'YYYY-MM-DD'),'today_engine',now()+interval '2 days'
  from djm_os.tasks t
  left join djm_os.people p on p.id=t.person_id
  left join djm_os.organisations o on o.id=t.organisation_id
  where t.status not in ('done','completed','cancelled') and t.due_at is not null and t.due_at<now()+interval '48 hours'
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics v_task=row_count;

  update djm_os.suggestions set status='expired' where status='open' and expires_at is not null and expires_at<now();
  return jsonb_build_object('relationship',v_rel,'needs',v_need,'matches',v_match,'tasks',v_task);
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.registration_fit_score(p_registration_notes text, p_work_rights text, p_passports text[], p_country text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
select case
  when nullif(trim(coalesce(p_registration_notes,'')),'') is null then
    case when p_country is not null and lower(coalesce(p_work_rights,'')) like '%'||lower(p_country)||'%' then 95 else 70 end
  when lower(p_registration_notes) ~ '(eu passport|eu national|european passport)' then case when djm_os.has_eu_passport(p_passports) then 100 else 35 end
  when p_country is not null and lower(coalesce(p_work_rights,'')) like '%'||lower(p_country)||'%' then 95
  else 65 end
$function$;


CREATE OR REPLACE FUNCTION djm_os.safe_json_number(p_value text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  if p_value is null or btrim(p_value)='' then return null; end if;
  if btrim(p_value) ~ '^-?[0-9]+([.][0-9]+)?$' then return btrim(p_value)::numeric; end if;
  return null;
end; $function$;


CREATE OR REPLACE FUNCTION djm_os.seed_freshness_queue()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_people int:=0; v_needs int:=0; v_players int:=0; v_orgs int:=0; v_prospects int:=0;
begin
  insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,reason,next_check_at,source_hint)
  select 'person',p.id,'employment',case when exists(select 1 from djm_os.relationships r where r.person_id=p.id and coalesce(r.strength_score,0)>=70) then 85 else 55 end,'Keep current club/role accurate',now(),coalesce(p.linkedin_url,'public_sources')
  from djm_os.people p where coalesce(p.last_verified_at,p.updated_at)<now()-interval '60 days'
  on conflict(entity_type,entity_id,check_type) do update set priority=greatest(djm_os.freshness_queue.priority,excluded.priority),reason=excluded.reason,next_check_at=least(djm_os.freshness_queue.next_check_at,excluded.next_check_at),source_hint=coalesce(excluded.source_hint,djm_os.freshness_queue.source_hint),updated_at=now(); get diagnostics v_people=row_count;
  insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,reason,next_check_at,source_hint)
  select 'organisation',o.id,'identity',case when exists(select 1 from djm_os.club_needs n where n.organisation_id=o.id and n.status in ('active','open','confirmed')) then 80 else 45 end,'Keep club identity and official site current',now(),coalesce(o.website_url,'public_sources')
  from djm_os.organisations o where coalesce(o.last_verified_at,o.updated_at)<now()-interval '120 days'
  on conflict(entity_type,entity_id,check_type) do update set priority=greatest(djm_os.freshness_queue.priority,excluded.priority),reason=excluded.reason,next_check_at=least(djm_os.freshness_queue.next_check_at,excluded.next_check_at),source_hint=coalesce(excluded.source_hint,djm_os.freshness_queue.source_hint),updated_at=now(); get diagnostics v_orgs=row_count;
  insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,reason,next_check_at,source_hint)
  select 'club_need',n.id,'need_status',90,'Club requirements go stale quickly',now(),'relationship_reconfirm' from djm_os.club_needs n where n.status in ('active','open','confirmed') and coalesce(n.confirmed_at,n.created_at)<now()-interval '21 days'
  on conflict(entity_type,entity_id,check_type) do update set priority=excluded.priority,reason=excluded.reason,next_check_at=least(djm_os.freshness_queue.next_check_at,excluded.next_check_at),updated_at=now(); get diagnostics v_needs=row_count;
  insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,reason,next_check_at,source_hint)
  select 'player',p.id,'market_profile',case when p.football_status in ('active','free_agent','loan') then 75 else 55 end,'Keep player club, contract and market status fresh',now(),coalesce(p.transfermarkt_url,p.wyscout_url,'player_or_public_sources') from public.players p where coalesce(p.updated_at,p.created_at)<now()-interval '45 days'
  on conflict(entity_type,entity_id,check_type) do update set priority=greatest(djm_os.freshness_queue.priority,excluded.priority),reason=excluded.reason,next_check_at=least(djm_os.freshness_queue.next_check_at,excluded.next_check_at),source_hint=coalesce(excluded.source_hint,djm_os.freshness_queue.source_hint),updated_at=now(); get diagnostics v_players=row_count;
  insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,reason,next_check_at,source_hint)
  select 'prospect',s.id,'prospect_status',55,'Keep prospect club, contract and representation status fresh',now(),coalesce(s.transfermarkt_url,s.wyscout_url,'public_sources') from djm_os.scouting_prospects s where coalesce(s.last_verified_at,s.updated_at)<now()-interval '60 days'
  on conflict(entity_type,entity_id,check_type) do update set priority=greatest(djm_os.freshness_queue.priority,excluded.priority),reason=excluded.reason,next_check_at=least(djm_os.freshness_queue.next_check_at,excluded.next_check_at),source_hint=coalesce(excluded.source_hint,djm_os.freshness_queue.source_hint),updated_at=now(); get diagnostics v_prospects=row_count;
  return jsonb_build_object('people',v_people,'organisations',v_orgs,'needs',v_needs,'players',v_players,'prospects',v_prospects);
end $function$;


CREATE OR REPLACE FUNCTION djm_os.seed_source_monitors()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_count integer:=0;v_rows integer;
begin
  insert into djm_os.source_monitors(entity_type,entity_id,source_url,source_kind,check_interval_hours)
  select 'club',o.id,o.website_url,'official',168 from djm_os.organisations o
  where o.website_url is not null and length(trim(o.website_url))>8
  on conflict(entity_type,entity_id,source_url) do nothing;
  get diagnostics v_rows=row_count;v_count:=v_count+v_rows;

  insert into djm_os.source_monitors(entity_type,entity_id,source_url,source_kind,check_interval_hours)
  select 'person',m.person_id,m.source_url,coalesce(m.source_kind,'official'),72 from djm_os.memories m
  where m.person_id is not null and m.source_url is not null and m.status='active'
  on conflict(entity_type,entity_id,source_url) do nothing;
  get diagnostics v_rows=row_count;v_count:=v_count+v_rows;

  insert into djm_os.source_monitors(entity_type,entity_id,source_url,source_kind,check_interval_hours)
  select 'recruitment_target',m.prospect_id,m.source_url,coalesce(m.source_kind,'official'),72 from djm_os.memories m
  where m.prospect_id is not null and m.source_url is not null and m.status='active'
  on conflict(entity_type,entity_id,source_url) do nothing;
  get diagnostics v_rows=row_count;v_count:=v_count+v_rows;

  return v_count;
end $function$;


CREATE OR REPLACE FUNCTION djm_os.seed_tell_djm_permission()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  insert into djm_os.tell_djm_permissions(user_id, permission_scope, is_enabled)
  values (
    new.user_id,
    case when lower(coalesce(new.role_title, '')) like '%admin%' then 'full' else 'scout' end,
    new.is_active
  )
  on conflict (user_id) do update
  set permission_scope = excluded.permission_scope,
      is_enabled = excluded.is_enabled,
      updated_at = now();
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION djm_os.subject_career_context(p_subject_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end;$function$;


CREATE OR REPLACE FUNCTION djm_os.subject_identity_quality(p_subject_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select greatest(
    coalesce((select case when s.identity_confidence is null then 0::numeric else greatest(0::numeric,least(1::numeric,s.identity_confidence))*case when s.identity_verified_at is null then .75 when s.identity_verified_at>=now()-interval '2 years' then 1.0 when s.identity_verified_at>=now()-interval '5 years' then .85 else .65 end end from djm_os.football_intelligence_subjects s where s.id=p_subject_id),0),
    coalesce((select max(greatest(0::numeric,least(1::numeric,e.confidence))) from djm_os.football_subject_identity_evidence e where e.subject_id=p_subject_id),0)
  );
$function$;


commit;
