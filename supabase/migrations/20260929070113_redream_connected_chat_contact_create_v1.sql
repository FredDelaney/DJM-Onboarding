begin;

create or replace function public.redream_messaging_thread_create_contact_and_bind(
  p_provider text,
  p_external_thread_id text,
  p_full_name text,
  p_club_name text default null,
  p_role_title text default null,
  p_country text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_thread_external_id text:=trim(coalesce(p_external_thread_id,''));
  v_name text:=nullif(trim(coalesce(p_full_name,'')),'');
  v_club_name text:=nullif(trim(coalesce(p_club_name,'')),'');
  v_role_title text:=nullif(trim(coalesce(p_role_title,'')),'');
  v_country text:=nullif(trim(coalesce(p_country,'')),'');
  v_thread djm_os.messaging_threads%rowtype;
  v_existing_person_id uuid;
  v_existing_count integer:=0;
  v_person_id uuid;
  v_org_id uuid;
  v_org_name text;
  v_instagram_handle text;
  v_instagram_url text;
begin
  if v_user is null then
    raise exception 'authentication_required'
      using errcode='42501';
  end if;

  if not private.user_has_staff_tenant_access(
    v_tenant,
    v_user
  ) then
    raise exception 'workspace_access_denied'
      using errcode='42501';
  end if;

  if v_provider not in ('instagram','whatsapp') then
    raise exception 'unsupported_provider';
  end if;

  if v_thread_external_id='' then
    raise exception 'thread_required';
  end if;

  if v_name is null or length(v_name)<2 then
    raise exception 'contact_name_required';
  end if;

  if length(v_name)>180
     or length(coalesce(v_club_name,''))>180
     or length(coalesce(v_role_title,''))>180
     or length(coalesce(v_country,''))>120
  then
    raise exception 'contact_fields_too_long';
  end if;

  if v_role_title is not null and v_club_name is null then
    raise exception 'club_required_for_role';
  end if;

  select t.*
  into v_thread
  from djm_os.messaging_threads t
  where t.tenant_id=v_tenant
    and t.user_id=v_user
    and t.provider=v_provider
    and t.external_thread_id=v_thread_external_id
    and t.is_selected=true
  limit 1
  for update;

  if v_thread.id is null then
    raise exception 'selected_thread_not_found';
  end if;

  if v_thread.bound_person_id is not null
     or v_thread.bound_player_id is not null
  then
    raise exception 'thread_identity_already_resolved';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_tenant::text||'|'||lower(v_name),
      0
    )
  );

  select
    count(*),
    (array_agg(p.id order by p.created_at,p.id))[1]
  into v_existing_count,v_existing_person_id
  from djm_os.people p
  where p.tenant_id=v_tenant
    and coalesce(p.person_type,'contact')<>'player'
    and lower(trim(p.full_name))=lower(v_name);

  if v_existing_count>0 then
    return jsonb_build_object(
      'created',false,
      'bound',false,
      'reason','network_person_already_exists',
      'existing_person_id',v_existing_person_id,
      'existing_person_name',v_name
    );
  end if;

  if v_club_name is not null then
    v_org_id:=private.platform_server_agency_ensure_club(
      v_tenant,
      v_club_name,
      v_country
    );

    select o.name
    into v_org_name
    from djm_os.organisations o
    where o.id=v_org_id
      and o.tenant_id=v_tenant;
  end if;

  if v_provider='instagram'
     and nullif(trim(coalesce(v_thread.participant_label,'')),'') is not null
  then
    v_instagram_handle:=
      regexp_replace(
        lower(trim(v_thread.participant_label)),
        '^@+',
        ''
      );

    if v_instagram_handle ~ '^[a-z0-9._]{1,30}$' then
      v_instagram_url:=
        'https://www.instagram.com/'||
        v_instagram_handle;
    else
      v_instagram_handle:=null;
    end if;
  end if;

  insert into djm_os.people(
    tenant_id,
    full_name,
    person_type,
    country,
    instagram_url,
    source_confidence,
    last_verified_at,
    updated_at
  )
  values(
    v_tenant,
    v_name,
    'contact',
    v_country,
    v_instagram_url,
    1,
    now(),
    now()
  )
  returning id
  into v_person_id;
  if v_org_id is not null then
    insert into djm_os.employments(
      tenant_id,
      person_id,
      organisation_id,
      role_title,
      is_current,
      confidence,
      last_verified_at,
      updated_at
    )
    values(
      v_tenant,
      v_person_id,
      v_org_id,
      v_role_title,
      true,
      1,
      now(),
      now()
    );
  end if;

  insert into djm_os.relationships(
    tenant_id,
    team_member_id,
    person_id,
    strength_score,
    first_known_at,
    relationship_notes,
    updated_at
  )
  values(
    v_tenant,
    v_user,
    v_person_id,
    null,
    now(),
    case
      when v_provider='instagram' and v_instagram_handle is not null
        then 'Created from selected Instagram chat @'||v_instagram_handle
      else 'Created from selected '||v_provider||' chat'
    end,
    now()
  )
  on conflict(team_member_id,person_id)
  do nothing;

  update djm_os.messaging_threads
  set
    bound_person_id=v_person_id,
    bound_organisation_id=v_org_id,
    bound_player_id=null,
    bound_at=now(),
    bound_by=v_user,
    updated_at=now()
  where id=v_thread.id;

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
  values
  (
    v_tenant,
    'CONTACT_CREATED',
    v_user,
    v_person_id,
    v_org_id,
    jsonb_build_object(
      'name',v_name,
      'created',true,
      'source','selected_chat',
      'provider',v_provider,
      'external_thread_id',v_thread_external_id,
      'participant_label',v_thread.participant_label,
      'instagram_handle',v_instagram_handle,
      'role_title',v_role_title,
      'organisation_name',v_org_name
    ),
    'connected_work',
    1,
    now()
  ),
  (
    v_tenant,
    'MESSAGING_THREAD_CONTACT_BOUND',
    v_user,
    v_person_id,
    v_org_id,
    jsonb_build_object(
      'provider',v_provider,
      'external_thread_id',v_thread_external_id,
      'participant_label',v_thread.participant_label,
      'person_name',v_name,
      'organisation_name',v_org_name,
      'identity_kind','network_person',
      'created_from_thread',true
    ),
    'redream_messaging',
    1,
    now()
  );
  return jsonb_build_object(
    'created',true,
    'bound',true,
    'person_id',v_person_id,
    'person_name',v_name,
    'organisation_id',v_org_id,
    'organisation_name',v_org_name,
    'instagram_handle',v_instagram_handle,
    'identity_kind','network_person',
    'external_action',false,
    'truth_contract',jsonb_build_object(
      'confirmation',
        'The signed-in agent explicitly supplied the person name and chose to create this Network identity.',
      'existing_people',
        'An exact existing Network name prevents creation so the agent can choose the existing person instead.',
      'provider_identity',
        'Instagram handle is copied only from the selected thread participant label after explicit creation.',
      'external_action',
        'Creating and linking the person changes internal agency identity only and never sends an external message.'
    )
  );
end;
$function$;

revoke all on function public.redream_messaging_thread_create_contact_and_bind(
  text,text,text,text,text,text
)
from
  public,
  anon;

grant execute on function public.redream_messaging_thread_create_contact_and_bind(
  text,text,text,text,text,text
)
to authenticated;

commit;
