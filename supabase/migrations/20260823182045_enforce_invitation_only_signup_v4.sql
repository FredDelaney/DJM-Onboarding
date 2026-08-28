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
  assigned_role := coalesce(assigned_role,'player');
  full_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1));

  if assigned_role = 'player' then
    begin
      invite_token := nullif(new.raw_user_meta_data->>'invite_token','')::uuid;
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
      update public.players
      set user_id = new.id,
          onboarding_status = case when onboarding_status='not_started' then 'in_progress' else onboarding_status end
      where id = new_player_id;
    else
      insert into public.players(user_id, preferred_name, onboarding_status)
      values (new.id, nullif(full_name,''), 'in_progress')
      returning id into new_player_id;
    end if;

    insert into public.player_private(player_id, personal_email)
    values (new_player_id, new.email)
    on conflict (player_id) do update set personal_email = excluded.personal_email;

    insert into public.player_onboarding(player_id, current_step)
    values (new_player_id, 1)
    on conflict (player_id) do nothing;

    insert into public.player_cv_settings(player_id)
    values (new_player_id)
    on conflict (player_id) do nothing;

    update public.player_invites
    set status='accepted', accepted_at=now()
    where id=invite_row.id;
  end if;

  return new;
end;
$$;
