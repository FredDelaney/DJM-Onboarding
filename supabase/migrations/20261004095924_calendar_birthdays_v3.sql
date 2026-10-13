alter table public.players add column if not exists archived_at timestamptz;
alter table djm_os.people add column if not exists archived_at timestamptz;

-- Tenant-owned contact and staff birthday records. Player dates remain canonical in public.players.
create table if not exists platform.agency_birthdays (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  entity_kind text not null check (entity_kind in ('contact','staff')),
  entity_id uuid not null,
  birth_month integer not null check (birth_month between 1 and 12),
  birth_day integer not null check (birth_day between 1 and 31),
  birth_year integer check (birth_year between 1900 and 2100),
  shared_with_team boolean not null default true,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key(tenant_id,entity_kind,entity_id),
  check (extract(month from make_date(2000,birth_month,birth_day))=birth_month)
);
alter table platform.agency_birthdays enable row level security;
create policy birthday_no_direct_access on platform.agency_birthdays for all to authenticated using(false) with check(false);
revoke all on platform.agency_birthdays from public,anon,authenticated;

create or replace function private.redream_birthday_tenant(p_tenant_id uuid default null)
returns uuid language plpgsql stable security definer set search_path='' as $function$
declare v_tenant uuid:=coalesce(p_tenant_id,private.redream_request_tenant());
begin
  if auth.uid() is null or not private.user_has_staff_tenant_access(v_tenant,auth.uid())
     or not exists(select 1 from platform.tenants where id=v_tenant and status='active') then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;
  return v_tenant;
end;
$function$;

