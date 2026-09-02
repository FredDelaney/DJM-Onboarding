create or replace function private.djm_queue_email(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_url text,
  p_payload jsonb,
  p_dedupe_key text
)
returns boolean
language plpgsql
security definer
set search_path to 'public','private','pg_catalog'
as $$
declare
  pref_enabled boolean;
  delivery_enabled boolean;
begin
  if p_user_id is null or p_dedupe_key is null then return false; end if;
  select email_enabled into pref_enabled from public.notification_preferences where user_id=p_user_id;
  select enabled and api_key is not null and from_address is not null
  into delivery_enabled from private.djm_email_config where singleton=true;
  if not coalesce(pref_enabled,false) or not coalesce(delivery_enabled,false) then return false; end if;

  insert into public.email_outbox(user_id,kind,title,body,url,payload,dedupe_key)
  values(p_user_id,p_kind,p_title,p_body,coalesce(p_url,'/home'),coalesce(p_payload,'{}'::jsonb),p_dedupe_key)
  on conflict(dedupe_key) do nothing;
  return found;
end;
$$;

create or replace function private.djm_queue_delivery(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_url text,
  p_payload jsonb,
  p_dedupe_key text
)
returns boolean
language plpgsql
security definer
set search_path to 'private','public','pg_catalog'
as $$
declare
  push_queued boolean := false;
  email_queued boolean := false;
begin
  push_queued := private.djm_queue_push(p_user_id,p_kind,p_title,p_body,p_url,p_payload,p_dedupe_key);
  email_queued := private.djm_queue_email(p_user_id,p_kind,p_title,p_body,p_url,p_payload,p_dedupe_key);
  return coalesce(push_queued,false) or coalesce(email_queued,false);
end;
$$;

