begin;

-- =========================================================
-- ReDream Contact Reach + Verification v1
--
-- Contact methods remain canonical in djm_os.contact_methods.
-- This migration adds tenant-safe external profile evidence
-- and tenant-native contact read/write contracts.
--
-- External sources are evidence. They never silently change
-- a person's current employment.
-- =========================================================


-- ---------------------------------------------------------
-- Tenant-safe external profiles
-- ---------------------------------------------------------

create table if not exists djm_os.person_external_profiles (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references platform.tenants(id)
    on delete cascade,

  person_id uuid not null
    references djm_os.people(id)
    on delete cascade,

  provider text not null
    check (
      provider ~ '^[a-z0-9_]{2,40}$'
    ),

  profile_url text not null
    check (
      lower(profile_url) ~ '^https?://'
    ),

  external_id text,

  is_primary boolean not null default true,

  is_verified boolean not null default false,

  last_verified_at timestamptz,

  source text not null default 'manual',

  metadata jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(metadata) = 'object'
    ),

  created_by uuid,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint person_external_profiles_tenant_person_provider_key
    unique (
      tenant_id,
      person_id,
      provider
    )
);


create index if not exists
  person_external_profiles_person_idx
on djm_os.person_external_profiles (
  tenant_id,
  person_id
);


create index if not exists
  person_external_profiles_provider_idx
on djm_os.person_external_profiles (
  tenant_id,
  provider,
  last_verified_at desc
);


alter table
  djm_os.person_external_profiles
enable row level security;


drop policy if exists
  tenant_staff_select
on djm_os.person_external_profiles;


create policy
  tenant_staff_select
on djm_os.person_external_profiles
for select
to authenticated
using (
  private.user_has_staff_tenant_access(
    tenant_id
  )
);


revoke all
on djm_os.person_external_profiles
from public, anon, authenticated;


grant select
on djm_os.person_external_profiles
to authenticated;


grant all
on djm_os.person_external_profiles
to service_role;


-- ---------------------------------------------------------
-- Full tenant-safe contact intelligence read
-- ---------------------------------------------------------

