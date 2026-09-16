alter table public.players
  add column if not exists primary_staff_user_id uuid references auth.users(id) on delete set null;

alter table public.player_requests
  add column if not exists assigned_to_user_id uuid references auth.users(id) on delete set null;

create index if not exists players_primary_staff_user_id_idx
  on public.players(primary_staff_user_id);

create index if not exists player_requests_assigned_due_idx
  on public.player_requests(assigned_to_user_id,status,due_at)
  where assigned_to_user_id is not null;

create or replace function djm_os.validate_player_primary_staff()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.primary_staff_user_id is not null
     and not exists (
       select 1 from djm_os.team_members tm
       where tm.user_id=new.primary_staff_user_id and tm.is_active
     ) then
    raise exception 'Assigned player owner must be an active DJM team member';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_validate_player_primary_staff on public.players;
create trigger trg_validate_player_primary_staff
before insert or update of primary_staff_user_id on public.players
for each row execute function djm_os.validate_player_primary_staff();

create or replace function djm_os.assign_player_request_owner()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_default_owner uuid;
begin
  if tg_op='INSERT' and new.assigned_to_user_id is null then
    if new.created_by is not null
       and exists(select 1 from djm_os.team_members tm where tm.user_id=new.created_by and tm.is_active) then
      v_default_owner := new.created_by;
    elsif v_actor is not null
       and exists(select 1 from djm_os.team_members tm where tm.user_id=v_actor and tm.is_active) then
      v_default_owner := v_actor;
    else
      select p.primary_staff_user_id into v_default_owner
      from public.players p where p.id=new.player_id;
    end if;
    new.assigned_to_user_id := v_default_owner;
  end if;

  if new.assigned_to_user_id is not null
     and not exists (
       select 1 from djm_os.team_members tm
       where tm.user_id=new.assigned_to_user_id and tm.is_active
     ) then
    raise exception 'Request assignee must be an active DJM team member';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_assign_player_request_owner on public.player_requests;
create trigger trg_assign_player_request_owner
before insert or update of assigned_to_user_id, created_by, player_id on public.player_requests
for each row execute function djm_os.assign_player_request_owner();

create or replace function public.djm_active_team_members()
returns table(user_id uuid, display_name text, role_title text)
language sql
stable
security definer
set search_path to ''
as $function$
  select tm.user_id, tm.display_name, tm.role_title
  from djm_os.team_members tm
  where tm.is_active
    and exists(
      select 1 from djm_os.team_members caller
      where caller.user_id=auth.uid() and caller.is_active
    )
  order by lower(coalesce(tm.display_name,'')), tm.created_at;
$function$;

revoke all on function public.djm_active_team_members() from public, anon;
grant execute on function public.djm_active_team_members() to authenticated;

