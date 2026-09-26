create or replace function public.redream_autopilot_calendar(
  p_horizon_days integer default 90,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_horizon integer := greatest(1,least(coalesce(p_horizon_days,90),366));
  v_limit integer := greatest(1,least(coalesce(p_limit,100),200));
  v_tenant uuid := private.redream_request_tenant();
  v_user uuid := auth.uid();
  v_operations jsonb;
  v_meetings jsonb;
  v_follow_ups jsonb;
begin
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
      and m.status='scheduled'
      and m.starts_at>=now()
      and m.starts_at<=now()+make_interval(days=>v_horizon)
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
      and task.due_at<=now()+make_interval(days=>v_horizon)
    order by task.due_at,task.title
    limit v_limit
  ) x;

  return jsonb_build_object(
    'contract_version','redream_calendar_v2',
    'generated_at',now(),
    'horizon_days',v_horizon,
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

revoke all on function public.redream_autopilot_calendar(
  integer,
  integer
) from public,anon;

grant execute on function public.redream_autopilot_calendar(
  integer,
  integer
) to authenticated,service_role;
