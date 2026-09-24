create or replace function private.platform_server_ensure_team_member(
  p_user_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'actor_user_id_required';
  end if;

  if not exists (
    select 1
    from djm_os.team_members tm
    where tm.user_id = p_user_id
      and tm.is_active = true
  ) then
    raise exception 'agency_team_member_not_initialized';
  end if;
end;
$$;

revoke all on function private.platform_server_ensure_team_member(uuid) from public;
