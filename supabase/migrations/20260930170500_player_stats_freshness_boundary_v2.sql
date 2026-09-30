-- Centralise player-stat freshness reads behind a service-only boundary.
-- Only successful applied refreshes count as freshness evidence.

create or replace function public.platform_server_player_stats_freshness_rows(
  p_player_ids uuid[]
)
returns table(player_id uuid, checked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  with requested as (
    select distinct value as player_id
    from unnest(coalesce(p_player_ids, '{}'::uuid[])) as ids(value)
  ),
  career as (
    select
      c.player_id,
      max(greatest(
        coalesce(c.source_synced_at, '-infinity'::timestamptz),
        coalesce(c.source_reviewed_at, '-infinity'::timestamptz)
      )) as checked_at
    from public.career_entries c
    join requested r on r.player_id = c.player_id
    group by c.player_id
  ),
  refreshes as (
    select
      s.player_id,
      max(coalesce(s.fresh_at, s.completed_at, s.requested_at)) as checked_at
    from public.player_source_refreshes s
    join requested r on r.player_id = s.player_id
    where s.status = 'applied'
      and coalesce(s.fresh_at, s.completed_at, s.requested_at) is not null
    group by s.player_id
  )
  select
    r.player_id,
    nullif(
      greatest(
        coalesce(c.checked_at, '-infinity'::timestamptz),
        coalesce(f.checked_at, '-infinity'::timestamptz)
      ),
      '-infinity'::timestamptz
    ) as checked_at
  from requested r
  left join career c on c.player_id = r.player_id
  left join refreshes f on f.player_id = r.player_id
  order by r.player_id;
$function$;

revoke all on function public.platform_server_player_stats_freshness_rows(uuid[])
from public, anon, authenticated;

grant execute on function public.platform_server_player_stats_freshness_rows(uuid[])
to service_role;
