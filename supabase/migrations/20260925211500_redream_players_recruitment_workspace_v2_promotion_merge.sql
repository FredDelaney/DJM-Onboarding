create or replace function public.platform_server_recruitment_promote_player(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_prospect_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_prospect djm_os.scouting_prospects%rowtype;
  v_player_id uuid;
  v_first_name text;
  v_last_name text;
  v_space integer;
  v_legacy_actor uuid:=null;
begin
  if not exists(
    select 1
    from platform.tenant_memberships m
    join platform.tenants t on t.id=m.tenant_id and t.status='active'
    where m.tenant_id=p_tenant_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and m.role in ('owner','admin','agent')
  ) then
    raise exception 'agent_access_required' using errcode='42501';
  end if;

  if exists(
    select 1
    from djm_os.team_members
    where user_id=p_actor_user_id and is_active
  ) then
    v_legacy_actor:=p_actor_user_id;
  end if;

  select *
  into v_prospect
  from djm_os.scouting_prospects
  where id=p_prospect_id
    and tenant_id=p_tenant_id
  for update;

  if not found then
    raise exception 'recruitment_target_not_found_for_tenant';
  end if;

  if v_prospect.linked_player_id is not null then
    return jsonb_build_object(
      'player_id',v_prospect.linked_player_id,
      'already_promoted',true
    );
  end if;

  if v_prospect.recruitment_stage<>'signed' then
    raise exception 'target_must_be_represented_before_player_creation';
  end if;

  v_space:=strpos(trim(v_prospect.full_name),' ');

  if v_space>0 then
    v_first_name:=left(trim(v_prospect.full_name),v_space-1);
    v_last_name:=nullif(
      trim(substr(trim(v_prospect.full_name),v_space+1)),
      ''
    );
  else
    v_first_name:=trim(v_prospect.full_name);
    v_last_name:=null;
  end if;

  insert into public.players(
    tenant_id,
    first_name,
    last_name,
    date_of_birth,
    nationalities,
    preferred_foot,
    primary_position,
    secondary_positions,
    current_club,
    current_country,
    contract_expiry,
    transfermarkt_url,
    wyscout_url,
    stats_url,
    instagram_url,
    football_status,
    onboarding_status,
    verification_status,
    agency_priority,
    next_action,
    next_action_due,
    review_required_at,
    review_reason,
    primary_staff_user_id
  )
  values(
    p_tenant_id,
    v_first_name,
    v_last_name,
    v_prospect.date_of_birth,
    case
      when nullif(trim(coalesce(v_prospect.nationality,'')),'') is null
        then '{}'::text[]
      else array[trim(v_prospect.nationality)]
    end,
    case lower(trim(coalesce(v_prospect.preferred_foot,'')))
      when 'left' then 'Left'
      when 'right' then 'Right'
      when 'both' then 'Both'
      else null
    end,
    v_prospect.primary_position,
    coalesce(v_prospect.secondary_positions,'{}'::text[]),
    v_prospect.current_club,
    v_prospect.current_country,
    v_prospect.contract_expiry,
    v_prospect.transfermarkt_url,
    v_prospect.wyscout_url,
    v_prospect.stats_url,
    v_prospect.instagram_url,
    'active',
    'not_started',
    'unverified',
    'high',
    'Complete player onboarding',
    current_date+7,
    now(),
    'Promoted from recruitment after representation was confirmed',
    p_actor_user_id
  )
  returning id into v_player_id;

  delete from djm_os.football_intelligence_subjects created
  where created.player_id=v_player_id
    and created.prospect_id is null
    and exists(
      select 1
      from djm_os.football_intelligence_subjects existing
      where existing.prospect_id=p_prospect_id
        and existing.id<>created.id
    );

  update djm_os.scouting_prospects
  set
    linked_player_id=v_player_id,
    signed_player_id=v_player_id,
    signed_at=coalesce(signed_at,now()),
    recruitment_stage='signed',
    next_action_at=null,
    updated_at=now()
  where id=p_prospect_id
    and tenant_id=p_tenant_id;

  update djm_os.tasks
  set
    status='completed',
    completed_at=now(),
    updated_at=now()
  where tenant_id=p_tenant_id
    and source=('recruitment:'||p_prospect_id::text)
    and status not in ('completed','cancelled');

  insert into djm_os.events(
    tenant_id,
    event_type,
    actor_user_id,
    player_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values(
    p_tenant_id,
    'RECRUITMENT_PROMOTED_TO_PLAYER',
    v_legacy_actor,
    v_player_id,
    jsonb_build_object(
      'prospect_id',p_prospect_id,
      'player_id',v_player_id,
      'platform_actor_user_id',p_actor_user_id
    ),
    'agency_workspace',
    1,
    now()
  );

  return jsonb_build_object(
    'player_id',v_player_id,
    'prospect_id',p_prospect_id,
    'already_promoted',false,
    'representation_agreement_recorded',false
  );
end;
$function$;
