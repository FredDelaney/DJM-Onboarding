-- DJM Player staging public-function bootstrap — batch 05
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- all private/djm_os function batches, and public function batches 01-04.
--
-- Exact current-production definitions for public functions 141-180 of 240,
-- ordered by function name + identity arguments.
-- Production body MD5: e31253ebcb474d7d093e9e3ca6edf985
--
-- Existing staging public platform_server_* RPCs were checked for collisions
-- before public bootstrap recovery; no exact production name/signature
-- collision was found.
--
-- Body validation is disabled only during bootstrap because later public
-- batches may provide cross-function dependencies. No function is executed.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.djm_player_scorecard_v5_preview(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  return private.djm_player_score_v5_compute(p_player_id,current_date,false);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_player_send_reply(p_player_id uuid, p_request_id uuid, p_title text, p_message text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_incoming public.player_requests%rowtype;
  v_reply_id uuid;
  v_candidate_task_id uuid;
  v_candidate_task_count integer := 0;
begin
  if not exists (
    select 1
    from djm_os.team_members tm
    where tm.user_id = v_uid
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  if nullif(trim(coalesce(p_message,'')),'') is null then
    raise exception 'Reply message is required';
  end if;

  select *
  into v_incoming
  from public.player_requests r
  where r.id = p_request_id
    and r.player_id = p_player_id
  for update;

  if v_incoming.id is null then
    raise exception 'Player message not found';
  end if;

  if v_incoming.created_by is not null
     or v_incoming.request_type not in ('message','signal') then
    raise exception 'This item is not an incoming player message';
  end if;

  if v_incoming.status = 'completed' then
    raise exception 'This player message has already been handled';
  end if;

  insert into public.player_requests(
    player_id,
    title,
    message,
    request_type,
    status,
    created_by,
    completed_at
  )
  values (
    p_player_id,
    coalesce(
      nullif(trim(coalesce(p_title,'')),''),
      'Reply from DJM'
    ),
    trim(p_message),
    'message',
    'completed',
    v_uid,
    now()
  )
  returning id into v_reply_id;

  update public.player_requests
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = p_request_id;

  select count(*)
  into v_candidate_task_count
  from djm_os.tasks t
  where t.player_id = p_player_id
    and t.status not in ('done','completed','cancelled')
    and t.task_type = 'tell_djm'
    and t.source like 'tell_djm:%'
    and lower(t.title) ~ '(catch[ -]?up|follow[ -]?up|reply|message|contact|speak|call|check[ -]?in)';

  if v_candidate_task_count = 1 then
    select t.id
    into v_candidate_task_id
    from djm_os.tasks t
    where t.player_id = p_player_id
      and t.status not in ('done','completed','cancelled')
      and t.task_type = 'tell_djm'
      and t.source like 'tell_djm:%'
      and lower(t.title) ~ '(catch[ -]?up|follow[ -]?up|reply|message|contact|speak|call|check[ -]?in)'
    limit 1;

    update djm_os.tasks
    set status = 'completed',
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = v_candidate_task_id;
  else
    v_candidate_task_id := null;
  end if;

  insert into djm_os.events(
    event_type,
    actor_user_id,
    player_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (
    'PLAYER_MESSAGE_REPLIED',
    v_uid,
    p_player_id,
    jsonb_build_object(
      'incoming_request_id', p_request_id,
      'reply_request_id', v_reply_id,
      'auto_completed_task_id', v_candidate_task_id,
      'communication_task_candidates', v_candidate_task_count
    ),
    'player_inbox',
    1,
    now()
  );

  return jsonb_build_object(
    'player_id', p_player_id,
    'incoming_request_id', p_request_id,
    'reply_request_id', v_reply_id,
    'auto_completed_task_id', v_candidate_task_id,
    'communication_task_candidates', v_candidate_task_count
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_player_voice_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.players p
    where p.user_id = auth.uid()
  ) then
    raise exception 'Player account required';
  end if;

  select jsonb_build_object(
    'enabled', coalesce(s.is_live, false),
    'max_audio_seconds', coalesce(s.max_audio_seconds, 240)
  )
  into v_result
  from djm_os.tell_djm_settings s
  where s.id = 1;

  return coalesce(v_result, jsonb_build_object('enabled', false, 'max_audio_seconds', 240));
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_prepare_me(p_person_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select (public.djm_catch_me_up(p_person_id) || jsonb_build_object(
  'recent_claims',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select c.claim_type,c.claim_key,c.value_json,c.confidence,c.verification_status,c.created_at,c.valid_until
      from djm_os.claims c
      where c.person_id=p_person_id and (c.valid_until is null or c.valid_until>now())
      order by c.created_at desc limit 12
    ) x
  ),'[]'::jsonb),
  'upcoming_meetings',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.starts_at)
    from (
      select m.id,m.title,m.starts_at,m.ends_at,m.meeting_url,m.status
      from djm_os.meetings m
      where m.person_id=p_person_id and m.starts_at>=now() and m.status not in ('cancelled')
      order by m.starts_at limit 5
    ) x
  ),'[]'::jsonb),
  'recent_messages',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.sent_at desc)
    from (
      select m.id,m.sent_at,m.direction,m.sender_label,m.raw_text,m.message_type,t.id thread_id
      from djm_os.messages m
      join djm_os.conversation_threads t on t.id=m.thread_id
      where t.person_id=p_person_id
        and m.message_type='text'
        and nullif(trim(coalesce(m.raw_text,'')),'') is not null
        and not (coalesce(m.raw_text,'') ~* 'https?://' and coalesce(m.raw_text,'') ~* '<attached:')
        and not exists (
          select 1 from djm_os.timeline_hidden_items h
          where h.item_type='message' and h.item_id=m.id
        )
      order by m.sent_at desc
      limit 8
    ) x
  ),'[]'::jsonb),
  'recent_timeline',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.occurred_at desc)
    from (
      select *
      from (
        select
          'message'::text as item_type,
          m.id,
          m.sent_at as occurred_at,
          'whatsapp'::text as channel,
          m.direction,
          m.sender_label as actor_label,
          m.raw_text as body,
          m.message_type,
          t.id as thread_id,
          null::text as team_member_name,
          'whatsapp_import'::text as source_type
        from djm_os.messages m
        join djm_os.conversation_threads t on t.id=m.thread_id
        where t.person_id=p_person_id
          and m.message_type='text'
          and nullif(trim(coalesce(m.raw_text,'')),'') is not null
          and not exists (
            select 1 from djm_os.timeline_hidden_items h
            where h.item_type='message' and h.item_id=m.id
          )

        union all

        select
          'logged'::text as item_type,
          i.id,
          i.occurred_at,
          i.channel,
          coalesce(i.direction,'logged') as direction,
          coalesce(tm.display_name,'DJM') as actor_label,
          coalesce(nullif(i.raw_text,''),i.summary) as body,
          'note'::text as message_type,
          null::uuid as thread_id,
          tm.display_name as team_member_name,
          i.source_type
        from djm_os.interactions i
        left join djm_os.team_members tm on tm.user_id=i.team_member_id
        where i.person_id=p_person_id
          and i.source_type in ('network_manual','djm_capture')
          and nullif(trim(coalesce(i.raw_text,i.summary,'')),'') is not null
          and not exists (
            select 1 from djm_os.timeline_hidden_items h
            where h.item_type='logged' and h.item_id=i.id
          )
      ) timeline_items
      order by occurred_at desc
      limit 24
    ) x
  ),'[]'::jsonb)
  ));
$function$


