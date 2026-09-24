-- Everyday agency creation v1.
-- Tenant-bound, service-only writers used by the authenticated agency-os Edge Function.
-- These deliberately do not reuse legacy single-agency canonical-key helpers.

create unique index if not exists organisations_tenant_club_name_unique
  on djm_os.organisations (tenant_id, lower(btrim(name)))
  where organisation_type = 'club';

-- Manual deal creation must not invent an outcome probability.
-- Legacy writers may continue to populate this field, but this path stores null.
alter table djm_os.deal_rooms
  alter column probability drop not null;

create or replace function private.platform_server_assert_agency_operator(
  p_tenant_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_tenant_id is null or p_user_id is null then
    raise exception 'agency_operator_access_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from platform.tenant_memberships m
    join platform.tenants t
      on t.id = m.tenant_id
     and t.status = 'active'
    where m.tenant_id = p_tenant_id
      and m.user_id = p_user_id
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'agent', 'operations')
  ) then
    raise exception 'agency_operator_access_required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.platform_server_assert_agency_operator(uuid, uuid) from public;

create or replace function private.platform_server_ensure_team_member(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  if p_user_id is null then
    raise exception 'actor_user_id_required';
  end if;

  select coalesce(
    nullif(btrim(p.display_name), ''),
    nullif(btrim(u.email), ''),
    'Agency team member'
  )
  into v_display_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;

  if v_display_name is null then
    raise exception 'actor_user_not_found';
  end if;

  insert into djm_os.team_members (
    user_id,
    display_name,
    is_active
  )
  values (
    p_user_id,
    v_display_name,
    true
  )
  on conflict (user_id)
  do update
  set is_active = true,
      updated_at = now();
end;
$$;

revoke all on function private.platform_server_ensure_team_member(uuid) from public;

create or replace function private.platform_server_agency_ensure_club(
  p_tenant_id uuid,
  p_name text,
  p_country text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_country text := nullif(btrim(coalesce(p_country, '')), '');
  v_id uuid;
begin
  if p_tenant_id is null or v_name is null or length(v_name) < 2 then
    raise exception 'club_name_required';
  end if;

  select o.id
  into v_id
  from djm_os.organisations o
  where o.tenant_id = p_tenant_id
    and o.organisation_type = 'club'
    and lower(btrim(o.name)) = lower(v_name)
  order by o.created_at
  limit 1;

  if v_id is null then
    begin
      insert into djm_os.organisations (
        tenant_id,
        name,
        organisation_type,
        country,
        canonical_key
      )
      values (
        p_tenant_id,
        v_name,
        'club',
        v_country,
        null
      )
      returning id into v_id;
    exception
      when unique_violation then
        select o.id
        into v_id
        from djm_os.organisations o
        where o.tenant_id = p_tenant_id
          and o.organisation_type = 'club'
          and lower(btrim(o.name)) = lower(v_name)
        order by o.created_at
        limit 1;
    end;
  elsif v_country is not null then
    update djm_os.organisations
    set country = coalesce(country, v_country),
        updated_at = now()
    where id = v_id
      and tenant_id = p_tenant_id;
  end if;

  if v_id is null then
    raise exception 'club_create_failed';
  end if;

  return v_id;
end;
$$;

revoke all on function private.platform_server_agency_ensure_club(uuid, text, text) from public;

create or replace function public.platform_server_agency_create_options(
  p_tenant_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_players jsonb;
  v_clubs jsonb;
begin
  perform private.platform_server_assert_agency_operator(
    p_tenant_id,
    p_actor_user_id
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'player_id', x.id,
        'name', x.name,
        'current_club', x.current_club,
        'primary_position', x.primary_position
      )
      order by lower(x.name), x.id
    ),
    '[]'::jsonb
  )
  into v_players
  from (
    select
      p.id,
      coalesce(
        nullif(btrim(p.preferred_name), ''),
        nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
        'Player'
      ) as name,
      p.current_club,
      p.primary_position
    from public.players p
    where p.tenant_id = p_tenant_id
      and p.football_status <> 'retired'
    order by p.updated_at desc
    limit 500
  ) x;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'organisation_id', x.id,
        'name', x.name,
        'country', x.country
      )
      order by lower(x.name), x.id
    ),
    '[]'::jsonb
  )
  into v_clubs
  from (
    select o.id, o.name, o.country
    from djm_os.organisations o
    where o.tenant_id = p_tenant_id
      and o.organisation_type = 'club'
    order by o.updated_at desc
    limit 500
  ) x;

  return jsonb_build_object(
    'players', v_players,
    'clubs', v_clubs
  );
