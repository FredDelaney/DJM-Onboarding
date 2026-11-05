begin;

-- A bounded display cache. Keep vendor schedules separate from verified player appearances.
create table djm_os.kickoff_club_fixture_cache (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  club_key text not null,
  country_key text not null,
  team_id text check (team_id ~ '^tm_[a-zA-Z0-9_-]+$'),
  checked_at timestamptz not null,
  fixtures jsonb not null default '[]',
  primary key (tenant_id, club_key, country_key),
  check (jsonb_typeof(fixtures) = 'array' and jsonb_array_length(fixtures) <= 240),
  check (team_id is not null or fixtures = '[]'::jsonb)
);
alter table djm_os.kickoff_club_fixture_cache enable row level security;
revoke all on djm_os.kickoff_club_fixture_cache from public, anon, authenticated;

create function public.platform_server_kickoff_targets(p_tenant_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with roster_clubs as (
    select t.id as tenant_id, lower(btrim(p.current_club)) as club_key,
      lower(btrim(p.current_country)) as country_key, min(btrim(p.current_country)) as country_name
    from platform.tenants t
    join public.players p on p.tenant_id = t.id
    where t.slug = p_tenant_slug and t.status = 'active'
      and p.archived_at is null and p.agency_status = 'signed'
      and coalesce(p.football_status, '') not in ('free_agent', 'retired', 'inactive')
      and nullif(btrim(p.current_club), '') is not null
      and nullif(btrim(p.current_country), '') is not null
    group by t.id, lower(btrim(p.current_club)), lower(btrim(p.current_country))
  )
  select coalesce(jsonb_agg(to_jsonb(target) order by target.checked_at nulls first, target.club_key, target.country_key), '[]')
  from (
    select c.*, cached.team_id, cached.checked_at
    from roster_clubs c
    left join djm_os.kickoff_club_fixture_cache cached using (tenant_id, club_key, country_key)
    where cached.checked_at is null
      or cached.checked_at < now() - case when cached.team_id is null then interval '2 days' else interval '7 hours' end
    order by cached.checked_at nulls first, c.club_key, c.country_key
    limit 24
  ) target;
$$;

create function public.platform_server_kickoff_save(
  p_tenant_id uuid, p_club_key text, p_country_key text, p_team_id text,
  p_checked_at timestamptz, p_fixtures jsonb
) returns void
language sql security definer set search_path = ''
as $$
  insert into djm_os.kickoff_club_fixture_cache as cache
    (tenant_id, club_key, country_key, team_id, checked_at, fixtures)
  select p_tenant_id, p_club_key, p_country_key, p_team_id, p_checked_at, p_fixtures
  where exists (
    select 1 from platform.tenants t
    join public.players p on p.tenant_id = t.id
    where t.id = p_tenant_id and t.status = 'active'
      and p.archived_at is null and p.agency_status = 'signed'
      and coalesce(p.football_status, '') not in ('free_agent', 'retired', 'inactive')
      and lower(btrim(p.current_club)) = p_club_key and lower(btrim(p.current_country)) = p_country_key
  )
  on conflict (tenant_id, club_key, country_key) do update
    set team_id = excluded.team_id, checked_at = excluded.checked_at, fixtures = excluded.fixtures
    where cache.checked_at < excluded.checked_at;
$$;

create function public.platform_server_kickoff_fixtures(
  p_tenant_id uuid, p_actor_user_id uuid, p_scope text,
  p_start date, p_end date, p_timezone text
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor_role text;
  range_start timestamptz;
  range_end timestamptz;
begin
  select m.role::text into actor_role
  from platform.tenant_memberships m
  join platform.tenants t on t.id = m.tenant_id and t.status = 'active'
  where m.tenant_id = p_tenant_id and m.user_id = p_actor_user_id and m.status = 'active';

  if actor_role is null or actor_role not in ('owner','admin','operations','agent','scout')
    or p_scope is null or p_scope not in ('me', 'agency')
    or (p_scope = 'agency' and actor_role not in ('owner','admin')) then
    raise exception 'fixture_access_denied' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end <= p_start or p_end - p_start > 124
    or p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'fixture_range_invalid' using errcode = '22023';
  end if;
  range_start := p_start::timestamp at time zone p_timezone;
  range_end := p_end::timestamp at time zone p_timezone;

  return (
    with roster as materialized (
      select p.id, coalesce(nullif(btrim(p.preferred_name), ''), nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Player') as player_name,
        c.team_id, c.checked_at, lower(btrim(p.current_club)) as club_key, lower(btrim(p.current_country)) as country_key
      from public.players p
      left join djm_os.kickoff_club_fixture_cache c on c.tenant_id = p.tenant_id
        and c.club_key = lower(btrim(p.current_club)) and c.country_key = lower(btrim(p.current_country))
      where p.tenant_id = p_tenant_id and p.archived_at is null and p.agency_status = 'signed'
        and coalesce(p.football_status, '') not in ('free_agent', 'retired', 'inactive')
        and (p_scope = 'agency' or p.primary_staff_user_id = p_actor_user_id or exists (
          select 1 from public.staff_player_access a where a.player_id = p.id and a.staff_user_id = p_actor_user_id
        ))
    ), fixture_rows as materialized (
      select c.checked_at, f.*
      from (select distinct club_key, country_key from roster
        where team_id is not null and checked_at >= now() - interval '36 hours') clubs
      join djm_os.kickoff_club_fixture_cache c using (club_key, country_key)
      cross join lateral jsonb_to_recordset(c.fixtures) f(
        fixture_id text, kickoff_at timestamptz, status text, home_team_id text, away_team_id text,
        home_team_name text, away_team_name text, home_logo text, away_logo text, attribution jsonb
      )
      where c.tenant_id = p_tenant_id
    ), fixtures as (
      select distinct on (fixture_id) *
      from fixture_rows
      order by fixture_id, checked_at desc, home_team_id, away_team_id
    ), visible as (
      select f.fixture_id, f.kickoff_at, f.status, f.home_team_name, f.away_team_name,
        f.home_logo, f.away_logo, f.attribution, related.players
      from fixtures f
      cross join lateral (
        select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.player_name) order by r.player_name, r.id) as players
        from roster r
        where r.team_id in (f.home_team_id, f.away_team_id) and r.checked_at >= now() - interval '36 hours'
      ) related
      where f.kickoff_at >= range_start and f.kickoff_at < range_end and related.players is not null
        and f.status in ('NS','1H','HT','2H','ET','BT','P','FT','AET','PEN','LIVE','SUSP','INT')
      order by f.kickoff_at, f.fixture_id
      limit 501
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(to_jsonb(f) order by f.kickoff_at, f.fixture_id)
        from (select * from visible limit 500) f), '[]'),
      'limited', (select count(*) > 500 from visible),
      'coverage', (select case when count(checked_at) > 0 then jsonb_build_object(
        'eligible', count(*),
        'matched', count(team_id),
        'fresh', count(*) filter (
          where team_id is not null and checked_at >= now() - interval '36 hours'
            and range_start >= date_trunc('day', checked_at, 'UTC') - interval '6 days'
            and range_end <= date_trunc('day', checked_at, 'UTC') + interval '60 days'
        ),
        'checked_at', max(checked_at)
      ) end from roster)
    )
  );
