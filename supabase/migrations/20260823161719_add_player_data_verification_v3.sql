alter table public.players add column if not exists verified_at timestamptz;
alter table public.players add column if not exists verification_notes text;
alter table public.player_public_profiles add column if not exists verified_at timestamptz;

create or replace function private.protect_player_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not private.is_admin() then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
       or new.verification_notes is distinct from old.verification_notes
       or new.agency_priority is distinct from old.agency_priority
       or new.next_action is distinct from old.next_action
       or new.next_action_due is distinct from old.next_action_due
       or new.created_at is distinct from old.created_at then
      raise exception 'Not permitted to change protected player fields';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.protect_public_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not private.is_admin() then
    if new.player_id is distinct from old.player_id
       or new.public_slug is distinct from old.public_slug
       or new.published is distinct from old.published
       or new.published_at is distinct from old.published_at
       or new.contact_email is distinct from old.contact_email
       or new.market_value_display is distinct from old.market_value_display
       or new.market_value_source_url is distinct from old.market_value_source_url
       or new.hidden_sections is distinct from old.hidden_sections
       or new.hide_market_value is distinct from old.hide_market_value
       or new.verified_at is distinct from old.verified_at then
      raise exception 'Not permitted to change protected public-profile fields';
    end if;
  end if;
  return new;
end;
$$;