create or replace function public.djm_assign_player(
  p_player_id uuid,
  p_assigned_to_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before uuid;
  v_name text;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=auth.uid() and tm.is_active) then
    raise exception 'DJM team access required';
  end if;
  if p_assigned_to_user_id is not null
     and not exists(select 1 from djm_os.team_members tm where tm.user_id=p_assigned_to_user_id and tm.is_active) then
    raise exception 'Active DJM team member not found';
  end if;

  select p.primary_staff_user_id,
         coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player')
  into v_before,v_name
  from public.players p where p.id=p_player_id for update;
  if not found then raise exception 'Player not found'; end if;

  update public.players
  set primary_staff_user_id=p_assigned_to_user_id, updated_at=now()
  where id=p_player_id;

  if p_assigned_to_user_id is not null then
    update public.player_requests
    set assigned_to_user_id=p_assigned_to_user_id, updated_at=now()
    where player_id=p_player_id
      and status='open'
      and assigned_to_user_id is null;
  end if;

  insert into djm_os.events(event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values('PLAYER_ASSIGNMENT_UPDATED',auth.uid(),p_player_id,
    jsonb_build_object('player_id',p_player_id,'player_name',v_name,'previous_assigned_to_user_id',v_before,'assigned_to_user_id',p_assigned_to_user_id),
    'manual_ui',1,now());

  return jsonb_build_object('player_id',p_player_id,'assigned_to_user_id',p_assigned_to_user_id);
end;
$function$;

create or replace function public.djm_assign_player_request(
  p_request_id uuid,
  p_assigned_to_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before uuid;
  v_player_id uuid;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=auth.uid() and tm.is_active) then
    raise exception 'DJM team access required';
  end if;
  if p_assigned_to_user_id is not null
     and not exists(select 1 from djm_os.team_members tm where tm.user_id=p_assigned_to_user_id and tm.is_active) then
    raise exception 'Active DJM team member not found';
  end if;

  select r.assigned_to_user_id,r.player_id into v_before,v_player_id
  from public.player_requests r where r.id=p_request_id for update;
  if not found then raise exception 'Player request not found'; end if;

  update public.player_requests
  set assigned_to_user_id=p_assigned_to_user_id,updated_at=now()
  where id=p_request_id;

  insert into djm_os.events(event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values('PLAYER_REQUEST_ASSIGNMENT_UPDATED',auth.uid(),v_player_id,
    jsonb_build_object('request_id',p_request_id,'previous_assigned_to_user_id',v_before,'assigned_to_user_id',p_assigned_to_user_id),
    'manual_ui',1,now());

  return jsonb_build_object('request_id',p_request_id,'assigned_to_user_id',p_assigned_to_user_id);
end;
$function$;

create or replace function public.djm_recruitment_assign_owner(
  p_prospect_id uuid,
  p_owner_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

create or replace function public.djm_task_assign_owner(
  p_task_id uuid,
  p_owner_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before uuid;
  v_player uuid;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=auth.uid() and tm.is_active) then
    raise exception 'DJM team access required';
  end if;
  if p_owner_user_id is not null
     and not exists(select 1 from djm_os.team_members tm where tm.user_id=p_owner_user_id and tm.is_active) then
    raise exception 'Active DJM team member not found';
  end if;

  select t.owner_user_id,t.player_id into v_before,v_player
  from djm_os.tasks t where t.id=p_task_id for update;
  if not found then raise exception 'Task not found'; end if;

  update djm_os.tasks set owner_user_id=p_owner_user_id,updated_at=now() where id=p_task_id;

  insert into djm_os.events(event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values('TASK_OWNER_UPDATED',auth.uid(),v_player,
    jsonb_build_object('task_id',p_task_id,'previous_owner_user_id',v_before,'owner_user_id',p_owner_user_id),
    'manual_ui',1,now());

  return jsonb_build_object('task_id',p_task_id,'owner_user_id',p_owner_user_id);
end;
$function$;

create or replace function djm_os.inherit_signed_player_owner()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

drop trigger if exists trg_inherit_signed_player_owner on djm_os.scouting_prospects;
create trigger trg_inherit_signed_player_owner
after update of signed_player_id on djm_os.scouting_prospects
for each row execute function djm_os.inherit_signed_player_owner();

create or replace function public.djm_calendar_feed_items(p_user_id uuid)
returns table(item_id uuid, title text, due_at timestamptz, url text, kind text)
language sql
stable security definer
set search_path to 'public','djm_os','pg_catalog'
as $function$
  with task_items as (
    select t.id,coalesce(t.title,'DJM task'),t.due_at,
      case
        when t.source like 'recruitment:%'
          and split_part(t.source,':',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then '/recruitment/'||split_part(t.source,':',2)
        when t.player_id is not null then '/admin/players/'||t.player_id::text||'#inbox'
        else '/djm'
      end,
      'task'::text
    from djm_os.tasks t
    where t.owner_user_id=p_user_id and t.status='open' and t.due_at is not null
      and t.due_at>=now()-interval '30 days' and t.due_at<=now()+interval '370 days'
  ),
  player_request_items as (
    select r.id,coalesce(r.title,'DJM request'),r.due_at,'/inbox'::text,'request'::text
    from public.player_requests r join public.players p on p.id=r.player_id
    where p.user_id=p_user_id and r.status='open' and r.created_by is not null
      and r.request_type not in ('message','signal') and r.due_at is not null
      and r.due_at>=now()-interval '30 days' and r.due_at<=now()+interval '370 days'
  ),
  staff_request_items as (
    select r.id,'Follow up: '||coalesce(r.title,'Player request'),r.due_at,
      '/admin/players/'||r.player_id::text||'#inbox','staff_request'::text
    from public.player_requests r
    where r.assigned_to_user_id=p_user_id and r.status='open'
      and r.request_type not in ('message','signal') and r.due_at is not null
      and r.due_at>=now()-interval '30 days' and r.due_at<=now()+interval '370 days'
  ),
  staff as (
    select exists(select 1 from djm_os.team_members tm where tm.user_id=p_user_id and tm.is_active) as is_staff
  ),
  birthday_base as (
    select p.id,
      trim(concat_ws(' ',coalesce(nullif(trim(p.preferred_name),''),nullif(trim(p.first_name),'')),nullif(trim(p.last_name),''))) as display_name,
      p.date_of_birth,extract(year from current_date)::int as y
    from public.players p,staff s
    where s.is_staff and p.date_of_birth is not null
      and p.football_status in ('active','free_agent','loan','injured')
  ),
  birthday_dates as (
    select b.*,
      case when extract(month from b.date_of_birth)=2 and extract(day from b.date_of_birth)=29
             and not (b.y%400=0 or (b.y%4=0 and b.y%100<>0))
        then make_date(b.y,2,28)
        else make_date(b.y,extract(month from b.date_of_birth)::int,extract(day from b.date_of_birth)::int)
      end as this_birthday
    from birthday_base b
  ),
  birthday_next as (
    select bd.*,
      case when bd.this_birthday>=current_date-30 then bd.this_birthday else
        case when extract(month from bd.date_of_birth)=2 and extract(day from bd.date_of_birth)=29
               and not ((bd.y+1)%400=0 or ((bd.y+1)%4=0 and (bd.y+1)%100<>0))
          then make_date(bd.y+1,2,28)
          else make_date(bd.y+1,extract(month from bd.date_of_birth)::int,extract(day from bd.date_of_birth)::int)
        end
      end as birthday_date
    from birthday_dates bd
  ),
  birthday_items as (
    select bn.id,
      'Birthday: '||bn.display_name||' turns '||(extract(year from bn.birthday_date)::int-extract(year from bn.date_of_birth)::int)::text,
      (bn.birthday_date::timestamp at time zone 'UTC'),'/admin/players/'||bn.id::text,'birthday'::text
    from birthday_next bn
    where bn.birthday_date>=current_date-30 and bn.birthday_date<=current_date+370
  )
  select * from task_items
  union all select * from player_request_items
  union all select * from staff_request_items
  union all select * from birthday_items
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