end;
$$;

create function public.redream_calendar_club_fixtures(p_start date, p_end date, p_timezone text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select public.platform_server_kickoff_fixtures(
    m.tenant_id, m.user_id, case when m.role in ('owner','admin') then 'agency' else 'me' end,
    p_start, p_end, p_timezone
  )
  from platform.tenant_memberships m
  join platform.tenants t on t.id = m.tenant_id and t.status = 'active'
  where m.tenant_id = private.redream_request_tenant() and m.user_id = auth.uid()
    and m.status = 'active' and m.role in ('owner','admin','operations','agent','scout');
$$;

revoke all on function public.platform_server_kickoff_targets(text) from public, anon, authenticated;
revoke all on function public.platform_server_kickoff_save(uuid,text,text,text,timestamptz,jsonb) from public, anon, authenticated;
revoke all on function public.platform_server_kickoff_fixtures(uuid,uuid,text,date,date,text) from public, anon, authenticated;
revoke all on function public.redream_calendar_club_fixtures(date,date,text) from public, anon, authenticated;
grant execute on function public.platform_server_kickoff_targets(text) to service_role;
grant execute on function public.platform_server_kickoff_save(uuid,text,text,text,timestamptz,jsonb) to service_role;
grant execute on function public.platform_server_kickoff_fixtures(uuid,uuid,text,date,date,text) to service_role;
grant execute on function public.redream_calendar_club_fixtures(date,date,text) to authenticated;

-- Isolate this scheduler credential from other workers and keep it out of migration history.
select vault.create_secret(
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  'redream_kickoff_cron_secret', 'Scheduler credential for the KickoffAPI worker'
)
where not exists (select 1 from vault.secrets where name = 'redream_kickoff_cron_secret');

create function public.platform_server_kickoff_cron_secret()
returns text
language sql stable security definer set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'redream_kickoff_cron_secret';
$$;
revoke all on function public.platform_server_kickoff_cron_secret() from public, anon, authenticated;
grant execute on function public.platform_server_kickoff_cron_secret() to service_role;

-- The job makes no network request until this environment has an explicit Vault URL.
select cron.schedule('redream-kickoffapi-club-fixtures', '17 0,8,16 * * *', $job$
  delete from djm_os.kickoff_club_fixture_cache where checked_at < now() - interval '7 days';
  select net.http_post(
    url := rtrim(project.decrypted_secret, '/') || '/functions/v1/refresh-kickoff-fixtures',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-redream-kickoff-cron', scheduler.decrypted_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  from vault.decrypted_secrets project
  cross join vault.decrypted_secrets scheduler
  where project.name = 'redream_kickoff_project_url'
    and project.decrypted_secret ~ '^https://[a-z0-9]+\.supabase\.co/?$'
    and scheduler.name = 'redream_kickoff_cron_secret'
  limit 1;
$job$);

notify pgrst, 'reload schema';
commit;
