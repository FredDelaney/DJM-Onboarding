create or replace function public.validate_player_invite(invite_token uuid)
returns table(email text, expires_at timestamptz, valid boolean)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select i.email, i.expires_at,
         (i.status='pending' and i.expires_at > now()) as valid
  from public.player_invites i
  where i.token = invite_token
  limit 1;
$$;
revoke all on function public.validate_player_invite(uuid) from public;
grant execute on function public.validate_player_invite(uuid) to anon, authenticated;
