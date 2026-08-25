create or replace function private.protect_player_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  internal_user_link boolean := coalesce(pg_catalog.current_setting('djm.internal_user_link', true), '') = 'on';
begin
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
           old.onboarding_status = 'not_started'
           and new.onboarding_status = 'in_progress'
         )
       ) then
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
