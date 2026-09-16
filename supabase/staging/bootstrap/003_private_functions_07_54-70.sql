-- DJM Player staging private-function bootstrap — batch 07
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- and private function bootstrap batches 01-06.
--
-- Exact current-production definitions for private functions 54-70 of 70,
-- ordered by function name + identity arguments.
-- Production body MD5: 9c6c6050bc852fd7da168721cd438a24
--
-- Body validation is disabled only during bootstrap because cross-function
-- dependencies are completed by this final private-function batch.
-- No function is executed by this file.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.protect_player_admin_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  internal_user_link boolean := coalesce(pg_catalog.current_setting('djm.internal_user_link', true), '') = 'on';
  internal_career_change boolean := coalesce(pg_catalog.current_setting('djm.internal_career_change', true), '') = 'on';
begin
  if internal_career_change then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.first_name is distinct from old.first_name
       or new.last_name is distinct from old.last_name
       or new.preferred_name is distinct from old.preferred_name
       or new.date_of_birth is distinct from old.date_of_birth
       or new.nationalities is distinct from old.nationalities
       or new.height_cm is distinct from old.height_cm
       or new.preferred_foot is distinct from old.preferred_foot
       or new.primary_position is distinct from old.primary_position
       or new.secondary_positions is distinct from old.secondary_positions
       or new.current_club is distinct from old.current_club
       or new.current_league is distinct from old.current_league
       or new.current_country is distinct from old.current_country
       or new.contract_status is distinct from old.contract_status
       or new.contract_expiry is distinct from old.contract_expiry
       or new.football_status is distinct from old.football_status
       or new.transfermarkt_url is distinct from old.transfermarkt_url
       or new.wyscout_url is distinct from old.wyscout_url
       or new.stats_url is distinct from old.stats_url
       or new.instagram_url is distinct from old.instagram_url
       or new.profile_photo_path is distinct from old.profile_photo_path
       or new.onboarding_status is distinct from old.onboarding_status
       or new.created_at is distinct from old.created_at
       or new.agency_priority is distinct from old.agency_priority
       or new.next_action is distinct from old.next_action
       or new.next_action_due is distinct from old.next_action_due
       or new.current_season_label is distinct from old.current_season_label
       or new.current_season_start is distinct from old.current_season_start then
      raise exception 'Internal career review attempted an unexpected player-field change';
    end if;
    return new;
  end if;

  if internal_user_link then
    if new.id is distinct from old.id
       or new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
       or new.verification_notes is distinct from old.verification_notes
       or new.review_required_at is distinct from old.review_required_at
       or new.review_reason is distinct from old.review_reason
       or new.agency_priority is distinct from old.agency_priority
       or new.next_action is distinct from old.next_action
       or new.next_action_due is distinct from old.next_action_due
       or new.created_at is distinct from old.created_at
       or (old.user_id is not null and new.user_id is distinct from old.user_id)
       or (new.onboarding_status is distinct from old.onboarding_status and not (old.onboarding_status = 'not_started' and new.onboarding_status = 'in_progress')) then
      raise exception 'Internal player link attempted an unexpected protected-field change';
    end if;
    return new;
  end if;

  if not private.is_admin() then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
       or new.verification_notes is distinct from old.verification_notes
       or new.review_required_at is distinct from old.review_required_at
       or new.review_reason is distinct from old.review_reason
       or new.agency_priority is distinct from old.agency_priority
       or new.next_action is distinct from old.next_action
       or new.next_action_due is distinct from old.next_action_due
       or new.created_at is distinct from old.created_at then
      raise exception 'Not permitted to change protected player fields';
    end if;
  end if;

  if old.verification_status = 'verified' and (
      new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name or new.preferred_name is distinct from old.preferred_name or
      new.date_of_birth is distinct from old.date_of_birth or new.nationalities is distinct from old.nationalities or new.height_cm is distinct from old.height_cm or
      new.preferred_foot is distinct from old.preferred_foot or new.primary_position is distinct from old.primary_position or new.secondary_positions is distinct from old.secondary_positions or
      new.current_club is distinct from old.current_club or new.current_league is distinct from old.current_league or new.current_country is distinct from old.current_country or
      new.contract_status is distinct from old.contract_status or new.contract_expiry is distinct from old.contract_expiry or new.football_status is distinct from old.football_status or
      new.transfermarkt_url is distinct from old.transfermarkt_url or new.wyscout_url is distinct from old.wyscout_url or new.stats_url is distinct from old.stats_url or
      new.profile_photo_path is distinct from old.profile_photo_path
    ) then
      new.verification_status := 'reviewing';
      new.verified_at := null;
      new.review_required_at := pg_catalog.now();
      new.review_reason := case
        when private.is_admin() then 'DJM updated verified football information'
        else 'Player updated verified football information'
      end;
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.protect_player_request_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if not private.is_admin() then
    if new.id is distinct from old.id
       or new.player_id is distinct from old.player_id
       or new.title is distinct from old.title
       or new.message is distinct from old.message
       or new.request_type is distinct from old.request_type
       or new.due_at is distinct from old.due_at
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Not permitted to change DJM request fields';
    end if;
    if new.status is distinct from old.status and new.status <> 'completed' then
      raise exception 'Players may only complete a DJM request';
    end if;
    if new.completed_at is distinct from old.completed_at and not (new.status='completed' and old.status is distinct from 'completed') then
      raise exception 'Completion time is managed by DJM Player';
    end if;
  end if;
  new.updated_at := now();
  if new.status='completed' and old.status is distinct from 'completed' then new.completed_at := now(); end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.protect_player_system_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is not null and not private.is_admin() then
    if new.current_competition_id is distinct from old.current_competition_id
       or new.current_season_label is distinct from old.current_season_label
       or new.current_season_start is distinct from old.current_season_start
       or new.football_provider_ids is distinct from old.football_provider_ids
       or new.transfermarkt_market_value is distinct from old.transfermarkt_market_value
       or new.transfermarkt_market_value_currency is distinct from old.transfermarkt_market_value_currency
       or new.transfermarkt_value_verified_at is distinct from old.transfermarkt_value_verified_at then
      raise exception 'Not permitted to change system-owned player fields';
    end if;
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.protect_profile_admin_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if not private.is_admin() then
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.role is distinct from old.role
       or new.created_at is distinct from old.created_at then
      raise exception 'Not permitted to change protected profile fields';
    end if;
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.protect_public_profile_admin_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare safety_unpublish boolean;
begin
  if not private.is_admin() then
    safety_unpublish := (
      old.published=true and new.published=false
      and new.player_id is not distinct from old.player_id
      and new.public_slug is not distinct from old.public_slug
      and new.published_at is not distinct from old.published_at
      and new.contact_email is not distinct from old.contact_email
      and new.market_value_display is not distinct from old.market_value_display
      and new.market_value_source_url is not distinct from old.market_value_source_url
      and new.hidden_sections is not distinct from old.hidden_sections
      and new.hide_market_value is not distinct from old.hide_market_value
      and new.verified_at is not distinct from old.verified_at
    );
    if not safety_unpublish and (
       new.player_id is distinct from old.player_id
       or new.public_slug is distinct from old.public_slug
       or new.published is distinct from old.published
       or new.published_at is distinct from old.published_at
       or new.contact_email is distinct from old.contact_email
       or new.market_value_display is distinct from old.market_value_display
       or new.market_value_source_url is distinct from old.market_value_source_url
       or new.hidden_sections is distinct from old.hidden_sections
       or new.hide_market_value is distinct from old.hide_market_value
       or new.verified_at is distinct from old.verified_at
    ) then
      raise exception 'Not permitted to change protected public-profile fields';
    end if;
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.queue_admin_inbound_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  player_name text;
  admin_row record;
