create or replace function private.protect_player_admin_fields()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  internal_player_service boolean := coalesce(pg_catalog.current_setting('djm.internal_player_service', true), '') = 'on';
  internal_user_link boolean := coalesce(pg_catalog.current_setting('djm.internal_user_link', true), '') = 'on';
  internal_career_change boolean := coalesce(pg_catalog.current_setting('djm.internal_career_change', true), '') = 'on';
  internal_demo_verification boolean := coalesce(pg_catalog.current_setting('djm.internal_demo_verification', true), '') = 'on';
begin
  if internal_demo_verification then
    if not exists(
      select 1 from platform.tenants t
      where t.id=old.tenant_id
        and coalesce((t.metadata->>'synthetic_test_tenant')::boolean,false)=true
    ) then
      raise exception 'Synthetic demo verification maintenance is restricted to synthetic tenants';
    end if;
    if (to_jsonb(new) - array['verified_at','updated_at']::text[])
       is distinct from
       (to_jsonb(old) - array['verified_at','updated_at']::text[]) then
      raise exception 'Synthetic demo verification maintenance attempted an unexpected player-field change';
    end if;
    if old.verification_status <> 'verified' or new.verification_status <> 'verified' or new.verified_at is null then
      raise exception 'Synthetic demo verification maintenance may only complete a missing verified_at timestamp';
    end if;
    return new;
  end if;

  if internal_player_service then
    if (to_jsonb(new) - array['next_action','next_action_due','updated_at']::text[])
       is distinct from
       (to_jsonb(old) - array['next_action','next_action_due','updated_at']::text[]) then
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
       or (new.onboarding_status is distinct from old.onboarding_status and not (old.onboarding_status = 'not_started' and new.onboarding_status = 'in_progress')) then
      raise exception 'Internal player link attempted an unexpected protected-field change';
    end if;
    return new;
  end if;

  if not private.is_admin() then
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

  if old.verification_status = 'verified' and (
      new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name or new.preferred_name is distinct from old.preferred_name or
      new.date_of_birth is distinct from old.date_of_birth or new.nationalities is distinct from old.nationalities or new.height_cm is distinct from old.height_cm or
      new.preferred_foot is distinct from old.preferred_foot or new.primary_position is distinct from old.primary_position or new.secondary_positions is distinct from old.secondary_positions or
      new.current_club is distinct from old.current_club or new.current_league is distinct from old.current_league or new.current_country is distinct from old.current_country or
      new.contract_status is distinct from old.contract_status or new.contract_expiry is distinct from old.contract_expiry or new.football_status is distinct from old.football_status or
      new.transfermarkt_url is distinct from old.transfermarkt_url or new.wyscout_url is distinct from old.wyscout_url or new.stats_url is distinct from old.stats_url or
      new.profile_photo_path is distinct from old.profile_photo_path
    ) then
      new.verification_status := 'reviewing';
      new.verified_at := null;
      new.review_required_at := pg_catalog.now();
      new.review_reason := case
        when private.is_admin() then 'DJM updated verified football information'
        else 'Player updated verified football information'
      end;
  end if;

  return new;
end;
$function$;

create or replace function public.platform_server_seed_demo_verification_consistency(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_updated int:=0; begin
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id and coalesce((t.metadata->>'synthetic_test_tenant')::boolean,false)=true) then
    raise exception 'synthetic_demo_tenant_required';
  end if;
  perform pg_catalog.set_config('djm.internal_demo_verification','on',true);
  update public.players p
  set verified_at=coalesce(p.verified_at,p.created_at,now())
  where p.tenant_id=p_tenant_id and p.verification_status='verified' and p.verified_at is null;
  get diagnostics v_updated=row_count;
  perform pg_catalog.set_config('djm.internal_demo_verification','off',true);
  return jsonb_build_object('updated_players',v_updated,'truth_contract',jsonb_build_object('scope','Synthetic demo data only. This does not verify any real player.','mechanism','Only fills a missing verified_at timestamp for rows already marked verified.'));
end;
$function$;

revoke all on function public.platform_server_seed_demo_verification_consistency(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_seed_demo_verification_consistency(uuid) to service_role;;