create or replace function
  public.platform_server_contact_reach(
    p_tenant_id uuid,
    p_person_id uuid
  )
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if not exists (
    select 1
    from platform.tenants t
    where t.id = p_tenant_id
      and t.status = 'active'
  ) then
    raise exception 'tenant_not_found';
  end if;

  if not exists (
    select 1
    from djm_os.people p
    where p.id = p_person_id
      and p.tenant_id = p_tenant_id
      and coalesce(
        p.person_type,
        'contact'
      ) <> 'player'
  ) then
    raise exception 'contact_not_found';
  end if;

  select
    jsonb_build_object(
      'person_id',
      p.id,

      'person',
      jsonb_build_object(
        'full_name',
        p.full_name,

        'preferred_name',
        p.preferred_name,

        'person_type',
        p.person_type,

        'country',
        p.country,

        'city',
        p.city,

        'photo_url',
        p.photo_url,

        'linkedin_url',
        p.linkedin_url,

        'instagram_url',
        p.instagram_url,

        'last_verified_at',
        p.last_verified_at
      ),

      'employment',
      jsonb_build_object(
        'employment_id',
        employment.id,

        'organisation_id',
        employment.organisation_id,

        'organisation_name',
        organisation.name,

        'organisation_country',
        organisation.country,

        'organisation_city',
        organisation.city,

        'league_name',
        organisation.league_name,

        'role_title',
        employment.role_title,

        'department',
        employment.department,

        'started_on',
        employment.started_on,

        'last_verified_at',
        employment.last_verified_at,

        'source_url',
        employment.source_url,

        'verification_state',
        case
          when employment.id is null
            then 'not_recorded'

          when employment.last_verified_at is null
            then 'not_verified'

          when employment.last_verified_at >=
            now() - interval '60 days'
            then 'recently_verified'

          else 'verification_due'
        end
      ),

      'club',
      jsonb_build_object(
        'website_url',
        organisation.website_url,

        'linkedin_url',
        organisation.linkedin_url,

        'instagram_url',
        organisation.instagram_url,

        'transfermarkt_url',
        organisation.transfermarkt_url,

        'last_verified_at',
        organisation.last_verified_at
      ),

      'reach',
      jsonb_build_object(
        'email',
        case
          when email.id is null
            then null
          else
            jsonb_build_object(
              'id',
              email.id,

              'value',
              email.value,

              'is_primary',
              email.is_primary,

              'is_verified',
              email.is_verified,

              'last_verified_at',
              email.last_verified_at
            )
        end,

        'whatsapp',
        case
          when whatsapp.id is null
            then null
          else
            jsonb_build_object(
              'id',
              whatsapp.id,

              'value',
              whatsapp.value,

              'is_primary',
              whatsapp.is_primary,

              'is_verified',
              whatsapp.is_verified,

              'last_verified_at',
              whatsapp.last_verified_at
            )
        end,

        'phone',
        case
          when phone.id is null
            then null
          else
            jsonb_build_object(
              'id',
              phone.id,

              'value',
              phone.value,

              'is_primary',
              phone.is_primary,

              'is_verified',
              phone.is_verified,

              'last_verified_at',
              phone.last_verified_at
            )
        end,

        'reachable_channels',
        (
          case
            when email.id is not null
              then 1
            else 0
          end
          +
          case
            when whatsapp.id is not null
              then 1
            else 0
          end
          +
          case
            when phone.id is not null
              then 1
            else 0
          end
        )
      ),

      'external_profiles',
      jsonb_build_object(
        'transfermarkt',
        case
          when transfermarkt.id is null
            then null
          else
            jsonb_build_object(
              'id',
              transfermarkt.id,

              'url',
              transfermarkt.profile_url,

              'external_id',
              transfermarkt.external_id,

              'is_verified',
              transfermarkt.is_verified,

              'last_verified_at',
              transfermarkt.last_verified_at,

              'source',
              transfermarkt.source
            )
        end,

        'linkedin_url',
        p.linkedin_url,

        'instagram_url',
        p.instagram_url,

        'all',
        coalesce(
          (
            select
              jsonb_agg(
                jsonb_build_object(
                  'id',
                  ep.id,

                  'provider',
                  ep.provider,

                  'url',
                  ep.profile_url,

                  'external_id',
                  ep.external_id,

                  'is_verified',
                  ep.is_verified,

                  'last_verified_at',
                  ep.last_verified_at,

                  'source',
                  ep.source
                )
                order by
                  ep.is_primary desc,
                  ep.is_verified desc,
                  ep.updated_at desc
              )
            from
              djm_os.person_external_profiles ep
            where
              ep.tenant_id = p_tenant_id
              and ep.person_id = p.id
          ),
          '[]'::jsonb
        )
      ),

      'contact_methods',
      coalesce(
        (
          select
            jsonb_agg(
              jsonb_build_object(
                'id',
                cm.id,

                'channel',
                cm.channel,

                'value',
                cm.value,

                'is_primary',
                cm.is_primary,

                'is_verified',
                cm.is_verified,

                'last_verified_at',
                cm.last_verified_at
              )
              order by
                cm.channel,
                cm.is_primary desc,
                cm.updated_at desc
            )
          from
            djm_os.contact_methods cm
          where
            cm.tenant_id = p_tenant_id
            and cm.person_id = p.id
        ),
        '[]'::jsonb
      ),

      'truth_contract',
      jsonb_build_object(
        'employment',
        'Employment verification records when agency staff last confirmed the stored role and club. It does not update employment automatically from an external website.',

        'external_profiles',
        'External profiles are identity and verification evidence. They are not automatically treated as canonical employment truth.',

        'contact_methods',
        'Contact details are agency records. Verification means a staff member explicitly confirmed that detail.'
      )
    )
  into v_result
  from
    djm_os.people p

  left join lateral (
    select
      e.id,
      e.organisation_id,
      e.role_title,
      e.department,
      e.started_on,
      e.source_url,
      e.last_verified_at,
      e.updated_at
    from
      djm_os.employments e
    where
      e.tenant_id = p_tenant_id
      and e.person_id = p.id
      and e.is_current = true
    order by
      e.started_on desc nulls last,
      e.updated_at desc,
      e.id
    limit 1
  ) employment on true

  left join djm_os.organisations organisation
    on organisation.id =
      employment.organisation_id
   and organisation.tenant_id =
      p_tenant_id

  left join lateral (
    select
      cm.id,
      cm.value,
      cm.is_primary,
      cm.is_verified,
      cm.last_verified_at
    from
      djm_os.contact_methods cm
    where
      cm.tenant_id = p_tenant_id
      and cm.person_id = p.id
      and cm.channel = 'email'
    order by
      cm.is_primary desc,
      cm.is_verified desc,
      cm.updated_at desc
    limit 1
  ) email on true

  left join lateral (
    select
      cm.id,
      cm.value,
      cm.is_primary,
      cm.is_verified,
      cm.last_verified_at
    from
      djm_os.contact_methods cm
    where
      cm.tenant_id = p_tenant_id
      and cm.person_id = p.id
      and cm.channel = 'whatsapp'
    order by
      cm.is_primary desc,
      cm.is_verified desc,
      cm.updated_at desc
    limit 1
  ) whatsapp on true

  left join lateral (
    select
      cm.id,
      cm.value,
      cm.is_primary,
      cm.is_verified,
      cm.last_verified_at
    from
      djm_os.contact_methods cm
    where
      cm.tenant_id = p_tenant_id
      and cm.person_id = p.id
      and cm.channel = 'phone'
    order by
      cm.is_primary desc,
      cm.is_verified desc,
      cm.updated_at desc
    limit 1
  ) phone on true

  left join lateral (
    select
      ep.id,
      ep.profile_url,
      ep.external_id,
      ep.is_verified,
      ep.last_verified_at,
      ep.source
    from
      djm_os.person_external_profiles ep
    where
      ep.tenant_id = p_tenant_id
      and ep.person_id = p.id
      and ep.provider = 'transfermarkt'
    order by
      ep.is_primary desc,
      ep.is_verified desc,
      ep.updated_at desc
    limit 1
  ) transfermarkt on true

  where
    p.id = p_person_id
    and p.tenant_id = p_tenant_id;

  if v_result is null then
    raise exception 'contact_not_found';
  end if;

  return v_result;
