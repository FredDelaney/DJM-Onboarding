-- DJM Player staging private-function bootstrap — batch 05
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- and private function bootstrap batches 01-04.
--
-- Exact current-production definitions for private functions 25-36 of 70,
-- ordered by function name + identity arguments.
-- Production body MD5: 3e778b3cc5b5a6e3d14d39389c71e4db
--
-- Body validation is disabled only during bootstrap because later batches
-- provide cross-function dependencies. No function is executed by this file.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.djm_queue_push(p_user_id uuid, p_kind text, p_title text, p_body text, p_url text, p_payload jsonb, p_dedupe_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  prefs public.notification_preferences;
  v_entity_key text;
begin
  if p_user_id is null then return false; end if;

  select * into prefs
  from public.notification_preferences
  where user_id=p_user_id;

  if not coalesce(prefs.push_enabled,true) then
    return false;
  end if;

  if p_kind like 'staff_task_%' and p_payload ? 'task_id' then
    v_entity_key:=p_payload->>'task_id';
    if exists(
      select 1
      from public.notification_outbox n
      where n.user_id=p_user_id
        and n.kind like 'staff_task_%'
        and n.payload->>'task_id'=v_entity_key
        and n.status in ('pending','sent')
        and n.created_at>now()-interval '8 hours'
    ) then
      return false;
    end if;
  elsif p_kind like 'player_request_%' and p_payload ? 'request_id' then
    v_entity_key:=p_payload->>'request_id';
    if exists(
      select 1
      from public.notification_outbox n
      where n.user_id=p_user_id
        and n.kind like 'player_request_%'
        and n.payload->>'request_id'=v_entity_key
        and n.status in ('pending','sent')
        and n.created_at>now()-interval '8 hours'
    ) then
      return false;
    end if;
  end if;

  insert into public.notification_outbox(
    user_id,kind,title,body,url,payload,dedupe_key
  ) values(
    p_user_id,p_kind,left(coalesce(p_title,'DJM'),120),left(coalesce(p_body,''),240),coalesce(p_url,'/home'),
    coalesce(p_payload,'{}'::jsonb),p_dedupe_key
  )
  on conflict(dedupe_key) where dedupe_key is not null do nothing;

  return found;
end;
$function$;


CREATE OR REPLACE FUNCTION private.djm_queue_smart_reminders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'djm_os', 'pg_catalog'
AS $function$
declare
  item record;
  prefs public.notification_preferences;
  queued integer:=0;
  stage text;
  title_text text;
  body_text text;
  target_url text;
  local_today date;
  local_hour integer;
  count_today integer;
  tz text;
begin
  for item in
    select t.* from djm_os.tasks t
    where t.status='open' and t.owner_user_id is not null and t.due_at is not null
      and t.due_at>now()-interval '24 hours' and t.due_at<=now()+interval '72 hours'
  loop
    select * into prefs from public.notification_preferences where user_id=item.owner_user_id;
    if not coalesce(prefs.task_reminders,true) then continue; end if;
    stage:=null;
    if item.due_at<=now() then stage:='overdue';
    elsif item.due_at<=now()+interval '2 hours' then stage:='2h';
    elsif item.due_at<=now()+interval '24 hours' and coalesce(prefs.reminder_mode,'normal') in ('normal','everything') then stage:='24h';
    elsif item.due_at<=now()+interval '72 hours' and coalesce(prefs.reminder_mode,'normal')='everything' then stage:='72h'; end if;
    if stage is null then continue; end if;
    title_text:=case stage when 'overdue' then 'Still open: '||item.title when '2h' then 'Coming up: '||item.title when '24h' then 'Tomorrow: '||item.title else 'Ahead: '||item.title end;
    body_text:=case stage when 'overdue' then 'This DJM task has passed its due time. Open it to complete it or move the date.' when '2h' then 'This DJM task is due soon.' when '24h' then 'This DJM task is due within the next 24 hours.' else 'This DJM task is due within the next three days.' end;
    target_url:=case
      when item.source like 'recruitment:%' and split_part(item.source,':',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then '/recruitment/'||split_part(item.source,':',2)
      when item.player_id is not null then '/admin/players/'||item.player_id::text||'#inbox'
      else '/djm' end;
    if private.djm_queue_delivery(item.owner_user_id,'staff_task_'||stage,title_text,body_text,target_url,
      jsonb_build_object('task_id',item.id,'due_at',item.due_at,'stage',stage),'staff-task:'||item.id::text||':'||stage)
    then queued:=queued+1; end if;
  end loop;

  for item in
    select r.*,p.user_id from public.player_requests r join public.players p on p.id=r.player_id
    where r.status='open' and r.created_by is not null and r.request_type not in ('message','signal')
      and r.due_at is not null and p.user_id is not null
      and r.due_at>now()-interval '24 hours' and r.due_at<=now()+interval '72 hours'
  loop
    select * into prefs from public.notification_preferences where user_id=item.user_id;
    if not coalesce(prefs.task_reminders,true) or not coalesce(prefs.player_requests,true) then continue; end if;
    stage:=null;
    if item.due_at<=now() then stage:='overdue';
    elsif item.due_at<=now()+interval '2 hours' then stage:='2h';
    elsif item.due_at<=now()+interval '24 hours' and coalesce(prefs.reminder_mode,'normal') in ('normal','everything') then stage:='24h';
    elsif item.due_at<=now()+interval '72 hours' and coalesce(prefs.reminder_mode,'normal')='everything' then stage:='72h'; end if;
    if stage is null then continue; end if;
    title_text:=case stage when 'overdue' then 'DJM still needs this: '||item.title when '2h' then 'DJM reminder: '||item.title when '24h' then 'For tomorrow: '||item.title else 'Coming up: '||item.title end;
    body_text:=case stage when 'overdue' then 'This is still waiting for you in DJM Player.' when '2h' then 'This is due soon. Open DJM Player when you have a moment.' when '24h' then 'DJM needs this within the next 24 hours.' else 'A DJM request is due within the next three days.' end;
    if private.djm_queue_delivery(item.user_id,'player_request_'||stage,title_text,body_text,'/inbox',
      jsonb_build_object('request_id',item.id,'player_id',item.player_id,'due_at',item.due_at,'stage',stage),'player-request:'||item.id::text||':'||stage)
    then queued:=queued+1; end if;
  end loop;

  for item in
    select r.id,r.player_id,r.title,r.due_at,r.assigned_to_user_id
    from public.player_requests r
    where r.status='open' and r.assigned_to_user_id is not null
      and r.request_type not in ('message','signal') and r.due_at is not null
      and r.due_at>now()-interval '24 hours' and r.due_at<=now()+interval '72 hours'
  loop
    select * into prefs from public.notification_preferences where user_id=item.assigned_to_user_id;
    if not coalesce(prefs.task_reminders,true) then continue; end if;
    stage:=null;
    if item.due_at<=now() then stage:='overdue';
    elsif item.due_at<=now()+interval '2 hours' then stage:='2h';
    elsif item.due_at<=now()+interval '24 hours' and coalesce(prefs.reminder_mode,'normal') in ('normal','everything') then stage:='24h';
    elsif item.due_at<=now()+interval '72 hours' and coalesce(prefs.reminder_mode,'normal')='everything' then stage:='72h'; end if;
    if stage is null then continue; end if;
    title_text:=case stage when 'overdue' then 'Follow up overdue: '||item.title when '2h' then 'Follow up due soon: '||item.title when '24h' then 'Follow up tomorrow: '||item.title else 'Follow up ahead: '||item.title end;
    body_text:='You are assigned to this player request. Open the player inbox to follow up or update it.';
    target_url:='/admin/players/'||item.player_id::text||'#inbox';
    if private.djm_queue_delivery(item.assigned_to_user_id,'staff_player_request_'||stage,title_text,body_text,target_url,
      jsonb_build_object('request_id',item.id,'player_id',item.player_id,'due_at',item.due_at,'stage',stage),'staff-player-request:'||item.id::text||':'||stage)
    then queued:=queued+1; end if;
  end loop;

  for item in
    select u.id as user_id,coalesce(np.timezone,'UTC') as timezone,coalesce(np.morning_brief_hour,8) as morning_brief_hour
    from auth.users u join public.notification_preferences np on np.user_id=u.id
    where np.morning_brief=true and coalesce(np.push_enabled,true)
  loop
    select case when exists(select 1 from pg_timezone_names where name=item.timezone) then item.timezone else 'UTC' end into tz;
    local_today:=(now() at time zone tz)::date;
    local_hour:=extract(hour from (now() at time zone tz))::integer;
    if local_hour<>item.morning_brief_hour then continue; end if;
    select (
      (select count(*) from djm_os.tasks t where t.owner_user_id=item.user_id and t.status='open' and t.due_at is not null and (t.due_at at time zone tz)::date<=local_today)
      +(select count(*) from public.player_requests r join public.players p on p.id=r.player_id where p.user_id=item.user_id and r.status='open' and r.created_by is not null and r.request_type not in ('message','signal') and r.due_at is not null and (r.due_at at time zone tz)::date<=local_today)
      +(select count(*) from public.player_requests r where r.assigned_to_user_id=item.user_id and r.status='open' and r.request_type not in ('message','signal') and r.due_at is not null and (r.due_at at time zone tz)::date<=local_today)
    ) into count_today;
    if count_today>0 and private.djm_queue_delivery(item.user_id,'morning_brief','DJM today',
      case when count_today=1 then 'You have 1 dated item needing attention today.' else 'You have '||count_today::text||' dated items needing attention today.' end,
      '/home',jsonb_build_object('local_date',local_today,'count',count_today),'morning-brief:'||item.user_id::text||':'||local_today::text)
    then queued:=queued+1; end if;
  end loop;

  return jsonb_build_object('queued',queued,'checked_at',now());
end;
$function$;


CREATE OR REPLACE FUNCTION private.djm_refresh_public_profile_from_career()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player_id uuid:=coalesce(new.player_id,old.player_id);
begin
  update public.player_public_profiles pp
  set updated_at=pg_catalog.now()
  where pp.player_id=v_player_id;
  return coalesce(new,old);
end;
$function$;


CREATE OR REPLACE FUNCTION private.djm_sync_notification_preference_aliases()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if tg_op='INSERT' then
    new.email_enabled := coalesce(new.email_reminders,new.email_enabled,false);
    new.email_reminders := new.email_enabled;
    new.reminder_mode := coalesce(nullif(new.reminder_intensity,''),new.reminder_mode,'normal');
    new.reminder_intensity := new.reminder_mode;
  else
    if new.email_reminders is distinct from old.email_reminders then
      new.email_enabled := new.email_reminders;
    elsif new.email_enabled is distinct from old.email_enabled then
      new.email_reminders := new.email_enabled;
    end if;

    if new.reminder_intensity is distinct from old.reminder_intensity then
      new.reminder_mode := new.reminder_intensity;
    elsif new.reminder_mode is distinct from old.reminder_mode then
      new.reminder_intensity := new.reminder_mode;
    end if;
  end if;

  if new.reminder_mode not in ('minimal','normal','everything') then
    new.reminder_mode := 'normal';
  end if;
  new.reminder_intensity := new.reminder_mode;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.djm_v4_benchmark_quality(p_provider text, p_freshness text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_provider numeric;
  v_freshness numeric;
begin
  v_provider := case lower(coalesce(p_provider,''))
    when 'opta' then .97
    when 'stats_perform' then .97
    when 'wyscout' then .92
    when 'playerelo' then .90
    when 'iffhs_2025' then .82
    when 'djm_iffhs_tier_decay_v1' then .68
    when 'manual_reviewed' then .80
    else .72
  end;

  v_freshness := case lower(coalesce(p_freshness,'unknown'))
    when 'fresh' then 1
    when 'aging' then .82
    when 'stale' then .55
    else .65
  end;

  return least(1,greatest(0,v_provider*v_freshness));
end;
$function$;


CREATE OR REPLACE FUNCTION private.djm_v4_role_score(p_weighted_minutes numeric, p_weighted_appearances numeric, p_weighted_starts numeric, p_starts_known boolean)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_minutes numeric;
  v_starter numeric;
begin
  if coalesce(p_weighted_minutes,0) <= 0 then return null; end if;

  v_minutes := 100 * (1 - exp(-least(greatest(p_weighted_minutes,0),4000) / 1500.0));

  if p_starts_known and coalesce(p_weighted_appearances,0) > 0 then
    v_starter := least(100,greatest(0,p_weighted_starts / p_weighted_appearances * 100));
    return least(100,greatest(0,v_minutes*.82 + v_starter*.18));
  end if;

  return least(100,greatest(0,v_minutes));
end;
$function$;


CREATE OR REPLACE FUNCTION private.djm_v4_sample_reliability(p_minutes numeric, p_confidence numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select least(
    1::numeric,
    greatest(0::numeric, sqrt(least(greatest(coalesce(p_minutes,0),0),900) / 900.0))
    * greatest(0.35::numeric, least(1::numeric, coalesce(p_confidence,0.60)))
  );
$function$;


CREATE OR REPLACE FUNCTION private.djm_v5_benchmark_quality(p_provider text, p_freshness text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_provider numeric;
  v_freshness numeric;
begin
  v_provider := case lower(coalesce(p_provider,''))
    when 'opta' then .97
    when 'stats_perform' then .97
    when 'wyscout' then .92
    when 'playerelo' then .90
    when 'iffhs_2025' then .82
    when 'manual_reviewed' then .80
    when 'djm_iffhs_tier_decay_v1' then .68
    else .72
  end;

  v_freshness := case lower(coalesce(p_freshness,'unknown'))
    when 'fresh' then 1
    when 'aging' then .82
    when 'stale' then .55
    else .65
  end;

  return least(1::numeric, greatest(0::numeric, v_provider * v_freshness));
end;
$function$;


CREATE OR REPLACE FUNCTION private.djm_v5_career_evidence_date(p_club_name text, p_current_club text, p_season_label text, p_start_date date, p_end_date date, p_source_reviewed_at timestamp with time zone, p_source_synced_at timestamp with time zone, p_as_of date)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_source_date date;
  v_fallback date;
  v_same_current_club boolean := false;
begin
  if p_as_of is null then return null; end if;

  v_same_current_club :=
    nullif(trim(coalesce(p_club_name,'')),'') is not null
    and nullif(trim(coalesce(p_current_club,'')),'') is not null
    and lower(trim(p_club_name)) = lower(trim(p_current_club));

  v_source_date := greatest(
    case
      when p_source_reviewed_at is not null
       and p_source_reviewed_at::date <= p_as_of + 1
      then p_source_reviewed_at::date
    end,
    case
      when p_source_synced_at is not null
       and p_source_synced_at::date <= p_as_of + 1
      then p_source_synced_at::date
    end
  );

  -- For the current club and an open or future-ended stint, reviewed/synchronised
  -- statistics are observations as of the source date. Using the stint start date
  -- here would make live-season evidence become artificially old during the season.
  if v_same_current_club
     and (p_end_date is null or p_end_date >= p_as_of)
     and v_source_date is not null
     and (p_start_date is null or v_source_date >= p_start_date)
  then
    return least(v_source_date, p_as_of);
  end if;

  if p_end_date is not null and p_end_date <= p_as_of then
    return p_end_date;
  end if;

  v_fallback := public.djm_career_evidence_date(
    p_season_label,
    p_start_date,
    case when p_end_date is not null and p_end_date <= p_as_of then p_end_date else null end
  );

  if v_fallback is null or v_fallback > p_as_of + 1 then
    return null;
  end if;

  return v_fallback;
end;
$function$;


CREATE OR REPLACE FUNCTION private.djm_v5_experience_quality(p_age integer, p_reviewed_seasons integer, p_reviewed_career_minutes numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_expected_seasons numeric;
  v_season_quality numeric;
  v_minutes_quality numeric;
begin
  if coalesce(p_reviewed_seasons,0) <= 0 or coalesce(p_reviewed_career_minutes,0) <= 0 then
    return 0;
  end if;

  v_expected_seasons := greatest(
    1::numeric,
    least(4::numeric, coalesce(p_age,21) - 18)
  );

  v_season_quality := least(1::numeric, p_reviewed_seasons::numeric / v_expected_seasons);
  v_minutes_quality := least(1::numeric, p_reviewed_career_minutes / 6000.0);

  return least(1::numeric, greatest(0::numeric, sqrt(v_season_quality * v_minutes_quality)));
end;
$function$;


CREATE OR REPLACE FUNCTION private.djm_v5_mark_player_score_stale_from_input()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player_id uuid;
begin
  v_player_id := case when tg_op='DELETE' then old.player_id else new.player_id end;

  if v_player_id is not null then
    update djm_os.player_scorecards
    set
      stale_at=now(),
      stale_reason=tg_table_schema||'.'||tg_table_name||'_changed',
      evidence_freshness='stale',
      updated_at=now()
    where player_id=v_player_id;
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.djm_v5_mark_player_score_stale_from_player()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update djm_os.player_scorecards
  set
    stale_at=now(),
    stale_reason='public.players_score_inputs_changed',
    evidence_freshness='stale',
    updated_at=now()
  where player_id=new.id;
  return new;
end;
$function$;


commit;
