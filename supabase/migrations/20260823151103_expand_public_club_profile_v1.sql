alter table public.player_public_profiles
  add column if not exists career_timeline jsonb not null default '[]'::jsonb,
  add column if not exists selected_videos jsonb not null default '[]'::jsonb,
  add column if not exists notable_experience jsonb not null default '[]'::jsonb,
  add column if not exists market_value_display text,
  add column if not exists market_value_source_url text;

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
       or new.market_value_source_url is distinct from old.market_value_source_url then
      raise exception 'Not permitted to change protected public-profile fields';
    end if;
  end if;
  return new;
end;
$$;