create or replace function public.redream_birthday_record(
  p_entity_kind text,p_entity_id uuid,p_tenant_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_tenant uuid:=private.redream_birthday_tenant(p_tenant_id); v_record jsonb; v_edit boolean;
begin
  v_edit:=p_entity_kind='contact' or (p_entity_kind='staff' and p_entity_id=auth.uid());
  if p_entity_kind='contact' then
    if not exists(select 1 from djm_os.people where id=p_entity_id and tenant_id=v_tenant and archived_at is null) then
      raise exception 'birthday_entity_not_found';
    end if;
  elsif p_entity_kind='staff' then
    if not exists(select 1 from platform.tenant_memberships where tenant_id=v_tenant and user_id=p_entity_id and status='active' and role in ('owner','admin','agent','scout','operations')) then
      raise exception 'birthday_entity_not_found';
    end if;
  else raise exception 'birthday_entity_invalid'; end if;
  select jsonb_build_object('month',b.birth_month,'day',b.birth_day,
    'year',case when v_edit then b.birth_year else null end,'shared',b.shared_with_team)
  into v_record from platform.agency_birthdays b
  where b.tenant_id=v_tenant and b.entity_kind=p_entity_kind and b.entity_id=p_entity_id
    and (v_edit or b.shared_with_team);
  return jsonb_build_object('record',v_record,'can_edit',v_edit);
end;
$function$;

create or replace function public.redream_birthday_save(
  p_entity_kind text,p_entity_id uuid,p_month integer,p_day integer,
  p_year integer default null,p_shared boolean default true,p_tenant_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_tenant uuid:=private.redream_birthday_tenant(p_tenant_id);
  v_access jsonb; v_before jsonb; v_after jsonb;
begin
  v_access:=public.redream_birthday_record(p_entity_kind,p_entity_id,v_tenant);
  if not coalesce((v_access->>'can_edit')::boolean,false) then raise exception 'birthday_edit_denied' using errcode='42501'; end if;
  v_before:=v_access->'record';
  if p_month is null and p_day is null then
    delete from platform.agency_birthdays where tenant_id=v_tenant and entity_kind=p_entity_kind and entity_id=p_entity_id;
  else
    if p_month is null or p_day is null or p_year>extract(year from current_date)::integer or p_year<1900 then
      raise exception 'birthday_date_invalid';
    end if;
    perform make_date(coalesce(p_year,2000),p_month,p_day);
    insert into platform.agency_birthdays(tenant_id,entity_kind,entity_id,birth_month,birth_day,birth_year,shared_with_team,updated_by)
    values(v_tenant,p_entity_kind,p_entity_id,p_month,p_day,p_year,coalesce(p_shared,true),auth.uid())
    on conflict(tenant_id,entity_kind,entity_id) do update set
      birth_month=excluded.birth_month,birth_day=excluded.birth_day,birth_year=excluded.birth_year,
      shared_with_team=excluded.shared_with_team,updated_by=auth.uid(),updated_at=now();
  end if;
  v_after:=public.redream_birthday_record(p_entity_kind,p_entity_id,v_tenant);
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(v_tenant,auth.uid(),'user','birthday.updated',p_entity_kind,p_entity_id::text,
    case when p_entity_kind='staff' then jsonb_build_object('shared',v_before->'shared') else v_before end,
    case when p_entity_kind='staff' then jsonb_build_object('shared',v_after->'record'->'shared') else v_after->'record' end,'{}'::jsonb);
  return v_after;
end;
$function$;

create or replace function public.redream_calendar_birthdays(
  p_start date,p_end date,p_include_contacts boolean default false,p_tenant_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_tenant uuid:=private.redream_birthday_tenant(p_tenant_id); v_items jsonb;
begin
  if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>366 then raise exception 'birthday_range_invalid'; end if;
  with sources as (
    select 'players'::text as category,p.id as entity_id,
      coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') as name,
      extract(month from p.date_of_birth)::integer as birth_month,extract(day from p.date_of_birth)::integer as birth_day,
      extract(year from p.date_of_birth)::integer as birth_year
    from public.players p where p.tenant_id=v_tenant and p.date_of_birth is not null and p.archived_at is null
      and coalesce(p.football_status,'active') not in ('retired','inactive')
    union all
    select 'contacts',p.id,coalesce(nullif(trim(p.preferred_name),''),p.full_name),b.birth_month,b.birth_day,b.birth_year
    from platform.agency_birthdays b join djm_os.people p on p.id=b.entity_id and p.tenant_id=b.tenant_id and p.archived_at is null
    where p_include_contacts and b.tenant_id=v_tenant and b.entity_kind='contact' and b.shared_with_team
    union all
    select 'staff',b.entity_id,coalesce(nullif(trim(p.display_name),''),'Team member'),b.birth_month,b.birth_day,null::integer
    from platform.agency_birthdays b
    join platform.tenant_memberships m on m.tenant_id=b.tenant_id and m.user_id=b.entity_id and m.status='active' and m.role in ('owner','admin','agent','scout','operations')
    left join public.profiles p on p.id=b.entity_id
    where b.tenant_id=v_tenant and b.entity_kind='staff' and b.shared_with_team
  ), occurrences as (
    select s.*,make_date(y.year,s.birth_month,least(s.birth_day,
      extract(day from (make_date(y.year,s.birth_month,1)+interval '1 month - 1 day'))::integer)) as date_at
    from sources s cross join generate_series(extract(year from p_start)::integer,extract(year from p_end-1)::integer) y(year)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id',category||':'||entity_id::text||':'||date_at::text,'date_at',date_at,'date_only',true,
    'birthday_category',category,'entity_id',entity_id,
    'player_id',case when category='players' then entity_id end,
    'person_id',case when category='contacts' then entity_id end,
    'title',name||'''s birthday','turns_age',case when birth_year is not null then extract(year from date_at)::integer-birth_year end
  ) order by date_at,name),'[]'::jsonb) into v_items
  from occurrences where date_at>=p_start and date_at<p_end;
  return jsonb_build_object('items',v_items,'count',jsonb_array_length(v_items));
end;
$function$;

revoke all on function private.redream_birthday_tenant(uuid) from public,anon,authenticated;
revoke all on function public.redream_birthday_record(text,uuid,uuid) from public,anon;
revoke all on function public.redream_birthday_save(text,uuid,integer,integer,integer,boolean,uuid) from public,anon;
revoke all on function public.redream_calendar_birthdays(date,date,boolean,uuid) from public,anon;
grant execute on function public.redream_birthday_record(text,uuid,uuid) to authenticated,service_role;
grant execute on function public.redream_birthday_save(text,uuid,integer,integer,integer,boolean,uuid) to authenticated,service_role;
grant execute on function public.redream_calendar_birthdays(date,date,boolean,uuid) to authenticated,service_role;

-- Keep the existing personal work and shared operational date boundaries when reading a month.
create or replace function public.redream_calendar_range(
  p_start date,
  p_end date,
  p_timezone text default 'UTC'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_horizon integer := greatest(1,least(p_end-current_date,366));
  v_limit integer := 500;
  v_tenant uuid := private.redream_request_tenant();
  v_user uuid := auth.uid();
  v_operations jsonb;
  v_meetings jsonb;
  v_follow_ups jsonb;
begin
  if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>124 then raise exception 'calendar_range_invalid'; end if;
  if p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'timezone_invalid'; end if;
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  if not exists (
    select 1
    from platform.tenant_memberships m
    join platform.tenants t
      on t.id=m.tenant_id
     and t.status='active'
    join djm_os.team_members tm
      on tm.user_id=m.user_id
     and tm.is_active
    where m.tenant_id=v_tenant
      and m.user_id=v_user
      and m.status='active'
      and m.role in ('owner','admin','agent','scout','operations')
  ) then
    raise exception 'active_tenant_staff_required';
  end if;

  v_operations := public.redream_autopilot_operations(
    v_horizon,
    v_limit
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'meeting_id',x.id,
        'title',x.title,
        'starts_at',x.starts_at,
        'ends_at',x.ends_at,
        'timezone',x.timezone,
        'provider',x.provider,
        'meeting_url',x.meeting_url,
        'status',x.status,
        'person_id',x.person_id,
        'person_name',x.person_name,
        'organisation_id',x.organisation_id,
        'organisation_name',x.organisation_name
      )
      order by x.starts_at,x.title
    ),
    '[]'::jsonb
  )
  into v_meetings
  from (
    select
      m.id,
      m.title,
      m.starts_at,
      m.ends_at,
      m.timezone,
      m.provider,
      m.meeting_url,
      m.status,
      m.person_id,
      p.full_name as person_name,
      m.organisation_id,
      o.name as organisation_name
    from djm_os.meetings m
    left join djm_os.people p
      on p.id=m.person_id
     and p.tenant_id=m.tenant_id
    left join djm_os.organisations o
      on o.id=m.organisation_id
     and o.tenant_id=m.tenant_id
    where m.tenant_id=v_tenant
      and m.owner_user_id=v_user
      and m.status in ('scheduled','completed')
      and m.starts_at>=(p_start::timestamp at time zone p_timezone)
      and m.starts_at<(p_end::timestamp at time zone p_timezone)
    order by m.starts_at,m.title
    limit v_limit
  ) x;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'task_id',x.id,
        'title',x.title,
        'due_at',x.due_at,
        'task_type',x.task_type,
        'priority',x.priority,
        'source',x.source,
        'player_id',x.player_id,
        'player_name',x.player_name,
        'club_need_id',x.club_need_id,
        'club_name',x.club_name,
        'person_id',x.person_id,
        'person_name',x.person_name,
        'organisation_id',x.organisation_id,
        'organisation_name',x.organisation_name
      )
      order by x.due_at,x.title
    ),
    '[]'::jsonb
  )
  into v_follow_ups
  from (
    select
      task.id,
      task.title,
      task.due_at,
      task.task_type,
      task.priority,
      task.source,
      task.player_id,
      coalesce(
        nullif(trim(player.preferred_name),''),
        nullif(trim(concat_ws(' ',player.first_name,player.last_name)),'')
      ) as player_name,
      task.club_need_id,
      club.name as club_name,
      task.person_id,
      person.full_name as person_name,
      task.organisation_id,
      organisation.name as organisation_name
    from djm_os.tasks task
    left join public.players player
      on player.id=task.player_id
     and player.tenant_id=task.tenant_id
    left join djm_os.club_needs need
      on need.id=task.club_need_id
     and need.tenant_id=task.tenant_id
    left join djm_os.organisations club
      on club.id=need.organisation_id
     and club.tenant_id=task.tenant_id
    left join djm_os.people person
      on person.id=task.person_id
     and person.tenant_id=task.tenant_id
    left join djm_os.organisations organisation
      on organisation.id=task.organisation_id
     and organisation.tenant_id=task.tenant_id
    where task.tenant_id=v_tenant
      and task.owner_user_id=v_user
      and task.status='open'
      and task.due_at is not null
      and task.due_at<(p_end::timestamp at time zone p_timezone)
      and (task.due_at>=(p_start::timestamp at time zone p_timezone) or (p_start<=current_date and task.due_at<now()))
    order by task.due_at,task.title
    limit v_limit
  ) x;

  return jsonb_build_object(
    'contract_version','redream_calendar_v3',
    'generated_at',now(),
    'range_start',p_start,'range_end',p_end,
    'limited',jsonb_array_length(v_meetings)>=v_limit or jsonb_array_length(v_follow_ups)>=v_limit,
    'operations',v_operations,
    'meetings',jsonb_build_object(
      'items',v_meetings,
      'count',jsonb_array_length(v_meetings)
    ),
    'follow_ups',jsonb_build_object(
      'items',v_follow_ups,
      'count',jsonb_array_length(v_follow_ups)
    ),
    'truth_contract',jsonb_build_object(
      'personal_work','Meetings and follow-ups are limited to the signed-in agency user.',
      'shared_dates','Player, club, deal and records dates remain shared tenant evidence.',
      'recorded_only','Only dates actually recorded in ReDream are shown. Calendar order is not a legal or strategic priority judgement.'
    )
  );
end;
$function$;

revoke all on function public.redream_calendar_range(
  date,
  date,
  text
) from public,anon;

grant execute on function public.redream_calendar_range(
  date,
  date,
  text
) to authenticated,service_role;
