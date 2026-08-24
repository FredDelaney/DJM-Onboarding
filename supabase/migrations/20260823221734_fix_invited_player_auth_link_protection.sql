create or replace function private.protect_player_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  internal_user_link boolean := coalesce(current_setting('djm.internal_user_link', true), '') = 'on';
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
      new.review_required_at := now();
      new.review_reason := 'Player updated verified football information';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  assigned_role text := 'player';
  new_player_id uuid;
  full_name text;
  invite_token uuid;
  invite_row public.player_invites%rowtype;
begin
  select a.role into assigned_role
  from public.admin_allowlist a
  where lower(a.email) = lower(new.email)
  limit 1;

  assigned_role := coalesce(assigned_role, 'player');

  full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(coalesce(new.email, ''), '@', 1)
  );

  if assigned_role = 'player' then
    begin
      invite_token := nullif(new.raw_user_meta_data->>'invite_token', '')::uuid;
    exception when others then
      invite_token := null;
    end;

    if invite_token is not null then
      select * into invite_row
      from public.player_invites
      where token = invite_token
        and status = 'pending'
        and expires_at > now()
        and lower(email) = lower(new.email)
      for update;
    end if;

    if invite_row.id is null then
      raise exception 'A valid DJM player invitation is required to create this account';
    end if;
  end if;

  insert into public.profiles(id, email, display_name, role)
  values (new.id, new.email, full_name, assigned_role)
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        role = excluded.role;

  if assigned_role = 'player' then
    if invite_row.player_id is not null then
      new_player_id := invite_row.player_id;

      perform set_config('djm.internal_user_link', 'on', true);

      update public.players
      set user_id = new.id,
          onboarding_status = case
            when onboarding_status = 'not_started' then 'in_progress'
            else onboarding_status
          end
      where id = new_player_id;

      perform set_config('djm.internal_user_link', 'off', true);
    else
      insert into public.players(user_id, preferred_name, onboarding_status)
      values (new.id, nullif(full_name, ''), 'in_progress')
      returning id into new_player_id;
    end if;

    insert into public.player_private(player_id, personal_email)
    values (new_player_id, new.email)
    on conflict (player_id) do update
      set personal_email = excluded.personal_email;

    insert into public.player_onboarding(player_id, current_step)
    values (new_player_id, 1)
    on conflict (player_id) do nothing;

    insert into public.player_cv_settings(player_id)
    values (new_player_id)
    on conflict (player_id) do nothing;

    update public.player_invites
    set status = 'accepted',
        accepted_at = now()
    where id = invite_row.id;
  end if;

  return new;
end;
$$;