end;
$function$;


revoke all on function
  public.platform_server_contact_reach(
    uuid,
    uuid
  )
from public, anon, authenticated;


grant execute on function
  public.platform_server_contact_reach(
    uuid,
    uuid
  )
to service_role;


-- ---------------------------------------------------------
-- Authenticated tenant-native contact read
-- ---------------------------------------------------------

create or replace function
  public.redream_relationship_contact(
    p_person_id uuid
  )
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant uuid :=
    private.redream_request_tenant();
begin
  return
    public.platform_server_contact_reach(
      v_tenant,
      p_person_id
    );
end;
$function$;


revoke all on function
  public.redream_relationship_contact(
    uuid
  )
from public, anon;


grant execute on function
  public.redream_relationship_contact(
    uuid
  )
to authenticated, service_role;


-- ---------------------------------------------------------
-- Save or update a contact method
--
-- Safe internal write.
-- Verification is explicit and never inferred.
-- ---------------------------------------------------------

create or replace function
  public.redream_relationship_save_contact_method(
    p_person_id uuid,
    p_channel text,
    p_value text,
    p_is_primary boolean default true,
    p_mark_verified boolean default false
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tenant uuid :=
    private.redream_request_tenant();

  v_channel text :=
    lower(
      trim(
        coalesce(
          p_channel,
          ''
        )
      )
    );

  v_value text :=
    trim(
      coalesce(
        p_value,
        ''
      )
    );

  v_normalised text;

  v_method_id uuid;

  v_organisation_id uuid;
begin
  if not exists (
    select 1
    from djm_os.people p
    where p.id = p_person_id
      and p.tenant_id = v_tenant
      and coalesce(
        p.person_type,
        'contact'
      ) <> 'player'
  ) then
    raise exception 'contact_not_found';
  end if;

  if v_channel not in (
    'email',
    'whatsapp',
    'phone'
  ) then
    raise exception 'unsupported_contact_channel';
  end if;

  if v_value = '' then
    raise exception 'contact_value_required';
  end if;

  if v_channel = 'email' then
    if v_value !~*
      '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    then
      raise exception 'invalid_email';
    end if;

    v_normalised :=
      lower(v_value);
  else
    v_normalised :=
      regexp_replace(
        v_value,
        '[^0-9]',
        '',
        'g'
      );

    if length(v_normalised) < 8
       or length(v_normalised) > 15
    then
      raise exception 'invalid_phone_number';
    end if;
  end if;

  if coalesce(
    p_is_primary,
    true
  ) then
    update
      djm_os.contact_methods
    set
      is_primary = false,
      updated_at = now()
    where
      tenant_id = v_tenant
      and person_id = p_person_id
      and channel = v_channel
      and is_primary = true;
  end if;

  select
    cm.id
  into
    v_method_id
  from
    djm_os.contact_methods cm
  where
    cm.tenant_id = v_tenant
    and cm.person_id = p_person_id
    and cm.channel = v_channel
    and coalesce(
      cm.normalised_value,
      ''
    ) = v_normalised
  order by
    cm.updated_at desc
  limit 1;

  if v_method_id is null then
    insert into
      djm_os.contact_methods (
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
      v_channel,
      v_value,
      v_normalised,
      coalesce(
        p_is_primary,
        true
      ),
      coalesce(
        p_mark_verified,
        false
      ),
      case
        when coalesce(
          p_mark_verified,
          false
        )
          then now()
        else null
      end,
      now(),
      now()
    )
    returning id
    into v_method_id;
  else
    update
      djm_os.contact_methods
    set
      value = v_value,

      normalised_value =
        v_normalised,

      is_primary =
        coalesce(
          p_is_primary,
          true
        ),

      is_verified =
        case
          when coalesce(
            p_mark_verified,
            false
          )
            then true
          else is_verified
        end,

      last_verified_at =
        case
          when coalesce(
            p_mark_verified,
            false
          )
            then now()
          else last_verified_at
        end,

      updated_at = now()
    where
      id = v_method_id
      and tenant_id = v_tenant;
  end if;

  select
    e.organisation_id
  into
    v_organisation_id
  from
    djm_os.employments e
  where
    e.tenant_id = v_tenant
    and e.person_id = p_person_id
    and e.is_current = true
  order by
    e.started_on desc nulls last,
    e.updated_at desc
  limit 1;

  insert into
    djm_os.events (
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
    'CONTACT_METHOD_UPDATED',
    auth.uid(),
    p_person_id,
    v_organisation_id,
    jsonb_build_object(
      'contact_method_id',
      v_method_id,

      'channel',
      v_channel,

      'is_primary',
      coalesce(
        p_is_primary,
        true
      ),

      'marked_verified',
      coalesce(
        p_mark_verified,
        false
      )
    ),
    'redream_relationships',
    1,
    now()
  );

  return
    public.platform_server_contact_reach(
      v_tenant,
      p_person_id
    );
end;
$function$;


revoke all on function
  public.redream_relationship_save_contact_method(
    uuid,
    text,
    text,
    boolean,
    boolean
  )
from public, anon;


grant execute on function
  public.redream_relationship_save_contact_method(
    uuid,
    text,
    text,
    boolean,
    boolean
  )
to authenticated, service_role;


-- ---------------------------------------------------------
-- Save an external identity / research profile
--
-- The URL is evidence only.
-- Saving it never changes current employment.
-- ---------------------------------------------------------

create or replace function
  public.redream_relationship_save_external_profile(
    p_person_id uuid,
    p_provider text,
    p_profile_url text,
    p_external_id text default null,
    p_mark_verified boolean default false
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tenant uuid :=
    private.redream_request_tenant();

  v_provider text :=
    lower(
      trim(
        coalesce(
          p_provider,
          ''
        )
      )
    );

  v_url text :=
    trim(
      coalesce(
        p_profile_url,
        ''
      )
    );

  v_profile_id uuid;

  v_organisation_id uuid;
begin
  if not exists (
    select 1
    from djm_os.people p
    where p.id = p_person_id
      and p.tenant_id = v_tenant
      and coalesce(
        p.person_type,
        'contact'
      ) <> 'player'
  ) then
    raise exception 'contact_not_found';
  end if;

  if v_provider not in (
    'transfermarkt',
    'linkedin',
    'instagram',
    'federation',
    'club_staff_page',
    'other'
  ) then
    raise exception 'unsupported_profile_provider';
  end if;

  if v_url !~*
    '^https?://'
  then
    raise exception 'invalid_profile_url';
  end if;

  if v_provider = 'transfermarkt'
     and v_url !~*
       '^https?://([^/]+\.)?transfermarkt\.[a-z]{2,}(/|$)'
  then
    raise exception 'invalid_transfermarkt_url';
  end if;

  if v_provider = 'linkedin'
     and v_url !~*
       '^https?://([^/]+\.)?linkedin\.com(/|$)'
  then
    raise exception 'invalid_linkedin_url';
  end if;

  if v_provider = 'instagram'
     and v_url !~*
       '^https?://([^/]+\.)?instagram\.com(/|$)'
  then
    raise exception 'invalid_instagram_url';
  end if;

  insert into
    djm_os.person_external_profiles (
      tenant_id,
      person_id,
      provider,
      profile_url,
      external_id,
      is_primary,
      is_verified,
      last_verified_at,
      source,
      metadata,
      created_by,
      created_at,
      updated_at
    )
  values (
    v_tenant,
    p_person_id,
    v_provider,
    v_url,
    nullif(
      trim(
        coalesce(
          p_external_id,
          ''
        )
      ),
      ''
    ),
    true,
    coalesce(
      p_mark_verified,
      false
    ),
    case
      when coalesce(
        p_mark_verified,
        false
      )
        then now()
      else null
    end,
    'manual',
    '{}'::jsonb,
    auth.uid(),
    now(),
    now()
  )
  on conflict (
    tenant_id,
    person_id,
    provider
  )
  do update
  set
    profile_url =
      excluded.profile_url,

    external_id =
      coalesce(
        excluded.external_id,
        djm_os.person_external_profiles.external_id
      ),

    is_primary = true,

    is_verified =
      case
        when excluded.is_verified
          then true
        else
          djm_os.person_external_profiles.is_verified
      end,

    last_verified_at =
      case
        when excluded.is_verified
          then now()
        else
          djm_os.person_external_profiles.last_verified_at
      end,

    updated_at = now()

  returning id
  into v_profile_id;

  if v_provider = 'linkedin' then
    update
      djm_os.people
    set
      linkedin_url = v_url,
      updated_at = now()
    where
      id = p_person_id
      and tenant_id = v_tenant;
  end if;

  if v_provider = 'instagram' then
    update
      djm_os.people
    set
      instagram_url = v_url,
      updated_at = now()
    where
      id = p_person_id
      and tenant_id = v_tenant;
  end if;

  select
    e.organisation_id
  into
    v_organisation_id
  from
    djm_os.employments e
  where
    e.tenant_id = v_tenant
    and e.person_id = p_person_id
    and e.is_current = true
  order by
    e.started_on desc nulls last,
    e.updated_at desc
  limit 1;

  insert into
    djm_os.events (
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
    'CONTACT_EXTERNAL_PROFILE_UPDATED',
    auth.uid(),
    p_person_id,
    v_organisation_id,
    jsonb_build_object(
      'external_profile_id',
      v_profile_id,

      'provider',
      v_provider,

      'marked_verified',
      coalesce(
        p_mark_verified,
        false
      )
    ),
    'redream_relationships',
    1,
    now()
  );

  return
    public.platform_server_contact_reach(
      v_tenant,
      p_person_id
    );
end;
$function$;


revoke all on function
  public.redream_relationship_save_external_profile(
    uuid,
    text,
    text,
    text,
    boolean
  )
from public, anon;


grant execute on function
  public.redream_relationship_save_external_profile(
    uuid,
    text,
    text,
    text,
    boolean
  )
to authenticated, service_role;


-- ---------------------------------------------------------
-- Explicitly confirm that the stored current employment
-- is still correct.
--
-- This never changes club or role. It only records that
-- a human checked the current record against evidence.
-- ---------------------------------------------------------

create or replace function
  public.redream_relationship_confirm_employment(
    p_person_id uuid,
    p_employment_id uuid,
    p_source_provider text default null,
    p_source_url text default null
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tenant uuid :=
    private.redream_request_tenant();

  v_provider text :=
    nullif(
      lower(
        trim(
          coalesce(
            p_source_provider,
            ''
          )
        )
      ),
      ''
    );

  v_source_url text :=
    nullif(
      trim(
        coalesce(
          p_source_url,
          ''
        )
      ),
      ''
    );

  v_organisation_id uuid;
begin
  select
    e.organisation_id
  into
    v_organisation_id
  from
    djm_os.employments e
  join djm_os.people p
    on p.id = e.person_id
   and p.tenant_id = v_tenant
  where
    e.id = p_employment_id
    and e.person_id = p_person_id
    and e.tenant_id = v_tenant
    and e.is_current = true
  limit 1;

  if v_organisation_id is null then
    raise exception 'current_employment_not_found';
  end if;

  if v_source_url is not null
     and v_source_url !~*
       '^https?://'
  then
    raise exception 'invalid_source_url';
  end if;

  if v_provider = 'transfermarkt'
     and v_source_url is not null
     and v_source_url !~*
       '^https?://([^/]+\.)?transfermarkt\.[a-z]{2,}(/|$)'
  then
    raise exception 'invalid_transfermarkt_url';
  end if;

  update
    djm_os.employments
  set
    last_verified_at = now(),

    source_url =
      coalesce(
        v_source_url,
        source_url
      ),

    updated_at = now()
  where
    id = p_employment_id
    and person_id = p_person_id
    and tenant_id = v_tenant
    and is_current = true;

  if v_provider is not null
     and v_source_url is not null
  then
    insert into
      djm_os.person_external_profiles (
        tenant_id,
        person_id,
        provider,
        profile_url,
        is_primary,
        is_verified,
        last_verified_at,
        source,
        metadata,
        created_by,
        created_at,
        updated_at
      )
    values (
      v_tenant,
      p_person_id,
      v_provider,
      v_source_url,
      true,
      true,
      now(),
      'employment_verification',
      '{}'::jsonb,
      auth.uid(),
      now(),
      now()
    )
    on conflict (
      tenant_id,
      person_id,
      provider
    )
    do update
    set
      profile_url =
        excluded.profile_url,

      is_primary = true,

      is_verified = true,

      last_verified_at = now(),

      source =
        'employment_verification',

      updated_at = now();
  end if;

  insert into
    djm_os.events (
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
    'CONTACT_EMPLOYMENT_VERIFIED',
    auth.uid(),
    p_person_id,
    v_organisation_id,
    jsonb_build_object(
      'employment_id',
      p_employment_id,

      'source_provider',
      v_provider,

      'source_recorded',
      v_source_url is not null
    ),
    'redream_relationships',
    1,
    now()
  );

  return
    public.platform_server_contact_reach(
      v_tenant,
      p_person_id
    );
end;
$function$;


revoke all on function
  public.redream_relationship_confirm_employment(
    uuid,
    uuid,
    text,
    text
  )
from public, anon;


grant execute on function
  public.redream_relationship_confirm_employment(
    uuid,
    uuid,
    text,
    text
  )
to authenticated, service_role;


comment on table
  djm_os.person_external_profiles
is
  'Tenant-scoped external identity and research profiles for agency relationship contacts. External evidence never mutates employment automatically.';


comment on function
  public.redream_relationship_contact(
    uuid
  )
is
  'Returns tenant-native contact reach, current employment and external verification evidence for one relationship contact.';


comment on function
  public.redream_relationship_save_contact_method(
    uuid,
    text,
    text,
    boolean,
    boolean
  )
is
  'Adds or updates an email, WhatsApp or phone contact method inside the resolved agency tenant. Verification is explicit.';


comment on function
  public.redream_relationship_save_external_profile(
    uuid,
    text,
    text,
    text,
    boolean
  )
is
  'Stores tenant-scoped external profile evidence such as Transfermarkt without changing employment automatically.';


comment on function
  public.redream_relationship_confirm_employment(
    uuid,
    uuid,
    text,
    text
  )
is
  'Explicit human confirmation that the stored current employment remains correct, optionally recording the source used to verify it.';


commit;
