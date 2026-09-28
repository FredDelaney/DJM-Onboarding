begin;

drop index if exists
  djm_os.contact_methods_channel_value_unique;

create unique index
  contact_methods_channel_value_unique
on
  djm_os.contact_methods(
    tenant_id,
    channel,
    normalised_value
  )
where
  normalised_value is not null;


create or replace function public.redream_provider_contact_bind(
  p_provider text,
  p_external_contact_id text,
  p_person_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid :=
    auth.uid();

  v_tenant uuid :=
    private.redream_request_tenant();

  v_provider text :=
    lower(
      btrim(
        coalesce(
          p_provider,
          ''
        )
      )
    );

  v_external_contact_id text :=
    btrim(
      coalesce(
        p_external_contact_id,
        ''
      )
    );

  v_source
    djm_os.provider_contact_sources%rowtype;

  v_person_name text;

  v_organisation_id uuid;

  v_organisation_name text;

  v_email text;

  v_method_id uuid;

  v_conflict_person_id uuid;

  v_has_primary_email boolean := false;

  v_previous_person_id uuid;
begin
  if v_user is null then
    raise exception
      'authentication_required';
  end if;

  if not
    private.user_has_staff_tenant_access(
      v_tenant,
      v_user
    )
  then
    raise exception
      'workspace_access_denied';
  end if;

  if v_provider not in (
    'google',
    'microsoft'
  ) then
    raise exception
      'unsupported_provider';
  end if;

  if v_external_contact_id = '' then
    raise exception
      'provider_contact_required';
  end if;

  select
    s.*
  into
    v_source
  from
    djm_os.provider_contact_sources s
  where
    s.tenant_id =
      v_tenant
    and s.user_id =
      v_user
    and s.provider =
      v_provider
    and s.external_contact_id =
      v_external_contact_id
    and s.is_deleted =
      false
  limit 1;

  if v_source.id is null then
    raise exception
      'provider_contact_not_found';
  end if;

  v_email :=
    nullif(
      lower(
        btrim(
          coalesce(
            v_source.email,
            ''
          )
        )
      ),
      ''
    );

  v_previous_person_id :=
    v_source.person_id;

  if p_person_id is null then
    update
      djm_os.provider_contact_sources s
    set
      person_id = null,
      updated_at = now()
    where
      s.tenant_id =
        v_tenant
      and s.user_id =
        v_user
      and s.provider =
        v_provider
      and s.is_deleted =
        false
      and (
        s.external_contact_id =
          v_external_contact_id
        or (
          v_email is not null
          and lower(
            btrim(
              coalesce(
                s.email,
                ''
              )
            )
          ) =
          v_email
        )
      );

    insert into
      djm_os.events(
        tenant_id,
        event_type,
        actor_user_id,
        person_id,
        payload,
        source,
        confidence,
        occurred_at
      )
    values (
      v_tenant,
      'PROVIDER_CONTACT_NETWORK_UNLINKED',
      v_user,
      v_previous_person_id,
      jsonb_build_object(
        'provider',
        v_provider,
        'external_contact_id',
        v_external_contact_id,
        'display_name',
        v_source.display_name,
        'email',
        v_source.email,
        'canonical_email_retained',
        (
          v_previous_person_id is not null
          and v_email is not null
          and exists (
            select 1
            from
              djm_os.contact_methods cm
            where
              cm.tenant_id =
                v_tenant
              and cm.person_id =
                v_previous_person_id
              and cm.channel =
                'email'
              and cm.normalised_value =
                v_email
          )
        )
      ),
      'redream_provider_contacts',
      1,
      now()
    );

    return
      jsonb_build_object(
        'bound',
        false,
        'external_contact_id',
        v_external_contact_id,
        'person_id',
        null,
        'person_name',
        null,
        'organisation_id',
        null,
        'organisation_name',
        null,
        'canonical_email',
        v_email
      );
  end if;

  select
    p.full_name
  into
    v_person_name
  from
    djm_os.people p
  where
    p.id =
      p_person_id
    and p.tenant_id =
      v_tenant
    and coalesce(
      p.person_type,
      'contact'
    ) <> 'player'
  limit 1;

  if v_person_name is null then
    raise exception
      'contact_not_found';
  end if;

  select
    e.organisation_id,
    o.name
  into
    v_organisation_id,
    v_organisation_name
  from
    djm_os.employments e
  join
    djm_os.organisations o
    on o.id =
      e.organisation_id
   and o.tenant_id =
      v_tenant
  where
    e.tenant_id =
      v_tenant
    and e.person_id =
      p_person_id
    and e.is_current =
      true
  order by
    e.started_on desc nulls last,
    e.updated_at desc,
    e.id
  limit 1;

  if v_email is not null then
    select
      cm.person_id
    into
      v_conflict_person_id
    from
      djm_os.contact_methods cm
    where
      cm.tenant_id =
        v_tenant
      and cm.channel =
        'email'
      and cm.normalised_value =
        v_email
      and cm.person_id <>
        p_person_id
    limit 1;

    if v_conflict_person_id is not null then
      raise exception
        'provider_contact_email_already_linked';
    end if;

    select
      cm.id
    into
      v_method_id
    from
      djm_os.contact_methods cm
    where
      cm.tenant_id =
        v_tenant
      and cm.person_id =
        p_person_id
      and cm.channel =
        'email'
      and cm.normalised_value =
        v_email
    order by
      cm.updated_at desc
    limit 1;

    if v_method_id is null then
      select
        exists (
          select 1
          from
            djm_os.contact_methods cm
          where
            cm.tenant_id =
              v_tenant
            and cm.person_id =
              p_person_id
            and cm.channel =
              'email'
            and cm.is_primary =
              true
        )
      into
        v_has_primary_email;

      begin
        insert into
          djm_os.contact_methods(
            tenant_id,
            person_id,
            channel,
            value,
            normalised_value,
            is_primary,
            is_verified,
            last_verified_at,
            created_at,
            updated_at
          )
        values (
          v_tenant,
          p_person_id,
          'email',
          v_source.email,
          v_email,
          not v_has_primary_email,
          true,
          now(),
          now(),
          now()
        )
        returning
          id
        into
          v_method_id;

      exception
        when unique_violation then
          raise exception
            'provider_contact_email_already_linked';
      end;
    else
      update
        djm_os.contact_methods cm
      set
        value =
          v_source.email,
        normalised_value =
          v_email,
        is_verified =
          true,
        last_verified_at =
          now(),
        updated_at =
          now()
      where
        cm.id =
          v_method_id
        and cm.tenant_id =
          v_tenant;
    end if;
  end if;

  update
    djm_os.provider_contact_sources s
  set
    person_id =
      p_person_id,
    updated_at =
      now()
  where
    s.tenant_id =
      v_tenant
    and s.user_id =
      v_user
    and s.provider =
      v_provider
    and s.is_deleted =
      false
    and (
      s.external_contact_id =
        v_external_contact_id
      or (
        v_email is not null
        and lower(
          btrim(
            coalesce(
              s.email,
              ''
            )
          )
        ) =
        v_email
      )
    );

  insert into
    djm_os.events(
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
    'PROVIDER_CONTACT_NETWORK_LINKED',
    v_user,
    p_person_id,
    v_organisation_id,
    jsonb_build_object(
      'provider',
      v_provider,
      'external_contact_id',
      v_external_contact_id,
      'display_name',
      v_source.display_name,
      'email',
      v_source.email,
      'person_name',
      v_person_name,
      'organisation_name',
      v_organisation_name,
      'canonical_contact_method_id',
      v_method_id,
      'canonical_email_confirmed',
      v_method_id is not null
    ),
    'redream_provider_contacts',
    1,
    now()
  );

  return
    jsonb_build_object(
      'bound',
      true,
      'external_contact_id',
      v_external_contact_id,
      'person_id',
      p_person_id,
      'person_name',
      v_person_name,
      'organisation_id',
      v_organisation_id,
      'organisation_name',
      v_organisation_name,
      'canonical_email',
      v_email,
      'canonical_contact_method_id',
      v_method_id
    );
end;
$function$;


revoke all on function
  public.redream_provider_contact_bind(
    text,
    text,
    uuid
  )
from
  public,
  anon;

grant execute on function
  public.redream_provider_contact_bind(
    text,
    text,
    uuid
  )
to
  authenticated,
  service_role;

notify pgrst, 'reload schema';

commit;