CREATE OR REPLACE FUNCTION public.djm_record_employment_observation(p_person_id uuid, p_club_name text, p_role_title text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_source_uri text DEFAULT NULL::text, p_source_name text DEFAULT 'manual/public check'::text, p_confidence numeric DEFAULT 0.8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin if not djm_os.is_team_member() then raise exception 'Not authorised'; end if; return djm_os.apply_employment_observation(p_person_id,p_club_name,p_role_title,p_country,p_source_uri,p_source_name,p_confidence); end; $function$


CREATE OR REPLACE FUNCTION public.djm_recruitment_apply_transfermarkt(p_prospect_id uuid, p_source_url text, p_observed_at timestamp with time zone, p_confidence numeric, p_date_of_birth date DEFAULT NULL::date, p_nationality text DEFAULT NULL::text, p_current_club text DEFAULT NULL::text, p_current_country text DEFAULT NULL::text, p_primary_position text DEFAULT NULL::text, p_preferred_foot text DEFAULT NULL::text, p_contract_expiry date DEFAULT NULL::date, p_market_value numeric DEFAULT NULL::numeric, p_market_value_currency text DEFAULT NULL::text, p_agent_name text DEFAULT NULL::text, p_snapshot jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_confidence < 0.80 then
   update djm_os.scouting_prospects set transfermarkt_enrichment_status='review',transfermarkt_checked_at=coalesce(p_observed_at,now()),transfermarkt_snapshot=coalesce(p_snapshot,'{}'::jsonb),updated_at=now() where id=p_prospect_id;
   return jsonb_build_object('applied',false,'review',true);
 end if;
 update djm_os.scouting_prospects set
   date_of_birth=coalesce(p_date_of_birth,date_of_birth),
   nationality=coalesce(nullif(btrim(p_nationality),''),nationality),
   current_club=coalesce(nullif(btrim(p_current_club),''),current_club),
   current_country=coalesce(nullif(btrim(p_current_country),''),current_country),
   primary_position=coalesce(nullif(btrim(p_primary_position),''),primary_position),
   preferred_foot=coalesce(nullif(btrim(p_preferred_foot),''),preferred_foot),
   contract_expiry=coalesce(p_contract_expiry,contract_expiry),
   market_value=coalesce(p_market_value,market_value),
   market_value_currency=coalesce(nullif(btrim(p_market_value_currency),''),market_value_currency),
   agent_name=coalesce(nullif(btrim(p_agent_name),''),agent_name),
   transfermarkt_url=coalesce(nullif(btrim(p_source_url),''),transfermarkt_url),
   transfermarkt_enrichment_status='verified',
   transfermarkt_checked_at=coalesce(p_observed_at,now()),
   transfermarkt_snapshot=coalesce(p_snapshot,'{}'::jsonb),
   market_value_verified_at=case when p_market_value is not null then coalesce(p_observed_at,now()) else market_value_verified_at end,
   source_confidence=greatest(coalesce(source_confidence,0),least(p_confidence,1)),last_verified_at=coalesce(p_observed_at,now()),updated_at=now()
 where id=p_prospect_id;
 return jsonb_build_object('applied',true,'prospect_id',p_prospect_id);
end $function$


CREATE OR REPLACE FUNCTION public.djm_recruitment_apply_transfermarkt_enrichment(p_prospect_id uuid, p_source_url text, p_status text, p_observed_at timestamp with time zone, p_fields jsonb DEFAULT '{}'::jsonb, p_http_status integer DEFAULT NULL::integer, p_blocked boolean DEFAULT false, p_parser_version text DEFAULT 'tm_v6'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_status text;
  v_fields jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  if not exists (
    select 1
    from djm_os.team_members tm
    where tm.user_id = (select auth.uid())
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  if p_source_url is null or btrim(p_source_url) = '' then
    raise exception 'Transfermarkt URL is required';
  end if;

  v_status := case lower(coalesce(p_status, 'failed'))
    when 'complete' then 'verified'
    when 'verified' then 'verified'
    when 'partial' then 'review'
    when 'review' then 'review'
    when 'blocked' then 'queued'
    when 'pending' then 'queued'
    when 'queued' then 'queued'
    when 'never' then 'never'
    else 'failed'
  end;

  update djm_os.scouting_prospects sp
  set
    transfermarkt_url = p_source_url,
    transfermarkt_enrichment_status = v_status,
    transfermarkt_checked_at = coalesce(p_observed_at, now()),
    transfermarkt_snapshot = jsonb_build_object(
      'source_url', p_source_url,
      'observed_at', coalesce(p_observed_at, now()),
      'parser_version', coalesce(nullif(btrim(p_parser_version), ''), 'tm_v6'),
      'fields', v_fields,
      'http_status', p_http_status,
      'blocked', coalesce(p_blocked, false)
    ),
    source = case when not coalesce(p_blocked, false) then 'transfermarkt' else sp.source end,
    source_confidence = case when not coalesce(p_blocked, false) then 0.92 else sp.source_confidence end,
    last_verified_at = case when v_status = 'verified' then coalesce(p_observed_at, now()) else sp.last_verified_at end,
    full_name = case when v_fields ? 'full_name' and nullif(btrim(v_fields->>'full_name'), '') is not null then btrim(v_fields->>'full_name') else sp.full_name end,
    date_of_birth = case when v_fields ? 'date_of_birth' and nullif(v_fields->>'date_of_birth','') is not null then (v_fields->>'date_of_birth')::date else sp.date_of_birth end,
    nationality = case when v_fields ? 'nationality' and nullif(btrim(v_fields->>'nationality'), '') is not null then btrim(v_fields->>'nationality') else sp.nationality end,
    current_club = case when v_fields ? 'current_club' and nullif(btrim(v_fields->>'current_club'), '') is not null then btrim(v_fields->>'current_club') else sp.current_club end,
    current_country = case when v_fields ? 'current_country' and nullif(btrim(v_fields->>'current_country'), '') is not null then btrim(v_fields->>'current_country') else sp.current_country end,
    primary_position = case when v_fields ? 'primary_position' and nullif(btrim(v_fields->>'primary_position'), '') is not null then btrim(v_fields->>'primary_position') else sp.primary_position end,
    secondary_positions = case
      when jsonb_typeof(v_fields->'secondary_positions') = 'array'
      then array(select jsonb_array_elements_text(v_fields->'secondary_positions'))
      else sp.secondary_positions
    end,
    preferred_foot = case when v_fields ? 'preferred_foot' and nullif(btrim(v_fields->>'preferred_foot'), '') is not null then btrim(v_fields->>'preferred_foot') else sp.preferred_foot end,
    contract_expiry = case when v_fields ? 'contract_expiry' and nullif(v_fields->>'contract_expiry','') is not null then (v_fields->>'contract_expiry')::date else sp.contract_expiry end,
    market_value = case when v_fields ? 'market_value' and nullif(v_fields->>'market_value','') is not null then (v_fields->>'market_value')::numeric else sp.market_value end,
    market_value_currency = case when v_fields ? 'market_value_currency' and nullif(btrim(v_fields->>'market_value_currency'), '') is not null then btrim(v_fields->>'market_value_currency') else sp.market_value_currency end,
    market_value_verified_at = case when v_fields ? 'market_value' and nullif(v_fields->>'market_value','') is not null then coalesce(p_observed_at, now()) else sp.market_value_verified_at end,
    agent_status = case when v_fields ? 'agent_status' and nullif(btrim(v_fields->>'agent_status'), '') is not null then btrim(v_fields->>'agent_status') else sp.agent_status end,
    agent_name = case
      when v_fields ? 'agent_name' then nullif(btrim(v_fields->>'agent_name'), '')
      when v_fields->>'agent_status' = 'not_listed' then null
      else sp.agent_name
    end,
    updated_at = now()
  where sp.id = p_prospect_id
    and sp.linked_player_id is null;

  if not found then
    raise exception 'Recruitment target not found or already signed';
  end if;

  if not coalesce(p_blocked, false) then
    update djm_os.freshness_queue fq
    set status = 'completed',
        completed_at = coalesce(p_observed_at, now()),
        locked_at = null,
        updated_at = now()
    where fq.entity_type = 'recruitment_target'
      and fq.entity_id = p_prospect_id
      and fq.check_type = 'transfermarkt_profile';
  end if;

  return jsonb_build_object(
    'persisted', true,
    'prospect_id', p_prospect_id,
    'status', v_status,
    'blocked', coalesce(p_blocked, false)
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_recruitment_assign_owner(p_prospect_id uuid, p_owner_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before uuid;
  v_name text;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=auth.uid() and tm.is_active) then
    raise exception 'DJM team access required';
  end if;
  if p_owner_user_id is not null
     and not exists(select 1 from djm_os.team_members tm where tm.user_id=p_owner_user_id and tm.is_active) then
    raise exception 'Active DJM team member not found';
  end if;

  select sp.owner_user_id,sp.full_name into v_before,v_name
  from djm_os.scouting_prospects sp
  where sp.id=p_prospect_id and sp.linked_player_id is null
  for update;
  if not found then raise exception 'Recruitment target not found'; end if;

  update djm_os.scouting_prospects
  set owner_user_id=p_owner_user_id,updated_at=now()
  where id=p_prospect_id;

  update djm_os.tasks
  set owner_user_id=p_owner_user_id,updated_at=now()
  where source='recruitment:'||p_prospect_id::text
    and status not in ('done','completed','cancelled');

  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at)
  values('RECRUITMENT_OWNER_UPDATED',auth.uid(),
    jsonb_build_object('prospect_id',p_prospect_id,'player_name',v_name,'previous_owner_user_id',v_before,'owner_user_id',p_owner_user_id),
    'recruitment',1,now());

  return jsonb_build_object('prospect_id',p_prospect_id,'owner_user_id',p_owner_user_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_recruitment_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_uid uuid:=(select auth.uid());
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=v_uid and tm.is_active) then raise exception 'DJM team access required'; end if;
  return jsonb_build_object(
    'summary',jsonb_build_object(
      'active',(select count(*) from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.recruitment_stage not in ('signed','declined','lost')),
      'hot',(select count(*) from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating')),
      'overdue',(select count(*) from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.recruitment_stage not in ('signed','declined','lost','paused') and sp.next_action_at<now()),
      'untouched_high_priority',(select count(*) from djm_os.scouting_prospects sp where sp.linked_player_id is null and sp.recruitment_stage in ('identified','researching','ready_to_contact') and sp.recruitment_priority>=4 and sp.first_contact_at is null)
    ),
    'priority_targets',coalesce((select jsonb_agg(to_jsonb(x) order by x.priority_score desc) from (
      select sp.id,sp.full_name,sp.current_club,sp.primary_position,sp.recruitment_stage,sp.recruitment_priority,sp.next_action_at,sp.last_contact_at,sp.last_reply_at,sp.owner_user_id,tm.display_name as owner_name,
        least(100,sp.recruitment_priority*15 + case when sp.recruitment_stage in ('interested','terms_discussed','agreement_sent','negotiating') then 20 else 0 end + case when sp.next_action_at<now() then 15 else 0 end)::int as priority_score
      from djm_os.scouting_prospects sp left join djm_os.team_members tm on tm.user_id=sp.owner_user_id
      where sp.linked_player_id is null and sp.recruitment_stage not in ('signed','declined','lost','paused')
      order by priority_score desc,sp.next_action_at nulls last limit 25
    ) x),'[]'::jsonb),
    'overdue',coalesce((select jsonb_agg(to_jsonb(x) order by x.next_action_at) from (select sp.id,sp.full_name,sp.current_club,sp.primary_position,sp.recruitment_stage,sp.recruitment_priority,sp.next_action_at,tm.display_name as owner_name from djm_os.scouting_prospects sp left join djm_os.team_members tm on tm.user_id=sp.owner_user_id where sp.linked_player_id is null and sp.recruitment_stage not in ('signed','declined','lost','paused') and sp.next_action_at<now() order by sp.next_action_at limit 25) x),'[]'::jsonb),
    'recent_activity',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (select ri.id,ri.prospect_id,sp.full_name,ri.channel,ri.direction,ri.summary,ri.occurred_at,tm.display_name as owner_name from djm_os.recruitment_interactions ri join djm_os.scouting_prospects sp on sp.id=ri.prospect_id left join djm_os.team_members tm on tm.user_id=ri.owner_user_id order by ri.occurred_at desc limit 30) x),'[]'::jsonb)
  );
end $function$


CREATE OR REPLACE FUNCTION public.djm_recruitment_log_interaction(p_prospect_id uuid, p_channel text, p_summary text, p_direction text DEFAULT NULL::text, p_occurred_at timestamp with time zone DEFAULT now(), p_next_action_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_stage text;
  v_name text;
  v_owner uuid;
  v_priority smallint;
  v_existing_next timestamptz;
  v_effective_next timestamptz;
begin
  if not exists(
    select 1
    from djm_os.team_members tm
    where tm.user_id = (select auth.uid())
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  if p_channel not in ('whatsapp','instagram','linkedin','email','phone','meeting','other') then
    raise exception 'Unsupported channel';
  end if;

  if p_direction is not null and p_direction not in ('inbound','outbound','mutual') then
    raise exception 'Unsupported direction';
  end if;

  if length(trim(coalesce(p_summary,''))) < 2 then
    raise exception 'Summary is required';
  end if;

  select
    recruitment_stage,
    full_name,
    coalesce(owner_user_id,(select auth.uid())),
    recruitment_priority,
    next_action_at
  into
    v_stage,
    v_name,
    v_owner,
    v_priority,
    v_existing_next
  from djm_os.scouting_prospects
  where id = p_prospect_id
    and linked_player_id is null;

  if v_name is null then
    raise exception 'Recruitment target not found';
  end if;

  v_effective_next := coalesce(p_next_action_at, v_existing_next);

  insert into djm_os.recruitment_interactions(
    prospect_id,
    owner_user_id,
    channel,
    direction,
    summary,
    occurred_at,
    source
  )
  values(
    p_prospect_id,
    (select auth.uid()),
    p_channel,
    p_direction,
    trim(p_summary),
    coalesce(p_occurred_at,now()),
    'djm_os'
  )
  returning id into v_id;

  update djm_os.scouting_prospects
  set
    first_contact_at = coalesce(
      first_contact_at,
      case
        when p_direction in ('outbound','mutual') then coalesce(p_occurred_at,now())
        else first_contact_at
      end
    ),
    last_contact_at = case
      when p_direction in ('outbound','mutual') then greatest(
        coalesce(last_contact_at,'epoch'::timestamptz),
        coalesce(p_occurred_at,now())
      )
      else last_contact_at
    end,
    last_reply_at = case
      when p_direction in ('inbound','mutual') then greatest(
        coalesce(last_reply_at,'epoch'::timestamptz),
        coalesce(p_occurred_at,now())
      )
      else last_reply_at
    end,
    recruitment_stage = case
      when recruitment_stage in ('identified','researching','ready_to_contact') and p_direction='outbound' then 'contacted'
      when recruitment_stage in ('identified','researching','ready_to_contact','contacted') and p_direction in ('inbound','mutual') then 'replied'
      else recruitment_stage
    end,
    next_action_at = v_effective_next,
    owner_user_id = coalesce(owner_user_id,(select auth.uid())),
    preferred_contact_channel = coalesce(preferred_contact_channel,p_channel),
    updated_at = now()
  where id = p_prospect_id;

  delete from djm_os.tasks
  where source = ('recruitment:'||p_prospect_id::text)
    and status not in ('completed','cancelled');

  if v_effective_next is not null then
    insert into djm_os.tasks(
      title,
      task_type,
      owner_user_id,
      due_at,
      status,
      priority,
      source
    )
    values(
      'Follow up recruitment target: '||v_name,
      'recruitment_followup',
      v_owner,
      v_effective_next,
      'open',
      least(5,greatest(1,coalesce(v_priority,3))),
      'recruitment:'||p_prospect_id::text
    );
  else
    insert into djm_os.tasks(
      title,
      task_type,
      owner_user_id,
      due_at,
      status,
      priority,
      source
    )
    values(
      'Set next step: '||v_name,
      'recruitment_next_step',
      v_owner,
      now(),
      'open',
      least(5,greatest(1,coalesce(v_priority,3))),
      'recruitment:'||p_prospect_id::text
    );
  end if;

  insert into djm_os.events(
    event_type,
    actor_user_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values(
    'RECRUITMENT_INTERACTION_LOGGED',
    (select auth.uid()),
    jsonb_build_object(
      'prospect_id',p_prospect_id,
      'channel',p_channel,
      'direction',p_direction,
      'summary',trim(p_summary),
      'submitted_next_action_at',p_next_action_at,
      'effective_next_action_at',v_effective_next
    ),
    'recruitment',
    1,
    coalesce(p_occurred_at,now())
  );

  return jsonb_build_object(
    'interaction_id',v_id,
    'prospect_id',p_prospect_id,
    'next_action_at',v_effective_next,
    'next_action_required',v_effective_next is null
  );
end
$function$


CREATE OR REPLACE FUNCTION public.djm_recruitment_promote_to_signed_player(p_prospect_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sp djm_os.scouting_prospects%rowtype;
  v_player_id uuid;
  v_first text;
  v_last text;
  v_space int;
begin
  if not exists (
    select 1
    from djm_os.team_members tm
    where tm.user_id = (select auth.uid())
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  select *
  into sp
  from djm_os.scouting_prospects
  where id = p_prospect_id
  for update;

  if sp.id is null then
    raise exception 'Recruitment target not found';
  end if;

  if sp.signed_player_id is not null then
    return jsonb_build_object(
      'player_id', sp.signed_player_id,
      'already_promoted', true
    );
  end if;

  if sp.recruitment_stage <> 'signed' then
    raise exception 'Target must be marked signed before promotion';
  end if;

  v_space := strpos(trim(sp.full_name), ' ');
  if v_space > 0 then
    v_first := left(trim(sp.full_name), v_space - 1);
    v_last := substr(trim(sp.full_name), v_space + 1);
  else
    v_first := trim(sp.full_name);
    v_last := null;
  end if;

  insert into public.players(
    first_name,
    last_name,
    date_of_birth,
    nationalities,
    preferred_foot,
    primary_position,
    secondary_positions,
    current_club,
    current_country,
    contract_expiry,
    transfermarkt_url,
    wyscout_url,
    instagram_url,
    onboarding_status,
    verification_status,
    agency_priority,
    next_action,
    review_required_at,
    review_reason
  )
  values (
    v_first,
    v_last,
    sp.date_of_birth,
    case
      when nullif(trim(coalesce(sp.nationality,'')),'') is null then '{}'::text[]
      else array[trim(sp.nationality)]
    end,
    sp.preferred_foot,
    sp.primary_position,
    coalesce(sp.secondary_positions,'{}'::text[]),
    sp.current_club,
    sp.current_country,
    sp.contract_expiry,
    sp.transfermarkt_url,
    sp.wyscout_url,
    sp.instagram_url,
    'not_started',
    'unverified',
    'high',
    'Complete DJM Player onboarding',
    now(),
    'Promoted from DJM Recruitment after signing'
  )
  returning id into v_player_id;

  delete from djm_os.football_intelligence_subjects created
  where created.player_id = v_player_id
    and created.prospect_id is null
    and exists (
      select 1
      from djm_os.football_intelligence_subjects existing
      where existing.prospect_id = p_prospect_id
        and existing.id <> created.id
    );

  update djm_os.scouting_prospects
  set signed_player_id = v_player_id,
      linked_player_id = v_player_id,
      signed_at = coalesce(signed_at,now()),
      next_action_at = null,
      updated_at = now()
  where id = p_prospect_id;

  update djm_os.tasks
  set status = 'completed',
      completed_at = now(),
      updated_at = now()
  where source = ('recruitment:' || p_prospect_id::text)
    and status not in ('completed','cancelled');

  insert into djm_os.events(
    event_type,
    actor_user_id,
    player_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (
    'RECRUITMENT_PROMOTED_TO_SIGNED_PLAYER',
    (select auth.uid()),
    v_player_id,
    jsonb_build_object(
      'prospect_id', p_prospect_id,
      'player_name', sp.full_name
    ),
    'recruitment',
    1,
    now()
  );

  return jsonb_build_object(
    'player_id', v_player_id,
    'prospect_id', p_prospect_id,
    'already_promoted', false,
    'onboarding_status', 'not_started'
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_recruitment_quick_add(p_transfermarkt_url text, p_priority smallint DEFAULT 3, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_url text:=nullif(trim(coalesce(p_transfermarkt_url,'')),'');
  v_slug text;
  v_name text;
  v_result jsonb;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if v_url is null or v_url !~* 'transfermarkt\.' or v_url !~* '/profil/spieler/[0-9]+' then
    raise exception 'Paste a valid Transfermarkt player profile URL';
  end if;
  if p_priority<1 or p_priority>5 then raise exception 'Priority must be 1-5'; end if;

  v_slug:=substring(v_url from '/([^/?#]+)/profil/spieler/');
  if v_slug is null then raise exception 'Could not identify the player name from this Transfermarkt URL'; end if;
  v_name:=initcap(regexp_replace(v_slug,'[-_]+',' ','g'));

  select public.djm_recruitment_upsert_target(
    p_full_name=>v_name,
    p_transfermarkt_url=>v_url,
    p_recruitment_priority=>p_priority,
    p_recruitment_source=>'transfermarkt_url',
    p_notes=>nullif(trim(coalesce(p_notes,'')),'')
  ) into v_result;

  return v_result || jsonb_build_object('derived_name',v_name,'transfermarkt_url',v_url,'queued_for_enrichment',true);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_recruitment_request_transfermarkt_refresh(p_prospect_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_url text;
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 select transfermarkt_url into v_url from djm_os.scouting_prospects where id=p_prospect_id and linked_player_id is null;
 if v_url is null or btrim(v_url)='' then raise exception 'Add a Transfermarkt URL first'; end if;
 insert into djm_os.freshness_queue(entity_type,entity_id,check_type,priority,status,reason,next_check_at,source_hint,attempts,updated_at)
 values('recruitment_target',p_prospect_id,'transfermarkt_profile',95,'pending','User requested Transfermarkt profile refresh',now(),v_url,0,now())
 on conflict(entity_type,entity_id,check_type) do update set priority=greatest(djm_os.freshness_queue.priority,95),status='pending',reason=excluded.reason,next_check_at=now(),source_hint=excluded.source_hint,locked_at=null,completed_at=null,updated_at=now();
 update djm_os.scouting_prospects set transfermarkt_enrichment_status='queued',updated_at=now() where id=p_prospect_id;
 return jsonb_build_object('queued',true,'prospect_id',p_prospect_id,'source_url',v_url);
end $function$


CREATE OR REPLACE FUNCTION public.djm_recruitment_set_next_action(p_prospect_id uuid, p_next_action_at timestamp with time zone, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_name text;
  v_owner uuid;
  v_priority smallint;
  v_task_title text;
begin
  if not exists(
    select 1
    from djm_os.team_members tm
    where tm.user_id=(select auth.uid())
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  if p_next_action_at is null then
    raise exception 'Next action date is required';
  end if;

  select
    full_name,
    coalesce(owner_user_id,(select auth.uid())),
    recruitment_priority
  into v_name,v_owner,v_priority
  from djm_os.scouting_prospects
  where id=p_prospect_id
    and linked_player_id is null
    and recruitment_stage not in ('signed','declined','lost','paused');

  if v_name is null then
    raise exception 'Active recruitment target not found';
  end if;

  v_task_title := case
    when nullif(trim(coalesce(p_note,'')),'') is not null
      then trim(p_note) || ' · ' || v_name
    else 'Follow up · ' || v_name
  end;

  update djm_os.scouting_prospects
  set
    next_action_at=p_next_action_at,
    owner_user_id=coalesce(owner_user_id,(select auth.uid())),
    recruitment_notes=case
      when p_note is null or trim(p_note)='' then recruitment_notes
      else concat_ws(E'\n',nullif(recruitment_notes,''),trim(p_note))
    end,
    updated_at=now()
  where id=p_prospect_id;

  delete from djm_os.tasks
  where source=('recruitment:'||p_prospect_id::text)
    and status not in ('completed','cancelled');

  insert into djm_os.tasks(
    title,
    task_type,
    owner_user_id,
    due_at,
    status,
    priority,
    source
  )
  values(
    v_task_title,
    'recruitment_followup',
    v_owner,
    p_next_action_at,
    'open',
    least(5,greatest(1,coalesce(v_priority,3))),
    'recruitment:'||p_prospect_id::text
  );

  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at)
  values(
    'RECRUITMENT_NEXT_ACTION_SET',
    (select auth.uid()),
    jsonb_build_object(
      'prospect_id',p_prospect_id,
      'next_action_at',p_next_action_at,
      'note',nullif(trim(coalesce(p_note,'')),''),
      'task_title',v_task_title
    ),
    'recruitment',
    1,
    now()
  );

  return jsonb_build_object(
    'prospect_id',p_prospect_id,
    'next_action_at',p_next_action_at,
    'task_title',v_task_title
  );
end
$function$


CREATE OR REPLACE FUNCTION public.djm_recruitment_set_stage(p_prospect_id uuid, p_stage text, p_next_action_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_current_stage text;
  v_first_contact timestamptz;
  v_last_contact timestamptz;
begin
  if not exists(
    select 1
    from djm_os.team_members tm
    where tm.user_id=(select auth.uid())
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  if p_stage not in (
    'identified','researching','ready_to_contact','contacted','replied','call_booked',
    'interested','terms_discussed','agreement_sent','negotiating','signed','paused','declined','lost'
  ) then
    raise exception 'Invalid recruitment stage';
  end if;

  select recruitment_stage, first_contact_at, last_contact_at
  into v_current_stage, v_first_contact, v_last_contact
  from djm_os.scouting_prospects
  where id=p_prospect_id
    and linked_player_id is null;

  if v_current_stage is null then
    raise exception 'Recruitment target not found';
  end if;

  update djm_os.scouting_prospects
  set
    recruitment_stage=p_stage,
    first_contact_at=case
      when p_stage in ('contacted','replied','call_booked','interested','terms_discussed','agreement_sent','negotiating','signed')
        then coalesce(first_contact_at, now())
      else first_contact_at
    end,
    last_contact_at=case
      when p_stage='contacted'
       and v_current_stage in ('identified','researching','ready_to_contact')
        then coalesce(last_contact_at, now())
      else last_contact_at
    end,
    next_action_at=p_next_action_at,
    recruitment_notes=case
      when p_note is null or trim(p_note)='' then recruitment_notes
      else concat_ws(E'\n',nullif(recruitment_notes,''),trim(p_note))
    end,
    updated_at=now()
  where id=p_prospect_id
    and linked_player_id is null;

  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at)
  values(
    'RECRUITMENT_STAGE_CHANGED',
    (select auth.uid()),
    jsonb_build_object(
      'prospect_id',p_prospect_id,
      'from_stage',v_current_stage,
      'stage',p_stage,
      'next_action_at',p_next_action_at
    ),
    'recruitment',
    1,
    now()
  );

  return jsonb_build_object('prospect_id',p_prospect_id,'stage',p_stage);
end
$function$


CREATE OR REPLACE FUNCTION public.djm_recruitment_target(p_prospect_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v jsonb;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  select jsonb_build_object(
    'target', to_jsonb(sp),
    'interactions', coalesce((select jsonb_agg(x order by x.occurred_at desc) from (select ri.id,ri.channel,ri.direction,ri.summary,ri.occurred_at,ri.source,tm.display_name as owner_name from djm_os.recruitment_interactions ri left join djm_os.team_members tm on tm.user_id=ri.owner_user_id where ri.prospect_id=sp.id order by ri.occurred_at desc limit 100) x),'[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(x order by x.due_at nulls last) from (select t.id,t.title,t.status,t.priority,t.due_at,t.source from djm_os.tasks t where t.source=('recruitment:'||sp.id::text) and t.status not in ('completed','cancelled') order by t.due_at nulls last) x),'[]'::jsonb)
  ) into v
  from djm_os.scouting_prospects sp
  where sp.id=p_prospect_id and sp.linked_player_id is null;
  return v;
end $function$


CREATE OR REPLACE FUNCTION public.djm_recruitment_targets(p_search text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_limit integer DEFAULT 250)
 RETURNS TABLE(id uuid, full_name text, date_of_birth date, nationality text, current_club text, current_country text, primary_position text, preferred_foot text, transfermarkt_url text, instagram_url text, agent_status text, agent_name text, availability_status text, recruitment_stage text, recruitment_priority smallint, owner_user_id uuid, first_contact_at timestamp with time zone, last_contact_at timestamp with time zone, next_action_at timestamp with time zone, preferred_contact_channel text, notes text, recruitment_notes text, updated_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select s.id,s.full_name,s.date_of_birth,s.nationality,s.current_club,s.current_country,s.primary_position,s.preferred_foot,s.transfermarkt_url,s.instagram_url,s.agent_status,s.agent_name,s.availability_status,s.recruitment_stage,s.recruitment_priority,s.owner_user_id,s.first_contact_at,s.last_contact_at,s.next_action_at,s.preferred_contact_channel,s.notes,s.recruitment_notes,s.updated_at
  from djm_os.scouting_prospects s
  where s.linked_player_id is null
    and (p_stage is null or p_stage='' or s.recruitment_stage=p_stage)
    and (p_search is null or p_search='' or concat_ws(' ',s.full_name,s.current_club,s.current_country,s.primary_position,s.nationality,s.agent_name) ilike '%'||p_search||'%')
  order by
    case
      when s.recruitment_stage not in ('signed','declined','lost','paused') and s.next_action_at is not null and s.next_action_at < now() then 0
      when s.recruitment_stage not in ('signed','declined','lost','paused') and s.first_contact_at is not null and s.next_action_at is null then 1
      when s.recruitment_stage not in ('signed','declined','lost','paused') and s.next_action_at is not null then 2
      when s.recruitment_stage not in ('signed','declined','lost','paused') and s.first_contact_at is null then 3
      else 4
    end,
    s.next_action_at asc nulls last,
    s.recruitment_priority desc,
    s.updated_at desc
  limit greatest(1,least(coalesce(p_limit,250),500));
$function$


CREATE OR REPLACE FUNCTION public.djm_recruitment_update_profile(p_prospect_id uuid, p_transfermarkt_url text DEFAULT NULL::text, p_market_value numeric DEFAULT NULL::numeric, p_market_value_currency text DEFAULT NULL::text, p_whatsapp text DEFAULT NULL::text, p_instagram_url text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_agent_status text DEFAULT NULL::text, p_agent_name text DEFAULT NULL::text, p_contract_expiry date DEFAULT NULL::date, p_current_club text DEFAULT NULL::text, p_current_country text DEFAULT NULL::text, p_primary_position text DEFAULT NULL::text, p_date_of_birth date DEFAULT NULL::date, p_nationality text DEFAULT NULL::text, p_preferred_foot text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
 update djm_os.scouting_prospects set
   transfermarkt_url=coalesce(nullif(btrim(p_transfermarkt_url),''),transfermarkt_url),
   market_value=coalesce(p_market_value,market_value),
   market_value_currency=coalesce(nullif(btrim(p_market_value_currency),''),market_value_currency),
   whatsapp=coalesce(nullif(btrim(p_whatsapp),''),whatsapp),
   instagram_url=coalesce(nullif(btrim(p_instagram_url),''),instagram_url),
   email=coalesce(nullif(lower(btrim(p_email)),''),email),
   agent_status=coalesce(nullif(btrim(p_agent_status),''),agent_status),
   agent_name=coalesce(nullif(btrim(p_agent_name),''),agent_name),
   contract_expiry=coalesce(p_contract_expiry,contract_expiry),
   current_club=coalesce(nullif(btrim(p_current_club),''),current_club),
   current_country=coalesce(nullif(btrim(p_current_country),''),current_country),
   primary_position=coalesce(nullif(btrim(p_primary_position),''),primary_position),
   date_of_birth=coalesce(p_date_of_birth,date_of_birth),
   nationality=coalesce(nullif(btrim(p_nationality),''),nationality),
   preferred_foot=coalesce(nullif(btrim(p_preferred_foot),''),preferred_foot),
   updated_at=now()
 where id=p_prospect_id and linked_player_id is null;
 if not found then raise exception 'Recruitment target not found'; end if;
 return jsonb_build_object('updated',true,'prospect_id',p_prospect_id);
end $function$


CREATE OR REPLACE FUNCTION public.djm_recruitment_upsert_target(p_full_name text, p_date_of_birth date DEFAULT NULL::date, p_nationality text DEFAULT NULL::text, p_current_club text DEFAULT NULL::text, p_current_country text DEFAULT NULL::text, p_primary_position text DEFAULT NULL::text, p_secondary_positions text[] DEFAULT '{}'::text[], p_preferred_foot text DEFAULT NULL::text, p_contract_expiry date DEFAULT NULL::date, p_transfermarkt_url text DEFAULT NULL::text, p_instagram_url text DEFAULT NULL::text, p_whatsapp text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_agent_status text DEFAULT NULL::text, p_agent_name text DEFAULT NULL::text, p_availability_status text DEFAULT 'unknown'::text, p_recruitment_priority smallint DEFAULT 3, p_recruitment_source text DEFAULT 'manual'::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_id uuid; v_key text; v_created boolean:=false; v_tm text:=nullif(trim(coalesce(p_transfermarkt_url,'')),'');
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  if p_full_name is null or length(trim(p_full_name))<2 then raise exception 'Player name is required'; end if;
  if p_recruitment_priority<1 or p_recruitment_priority>5 then raise exception 'Priority must be 1-5'; end if;
  if p_availability_status not in ('unknown','monitor','approachable','available','represented','signed_djm','not_interested','do_not_contact') then raise exception 'Invalid availability status'; end if;
  v_key:=lower(regexp_replace(trim(p_full_name),'[^a-zA-Z0-9]+','-','g'))||':'||coalesce(to_char(p_date_of_birth,'YYYY-MM-DD'),'unknown');
  if v_tm is not null then select id into v_id from djm_os.scouting_prospects where lower(trim(transfermarkt_url))=lower(v_tm) limit 1; end if;
  if v_id is null then select id into v_id from djm_os.scouting_prospects where canonical_key=v_key limit 1; end if;
  if v_id is null then
    insert into djm_os.scouting_prospects(full_name,date_of_birth,nationality,current_club,current_country,primary_position,secondary_positions,preferred_foot,contract_expiry,transfermarkt_url,instagram_url,whatsapp,email,agent_status,agent_name,availability_status,source,recruitment_source,source_confidence,owner_user_id,canonical_key,last_verified_at,notes,recruitment_priority,recruitment_stage)
    values(trim(p_full_name),p_date_of_birth,nullif(trim(p_nationality),''),nullif(trim(p_current_club),''),nullif(trim(p_current_country),''),nullif(trim(p_primary_position),''),coalesce(p_secondary_positions,'{}'::text[]),nullif(trim(p_preferred_foot),''),p_contract_expiry,v_tm,nullif(trim(p_instagram_url),''),nullif(trim(p_whatsapp),''),nullif(lower(trim(p_email)),''),nullif(trim(p_agent_status),''),nullif(trim(p_agent_name),''),p_availability_status,'recruitment',coalesce(nullif(trim(p_recruitment_source),''),'manual'),1,(select auth.uid()),v_key,now(),nullif(trim(p_notes),''),p_recruitment_priority,'identified') returning id into v_id;
    v_created:=true;
  else
    update djm_os.scouting_prospects set full_name=coalesce(nullif(trim(p_full_name),''),full_name),date_of_birth=coalesce(p_date_of_birth,date_of_birth),nationality=coalesce(nullif(trim(p_nationality),''),nationality),current_club=coalesce(nullif(trim(p_current_club),''),current_club),current_country=coalesce(nullif(trim(p_current_country),''),current_country),primary_position=coalesce(nullif(trim(p_primary_position),''),primary_position),secondary_positions=case when cardinality(coalesce(p_secondary_positions,'{}'::text[]))>0 then p_secondary_positions else secondary_positions end,preferred_foot=coalesce(nullif(trim(p_preferred_foot),''),preferred_foot),contract_expiry=coalesce(p_contract_expiry,contract_expiry),transfermarkt_url=coalesce(v_tm,transfermarkt_url),instagram_url=coalesce(nullif(trim(p_instagram_url),''),instagram_url),whatsapp=coalesce(nullif(trim(p_whatsapp),''),whatsapp),email=coalesce(nullif(lower(trim(p_email)),''),email),agent_status=coalesce(nullif(trim(p_agent_status),''),agent_status),agent_name=coalesce(nullif(trim(p_agent_name),''),agent_name),availability_status=coalesce(p_availability_status,availability_status),recruitment_priority=coalesce(p_recruitment_priority,recruitment_priority),recruitment_source=coalesce(nullif(trim(p_recruitment_source),''),recruitment_source),notes=coalesce(nullif(trim(p_notes),''),notes),last_verified_at=now(),updated_at=now() where id=v_id;
  end if;
  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at) values(case when v_created then 'RECRUITMENT_TARGET_CREATED' else 'RECRUITMENT_TARGET_UPDATED' end,(select auth.uid()),jsonb_build_object('prospect_id',v_id,'name',trim(p_full_name),'priority',p_recruitment_priority),'recruitment',1,now());
  return jsonb_build_object('prospect_id',v_id,'created',v_created);
end $function$


CREATE OR REPLACE FUNCTION public.djm_refresh_player_data_context(p_mode text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_provider text;
  v_provider_competition_id text;
  v_league text;
  v_country text;
  v_tier integer;
  v_user_id uuid;
  v_canonical_key text;
  v_benchmark_key text;
  v_penalty integer;
  v_strength integer;
  v_competition djm_os.competitions%rowtype;
  v_anchor djm_os.country_league_strength_anchors%rowtype;
  v_benchmark_id uuid;
  v_aliases text[];
begin
  if p_mode = 'status' then
    return jsonb_build_object(
      'benchmark_anchors',
      (select count(*) from djm_os.country_league_strength_anchors)
    );
  end if;

  if p_mode <> 'benchmark' then
    raise exception 'Unsupported player-data context mode.';
  end if;

  v_provider := lower(trim(coalesce(p_payload ->> 'provider', '')));
  v_provider_competition_id := nullif(trim(p_payload ->> 'provider_competition_id'), '');
  v_league := nullif(trim(p_payload ->> 'league'), '');
  v_country := nullif(trim(p_payload ->> 'country'), '');
  v_tier := nullif(p_payload ->> 'tier', '')::integer;
  v_user_id := nullif(p_payload ->> 'user_id', '')::uuid;

  if v_provider <> 'pitchapi'
     or v_provider_competition_id is null
     or v_league is null then
    raise exception 'PitchAPI competition identity and league are required.';
  end if;

  if v_tier is not null and (v_tier < 1 or v_tier > 5) then
    raise exception 'Competition tier must be between one and five.';
  end if;

  v_canonical_key := v_provider || ':' || v_provider_competition_id;

  select *
  into v_competition
  from djm_os.competitions competition
  where competition.canonical_key = v_canonical_key
  limit 1;

  if found then
    v_aliases := array(
      select distinct aliases.alias
      from unnest(
        coalesce(v_competition.aliases, '{}'::text[]) || array[v_league]
      ) as aliases(alias)
      where nullif(trim(aliases.alias), '') is not null
    );

    update djm_os.competitions
    set display_name = v_league,
        country = v_country,
        level_tier = v_tier,
        aliases = v_aliases,
        provider_ids = coalesce(provider_ids, '{}'::jsonb)
          || jsonb_build_object(v_provider, v_provider_competition_id),
        updated_by = v_user_id,
        updated_at = now()
    where id = v_competition.id
    returning * into v_competition;
  else
    insert into djm_os.competitions(
      canonical_key,
      display_name,
      country,
      level_tier,
      aliases,
      provider_ids,
      created_by,
      updated_by
    )
    values (
      v_canonical_key,
      v_league,
      v_country,
      v_tier,
      array[v_league],
      jsonb_build_object(v_provider, v_provider_competition_id),
      v_user_id,
      v_user_id
    )
    returning * into v_competition;
  end if;

  if v_tier is null or v_country is null then
    return jsonb_build_object(
      'competitionId', v_competition.id,
      'benchmark', null
    );
  end if;

  select *
  into v_anchor
  from djm_os.country_league_strength_anchors anchor
  where lower(anchor.country) = lower(v_country)
  limit 1;

  if not found then
    return jsonb_build_object(
      'competitionId', v_competition.id,
      'benchmark', null
    );
  end if;

  v_penalty := case v_tier
    when 1 then 0
    when 2 then 12
    when 3 then 20
    when 4 then 27
    when 5 then 33
    else null
  end;
  v_strength := greatest(10, v_anchor.strength_score - v_penalty);
  v_benchmark_key := v_canonical_key || ':iffhs_2025:t' || v_tier;

  select benchmark.id
  into v_benchmark_id
  from djm_os.league_benchmarks benchmark
  where benchmark.canonical_key = v_benchmark_key
     or benchmark.competition_id = v_competition.id
  order by (benchmark.canonical_key = v_benchmark_key) desc
  limit 1;

  if v_benchmark_id is null then
    insert into djm_os.league_benchmarks(
      canonical_key,
      league_name,
      country,
      strength_score,
      source_url,
      source_note,
      verified_at,
      updated_by,
      competition_id,
      review_cadence_days,
      raw_strength_value,
      raw_strength_scale,
      benchmark_provider,
      benchmark_metric,
      methodology,
      methodology_version,
      source_reference,
      observed_at,
      next_review_at
    )
    values (
      v_benchmark_key,
      v_league,
      v_country,
      v_strength,
      v_anchor.source_url,
      case
        when v_tier = 1 then
          'IFFHS 2025 national top-division anchor, rank ' || v_anchor.iffhs_rank || '.'
        else
          'Derived from IFFHS 2025 national top-division anchor with DJM tier-'
          || v_tier || ' penalty of ' || v_penalty || ' points.'
      end,
      now(),
      v_user_id,
      v_competition.id,
      365,
      v_anchor.iffhs_points,
      'IFFHS 2025 national league points',
      case when v_tier = 1 then 'iffhs_2025' else 'djm_iffhs_tier_decay_v1' end,
      'national_league_strength',
      case
        when v_tier = 1 then v_anchor.methodology
        else v_anchor.methodology
          || ' Lower division adjustment is model-derived and explicitly tier-based.'
      end,
      'djm_global_league_strength_v1',
      'IFFHS rank ' || v_anchor.iffhs_rank || '; tier ' || v_tier,
      v_anchor.observed_at,
      '2027-02-01T00:00:00Z'::timestamptz
    );
  else
    update djm_os.league_benchmarks
    set canonical_key = v_benchmark_key,
        league_name = v_league,
        country = v_country,
        strength_score = v_strength,
        source_url = v_anchor.source_url,
        source_note = case
          when v_tier = 1 then
            'IFFHS 2025 national top-division anchor, rank ' || v_anchor.iffhs_rank || '.'
          else
            'Derived from IFFHS 2025 national top-division anchor with DJM tier-'
            || v_tier || ' penalty of ' || v_penalty || ' points.'
        end,
        verified_at = now(),
        updated_by = v_user_id,
        competition_id = v_competition.id,
        review_cadence_days = 365,
        raw_strength_value = v_anchor.iffhs_points,
        raw_strength_scale = 'IFFHS 2025 national league points',
        benchmark_provider = case
          when v_tier = 1 then 'iffhs_2025'
          else 'djm_iffhs_tier_decay_v1'
        end,
        benchmark_metric = 'national_league_strength',
        methodology = case
          when v_tier = 1 then v_anchor.methodology
          else v_anchor.methodology
            || ' Lower division adjustment is model-derived and explicitly tier-based.'
        end,
        methodology_version = 'djm_global_league_strength_v1',
        source_reference = 'IFFHS rank ' || v_anchor.iffhs_rank || '; tier ' || v_tier,
        observed_at = v_anchor.observed_at,
        next_review_at = '2027-02-01T00:00:00Z'::timestamptz,
        updated_at = now()
    where id = v_benchmark_id;
  end if;

  return jsonb_build_object(
    'competitionId', v_competition.id,
    'benchmark', jsonb_build_object(
      'strength_score', v_strength,
      'tier', v_tier,
      'source', case
        when v_tier = 1 then 'IFFHS 2025'
        else 'IFFHS 2025 + DJM tier decay'
      end
    )
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_refresh_player_global_intelligence(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_subject_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  select s.id into v_subject_id from djm_os.football_intelligence_subjects s where s.player_id=p_player_id limit 1;
  if v_subject_id is null then
    return jsonb_build_object('available',false,'reason','global_subject_not_initialised','player_id',p_player_id);
  end if;
  return public.djm_refresh_subject_global_intelligence(v_subject_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_refresh_subject_global_intelligence(p_subject_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  -- The scorecard write triggers the projection refresh, so one canonical rebuild is enough.
  perform djm_os.refresh_football_subject_scorecard(p_subject_id);
  return public.djm_subject_global_intelligence(p_subject_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_register_channel_connection(p_channel text, p_provider text, p_external_account_id text DEFAULT NULL::text, p_display_label text DEFAULT NULL::text, p_capabilities text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_id uuid; begin if trim(coalesce(p_channel,''))='' then raise exception 'Channel required'; end if; insert into djm_os.channel_connections(user_id,channel,provider,external_account_id,display_label,status,capabilities) values(auth.uid(),lower(trim(p_channel)),nullif(lower(trim(coalesce(p_provider,''))),''),nullif(trim(coalesce(p_external_account_id,'')),''),nullif(trim(coalesce(p_display_label,'')),''),'configured',coalesce(p_capabilities,'{}'::text[])) on conflict(user_id,channel,provider,external_account_id) do update set display_label=coalesce(excluded.display_label,djm_os.channel_connections.display_label),capabilities=excluded.capabilities,status='configured',updated_at=now() returning id into v_id; return jsonb_build_object('id',v_id,'status','configured'); end; $function$


CREATE OR REPLACE FUNCTION public.djm_register_competition_context(p_player_id uuid, p_league_name text, p_country text, p_tier smallint DEFAULT NULL::smallint, p_strength_score smallint DEFAULT NULL::smallint, p_source_name text DEFAULT NULL::text, p_source_url text DEFAULT NULL::text, p_source_reference text DEFAULT NULL::text, p_methodology text DEFAULT NULL::text, p_observed_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  p public.players%rowtype;
  a djm_os.country_league_strength_anchors%rowtype;
  c djm_os.competitions%rowtype;
  v_league text := nullif(trim(p_league_name),'');
  v_country text := nullif(trim(p_country),'');
  v_key text;
  v_benchmark_key text;
  v_auto jsonb;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  select * into p from public.players where id=p_player_id;
  if not found then raise exception 'Player not found'; end if;

  v_league := coalesce(v_league,nullif(trim(p.current_league),''));
  v_country := coalesce(v_country,nullif(trim(p.current_country),''));
  if v_league is null or v_country is null then
    return jsonb_build_object('resolved',false,'reason','league_or_country_missing');
  end if;

  if p.current_league is not null and lower(trim(p.current_league)) <> lower(v_league) then
    raise exception 'League does not match the player current league';
  end if;
  if p.current_country is not null and lower(trim(p.current_country)) <> lower(v_country) then
    raise exception 'Country does not match the player current country';
  end if;

  update public.players
  set current_league=coalesce(current_league,v_league),
      current_country=coalesce(current_country,v_country),
      updated_at=now()
  where id=p_player_id;

  if p_tier is not null then
    if p_tier < 1 or p_tier > 5 then
      raise exception 'Competition tier must be between 1 and 5';
    end if;

    select * into a
    from djm_os.country_league_strength_anchors
    where lower(country)=lower(v_country)
    limit 1;

    if found then
      insert into private.djm_competition_tier_aliases(
        country_key,league_key,country_name,canonical_name,tier
      ) values(
        lower(v_country),lower(v_league),v_country,v_league,p_tier
      )
      on conflict(country_key,league_key) do update set
        country_name=excluded.country_name,
        canonical_name=excluded.canonical_name,
        tier=excluded.tier;

      v_auto := private.djm_autoresolve_player_benchmark(p_player_id);
      if coalesce((v_auto->>'resolved')::boolean,false) then
        return v_auto || jsonb_build_object(
          'resolution_method','reviewed_tier_plus_country_anchor',
          'source_name',coalesce(p_source_name,'Admin reviewed league tier'),
          'source_reference',p_source_reference
        );
      end if;
    end if;
  end if;

  if p_strength_score is null then
    return jsonb_build_object(
      'resolved',false,
      'reason',case when p_tier is not null then 'country_anchor_missing_manual_strength_required' else 'tier_or_manual_strength_required' end
    );
  end if;

  if p_strength_score < 0 or p_strength_score > 100 then
    raise exception 'Manual league strength must be between 0 and 100';
  end if;
  if nullif(trim(coalesce(p_source_name,'')),'') is null then
    raise exception 'A source name is required for a manual league benchmark';
  end if;
  if nullif(trim(coalesce(p_methodology,'')),'') is null then
    raise exception 'A methodology is required for a manual league benchmark';
  end if;
  if nullif(trim(coalesce(p_source_reference,'')),'') is null and nullif(trim(coalesce(p_source_url,'')),'') is null then
    raise exception 'A source reference or source URL is required for a manual league benchmark';
  end if;

  v_key := 'reviewed:'||md5(lower(v_country)||'|'||lower(v_league));

  select * into c from djm_os.competitions where canonical_key=v_key limit 1;
  if not found then
    insert into djm_os.competitions(
      canonical_key,display_name,country,level_tier,aliases,provider_ids,created_by,updated_by
    ) values(
      v_key,v_league,v_country,p_tier,array[v_league],jsonb_build_object('reviewed_context',true),auth.uid(),auth.uid()
    ) returning * into c;
  else
    update djm_os.competitions
    set display_name=v_league,
        country=v_country,
        level_tier=coalesce(p_tier,level_tier),
        aliases=(select array_agg(distinct x) from unnest(coalesce(aliases,'{}'::text[])||array[v_league]) x),
        updated_by=auth.uid(),
        updated_at=now()
    where id=c.id
    returning * into c;
  end if;

  update public.players
  set current_competition_id=c.id,updated_at=now()
  where id=p_player_id;

  update public.career_entries
  set competition_id=c.id,updated_at=now()
  where player_id=p_player_id
    and lower(coalesce(league,''))=lower(v_league)
    and competition_id is null;

  v_benchmark_key := v_key||':manual_reviewed';
  insert into djm_os.league_benchmarks(
    canonical_key,league_name,country,strength_score,source_url,source_note,
    verified_at,updated_by,competition_id,review_cadence_days,raw_strength_value,
    raw_strength_scale,benchmark_provider,benchmark_metric,methodology,
    methodology_version,source_reference,observed_at,next_review_at
  ) values(
    v_benchmark_key,v_league,v_country,p_strength_score,p_source_url,
    'Admin-reviewed global competition benchmark from '||p_source_name,
    now(),auth.uid(),c.id,365,p_strength_score,'DJM reviewed global 0-100 scale',
    'manual_reviewed','global_league_strength',p_methodology,
    'djm_reviewed_global_benchmark_v1',p_source_reference,
    coalesce(p_observed_at,now()),now()+interval '365 days'
  )
  on conflict(canonical_key) do update set
    league_name=excluded.league_name,
    country=excluded.country,
    strength_score=excluded.strength_score,
    source_url=excluded.source_url,
    source_note=excluded.source_note,
    verified_at=excluded.verified_at,
    updated_by=excluded.updated_by,
    competition_id=excluded.competition_id,
    raw_strength_value=excluded.raw_strength_value,
    raw_strength_scale=excluded.raw_strength_scale,
    benchmark_provider=excluded.benchmark_provider,
    benchmark_metric=excluded.benchmark_metric,
    methodology=excluded.methodology,
    methodology_version=excluded.methodology_version,
    source_reference=excluded.source_reference,
    observed_at=excluded.observed_at,
    next_review_at=excluded.next_review_at,
    stale_at=null,
    stale_reason=null,
    updated_at=now();

  return jsonb_build_object(
    'resolved',true,
    'competition_id',c.id,
    'competition_name',v_league,
    'country',v_country,
    'tier',p_tier,
    'strength_score',p_strength_score,
    'resolution_method','manual_reviewed_global_benchmark',
    'source_name',p_source_name,
    'source_reference',p_source_reference
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_remove_player_preserve_linked_account(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    exists(
      select 1
      from public.profiles p
      where p.id = p_user_id
        and p.role in ('admin','scout')
    )
    or exists(
      select 1
      from djm_os.team_members tm
      where tm.user_id = p_user_id
        and tm.is_active = true
    );
$function$


CREATE OR REPLACE FUNCTION public.djm_replace_official_league_evidence(p_snapshot jsonb, p_peers jsonb, p_matches jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player_id uuid := nullif(trim(p_snapshot ->> 'player_id'), '')::uuid;
  v_provider_player_id text := nullif(trim(p_snapshot ->> 'provider_player_id'), '');
  v_provider_competition_id text := nullif(trim(p_snapshot ->> 'provider_competition_id'), '');
  v_provider_season_id text := nullif(trim(p_snapshot ->> 'provider_season_id'), '');
  v_peer_count integer := 0;
  v_match_count integer := 0;
  v_snapshot_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if v_player_id is null or not exists(select 1 from public.players p where p.id = v_player_id) then
    raise exception 'Valid player is required';
  end if;

  if v_provider_player_id is null
     or v_provider_competition_id <> 'veikkausliiga'
     or v_provider_season_id !~ '^\d{4}$' then
    raise exception 'Valid official Veikkausliiga provider identity is required';
  end if;

  if jsonb_typeof(p_peers) <> 'array' or jsonb_array_length(p_peers) < 20 then
    raise exception 'At least 20 observed official league players are required';
  end if;

  if p_matches is null then
    p_matches := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_matches) <> 'array' then
    raise exception 'Official match evidence must be an array';
  end if;

  insert into djm_os.player_provider_stat_snapshots(
    player_id,
    provider,
    provider_player_id,
    provider_team_id,
    provider_competition_id,
    provider_season_id,
    season_label,
    club_name,
    competition_name,
    metrics,
    observed_at,
    synced_at,
    metric_schema_version,
    data_depth,
    confidence,
    payload_hash,
    request_metadata,
    raw_payload_retention
  )
  values (
    v_player_id,
    'official_league',
    v_provider_player_id,
    coalesce(p_snapshot ->> 'provider_team_id', ''),
    v_provider_competition_id,
    v_provider_season_id,
    nullif(trim(p_snapshot ->> 'season_label'), ''),
    nullif(trim(p_snapshot ->> 'club_name'), ''),
    nullif(trim(p_snapshot ->> 'competition_name'), ''),
    coalesce(p_snapshot -> 'metrics', '{}'::jsonb),
    coalesce(nullif(p_snapshot ->> 'observed_at', '')::timestamptz, now()),
    coalesce(nullif(p_snapshot ->> 'synced_at', '')::timestamptz, now()),
    coalesce(nullif(trim(p_snapshot ->> 'metric_schema_version'), ''), 'djm_official_basic_v1'),
    coalesce(nullif(trim(p_snapshot ->> 'data_depth'), ''), 'basic_official'),
    coalesce(nullif(p_snapshot ->> 'confidence', '')::numeric, 0.99),
    nullif(trim(p_snapshot ->> 'payload_hash'), ''),
    coalesce(p_snapshot -> 'request_metadata', '{}'::jsonb),
    coalesce(nullif(trim(p_snapshot ->> 'raw_payload_retention'), ''), 'normalised_only')
  )
  on conflict(
    player_id,
    provider,
    provider_season_id,
    provider_competition_id,
    provider_team_id
  )
  do update set
    provider_player_id = excluded.provider_player_id,
    season_label = excluded.season_label,
    club_name = excluded.club_name,
    competition_name = excluded.competition_name,
    metrics = excluded.metrics,
    observed_at = excluded.observed_at,
    synced_at = excluded.synced_at,
    metric_schema_version = excluded.metric_schema_version,
    data_depth = excluded.data_depth,
    confidence = excluded.confidence,
    payload_hash = excluded.payload_hash,
    request_metadata = excluded.request_metadata,
    raw_payload_retention = excluded.raw_payload_retention,
    updated_at = now()
  returning id into v_snapshot_id;

  delete from djm_os.provider_peer_stat_snapshots
  where provider = 'official_league'
    and provider_competition_id = v_provider_competition_id
    and provider_season_id = v_provider_season_id;

  insert into djm_os.provider_peer_stat_snapshots(
    provider,
    provider_competition_id,
    provider_season_id,
    provider_player_id,
    provider_team_id,
    player_name,
    team_name,
    provider_position,
    minutes,
    metrics,
    observed_at,
    synced_at,
    metric_schema_version,
    data_depth,
    confidence,
    payload_hash,
    request_metadata,
    raw_payload_retention
  )
  select
    'official_league',
    v_provider_competition_id,
    v_provider_season_id,
    r.provider_player_id,
    coalesce(r.provider_team_id, ''),
    r.player_name,
    r.team_name,
    r.provider_position,
    r.minutes,
    coalesce(r.metrics, '{}'::jsonb),
    coalesce(r.observed_at, now()),
    coalesce(r.synced_at, now()),
    coalesce(r.metric_schema_version, 'djm_official_basic_v1'),
    coalesce(r.data_depth, 'basic_official'),
    coalesce(r.confidence, 0.99),
    r.payload_hash,
    coalesce(r.request_metadata, '{}'::jsonb),
    coalesce(r.raw_payload_retention, 'normalised_only')
  from jsonb_to_recordset(p_peers) as r(
    provider_player_id text,
    provider_team_id text,
    player_name text,
    team_name text,
    provider_position text,
    minutes integer,
    metrics jsonb,
    observed_at timestamptz,
    synced_at timestamptz,
    metric_schema_version text,
    data_depth text,
    confidence numeric,
    payload_hash text,
    request_metadata jsonb,
    raw_payload_retention text
  )
  where nullif(trim(coalesce(r.provider_player_id, '')), '') is not null;

  get diagnostics v_peer_count = row_count;
  if v_peer_count < 20 then
    raise exception 'Fewer than 20 valid official league players were supplied';
  end if;

  insert into djm_os.player_match_stat_snapshots(
    player_id,
    fixture_id,
    competition_id,
    team_id,
    opponent_team_id,
    provider,
    provider_player_id,
    provider_match_id,
    provider_team_id,
    provider_opponent_id,
    provider_competition_id,
    provider_season_id,
    season_label,
    match_date,
    kickoff_at,
    team_name,
    opponent_name,
    home_away,
    position_group,
    provider_position,
    started,
    minutes,
    metrics,
    metric_schema_version,
    data_depth,
    confidence,
    observed_at,
    synced_at,
    payload_hash,
    request_metadata
  )
  select
    v_player_id,
    r.fixture_id,
    r.competition_id,
    r.team_id,
    r.opponent_team_id,
    'official_league',
    v_provider_player_id,
    r.provider_match_id,
    r.provider_team_id,
    r.provider_opponent_id,
    v_provider_competition_id,
    v_provider_season_id,
    coalesce(r.season_label, v_provider_season_id),
    r.match_date,
    r.kickoff_at,
    r.team_name,
    r.opponent_name,
    r.home_away,
    r.position_group,
    r.provider_position,
    r.started,
    r.minutes,
    coalesce(r.metrics, '{}'::jsonb),
    coalesce(r.metric_schema_version, 'djm_official_match_basic_v1'),
    coalesce(r.data_depth, 'basic_official'),
    coalesce(r.confidence, 0.99),
    coalesce(r.observed_at, now()),
    coalesce(r.synced_at, now()),
    r.payload_hash,
    coalesce(r.request_metadata, '{}'::jsonb)
  from jsonb_to_recordset(p_matches) as r(
    fixture_id uuid,
    competition_id uuid,
    team_id uuid,
    opponent_team_id uuid,
    provider_match_id text,
    provider_team_id text,
    provider_opponent_id text,
    season_label text,
    match_date date,
    kickoff_at timestamptz,
    team_name text,
    opponent_name text,
    home_away text,
    position_group text,
    provider_position text,
    started boolean,
    minutes integer,
    metrics jsonb,
    metric_schema_version text,
    data_depth text,
    confidence numeric,
    observed_at timestamptz,
    synced_at timestamptz,
    payload_hash text,
    request_metadata jsonb
  )
  where nullif(trim(coalesce(r.provider_match_id, '')), '') is not null
    and r.match_date is not null
  on conflict(provider, provider_match_id, provider_player_id)
  do update set
    competition_id = excluded.competition_id,
    provider_team_id = excluded.provider_team_id,
    provider_opponent_id = excluded.provider_opponent_id,
    season_label = excluded.season_label,
    match_date = excluded.match_date,
    kickoff_at = excluded.kickoff_at,
    team_name = excluded.team_name,
    opponent_name = excluded.opponent_name,
    home_away = excluded.home_away,
    position_group = excluded.position_group,
    provider_position = excluded.provider_position,
    started = excluded.started,
    minutes = excluded.minutes,
    metrics = excluded.metrics,
    metric_schema_version = excluded.metric_schema_version,
    data_depth = excluded.data_depth,
    confidence = excluded.confidence,
    observed_at = excluded.observed_at,
    synced_at = excluded.synced_at,
    payload_hash = excluded.payload_hash,
    request_metadata = excluded.request_metadata,
    updated_at = now();

  get diagnostics v_match_count = row_count;

  return jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'peer_count', v_peer_count,
    'match_count', v_match_count,
    'provider', 'official_league',
    'provider_competition_id', v_provider_competition_id,
    'provider_season_id', v_provider_season_id
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_replace_provider_peer_cache(p_provider_competition_id text, p_provider_season_id text, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count integer;
begin
  if nullif(trim(coalesce(p_provider_competition_id, '')), '') is null
     or nullif(trim(coalesce(p_provider_season_id, '')), '') is null then
    raise exception 'Provider competition and season are required.';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 6 then
    raise exception 'At least six observed provider peers are required.';
  end if;

  delete from djm_os.provider_peer_stat_snapshots
  where provider = 'pitchapi'
    and provider_competition_id = p_provider_competition_id
    and provider_season_id = p_provider_season_id;

  insert into djm_os.provider_peer_stat_snapshots(
    provider,
    provider_competition_id,
    provider_season_id,
    provider_player_id,
    provider_team_id,
    player_name,
    team_name,
    provider_position,
    minutes,
    metrics,
    observed_at,
    synced_at
  )
  select
    'pitchapi',
    p_provider_competition_id,
    p_provider_season_id,
    r.provider_player_id,
    coalesce(r.provider_team_id, ''),
    r.player_name,
    r.team_name,
    r.provider_position,
    r.minutes,
    coalesce(r.metrics, '{}'::jsonb),
    coalesce(r.observed_at, now()),
    coalesce(r.synced_at, now())
  from jsonb_to_recordset(p_rows) as r(
    provider_player_id text,
    provider_team_id text,
    player_name text,
    team_name text,
    provider_position text,
    minutes integer,
    metrics jsonb,
    observed_at timestamptz,
    synced_at timestamptz
  )
  where nullif(trim(coalesce(r.provider_player_id, '')), '') is not null
  on conflict(provider, provider_competition_id, provider_season_id, provider_player_id, provider_team_id)
  do update set
    player_name = excluded.player_name,
    team_name = excluded.team_name,
    provider_position = excluded.provider_position,
    minutes = excluded.minutes,
    metrics = excluded.metrics,
    observed_at = excluded.observed_at,
    synced_at = excluded.synced_at,
    updated_at = now();

  get diagnostics v_count = row_count;

  if v_count < 6 then
    raise exception 'Fewer than six valid provider peers were supplied.';
  end if;

  return v_count;
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_resolve_review_item(p_review_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v text:=lower(trim(p_action)); begin
 if v not in ('resolved','dismissed','snoozed') then raise exception 'Invalid action'; end if;
 update djm_os.review_items set status=v,resolved_at=case when v in ('resolved','dismissed') then now() else null end where id=p_review_id and (owner_user_id is null or owner_user_id=auth.uid());
 if not found then raise exception 'Review item not found'; end if;
 return jsonb_build_object('review_id',p_review_id,'status',v);
end; $function$


CREATE OR REPLACE FUNCTION public.djm_review_queue(p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, review_type text, title text, detail text, person_id uuid, organisation_id uuid, player_id uuid, club_need_id uuid, capture_id uuid, claim_id uuid, confidence numeric, payload jsonb, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select r.id,r.review_type,r.title,r.detail,r.person_id,r.organisation_id,r.player_id,r.club_need_id,r.capture_id,r.claim_id,r.confidence,r.payload,r.created_at from djm_os.review_items r where r.status='open' and (r.owner_user_id is null or r.owner_user_id=auth.uid()) order by coalesce(r.confidence,0.5) asc,r.created_at asc limit greatest(1,least(coalesce(p_limit,50),200)); $function$


CREATE OR REPLACE FUNCTION public.djm_rollback_import(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare b djm_os.import_batches%rowtype; v_messages int:=0; v_people int:=0; v_protected int:=0; r record; v_thread uuid;
begin
 select * into b from djm_os.import_batches where id=p_batch_id and submitted_by=(select auth.uid()); if not found then raise exception 'Import batch not found'; end if;
 if b.status='rolled_back' then return jsonb_build_object('batch_id',p_batch_id,'already_rolled_back',true); end if;
 if b.source_type='whatsapp_export' then
   for r in select id,thread_id from djm_os.messages where import_batch_id=p_batch_id loop
     delete from djm_os.tasks where source_message_id=r.id; delete from djm_os.club_needs where source_message_id=r.id; delete from djm_os.review_items where payload->>'message_id'=r.id::text; delete from djm_os.events where payload->>'message_id'=r.id::text; v_thread:=r.thread_id;
   end loop;
   delete from djm_os.messages where import_batch_id=p_batch_id; get diagnostics v_messages=row_count;
   if v_thread is not null then
     update djm_os.conversation_threads t set message_count=(select count(*) from djm_os.messages m where m.thread_id=t.id),first_message_at=(select min(sent_at) from djm_os.messages m where m.thread_id=t.id),last_message_at=(select max(sent_at) from djm_os.messages m where m.thread_id=t.id),updated_at=now() where t.id=v_thread;
     perform djm_os.thread_interaction_rollup(v_thread);
     if not exists(select 1 from djm_os.messages where thread_id=v_thread) then delete from djm_os.review_items where payload->>'thread_id'=v_thread::text; delete from djm_os.interactions where source_uri='thread:'||v_thread::text; delete from djm_os.conversation_threads where id=v_thread; end if;
   end if;
 elsif b.source_type='contacts' then
   for r in select distinct person_id from djm_os.import_rows where batch_id=p_batch_id and action='created' and person_id is not null loop
     if exists(select 1 from djm_os.import_rows ir where ir.person_id=r.person_id and ir.batch_id<>p_batch_id and ir.status='processed') or exists(select 1 from djm_os.conversation_threads where person_id=r.person_id) or exists(select 1 from djm_os.interactions where person_id=r.person_id) or exists(select 1 from djm_os.tasks where person_id=r.person_id) or exists(select 1 from djm_os.club_needs where source_person_id=r.person_id) then v_protected:=v_protected+1;
     else delete from djm_os.people where id=r.person_id; if found then v_people:=v_people+1; end if; end if;
   end loop;
 end if;
 update djm_os.import_batches set status='rolled_back',summary=coalesce(summary,'{}'::jsonb)||jsonb_build_object('rollback_at',now(),'messages_removed',v_messages,'created_people_removed',v_people,'protected_people_retained',v_protected) where id=p_batch_id;
 return jsonb_build_object('batch_id',p_batch_id,'messages_removed',v_messages,'created_people_removed',v_people,'protected_people_retained',v_protected,'rolled_back',true);
end $function$


CREATE OR REPLACE FUNCTION public.djm_rotate_calendar_subscription()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
declare
  uid uuid := auth.uid();
  row_data public.calendar_subscriptions;
  next_token text := encode(extensions.gen_random_bytes(32),'hex');
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  insert into public.calendar_subscriptions(user_id,token,enabled)
  values(uid,next_token,true)
  on conflict(user_id) do update
    set token=excluded.token,
        enabled=true,
        updated_at=now()
  returning * into row_data;

  return jsonb_build_object(
    'token', row_data.token,
    'enabled', row_data.enabled,
    'updated_at', row_data.updated_at
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_run_smart_reminders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'private', 'pg_catalog'
AS $function$
begin
  if not private.is_admin() then
    raise exception 'Admin access required';
  end if;
  return private.djm_queue_smart_reminders();
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_scout_add_report(p_prospect_id uuid, p_source_type text, p_match_or_context text DEFAULT NULL::text, p_football_score smallint DEFAULT NULL::smallint, p_physical_score smallint DEFAULT NULL::smallint, p_tactical_score smallint DEFAULT NULL::smallint, p_mentality_score smallint DEFAULT NULL::smallint, p_personality_score smallint DEFAULT NULL::smallint, p_readiness_score smallint DEFAULT NULL::smallint, p_recommendation text DEFAULT NULL::text, p_strengths text DEFAULT NULL::text, p_risks text DEFAULT NULL::text, p_role_fit text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if not exists(select 1 from djm_os.scouting_prospects where id=p_prospect_id) then raise exception 'Prospect not found'; end if;
  insert into djm_os.scouting_reports(prospect_id,scout_user_id,source_type,match_or_context,football_score,physical_score,tactical_score,mentality_score,personality_score,readiness_score,recommendation,strengths,risks,role_fit,notes)
  values(p_prospect_id,auth.uid(),p_source_type,nullif(trim(p_match_or_context),''),p_football_score,p_physical_score,p_tactical_score,p_mentality_score,p_personality_score,p_readiness_score,p_recommendation,nullif(trim(p_strengths),''),nullif(trim(p_risks),''),nullif(trim(p_role_fit),''),nullif(trim(p_notes),'')) returning id into v_id;
  update djm_os.scouting_prospects set updated_at=now() where id=p_prospect_id;
  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at)
  values('SCOUT_REPORT_ADDED',auth.uid(),jsonb_build_object('prospect_id',p_prospect_id,'report_id',v_id,'recommendation',p_recommendation),'scout',1,now());
  return jsonb_build_object('report_id',v_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_scout_need_matches(p_need_id uuid)
 RETURNS TABLE(prospect_id uuid, full_name text, current_club text, primary_position text, preferred_foot text, date_of_birth date, availability_status text, scouting_score numeric, recommendation text, match_score smallint, reasoning jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with n as (select * from djm_os.club_needs where id=p_need_id), candidates as (
  select s.*,
    (select round(avg((coalesce(r.football_score,0)+coalesce(r.physical_score,0)+coalesce(r.tactical_score,0)+coalesce(r.mentality_score,0)+coalesce(r.personality_score,0)+coalesce(r.readiness_score,0))::numeric/nullif((case when r.football_score is not null then 1 else 0 end+case when r.physical_score is not null then 1 else 0 end+case when r.tactical_score is not null then 1 else 0 end+case when r.mentality_score is not null then 1 else 0 end+case when r.personality_score is not null then 1 else 0 end+case when r.readiness_score is not null then 1 else 0 end),0)),1) from djm_os.scouting_reports r where r.prospect_id=s.id) as scouting_score,
    (select r.recommendation from djm_os.scouting_reports r where r.prospect_id=s.id order by r.report_date desc,r.created_at desc limit 1) as recommendation
  from djm_os.scouting_prospects s,n
  where s.linked_player_id is null
    and s.signed_player_id is null
    and s.recruitment_stage not in ('signed','declined','lost')
    and s.availability_status in ('unknown','monitor','approachable','available')
    and djm_os.position_matches_player(n.position,s.primary_position,s.secondary_positions)
), scored as (
  select c.*,n.preferred_foot as need_foot,n.min_age as need_min_age,n.max_age as need_max_age,
    least(100,
      55
      +case when n.preferred_foot is null then 8 when lower(coalesce(c.preferred_foot,''))=lower(n.preferred_foot) then 15 else 0 end
      +case when n.min_age is null and n.max_age is null then 8 when c.date_of_birth is null then 3 when (n.min_age is null or date_part('year',age(current_date,c.date_of_birth))>=n.min_age) and (n.max_age is null or date_part('year',age(current_date,c.date_of_birth))<=n.max_age) then 12 else 0 end
      +case c.availability_status when 'available' then 10 when 'approachable' then 8 when 'monitor' then 4 else 2 end
      +case c.recommendation when 'strong_yes' then 8 when 'yes' then 6 when 'monitor' then 3 else 0 end
    )::smallint as score
  from candidates c,n
  where (n.preferred_foot is null or c.preferred_foot is null or lower(c.preferred_foot)=lower(n.preferred_foot))
    and (n.min_age is null or c.date_of_birth is null or date_part('year',age(current_date,c.date_of_birth))>=n.min_age)
    and (n.max_age is null or c.date_of_birth is null or date_part('year',age(current_date,c.date_of_birth))<=n.max_age)
)
select s.id,s.full_name,s.current_club,s.primary_position,s.preferred_foot,s.date_of_birth,s.availability_status,s.scouting_score,s.recommendation,s.score,
  jsonb_build_object('position_match',true,'foot_match',case when s.need_foot is null then null else lower(coalesce(s.preferred_foot,''))=lower(s.need_foot) end,'availability',s.availability_status,'scouting_score',s.scouting_score,'recommendation',s.recommendation)
from scored s
order by s.score desc,s.scouting_score desc nulls last,s.full_name;
$function$


CREATE OR REPLACE FUNCTION public.djm_scout_prospects(p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, full_name text, date_of_birth date, nationality text, current_club text, current_country text, primary_position text, secondary_positions text[], preferred_foot text, contract_expiry date, transfermarkt_url text, wyscout_url text, video_url text, instagram_url text, agent_status text, agent_name text, availability_status text, owner_user_id uuid, owner_name text, reports_count bigint, best_recommendation text, average_football_score numeric, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select s.id,s.full_name,s.date_of_birth,s.nationality,s.current_club,s.current_country,s.primary_position,s.secondary_positions,s.preferred_foot,s.contract_expiry,
         s.transfermarkt_url,s.wyscout_url,s.video_url,s.instagram_url,s.agent_status,s.agent_name,s.availability_status,s.owner_user_id,tm.display_name,
         (select count(*) from djm_os.scouting_reports r where r.prospect_id=s.id),
         (select r.recommendation from djm_os.scouting_reports r where r.prospect_id=s.id order by case r.recommendation when 'strong_yes' then 5 when 'yes' then 4 when 'monitor' then 3 when 'no' then 2 else 1 end desc,r.report_date desc limit 1),
         (select round(avg(r.football_score)::numeric,1) from djm_os.scouting_reports r where r.prospect_id=s.id and r.football_score is not null),s.updated_at
  from djm_os.scouting_prospects s left join djm_os.team_members tm on tm.user_id=s.owner_user_id
  where (p_search is null or p_search='' or s.full_name ilike '%'||p_search||'%' or s.current_club ilike '%'||p_search||'%')
    and (p_status is null or p_status='' or s.availability_status=p_status)
  order by case s.availability_status when 'available' then 0 when 'approachable' then 1 when 'monitor' then 2 else 3 end,s.updated_at desc
  limit greatest(1,least(coalesce(p_limit,200),500));
$function$


CREATE OR REPLACE FUNCTION public.djm_scout_upsert_prospect(p_full_name text, p_date_of_birth date DEFAULT NULL::date, p_nationality text DEFAULT NULL::text, p_current_club text DEFAULT NULL::text, p_current_country text DEFAULT NULL::text, p_primary_position text DEFAULT NULL::text, p_secondary_positions text[] DEFAULT '{}'::text[], p_preferred_foot text DEFAULT NULL::text, p_contract_expiry date DEFAULT NULL::date, p_transfermarkt_url text DEFAULT NULL::text, p_wyscout_url text DEFAULT NULL::text, p_video_url text DEFAULT NULL::text, p_instagram_url text DEFAULT NULL::text, p_agent_status text DEFAULT NULL::text, p_agent_name text DEFAULT NULL::text, p_availability_status text DEFAULT 'unknown'::text, p_source text DEFAULT 'manual'::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_id uuid;v_key text;v_created boolean:=false;
begin
  if p_full_name is null or length(trim(p_full_name))<2 then raise exception 'Player name is required'; end if;
  if p_availability_status not in ('unknown','monitor','approachable','available','represented','signed_djm','not_interested','do_not_contact') then raise exception 'Invalid availability status'; end if;
  v_key:=lower(regexp_replace(trim(p_full_name),'[^a-zA-Z0-9]+','-','g'))||':'||coalesce(to_char(p_date_of_birth,'YYYY-MM-DD'),'unknown');
  select id into v_id from djm_os.scouting_prospects where canonical_key=v_key limit 1;
  if v_id is null then
    insert into djm_os.scouting_prospects(full_name,date_of_birth,nationality,current_club,current_country,primary_position,secondary_positions,preferred_foot,contract_expiry,transfermarkt_url,wyscout_url,video_url,instagram_url,agent_status,agent_name,availability_status,source,source_confidence,owner_user_id,canonical_key,last_verified_at,notes)
    values(trim(p_full_name),p_date_of_birth,nullif(trim(p_nationality),''),nullif(trim(p_current_club),''),nullif(trim(p_current_country),''),nullif(trim(p_primary_position),''),coalesce(p_secondary_positions,'{}'::text[]),nullif(trim(p_preferred_foot),''),p_contract_expiry,nullif(trim(p_transfermarkt_url),''),nullif(trim(p_wyscout_url),''),nullif(trim(p_video_url),''),nullif(trim(p_instagram_url),''),nullif(trim(p_agent_status),''),nullif(trim(p_agent_name),''),p_availability_status,coalesce(nullif(trim(p_source),''),'manual'),1,auth.uid(),v_key,now(),nullif(trim(p_notes),''))
    returning id into v_id;
    v_created:=true;
  else
    update djm_os.scouting_prospects set
      nationality=coalesce(nullif(trim(p_nationality),''),nationality),current_club=coalesce(nullif(trim(p_current_club),''),current_club),current_country=coalesce(nullif(trim(p_current_country),''),current_country),
      primary_position=coalesce(nullif(trim(p_primary_position),''),primary_position),secondary_positions=case when cardinality(coalesce(p_secondary_positions,'{}'::text[]))>0 then p_secondary_positions else secondary_positions end,
      preferred_foot=coalesce(nullif(trim(p_preferred_foot),''),preferred_foot),contract_expiry=coalesce(p_contract_expiry,contract_expiry),transfermarkt_url=coalesce(nullif(trim(p_transfermarkt_url),''),transfermarkt_url),
      wyscout_url=coalesce(nullif(trim(p_wyscout_url),''),wyscout_url),video_url=coalesce(nullif(trim(p_video_url),''),video_url),instagram_url=coalesce(nullif(trim(p_instagram_url),''),instagram_url),
      agent_status=coalesce(nullif(trim(p_agent_status),''),agent_status),agent_name=coalesce(nullif(trim(p_agent_name),''),agent_name),availability_status=p_availability_status,
      source=coalesce(nullif(trim(p_source),''),source),last_verified_at=now(),notes=coalesce(nullif(trim(p_notes),''),notes),updated_at=now()
    where id=v_id;
  end if;
  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at)
  values(case when v_created then 'SCOUT_PROSPECT_CREATED' else 'SCOUT_PROSPECT_UPDATED' end,auth.uid(),jsonb_build_object('prospect_id',v_id,'name',trim(p_full_name),'availability_status',p_availability_status),'scout',1,now());
  return jsonb_build_object('prospect_id',v_id,'created',v_created);
end;
$function$


CREATE OR REPLACE FUNCTION public.djm_search(p_query text, p_limit integer DEFAULT 30)
 RETURNS TABLE(entity_type text, entity_id uuid, title text, subtitle text, score numeric, metadata jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with q as (select lower(trim(coalesce(p_query,''))) s), results as (
  select 'person'::text as entity_type,p.id as entity_id,p.full_name as title,concat_ws(' · ',e.role_title,o.name,p.country) as subtitle,
    (case when lower(p.full_name)=q.s then 100 when lower(p.full_name) like q.s||'%' then 90 when lower(p.full_name) like '%'||q.s||'%' then 80 else extensions.similarity(lower(p.full_name),q.s)*70 end)::numeric as score,
    jsonb_build_object('club',o.name,'role',e.role_title,'country',p.country) as metadata
  from djm_os.people p cross join q left join lateral(select * from djm_os.employments x where x.person_id=p.id and x.is_current=true order by x.created_at desc limit 1)e on true left join djm_os.organisations o on o.id=e.organisation_id
  where q.s<>'' and (lower(p.full_name) like '%'||q.s||'%' or extensions.similarity(lower(p.full_name),q.s)>=0.35)
  union all
  select 'club'::text,o.id,o.name,concat_ws(' · ',o.city,o.country),(case when lower(o.name)=q.s then 100 when lower(o.name) like q.s||'%' then 90 when lower(o.name) like '%'||q.s||'%' then 80 else extensions.similarity(lower(o.name),q.s)*70 end)::numeric,
    jsonb_build_object('country',o.country,'city',o.city,'active_needs',(select count(*) from djm_os.club_needs n where n.organisation_id=o.id and n.status in ('active','open','confirmed')))
  from djm_os.organisations o cross join q where q.s<>'' and (lower(o.name) like '%'||q.s||'%' or extensions.similarity(lower(o.name),q.s)>=0.35)
  union all
  select 'player'::text,p.id,coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'Player'),concat_ws(' · ',p.current_club,p.primary_position,p.current_country),
    (case when lower(coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'')) like '%'||q.s||'%' then 85 else 50 end)::numeric,
    jsonb_build_object('club',p.current_club,'position',p.primary_position,'country',p.current_country)
  from public.players p cross join q where q.s<>'' and lower(coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.preferred_name,'')) like '%'||q.s||'%'
  union all
  select 'prospect'::text,s.id,s.full_name,concat_ws(' · ',s.current_club,s.primary_position,s.current_country),(case when lower(s.full_name) like '%'||q.s||'%' then 82 else 45 end)::numeric,jsonb_build_object('club',s.current_club,'position',s.primary_position,'status',s.availability_status)
  from djm_os.scouting_prospects s cross join q where q.s<>'' and lower(s.full_name) like '%'||q.s||'%'
 ) select results.entity_type,results.entity_id,results.title,results.subtitle,results.score,results.metadata from results order by results.score desc,results.title limit greatest(1,least(coalesce(p_limit,30),100));
$function$


CREATE OR REPLACE FUNCTION public.djm_service_global_peer_cache_status(p_provider text, p_provider_competition_id text, p_provider_season_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count integer; v_latest timestamptz;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required'; end if;
 select count(*),max(synced_at) into v_count,v_latest from djm_os.provider_peer_stat_snapshots where provider=p_provider and provider_competition_id=p_provider_competition_id and provider_season_id=p_provider_season_id;
 return jsonb_build_object('count',coalesce(v_count,0),'latest',v_latest,'fresh',coalesce(v_count,0)>=20 and v_latest>now()-interval '24 hours');
end; $function$


CREATE OR REPLACE FUNCTION public.djm_service_global_subject_queue(p_subject_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(subject_id uuid, full_name text, date_of_birth date, nationality text, primary_position text, current_club text, current_league text, current_country text, current_season_label text, football_provider_ids jsonb, representation_status text, player_id uuid, prospect_id uuid, external_data_status text, external_data_checked_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required'; end if;
 return query select s.id,s.full_name,s.date_of_birth,s.nationality,s.primary_position,s.current_club,s.current_league,s.current_country,s.current_season_label,s.football_provider_ids,s.representation_status,s.player_id,s.prospect_id,s.external_data_status,s.external_data_checked_at from djm_os.football_intelligence_subjects s where p_subject_id is null or s.id=p_subject_id order by case when s.external_data_status in ('never','failed','enriching') then 0 else 1 end,s.external_data_checked_at nulls first,s.updated_at desc limit greatest(1,least(coalesce(p_limit,5),20));
end; $function$


CREATE OR REPLACE FUNCTION public.djm_service_mark_global_subject_enrichment(p_subject_id uuid, p_status text, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required'; end if;
 update djm_os.football_intelligence_subjects set external_data_status=coalesce(nullif(p_status,''),'failed'),external_data_checked_at=now(),external_data_error=p_error,updated_at=now() where id=p_subject_id;
end; $function$


commit;
