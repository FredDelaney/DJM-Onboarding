begin;

alter table public.notification_preferences
  add column if not exists meeting_reminders boolean not null default true;

create or replace function private.email_outbox_tenant_id(
  p_user_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_candidate uuid;
  v_tenant_id uuid;
begin
  v_candidate:=private.safe_uuid(
    v_payload->>'tenant_id'
  );

  if v_candidate is not null
    and private.user_has_active_tenant_membership(
      v_candidate,
      p_user_id
    )
  then
    return v_candidate;
  end if;

  v_candidate:=private.safe_uuid(
    v_payload->>'player_id'
  );

  if v_candidate is not null then
    select p.tenant_id
    into v_tenant_id
    from public.players p
    where p.id=v_candidate
    limit 1;

    if v_tenant_id is not null
      and private.user_has_active_tenant_membership(
        v_tenant_id,
        p_user_id
      )
    then
      return v_tenant_id;
    end if;
  end if;

  return private.primary_active_tenant_id(
    p_user_id
  );
end;
$function$;

revoke all on function
  private.email_outbox_tenant_id(uuid,jsonb)
from
  public,
  anon,
  authenticated;

grant execute on function
  private.email_outbox_tenant_id(uuid,jsonb)
to
  postgres,
  service_role;

create or replace function private.redream_queue_meeting_prep_reminders()
returns jsonb
language plpgsql
security definer
set search_path='public','djm_os','private','pg_catalog'
as $function$
declare
  item record;
  prefs public.notification_preferences;
  stage text;
  queued integer:=0;
  title_text text;
  body_text text;
  counterparty text;
  target_url text;
begin
  for item in
    select
      m.id,
      m.tenant_id,
      m.owner_user_id,
      m.title,
      m.starts_at,
      m.provider,
      tenant.slug as tenant_slug,
      m.person_id,
      p.full_name as person_name,
      m.organisation_id,
      o.name as organisation_name
    from djm_os.meetings m
    join platform.tenants tenant
      on tenant.id=m.tenant_id
     and tenant.status='active'
    join platform.tenant_memberships membership
      on membership.tenant_id=m.tenant_id
     and membership.user_id=m.owner_user_id
     and membership.status='active'
     and membership.role in (
       'owner',
       'admin',
       'agent',
       'operations',
       'scout'
     )
    left join djm_os.people p
      on p.id=m.person_id
     and p.tenant_id=m.tenant_id
    left join djm_os.organisations o
      on o.id=m.organisation_id
     and o.tenant_id=m.tenant_id
    where m.status='scheduled'
      and m.provider in ('google','microsoft')
      and m.owner_user_id is not null
      and m.starts_at>now()
      and m.starts_at<=now()+interval '24 hours'
      and (
        m.person_id is not null
        or m.organisation_id is not null
      )
    order by m.starts_at
  loop
    select *
    into prefs
    from public.notification_preferences
    where user_id=item.owner_user_id;

    if not coalesce(prefs.meeting_reminders,true) then
      continue;
    end if;

    stage:=null;

    if item.starts_at<=now()+interval '2 hours' then
      stage:='2h';
    elsif item.starts_at<=now()+interval '24 hours'
      and coalesce(
        prefs.reminder_mode,
        prefs.reminder_intensity,
        'normal'
      ) in ('normal','everything') then
      stage:='24h';
    end if;

    if stage is null then
      continue;
    end if;

    counterparty:=coalesce(
      nullif(trim(item.person_name),''),
      nullif(trim(item.organisation_name),''),
      nullif(trim(item.title),''),
      'your meeting'
    );

    title_text:=
      case
        when stage='2h'
          then 'Prepare now: '||counterparty
        else 'Prepare for tomorrow: '||counterparty
      end;

    body_text:=
      case
        when stage='2h'
          then 'Open Calendar to review the recorded relationship, follow-up and club/work context available before the meeting.'
        else 'Your linked meeting is tomorrow. Open Calendar to review the recorded context and prepare.'
      end;

    target_url:=
      '/workspace/'||
      item.tenant_slug||
      '?view=calendar&meeting='||
      item.id::text;

    if private.djm_queue_delivery(
      item.owner_user_id,
      'meeting_prep_'||stage,
      title_text,
      body_text,
      target_url,
      jsonb_build_object(
        'meeting_id',item.id,
        'tenant_id',item.tenant_id,
        'starts_at',item.starts_at,
        'provider',item.provider,
        'person_id',item.person_id,
        'organisation_id',item.organisation_id,
        'stage',stage
      ),
      'meeting-prep:'||item.id::text||':'||stage
    ) then
      queued:=queued+1;
    end if;
  end loop;

  return jsonb_build_object(
    'queued',queued,
    'checked_at',now()
  );
end;
$function$;

revoke all on function
  private.redream_queue_meeting_prep_reminders()
from public,anon,authenticated;

grant execute on function
  private.redream_queue_meeting_prep_reminders()
to service_role;

do $$
declare
  v_jobid bigint;
begin
  for v_jobid in
    select jobid
    from cron.job
    where jobname='redream-meeting-prep-hourly'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end;
$$;

select cron.schedule(
  'redream-meeting-prep-hourly',
  '10 * * * *',
  $cron$
    select private.redream_queue_meeting_prep_reminders();
  $cron$
);

comment on function
  private.redream_queue_meeting_prep_reminders()
is
  'Queues deduplicated 24-hour and 2-hour preparation reminders for active staff-owned linked Google/Microsoft meetings. Delivery uses existing user push/email preferences and preserves the meeting tenant.';

commit;