end;
$$;

revoke all on function public.platform_server_agency_create_options(uuid, uuid) from public;
grant execute on function public.platform_server_agency_create_options(uuid, uuid) to service_role;

create or replace function public.platform_server_agency_create_player(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_first_name text,
  p_last_name text default null,
  p_primary_position text default null,
  p_current_club text default null,
  p_current_country text default null,
  p_contract_expiry date default null,
  p_transfermarkt_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_name text := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last_name text := nullif(btrim(coalesce(p_last_name, '')), '');
  v_position text := nullif(btrim(coalesce(p_primary_position, '')), '');
  v_club text := nullif(btrim(coalesce(p_current_club, '')), '');
  v_country text := nullif(btrim(coalesce(p_current_country, '')), '');
  v_tm text := nullif(btrim(coalesce(p_transfermarkt_url, '')), '');
  v_player_id uuid;
  v_existing_id uuid;
begin
  perform private.platform_server_assert_agency_operator(
    p_tenant_id,
    p_actor_user_id
  );

  if v_first_name is null then
    raise exception 'player_name_required';
  end if;

  if v_position is null then
    raise exception 'player_position_required';
  end if;

  if v_tm is not null
     and v_tm !~* '^https?://([^/]+\.)?transfermarkt\.[^/]+/' then
    raise exception 'invalid_transfermarkt_url';
  end if;

  if v_club is not null then
    select p.id
    into v_existing_id
    from public.players p
    where p.tenant_id = p_tenant_id
      and lower(btrim(coalesce(p.first_name, ''))) = lower(v_first_name)
      and lower(btrim(coalesce(p.last_name, ''))) = lower(coalesce(v_last_name, ''))
      and lower(btrim(coalesce(p.current_club, ''))) = lower(v_club)
      and p.football_status <> 'retired'
    order by p.updated_at desc
    limit 1;
  end if;

  if v_existing_id is not null then
    return jsonb_build_object(
      'player_id', v_existing_id,
      'created', false,
      'duplicate', true
    );
  end if;

  insert into public.players (
    tenant_id,
    first_name,
    last_name,
    primary_position,
    current_club,
    current_country,
    contract_expiry,
    transfermarkt_url,
    football_status,
    onboarding_status,
    verification_status,
    primary_staff_user_id
  )
  values (
    p_tenant_id,
    v_first_name,
    v_last_name,
    v_position,
    v_club,
    v_country,
    p_contract_expiry,
    v_tm,
    'active',
    'not_started',
    'unverified',
    p_actor_user_id
  )
  returning id into v_player_id;

  insert into djm_os.events (
    tenant_id,
    event_type,
    actor_user_id,
    player_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (
    p_tenant_id,
    'AGENCY_PLAYER_CREATED',
    p_actor_user_id,
    v_player_id,
    jsonb_build_object(
      'player_id', v_player_id,
      'primary_position', v_position,
      'current_club', v_club
    ),
    'agency_workspace',
    1,
    now()
  );

  insert into platform.audit_events (
    tenant_id,
    actor_user_id,
    actor_kind,
    action,
    entity_type,
    entity_id,
    after_state,
    metadata
  )
  values (
    p_tenant_id,
    p_actor_user_id,
    'user',
    'platform.agency.player_created',
    'player',
    v_player_id::text,
    jsonb_build_object(
      'first_name', v_first_name,
      'last_name', v_last_name,
      'primary_position', v_position,
      'current_club', v_club
    ),
    jsonb_build_object('source', 'agency_workspace')
  );

  return jsonb_build_object(
    'player_id', v_player_id,
    'created', true,
    'duplicate', false
  );
end;
$$;

revoke all on function public.platform_server_agency_create_player(
  uuid, uuid, text, text, text, text, text, date, text
) from public;
grant execute on function public.platform_server_agency_create_player(
  uuid, uuid, text, text, text, text, text, date, text
) to service_role;

create or replace function public.platform_server_agency_create_club_need(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_club_name text,
  p_country text,
  p_position text,
  p_title text default null,
  p_notes text default null,
  p_expires_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_position text := nullif(btrim(coalesce(p_position, '')), '');
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_org_id uuid;
  v_need_id uuid;
  v_expires_at timestamptz;
begin
  perform private.platform_server_assert_agency_operator(
    p_tenant_id,
    p_actor_user_id
  );
  perform private.platform_server_ensure_team_member(p_actor_user_id);

  if v_position is null then
    raise exception 'position_required';
  end if;

  if length(coalesce(v_notes, '')) > 4000 then
    raise exception 'notes_too_long';
  end if;

  v_org_id := private.platform_server_agency_ensure_club(
    p_tenant_id,
    p_club_name,
    p_country
  );

  if p_expires_on is not null then
    v_expires_at := (p_expires_on + 1)::timestamptz - interval '1 second';
  end if;

  insert into djm_os.club_needs (
    tenant_id,
    organisation_id,
    owner_user_id,
    title,
    position,
    profile_notes,
    raw_request,
    source_context,
    status,
    confidence,
    confirmed_at,
    received_at,
    priority,
    need_type,
    expires_at
  )
  values (
    p_tenant_id,
    v_org_id,
    p_actor_user_id,
    coalesce(v_title, v_position || ' requirement'),
    v_position,
    v_notes,
    v_notes,
    'Agency workspace',
    'active',
    1,
    now(),
    now(),
    3,
    'confirmed',
    v_expires_at
  )
  returning id into v_need_id;

  insert into djm_os.events (
    tenant_id,
    event_type,
    actor_user_id,
    organisation_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (
    p_tenant_id,
    'CLUB_NEED_CREATED',
    p_actor_user_id,
    v_org_id,
    jsonb_build_object(
      'club_need_id', v_need_id,
      'position', v_position,
      'source', 'agency_workspace'
    ),
    'agency_workspace',
    1,
    now()
  );

  insert into platform.audit_events (
    tenant_id,
    actor_user_id,
    actor_kind,
    action,
    entity_type,
    entity_id,
    after_state,
    metadata
  )
  values (
    p_tenant_id,
    p_actor_user_id,
    'user',
    'platform.agency.club_need_created',
    'club_need',
    v_need_id::text,
    jsonb_build_object(
      'organisation_id', v_org_id,
      'position', v_position,
      'title', coalesce(v_title, v_position || ' requirement')
    ),
    jsonb_build_object('source', 'agency_workspace')
  );

  return jsonb_build_object(
    'club_need_id', v_need_id,
    'organisation_id', v_org_id,
    'created', true
  );
end;
$$;

revoke all on function public.platform_server_agency_create_club_need(
  uuid, uuid, text, text, text, text, text, date
) from public;
grant execute on function public.platform_server_agency_create_club_need(
  uuid, uuid, text, text, text, text, text, date
) to service_role;

create or replace function public.platform_server_agency_create_contact(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_contact_name text,
  p_club_name text,
  p_contact_role text default null,
  p_country text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(coalesce(p_contact_name, '')), '');
  v_role text := nullif(btrim(coalesce(p_contact_role, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_org_id uuid;
  v_person_id uuid;
  v_created boolean := false;
begin
  perform private.platform_server_assert_agency_operator(
    p_tenant_id,
    p_actor_user_id
  );
  perform private.platform_server_ensure_team_member(p_actor_user_id);

  if v_name is null or length(v_name) < 2 then
    raise exception 'contact_name_required';
  end if;

  if length(coalesce(v_notes, '')) > 4000 then
    raise exception 'notes_too_long';
  end if;

  v_org_id := private.platform_server_agency_ensure_club(
    p_tenant_id,
    p_club_name,
    p_country
  );

  select p.id
  into v_person_id
  from djm_os.people p
  join djm_os.employments e
    on e.person_id = p.id
   and e.tenant_id = p_tenant_id
   and e.organisation_id = v_org_id
   and e.is_current = true
  where p.tenant_id = p_tenant_id
    and lower(btrim(p.full_name)) = lower(v_name)
  order by e.updated_at desc
  limit 1;

  if v_person_id is null then
    insert into djm_os.people (
      tenant_id,
      full_name,
      person_type,
      country,
      canonical_key,
      source_confidence,
      last_verified_at
    )
    values (
      p_tenant_id,
      v_name,
      'club_contact',
      nullif(btrim(coalesce(p_country, '')), ''),
      null,
      1,
      now()
    )
    returning id into v_person_id;

    v_created := true;

    insert into djm_os.employments (
      tenant_id,
      person_id,
      organisation_id,
      role_title,
      is_current,
      confidence,
      last_verified_at
    )
    values (
      p_tenant_id,
      v_person_id,
      v_org_id,
      v_role,
      true,
      1,
      now()
    );
  elsif v_role is not null then
    update djm_os.employments
    set role_title = coalesce(v_role, role_title),
        updated_at = now(),
        last_verified_at = now()
    where tenant_id = p_tenant_id
      and person_id = v_person_id
      and organisation_id = v_org_id
      and is_current = true;
  end if;

  insert into djm_os.relationships (
    tenant_id,
    team_member_id,
    person_id,
    first_known_at,
    relationship_notes
  )
  values (
    p_tenant_id,
    p_actor_user_id,
    v_person_id,
    now(),
    v_notes
  )
  on conflict (team_member_id, person_id)
  do update
  set relationship_notes = coalesce(
        excluded.relationship_notes,
        djm_os.relationships.relationship_notes
      ),
      updated_at = now();

  insert into djm_os.events (
    tenant_id,
    event_type,
    actor_user_id,
    organisation_id,
    person_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (
    p_tenant_id,
    case when v_created then 'CONTACT_CREATED' else 'CONTACT_LINKED' end,
    p_actor_user_id,
    v_org_id,
    v_person_id,
    jsonb_build_object(
      'name', v_name,
      'role_title', v_role,
      'created', v_created
    ),
    'agency_workspace',
    1,
    now()
  );

  insert into platform.audit_events (
    tenant_id,
    actor_user_id,
    actor_kind,
    action,
    entity_type,
    entity_id,
    after_state,
    metadata
  )
  values (
    p_tenant_id,
    p_actor_user_id,
    'user',
    case
      when v_created then 'platform.agency.contact_created'
      else 'platform.agency.contact_linked'
    end,
    'contact',
    v_person_id::text,
    jsonb_build_object(
      'organisation_id', v_org_id,
      'name', v_name,
      'role_title', v_role
    ),
    jsonb_build_object('source', 'agency_workspace')
  );

  return jsonb_build_object(
    'person_id', v_person_id,
    'organisation_id', v_org_id,
    'created', v_created
  );
end;
$$;

revoke all on function public.platform_server_agency_create_contact(
  uuid, uuid, text, text, text, text, text
) from public;
grant execute on function public.platform_server_agency_create_contact(
  uuid, uuid, text, text, text, text, text
) to service_role;

create or replace function public.platform_server_agency_create_deal(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_player_id uuid,
  p_club_name text,
  p_country text default null,
  p_stage text default 'qualifying',
  p_expected_commission numeric default null,
  p_currency text default 'EUR',
  p_next_action text default null,
  p_next_action_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage text := lower(btrim(coalesce(p_stage, 'qualifying')));
  v_currency text := upper(btrim(coalesce(nullif(p_currency, ''), 'EUR')));
  v_next_action text := nullif(btrim(coalesce(p_next_action, '')), '');
  v_org_id uuid;
  v_player_name text;
  v_deal_id uuid;
begin
  perform private.platform_server_assert_agency_operator(
    p_tenant_id,
    p_actor_user_id
  );

  if p_player_id is null then
    raise exception 'player_required';
  end if;

  if v_stage not in (
    'qualifying',
    'contacted',
    'interest',
    'negotiating',
    'offer',
    'contracting'
  ) then
    raise exception 'invalid_deal_stage';
  end if;

  if p_expected_commission is not null and p_expected_commission < 0 then
    raise exception 'invalid_expected_commission';
  end if;

  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_currency';
  end if;

  select coalesce(
    nullif(btrim(p.preferred_name), ''),
    nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
    'Player'
  )
  into v_player_name
  from public.players p
  where p.id = p_player_id
    and p.tenant_id = p_tenant_id;

  if v_player_name is null then
    raise exception 'player_not_found_for_tenant';
  end if;

  v_org_id := private.platform_server_agency_ensure_club(
    p_tenant_id,
    p_club_name,
    p_country
  );

  insert into djm_os.deal_rooms (
    tenant_id,
    title,
    organisation_id,
    player_id,
    owner_user_id,
    stage,
    status,
    expected_commission,
    currency,
    probability,
    model_probability,
    manual_probability,
    probability_source,
    probability_basis,
    next_action_text,
    next_action_at,
    source
  )
  values (
    p_tenant_id,
    v_player_name || ' / ' || btrim(p_club_name),
    v_org_id,
    p_player_id,
    p_actor_user_id,
    v_stage,
    'active',
    p_expected_commission,
    v_currency,
    null,
    null,
    null,
    'not_scored',
    jsonb_build_object(
      'status', 'not_scored_on_manual_create',
      'reason', 'No outcome probability was invented for a manually created deal.'
    ),
    v_next_action,
    p_next_action_at,
    'agency_workspace'
  )
  returning id into v_deal_id;

  insert into djm_os.events (
    tenant_id,
    event_type,
    actor_user_id,
    organisation_id,
    player_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (
    p_tenant_id,
    'DEAL_CREATED',
    p_actor_user_id,
    v_org_id,
    p_player_id,
    jsonb_build_object(
      'deal_room_id', v_deal_id,
      'stage', v_stage,
      'probability_status', 'not_scored'
    ),
    'agency_workspace',
    1,
    now()
  );

  insert into platform.audit_events (
    tenant_id,
    actor_user_id,
    actor_kind,
    action,
    entity_type,
    entity_id,
    after_state,
    metadata
  )
  values (
    p_tenant_id,
    p_actor_user_id,
    'user',
    'platform.agency.deal_created',
    'deal_room',
    v_deal_id::text,
    jsonb_build_object(
      'organisation_id', v_org_id,
      'player_id', p_player_id,
      'stage', v_stage,
      'expected_commission', p_expected_commission,
      'currency', v_currency,
      'probability_status', 'not_scored'
    ),
    jsonb_build_object('source', 'agency_workspace')
  );

  return jsonb_build_object(
    'deal_room_id', v_deal_id,
    'organisation_id', v_org_id,
    'player_id', p_player_id,
    'created', true,
    'probability_status', 'not_scored'
  );
end;
$$;

revoke all on function public.platform_server_agency_create_deal(
  uuid, uuid, uuid, text, text, text, numeric, text, text, timestamptz
) from public;
grant execute on function public.platform_server_agency_create_deal(
  uuid, uuid, uuid, text, text, text, numeric, text, text, timestamptz
) to service_role;
