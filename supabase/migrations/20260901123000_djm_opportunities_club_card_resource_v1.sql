-- DJM Opportunities club card resource v1
-- Adds club league identity, Transfermarkt visibility and direct club-contact capture.

alter table djm_os.organisations
  add column if not exists league_name text;

comment on column djm_os.organisations.league_name is
  'Current first-team league/competition label used for DJM club and opportunity context.';

create or replace function public.djm_market_needs_v3(
  p_status text default null::text
)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_base jsonb;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  v_base := public.djm_market_needs_v2(p_status);

  return coalesce((
    select jsonb_agg(
      x.item
      || jsonb_build_object(
        'organisation_country', o.country,
        'organisation_league_name', o.league_name,
        'transfermarkt_url', o.transfermarkt_url
      )
      order by x.ordinality
    )
    from jsonb_array_elements(v_base) with ordinality as x(item, ordinality)
    left join djm_os.organisations o
      on o.id = nullif(x.item->>'organisation_id', '')::uuid
  ), '[]'::jsonb);
end
$function$;

create or replace function public.djm_market_update_club_identity(
  p_organisation_id uuid,
  p_league_name text default null::text,
  p_country text default null::text,
  p_transfermarkt_url text default null::text
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_tm text := nullif(trim(coalesce(p_transfermarkt_url, '')), '');
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  if v_tm is not null
     and v_tm !~* '^https?://[^/]*transfermarkt\.' then
    raise exception 'Transfermarkt URL must point to a Transfermarkt domain';
  end if;

  update djm_os.organisations
  set
    league_name = nullif(trim(coalesce(p_league_name, '')), ''),
    country = coalesce(nullif(trim(coalesce(p_country, '')), ''), country),
    transfermarkt_url = v_tm,
    updated_at = now(),
    last_verified_at = now()
  where id = p_organisation_id
    and organisation_type = 'club';

  if not found then
    raise exception 'Club not found';
  end if;

  insert into djm_os.events(
    event_type,
    actor_user_id,
    organisation_id,
    payload,
    source,
    confidence,
    occurred_at
  ) values (
    'CLUB_RECRUITMENT_IDENTITY_UPDATED',
    auth.uid(),
    p_organisation_id,
    jsonb_build_object(
      'league_name', nullif(trim(coalesce(p_league_name, '')), ''),
      'country', nullif(trim(coalesce(p_country, '')), ''),
      'transfermarkt_url', v_tm
    ),
    'opportunity_os',
    1,
    now()
  );

  return jsonb_build_object(
    'organisation_id', p_organisation_id,
    'league_name', nullif(trim(coalesce(p_league_name, '')), ''),
    'country', nullif(trim(coalesce(p_country, '')), ''),
    'transfermarkt_url', v_tm
  );
end
$function$;

create or replace function public.djm_market_add_need_contact(
  p_need_id uuid,
  p_full_name text,
  p_role_title text default null::text,
  p_email text default null::text,
  p_whatsapp text default null::text
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_org_id uuid;
  v_org_name text;
  v_org_country text;
  v_result jsonb;
  v_person_id uuid;
  v_contact_org_id uuid;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  if p_full_name is null or length(trim(p_full_name)) < 2 then
    raise exception 'Contact name is required';
  end if;

  select o.id, o.name, o.country
    into v_org_id, v_org_name, v_org_country
  from djm_os.club_needs n
  join djm_os.organisations o on o.id = n.organisation_id
  where n.id = p_need_id;

  if not found then
    raise exception 'Club need not found';
  end if;

  v_result := public.djm_network_upsert_person(
    trim(p_full_name),
    'club_contact',
    nullif(trim(coalesce(p_whatsapp, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    null,
    v_org_country,
    null,
    v_org_name,
    nullif(trim(coalesce(p_role_title, '')), ''),
    v_org_country
  );

  v_person_id := nullif(v_result->>'person_id', '')::uuid;
  v_contact_org_id := nullif(v_result->>'organisation_id', '')::uuid;

  if v_person_id is null then
    raise exception 'Contact could not be created';
  end if;

  if v_contact_org_id is distinct from v_org_id then
    raise exception 'Contact was not linked to the expected club';
  end if;

  update djm_os.club_needs
  set
    source_person_id = v_person_id,
    updated_at = now()
  where id = p_need_id;

  insert into djm_os.events(
    event_type,
    actor_user_id,
    organisation_id,
    person_id,
    payload,
    source,
    confidence,
    occurred_at
  ) values (
    'CLUB_NEED_CONTACT_LINKED',
    auth.uid(),
    v_org_id,
    v_person_id,
    jsonb_build_object(
      'club_need_id', p_need_id,
      'role_title', nullif(trim(coalesce(p_role_title, '')), '')
    ),
    'opportunity_os',
    1,
    now()
  );

  return jsonb_build_object(
    'person_id', v_person_id,
    'organisation_id', v_org_id,
    'full_name', trim(p_full_name),
    'role_title', nullif(trim(coalesce(p_role_title, '')), ''),
    'created', coalesce((v_result->>'created')::boolean, false)
  );
end
$function$;

revoke all on function public.djm_market_needs_v3(text) from public;
revoke all on function public.djm_market_needs_v3(text) from anon;
grant execute on function public.djm_market_needs_v3(text) to authenticated;

revoke all on function public.djm_market_update_club_identity(uuid, text, text, text) from public;
revoke all on function public.djm_market_update_club_identity(uuid, text, text, text) from anon;
grant execute on function public.djm_market_update_club_identity(uuid, text, text, text) to authenticated;

revoke all on function public.djm_market_add_need_contact(uuid, text, text, text, text) from public;
revoke all on function public.djm_market_add_need_contact(uuid, text, text, text, text) from anon;
grant execute on function public.djm_market_add_need_contact(uuid, text, text, text, text) to authenticated;

comment on function public.djm_market_needs_v3(text) is
  'Staff-only club need cards enriched with league, country and Transfermarkt club identity.';

comment on function public.djm_market_update_club_identity(uuid, text, text, text) is
  'Updates league, country and Transfermarkt identity for a club from Opportunities.';

comment on function public.djm_market_add_need_contact(uuid, text, text, text, text) is
  'Creates or updates a Network club contact and immediately links that person to the specified club need.';

-- Verified current Wellington Phoenix identity.
update djm_os.organisations
set
  league_name = coalesce(league_name, 'A-League Men'),
  transfermarkt_url = coalesce(
    transfermarkt_url,
    'https://www.transfermarkt.com/wellington-phoenix/startseite/verein/8445'
  ),
  updated_at = now()
where lower(trim(name)) = 'wellington phoenix'
  and organisation_type = 'club';
