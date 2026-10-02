create or replace function private.protect_player_admin_fields()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  internal_player_service boolean :=
    coalesce(pg_catalog.current_setting('djm.internal_player_service',true),'')='on';
  internal_user_link boolean :=
    coalesce(pg_catalog.current_setting('djm.internal_user_link',true),'')='on';
  internal_career_change boolean :=
    coalesce(pg_catalog.current_setting('djm.internal_career_change',true),'')='on';
  internal_demo_verification boolean :=
    coalesce(pg_catalog.current_setting('djm.internal_demo_verification',true),'')='on';
  internal_profile_verification boolean :=
    coalesce(pg_catalog.current_setting('djm.internal_profile_verification',true),'')='on';
  tenant_admin boolean:=private.user_is_tenant_admin(old.tenant_id);
begin
  if internal_profile_verification then
    if (
      to_jsonb(new)-array[
        'verification_status',
        'verified_at',
        'review_required_at',
        'review_reason',
        'updated_at'
      ]::text[]
    ) is distinct from (
      to_jsonb(old)-array[
        'verification_status',
        'verified_at',
        'review_required_at',
        'review_reason',
        'updated_at'
      ]::text[]
    ) then
      raise exception 'Player profile verification attempted an unexpected player-field change';
    end if;

    if new.verification_status <> 'verified'
       or new.verified_at is null
       or new.review_required_at is not null
       or new.review_reason is not null then
      raise exception 'Player profile verification must leave the record verified and current';
    end if;

    return new;
  end if;

  if internal_demo_verification then
    if not exists(
      select 1
      from platform.tenants t
      where t.id=old.tenant_id
        and coalesce((t.metadata->>'synthetic_test_tenant')::boolean,false)=true
    ) then
      raise exception 'Synthetic demo verification maintenance is restricted to synthetic tenants';
    end if;

    if (
      to_jsonb(new)-array['verified_at','updated_at']::text[]
    ) is distinct from (
      to_jsonb(old)-array['verified_at','updated_at']::text[]
    ) then
      raise exception 'Synthetic demo verification maintenance attempted an unexpected player-field change';
    end if;

    if old.verification_status<>'verified'
       or new.verification_status<>'verified'
       or new.verified_at is null then
      raise exception 'Synthetic demo verification maintenance may only complete a missing verified_at timestamp';
    end if;

    return new;
  end if;

  if internal_player_service then
    if (
      to_jsonb(new)-array['next_action','next_action_due','updated_at']::text[]
    ) is distinct from (
      to_jsonb(old)-array['next_action','next_action_due','updated_at']::text[]
    ) then
      raise exception 'Internal player service write attempted an unexpected player-field change';
    end if;

    return new;
  end if;

  if internal_career_change then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.first_name is distinct from old.first_name
       or new.last_name is distinct from old.last_name
       or new.preferred_name is distinct from old.preferred_name
       or new.date_of_birth is distinct from old.date_of_birth
       or new.nationalities is distinct from old.nationalities
       or new.height_cm is distinct from old.height_cm
       or new.preferred_foot is distinct from old.preferred_foot
       or new.primary_position is distinct from old.primary_position
       or new.secondary_positions is distinct from old.secondary_positions
       or new.current_club is distinct from old.current_club
       or new.current_league is distinct from old.current_league
       or new.current_country is distinct from old.current_country
       or new.contract_status is distinct from old.contract_status
       or new.contract_expiry is distinct from old.contract_expiry
       or new.football_status is distinct from old.football_status
       or new.transfermarkt_url is distinct from old.transfermarkt_url
       or new.wyscout_url is distinct from old.wyscout_url
       or new.stats_url is distinct from old.stats_url
       or new.instagram_url is distinct from old.instagram_url
       or new.profile_photo_path is distinct from old.profile_photo_path
       or new.onboarding_status is distinct from old.onboarding_status
       or new.created_at is distinct from old.created_at
       or new.agency_priority is distinct from old.agency_priority
       or new.next_action is distinct from old.next_action
       or new.next_action_due is distinct from old.next_action_due
       or new.current_season_label is distinct from old.current_season_label
       or new.current_season_start is distinct from old.current_season_start then
      raise exception 'Internal career review attempted an unexpected player-field change';
    end if;

    return new;
  end if;

  if internal_user_link then
    if new.id is distinct from old.id
       or new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
       or new.verification_notes is distinct from old.verification_notes
       or new.review_required_at is distinct from old.review_required_at
       or new.review_reason is distinct from old.review_reason
       or new.agency_priority is distinct from old.agency_priority
       or new.next_action is distinct from old.next_action
       or new.next_action_due is distinct from old.next_action_due
       or new.created_at is distinct from old.created_at
       or (old.user_id is not null and new.user_id is distinct from old.user_id)
       or (
         new.onboarding_status is distinct from old.onboarding_status
         and not (
           old.onboarding_status='not_started'
           and new.onboarding_status='in_progress'
         )
       ) then
      raise exception 'Internal player link attempted an unexpected protected-field change';
    end if;

    return new;
  end if;

  if not tenant_admin then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
       or new.verification_notes is distinct from old.verification_notes
       or new.review_required_at is distinct from old.review_required_at
       or new.review_reason is distinct from old.review_reason
       or new.agency_priority is distinct from old.agency_priority
       or new.next_action is distinct from old.next_action
       or new.next_action_due is distinct from old.next_action_due
       or new.created_at is distinct from old.created_at then
      raise exception 'Not permitted to change protected player fields';
    end if;
  end if;

  if old.verification_status='verified' and (
    new.first_name is distinct from old.first_name
    or new.last_name is distinct from old.last_name
    or new.preferred_name is distinct from old.preferred_name
    or new.date_of_birth is distinct from old.date_of_birth
    or new.nationalities is distinct from old.nationalities
    or new.height_cm is distinct from old.height_cm
    or new.preferred_foot is distinct from old.preferred_foot
    or new.primary_position is distinct from old.primary_position
    or new.secondary_positions is distinct from old.secondary_positions
    or new.current_club is distinct from old.current_club
    or new.current_league is distinct from old.current_league
    or new.current_country is distinct from old.current_country
    or new.contract_status is distinct from old.contract_status
    or new.contract_expiry is distinct from old.contract_expiry
    or new.football_status is distinct from old.football_status
    or new.transfermarkt_url is distinct from old.transfermarkt_url
    or new.wyscout_url is distinct from old.wyscout_url
    or new.stats_url is distinct from old.stats_url
    or new.profile_photo_path is distinct from old.profile_photo_path
  ) then
    new.verification_status:='reviewing';
    new.verified_at:=null;
    new.review_required_at:=pg_catalog.now();
    new.review_reason:=case
      when tenant_admin then 'Agency updated verified football information'
      else 'Player updated verified football information'
    end;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_player_admin_fields() from public;

