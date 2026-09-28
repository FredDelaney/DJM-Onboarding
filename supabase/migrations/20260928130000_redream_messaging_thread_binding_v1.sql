begin;

alter table djm_os.messaging_threads
  add column if not exists bound_person_id uuid
    references djm_os.people(id)
    on delete set null;

alter table djm_os.messaging_threads
  add column if not exists bound_organisation_id uuid
    references djm_os.organisations(id)
    on delete set null;

alter table djm_os.messaging_threads
  add column if not exists bound_at timestamptz;

alter table djm_os.messaging_threads
  add column if not exists bound_by uuid
    references auth.users(id)
    on delete set null;

create index if not exists messaging_threads_bound_person_idx
  on djm_os.messaging_threads(
    tenant_id,
    bound_person_id
  )
  where bound_person_id is not null;


create or replace function public.redream_messaging_threads(
  p_provider text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
  v_user uuid := auth.uid();
  v_provider text :=
    lower(trim(coalesce(p_provider, '')));
  v_items jsonb;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  if v_provider not in (
    'whatsapp',
    'instagram'
  ) then
    raise exception 'unsupported_provider';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'provider',
        t.provider,

        'external_thread_id',
        t.external_thread_id,

        'participant_label',
        t.participant_label,

        'is_selected',
        t.is_selected,

        'last_activity_at',
        t.last_activity_at,

        'bound_person_id',
        t.bound_person_id,

        'bound_person_name',
        p.full_name,

                'bound_organisation_id',
        ce.organisation_id,

        'bound_organisation_name',
        o.name
      )
      order by
        t.is_selected desc,
        t.last_activity_at desc nulls last
    ),
    '[]'::jsonb
  )
  into v_items
  from djm_os.messaging_threads t

  left join djm_os.people p
    on p.id = t.bound_person_id
   and p.tenant_id = v_tenant

    left join lateral (
    select
      e.organisation_id
    from djm_os.employments e
    where e.tenant_id = v_tenant
      and e.person_id = t.bound_person_id
      and e.is_current = true
    order by
      e.started_on desc nulls last,
      e.updated_at desc
    limit 1
  ) ce on true

  left join djm_os.organisations o
    on o.id = ce.organisation_id
   and o.tenant_id = v_tenant

  where t.tenant_id = v_tenant
    and t.user_id = v_user
    and t.provider = v_provider;

  return jsonb_build_object(
    'threads',
    v_items
  );
end;
$function$;