create or replace function private.djm_queue_smart_reminders()
returns jsonb
language plpgsql
security definer
set search_path to 'public','djm_os','pg_catalog'
as $$
declare
  item record;
  prefs public.notification_preferences;
  queued integer := 0;
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
    select t.*
    from djm_os.tasks t
    where t.status='open'
      and t.owner_user_id is not null
      and t.due_at is not null
      and t.due_at > now() - interval '24 hours'
      and t.due_at <= now() + interval '72 hours'
  loop
    select * into prefs from public.notification_preferences where user_id=item.owner_user_id;
    if not coalesce(prefs.task_reminders,true) then continue; end if;

    stage := null;
    if item.due_at <= now() then stage := 'overdue';
    elsif item.due_at <= now() + interval '2 hours' then stage := '2h';
    elsif item.due_at <= now() + interval '24 hours'
      and coalesce(prefs.reminder_mode,'normal') in ('normal','everything') then stage := '24h';
    elsif item.due_at <= now() + interval '72 hours'
      and coalesce(prefs.reminder_mode,'normal')='everything' then stage := '72h';
    end if;
    if stage is null then continue; end if;

    title_text := case stage
      when 'overdue' then 'Still open: ' || item.title
      when '2h' then 'Coming up: ' || item.title
      when '24h' then 'Tomorrow: ' || item.title
      else 'Ahead: ' || item.title
    end;
    body_text := case stage
      when 'overdue' then 'This DJM task has passed its due time. Open it to complete it or move the date.'
      when '2h' then 'This DJM task is due soon.'
      when '24h' then 'This DJM task is due within the next 24 hours.'
      else 'This DJM task is due within the next three days.'
    end;
    target_url := case when item.player_id is not null
      then '/admin/players/' || item.player_id::text || '#inbox'
      else '/djm' end;

    if private.djm_queue_delivery(
      item.owner_user_id,'staff_task_' || stage,title_text,body_text,target_url,
      jsonb_build_object('task_id',item.id,'due_at',item.due_at,'stage',stage),
      'staff-task:' || item.id::text || ':' || stage
    ) then queued := queued + 1; end if;
  end loop;

  for item in
    select r.*,p.user_id
    from public.player_requests r
    join public.players p on p.id=r.player_id
    where r.status='open'
      and r.created_by is not null
      and r.request_type not in ('message','signal')
      and r.due_at is not null
      and p.user_id is not null
      and r.due_at > now() - interval '24 hours'
      and r.due_at <= now() + interval '72 hours'
  loop
    select * into prefs from public.notification_preferences where user_id=item.user_id;
    if not coalesce(prefs.task_reminders,true) or not coalesce(prefs.player_requests,true) then continue; end if;

    stage := null;
    if item.due_at <= now() then stage := 'overdue';
    elsif item.due_at <= now() + interval '2 hours' then stage := '2h';
    elsif item.due_at <= now() + interval '24 hours'
      and coalesce(prefs.reminder_mode,'normal') in ('normal','everything') then stage := '24h';
    elsif item.due_at <= now() + interval '72 hours'
      and coalesce(prefs.reminder_mode,'normal')='everything' then stage := '72h';
    end if;
    if stage is null then continue; end if;

    title_text := case stage
      when 'overdue' then 'DJM still needs this: ' || item.title
      when '2h' then 'DJM reminder: ' || item.title
      when '24h' then 'For tomorrow: ' || item.title
      else 'Coming up: ' || item.title
    end;
    body_text := case stage
      when 'overdue' then 'This is still waiting for you in DJM Player.'
      when '2h' then 'This is due soon. Open DJM Player when you have a moment.'
      when '24h' then 'DJM needs this within the next 24 hours.'
      else 'A DJM request is due within the next three days.'
    end;

    if private.djm_queue_delivery(
      item.user_id,'player_request_' || stage,title_text,body_text,'/inbox',
      jsonb_build_object('request_id',item.id,'player_id',item.player_id,'due_at',item.due_at,'stage',stage),
      'player-request:' || item.id::text || ':' || stage
    ) then queued := queued + 1; end if;
  end loop;

  for item in
    select u.id as user_id,
           coalesce(np.timezone,'UTC') as timezone,
           coalesce(np.morning_brief_hour,8) as morning_brief_hour
    from auth.users u
    join public.notification_preferences np on np.user_id=u.id
    where np.morning_brief=true
      and coalesce(np.push_enabled,true)
  loop
    select case when exists(select 1 from pg_timezone_names where name=item.timezone)
      then item.timezone else 'UTC' end into tz;
    local_today := (now() at time zone tz)::date;
    local_hour := extract(hour from (now() at time zone tz))::integer;
    if local_hour <> item.morning_brief_hour then continue; end if;

    select (
      (select count(*) from djm_os.tasks t
       where t.owner_user_id=item.user_id and t.status='open' and t.due_at is not null
         and (t.due_at at time zone tz)::date <= local_today)
      +
      (select count(*) from public.player_requests r
       join public.players p on p.id=r.player_id
       where p.user_id=item.user_id and r.status='open' and r.created_by is not null
         and r.request_type not in ('message','signal') and r.due_at is not null
         and (r.due_at at time zone tz)::date <= local_today)
    ) into count_today;

    if count_today > 0 and private.djm_queue_delivery(
      item.user_id,'morning_brief','DJM today',
      case when count_today=1 then 'You have 1 dated item needing attention today.'
        else 'You have ' || count_today::text || ' dated items needing attention today.' end,
      '/home',jsonb_build_object('local_date',local_today,'count',count_today),
      'morning-brief:' || item.user_id::text || ':' || local_today::text
    ) then queued := queued + 1; end if;
  end loop;

  return jsonb_build_object('queued',queued,'checked_at',now());
end;
$$;

create or replace function public.djm_run_smart_reminders()
returns jsonb
language plpgsql
security definer
set search_path to 'private','pg_catalog'
as $$
begin
  if not private.is_admin() then raise exception 'Admin access required'; end if;
  return private.djm_queue_smart_reminders();
end;
$$;

create or replace function public.djm_email_delivery_config()
returns jsonb
language sql
stable security definer
set search_path to 'private','pg_catalog'
as $$
  select jsonb_build_object(
    'enabled',coalesce(enabled,false),
    'provider',provider,
    'api_key',api_key,
    'from_address',from_address
  )
  from private.djm_email_config where singleton=true limit 1
$$;

revoke all on function private.djm_queue_email(uuid,text,text,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function private.djm_queue_delivery(uuid,text,text,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function private.djm_queue_smart_reminders() from public,anon,authenticated;
revoke all on function public.djm_run_smart_reminders() from public,anon,authenticated;
revoke all on function public.djm_email_delivery_config() from public,anon,authenticated;
grant execute on function private.djm_queue_email(uuid,text,text,text,text,jsonb,text) to service_role;
grant execute on function private.djm_queue_delivery(uuid,text,text,text,text,jsonb,text) to service_role;
grant execute on function private.djm_queue_smart_reminders() to service_role;
grant execute on function public.djm_run_smart_reminders() to authenticated,service_role;
grant execute on function public.djm_email_delivery_config() to service_role;