create or replace function public.platform_server_confirm_player_profile_verification(
  p_tenant_id uuid,
  p_player_id uuid,
  p_actor_user_id uuid,
  p_verification_method text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before public.players%rowtype;
  v_after public.players%rowtype;
  v_method text:=case
    when p_verification_method in ('operator_confirmation','publish_confirmation') then p_verification_method
    else 'operator_confirmation'
  end;
begin
  if not exists (
    select 1
    from platform.tenant_memberships m
    join platform.tenants t
      on t.id=m.tenant_id
     and t.status='active'
    where m.tenant_id=p_tenant_id
      and m.user_id=p_actor_user_id
      and m.status='active'
      and m.role in ('owner','admin','agent','operations')
  ) then
    raise exception 'agency_operator_access_required';
  end if;

  select p.*
  into v_before
  from public.players p
  where p.id=p_player_id
    and p.tenant_id=p_tenant_id
  for update;

  if not found then
    raise exception 'player_not_found';
  end if;

  if nullif(trim(v_before.primary_position),'') is null then
    raise exception 'primary_position_required';
  end if;

  perform pg_catalog.set_config(
    'djm.internal_profile_verification',
    'on',
    true
  );

  update public.players p
  set verification_status='verified',
      verified_at=pg_catalog.now(),
      review_required_at=null,
      review_reason=null
  where p.id=p_player_id
    and p.tenant_id=p_tenant_id
  returning p.* into v_after;

  perform pg_catalog.set_config(
    'djm.internal_profile_verification',
    'off',
    true
  );

  insert into platform.audit_events(
    tenant_id,
    actor_user_id,
    actor_kind,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state,
    metadata
  ) values (
    p_tenant_id,
    p_actor_user_id,
    'user',
    'player_profile.player_data_verified',
    'player_profile',
    p_player_id::text,
    to_jsonb(v_before),
    to_jsonb(v_after),
    jsonb_build_object(
      'verification_method',v_method,
      'writer','platform_server_confirm_player_profile_verification'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'player',to_jsonb(v_after),
    'verified_at',v_after.verified_at
  );
end;
$function$;

revoke all on function public.platform_server_confirm_player_profile_verification(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.platform_server_confirm_player_profile_verification(uuid,uuid,uuid,text) to service_role;
