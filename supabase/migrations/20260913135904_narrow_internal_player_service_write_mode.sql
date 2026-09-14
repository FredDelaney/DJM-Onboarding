create or replace function private.protect_player_admin_fields()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  internal_player_service boolean := coalesce(pg_catalog.current_setting('djm.internal_player_service', true), '') = 'on';
  internal_user_link boolean := coalesce(pg_catalog.current_setting('djm.internal_user_link', true), '') = 'on';
  internal_career_change boolean := coalesce(pg_catalog.current_setting('djm.internal_career_change', true), '') = 'on';
begin
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
$$;

create or replace function platform.write_player_next_action(
  p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid,p_next_action text,p_next_action_due date
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_before jsonb;
  v_after jsonb;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  if nullif(trim(p_next_action),'') is null or p_next_action_due is null or p_next_action_due<current_date then raise exception 'valid_player_next_action_required'; end if;
  select to_jsonb(p) into v_before from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id for update;
  if v_before is null then raise exception 'player_not_found_for_tenant'; end if;
  perform pg_catalog.set_config('djm.internal_player_service','on',true);
  update public.players set next_action=trim(p_next_action),next_action_due=p_next_action_due,updated_at=now() where id=p_player_id and tenant_id=p_tenant_id;
  perform pg_catalog.set_config('djm.internal_player_service','off',true);
  select to_jsonb(p) into v_after from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id;
  if v_after->>'next_action' is distinct from trim(p_next_action) or (v_after->>'next_action_due')::date is distinct from p_next_action_due then raise exception 'player_next_action_write_verification_failed'; end if;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','player_service.next_action_updated','player',p_player_id::text,v_before,v_after,jsonb_build_object('source','agency_os','protected_write_mode','djm.internal_player_service'));
  return jsonb_build_object('player_id',p_player_id,'verified',true,'before',jsonb_build_object('next_action',v_before->'next_action','next_action_due',v_before->'next_action_due'),'after',jsonb_build_object('next_action',v_after->'next_action','next_action_due',v_after->'next_action_due'));
end;
$$;

revoke all on function platform.write_player_next_action(uuid,uuid,uuid,text,date) from public,anon,authenticated;
grant execute on function platform.write_player_next_action(uuid,uuid,uuid,text,date) to service_role;;
