create or replace function private.protect_player_admin_fields()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare material_change boolean;
begin
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

  material_change := (
      new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name or new.preferred_name is distinct from old.preferred_name or
      new.date_of_birth is distinct from old.date_of_birth or new.nationalities is distinct from old.nationalities or new.height_cm is distinct from old.height_cm or
      new.preferred_foot is distinct from old.preferred_foot or new.primary_position is distinct from old.primary_position or new.secondary_positions is distinct from old.secondary_positions or
      new.current_club is distinct from old.current_club or new.current_league is distinct from old.current_league or new.current_country is distinct from old.current_country or
      new.contract_status is distinct from old.contract_status or new.contract_expiry is distinct from old.contract_expiry or new.football_status is distinct from old.football_status or
      new.transfermarkt_url is distinct from old.transfermarkt_url or new.wyscout_url is distinct from old.wyscout_url or new.stats_url is distinct from old.stats_url or
      new.profile_photo_path is distinct from old.profile_photo_path
  );

  if old.verification_status='verified' and material_change then
    new.verification_status := 'reviewing';
    new.verified_at := null;
    new.review_required_at := now();
    new.review_reason := case when private.is_admin() then 'DJM updated verified football information' else 'Player updated verified football information' end;
    update public.player_public_profiles set published=false,updated_at=now() where player_id=old.id and published=true;
  end if;
  return new;
end;
$$;

create or replace function private.enforce_public_profile_publish_rules()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_status text; v_verified timestamptz;
begin
  if new.published then
    select verification_status,verified_at into v_status,v_verified from public.players where id=new.player_id;
    if v_status is distinct from 'verified' or v_verified is null then
      raise exception 'Verify player data before publishing a club profile';
    end if;
    if coalesce(new.hide_market_value,true)=false and nullif(trim(coalesce(new.market_value_display,'')),'') is not null and nullif(trim(coalesce(new.market_value_source_url,'')),'') is null then
      raise exception 'A visible market value requires a source URL';
    end if;
    new.verified_at := v_verified;
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_public_profile_publish_rules on public.player_public_profiles;
create trigger enforce_public_profile_publish_rules before insert or update on public.player_public_profiles for each row execute function private.enforce_public_profile_publish_rules();
