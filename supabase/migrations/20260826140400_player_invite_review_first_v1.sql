create or replace function public.validate_player_invite_v2(invite_token uuid)
returns table(
  email text,
  expires_at timestamptz,
  valid boolean,
  full_name text
)
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $function$
  select
    i.email,
    i.expires_at,
    (i.status = 'pending' and i.expires_at > now()) as valid,
    coalesce(
      nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name)), ''),
      nullif(pg_catalog.btrim(p.preferred_name), ''),
      'DJM Player'
    ) as full_name
  from public.player_invites i
  left join public.players p on p.id = i.player_id
  where i.token = invite_token
  limit 1;
$function$;