begin
  if new.request_type not in ('message','signal') then return new; end if;

  select coalesce(nullif(preferred_name,''),nullif(trim(concat_ws(' ',first_name,last_name)),''),'Player')
  into player_name
  from public.players
  where id=new.player_id;

  for admin_row in
    select pr.id
    from public.profiles pr
    left join public.notification_preferences np on np.user_id=pr.id
    where pr.role='admin' and coalesce(np.player_requests,true)
  loop
    perform private.djm_queue_push(
      admin_row.id,
      case when new.request_type='message' then 'player_message' else 'checkin_signal' end,
      case when new.request_type='message'
        then 'New message from '||coalesce(player_name,'Player')
        else coalesce(player_name,'Player')||' needs attention'
      end,
      left(case when new.request_type='message'
        then coalesce(new.player_reply,new.title,'Open the player message in DJM.')
        else coalesce(new.message,new.title,'Open the player update in DJM.')
      end,220),
      '/admin/players/'||new.player_id::text||'#inbox',
      jsonb_build_object('player_id',new.player_id,'request_id',new.id,'request_type',new.request_type),
      'player-inbound:'||new.id::text
    );
  end loop;

  perform net.http_post(
    url:='https://xogoigaaskmuspiehkba.supabase.co/functions/v1/dispatch-player-push',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-djm-cron',(select decrypted_secret from vault.decrypted_secrets where name='djm_push_cron_secret' limit 1)
    ),
    body:=jsonb_build_object('source','inbound-player-attention','player_id',new.player_id),
    timeout_milliseconds:=10000
  );
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.queue_announcement_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if new.published is not true then return new; end if;
  insert into public.notification_outbox(user_id,kind,title,body,url,payload)
  select p.user_id,'announcement',new.title,new.body,'/home',jsonb_build_object('announcement_id',new.id)
  from public.players p
  left join public.notification_preferences np on np.user_id=p.user_id
  where p.user_id is not null
    and (new.target_player_id is null or new.target_player_id=p.id)
    and coalesce(np.djm_announcements,true)
  on conflict do nothing;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.queue_player_request_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare target_user uuid; pref boolean;
