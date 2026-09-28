begin;

create table if not exists djm_os.meeting_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references platform.tenants(id)
    on delete cascade,
  meeting_id uuid not null
    references djm_os.meetings(id)
    on delete cascade,
  owner_user_id uuid not null
    references auth.users(id)
    on delete cascade,
  scheduled_starts_at timestamptz not null,
  scheduled_ends_at timestamptz not null,
  outcome_state text not null
    check (
      outcome_state in (
        'happened',
        'did_not_happen',
        'rescheduled'
      )
    ),
  summary text,
  followup_title text,
  followup_due_at timestamptz,
  resolved_by uuid not null
    references auth.users(id)
    on delete cascade,
  resolved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(
    tenant_id,
    meeting_id,
    scheduled_starts_at,
    scheduled_ends_at
  )
);

create index if not exists
  meeting_outcomes_owner_resolved_idx
on djm_os.meeting_outcomes(
  tenant_id,
  owner_user_id,
  resolved_at desc
);

alter table djm_os.meeting_outcomes
  enable row level security;

revoke all on djm_os.meeting_outcomes
from public,anon,authenticated;

grant select,insert,update,delete
on djm_os.meeting_outcomes
to service_role;
create or replace function public.platform_server_meeting_aftercare(
  p_tenant_id uuid,
  p_user_id uuid,
  p_limit integer default 4
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=
    greatest(
      1,
      least(
        coalesce(p_limit,4),
        12
      )
    );
  v_count integer:=0;
  v_items jsonb:='[]'::jsonb;
begin
  if p_user_id is null
    or not private.user_has_staff_tenant_access(
      p_tenant_id,
      p_user_id
    )
  then
    raise exception 'workspace_access_denied'
      using errcode='42501';
  end if;

  select count(*)::int
  into v_count
  from djm_os.meetings m
  where m.tenant_id=p_tenant_id
    and m.owner_user_id=p_user_id
    and m.provider in ('google','microsoft')
    and m.status='scheduled'
    and m.ends_at<=now()-interval '15 minutes'
    and m.ends_at>=now()-interval '48 hours'
    and (
      m.person_id is not null
      or m.organisation_id is not null
    )
    and not exists (
      select 1
      from djm_os.meeting_outcomes mo
      where mo.tenant_id=m.tenant_id
        and mo.meeting_id=m.id
        and mo.scheduled_starts_at=m.starts_at
        and mo.scheduled_ends_at=m.ends_at
    )
;

  select coalesce(
    jsonb_agg(item order by ended_at desc),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      jsonb_build_object(
        'meeting_id',m.id,
        'title',m.title,
        'starts_at',m.starts_at,
        'ends_at',m.ends_at,
        'provider',m.provider,
        'person_id',m.person_id,
        'person_name',p.full_name,
        'organisation_id',m.organisation_id,
        'organisation_name',o.name,
        'owner_user_id',m.owner_user_id,
        'owner_name',coalesce(
          nullif(trim(tm.display_name),''),
          'You'
        )
      ) as item,
      m.ends_at as ended_at
    from djm_os.meetings m
    left join djm_os.people p
      on p.id=m.person_id
     and p.tenant_id=m.tenant_id
    left join djm_os.organisations o
      on o.id=m.organisation_id
     and o.tenant_id=m.tenant_id
    left join djm_os.team_members tm
      on tm.user_id=m.owner_user_id
     and tm.is_active
    where m.tenant_id=p_tenant_id
      and m.owner_user_id=p_user_id
      and m.provider in ('google','microsoft')
      and m.status='scheduled'
      and m.ends_at<=now()-interval '15 minutes'
      and m.ends_at>=now()-interval '48 hours'
      and (
        m.person_id is not null
        or m.organisation_id is not null
      )
      and not exists (
        select 1
        from djm_os.meeting_outcomes mo
        where mo.tenant_id=m.tenant_id
          and mo.meeting_id=m.id
          and mo.scheduled_starts_at=m.starts_at
          and mo.scheduled_ends_at=m.ends_at
      )
    order by m.ends_at desc
    limit v_limit
  ) q;

  return jsonb_build_object(
    'contract_version',
      'redream_post_meeting_aftercare_v1',
    'generated_at',now(),
    'count',v_count,
    'items',v_items,
    'truth_contract',jsonb_build_object(
      'attendance',
        'A passed calendar event does not prove that the meeting happened. The owning agent must confirm the outcome.',
      'personal_scope',
        'Only the signed-in agent''s own linked provider meetings are shown.',
      'resolution',
        'Only an explicit outcome recorded for this meeting closes the prompt. Other conversations near the same contact do not count as proof.',
      'window',
        'Unresolved meeting prompts appear 15 minutes after the scheduled end and stay visible for 48 hours.'
    )
  );
end;
$function$;
create or replace function public.redream_meeting_aftercare(
  p_limit integer default 4
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  return public.platform_server_meeting_aftercare(
    v_tenant,
    v_user,
    p_limit
  );
end;
$function$;

revoke all on function
  public.platform_server_meeting_aftercare(uuid,uuid,integer)
from public,anon,authenticated;

grant execute on function
  public.platform_server_meeting_aftercare(uuid,uuid,integer)
to postgres,service_role;

revoke all on function
  public.redream_meeting_aftercare(integer)
from public,anon;

grant execute on function
  public.redream_meeting_aftercare(integer)
to authenticated,service_role;
create or replace function public.platform_server_meeting_record_outcome(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_meeting_id uuid,
  p_state text,
  p_summary text default null,
  p_followup_title text default null,
  p_followup_due_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_state text:=
    lower(
      trim(
        coalesce(
          p_state,
          ''
        )
      )
    );
  v_summary text:=
    nullif(
      trim(
        coalesce(
          p_summary,
          ''
        )
      ),
      ''
    );
  v_followup_title text:=
    nullif(
      trim(
        coalesce(
          p_followup_title,
          ''
        )
      ),
      ''
    );
  v_meeting record;
  v_interaction_recorded boolean:=false;
  v_followup_created boolean:=false;
begin
  if p_actor_user_id is null
    or not private.user_has_staff_tenant_access(
      p_tenant_id,
      p_actor_user_id
    )
  then
    raise exception 'workspace_access_denied'
      using errcode='42501';
  end if;

  perform private.platform_server_ensure_team_member(
    p_actor_user_id
  );

  select
    m.id,
    m.owner_user_id,
    m.person_id,
    m.organisation_id,
    m.starts_at,
    m.ends_at,
    m.provider,
    m.status
  into v_meeting
  from djm_os.meetings m
  where m.id=p_meeting_id
    and m.tenant_id=p_tenant_id
    and m.owner_user_id=p_actor_user_id
    and m.provider in ('google','microsoft')
    and m.status='scheduled'
    and (
      m.person_id is not null
      or m.organisation_id is not null
    )
    and m.ends_at<=now()
  limit 1;

  if v_meeting.id is null then
    raise exception 'meeting_not_available';
  end if;

  if exists (
    select 1
    from djm_os.meeting_outcomes mo
    where mo.tenant_id=p_tenant_id
      and mo.meeting_id=p_meeting_id
      and mo.scheduled_starts_at=v_meeting.starts_at
      and mo.scheduled_ends_at=v_meeting.ends_at
  ) then
    raise exception 'meeting_already_resolved';
  end if;

  if v_state not in (
    'happened',
    'did_not_happen',
    'rescheduled'
  ) then
    raise exception 'meeting_outcome_invalid';
  end if;

  if v_state='happened' then
    if v_summary is null
      or length(v_summary)<2
      or length(v_summary)>4000
    then
      raise exception 'meeting_summary_required';
    end if;

    if v_meeting.person_id is not null then
      perform public.platform_server_relationship_record_interaction(
        p_tenant_id,
        p_actor_user_id,
        v_meeting.person_id,
        'meeting',
        v_summary,
        v_meeting.ends_at
      );
      v_interaction_recorded:=true;
    end if;

    if v_followup_title is not null then
      if v_meeting.person_id is null then
        raise exception 'followup_requires_contact';
      end if;

      if p_followup_due_at is null
        or p_followup_due_at<=now()
      then
        raise exception 'followup_due_date_required';
      end if;

      perform public.platform_server_relationship_add_work(
        p_tenant_id,
        p_actor_user_id,
        v_meeting.person_id,
        'followup',
        v_followup_title,
        p_followup_due_at
      );
      v_followup_created:=true;
    end if;
  else
    if v_summary is not null
      and length(v_summary)>2000
    then
      raise exception 'meeting_note_too_long';
    end if;

    if v_followup_title is not null
      or p_followup_due_at is not null
    then
      raise exception 'followup_requires_happened_meeting';
    end if;
  end if;

  insert into djm_os.meeting_outcomes(
    tenant_id,
    meeting_id,
    owner_user_id,
    scheduled_starts_at,
    scheduled_ends_at,
    outcome_state,
    summary,
    followup_title,
    followup_due_at,
    resolved_by,
    resolved_at,
    updated_at
  )
  values(
    p_tenant_id,
    p_meeting_id,
    p_actor_user_id,
    v_meeting.starts_at,
    v_meeting.ends_at,
    v_state,
    v_summary,
    v_followup_title,
    p_followup_due_at,
    p_actor_user_id,
    now(),
    now()
  );

  insert into djm_os.events(
    tenant_id,
    event_type,
    actor_user_id,
    person_id,
    organisation_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values(
    p_tenant_id,
    'MEETING_OUTCOME_RECORDED',
    p_actor_user_id,
    v_meeting.person_id,
    v_meeting.organisation_id,
    jsonb_build_object(
      'meeting_id',p_meeting_id,
      'outcome_state',v_state,
      'summary_recorded',v_summary is not null,
      'interaction_recorded',v_interaction_recorded,
      'followup_created',v_followup_created,
      'followup_due_at',p_followup_due_at
    ),
    'redream_meeting_aftercare',
    1,
    now()
  );

  return jsonb_build_object(
    'recorded',true,
    'meeting_id',p_meeting_id,
    'state',v_state,
    'interaction_recorded',v_interaction_recorded,
    'followup_created',v_followup_created
  );
end;
$function$;
create or replace function public.redream_meeting_record_outcome(
  p_meeting_id uuid,
  p_state text,
  p_summary text default null,
  p_followup_title text default null,
  p_followup_due_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  return public.platform_server_meeting_record_outcome(
    v_tenant,
    v_user,
    p_meeting_id,
    p_state,
    p_summary,
    p_followup_title,
    p_followup_due_at
  );
end;
$function$;

revoke all on function
  public.platform_server_meeting_record_outcome(
    uuid,uuid,uuid,text,text,text,timestamptz
  )
from public,anon,authenticated;

grant execute on function
  public.platform_server_meeting_record_outcome(
    uuid,uuid,uuid,text,text,text,timestamptz
  )
to postgres,service_role;

revoke all on function
  public.redream_meeting_record_outcome(
    uuid,text,text,text,timestamptz
  )
from public,anon;

grant execute on function
  public.redream_meeting_record_outcome(
    uuid,text,text,text,timestamptz
  )
to authenticated,service_role;

notify pgrst,'reload schema';

commit;
