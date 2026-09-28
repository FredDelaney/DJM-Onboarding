begin;

create or replace function private.redream_queue_meeting_outcome_reminders()
returns jsonb
language plpgsql
security definer
set search_path='public','djm_os','private','pg_catalog'
as $function$
declare
  item record;
  prefs public.notification_preferences;
  queued integer:=0;
  counterparty text;
  target_url text;
  dedupe_key text;
begin
  for item in
    select
      m.id,
      m.tenant_id,
      tenant.slug as tenant_slug,
      m.owner_user_id,
      m.title,
      m.starts_at,
      m.ends_at,
      m.provider,
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
      and m.ends_at<=now()-interval '15 minutes'
      and m.ends_at>=now()-interval '6 hours'
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
    order by m.ends_at
  loop
    select *
    into prefs
    from public.notification_preferences
    where user_id=item.owner_user_id;

    if not coalesce(prefs.meeting_reminders,true) then
      continue;
    end if;

    counterparty:=coalesce(
      nullif(trim(item.person_name),''),
      nullif(trim(item.organisation_name),''),
      nullif(trim(item.title),''),
      'your meeting'
    );

    target_url:=
      '/workspace/'||
      item.tenant_slug||
      '?view=home&meetingOutcome='||
      item.id::text;

    dedupe_key:=
      'meeting-outcome:'||
      item.id::text||
      ':'||
      floor(
        extract(
          epoch from item.starts_at
        )
      )::bigint::text;

    if private.djm_queue_delivery(
      item.owner_user_id,
      'meeting_outcome',
      'How did it go? '||counterparty,
      'Confirm whether the meeting happened and save what mattered while it is still fresh.',
      target_url,
      jsonb_build_object(
        'meeting_id',item.id,
        'tenant_id',item.tenant_id,
        'scheduled_starts_at',item.starts_at,
        'scheduled_ends_at',item.ends_at,
        'provider',item.provider,
        'person_id',item.person_id,
        'organisation_id',item.organisation_id,
        'stage','aftercare'
      ),
      dedupe_key
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
  private.redream_queue_meeting_outcome_reminders()
from
  public,
  anon,
  authenticated;

grant execute on function
  private.redream_queue_meeting_outcome_reminders()
to
  postgres,
  service_role;

do $$
declare
  v_jobid bigint;
begin
  for v_jobid in
    select jobid
    from cron.job
    where jobname in (
      'redream-meeting-outcome-quarter-hourly',
      'redream-meeting-outcome-hourly'
    )
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end;
$$;

select cron.schedule(
  'redream-meeting-outcome-hourly',
  '12 * * * *',
  $cron$
    select private.redream_queue_meeting_outcome_reminders();
  $cron$
);

comment on function
  private.redream_queue_meeting_outcome_reminders()
is
  'Queues one deduplicated post-meeting outcome reminder for unresolved linked provider meetings owned by active agency staff. Existing meeting reminder and delivery preferences are reused.';

commit;
