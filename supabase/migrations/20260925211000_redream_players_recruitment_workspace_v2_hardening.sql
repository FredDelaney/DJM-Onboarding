create or replace function public.platform_server_recruitment_create_target(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_full_name text,
  p_current_club text default null,
  p_current_country text default null,
  p_primary_position text default null,
  p_contract_expiry date default null,
  p_transfermarkt_url text default null,
  p_recruitment_priority smallint default 3
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id uuid;
  v_name text:=nullif(trim(coalesce(p_full_name,'')),'');
  v_key text;
  v_legacy_actor uuid:=null;
begin
  if not exists(
    select 1
    from platform.tenant_memberships m
    join platform.tenants t on t.id=m.tenant_id and t.status='active'
    where m.tenant_id=p_tenant_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and m.role in ('owner','admin','agent','operations','scout')
  ) then
    raise exception 'agency_staff_access_required' using errcode='42501';
  end if;

  if v_name is null then raise exception 'player_name_required'; end if;
  if coalesce(p_recruitment_priority,3) not between 1 and 5 then
    raise exception 'invalid_priority';
  end if;

  if exists(
    select 1
    from djm_os.scouting_prospects sp
    where sp.tenant_id=p_tenant_id
      and sp.linked_player_id is null
      and (
        lower(trim(sp.full_name))=lower(v_name)
        or (
          nullif(trim(coalesce(p_transfermarkt_url,'')),'') is not null
          and lower(trim(coalesce(sp.transfermarkt_url,'')))=lower(trim(p_transfermarkt_url))
        )
      )
  ) then
    raise exception 'recruitment_target_already_exists';
  end if;

  if exists(
    select 1
    from djm_os.team_members
    where user_id=p_actor_user_id and is_active
  ) then
    v_legacy_actor:=p_actor_user_id;
  end if;

  v_key:=p_tenant_id::text||':'||
    lower(regexp_replace(v_name,'[^a-zA-Z0-9]+','-','g'))||
    ':unknown';

  insert into djm_os.scouting_prospects(
    tenant_id,
    full_name,
    current_club,
    current_country,
    primary_position,
    contract_expiry,
    transfermarkt_url,
    availability_status,
    source,
    recruitment_source,
    source_confidence,
    owner_user_id,
    canonical_key,
    last_verified_at,
    recruitment_priority,
    recruitment_stage
  )
  values(
    p_tenant_id,
    v_name,
    nullif(trim(coalesce(p_current_club,'')),''),
    nullif(trim(coalesce(p_current_country,'')),''),
    nullif(trim(coalesce(p_primary_position,'')),''),
    p_contract_expiry,
    nullif(trim(coalesce(p_transfermarkt_url,'')),''),
    'unknown',
    'recruitment',
    'agency_workspace',
    1,
    v_legacy_actor,
    v_key,
    now(),
    coalesce(p_recruitment_priority,3),
    'identified'
  )
  returning id into v_id;

  insert into djm_os.events(
    tenant_id,
    event_type,
    actor_user_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values(
    p_tenant_id,
    'RECRUITMENT_TARGET_CREATED',
    v_legacy_actor,
    jsonb_build_object(
      'prospect_id',v_id,
      'full_name',v_name,
      'platform_actor_user_id',p_actor_user_id
    ),
    'agency_workspace',
    1,
    now()
  );

  return jsonb_build_object(
    'prospect_id',v_id,
    'created',true
  );
end;
$function$;

create or replace function public.platform_server_recruitment_set_stage(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_prospect_id uuid,
  p_stage text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_stage text:=lower(trim(coalesce(p_stage,'')));
  v_legacy_actor uuid:=null;
begin
  if not exists(
    select 1
    from platform.tenant_memberships m
    join platform.tenants t on t.id=m.tenant_id and t.status='active'
    where m.tenant_id=p_tenant_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and m.role in ('owner','admin','agent','operations','scout')
  ) then
    raise exception 'agency_staff_access_required' using errcode='42501';
  end if;

  if v_stage not in (
    'identified',
    'researching',
    'ready_to_contact',
    'contacted',
    'replied',
    'call_booked',
    'interested',
    'terms_discussed',
    'agreement_sent',
    'negotiating',
    'signed',
    'paused',
    'declined',
    'lost'
  ) then
    raise exception 'unsupported_recruitment_stage';
  end if;

  if exists(
    select 1
    from djm_os.team_members
    where user_id=p_actor_user_id and is_active
  ) then
    v_legacy_actor:=p_actor_user_id;
  end if;

  update djm_os.scouting_prospects
  set
    recruitment_stage=v_stage,
    signed_at=case
      when v_stage='signed' then coalesce(signed_at,now())
      else signed_at
    end,
    next_action_at=case
      when v_stage in ('signed','paused','declined','lost') then null
      else next_action_at
    end,
    updated_at=now()
  where id=p_prospect_id
    and tenant_id=p_tenant_id
    and linked_player_id is null;

  if not found then
    raise exception 'active_recruitment_target_not_found';
  end if;

  insert into djm_os.events(
    tenant_id,
    event_type,
    actor_user_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values(
    p_tenant_id,
    'RECRUITMENT_STAGE_UPDATED',
    v_legacy_actor,
    jsonb_build_object(
      'prospect_id',p_prospect_id,
      'stage',v_stage,
      'platform_actor_user_id',p_actor_user_id
    ),
    'agency_workspace',
    1,
    now()
  );

  return jsonb_build_object(
    'prospect_id',p_prospect_id,
    'stage',v_stage
  );
end;
$function$;

create or replace function public.platform_server_recruitment_set_next_action(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_prospect_id uuid,
  p_next_action_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_legacy_actor uuid:=null;
begin
  if not exists(
    select 1
    from platform.tenant_memberships m
    join platform.tenants t on t.id=m.tenant_id and t.status='active'
    where m.tenant_id=p_tenant_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and m.role in ('owner','admin','agent','operations','scout')
  ) then
    raise exception 'agency_staff_access_required' using errcode='42501';
  end if;

  if exists(
    select 1
    from djm_os.team_members
    where user_id=p_actor_user_id and is_active
  ) then
    v_legacy_actor:=p_actor_user_id;
  end if;

  update djm_os.scouting_prospects
  set
    next_action_at=p_next_action_at,
    updated_at=now()
  where id=p_prospect_id
    and tenant_id=p_tenant_id
    and linked_player_id is null
    and recruitment_stage not in ('signed','paused','declined','lost');

  if not found then
    raise exception 'active_recruitment_target_not_found';
  end if;

  insert into djm_os.events(
    tenant_id,
    event_type,
    actor_user_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values(
    p_tenant_id,
    'RECRUITMENT_NEXT_ACTION_SET',
    v_legacy_actor,
    jsonb_build_object(
      'prospect_id',p_prospect_id,
      'next_action_at',p_next_action_at,
      'platform_actor_user_id',p_actor_user_id
    ),
    'agency_workspace',
    1,
    now()
  );

  return jsonb_build_object(
    'prospect_id',p_prospect_id,
    'next_action_at',p_next_action_at
  );
end;
$function$;

create or replace function public.platform_server_recruitment_log_interaction(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_prospect_id uuid,
  p_channel text,
  p_direction text,
  p_summary text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_channel text:=lower(trim(coalesce(p_channel,'')));
  v_direction text:=lower(trim(coalesce(p_direction,'')));
  v_summary text:=nullif(trim(coalesce(p_summary,'')),'');
  v_interaction_id uuid;
  v_legacy_actor uuid:=null;
begin
  if not exists(
    select 1
    from platform.tenant_memberships m
    join platform.tenants t on t.id=m.tenant_id and t.status='active'
    where m.tenant_id=p_tenant_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and m.role in ('owner','admin','agent','operations','scout')
  ) then
    raise exception 'agency_staff_access_required' using errcode='42501';
  end if;

  if v_channel not in (
    'whatsapp',
    'instagram',
    'linkedin',
    'email',
    'phone',
    'meeting',
    'other'
  ) then
    raise exception 'unsupported_recruitment_channel';
  end if;

  if v_direction not in ('inbound','outbound','mutual') then
    raise exception 'unsupported_recruitment_direction';
  end if;

  if v_summary is null then
    raise exception 'interaction_summary_required';
  end if;

  if not exists(
    select 1
    from djm_os.scouting_prospects
    where id=p_prospect_id
      and tenant_id=p_tenant_id
      and linked_player_id is null
  ) then
    raise exception 'active_recruitment_target_not_found';
  end if;

  if exists(
    select 1
    from djm_os.team_members
    where user_id=p_actor_user_id and is_active
  ) then
    v_legacy_actor:=p_actor_user_id;
  end if;

  insert into djm_os.recruitment_interactions(
    tenant_id,
    prospect_id,
    owner_user_id,
    channel,
    direction,
    summary,
    occurred_at,
    source
  )
  values(
    p_tenant_id,
    p_prospect_id,
    p_actor_user_id,
    v_channel,
    v_direction,
    v_summary,
    now(),
    'agency_workspace'
  )
  returning id into v_interaction_id;

  update djm_os.scouting_prospects
  set
    first_contact_at=case
      when first_contact_at is null
        and v_direction in ('outbound','mutual')
        then now()
      else first_contact_at
    end,
    last_contact_at=case
      when v_direction in ('outbound','mutual') then now()
      else last_contact_at
    end,
    last_reply_at=case
      when v_direction in ('inbound','mutual') then now()
      else last_reply_at
    end,
    recruitment_stage=case
      when recruitment_stage in ('identified','researching','ready_to_contact')
        and v_direction='outbound'
        then 'contacted'
      when recruitment_stage in ('identified','researching','ready_to_contact','contacted')
        and v_direction in ('inbound','mutual')
        then 'replied'
      else recruitment_stage
    end,
    preferred_contact_channel=coalesce(preferred_contact_channel,v_channel),
    updated_at=now()
  where id=p_prospect_id
    and tenant_id=p_tenant_id;

  insert into djm_os.events(
    tenant_id,
    event_type,
    actor_user_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values(
    p_tenant_id,
    'RECRUITMENT_INTERACTION_LOGGED',
    v_legacy_actor,
    jsonb_build_object(
      'prospect_id',p_prospect_id,
      'interaction_id',v_interaction_id,
      'channel',v_channel,
      'direction',v_direction,
      'platform_actor_user_id',p_actor_user_id
    ),
    'agency_workspace',
    1,
    now()
  );

  return jsonb_build_object(
    'prospect_id',p_prospect_id,
    'interaction_id',v_interaction_id
  );
end;
$function$;
