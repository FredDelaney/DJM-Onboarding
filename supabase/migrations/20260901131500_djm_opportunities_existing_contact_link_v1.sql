-- DJM Opportunities existing club contact linking v1
-- Lets staff attach an existing current club contact to a recruitment need.

create or replace function public.djm_market_link_need_contact(
  p_need_id uuid,
  p_person_id uuid
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_org_id uuid;
  v_full_name text;
  v_role_title text;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  if p_need_id is null or p_person_id is null then
    raise exception 'Club need and contact are required';
  end if;

  select n.organisation_id
    into v_org_id
  from djm_os.club_needs n
  where n.id = p_need_id;

  if not found then
    raise exception 'Club need not found';
  end if;

  select p.full_name, e.role_title
    into v_full_name, v_role_title
  from djm_os.employments e
  join djm_os.people p on p.id = e.person_id
  where e.organisation_id = v_org_id
    and e.person_id = p_person_id
    and e.is_current = true
    and coalesce(p.person_type, 'club_contact') <> 'player'
  order by e.updated_at desc nulls last, e.created_at desc
  limit 1;

  if not found then
    raise exception 'Selected person is not a current contact at this club';
  end if;

  update djm_os.club_needs
  set
    source_person_id = p_person_id,
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
    'CLUB_NEED_EXISTING_CONTACT_LINKED',
    auth.uid(),
    v_org_id,
    p_person_id,
    jsonb_build_object(
      'club_need_id', p_need_id,
      'role_title', v_role_title
    ),
    'opportunity_os',
    1,
    now()
  );

  return jsonb_build_object(
    'need_id', p_need_id,
    'person_id', p_person_id,
    'organisation_id', v_org_id,
    'full_name', v_full_name,
    'role_title', v_role_title
  );
end
$function$;

revoke all on function public.djm_market_link_need_contact(uuid, uuid) from public;
revoke all on function public.djm_market_link_need_contact(uuid, uuid) from anon;
grant execute on function public.djm_market_link_need_contact(uuid, uuid) to authenticated;

comment on function public.djm_market_link_need_contact(uuid, uuid) is
  'Staff-only action that links an existing current club contact to a specific recruitment need without duplicating the Network person.';
