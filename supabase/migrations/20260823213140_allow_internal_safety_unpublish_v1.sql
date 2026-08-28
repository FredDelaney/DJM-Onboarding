create or replace function private.protect_public_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare safety_unpublish boolean;
begin
  if not private.is_admin() then
    safety_unpublish := (
      old.published=true and new.published=false
      and new.player_id is not distinct from old.player_id
      and new.public_slug is not distinct from old.public_slug
      and new.published_at is not distinct from old.published_at
      and new.contact_email is not distinct from old.contact_email
      and new.market_value_display is not distinct from old.market_value_display
      and new.market_value_source_url is not distinct from old.market_value_source_url
      and new.hidden_sections is not distinct from old.hidden_sections
      and new.hide_market_value is not distinct from old.hide_market_value
      and new.verified_at is not distinct from old.verified_at
    );
    if not safety_unpublish and (
       new.player_id is distinct from old.player_id
       or new.public_slug is distinct from old.public_slug
       or new.published is distinct from old.published
       or new.published_at is distinct from old.published_at
       or new.contact_email is distinct from old.contact_email
       or new.market_value_display is distinct from old.market_value_display
       or new.market_value_source_url is distinct from old.market_value_source_url
       or new.hidden_sections is distinct from old.hidden_sections
       or new.hide_market_value is distinct from old.hide_market_value
       or new.verified_at is distinct from old.verified_at
    ) then
      raise exception 'Not permitted to change protected public-profile fields';
    end if;
  end if;
  return new;
end;
$$;
