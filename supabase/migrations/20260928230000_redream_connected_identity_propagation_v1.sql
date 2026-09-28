begin;

create or replace function private.redream_propagate_network_email_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text;
  v_organisation_id uuid;
  v_provider_contacts integer := 0;
  v_meetings integer := 0;
begin
  if new.channel <> 'email' then
    return new;
  end if;

  v_email := nullif(
    lower(
      btrim(
        coalesce(
          nullif(new.normalised_value, ''),
          new.value
        )
      )
    ),
    ''
  );

  if v_email is null then
    return new;
  end if;
  select e.organisation_id
  into v_organisation_id
  from djm_os.employments e
  where e.tenant_id = new.tenant_id
    and e.person_id = new.person_id
    and e.is_current = true
  order by
    e.started_on desc nulls last,
    e.updated_at desc,
    e.id
  limit 1;

  update djm_os.provider_contact_sources s
  set
    person_id = new.person_id,
    updated_at = now()
  where s.tenant_id = new.tenant_id
    and s.is_deleted = false
    and s.provider in ('google','microsoft')
    and lower(btrim(coalesce(s.email,''))) = v_email
    and s.person_id is null;

  get diagnostics v_provider_contacts = row_count;

  update djm_os.meetings m
  set
    person_id = new.person_id,
    organisation_id = coalesce(
      m.organisation_id,
      v_organisation_id
    ),
    updated_at = now()
  where m.tenant_id = new.tenant_id
    and m.provider in ('google','microsoft')
    and m.status <> 'cancelled'
    and m.person_id is null
    and lower(btrim(coalesce(m.invitee_email,''))) = v_email;

  get diagnostics v_meetings = row_count;
  if v_provider_contacts > 0
     or v_meetings > 0 then
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
      new.tenant_id,
      'CONNECTED_IDENTITY_PROPAGATED',
      auth.uid(),
      new.person_id,
      v_organisation_id,
      jsonb_build_object(
        'contact_method_id', new.id,
        'channel', 'email',
        'provider_contacts_linked', v_provider_contacts,
        'meetings_linked', v_meetings
      ),
      'redream_connected_identity',
      1,
      now()
    );
  end if;

  return new;
end;
$function$;
drop trigger if exists
  redream_propagate_network_email_identity
on djm_os.contact_methods;

create trigger
  redream_propagate_network_email_identity
after insert or update of
  value,
  normalised_value,
  person_id,
  channel
on djm_os.contact_methods
for each row
execute function
  private.redream_propagate_network_email_identity();

revoke all on function
  private.redream_propagate_network_email_identity()
from
  public,
  anon,
  authenticated;


with identity as (
  select
    cm.tenant_id,
    cm.person_id,
    lower(
      btrim(
        coalesce(
          nullif(cm.normalised_value,''),
          cm.value
        )
      )
    ) as email
  from djm_os.contact_methods cm
  where cm.channel='email'
    and nullif(
      btrim(
        coalesce(
          nullif(cm.normalised_value,''),
          cm.value
        )
      ),
      ''
    ) is not null
)
update djm_os.provider_contact_sources s
set
  person_id = i.person_id,
  updated_at = now()
from identity i
where s.tenant_id = i.tenant_id
  and s.is_deleted = false
  and s.provider in ('google','microsoft')
  and s.person_id is null
  and lower(btrim(coalesce(s.email,''))) = i.email;
with identity as (
  select
    cm.tenant_id,
    cm.person_id,
    lower(
      btrim(
        coalesce(
          nullif(cm.normalised_value,''),
          cm.value
        )
      )
    ) as email,
    (
      select e.organisation_id
      from djm_os.employments e
      where e.tenant_id=cm.tenant_id
        and e.person_id=cm.person_id
        and e.is_current=true
      order by
        e.started_on desc nulls last,
        e.updated_at desc,
        e.id
      limit 1
    ) as organisation_id
  from djm_os.contact_methods cm
  where cm.channel='email'
    and nullif(
      btrim(
        coalesce(
          nullif(cm.normalised_value,''),
          cm.value
        )
      ),
      ''
    ) is not null
),
updated as (
  update djm_os.meetings m
  set
    person_id=i.person_id,
    organisation_id=coalesce(
      m.organisation_id,
      i.organisation_id
    ),
    updated_at=now()
  from identity i
  where m.tenant_id=i.tenant_id
    and m.provider in ('google','microsoft')
    and m.status<>'cancelled'
    and m.person_id is null
    and lower(btrim(coalesce(m.invitee_email,'')))=i.email
  returning
    m.tenant_id,
    m.person_id,
    m.organisation_id
)
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
select
  u.tenant_id,
  'CONNECTED_MEETING_IDENTITY_BACKFILLED',
  null,
  u.person_id,
  (
    array_agg(u.organisation_id)
      filter (where u.organisation_id is not null)
  )[1],
  jsonb_build_object(
    'meetings_linked',
    count(*)
  ),
  'redream_connected_identity_migration',
  1,
  now()
from updated u
group by
  u.tenant_id,
  u.person_id;

notify pgrst, 'reload schema';

commit;
