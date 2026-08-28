alter table public.player_private drop column if exists private_agent_context;

create or replace function private.protect_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not private.is_admin() then
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.role is distinct from old.role
       or new.created_at is distinct from old.created_at then
      raise exception 'Not permitted to change protected profile fields';
    end if;
  end if;
  return new;
end;
$$;

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
       or new.contact_email is distinct from old.contact_email then
      raise exception 'Not permitted to change protected public-profile fields';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.stamp_admin_note_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.author_id is null or not private.is_admin() then
    new.author_id := auth.uid();
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
begin
  if exists (select 1 from public.admin_allowlist where lower(email) = lower(new.email)) then
    assigned_role := 'admin';
  end if;

  full_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1));

  insert into public.profiles(id, email, display_name, role)
  values (new.id, new.email, full_name, assigned_role)
  on conflict (id) do nothing;

  if assigned_role = 'player' then
    insert into public.players(user_id, preferred_name, onboarding_status)
    values (new.id, nullif(full_name,''), 'in_progress')
    returning id into new_player_id;

    insert into public.player_private(player_id, personal_email)
    values (new_player_id, new.email);

    insert into public.player_onboarding(player_id, current_step)
    values (new_player_id, 1);

    insert into public.player_cv_settings(player_id)
    values (new_player_id);
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_admin_fields on public.profiles;
create trigger protect_profile_admin_fields before update on public.profiles for each row execute procedure private.protect_profile_admin_fields();

drop trigger if exists protect_player_admin_fields on public.players;
create trigger protect_player_admin_fields before update on public.players for each row execute procedure private.protect_player_admin_fields();

drop trigger if exists protect_public_profile_admin_fields on public.player_public_profiles;
create trigger protect_public_profile_admin_fields before update on public.player_public_profiles for each row execute procedure private.protect_public_profile_admin_fields();

drop trigger if exists stamp_admin_note_author on public.admin_notes;
create trigger stamp_admin_note_author before insert on public.admin_notes for each row execute procedure private.stamp_admin_note_author();