begin
  if new.created_by is null or new.request_type='signal' then return new; end if;
  select user_id into target_user from public.players where id=new.player_id;
  if target_user is null then return new; end if;
  select player_requests into pref from public.notification_preferences where user_id=target_user;
  if coalesce(pref,true) then
    perform private.djm_queue_channels(target_user,'player_request',coalesce(new.title,'DJM needs you'),coalesce(new.message,'Open DJM Player for the latest update.'),'/inbox',jsonb_build_object('request_id',new.id,'player_id',new.player_id,'request_type',new.request_type,'due_at',new.due_at),'player-request-new:' || new.id::text);
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.queue_weekly_checkin_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare inserted_count integer; current_week date := date_trunc('week',now())::date;
begin
  insert into public.notification_outbox(user_id,kind,title,body,url,payload)
  select p.user_id,
         'weekly_checkin',
         'Your weekly DJM check-in is ready',
         'It takes about 60 seconds. Keep DJM current on availability, fitness and anything that changed.',
         '/check-in',
         jsonb_build_object('player_id',p.id,'week_start',current_week)
  from public.players p
  left join public.notification_preferences np on np.user_id=p.user_id
  where p.user_id is not null
    and coalesce(np.weekly_checkin_reminders,true)
    and not exists (
      select 1 from public.weekly_checkins w
      where w.player_id=p.id and w.week_start=current_week
    )
    and not exists (
      select 1 from public.notification_outbox o
      where o.user_id=p.user_id
        and o.kind='weekly_checkin'
        and o.payload->>'week_start'=current_week::text
        and o.status in ('pending','sent','cancelled')
    );
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$function$;


CREATE OR REPLACE FUNCTION private.set_public_profile_career_timeline()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_stats_url text;
  v_market_source text := lower(coalesce(new.market_value_source_url, ''));
