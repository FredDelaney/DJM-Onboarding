-- DJM Player staging djm_os-function bootstrap — batch 02
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- all private function bootstrap batches, and djm_os function batch 01.
--
-- Exact current-production definitions for djm_os functions 21-40 of 95,
-- ordered by function name + identity arguments.
-- Production body MD5: 6775529172b6a05f8d56e673d8fc8432
--
-- Body validation is disabled only during bootstrap because later djm_os/public
-- batches may provide cross-function dependencies. No function is executed.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION djm_os.global_score_kernel_v7(p_components jsonb, p_identity_quality numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION djm_os.global_score_v7_self_test()
 RETURNS TABLE(test_name text, passed boolean, details jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a jsonb; b jsonb; rich jsonb; market_only jsonb; stale jsonb; optional_a jsonb; optional_b jsonb;
begin
  market_only:=djm_os.global_score_kernel_v7(jsonb_build_object(
    'competition',jsonb_build_object('score',null,'quality',0,'weight',20,'eligible',true),
    'team_context',jsonb_build_object('score',null,'quality',0,'weight',10,'eligible',true),
    'role',jsonb_build_object('score',null,'quality',0,'weight',18,'eligible',true),
    'position_production',jsonb_build_object('score',null,'quality',0,'weight',20,'eligible',true),
    'match_influence',jsonb_build_object('score',null,'quality',0,'weight',12,'eligible',true),
    'market_consensus',jsonb_build_object('score',98,'quality',.92,'weight',12,'eligible',true),
    'career_context',jsonb_build_object('score',null,'quality',0,'weight',8,'eligible',true)
  ),.95);
  test_name:='market_value_alone_cannot_create_elite_current_level'; passed:=(market_only->>'score')::numeric<65 and (market_only->>'confidence')::int<60; details:=market_only; return next;

  a:=djm_os.global_score_kernel_v7(jsonb_build_object('competition',jsonb_build_object('score',40,'quality',1,'weight',20,'eligible',true),'role',jsonb_build_object('score',60,'quality',1,'weight',18,'eligible',true)),1);
  b:=djm_os.global_score_kernel_v7(jsonb_build_object('competition',jsonb_build_object('score',70,'quality',1,'weight',20,'eligible',true),'role',jsonb_build_object('score',60,'quality',1,'weight',18,'eligible',true)),1);
  test_name:='stronger_verified_competition_never_lowers_identical_player'; passed:=(b->>'score')::numeric>(a->>'score')::numeric; details:=jsonb_build_object('weaker',a,'stronger',b); return next;

  a:=djm_os.global_score_kernel_v7(jsonb_build_object('competition',jsonb_build_object('score',60,'quality',1,'weight',20,'eligible',true),'role',jsonb_build_object('score',45,'quality',1,'weight',18,'eligible',true)),1);
  b:=djm_os.global_score_kernel_v7(jsonb_build_object('competition',jsonb_build_object('score',60,'quality',1,'weight',20,'eligible',true),'role',jsonb_build_object('score',80,'quality',1,'weight',18,'eligible',true)),1);
  test_name:='stronger_verified_role_never_lowers_identical_player'; passed:=(b->>'score')::numeric>(a->>'score')::numeric; details:=jsonb_build_object('lower_role',a,'higher_role',b); return next;

  optional_a:=djm_os.global_score_kernel_v7(jsonb_build_object('competition',jsonb_build_object('score',60,'quality',1,'weight',20,'eligible',true),'team_context',jsonb_build_object('score',null,'quality',0,'weight',10,'eligible',false),'role',jsonb_build_object('score',70,'quality',1,'weight',18,'eligible',true)),1);
  optional_b:=djm_os.global_score_kernel_v7(jsonb_build_object('competition',jsonb_build_object('score',60,'quality',1,'weight',20,'eligible',true),'role',jsonb_build_object('score',70,'quality',1,'weight',18,'eligible',true)),1);
  test_name:='unavailable_optional_source_does_not_change_score'; passed:=abs((optional_a->>'score')::numeric-(optional_b->>'score')::numeric)<.01; details:=jsonb_build_object('with_ineligible_optional',optional_a,'without_optional',optional_b); return next;

  stale:=djm_os.global_score_kernel_v7(jsonb_build_object('competition',jsonb_build_object('score',70,'quality',.25,'weight',20,'eligible',true),'role',jsonb_build_object('score',75,'quality',.20,'weight',18,'eligible',true),'market_consensus',jsonb_build_object('score',90,'quality',.30,'weight',12,'eligible',true)),.95);
  test_name:='stale_sparse_evidence_cannot_create_high_confidence'; passed:=(stale->>'confidence')::int<65; details:=stale; return next;

  rich:=djm_os.global_score_kernel_v7(jsonb_build_object(
    'competition',jsonb_build_object('score',70,'quality',.95,'weight',20,'eligible',true),
    'team_context',jsonb_build_object('score',62,'quality',.90,'weight',10,'eligible',true),
    'role',jsonb_build_object('score',82,'quality',.95,'weight',18,'eligible',true),
    'position_production',jsonb_build_object('score',74,'quality',.90,'weight',20,'eligible',true),
    'match_influence',jsonb_build_object('score',72,'quality',.90,'weight',12,'eligible',true),
    'market_consensus',jsonb_build_object('score',68,'quality',.90,'weight',12,'eligible',true),
    'career_context',jsonb_build_object('score',69,'quality',.90,'weight',8,'eligible',true)
  ),.98);
  test_name:='rich_independent_evidence_reaches_ready_high_confidence'; passed:=(rich->>'confidence')::int>=80 and (rich->>'confidence')::int<=97; details:=rich; return next;

  test_name:='confidence_never_claims_certainty'; passed:=(rich->>'confidence')::int<100; details:=rich; return next;
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.global_subject_season_quality(p_subject_id uuid, p_provider_season_id text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end; $function$


CREATE OR REPLACE FUNCTION djm_os.has_eu_passport(p_passports text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
select exists(select 1 from unnest(coalesce(p_passports,'{}'::text[])) x where lower(x) in ('austria','belgium','bulgaria','croatia','cyprus','czech republic','czechia','denmark','estonia','finland','france','germany','greece','hungary','ireland','italy','latvia','lithuania','luxembourg','malta','netherlands','poland','portugal','romania','slovakia','slovenia','spain','sweden'))
$function$


CREATE OR REPLACE FUNCTION djm_os.infer_contact_label(p_label text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_label text := regexp_replace(trim(coalesce(p_label,'')), '\s+', ' ', 'g');
  v_base text;
  v_org_name text;
  v_person_name text;
  v_role text;
  v_confidence numeric := 0;
  v_review boolean := false;
  v_parts text[];
  v_words text[];
begin
  if v_label = '' then return jsonb_build_object('name',null,'club_name',null,'role_title',null,'confidence',0,'needs_review',true); end if;

  v_parts := regexp_split_to_array(v_label, '\s+-\s+');
  v_base := trim(v_parts[1]);

  if v_base ~* '\m(sporting director|sports director|director of football|head coach|assistant coach|assistant manager|head of recruitment|recruitment director|chief executive|ceo|general manager|academy director|technical director)\M' then
    v_role := case
      when v_base ~* '\mdirector of football\M' then 'Director of Football'
      when v_base ~* '\msporting director\M|\msports director\M' then 'Sporting Director'
      when v_base ~* '\mhead coach\M' then 'Head Coach'
      when v_base ~* '\massistant coach\M' then 'Assistant Coach'
      when v_base ~* '\massistant manager\M' then 'Assistant Manager'
      when v_base ~* '\mhead of recruitment\M' then 'Head of Recruitment'
      when v_base ~* '\mrecruitment director\M' then 'Recruitment Director'
      when v_base ~* '\mtechnical director\M' then 'Technical Director'
      when v_base ~* '\macademy director\M' then 'Academy Director'
      when v_base ~* '\mchief executive\M|\mceo\M' then 'CEO'
      when v_base ~* '\mgeneral manager\M' then 'General Manager'
      else null end;
    v_base := regexp_replace(v_base, '\s*(sporting director|sports director|director of football|head coach|assistant coach|assistant manager|head of recruitment|recruitment director|chief executive|ceo|general manager|academy director|technical director)\s*$', '', 'i');
  elsif v_base ~* '\sSD$' then
    v_role := 'Sporting Director';
    v_base := regexp_replace(v_base, '\sSD$', '', 'i');
  elsif v_base ~* '\sHC$' then
    v_role := 'Head Coach';
    v_base := regexp_replace(v_base, '\sHC$', '', 'i');
  end if;

  select o.name into v_org_name
  from djm_os.organisations o
  where length(o.name) >= 2 and v_base ilike '%' || o.name || '%'
  order by length(o.name) desc
  limit 1;

  if v_org_name is not null then
    v_person_name := trim(regexp_replace(v_base, regexp_replace(v_org_name,'([\\.\\+\\*\\?\\[\\]\\(\\)\\{\\}\\^\\$\\|\\-])','\\\1','g') || '$', '', 'i'));
    if length(v_person_name) >= 2 then
      v_confidence := 0.93;
    else
      v_person_name := v_label;
      v_org_name := null;
      v_confidence := 0;
      v_review := true;
    end if;
  elsif array_length(v_parts,1) >= 2 then
    v_words := regexp_split_to_array(v_base, '\s+');
    if array_length(v_words,1) >= 4 then
      v_person_name := v_words[1] || ' ' || v_words[2];
      v_org_name := array_to_string(v_words[3:array_length(v_words,1)], ' ');
      v_confidence := 0.72;
      v_review := true;
    else
      v_person_name := v_base;
      v_confidence := 0.45;
      v_review := true;
    end if;
  else
    v_person_name := v_label;
    v_confidence := 0.4;
  end if;

  return jsonb_build_object(
    'name', nullif(trim(v_person_name),''),
    'club_name', nullif(trim(v_org_name),''),
    'role_title', v_role,
    'confidence', v_confidence,
    'needs_review', v_review,
    'raw_label', v_label
  );
end
$function$


CREATE OR REPLACE FUNCTION djm_os.infer_global_league_tier(p_country text, p_league text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare c text:=lower(coalesce(p_country,'')); l text:=lower(coalesce(p_league,''));
begin
  if l='' then return null; end if;
  if c='england' then if l like '%premier league%' then return 1; elsif l like '%championship%' then return 2; elsif l like '%league one%' then return 3; elsif l like '%league two%' then return 4; end if;
  elsif c='netherlands' then if l like '%eredivisie%' then return 1; elsif l like '%eerste divisie%' then return 2; elsif l like '%tweede divisie%' then return 3; end if;
  elsif c='belgium' then if l like '%challenger%' then return 2; elsif l like '%pro league%' then return 1; end if;
  elsif c='portugal' then if l like '%primeira%' or l like '%liga portugal betclic%' then return 1; elsif l like '%liga portugal 2%' or l like '%segunda liga%' then return 2; elsif l like '%liga 3%' then return 3; end if;
  elsif c='sweden' then if l like '%allsvenskan%' then return 1; elsif l like '%superettan%' then return 2; elsif l like '%ettan%' then return 3; end if;
  elsif c='finland' then if l like '%veikkausliiga%' then return 1; elsif l like '%ykkosliiga%' or l like '%ykkösliiga%' then return 2; elsif l like '%ykkonen%' or l like '%ykkönen%' then return 3; elsif l like '%kakkonen%' then return 4; end if;
  elsif c='norway' then if l like '%eliteserien%' then return 1; elsif l like '%obos%' or l like '%1. divisjon%' or l like '%1 division%' then return 2; elsif l like '%2. divisjon%' or l like '%2 division%' then return 3; end if;
  elsif c='denmark' then if l like '%superliga%' then return 1; elsif l like '%1st division%' or l like '%1. division%' then return 2; elsif l like '%2nd division%' or l like '%2. division%' then return 3; end if;
  elsif c='poland' then if l like '%ekstraklasa%' then return 1; elsif l like '%i liga%' or l like '%1 liga%' then return 2; elsif l like '%ii liga%' or l like '%2 liga%' then return 3; end if;
  elsif c in ('czechia','czech republic') then if l like '%first league%' or l like '%1. liga%' or l like '%chance liga%' then return 1; elsif l like '%national football league%' or l like '%2. liga%' then return 2; end if;
  elsif c='austria' then if l like '%bundesliga%' then return 1; elsif l like '%2. liga%' or l like '%zweite liga%' then return 2; end if;
  elsif c='switzerland' then if l like '%super league%' then return 1; elsif l like '%challenge league%' then return 2; end if;
  elsif c='scotland' then if l like '%premiership%' then return 1; elsif l like '%championship%' then return 2; elsif l like '%league one%' then return 3; end if;
  elsif c in ('ireland','republic of ireland') then if l like '%premier division%' then return 1; elsif l like '%first division%' then return 2; end if;
  elsif c='slovakia' then if l like '%nike liga%' or l like '%niké liga%' or l like '%fortuna liga%' then return 1; elsif l like '%2. liga%' then return 2; end if;
  elsif c='australia' then if l like '%a-league%' or l like '%a league%' then return 1; end if;
  elsif c='thailand' then if l like '%thai league 2%' then return 2; elsif l like '%thai league 3%' then return 3; elsif l like '%thai league 1%' or l like '%thai league%' then return 1; end if;
  elsif c='malaysia' then if l like '%super league%' then return 1; end if;
  elsif c='indonesia' then if l like '%liga 2%' then return 2; elsif l like '%liga 1%' or l like '%super league%' then return 1; end if;
  elsif c='singapore' then if l like '%premier league%' then return 1; end if;
  elsif c='new zealand' then if l like '%national league%' then return 1; elsif l like '%northern league%' or l like '%central league%' or l like '%southern league%' then return 2; end if;
  end if;
  return null;
end; $function$


CREATE OR REPLACE FUNCTION djm_os.inherit_signed_player_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.signed_player_id is not null
     and new.owner_user_id is not null
     and (old.signed_player_id is distinct from new.signed_player_id) then
    update public.players
    set primary_staff_user_id=coalesce(primary_staff_user_id,new.owner_user_id),updated_at=now()
    where id=new.signed_player_id;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.is_secondary_team_name(p_name text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
select lower(coalesce(p_name,'')) ~ '(^|[^a-z0-9])(reserve|reserves|academy|u18|u19|u20|u21|u22|u23|under 18|under 19|under 20|under 21|under 23)([^a-z0-9]|$)';
$function$


CREATE OR REPLACE FUNCTION djm_os.is_team_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from djm_os.team_members tm
    where tm.user_id = auth.uid() and tm.is_active = true
  );
$function$


CREATE OR REPLACE FUNCTION djm_os.maintenance_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_stale_needs int:=0; v_suggestions int:=0; v_review int:=0;
begin
  with changed as (
    update djm_os.club_needs set status='stale',updated_at=now()
    where status in ('active','open','confirmed') and expires_at is not null and expires_at<now()
    returning id
  ) select count(*) into v_stale_needs from changed;

  with changed as (
    update djm_os.captures set status='needs_review',error_message=coalesce(error_message,'Automatic processing has not completed'),processed_at=coalesce(processed_at,now())
    where status='queued' and created_at<now()-interval '24 hours'
    returning id
  ) select count(*) into v_review from changed;

  insert into djm_os.suggestions(owner_user_id,suggestion_type,title,reason,person_id,score,status,fingerprint,source,expires_at)
  select r.team_member_id,'relationship_reengage','Reconnect with '||p.full_name,
         'Strong DJM relationship with no meaningful interaction for '||greatest(1,floor(extract(epoch from (now()-r.last_meaningful_at))/86400))::int||' days.',
         r.person_id,
         least(95,greatest(55,coalesce(r.strength_score,50)))::smallint,
         'open',
         'reengage:'||r.team_member_id::text||':'||r.person_id::text||':'||to_char(current_date,'YYYY-MM'),
         'maintenance',
         date_trunc('month',now())+interval '1 month'
  from djm_os.relationships r join djm_os.people p on p.id=r.person_id
  where coalesce(r.strength_score,0)>=50 and r.last_meaningful_at is not null and r.last_meaningful_at<now()-interval '60 days'
  on conflict (fingerprint) where fingerprint is not null do nothing;
  get diagnostics v_suggestions = row_count;

  return jsonb_build_object('stale_needs',v_stale_needs,'captures_for_review',v_review,'relationship_suggestions',v_suggestions);
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.market_consensus_score(p_value numeric, p_currency text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_eur numeric;
begin
  v_eur := djm_os.market_value_eur_equivalent(p_value,p_currency);
  if v_eur is null then return null; end if;
  return greatest(10::numeric,least(98::numeric,50 + 20*(ln(v_eur/1000000.0)/ln(10.0))));
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.market_preference_score(p_preferences text, p_country text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
select case
  when nullif(trim(coalesce(p_country,'')),'') is null then 65
  when nullif(trim(coalesce(p_preferences,'')),'') is null then 60
  when lower(p_preferences) like '%'||lower(p_country)||'%' and lower(p_preferences) !~ ('(not|no|avoid|exclude)[^,.]{0,20}'||lower(p_country)) then 95
  when lower(p_preferences) ~ '(open|anywhere|worldwide|global|europe|asia|scandinavia)' then 78
  when lower(p_preferences) ~ ('(not|no|avoid|exclude)[^,.]{0,20}'||lower(p_country)) then 20
  else 60 end
$function$


CREATE OR REPLACE FUNCTION djm_os.market_value_eur_equivalent(p_value numeric, p_currency text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_value is null or p_value <= 0 then null
    when upper(coalesce(p_currency,'EUR'))='EUR' then p_value
    when upper(p_currency)='GBP' then p_value * 1.15
    when upper(p_currency)='USD' then p_value * 0.86
    else null
  end;
$function$


CREATE OR REPLACE FUNCTION djm_os.market_value_quality(p_verified_at timestamp with time zone, p_value numeric, p_currency text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case
    when djm_os.market_value_eur_equivalent(p_value,p_currency) is null then 0::numeric
    when p_verified_at is null then .40::numeric
    when p_verified_at >= now()-interval '120 days' then .92::numeric
    when p_verified_at >= now()-interval '240 days' then .78::numeric
    when p_verified_at >= now()-interval '365 days' then .58::numeric
    else .30::numeric
  end;
$function$


CREATE OR REPLACE FUNCTION djm_os.message_after_insert_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin begin perform djm_os.process_message_rule_based(new.id); exception when others then update djm_os.messages set processing_status='needs_review' where id=new.id; raise warning 'DJM message processing failed for %: %',new.id,sqlerrm; end; return new; end; $function$


CREATE OR REPLACE FUNCTION djm_os.mirror_player_match_to_subject()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_subject uuid;
begin
  if tg_op='DELETE' then
    select id into v_subject from djm_os.football_intelligence_subjects where player_id=old.player_id limit 1;
    if v_subject is not null then
      delete from djm_os.football_subject_match_snapshots
      where subject_id=v_subject and provider=old.provider and provider_match_id=old.provider_match_id
        and coalesce(provider_player_id,'')=coalesce(old.provider_player_id,'');
    end if;
    return old;
  end if;

  select id into v_subject from djm_os.football_intelligence_subjects where player_id=new.player_id limit 1;
  if v_subject is null then return new; end if;

  insert into djm_os.football_subject_match_snapshots(
    subject_id, fixture_id, competition_id, team_id, opponent_team_id,
    provider, provider_player_id, provider_match_id, provider_team_id,
    provider_opponent_id, provider_competition_id, provider_season_id,
    season_label, match_date, kickoff_at, team_name, opponent_name,
    home_away, position_group, provider_position, started, minutes, metrics,
    metric_schema_version, data_depth, confidence, observed_at, synced_at,
    payload_hash, request_metadata, provenance, updated_at
  ) values (
    v_subject, new.fixture_id, new.competition_id, new.team_id, new.opponent_team_id,
    new.provider, new.provider_player_id, new.provider_match_id, new.provider_team_id,
    new.provider_opponent_id, new.provider_competition_id, new.provider_season_id,
    new.season_label, new.match_date, new.kickoff_at, new.team_name, new.opponent_name,
    new.home_away, new.position_group, new.provider_position, new.started, new.minutes, new.metrics,
    new.metric_schema_version, new.data_depth, new.confidence, new.observed_at, new.synced_at,
    new.payload_hash, new.request_metadata,
    jsonb_build_object('source_table','djm_os.player_match_stat_snapshots','mirrored_at',now()),
    now()
  )
  on conflict(subject_id,provider,provider_match_id,provider_player_id) do update set
    fixture_id=excluded.fixture_id,
    competition_id=excluded.competition_id,
    team_id=excluded.team_id,
    opponent_team_id=excluded.opponent_team_id,
    provider_team_id=excluded.provider_team_id,
    provider_opponent_id=excluded.provider_opponent_id,
    provider_competition_id=excluded.provider_competition_id,
    provider_season_id=excluded.provider_season_id,
    season_label=excluded.season_label,
    match_date=excluded.match_date,
    kickoff_at=excluded.kickoff_at,
    team_name=excluded.team_name,
    opponent_name=excluded.opponent_name,
    home_away=excluded.home_away,
    position_group=excluded.position_group,
    provider_position=excluded.provider_position,
    started=excluded.started,
    minutes=excluded.minutes,
    metrics=excluded.metrics,
    metric_schema_version=excluded.metric_schema_version,
    data_depth=excluded.data_depth,
    confidence=excluded.confidence,
    observed_at=excluded.observed_at,
    synced_at=excluded.synced_at,
    payload_hash=excluded.payload_hash,
    request_metadata=excluded.request_metadata,
    provenance=excluded.provenance,
    updated_at=now();
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.mirror_player_provider_snapshot_to_subject()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_subject_id uuid;
begin
  select s.id into v_subject_id
  from djm_os.football_intelligence_subjects s
  where s.player_id = new.player_id
  limit 1;

  if v_subject_id is null then
    return new;
  end if;

  insert into djm_os.football_subject_provider_snapshots(
    subject_id, provider, provider_player_id, provider_team_id, provider_competition_id,
    provider_season_id, season_label, club_name, competition_name, metrics,
    metric_schema_version, data_depth, confidence, provenance, observed_at, synced_at, updated_at
  ) values (
    v_subject_id, new.provider, new.provider_player_id, coalesce(new.provider_team_id,''),
    coalesce(new.provider_competition_id,''), new.provider_season_id, new.season_label,
    new.club_name, new.competition_name, coalesce(new.metrics,'{}'::jsonb),
    coalesce(new.metric_schema_version,'djm_metrics_v1'), coalesce(new.data_depth,'unknown'),
    new.confidence,
    jsonb_build_object('mirrored_from','djm_os.player_provider_stat_snapshots') || coalesce(new.request_metadata,'{}'::jsonb),
    new.observed_at, new.synced_at, now()
  )
  on conflict(subject_id, provider, provider_season_id, provider_competition_id, provider_team_id)
  do update set
    provider_player_id=excluded.provider_player_id,
    season_label=excluded.season_label,
    club_name=excluded.club_name,
    competition_name=excluded.competition_name,
    metrics=excluded.metrics,
    metric_schema_version=excluded.metric_schema_version,
    data_depth=excluded.data_depth,
    confidence=excluded.confidence,
    provenance=excluded.provenance,
    observed_at=excluded.observed_at,
    synced_at=excluded.synced_at,
    updated_at=now();

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.mirror_player_scorecard_to_subject()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_subject_id uuid;
begin
  select s.id into v_subject_id
  from djm_os.football_intelligence_subjects s
  where s.player_id = new.player_id
  limit 1;

  if v_subject_id is null then
    return new;
  end if;

  -- V5 can update legacy player evidence, but the shared subject scorecard is
  -- always recalculated by the current global model instead of being replaced.
  perform djm_os.refresh_football_subject_scorecard(v_subject_id);
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION djm_os.normalise_need_position(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select case
 when p_text ~* '\m(left[- ]?foot(ed)? (centre|center)[- ]?back|lcb)\M' then 'LCB'
 when p_text ~* '\m(right[- ]?foot(ed)? (centre|center)[- ]?back|rcb)\M' then 'RCB'
 when p_text ~* '\m(centre|center)[- ]?back|\mcb\M' then 'CB'
 when p_text ~* '\mleft[- ]?back|\mlb\M' then 'LB'
 when p_text ~* '\mright[- ]?back|\mrb\M' then 'RB'
 when p_text ~* '\mright winger|\mrw\M' then 'RW'
 when p_text ~* '\mleft winger|\mlw\M' then 'LW'
 when p_text ~* '\mwinger\M' then 'Winger'
 when p_text ~* '\mdefensive midfield(er)?|holding midfield(er)?|number 6|no\.? ?6\M' then '6'
 when p_text ~* '\mcentral midfield(er)?|number 8|no\.? ?8\M' then '8'
 when p_text ~* '\mattacking midfield(er)?|number 10|no\.? ?10\M' then '10'
 when p_text ~* '\mstriker|centre forward|center forward|\mcf\M' then 'ST'
 when p_text ~* '\mgoalkeeper|keeper|\mgk\M' then 'GK'
 else null end; $function$


CREATE OR REPLACE FUNCTION djm_os.normalise_projection_position(p_position text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when upper(coalesce(p_position,'')) in ('GK','GOALKEEPER') then 'GK'
    when upper(coalesce(p_position,'')) in ('CB','CENTRE BACK','CENTER BACK','CENTRE-BACK','CENTER-BACK') then 'CB'
    when upper(coalesce(p_position,'')) in ('FB_WB','LB','RB','LWB','RWB','FULL BACK','FULLBACK','WING BACK','WINGBACK') then 'FB_WB'
    when upper(coalesce(p_position,'')) in ('DM','CDM','DEFENSIVE MIDFIELD','DEFENSIVE MIDFIELDER') then 'DM'
    when upper(coalesce(p_position,'')) in ('CM','CENTRAL MIDFIELD','CENTRAL MIDFIELDER') then 'CM'
    when upper(coalesce(p_position,'')) in ('AM','CAM','ATTACKING MIDFIELD','ATTACKING MIDFIELDER','10','NO.10','NO 10') then 'AM'
    when upper(coalesce(p_position,'')) in ('W','LW','RW','WINGER','LEFT WINGER','RIGHT WINGER') then 'W'
    when upper(coalesce(p_position,'')) in ('ST','CF','STRIKER','CENTRE FORWARD','CENTER FORWARD') then 'ST'
    else null
  end;
$function$


commit;
