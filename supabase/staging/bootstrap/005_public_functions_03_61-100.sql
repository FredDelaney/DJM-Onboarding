-- DJM Player staging public-function bootstrap — batch 03
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- all private/djm_os function batches, and public function batches 01-02.
--
-- Exact current-production definitions for public functions 61-100 of 240,
-- ordered by function name + identity arguments.
-- Production body MD5: dcc9ae333be31d47fd0cc4198523d41f
--
-- Existing staging public platform_server_* RPCs were checked for collisions
-- before public bootstrap recovery; no exact production name/signature
-- collision was found.
--
-- Body validation is disabled only during bootstrap because later public
-- batches may provide cross-function dependencies. No function is executed.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.djm_link_thread(p_thread_id uuid, p_person_id uuid DEFAULT NULL::uuid, p_organisation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_owner uuid; v_count int:=0; r record;
begin
 select owner_user_id into v_owner from djm_os.conversation_threads where id=p_thread_id; if not found or v_owner<>auth.uid() then raise exception 'Thread not found'; end if;
 update djm_os.conversation_threads set person_id=coalesce(p_person_id,person_id),organisation_id=coalesce(p_organisation_id,organisation_id),updated_at=now() where id=p_thread_id;
 update djm_os.review_items set status='resolved',resolved_at=now() where review_type='thread_identity' and payload->>'thread_id'=p_thread_id::text and status='open';
 for r in select id from djm_os.messages where thread_id=p_thread_id order by sent_at loop perform djm_os.process_message_rule_based(r.id); v_count:=v_count+1; end loop;
 perform djm_os.thread_interaction_rollup(p_thread_id);
 return jsonb_build_object('thread_id',p_thread_id,'person_id',p_person_id,'organisation_id',p_organisation_id,'linked',true,'messages_reprocessed',v_count);
end $function$


CREATE OR REPLACE FUNCTION public.djm_market_add_need_contact(p_need_id uuid, p_full_name text, p_role_title text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_whatsapp text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_org_id uuid;
  v_org_name text;
  v_org_country text;
  v_result jsonb;
  v_person_id uuid;
  v_contact_org_id uuid;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  if p_full_name is null or length(trim(p_full_name)) < 2 then
    raise exception 'Contact name is required';
  end if;

  select o.id, o.name, o.country
    into v_org_id, v_org_name, v_org_country
  from djm_os.club_needs n
  join djm_os.organisations o on o.id = n.organisation_id
  where n.id = p_need_id;

  if not found then
    raise exception 'Club need not found';
  end if;

  v_result := public.djm_network_upsert_person(
    trim(p_full_name),
    'club_contact',
    nullif(trim(coalesce(p_whatsapp, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    null,
    v_org_country,
    null,
    v_org_name,
    nullif(trim(coalesce(p_role_title, '')), ''),
    v_org_country
  );

  v_person_id := nullif(v_result->>'person_id', '')::uuid;
  v_contact_org_id := nullif(v_result->>'organisation_id', '')::uuid;

  if v_person_id is null then
    raise exception 'Contact could not be created';
  end if;

  if v_contact_org_id is distinct from v_org_id then
    raise exception 'Contact was not linked to the expected club';
  end if;

  update djm_os.club_needs
  set
    source_person_id = v_person_id,
    updated_at = now()
  where id = p_need_id;

  insert into djm_os.events(
    event_type,
    actor_user_id,
    organisation_id,
    person_id,
    payload,
    source,
    confidence,
    occurred_at
  ) values (
    'CLUB_NEED_CONTACT_LINKED',
    auth.uid(),
    v_org_id,
    v_person_id,
    jsonb_build_object(
      'club_need_id', p_need_id,
      'role_title', nullif(trim(coalesce(p_role_title, '')), '')
    ),
    'opportunity_os',
    1,
    now()
  );

  return jsonb_build_object(
    'person_id', v_person_id,
    'organisation_id', v_org_id,
    'full_name', trim(p_full_name),
    'role_title', nullif(trim(coalesce(p_role_title, '')), ''),
    'created', coalesce((v_result->>'created')::boolean, false)
  );
end
$function$


CREATE OR REPLACE FUNCTION public.djm_market_assign_need_owner(p_need_id uuid, p_owner_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_before uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_owner_user_id is not null and not exists(select 1 from djm_os.team_members where user_id=p_owner_user_id and is_active=true) then raise exception 'Active DJM team member not found'; end if;
  select owner_user_id into v_before from djm_os.club_needs where id=p_need_id;
  if not found then raise exception 'Club need not found'; end if;
  update djm_os.club_needs set owner_user_id=p_owner_user_id,updated_at=now() where id=p_need_id;
  insert into djm_os.events(event_type,actor_user_id,organisation_id,payload,source,confidence,occurred_at)
  select 'CLUB_NEED_OWNER_UPDATED',auth.uid(),n.organisation_id,jsonb_build_object('club_need_id',n.id,'previous_owner_user_id',v_before,'owner_user_id',p_owner_user_id),'manual_ui',1,now() from djm_os.club_needs n where n.id=p_need_id;
  return jsonb_build_object('need_id',p_need_id,'owner_user_id',p_owner_user_id);
end; $function$


CREATE OR REPLACE FUNCTION public.djm_market_candidates(p_need_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  return jsonb_build_object(
    'signed_players',coalesce((select jsonb_agg(to_jsonb(x) order by x.overall_score desc nulls last) from (select * from public.djm_market_matches(p_need_id)) x),'[]'::jsonb),
    'recruitment_targets',coalesce((select jsonb_agg(to_jsonb(x) order by x.match_score desc nulls last) from (select * from public.djm_scout_need_matches(p_need_id)) x),'[]'::jsonb)
  );
end $function$


CREATE OR REPLACE FUNCTION public.djm_market_candidates_v2(p_need_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  return jsonb_build_object(
    'signed_players', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.overall_score desc nulls last, x.player_name)
      from (
        select m.id as match_id, p.id as player_id,
          coalesce(nullif(p.preferred_name, ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Player') as player_name,
          p.current_club, p.current_league, p.current_country, p.primary_position as player_position,
          p.secondary_positions, p.preferred_foot, p.height_cm, p.date_of_birth,
          p.football_status, p.transfermarkt_url, p.stats_url, p.instagram_url,
          m.overall_score, m.football_score, m.commercial_score, m.registration_score,
          m.career_score, m.access_score, m.status as match_status, m.reasoning
        from djm_os.player_matches m
        join public.players p on p.id = m.player_id
        where m.club_need_id = p_need_id and m.status not in ('dismissed', 'rejected')
      ) x
    ), '[]'::jsonb),
    'recruitment_targets', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.match_score desc nulls last)
      from public.djm_scout_need_matches(p_need_id) x
    ), '[]'::jsonb)
  );
end $function$


CREATE OR REPLACE FUNCTION public.djm_market_create_need(p_organisation_id uuid, p_title text, p_position text, p_source_person_id uuid DEFAULT NULL::uuid, p_preferred_foot text DEFAULT NULL::text, p_min_age smallint DEFAULT NULL::smallint, p_max_age smallint DEFAULT NULL::smallint, p_transfer_type text DEFAULT NULL::text, p_transfer_budget numeric DEFAULT NULL::numeric, p_salary_budget numeric DEFAULT NULL::numeric, p_currency text DEFAULT NULL::text, p_salary_period text DEFAULT NULL::text, p_profile_notes text DEFAULT NULL::text, p_registration_notes text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_organisation_id is null then raise exception 'Club is required'; end if;
  if p_position is null or length(trim(p_position))<1 then raise exception 'Position is required'; end if;
  if p_min_age is not null and p_max_age is not null and p_min_age>p_max_age then raise exception 'Minimum age cannot exceed maximum age'; end if;

  insert into djm_os.club_needs(
    organisation_id,source_person_id,owner_user_id,title,position,preferred_foot,min_age,max_age,
    transfer_type,transfer_budget,salary_budget,currency,salary_period,profile_notes,registration_notes,
    status,confidence,confirmed_at,expires_at
  ) values(
    p_organisation_id,p_source_person_id,auth.uid(),coalesce(nullif(trim(p_title),''),trim(p_position)||' requirement'),
    trim(p_position),nullif(trim(p_preferred_foot),''),p_min_age,p_max_age,nullif(trim(p_transfer_type),''),
    p_transfer_budget,p_salary_budget,nullif(trim(p_currency),''),nullif(trim(p_salary_period),''),
    nullif(trim(p_profile_notes),''),nullif(trim(p_registration_notes),''),'active',1,now(),
    coalesce(p_expires_at,now()+interval '45 days')
  ) returning id into v_id;

  insert into djm_os.events(
    event_type,actor_user_id,organisation_id,person_id,payload,source,confidence,occurred_at
  ) values(
    'CLUB_NEED_CREATED',auth.uid(),p_organisation_id,p_source_person_id,
    jsonb_build_object('club_need_id',v_id,'position',trim(p_position),'title',coalesce(nullif(trim(p_title),''),trim(p_position)||' requirement')),
    'market',1,now()
  );

  return jsonb_build_object('need_id',v_id);
end
$function$


CREATE OR REPLACE FUNCTION public.djm_market_create_need_from_text(p_organisation_id uuid, p_text text, p_source_person_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_text text:=trim(coalesce(p_text,''));
  v_lower text:=lower(trim(coalesce(p_text,'')));
  v_position text;
  v_foot text;
  v_min_age smallint;
  v_max_age smallint;
  v_transfer_type text;
  v_currency text;
  v_match text[];
  v_result jsonb;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_organisation_id is null then raise exception 'Choose the club first'; end if;
  if length(v_text)<3 then raise exception 'Describe what the club needs'; end if;

  v_position:=djm_os.normalise_need_position(v_text);
  if v_position is null then raise exception 'DJM could not detect a position. Include something like RW, LCB, striker, number 6 or goalkeeper.'; end if;

  if v_lower ~ '(left[- ]?foot|left footed|left-footed)' and v_lower !~ '(right[- ]?foot|right footed|right-footed)' then v_foot:='left';
  elsif v_lower ~ '(right[- ]?foot|right footed|right-footed)' and v_lower !~ '(left[- ]?foot|left footed|left-footed)' then v_foot:='right';
  end if;

  v_match:=regexp_match(v_lower,'(?:min(?:imum)? age|age min)[^0-9]{0,5}([1-3][0-9])');
  if v_match is not null then v_min_age:=v_match[1]::smallint; end if;
  v_match:=regexp_match(v_lower,'(?:max(?:imum)? age|age max|under|u)[^0-9]{0,5}([1-3][0-9])');
  if v_match is not null then v_max_age:=v_match[1]::smallint; end if;

  if v_lower ~ '(free[^a-z0-9]+or[^a-z0-9]+(?:free[^a-z0-9]+)?loan|free/loan|free or loan)' then v_transfer_type:='free_or_loan';
  elsif v_lower ~ '\mloan\M' then v_transfer_type:='loan';
  elsif v_lower ~ '(free agent|free transfer|\mfree\M)' then v_transfer_type:='free';
  elsif v_lower ~ '(can pay transfer|transfer fee|\mtransfer\M)' then v_transfer_type:='transfer';
  end if;

  if v_lower ~ '(€|\meur\M|euro)' then v_currency:='EUR';
  elsif v_lower ~ '(£|\mgbp\M)' then v_currency:='GBP';
  elsif v_lower ~ '\maud\M' then v_currency:='AUD';
  elsif v_lower ~ '\mnzd\M' then v_currency:='NZD';
  elsif v_lower ~ '(\musd\M|\$)' then v_currency:='USD';
  end if;

  select public.djm_market_create_need(
    p_organisation_id=>p_organisation_id,
    p_title=>v_position||' requirement',
    p_position=>v_position,
    p_source_person_id=>p_source_person_id,
    p_preferred_foot=>v_foot,
    p_min_age=>v_min_age,
    p_max_age=>v_max_age,
    p_transfer_type=>v_transfer_type,
    p_currency=>v_currency,
    p_profile_notes=>v_text
  ) into v_result;

  return v_result || jsonb_build_object(
    'parsed',jsonb_build_object(
      'position',v_position,
      'preferred_foot',v_foot,
      'min_age',v_min_age,
      'max_age',v_max_age,
      'transfer_type',v_transfer_type,
      'currency',v_currency
    )
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_market_create_need_v2(p_organisation_id uuid, p_title text, p_position text, p_source_person_id uuid DEFAULT NULL::uuid, p_secondary_position text DEFAULT NULL::text, p_preferred_foot text DEFAULT NULL::text, p_min_age smallint DEFAULT NULL::smallint, p_max_age smallint DEFAULT NULL::smallint, p_min_height_cm smallint DEFAULT NULL::smallint, p_transfer_type text DEFAULT NULL::text, p_transfer_budget numeric DEFAULT NULL::numeric, p_salary_budget numeric DEFAULT NULL::numeric, p_currency text DEFAULT NULL::text, p_salary_period text DEFAULT NULL::text, p_salary_tax_basis text DEFAULT NULL::text, p_nationality_preferences text[] DEFAULT '{}'::text[], p_passport_requirements text DEFAULT NULL::text, p_foreign_player_notes text DEFAULT NULL::text, p_playing_style text DEFAULT NULL::text, p_profile_notes text DEFAULT NULL::text, p_registration_notes text DEFAULT NULL::text, p_raw_request text DEFAULT NULL::text, p_source_context text DEFAULT NULL::text, p_received_at timestamp with time zone DEFAULT now(), p_priority smallint DEFAULT 3, p_need_type text DEFAULT 'confirmed'::text, p_prediction_probability smallint DEFAULT NULL::smallint, p_prediction_basis jsonb DEFAULT '{}'::jsonb, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_need_type text := lower(trim(coalesce(p_need_type, 'confirmed')));
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if not exists(select 1 from djm_os.organisations where id = p_organisation_id and organisation_type = 'club') then raise exception 'Club is required'; end if;
  if nullif(trim(coalesce(p_position, '')), '') is null then raise exception 'Position is required'; end if;
  if p_min_age is not null and p_max_age is not null and p_min_age > p_max_age then raise exception 'Minimum age cannot exceed maximum age'; end if;
  if p_source_person_id is not null and not exists(select 1 from djm_os.people where id = p_source_person_id) then raise exception 'Source contact not found'; end if;
  if v_need_type not in ('confirmed', 'predicted') then raise exception 'Invalid need type'; end if;
  if v_need_type = 'predicted' and p_prediction_probability is null then raise exception 'Predicted needs require a likelihood'; end if;

  insert into djm_os.club_needs(
    organisation_id, source_person_id, owner_user_id, title, position, secondary_position,
    preferred_foot, min_age, max_age, min_height_cm, transfer_type, transfer_budget,
    salary_budget, currency, salary_period, salary_tax_basis, nationality_preferences,
    passport_requirements, foreign_player_notes, playing_style, profile_notes,
    registration_notes, raw_request, source_context, received_at, priority, need_type,
    prediction_probability, prediction_basis, status, confidence, confirmed_at, expires_at
  ) values (
    p_organisation_id, p_source_person_id, auth.uid(),
    coalesce(nullif(trim(p_title), ''), trim(p_position) || ' requirement'), trim(p_position),
    nullif(trim(coalesce(p_secondary_position, '')), ''), nullif(trim(coalesce(p_preferred_foot, '')), ''),
    p_min_age, p_max_age, p_min_height_cm, nullif(trim(coalesce(p_transfer_type, '')), ''),
    p_transfer_budget, p_salary_budget, nullif(trim(coalesce(p_currency, '')), ''),
    nullif(trim(coalesce(p_salary_period, '')), ''), nullif(trim(coalesce(p_salary_tax_basis, '')), ''),
    coalesce(p_nationality_preferences, '{}'), nullif(trim(coalesce(p_passport_requirements, '')), ''),
    nullif(trim(coalesce(p_foreign_player_notes, '')), ''), nullif(trim(coalesce(p_playing_style, '')), ''),
    nullif(trim(coalesce(p_profile_notes, '')), ''), nullif(trim(coalesce(p_registration_notes, '')), ''),
    nullif(trim(coalesce(p_raw_request, '')), ''), nullif(trim(coalesce(p_source_context, '')), ''),
    coalesce(p_received_at, now()), greatest(1, least(5, coalesce(p_priority, 3))), v_need_type,
    case when v_need_type = 'predicted' then p_prediction_probability else 100 end,
    coalesce(p_prediction_basis, '{}'::jsonb), 'active',
    case when v_need_type = 'confirmed' then 1 else coalesce(p_prediction_probability, 50)::numeric / 100 end,
    case when v_need_type = 'confirmed' then now() else null end,
    coalesce(p_expires_at, now() + interval '45 days')
  ) returning id into v_id;

  insert into djm_os.events(event_type, actor_user_id, organisation_id, person_id, payload, source, confidence, occurred_at)
  values(
    'CLUB_NEED_CREATED', auth.uid(), p_organisation_id, p_source_person_id,
    jsonb_build_object('club_need_id', v_id, 'need_type', v_need_type, 'position', trim(p_position), 'raw_request_preserved', p_raw_request is not null),
    'opportunity_os', case when v_need_type = 'confirmed' then 1 else coalesce(p_prediction_probability, 50)::numeric / 100 end, now()
  );

  return jsonb_build_object('need_id', v_id, 'need_type', v_need_type);
end $function$


CREATE OR REPLACE FUNCTION public.djm_market_deal_probability(p_need_id uuid, p_player_id uuid DEFAULT NULL::uuid, p_prospect_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$ declare v_fit numeric:=50;v_access numeric:=40;v_demand numeric:=60;v_timing numeric:=55;v_willing numeric:=55;v_total numeric;v_org uuid; begin
  select organisation_id,coalesce(confidence,0.6)*100 into v_org,v_demand from djm_os.club_needs where id=p_need_id;
  if p_player_id is not null then select coalesce(overall_score,50) into v_fit from djm_os.player_matches where club_need_id=p_need_id and player_id=p_player_id order by updated_at desc limit 1; select case when pmf.market_preferences is not null then 75 else 55 end into v_willing from djm_os.player_market_facts pmf where pmf.player_id=p_player_id limit 1;
  elsif p_prospect_id is not null then select coalesce(match_score,50) into v_fit from public.djm_scout_need_matches(p_need_id) where prospect_id=p_prospect_id limit 1; select case when availability_status in ('available','approachable') then 75 when availability_status='not_interested' then 20 else 50 end into v_willing from djm_os.scouting_prospects where id=p_prospect_id; end if;
  select coalesce(max(route_score),40) into v_access from public.djm_best_route_to_club(v_org);
  v_timing:=case when exists(select 1 from djm_os.club_needs n where n.id=p_need_id and n.expires_at is not null and n.expires_at < now()+interval '14 days') then 80 else 60 end;
  v_total:=round(v_fit*0.35+v_access*0.2+v_demand*0.2+v_willing*0.15+v_timing*0.1);
  return jsonb_build_object('probability',greatest(0,least(95,v_total)),'football_fit',round(v_fit),'djm_access',round(v_access),'demand_confidence',round(v_demand),'player_willingness',round(v_willing),'timing',round(v_timing),'model','heuristic_v1');
end $function$


CREATE OR REPLACE FUNCTION public.djm_market_link_need_contact(p_need_id uuid, p_person_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_org_id uuid;
  v_full_name text;
  v_role_title text;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  if p_need_id is null or p_person_id is null then
    raise exception 'Club need and contact are required';
  end if;

  select n.organisation_id
    into v_org_id
  from djm_os.club_needs n
  where n.id = p_need_id;

  if not found then
    raise exception 'Club need not found';
  end if;

  select p.full_name, e.role_title
    into v_full_name, v_role_title
  from djm_os.employments e
  join djm_os.people p on p.id = e.person_id
  where e.organisation_id = v_org_id
    and e.person_id = p_person_id
    and e.is_current = true
    and coalesce(p.person_type, 'club_contact') <> 'player'
  order by e.updated_at desc nulls last, e.created_at desc
  limit 1;

  if not found then
    raise exception 'Selected person is not a current contact at this club';
  end if;

  update djm_os.club_needs
  set
    source_person_id = p_person_id,
    updated_at = now()
  where id = p_need_id;

  insert into djm_os.events(
    event_type,
    actor_user_id,
    organisation_id,
    person_id,
    payload,
    source,
    confidence,
    occurred_at
  ) values (
    'CLUB_NEED_EXISTING_CONTACT_LINKED',
    auth.uid(),
    v_org_id,
    p_person_id,
    jsonb_build_object(
      'club_need_id', p_need_id,
      'role_title', v_role_title
    ),
    'opportunity_os',
    1,
    now()
  );

  return jsonb_build_object(
    'need_id', p_need_id,
    'person_id', p_person_id,
    'organisation_id', v_org_id,
    'full_name', v_full_name,
    'role_title', v_role_title
  );
end
$function$


CREATE OR REPLACE FUNCTION public.djm_market_matches(p_need_id uuid)
 RETURNS TABLE(match_id uuid, player_id uuid, player_name text, current_club text, player_position text, preferred_foot text, overall_score numeric, match_status text, reasoning jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select m.id,p.id,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'Player'),p.current_club,p.primary_position,p.preferred_foot,m.overall_score,m.status,m.reasoning
  from djm_os.player_matches m join public.players p on p.id=m.player_id
  where m.club_need_id=p_need_id
  order by m.overall_score desc nulls last,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'Player');
$function$


CREATE OR REPLACE FUNCTION public.djm_market_need_workspace(p_need_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  if not exists(select 1 from djm_os.club_needs n where n.id = p_need_id) then
    raise exception 'Club need not found';
  end if;

  select jsonb_build_object(
    'need', (
      select
        to_jsonb(n)
        || jsonb_build_object(
          'need_position', n.position,
          'need_status', n.status,
          'organisation_name', o.name,
          'organisation_country', o.country,
          'website_url', o.website_url,
          'source_person_name', pe.full_name,
          'source_person_role', (
            select e.role_title
            from djm_os.employments e
            where e.person_id = n.source_person_id
              and e.organisation_id = n.organisation_id
            order by e.is_current desc, e.updated_at desc
            limit 1
          ),
          'source_person_email', (
            select cm.value
            from djm_os.contact_methods cm
            where cm.person_id = n.source_person_id
              and cm.channel = 'email'
            order by cm.is_primary desc, cm.updated_at desc
            limit 1
          ),
          'source_person_whatsapp', (
            select cm.value
            from djm_os.contact_methods cm
            where cm.person_id = n.source_person_id
              and cm.channel = 'whatsapp'
            order by cm.is_primary desc, cm.updated_at desc
            limit 1
          )
        )
      from djm_os.club_needs n
      join djm_os.organisations o on o.id = n.organisation_id
      left join djm_os.people pe on pe.id = n.source_person_id
      where n.id = p_need_id
    ),
    'contacts', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.route_score desc, x.full_name)
      from (
        select
          p.id,
          p.full_name,
          e.role_title,
          e.department,
          p.country,
          p.city,
          (
            select cm.value
            from djm_os.contact_methods cm
            where cm.person_id = p.id and cm.channel = 'whatsapp'
            order by cm.is_primary desc, cm.updated_at desc
            limit 1
          ) as whatsapp,
          (
            select cm.value
            from djm_os.contact_methods cm
            where cm.person_id = p.id and cm.channel = 'email'
            order by cm.is_primary desc, cm.updated_at desc
            limit 1
          ) as email,
          coalesce((
            select max(r.strength_score)
            from djm_os.relationships r
            where r.person_id = p.id
          ), 0)::int as relationship_strength,
          coalesce((
            select max(r.access_score)
            from djm_os.relationships r
            where r.person_id = p.id
          ), 0)::int as access_score,
          coalesce((
            select max(r.strength_score + r.access_score)
            from djm_os.relationships r
            where r.person_id = p.id
          ), 0)::int as route_score,
          (
            select max(i.occurred_at)
            from djm_os.interactions i
            where i.person_id = p.id
          ) as last_interaction_at
        from djm_os.club_needs n
        join djm_os.employments e
          on e.organisation_id = n.organisation_id
         and e.is_current = true
        join djm_os.people p on p.id = e.person_id
        where n.id = p_need_id
          and coalesce(p.person_type, 'club_contact') <> 'player'
      ) x
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.is_closed, x.due_at nulls last, x.priority desc, x.created_at desc)
      from (
        select
          t.id,
          t.title,
          t.task_type,
          t.owner_user_id,
          tm.display_name as owner_name,
          t.person_id,
          p.full_name as person_name,
          t.organisation_id,
          o.name as organisation_name,
          t.club_need_id,
          t.due_at,
          t.status,
          t.priority,
          t.source,
          t.created_at,
          t.completed_at,
          t.updated_at,
          t.status in ('done', 'completed', 'cancelled') as is_closed
        from djm_os.tasks t
        left join djm_os.team_members tm on tm.user_id = t.owner_user_id
        left join djm_os.people p on p.id = t.person_id
        left join djm_os.organisations o on o.id = t.organisation_id
        where t.club_need_id = p_need_id
      ) x
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$function$


CREATE OR REPLACE FUNCTION public.djm_market_needs(p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, organisation_id uuid, organisation_name text, title text, need_position text, preferred_foot text, min_age smallint, max_age smallint, transfer_type text, transfer_budget numeric, salary_budget numeric, currency text, salary_period text, profile_notes text, registration_notes text, need_status text, confidence numeric, confirmed_at timestamp with time zone, expires_at timestamp with time zone, match_count bigint, top_match_score numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select n.id,n.organisation_id,o.name,n.title,n.position,n.preferred_foot,n.min_age,n.max_age,n.transfer_type,n.transfer_budget,n.salary_budget,n.currency,n.salary_period,n.profile_notes,n.registration_notes,n.status,n.confidence,n.confirmed_at,n.expires_at,
    (select count(*) from djm_os.player_matches m where m.club_need_id=n.id and m.status not in ('dismissed','rejected')),
    (select max(m.overall_score) from djm_os.player_matches m where m.club_need_id=n.id and m.status not in ('dismissed','rejected'))
  from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id
  where p_status is null or p_status='' or n.status=p_status
  order by case when n.status in ('active','open','confirmed') then 0 else 1 end,n.updated_at desc;
$function$


CREATE OR REPLACE FUNCTION public.djm_market_needs_v2(p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.is_live desc, x.priority desc, x.updated_at desc)
    from (
      select
        n.id,
        n.organisation_id,
        o.name as organisation_name,
        o.country as organisation_country,
        o.website_url,
        n.source_person_id,
        pe.full_name as source_person_name,
        (
          select e.role_title
          from djm_os.employments e
          where e.person_id = n.source_person_id
            and e.organisation_id = n.organisation_id
          order by e.is_current desc, e.updated_at desc
          limit 1
        ) as source_person_role,
        (
          select cm.value
          from djm_os.contact_methods cm
          where cm.person_id = n.source_person_id
            and cm.channel = 'email'
          order by cm.is_primary desc, cm.updated_at desc
          limit 1
        ) as source_person_email,
        (
          select cm.value
          from djm_os.contact_methods cm
          where cm.person_id = n.source_person_id
            and cm.channel = 'whatsapp'
          order by cm.is_primary desc, cm.updated_at desc
          limit 1
        ) as source_person_whatsapp,
        n.owner_user_id,
        tm.display_name as owner_name,
        n.title,
        n.position as need_position,
        n.secondary_position,
        n.preferred_foot,
        n.min_age,
        n.max_age,
        n.min_height_cm,
        n.transfer_type,
        n.transfer_budget,
        n.salary_budget,
        n.currency,
        n.salary_period,
        n.salary_tax_basis,
        n.nationality_preferences,
        n.passport_requirements,
        n.foreign_player_notes,
        n.playing_style,
        n.profile_notes,
        n.registration_notes,
        n.raw_request,
        n.source_context,
        n.received_at,
        n.priority,
        n.need_type,
        n.prediction_probability,
        n.prediction_basis,
        n.status as need_status,
        n.confidence,
        n.confirmed_at,
        n.expires_at,
        n.created_at,
        n.updated_at,
        n.status in ('active', 'open', 'confirmed') as is_live,
        (
          select count(*)
          from djm_os.player_matches m
          where m.club_need_id = n.id
            and m.status not in ('dismissed', 'rejected')
        ) as match_count,
        (
          select max(m.overall_score)
          from djm_os.player_matches m
          where m.club_need_id = n.id
            and m.status not in ('dismissed', 'rejected')
        ) as top_match_score,
        (
          select count(*)
          from djm_os.tasks t
          where t.club_need_id = n.id
            and t.status not in ('done', 'completed', 'cancelled')
        ) as open_task_count,
        (
          select min(t.due_at)
          from djm_os.tasks t
          where t.club_need_id = n.id
            and t.status not in ('done', 'completed', 'cancelled')
            and t.due_at is not null
        ) as next_task_due_at
      from djm_os.club_needs n
      join djm_os.organisations o on o.id = n.organisation_id
      left join djm_os.people pe on pe.id = n.source_person_id
      left join djm_os.team_members tm on tm.user_id = n.owner_user_id
      where p_status is null or p_status = '' or n.status = p_status
    ) x
  ), '[]'::jsonb);
end
$function$


CREATE OR REPLACE FUNCTION public.djm_market_needs_v3(p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_base jsonb;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  v_base := public.djm_market_needs_v2(p_status);

  return coalesce((
    select jsonb_agg(
      x.item
      || jsonb_build_object(
        'organisation_country', o.country,
        'organisation_league_name', o.league_name,
        'transfermarkt_url', o.transfermarkt_url
      )
      order by x.ordinality
    )
    from jsonb_array_elements(v_base) with ordinality as x(item, ordinality)
    left join djm_os.organisations o
      on o.id = nullif(x.item->>'organisation_id', '')::uuid
  ), '[]'::jsonb);
end
$function$


CREATE OR REPLACE FUNCTION public.djm_market_set_match_status(p_match_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_status text; v_need uuid; v_player uuid; v_org uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  v_status:=lower(trim(coalesce(p_status,'')));
  if v_status not in ('suggested','reviewing','contacted','available','presented','interested','rejected','negotiating','placed','dismissed') then raise exception 'Invalid match status'; end if;

  update djm_os.player_matches
  set status=v_status,updated_at=now()
  where id=p_match_id
  returning club_need_id,player_id into v_need,v_player;

  if not found then raise exception 'Player match not found'; end if;
  select organisation_id into v_org from djm_os.club_needs where id=v_need;

  insert into djm_os.events(event_type,actor_user_id,organisation_id,player_id,payload,source,confidence,occurred_at)
  values(
    'PLAYER_MATCH_STATUS_CHANGED',auth.uid(),v_org,v_player,
    jsonb_build_object('club_need_id',v_need,'match_id',p_match_id,'status',v_status),
    'market',1,now()
  );

  return jsonb_build_object('match_id',p_match_id,'status',v_status);
end
$function$


CREATE OR REPLACE FUNCTION public.djm_market_set_need_status(p_need_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_status text; v_org uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  v_status:=lower(trim(coalesce(p_status,'')));
  if v_status not in ('active','open','confirmed','stale','filled','closed','cancelled') then raise exception 'Invalid club need status'; end if;

  update djm_os.club_needs
  set status=v_status,updated_at=now(),
      confirmed_at=case when v_status in ('active','open','confirmed') then coalesce(confirmed_at,now()) else confirmed_at end
  where id=p_need_id
  returning organisation_id into v_org;

  if not found then raise exception 'Club need not found'; end if;

  insert into djm_os.events(event_type,actor_user_id,organisation_id,payload,source,confidence,occurred_at)
  values(
    'CLUB_NEED_STATUS_CHANGED',auth.uid(),v_org,
    jsonb_build_object('club_need_id',p_need_id,'status',v_status),
    'market',1,now()
  );

  return jsonb_build_object('need_id',p_need_id,'status',v_status);
end
$function$


CREATE OR REPLACE FUNCTION public.djm_market_update_club_identity(p_organisation_id uuid, p_league_name text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_transfermarkt_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_tm text := nullif(trim(coalesce(p_transfermarkt_url, '')), '');
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  if v_tm is not null
     and v_tm !~* '^https?://[^/]*transfermarkt\.' then
    raise exception 'Transfermarkt URL must point to a Transfermarkt domain';
  end if;

  update djm_os.organisations
  set
    league_name = nullif(trim(coalesce(p_league_name, '')), ''),
    country = coalesce(nullif(trim(coalesce(p_country, '')), ''), country),
    transfermarkt_url = v_tm,
    updated_at = now(),
    last_verified_at = now()
  where id = p_organisation_id
    and organisation_type = 'club';

  if not found then
    raise exception 'Club not found';
  end if;

  insert into djm_os.events(
    event_type,
    actor_user_id,
    organisation_id,
    payload,
    source,
    confidence,
    occurred_at
  ) values (
    'CLUB_RECRUITMENT_IDENTITY_UPDATED',
    auth.uid(),
    p_organisation_id,
    jsonb_build_object(
      'league_name', nullif(trim(coalesce(p_league_name, '')), ''),
      'country', nullif(trim(coalesce(p_country, '')), ''),
      'transfermarkt_url', v_tm
    ),
    'opportunity_os',
    1,
    now()
  );

  return jsonb_build_object(
    'organisation_id', p_organisation_id,
    'league_name', nullif(trim(coalesce(p_league_name, '')), ''),
    'country', nullif(trim(coalesce(p_country, '')), ''),
    'transfermarkt_url', v_tm
  );
end
$function$


CREATE OR REPLACE FUNCTION public.djm_market_update_need(p_need_id uuid, p_title text, p_position text, p_preferred_foot text DEFAULT NULL::text, p_min_age smallint DEFAULT NULL::smallint, p_max_age smallint DEFAULT NULL::smallint, p_transfer_type text DEFAULT NULL::text, p_transfer_budget numeric DEFAULT NULL::numeric, p_salary_budget numeric DEFAULT NULL::numeric, p_currency text DEFAULT NULL::text, p_salary_period text DEFAULT NULL::text, p_profile_notes text DEFAULT NULL::text, p_registration_notes text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if not exists(select 1 from djm_os.club_needs where id=p_need_id) then raise exception 'Club need not found'; end if;
  if p_position is null or length(trim(p_position))<1 then raise exception 'Position is required'; end if;
  if p_min_age is not null and p_max_age is not null and p_min_age>p_max_age then raise exception 'Minimum age cannot exceed maximum age'; end if;

  update djm_os.club_needs
  set title=coalesce(nullif(trim(p_title),''),trim(p_position)||' requirement'),
      position=trim(p_position),
      preferred_foot=nullif(trim(coalesce(p_preferred_foot,'')),''),
      min_age=p_min_age,
      max_age=p_max_age,
      transfer_type=nullif(trim(coalesce(p_transfer_type,'')),''),
      transfer_budget=p_transfer_budget,
      salary_budget=p_salary_budget,
      currency=nullif(trim(coalesce(p_currency,'')),''),
      salary_period=nullif(trim(coalesce(p_salary_period,'')),''),
      profile_notes=nullif(trim(coalesce(p_profile_notes,'')),''),
      registration_notes=nullif(trim(coalesce(p_registration_notes,'')),''),
      expires_at=coalesce(p_expires_at,expires_at),
      updated_at=now()
  where id=p_need_id;

  insert into djm_os.events(event_type,actor_user_id,organisation_id,payload,source,confidence,occurred_at)
  select 'CLUB_NEED_UPDATED',auth.uid(),organisation_id,jsonb_build_object('club_need_id',id,'position',position,'title',title),'market',1,now()
  from djm_os.club_needs where id=p_need_id;

  return jsonb_build_object('need_id',p_need_id,'updated',true);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_market_update_need_v2(p_need_id uuid, p_organisation_id uuid, p_title text, p_position text, p_source_person_id uuid DEFAULT NULL::uuid, p_secondary_position text DEFAULT NULL::text, p_preferred_foot text DEFAULT NULL::text, p_min_age smallint DEFAULT NULL::smallint, p_max_age smallint DEFAULT NULL::smallint, p_min_height_cm smallint DEFAULT NULL::smallint, p_transfer_type text DEFAULT NULL::text, p_transfer_budget numeric DEFAULT NULL::numeric, p_salary_budget numeric DEFAULT NULL::numeric, p_currency text DEFAULT NULL::text, p_salary_period text DEFAULT NULL::text, p_salary_tax_basis text DEFAULT NULL::text, p_nationality_preferences text[] DEFAULT '{}'::text[], p_passport_requirements text DEFAULT NULL::text, p_foreign_player_notes text DEFAULT NULL::text, p_playing_style text DEFAULT NULL::text, p_profile_notes text DEFAULT NULL::text, p_registration_notes text DEFAULT NULL::text, p_raw_request text DEFAULT NULL::text, p_source_context text DEFAULT NULL::text, p_received_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_priority smallint DEFAULT 3, p_need_type text DEFAULT 'confirmed'::text, p_prediction_probability smallint DEFAULT NULL::smallint, p_prediction_basis jsonb DEFAULT '{}'::jsonb, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_need_type text := lower(trim(coalesce(p_need_type, 'confirmed')));
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  select to_jsonb(n) into v_before from djm_os.club_needs n where n.id = p_need_id;
  if v_before is null then raise exception 'Club need not found'; end if;
  if not exists(select 1 from djm_os.organisations where id = p_organisation_id and organisation_type = 'club') then raise exception 'Club is required'; end if;
  if nullif(trim(coalesce(p_position, '')), '') is null then raise exception 'Position is required'; end if;
  if p_min_age is not null and p_max_age is not null and p_min_age > p_max_age then raise exception 'Minimum age cannot exceed maximum age'; end if;
  if p_source_person_id is not null and not exists(select 1 from djm_os.people where id = p_source_person_id) then raise exception 'Source contact not found'; end if;
  if v_need_type not in ('confirmed', 'predicted') then raise exception 'Invalid need type'; end if;

  update djm_os.club_needs set
    organisation_id = p_organisation_id,
    source_person_id = p_source_person_id,
    title = coalesce(nullif(trim(p_title), ''), trim(p_position) || ' requirement'),
    position = trim(p_position),
    secondary_position = nullif(trim(coalesce(p_secondary_position, '')), ''),
    preferred_foot = nullif(trim(coalesce(p_preferred_foot, '')), ''),
    min_age = p_min_age,
    max_age = p_max_age,
    min_height_cm = p_min_height_cm,
    transfer_type = nullif(trim(coalesce(p_transfer_type, '')), ''),
    transfer_budget = p_transfer_budget,
    salary_budget = p_salary_budget,
    currency = nullif(trim(coalesce(p_currency, '')), ''),
    salary_period = nullif(trim(coalesce(p_salary_period, '')), ''),
    salary_tax_basis = nullif(trim(coalesce(p_salary_tax_basis, '')), ''),
    nationality_preferences = coalesce(p_nationality_preferences, '{}'),
    passport_requirements = nullif(trim(coalesce(p_passport_requirements, '')), ''),
    foreign_player_notes = nullif(trim(coalesce(p_foreign_player_notes, '')), ''),
    playing_style = nullif(trim(coalesce(p_playing_style, '')), ''),
    profile_notes = nullif(trim(coalesce(p_profile_notes, '')), ''),
    registration_notes = nullif(trim(coalesce(p_registration_notes, '')), ''),
    raw_request = nullif(trim(coalesce(p_raw_request, '')), ''),
    source_context = nullif(trim(coalesce(p_source_context, '')), ''),
    received_at = coalesce(p_received_at, received_at),
    priority = greatest(1, least(5, coalesce(p_priority, 3))),
    need_type = v_need_type,
    prediction_probability = case when v_need_type = 'confirmed' then 100 else p_prediction_probability end,
    prediction_basis = coalesce(p_prediction_basis, '{}'::jsonb),
    confidence = case when v_need_type = 'confirmed' then 1 else coalesce(p_prediction_probability, 50)::numeric / 100 end,
    confirmed_at = case when v_need_type = 'confirmed' then coalesce(confirmed_at, now()) else null end,
    expires_at = p_expires_at,
    updated_at = now()
  where id = p_need_id;

  select to_jsonb(n) into v_after from djm_os.club_needs n where n.id = p_need_id;
  insert into djm_os.events(event_type, actor_user_id, organisation_id, person_id, payload, source, confidence, occurred_at)
  values(
    'CLUB_NEED_UPDATED', auth.uid(), p_organisation_id, p_source_person_id,
    jsonb_build_object('club_need_id', p_need_id, 'before', v_before, 'after', v_after),
    'opportunity_os', 1, now()
  );

  return jsonb_build_object('need_id', p_need_id, 'updated', true);
end $function$


CREATE OR REPLACE FUNCTION public.djm_market_upsert_need_task(p_need_id uuid, p_title text, p_task_id uuid DEFAULT NULL::uuid, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_person_id uuid DEFAULT NULL::uuid, p_priority smallint DEFAULT 3, p_status text DEFAULT 'open'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_task_id uuid;
  v_org_id uuid;
  v_source_person_id uuid;
  v_person_id uuid;
  v_status text;
  v_existing_owner uuid;
  v_existing_need uuid;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  if p_title is null or length(trim(p_title)) < 2 then
    raise exception 'Task title is required';
  end if;

  if p_priority is null or p_priority < 1 or p_priority > 5 then
    raise exception 'Priority must be between 1 and 5';
  end if;

  v_status := lower(trim(coalesce(p_status, 'open')));
  if v_status not in ('open', 'in_progress', 'snoozed', 'done', 'completed', 'cancelled') then
    raise exception 'Invalid task status';
  end if;

  select n.organisation_id, n.source_person_id
    into v_org_id, v_source_person_id
  from djm_os.club_needs n
  where n.id = p_need_id;

  if not found then
    raise exception 'Club need not found';
  end if;

  v_person_id := coalesce(p_person_id, v_source_person_id);

  if v_person_id is not null
     and v_person_id is distinct from v_source_person_id
     and not exists(
       select 1
       from djm_os.employments e
       where e.person_id = v_person_id
         and e.organisation_id = v_org_id
         and e.is_current = true
     ) then
    raise exception 'Task contact must be linked to this club';
  end if;

  if p_task_id is null then
    insert into djm_os.tasks(
      title,
      task_type,
      owner_user_id,
      person_id,
      organisation_id,
      club_need_id,
      due_at,
      status,
      priority,
      source,
      completed_at
    ) values (
      trim(p_title),
      'club_need_followup',
      auth.uid(),
      v_person_id,
      v_org_id,
      p_need_id,
      p_due_at,
      v_status,
      p_priority,
      'opportunity_os',
      case when v_status in ('done', 'completed') then now() else null end
    ) returning id into v_task_id;
  else
    select t.owner_user_id, t.club_need_id
      into v_existing_owner, v_existing_need
    from djm_os.tasks t
    where t.id = p_task_id;

    if not found then
      raise exception 'Task not found';
    end if;

    if v_existing_need is distinct from p_need_id then
      raise exception 'Task does not belong to this club need';
    end if;

    if v_existing_owner is not null and v_existing_owner <> auth.uid() then
      raise exception 'Only the task owner can edit this task';
    end if;

    update djm_os.tasks
    set
      title = trim(p_title),
      task_type = 'club_need_followup',
      owner_user_id = coalesce(v_existing_owner, auth.uid()),
      person_id = v_person_id,
      organisation_id = v_org_id,
      club_need_id = p_need_id,
      due_at = p_due_at,
      status = v_status,
      priority = p_priority,
      source = 'opportunity_os',
      completed_at = case when v_status in ('done', 'completed') then coalesce(completed_at, now()) else null end,
      updated_at = now()
    where id = p_task_id
    returning id into v_task_id;
  end if;

  insert into djm_os.events(
    event_type,
    actor_user_id,
    organisation_id,
    person_id,
    payload,
    source,
    confidence,
    occurred_at
  ) values (
    case when p_task_id is null then 'CLUB_NEED_TASK_CREATED' else 'CLUB_NEED_TASK_UPDATED' end,
    auth.uid(),
    v_org_id,
    v_person_id,
    jsonb_build_object(
      'task_id', v_task_id,
      'club_need_id', p_need_id,
      'due_at', p_due_at,
      'status', v_status,
      'priority', p_priority
    ),
    'opportunity_os',
    1,
    now()
  );

  return jsonb_build_object(
    'task_id', v_task_id,
    'club_need_id', p_need_id,
    'status', v_status
  );
end
$function$


CREATE OR REPLACE FUNCTION public.djm_merge_people(p_keep_id uuid, p_merge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare r record; v_keep text; v_merge text; begin
 if p_keep_id=p_merge_id then raise exception 'Cannot merge same person'; end if;
 select full_name into v_keep from djm_os.people where id=p_keep_id; select full_name into v_merge from djm_os.people where id=p_merge_id;
 if v_keep is null or v_merge is null then raise exception 'Person not found'; end if;
 if not djm_os.is_team_member() then raise exception 'Not authorised'; end if;

 insert into djm_os.contact_methods(person_id,channel,value,normalised_value,is_primary,is_verified,last_verified_at)
 select p_keep_id,c.channel,c.value,c.normalised_value,false,c.is_verified,c.last_verified_at from djm_os.contact_methods c where c.person_id=p_merge_id
 on conflict(channel,normalised_value) where normalised_value is not null do nothing;
 delete from djm_os.contact_methods where person_id=p_merge_id;

 update djm_os.employments set person_id=p_keep_id where person_id=p_merge_id and not exists(select 1 from djm_os.employments e2 where e2.person_id=p_keep_id and e2.organisation_id=djm_os.employments.organisation_id and e2.is_current=djm_os.employments.is_current);
 delete from djm_os.employments where person_id=p_merge_id;

 for r in select * from djm_os.relationships where person_id=p_merge_id loop
   insert into djm_os.relationships(team_member_id,person_id,strength_score,access_score,trust_score,last_meaningful_at,first_known_at,relationship_notes)
   values(r.team_member_id,p_keep_id,r.strength_score,r.access_score,r.trust_score,r.last_meaningful_at,r.first_known_at,r.relationship_notes)
   on conflict(team_member_id,person_id) do update set strength_score=greatest(coalesce(djm_os.relationships.strength_score,0),coalesce(excluded.strength_score,0)),access_score=greatest(coalesce(djm_os.relationships.access_score,0),coalesce(excluded.access_score,0)),trust_score=greatest(coalesce(djm_os.relationships.trust_score,0),coalesce(excluded.trust_score,0)),last_meaningful_at=greatest(coalesce(djm_os.relationships.last_meaningful_at,excluded.last_meaningful_at),excluded.last_meaningful_at),first_known_at=least(coalesce(djm_os.relationships.first_known_at,excluded.first_known_at),excluded.first_known_at),relationship_notes=concat_ws(E'\n',djm_os.relationships.relationship_notes,excluded.relationship_notes),updated_at=now();
 end loop;
 delete from djm_os.relationships where person_id=p_merge_id;

 update djm_os.interactions set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.claims set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.club_needs set source_person_id=p_keep_id where source_person_id=p_merge_id;
 update djm_os.tasks set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.events set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.captures set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.suggestions set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.meetings set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.booking_requests set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.review_items set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.conversation_threads set person_id=p_keep_id where person_id=p_merge_id;
 update djm_os.change_observations set entity_id=p_keep_id where entity_type='person' and entity_id=p_merge_id;
 update djm_os.relationship_snapshots set person_id=p_keep_id where person_id=p_merge_id and not exists(select 1 from djm_os.relationship_snapshots s where s.person_id=p_keep_id and s.team_member_id=djm_os.relationship_snapshots.team_member_id and s.calculated_at=djm_os.relationship_snapshots.calculated_at);
 delete from djm_os.relationship_snapshots where person_id=p_merge_id;

 insert into djm_os.events(event_type,actor_user_id,person_id,payload,source,confidence,occurred_at) values('CONTACT_MERGED',auth.uid(),p_keep_id,jsonb_build_object('kept_id',p_keep_id,'merged_id',p_merge_id,'kept_name',v_keep,'merged_name',v_merge),'network',1,now());
 delete from djm_os.people where id=p_merge_id;
 update djm_os.merge_candidates set status='merged',resolved_at=now(),resolved_by=auth.uid() where entity_type='person' and ((left_id=p_keep_id and right_id=p_merge_id) or (left_id=p_merge_id and right_id=p_keep_id));
 return jsonb_build_object('kept_id',p_keep_id,'merged_id',p_merge_id,'kept_name',v_keep,'merged_name',v_merge);
end; $function$


CREATE OR REPLACE FUNCTION public.djm_my_identity()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
select jsonb_build_object('user_id',tm.user_id,'display_name',tm.display_name,'timezone',tm.timezone,'whatsapp_export_names',tm.whatsapp_export_names,'role_title',tm.role_title)
from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active
$function$


CREATE OR REPLACE FUNCTION public.djm_network_activity(p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, event_type text, actor_user_id uuid, actor_name text, person_id uuid, person_name text, organisation_id uuid, organisation_name text, player_id uuid, interaction_id uuid, payload jsonb, source text, confidence numeric, occurred_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select e.id,e.event_type,e.actor_user_id,tm.display_name,e.person_id,p.full_name,e.organisation_id,o.name,
         e.player_id,e.interaction_id,e.payload,e.source,e.confidence,e.occurred_at
  from djm_os.events e
  left join djm_os.team_members tm on tm.user_id=e.actor_user_id
  left join djm_os.people p on p.id=e.person_id
  left join djm_os.organisations o on o.id=e.organisation_id
  order by e.occurred_at desc
  limit greatest(1,least(coalesce(p_limit,50),250));
$function$


CREATE OR REPLACE FUNCTION public.djm_network_booking_profiles()
 RETURNS TABLE(user_id uuid, display_name text, slug text, is_enabled boolean, default_duration_minutes smallint, minimum_notice_hours smallint, buffer_minutes smallint, timezone text, availability jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select b.user_id,t.display_name,b.slug,b.is_enabled,b.default_duration_minutes,b.minimum_notice_hours,b.buffer_minutes,b.timezone,b.availability
  from djm_os.booking_profiles b join djm_os.team_members t on t.user_id=b.user_id order by t.display_name;
$function$


CREATE OR REPLACE FUNCTION public.djm_network_capture_asset(p_storage_path text, p_capture_type text, p_channel text DEFAULT 'whatsapp'::text, p_person_id uuid DEFAULT NULL::uuid, p_organisation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_capture_id uuid;begin
  if p_storage_path is null or length(trim(p_storage_path)) < 2 then raise exception 'Storage path is required'; end if;
  if p_capture_type not in ('image','audio','document','video') then raise exception 'Unsupported capture type'; end if;
  insert into djm_os.captures(submitted_by,channel,capture_type,source_uri,person_id,organisation_id,status,confidence,error_message)
  values(auth.uid(),coalesce(nullif(trim(p_channel),''),'whatsapp'),p_capture_type,trim(p_storage_path),p_person_id,p_organisation_id,'needs_review',null,'Automatic asset extraction is not configured yet. Review the source or add a text note for instant structured processing.')
  returning id into v_capture_id;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at)
  values('CAPTURE_NEEDS_REVIEW',auth.uid(),p_person_id,p_organisation_id,jsonb_build_object('capture_id',v_capture_id,'capture_type',p_capture_type,'storage_path',trim(p_storage_path)),'djm_capture',1,now());
  return jsonb_build_object('capture_id',v_capture_id,'status','needs_review');
end $function$


CREATE OR REPLACE FUNCTION public.djm_network_capture_smart(p_text text, p_channel text DEFAULT 'whatsapp'::text, p_person_id uuid DEFAULT NULL::uuid, p_organisation_id uuid DEFAULT NULL::uuid, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_person_id uuid:=p_person_id;
  v_org_id uuid:=p_organisation_id;
  v_person_name text;
  v_org_name text;
  v_resolution text:='manual';
  v_result jsonb;
  v_clean_text text:=lower(regexp_replace(coalesce(p_text,''),'[^a-zA-Z0-9]+',' ','g'));
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_text is null or length(trim(p_text))<2 then raise exception 'Capture text is required'; end if;

  if v_person_id is null then
    select p.id,p.full_name into v_person_id,v_person_name
    from djm_os.people p
    where length(trim(p.full_name))>=4
      and position(lower(trim(p.full_name)) in lower(p_text))>0
    order by length(trim(p.full_name)) desc,p.updated_at desc
    limit 1;
    if v_person_id is not null then v_resolution:='full_name'; end if;
  end if;

  if v_person_id is null then
    with candidate as (
      select p.id,p.full_name,p.preferred_name
      from djm_os.people p
      where length(trim(coalesce(p.preferred_name,'')))>=4
        and position(' '||lower(trim(p.preferred_name))||' ' in ' '||v_clean_text||' ')>0
    ), unique_candidate as (
      select * from candidate where (select count(*) from candidate)=1
    )
    select id,full_name into v_person_id,v_person_name from unique_candidate limit 1;
    if v_person_id is not null then v_resolution:='unique_preferred_name'; end if;
  end if;

  if v_person_id is not null and v_org_id is null then
    select e.organisation_id,o.name into v_org_id,v_org_name
    from djm_os.employments e
    join djm_os.organisations o on o.id=e.organisation_id
    where e.person_id=v_person_id and e.is_current=true
    order by e.last_verified_at desc nulls last,e.updated_at desc
    limit 1;
  end if;

  if v_org_id is null then
    select o.id,o.name into v_org_id,v_org_name
    from djm_os.organisations o
    where o.organisation_type='club'
      and length(trim(o.name))>=3
      and position(lower(trim(o.name)) in lower(p_text))>0
    order by length(trim(o.name)) desc,o.updated_at desc
    limit 1;
    if v_org_id is not null and v_resolution='manual' then v_resolution:='club_name'; end if;
  end if;

  if v_person_id is not null and v_person_name is null then select full_name into v_person_name from djm_os.people where id=v_person_id; end if;
  if v_org_id is not null and v_org_name is null then select name into v_org_name from djm_os.organisations where id=v_org_id; end if;

  select public.djm_network_capture_text(
    p_text,
    coalesce(nullif(trim(p_channel),''),'whatsapp'),
    v_person_id,
    v_org_id,
    coalesce(p_occurred_at,now())
  ) into v_result;

  return v_result || jsonb_build_object(
    'resolved_person_id',v_person_id,
    'resolved_person_name',v_person_name,
    'resolved_organisation_id',v_org_id,
    'resolved_organisation_name',v_org_name,
    'resolution',v_resolution
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_network_capture_text(p_text text, p_channel text DEFAULT 'whatsapp'::text, p_person_id uuid DEFAULT NULL::uuid, p_organisation_id uuid DEFAULT NULL::uuid, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_capture_id uuid; v_interaction_id uuid; v_summary text; v_task_id uuid; v_position text; v_needs_review boolean := false;
begin
  if p_text is null or length(trim(p_text)) < 2 then raise exception 'Capture text is required'; end if;
  v_summary := left(regexp_replace(trim(p_text), '\s+', ' ', 'g'), 240);
  insert into djm_os.captures(submitted_by, channel, capture_type, raw_text, person_id, organisation_id, status)
  values(auth.uid(), coalesce(nullif(trim(p_channel),''),'whatsapp'), 'text', trim(p_text), p_person_id, p_organisation_id, 'processing')
  returning id into v_capture_id;
  insert into djm_os.interactions(occurred_at, channel, direction, team_member_id, person_id, organisation_id, source_external_id, source_type, raw_text, summary, confidence)
  values(coalesce(p_occurred_at,now()), coalesce(nullif(trim(p_channel),''),'whatsapp'), 'captured', auth.uid(), p_person_id, p_organisation_id, v_capture_id::text, 'djm_capture', trim(p_text), v_summary, 1)
  returning id into v_interaction_id;
  if p_person_id is not null then
    insert into djm_os.relationships(team_member_id, person_id, last_meaningful_at, first_known_at, strength_score)
    values(auth.uid(), p_person_id, coalesce(p_occurred_at,now()), coalesce(p_occurred_at,now()), 35)
    on conflict (team_member_id, person_id) do update set
      last_meaningful_at = greatest(coalesce(djm_os.relationships.last_meaningful_at, excluded.last_meaningful_at), excluded.last_meaningful_at),
      strength_score = greatest(coalesce(djm_os.relationships.strength_score,0), 35), updated_at = now();
  end if;
  if p_text ~* '\m(i.ll|i will|we.ll|we will|send|follow up|call|speak|revert|get back|come back)\M' then
    insert into djm_os.tasks(title, task_type, owner_user_id, person_id, organisation_id, interaction_id, status, priority, source)
    values(case when p_text ~* '\msend\M' then 'Follow through on promised send' when p_text ~* '\mcall\M|\mspeak\M' then 'Follow up on promised call' else 'Follow up on conversation commitment' end,
      'commitment', auth.uid(), p_person_id, p_organisation_id, v_interaction_id, 'open', 5, 'auto_capture') returning id into v_task_id;
  end if;
  v_position := case
    when p_text ~* '\m(left[- ]?back|lb)\M' then 'LB'
    when p_text ~* '\m(right[- ]?back|rb)\M' then 'RB'
    when p_text ~* '\m(left[- ]?foot(ed)? (centre|center)[- ]?back|lcb)\M' then 'LCB'
    when p_text ~* '\m(centre|center)[- ]?back|\mcb\M' then 'CB'
    when p_text ~* '\mdefensive midfielder|number 6|no\.? ?6\M' then '6'
    when p_text ~* '\m(number 8|no\.? ?8|central midfielder|cm)\M' then '8'
    when p_text ~* '\m(number 10|no\.? ?10|attacking midfielder|am)\M' then '10'
    when p_text ~* '\mright winger|rw\M' then 'RW'
    when p_text ~* '\mleft winger|lw\M' then 'LW'
    when p_text ~* '\mwinger\M' then 'Winger'
    when p_text ~* '\mstriker|centre forward|center forward|cf\M' then 'ST'
    when p_text ~* '\mgoalkeeper|keeper|gk\M' then 'GK'
    else null end;
  if p_organisation_id is not null and v_position is not null and p_text ~* '\m(need|looking|searching|want|require|after)\M' then
    insert into djm_os.club_needs(organisation_id, source_person_id, owner_user_id, source_interaction_id, title, position, profile_notes, status, confidence, confirmed_at, expires_at)
    values(p_organisation_id, p_person_id, auth.uid(), v_interaction_id, v_position || ' requirement', v_position, left(trim(p_text),1000), 'active', 0.72, coalesce(p_occurred_at,now()), coalesce(p_occurred_at,now()) + interval '45 days');
  elsif v_position is not null and p_text ~* '\m(need|looking|searching|want|require|after)\M' then v_needs_review := true; end if;
  insert into djm_os.events(event_type, actor_user_id, person_id, organisation_id, interaction_id, payload, source, confidence, occurred_at)
  values('CAPTURE_PROCESSED', auth.uid(), p_person_id, p_organisation_id, v_interaction_id,
    jsonb_build_object('capture_id',v_capture_id,'channel',coalesce(nullif(trim(p_channel),''),'whatsapp'),'task_created',v_task_id is not null,'position_detected',v_position,'needs_review',v_needs_review),
    'djm_capture', 1, coalesce(p_occurred_at,now()));
  update djm_os.captures set status = case when v_needs_review then 'needs_review' else 'processed' end,
    extracted_json = jsonb_build_object('interaction_id',v_interaction_id,'task_id',v_task_id,'position',v_position,'needs_review',v_needs_review),
    confidence = case when v_needs_review then 0.72 else 1 end, processed_at = now() where id=v_capture_id;
  return jsonb_build_object('capture_id',v_capture_id,'interaction_id',v_interaction_id,'task_id',v_task_id,'position',v_position,'needs_review',v_needs_review);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_network_club(p_organisation_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select jsonb_build_object(
  'organisation',(select to_jsonb(o) from (select id,name,organisation_type,country,city,website_url,last_verified_at,created_at,updated_at from djm_os.organisations where id=p_organisation_id) o),
  'people',coalesce((select jsonb_agg(to_jsonb(x) order by x.full_name) from (
    select p.id,p.full_name,e.role_title,e.department,e.started_on,e.last_verified_at,
           (select max(r.strength_score) from djm_os.relationships r where r.person_id=p.id) as best_relationship_score
    from djm_os.employments e join djm_os.people p on p.id=e.person_id
    where e.organisation_id=p_organisation_id and e.is_current=true
  ) x),'[]'::jsonb),
  'needs',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
    select n.id,n.title,n.position,n.preferred_foot,n.min_age,n.max_age,n.transfer_type,n.transfer_budget,n.salary_budget,n.currency,n.status,n.confidence,n.confirmed_at,n.expires_at,n.updated_at,
      (select count(*) from djm_os.player_matches m where m.club_need_id=n.id and m.status not in ('dismissed','rejected')) as match_count
    from djm_os.club_needs n where n.organisation_id=p_organisation_id
  ) x),'[]'::jsonb),
  'interactions',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (
    select i.id,i.occurred_at,i.channel,i.summary,i.person_id,p.full_name as person_name,tm.display_name as team_member_name
    from djm_os.interactions i
    left join djm_os.people p on p.id=i.person_id
    left join djm_os.team_members tm on tm.user_id=i.team_member_id
    where i.organisation_id=p_organisation_id order by i.occurred_at desc limit 40
  ) x),'[]'::jsonb)
);
$function$


CREATE OR REPLACE FUNCTION public.djm_network_club_contacts(p_search text DEFAULT NULL::text, p_limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, full_name text, country text, city text, current_organisation text, role_title text, relationship_score smallint, last_meaningful_at timestamp with time zone, last_interaction_at timestamp with time zone, whatsapp text, email text, linkedin_url text)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select
    p.id,
    p.full_name,
    p.country,
    p.city,
    o.name as current_organisation,
    e.role_title,
    coalesce(r.strength_score,0)::smallint,
    r.last_meaningful_at,
    (select max(i.occurred_at) from djm_os.interactions i where i.person_id=p.id) as last_interaction_at,
    (select cm.value from djm_os.contact_methods cm where cm.person_id=p.id and cm.channel='whatsapp' order by cm.is_primary desc, cm.updated_at desc limit 1) as whatsapp,
    (select cm.value from djm_os.contact_methods cm where cm.person_id=p.id and cm.channel='email' order by cm.is_primary desc, cm.updated_at desc limit 1) as email,
    p.linkedin_url
  from djm_os.people p
  left join djm_os.employments e on e.person_id=p.id and e.is_current=true
  left join djm_os.organisations o on o.id=e.organisation_id
  left join djm_os.relationships r on r.person_id=p.id and r.team_member_id=(select auth.uid())
  where p.person_type in ('club_contact','coach','sporting_director','recruitment','club_executive','scout','intermediary','agent','football_contact')
    and (p_search is null or p_search='' or concat_ws(' ',p.full_name,o.name,e.role_title,p.country,p.city) ilike '%'||p_search||'%')
  order by coalesce(r.strength_score,0) desc, p.full_name
  limit greatest(1,least(coalesce(p_limit,200),500));
$function$


CREATE OR REPLACE FUNCTION public.djm_network_club_coverage()
 RETURNS TABLE(organisation_id uuid, organisation_name text, country text, current_contacts bigint, strong_contacts bigint, last_interaction_at timestamp with time zone, active_needs bigint, open_opportunities bigint, coverage_score smallint, coverage_label text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with base as (
  select o.id,o.name,o.country,
    (select count(distinct e.person_id) from djm_os.employments e where e.organisation_id=o.id and e.is_current=true) as current_contacts,
    (select count(distinct e.person_id) from djm_os.employments e join djm_os.relationships r on r.person_id=e.person_id where e.organisation_id=o.id and e.is_current=true and r.strength_score>=60) as strong_contacts,
    (select max(i.occurred_at) from djm_os.interactions i where i.organisation_id=o.id) as last_interaction_at,
    (select count(*) from djm_os.club_needs n where n.organisation_id=o.id and n.status in ('active','open','confirmed')) as active_needs,
    (select count(*) from djm_os.opportunity_links l join public.player_opportunities po on po.id=l.opportunity_id where l.organisation_id=o.id and lower(po.stage) not in ('closed','lost','placed','won')) as open_opportunities
  from djm_os.organisations o
  where o.organisation_type='club'
), scored as (
  select b.*,
    least(100,
      least(40,b.current_contacts*15)
      +least(30,b.strong_contacts*15)
      +case when b.last_interaction_at>now()-interval '30 days' then 20 when b.last_interaction_at>now()-interval '90 days' then 10 else 0 end
      +case when b.active_needs>0 then 10 else 0 end
    )::smallint as score
  from base b
)
select s.id,s.name,s.country,s.current_contacts,s.strong_contacts,s.last_interaction_at,s.active_needs,s.open_opportunities,s.score,
  case when s.score>=75 then 'Strong' when s.score>=45 then 'Developing' else 'Thin' end
from scored s
order by s.score desc,s.name;
$function$


CREATE OR REPLACE FUNCTION public.djm_network_club_workspace(p_organisation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v jsonb;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  select jsonb_build_object(
    'organisation',(select to_jsonb(x) from (select o.id,o.name,o.organisation_type,o.country,o.city,o.website_url,o.last_verified_at,o.created_at,o.updated_at from djm_os.organisations o where o.id=p_organisation_id) x),
    'contacts',coalesce((select jsonb_agg(to_jsonb(x) order by x.route_score desc,x.full_name) from (
      select p.id,p.full_name,e.role_title,e.department,p.country,p.city,
        (select cm.value from djm_os.contact_methods cm where cm.person_id=p.id and cm.channel='whatsapp' order by cm.is_primary desc,cm.updated_at desc limit 1) as whatsapp,
        (select cm.value from djm_os.contact_methods cm where cm.person_id=p.id and cm.channel='email' order by cm.is_primary desc,cm.updated_at desc limit 1) as email,
        coalesce((select max(r.strength_score) from djm_os.relationships r where r.person_id=p.id),0)::int as relationship_strength,
        coalesce((select max(r.access_score) from djm_os.relationships r where r.person_id=p.id),0)::int as access_score,
        coalesce((select max(r.strength_score+r.access_score) from djm_os.relationships r where r.person_id=p.id),0)::int as route_score,
        (select tm.display_name from djm_os.relationships r join djm_os.team_members tm on tm.user_id=r.team_member_id where r.person_id=p.id order by (r.strength_score+r.access_score) desc,r.last_meaningful_at desc nulls last limit 1) as best_owner,
        (select max(i.occurred_at) from djm_os.interactions i where i.person_id=p.id) as last_interaction_at
      from djm_os.employments e join djm_os.people p on p.id=e.person_id
      where e.organisation_id=p_organisation_id and e.is_current=true and coalesce(p.person_type,'club_contact')<>'player'
    ) x),'[]'::jsonb),
    'needs',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
      select n.id,n.title,n.position,n.preferred_foot,n.min_age,n.max_age,n.transfer_type,n.transfer_budget,n.salary_budget,n.currency,n.status,n.confidence,n.confirmed_at,n.expires_at,n.updated_at,
        (select count(*) from djm_os.player_matches m where m.club_need_id=n.id and m.status not in ('dismissed','rejected')) as match_count,
        (select max(m.overall_score) from djm_os.player_matches m where m.club_need_id=n.id and m.status not in ('dismissed','rejected')) as top_match_score
      from djm_os.club_needs n where n.organisation_id=p_organisation_id
    ) x),'[]'::jsonb),
    'open_tasks',coalesce((select jsonb_agg(to_jsonb(x) order by x.due_at nulls last) from (
      select t.id,t.title,t.due_at,t.priority,t.status,t.owner_user_id,tm.display_name as owner_name,t.person_id,p.full_name as person_name
      from djm_os.tasks t left join djm_os.team_members tm on tm.user_id=t.owner_user_id left join djm_os.people p on p.id=t.person_id
      where t.organisation_id=p_organisation_id and t.status not in ('completed','cancelled')
    ) x),'[]'::jsonb),
    'timeline',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (
      select i.id,'interaction'::text as item_type,i.occurred_at,i.channel as subtype,i.summary,i.person_id,p.full_name as person_name,tm.display_name as team_member_name
      from djm_os.interactions i left join djm_os.people p on p.id=i.person_id left join djm_os.team_members tm on tm.user_id=i.team_member_id
      where i.organisation_id=p_organisation_id
      union all
      select e.id,'event'::text,e.occurred_at,e.event_type,coalesce(e.payload->>'summary',replace(lower(e.event_type),'_',' ')),e.person_id,p.full_name,tm.display_name
      from djm_os.events e left join djm_os.people p on p.id=e.person_id left join djm_os.team_members tm on tm.user_id=e.actor_user_id
      where e.organisation_id=p_organisation_id
      order by occurred_at desc limit 100
    ) x),'[]'::jsonb),
    'best_routes',coalesce((select jsonb_agg(to_jsonb(x) order by x.route_score desc) from (select * from public.djm_best_route_to_club(p_organisation_id) limit 8) x),'[]'::jsonb),
    'summary',jsonb_build_object(
      'contact_count',(select count(*) from djm_os.employments e join djm_os.people p on p.id=e.person_id where e.organisation_id=p_organisation_id and e.is_current=true and coalesce(p.person_type,'club_contact')<>'player'),
      'active_need_count',(select count(*) from djm_os.club_needs n where n.organisation_id=p_organisation_id and n.status in ('active','open','confirmed')),
      'open_task_count',(select count(*) from djm_os.tasks t where t.organisation_id=p_organisation_id and t.status not in ('completed','cancelled')),
      'last_interaction_at',(select max(i.occurred_at) from djm_os.interactions i where i.organisation_id=p_organisation_id)
    )
  ) into v;
  return v;
end $function$


CREATE OR REPLACE FUNCTION public.djm_network_complete_meeting(p_meeting_id uuid, p_summary text, p_next_action text DEFAULT NULL::text, p_next_action_due timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_m djm_os.meetings%rowtype;v_interaction uuid;v_task uuid;
begin
  select * into v_m from djm_os.meetings where id=p_meeting_id and owner_user_id=auth.uid();
  if not found then raise exception 'Meeting not found or not owned by you'; end if;
  if p_summary is null or length(trim(p_summary))<2 then raise exception 'Meeting summary is required'; end if;

  update djm_os.meetings set status='completed',notes=trim(p_summary),updated_at=now() where id=p_meeting_id;
  insert into djm_os.interactions(occurred_at,channel,direction,team_member_id,person_id,organisation_id,source_external_id,source_type,raw_text,summary,confidence)
  values(v_m.starts_at,'meeting','completed',auth.uid(),v_m.person_id,v_m.organisation_id,p_meeting_id::text,'network_meeting',trim(p_summary),left(trim(p_summary),240),1)
  returning id into v_interaction;
  if v_m.person_id is not null then
    insert into djm_os.relationships(team_member_id,person_id,last_meaningful_at,first_known_at,strength_score)
    values(auth.uid(),v_m.person_id,v_m.starts_at,v_m.starts_at,40)
    on conflict(team_member_id,person_id) do update set last_meaningful_at=greatest(coalesce(djm_os.relationships.last_meaningful_at,excluded.last_meaningful_at),excluded.last_meaningful_at),updated_at=now();
  end if;
  if p_next_action is not null and length(trim(p_next_action))>1 then
    insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,interaction_id,due_at,status,priority,source)
    values(trim(p_next_action),'meeting_followup',auth.uid(),v_m.person_id,v_m.organisation_id,v_interaction,p_next_action_due,'open',4,'meeting') returning id into v_task;
  end if;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,interaction_id,payload,source,confidence,occurred_at)
  values('MEETING_COMPLETED',auth.uid(),v_m.person_id,v_m.organisation_id,v_interaction,jsonb_build_object('meeting_id',p_meeting_id,'task_id',v_task),'network',1,now());
  return jsonb_build_object('meeting_id',p_meeting_id,'interaction_id',v_interaction,'task_id',v_task);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_network_create_meeting_draft(p_title text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_person_id uuid DEFAULT NULL::uuid, p_organisation_id uuid DEFAULT NULL::uuid, p_invitee_email text DEFAULT NULL::text, p_timezone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_id uuid; begin
  if p_title is null or length(trim(p_title))<2 then raise exception 'Meeting title is required'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'Valid meeting times are required'; end if;
  insert into djm_os.meetings(owner_user_id,person_id,organisation_id,title,starts_at,ends_at,timezone,provider,invitee_email,status,source)
  values(auth.uid(),p_person_id,p_organisation_id,trim(p_title),p_starts_at,p_ends_at,coalesce(nullif(trim(p_timezone),''),'Europe/Rome'),'manual',nullif(trim(p_invitee_email),''),'draft','network')
  returning id into v_id;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at)
  values('MEETING_DRAFT_CREATED',auth.uid(),p_person_id,p_organisation_id,jsonb_build_object('meeting_id',v_id,'starts_at',p_starts_at,'ends_at',p_ends_at),'network',1,now());
  return jsonb_build_object('meeting_id',v_id,'status','draft');
end; $function$


CREATE OR REPLACE FUNCTION public.djm_network_create_task(p_title text, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_person_id uuid DEFAULT NULL::uuid, p_organisation_id uuid DEFAULT NULL::uuid, p_owner_user_id uuid DEFAULT NULL::uuid, p_priority smallint DEFAULT 3, p_task_type text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_id uuid; v_owner uuid;
begin
  if p_title is null or length(trim(p_title))<2 then raise exception 'Task title is required'; end if;
  if p_priority<1 or p_priority>5 then raise exception 'Priority must be between 1 and 5'; end if;
  v_owner:=coalesce(p_owner_user_id,auth.uid());
  if not exists(select 1 from djm_os.team_members where user_id=v_owner and is_active=true) then raise exception 'Task owner must be an active DJM team member'; end if;
  insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,due_at,status,priority,source)
  values(trim(p_title),coalesce(nullif(trim(p_task_type),''),'manual'),v_owner,p_person_id,p_organisation_id,p_due_at,'open',p_priority,'manual')
  returning id into v_id;
  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,payload,source,confidence,occurred_at)
  values('TASK_CREATED',auth.uid(),p_person_id,p_organisation_id,jsonb_build_object('task_id',v_id,'owner_user_id',v_owner),'network',1,now());
  return jsonb_build_object('task_id',v_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_network_dashboard()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'people_count', (select count(*) from djm_os.people),
    'club_count', (select count(*) from djm_os.organisations where organisation_type = 'club'),
    'active_needs', (select count(*) from djm_os.club_needs where status in ('active','open','confirmed')),
    'open_tasks', (select count(*) from djm_os.tasks where status not in ('done','completed','cancelled')),
    'my_open_tasks', (select count(*) from djm_os.tasks where owner_user_id = auth.uid() and status not in ('done','completed','cancelled')),
    'recent_interactions', coalesce((select jsonb_agg(x order by x.occurred_at desc) from (
      select i.id, i.occurred_at, i.channel, i.summary, i.person_id, p.full_name,
             i.organisation_id, o.name as organisation_name, tm.display_name as team_member_name
      from djm_os.interactions i
      left join djm_os.people p on p.id = i.person_id
      left join djm_os.organisations o on o.id = i.organisation_id
      left join djm_os.team_members tm on tm.user_id = i.team_member_id
      order by i.occurred_at desc limit 8
    ) x), '[]'::jsonb),
    'priority_tasks', coalesce((select jsonb_agg(x order by x.priority desc, x.due_at asc nulls last) from (
      select t.id, t.title, t.task_type, t.owner_user_id, t.priority, t.due_at, t.person_id,
             p.full_name, t.organisation_id, o.name as organisation_name
      from djm_os.tasks t
      left join djm_os.people p on p.id = t.person_id
      left join djm_os.organisations o on o.id = t.organisation_id
      where t.status not in ('done','completed','cancelled') and (t.owner_user_id is null or t.owner_user_id = auth.uid())
      order by t.priority desc, t.due_at asc nulls last limit 8
    ) x), '[]'::jsonb),
    'active_needs_list', coalesce((select jsonb_agg(x order by x.updated_at desc) from (
      select n.id, n.title, n.position, n.preferred_foot, n.status, n.confidence, n.updated_at,
             o.name as organisation_name, p.full_name as source_person_name
      from djm_os.club_needs n
      join djm_os.organisations o on o.id = n.organisation_id
      left join djm_os.people p on p.id = n.source_person_id
      where n.status in ('active','open','confirmed')
      order by n.updated_at desc limit 6
    ) x), '[]'::jsonb)
  );
$function$


CREATE OR REPLACE FUNCTION public.djm_network_hide_timeline_item(p_person_id uuid, p_item_type text, p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_exists boolean := false;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  if p_item_type not in ('message','logged') then
    raise exception 'Unsupported timeline item type';
  end if;

  if p_item_type='message' then
    select exists(
      select 1
      from djm_os.messages m
      join djm_os.conversation_threads t on t.id=m.thread_id
      where m.id=p_item_id and t.person_id=p_person_id
    ) into v_exists;
  else
    select exists(
      select 1 from djm_os.interactions i
      where i.id=p_item_id and i.person_id=p_person_id
        and i.source_type in ('network_manual','djm_capture')
    ) into v_exists;
  end if;

  if not v_exists then
    raise exception 'Timeline item not found for this contact';
  end if;

  insert into djm_os.timeline_hidden_items(item_type,item_id,hidden_by,hidden_at)
  values(p_item_type,p_item_id,v_uid,now())
  on conflict (item_type,item_id)
  do update set hidden_by=excluded.hidden_by, hidden_at=excluded.hidden_at;

  return jsonb_build_object('hidden',true,'item_type',p_item_type,'item_id',p_item_id);
end
$function$


CREATE OR REPLACE FUNCTION public.djm_network_link_opportunity(p_opportunity_id uuid, p_organisation_id uuid DEFAULT NULL::uuid, p_person_id uuid DEFAULT NULL::uuid, p_club_need_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if not exists(select 1 from public.player_opportunities where id=p_opportunity_id) then raise exception 'Opportunity not found'; end if;
  insert into djm_os.opportunity_links(opportunity_id,organisation_id,person_id,club_need_id,confidence,linked_by)
  values(p_opportunity_id,p_organisation_id,p_person_id,p_club_need_id,1,auth.uid())
  on conflict(opportunity_id) do update set organisation_id=excluded.organisation_id,person_id=excluded.person_id,club_need_id=excluded.club_need_id,linked_by=auth.uid(),updated_at=now();
  return jsonb_build_object('opportunity_id',p_opportunity_id,'linked',true);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_network_log_contact_interaction(p_person_id uuid, p_channel text, p_summary text, p_organisation_id uuid DEFAULT NULL::uuid, p_occurred_at timestamp with time zone DEFAULT now(), p_create_followup_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_followup_title text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid := p_organisation_id;
  v_i uuid;
  v_capture_id uuid;
  v_task_id uuid;
  v_need_id uuid;
  v_name text;
  v_position text;
  v_needs_review boolean := false;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=v_uid and tm.is_active) then
    raise exception 'DJM team access required';
  end if;
  if p_channel not in ('whatsapp','linkedin','email','phone','meeting','instagram','other') then
    raise exception 'Unsupported channel';
  end if;
  if length(trim(coalesce(p_summary,'')))<2 then
    raise exception 'Summary is required';
  end if;

  select full_name into v_name
  from djm_os.people
  where id=p_person_id and coalesce(person_type,'club_contact')<>'player';
  if v_name is null then raise exception 'Club contact not found'; end if;

  if v_org is null then
    select organisation_id into v_org
    from djm_os.employments
    where person_id=p_person_id and is_current=true
    order by last_verified_at desc nulls last, updated_at desc
    limit 1;
  end if;

  insert into djm_os.captures(submitted_by,channel,capture_type,raw_text,person_id,organisation_id,status)
  values(v_uid,p_channel,'text',trim(p_summary),p_person_id,v_org,'processing')
  returning id into v_capture_id;

  insert into djm_os.interactions(
    team_member_id,person_id,organisation_id,channel,direction,summary,raw_text,
    occurred_at,source_external_id,source_type,confidence
  ) values(
    v_uid,p_person_id,v_org,p_channel,'logged',trim(p_summary),trim(p_summary),
    coalesce(p_occurred_at,now()),v_capture_id::text,'network_manual',1
  ) returning id into v_i;

  update djm_os.relationships
  set last_meaningful_at=greatest(coalesce(last_meaningful_at,'epoch'::timestamptz),coalesce(p_occurred_at,now())),updated_at=now()
  where team_member_id=v_uid and person_id=p_person_id;

  if p_create_followup_at is not null then
    insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,interaction_id,due_at,status,priority,source)
    values(
      coalesce(nullif(trim(coalesce(p_followup_title,'')),''),'Follow up with '||v_name),
      'relationship_followup',v_uid,p_person_id,v_org,v_i,p_create_followup_at,'open',3,'network_manual'
    ) returning id into v_task_id;
  elsif p_summary ~* '\m(i.ll|i will|we.ll|we will|send|follow up|call|speak|revert|get back|come back)\M' then
    insert into djm_os.tasks(title,task_type,owner_user_id,person_id,organisation_id,interaction_id,status,priority,source)
    values(
      case
        when p_summary ~* '\msend\M' then 'Follow through on promised send'
        when p_summary ~* '\mcall\M|\mspeak\M' then 'Follow up on promised call'
        else 'Follow up on conversation commitment'
      end,
      'commitment',v_uid,p_person_id,v_org,v_i,'open',5,'network_manual'
    ) returning id into v_task_id;
  end if;

  v_position := case
    when p_summary ~* '\m(left[- ]?back|lb)\M' then 'LB'
    when p_summary ~* '\m(right[- ]?back|rb)\M' then 'RB'
    when p_summary ~* '\m(left[- ]?foot(ed)? (centre|center)[- ]?back|lcb)\M' then 'LCB'
    when p_summary ~* '\m(centre|center)[- ]?back|\mcb\M' then 'CB'
    when p_summary ~* '\mdefensive midfielder|number 6|no\.? ?6\M' then '6'
    when p_summary ~* '\m(number 8|no\.? ?8|central midfielder|cm)\M' then '8'
    when p_summary ~* '\m(number 10|no\.? ?10|attacking midfielder|am)\M' then '10'
    when p_summary ~* '\mright winger|rw\M' then 'RW'
    when p_summary ~* '\mleft winger|lw\M' then 'LW'
    when p_summary ~* '\mwinger\M' then 'Winger'
    when p_summary ~* '\mstriker|centre forward|center forward|cf\M' then 'ST'
    when p_summary ~* '\mgoalkeeper|keeper|gk\M' then 'GK'
    else null
  end;

  if v_org is not null and v_position is not null and p_summary ~* '\m(need|looking|searching|want|require|after)\M' then
    insert into djm_os.club_needs(
      organisation_id,source_person_id,owner_user_id,source_interaction_id,title,position,
      profile_notes,status,confidence,confirmed_at,expires_at
    ) values(
      v_org,p_person_id,v_uid,v_i,v_position||' requirement',v_position,left(trim(p_summary),1000),
      'active',0.72,coalesce(p_occurred_at,now()),coalesce(p_occurred_at,now())+interval '45 days'
    ) returning id into v_need_id;
  elsif v_position is not null and p_summary ~* '\m(need|looking|searching|want|require|after)\M' then
    v_needs_review := true;
  end if;

  insert into djm_os.events(event_type,actor_user_id,person_id,organisation_id,interaction_id,payload,source,confidence,occurred_at)
  values(
    'CONTACT_INTERACTION_LOGGED',v_uid,p_person_id,v_org,v_i,
    jsonb_build_object(
      'channel',p_channel,'summary',trim(p_summary),'capture_id',v_capture_id,
      'task_id',v_task_id,'club_need_id',v_need_id,'position',v_position,'needs_review',v_needs_review
    ),
    'network',1,coalesce(p_occurred_at,now())
  );

  update djm_os.captures
  set status=case when v_needs_review then 'needs_review' else 'processed' end,
      extracted_json=jsonb_build_object(
        'interaction_id',v_i,'task_id',v_task_id,'club_need_id',v_need_id,
        'position',v_position,'needs_review',v_needs_review
      ),
      confidence=case when v_needs_review then 0.72 else 1 end,
      processed_at=now()
  where id=v_capture_id;

  return jsonb_build_object(
    'interaction_id',v_i,
    'organisation_id',v_org,
    'capture_id',v_capture_id,
    'task_id',v_task_id,
    'club_need_id',v_need_id,
    'position',v_position,
    'needs_review',v_needs_review
  );
end
$function$


CREATE OR REPLACE FUNCTION public.djm_network_log_contact_interaction_local(p_person_id uuid, p_channel text, p_summary text, p_organisation_id uuid DEFAULT NULL::uuid, p_occurred_date date DEFAULT CURRENT_DATE, p_occurred_time time without time zone DEFAULT LOCALTIME, p_timezone text DEFAULT 'Europe/Rome'::text, p_create_followup_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_followup_title text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_occurred_at timestamptz;
  v_result jsonb;
begin
  if p_occurred_date is null or p_occurred_time is null then
    raise exception 'Conversation date and time are required';
  end if;

  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then
    raise exception 'Invalid timezone: %', coalesce(p_timezone, 'null');
  end if;

  v_occurred_at := pg_catalog.make_timestamptz(
    extract(year from p_occurred_date)::int,
    extract(month from p_occurred_date)::int,
    extract(day from p_occurred_date)::int,
    extract(hour from p_occurred_time)::int,
    extract(minute from p_occurred_time)::int,
    extract(second from p_occurred_time)::double precision,
    p_timezone
  );

  select public.djm_network_log_contact_interaction(
    p_person_id,
    p_channel,
    p_summary,
    p_organisation_id,
    v_occurred_at,
    p_create_followup_at,
    p_followup_title
  ) into v_result;

  return v_result || pg_catalog.jsonb_build_object(
    'occurred_at', v_occurred_at,
    'occurred_date', p_occurred_date,
    'occurred_time', p_occurred_time,
    'timezone', p_timezone
  );
end
$function$


commit;