begin
  new.career_timeline := private.player_career_timeline(new.player_id);
  new.key_stats := private.player_authoritative_key_stats(new.player_id, new.key_stats);

  select p.stats_url
  into v_stats_url
  from public.players p
  where p.id = new.player_id;

  new.stats_url := v_stats_url;

  if lower(pg_catalog.btrim(coalesce(new.current_club, ''))) in (
    'n/a','na','none','not applicable','-','—'
  ) then
    new.current_club := null;
  end if;

  if new.transfermarkt_url is not null
     and lower(new.transfermarkt_url) not like '%transfermarkt.%' then
    new.transfermarkt_url := null;
  end if;

  if new.wyscout_url is not null
     and lower(new.wyscout_url) not like '%wyscout.%' then
    new.wyscout_url := null;
  end if;

  if new.stats_url is not null
     and (
       lower(new.stats_url) like '%instagram.%'
       or lower(new.stats_url) like '%youtube.%'
       or lower(new.stats_url) like '%youtu.be%'
       or lower(new.stats_url) like '%tiktok.%'
       or lower(new.stats_url) like '%vimeo.%'
     ) then
    new.stats_url := null;
  end if;

  if coalesce(new.hide_market_value, true) = false
     and (
       v_market_source like '%instagram.%'
       or v_market_source like '%youtube.%'
       or v_market_source like '%youtu.be%'
       or v_market_source like '%tiktok.%'
       or v_market_source like '%vimeo.%'
     ) then
    new.hide_market_value := true;
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.set_updated_at_document()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ begin new.created_at=coalesce(new.created_at,now()); return new; end $function$;


CREATE OR REPLACE FUNCTION private.stamp_admin_note_author()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if new.author_id is null or not private.is_admin() then
    new.author_id := auth.uid();
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.surface_checkin_signal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_title text;
  v_message text;
  v_existing uuid;
begin
  if nullif(trim(coalesce(new.support_request,'')),'') is not null then
    v_title := 'Check-in: player needs DJM';
    v_message := trim(new.support_request);
  elsif new.club_situation_changed then
    v_title := 'Check-in: club situation changed';
    v_message := nullif(trim(coalesce(new.club_situation_notes,'')),'');
  elsif new.availability_status in ('unavailable','limited') then
    v_title := 'Check-in: availability changed';
    v_message := 'Player marked availability as ' || new.availability_status;
  elsif new.fitness_status in ('injured','managing') then
    v_title := 'Check-in: fitness update';
    v_message := 'Player marked fitness as ' || replace(new.fitness_status,'_',' ');
  else
    return new;
  end if;

  select id into v_existing
  from public.player_requests
  where player_id=new.player_id
    and request_type='signal'
    and status='open'
    and title=v_title
    and created_at >= now()-interval '7 days'
  order by created_at desc limit 1;

  if v_existing is null then
    insert into public.player_requests(player_id,title,message,request_type,status,created_by)
    values (new.player_id,v_title,v_message,'signal','open',null);
  else
    update public.player_requests set message=v_message,updated_at=now() where id=v_existing;
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.sync_allowlist_profile_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if tg_op = 'DELETE' then
    update public.profiles set role='player', updated_at=now()
    where lower(email)=lower(old.email) and role in ('admin','scout');
    return old;
  end if;
  update public.profiles set role=new.role, updated_at=now()
  where lower(email)=lower(new.email);
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.sync_djm_team_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.role in ('admin', 'scout') then
    insert into djm_os.team_members (
      user_id,
      display_name,
      role_title,
      is_active,
      updated_at
    ) values (
      new.id,
      coalesce(nullif(trim(new.display_name), ''), nullif(split_part(new.email, '@', 1), ''), 'DJM Team'),
      case when new.role = 'admin' then 'Administrator' else 'Scout' end,
      true,
      now()
    )
    on conflict (user_id) do update set
      display_name = excluded.display_name,
      role_title = excluded.role_title,
      is_active = true,
      updated_at = now();
  else
    update djm_os.team_members
      set is_active = false, updated_at = now()
    where user_id = new.id;
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.unpublish_dossier_when_verification_is_lost()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.verification_status = 'verified'
     and (
       new.verification_status is distinct from 'verified'
       or new.verified_at is null
     ) then
    update public.player_public_profiles
    set published = false
    where player_id = new.id
      and published = true;
  end if;

  return new;
end;
$function$;


commit;
