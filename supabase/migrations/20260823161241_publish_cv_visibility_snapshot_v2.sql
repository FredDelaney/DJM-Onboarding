alter table public.player_public_profiles add column if not exists hidden_sections text[] not null default '{}';
alter table public.player_public_profiles add column if not exists hide_market_value boolean not null default true;

drop policy if exists "public profiles update" on public.player_public_profiles;
create policy "admins update public profiles" on public.player_public_profiles for update to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists "public profiles delete" on public.player_public_profiles;
create policy "admins delete public profiles" on public.player_public_profiles for delete to authenticated using (private.is_admin());

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
       or new.hide_market_value is distinct from old.hide_market_value then
      raise exception 'Not permitted to change protected public-profile fields';
    end if;
  end if;
  return new;
end;
$$;
