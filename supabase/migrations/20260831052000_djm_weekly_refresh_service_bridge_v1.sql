-- Service-only bridge for the scheduled free player-data refresh.
-- Keeps djm_os outside the public Data API schema list.

create or replace function public.djm_weekly_refresh_snapshot_status()
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'player_id', latest.player_id,
        'synced_at', latest.synced_at
      )
      order by latest.synced_at desc
    ),
    '[]'::jsonb
  )
  from (
    select distinct on (snapshot.player_id)
      snapshot.player_id,
      snapshot.synced_at
    from djm_os.player_provider_stat_snapshots snapshot
    where snapshot.provider = 'thesportsdb'
    order by snapshot.player_id, snapshot.synced_at desc
  ) latest;
$function$;

revoke all on function public.djm_weekly_refresh_snapshot_status() from public;
revoke all on function public.djm_weekly_refresh_snapshot_status() from anon;
revoke all on function public.djm_weekly_refresh_snapshot_status() from authenticated;
grant execute on function public.djm_weekly_refresh_snapshot_status() to service_role;

create or replace function public.djm_upsert_weekly_provider_snapshot(
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_player_id uuid;
  v_provider_player_id text;
  v_provider_season_id text;
begin
  v_player_id := nullif(trim(p_snapshot ->> 'player_id'), '')::uuid;
  v_provider_player_id := nullif(trim(p_snapshot ->> 'provider_player_id'), '');
  v_provider_season_id := nullif(trim(p_snapshot ->> 'provider_season_id'), '');

  if v_player_id is null
     or v_provider_player_id is null
     or v_provider_season_id is null then
    raise exception 'Player, provider player and provider season are required.';
  end if;

  insert into djm_os.player_provider_stat_snapshots(
    player_id,
    provider,
    provider_player_id,
    provider_team_id,
    provider_competition_id,
    provider_season_id,
    season_label,
    club_name,
    competition_name,
    metrics,
    observed_at,
    synced_at
  )
  values (
    v_player_id,
    'thesportsdb',
    v_provider_player_id,
    coalesce(p_snapshot ->> 'provider_team_id', ''),
    coalesce(p_snapshot ->> 'provider_competition_id', ''),
    v_provider_season_id,
    nullif(trim(p_snapshot ->> 'season_label'), ''),
    nullif(trim(p_snapshot ->> 'club_name'), ''),
    nullif(trim(p_snapshot ->> 'competition_name'), ''),
    coalesce(p_snapshot -> 'metrics', '{}'::jsonb),
    coalesce(nullif(p_snapshot ->> 'observed_at', '')::timestamptz, now()),
    coalesce(nullif(p_snapshot ->> 'synced_at', '')::timestamptz, now())
  )
  on conflict(
    player_id,
    provider,
    provider_season_id,
    provider_competition_id,
    provider_team_id
  )
  do update set
    provider_player_id = excluded.provider_player_id,
    season_label = excluded.season_label,
    club_name = excluded.club_name,
    competition_name = excluded.competition_name,
    metrics = excluded.metrics,
    observed_at = excluded.observed_at,
    synced_at = excluded.synced_at,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.djm_upsert_weekly_provider_snapshot(jsonb) from public;
revoke all on function public.djm_upsert_weekly_provider_snapshot(jsonb) from anon;
revoke all on function public.djm_upsert_weekly_provider_snapshot(jsonb) from authenticated;
grant execute on function public.djm_upsert_weekly_provider_snapshot(jsonb) to service_role;

comment on function public.djm_weekly_refresh_snapshot_status() is
  'Service-role-only freshness context for the scheduled free player-data refresh.';

comment on function public.djm_upsert_weekly_provider_snapshot(jsonb) is
  'Service-role-only upsert of a validated TheSportsDB player snapshot.';

notify pgrst, 'reload schema';
