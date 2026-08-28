-- Keep public staff authorisation and DJM OS team membership aligned.
create or replace function private.sync_djm_team_membership()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.role in ('admin', 'scout') then
    insert into djm_os.team_members (
      user_id,
      display_name,
      role_title,
      is_active,
      updated_at
    ) values (
      new.id,
      coalesce(nullif(trim(new.display_name), ''), nullif(split_part(new.email, '@', 1), ''), 'DJM Team'),
      case when new.role = 'admin' then 'Administrator' else 'Scout' end,
      true,
      now()
    )
    on conflict (user_id) do update set
      display_name = excluded.display_name,
      role_title = excluded.role_title,
      is_active = true,
      updated_at = now();
  else
    update djm_os.team_members
      set is_active = false, updated_at = now()
    where user_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_djm_team_membership() from public, anon, authenticated;

drop trigger if exists sync_djm_team_membership_after_profile_change on public.profiles;
create trigger sync_djm_team_membership_after_profile_change
  after insert or update of role, display_name, email on public.profiles
  for each row execute function private.sync_djm_team_membership();

insert into djm_os.team_members (user_id, display_name, role_title, is_active, updated_at)
select
  profile.id,
  coalesce(nullif(trim(profile.display_name), ''), nullif(split_part(profile.email, '@', 1), ''), 'DJM Team'),
  case when profile.role = 'admin' then 'Administrator' else 'Scout' end,
  true,
  now()
from public.profiles profile
where profile.role in ('admin', 'scout')
on conflict (user_id) do update set
  display_name = excluded.display_name,
  role_title = excluded.role_title,
  is_active = true,
  updated_at = now();