create or replace function public.redream_messaging_thread_bind_contact(
  p_provider text,
  p_external_thread_id text,
  p_person_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tenant uuid :=
    private.redream_request_tenant();

  v_user uuid :=
    auth.uid();

  v_provider text :=
    lower(
      trim(
        coalesce(
          p_provider,
          ''
        )
      )
    );

  v_external_thread_id text :=
    trim(
      coalesce(
        p_external_thread_id,
        ''
      )
    );

  v_thread_id uuid;
  v_participant_label text;

  v_person_name text;

  v_organisation_id uuid;
  v_organisation_name text;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  if not private.user_has_staff_tenant_access(
    v_tenant,
    v_user
  ) then
    raise exception 'workspace_access_denied';
  end if;

  if v_provider not in (
    'whatsapp',
    'instagram'
  ) then
    raise exception 'unsupported_provider';
  end if;

  if v_external_thread_id = '' then
    raise exception 'thread_required';
  end if;

  select
    t.id,
    t.participant_label
  into
    v_thread_id,
    v_participant_label
  from djm_os.messaging_threads t
  where t.tenant_id = v_tenant
    and t.user_id = v_user
    and t.provider = v_provider
    and t.external_thread_id =
      v_external_thread_id
  limit 1;

  if v_thread_id is null then
    raise exception 'thread_not_found';
  end if;

  if p_person_id is null then
    update djm_os.messaging_threads
    set
      bound_person_id = null,
      bound_organisation_id = null,
      bound_at = null,
      bound_by = null,
      updated_at = now()
    where id = v_thread_id;

    return jsonb_build_object(
      'thread_id',
      v_thread_id,

      'bound',
      false,

      'bound_person_id',
      null,

      'bound_person_name',
      null,

      'bound_organisation_id',
      null,

      'bound_organisation_name',
      null
    );
  end if;

  select
    p.full_name
  into
    v_person_name
  from djm_os.people p
  where p.id = p_person_id
    and p.tenant_id = v_tenant
    and coalesce(
      p.person_type,
      'contact'
    ) <> 'player'
  limit 1;

  if v_person_name is null then
    raise exception 'contact_not_found';
  end if;

  select
    e.organisation_id,
    o.name
  into
    v_organisation_id,
    v_organisation_name
  from djm_os.employments e

  join djm_os.organisations o
    on o.id = e.organisation_id
   and o.tenant_id = v_tenant

  where e.tenant_id = v_tenant
    and e.person_id = p_person_id
    and e.is_current = true

  order by
    e.started_on desc nulls last,
    e.updated_at desc

  limit 1;

  update djm_os.messaging_threads
  set
    bound_person_id =
      p_person_id,

    bound_organisation_id =
      v_organisation_id,

    bound_at =
      now(),

    bound_by =
      v_user,

    updated_at =
      now()

  where id =
    v_thread_id;

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
  values (
    v_tenant,

    'MESSAGING_THREAD_CONTACT_BOUND',

    v_user,

    p_person_id,

    v_organisation_id,

    jsonb_build_object(
      'provider',
      v_provider,

      'external_thread_id',
      v_external_thread_id,

      'participant_label',
      v_participant_label,

      'person_name',
      v_person_name,

      'organisation_name',
      v_organisation_name
    ),

    'redream_messaging',

    1,

    now()
  );

  return jsonb_build_object(
    'thread_id',
    v_thread_id,

    'bound',
    true,

    'bound_person_id',
    p_person_id,

    'bound_person_name',
    v_person_name,

    'bound_organisation_id',
    v_organisation_id,

    'bound_organisation_name',
    v_organisation_name
  );
end;
$function$;


create or replace function private.redream_enrich_messaging_capture_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_provider text;

  v_external_thread_id text;

  v_person_id uuid;
  v_person_name text;

  v_organisation_id uuid;
  v_organisation_name text;
begin
  v_provider :=
    lower(
      trim(
        coalesce(
          new.context_json
            ->> 'capture_origin',
          ''
        )
      )
    );

  if v_provider not in (
    'instagram',
    'whatsapp'
  ) then
    return new;
  end if;

  v_external_thread_id :=
    trim(
      coalesce(
        new.context_json
          ->> 'external_thread_id',
        ''
      )
    );

  if v_external_thread_id = '' then
    return new;
  end if;

    select
    t.bound_person_id,
    p.full_name,
    ce.organisation_id,
    o.name

  into
    v_person_id,
    v_person_name,
    v_organisation_id,
    v_organisation_name

  from djm_os.messaging_threads t

  left join djm_os.people p
    on p.id =
      t.bound_person_id
   and p.tenant_id =
      t.tenant_id

    left join lateral (
    select
      e.organisation_id
    from djm_os.employments e
    where e.tenant_id =
        t.tenant_id
      and e.person_id =
        t.bound_person_id
      and e.is_current =
        true
    order by
      e.started_on desc nulls last,
      e.updated_at desc
    limit 1
  ) ce on true

  left join djm_os.organisations o
    on o.id =
      ce.organisation_id
   and o.tenant_id =
      t.tenant_id

  where t.tenant_id =
      new.tenant_id

    and t.user_id =
      new.submitted_by

    and t.provider =
      v_provider

    and t.external_thread_id =
      v_external_thread_id

    and t.is_selected =
      true

  limit 1;

  if v_person_id is null then
    return new;
  end if;

  new.person_id :=
    coalesce(
      new.person_id,
      v_person_id
    );

  new.organisation_id :=
    coalesce(
      new.organisation_id,
      v_organisation_id
    );

  new.context_json :=
    coalesce(
      new.context_json,
      '{}'::jsonb
    )
    ||
    jsonb_strip_nulls(
      jsonb_build_object(
        'person_id',
        v_person_id,

        'person_name',
        v_person_name,

        'organisation_id',
        v_organisation_id,

        'organisation_name',
        v_organisation_name,

        'messaging_identity_bound',
        true
      )
    );

  return new;
end;
$function$;


drop trigger if exists
  redream_enrich_messaging_capture_context
on djm_os.captures;

create trigger
  redream_enrich_messaging_capture_context

before insert
on djm_os.captures

for each row

execute function
  private.redream_enrich_messaging_capture_context();


revoke all on function
  public.redream_messaging_thread_bind_contact(
    text,
    text,
    uuid
  )
from public, anon;

grant execute on function
  public.redream_messaging_thread_bind_contact(
    text,
    text,
    uuid
  )
to authenticated, service_role;


revoke all on function
  public.redream_messaging_threads(
    text
  )
from public, anon;

grant execute on function
  public.redream_messaging_threads(
    text
  )
to authenticated, service_role;


revoke all on function
  private.redream_enrich_messaging_capture_context()
from public, anon, authenticated;


notify pgrst, 'reload schema';

commit;
