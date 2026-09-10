create or replace function public.djm_calendar_feed_items(p_user_id uuid)
returns table(item_id uuid, title text, due_at timestamptz, url text, kind text)
language sql
stable security definer
set search_path to 'public','djm_os','pg_catalog'
as $function$
  with task_items as (
    select
      t.id as item_id,
      coalesce(t.title,'DJM task') as title,
      t.due_at,
      case
        when t.source like 'recruitment:%'
          and split_part(t.source,':',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then '/recruitment/' || split_part(t.source,':',2)
        when t.player_id is not null then '/admin/players/' || t.player_id::text || '#inbox'
        else '/djm'
      end as url,
      'task'::text as kind
    from djm_os.tasks t
    where t.owner_user_id=p_user_id
      and t.status='open'
      and t.due_at is not null
      and t.due_at >= now() - interval '30 days'
      and t.due_at <= now() + interval '370 days'
  ),
  request_items as (
    select
      r.id as item_id,
      coalesce(r.title,'DJM request') as title,
      r.due_at,
      '/inbox'::text as url,
      'request'::text as kind
    from public.player_requests r
    join public.players p on p.id=r.player_id
    where p.user_id=p_user_id
      and r.status='open'
      and r.created_by is not null
      and r.request_type not in ('message','signal')
      and r.due_at is not null
      and r.due_at >= now() - interval '30 days'
      and r.due_at <= now() + interval '370 days'
  ),
  staff as (
    select exists(
      select 1 from djm_os.team_members tm
      where tm.user_id=p_user_id and tm.is_active
    ) as is_staff
  ),
  birthday_base as (
    select
      p.id,
      trim(concat_ws(' ',coalesce(nullif(trim(p.preferred_name),''),nullif(trim(p.first_name),'')),nullif(trim(p.last_name),''))) as display_name,
      p.date_of_birth,
      extract(year from current_date)::int as y
    from public.players p, staff s
    where s.is_staff
      and p.date_of_birth is not null
      and p.football_status in ('active','free_agent','loan','injured')
  ),
  birthday_dates as (
    select b.*,
      case
        when extract(month from b.date_of_birth)=2 and extract(day from b.date_of_birth)=29
             and not (b.y % 400 = 0 or (b.y % 4 = 0 and b.y % 100 <> 0))
          then make_date(b.y,2,28)
        else make_date(b.y,extract(month from b.date_of_birth)::int,extract(day from b.date_of_birth)::int)
      end as this_birthday
    from birthday_base b
  ),
  birthday_next as (
    select bd.*,
      case
        when bd.this_birthday >= current_date - 30 then bd.this_birthday
        else
          case
            when extract(month from bd.date_of_birth)=2 and extract(day from bd.date_of_birth)=29
                 and not ((bd.y+1) % 400 = 0 or ((bd.y+1) % 4 = 0 and (bd.y+1) % 100 <> 0))
              then make_date(bd.y+1,2,28)
            else make_date(bd.y+1,extract(month from bd.date_of_birth)::int,extract(day from bd.date_of_birth)::int)
          end
      end as birthday_date
    from birthday_dates bd
  ),
  birthday_items as (
    select
      bn.id as item_id,
      'Birthday: ' || bn.display_name || ' turns ' ||
        (extract(year from bn.birthday_date)::int - extract(year from bn.date_of_birth)::int)::text as title,
      (bn.birthday_date::timestamp at time zone 'UTC') as due_at,
      '/admin/players/' || bn.id::text as url,
      'birthday'::text as kind
    from birthday_next bn
    where bn.birthday_date >= current_date - 30
      and bn.birthday_date <= current_date + 370
  )
  select * from task_items
  union all
  select * from request_items
  union all
  select * from birthday_items
  order by 3;
$function$;

create or replace function private.djm_queue_smart_reminders()
returns jsonb
language plpgsql
security definer
set search_path to 'public','djm_os','pg_catalog'
as $function$
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
    if item.due_at <= now() then
      stage := 'overdue';
    elsif item.due_at <= now() + interval '2 hours' then
      stage := '2h';
    elsif item.due_at <= now() + interval '24 hours'
      and coalesce(prefs.reminder_mode,'normal') in ('normal','everything') then
      stage := '24h';
    elsif item.due_at <= now() + interval '72 hours'
      and coalesce(prefs.reminder_mode,'normal')='everything' then
      stage := '72h';
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

    target_url := case
      when item.source like 'recruitment:%'
        and split_part(item.source,':',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then '/recruitment/' || split_part(item.source,':',2)
      when item.player_id is not null then '/admin/players/' || item.player_id::text || '#inbox'
      else '/djm'
    end;

    if private.djm_queue_delivery(
      item.owner_user_id,
      'staff_task_' || stage,
      title_text,
      body_text,
      target_url,
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
    if not coalesce(prefs.task_reminders,true)
       or not coalesce(prefs.player_requests,true) then
      continue;
    end if;

    stage := null;
    if item.due_at <= now() then
      stage := 'overdue';
    elsif item.due_at <= now() + interval '2 hours' then
      stage := '2h';
    elsif item.due_at <= now() + interval '24 hours'
      and coalesce(prefs.reminder_mode,'normal') in ('normal','everything') then
      stage := '24h';
    elsif item.due_at <= now() + interval '72 hours'
      and coalesce(prefs.reminder_mode,'normal')='everything' then
      stage := '72h';
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
      item.user_id,
      'player_request_' || stage,
      title_text,
      body_text,
      '/inbox',
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
    select case
      when exists(select 1 from pg_timezone_names where name=item.timezone) then item.timezone
      else 'UTC'
    end into tz;

    local_today := (now() at time zone tz)::date;
    local_hour := extract(hour from (now() at time zone tz))::integer;

    if local_hour <> item.morning_brief_hour then continue; end if;

    select (
      (select count(*) from djm_os.tasks t
       where t.owner_user_id=item.user_id
         and t.status='open'
         and t.due_at is not null
         and (t.due_at at time zone tz)::date <= local_today)
      +
      (select count(*)
       from public.player_requests r
       join public.players p on p.id=r.player_id
       where p.user_id=item.user_id
         and r.status='open'
         and r.created_by is not null
         and r.request_type not in ('message','signal')
         and r.due_at is not null
         and (r.due_at at time zone tz)::date <= local_today)
    ) into count_today;

    if count_today > 0 and private.djm_queue_delivery(
      item.user_id,
      'morning_brief',
      'DJM today',
      case when count_today=1
        then 'You have 1 dated item needing attention today.'
        else 'You have ' || count_today::text || ' dated items needing attention today.'
      end,
      '/home',
      jsonb_build_object('local_date',local_today,'count',count_today),
      'morning-brief:' || item.user_id::text || ':' || local_today::text
    ) then queued := queued + 1; end if;
  end loop;

  return jsonb_build_object('queued',queued,'checked_at',now());
end;
$function$;
