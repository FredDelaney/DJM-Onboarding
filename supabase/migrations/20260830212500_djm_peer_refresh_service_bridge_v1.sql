-- Service-only bridge for the peer refresh Edge Function.
-- Keeps the private djm_os schema out of the public Data API schema list.

create or replace function public.djm_peer_refresh_context(
  p_mode text,
  p_player_id uuid default null,
  p_competition_id uuid default null,
  p_provider_competition_id text default null,
  p_display_name text default null,
  p_country text default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_competition djm_os.competitions%rowtype;
  v_provider jsonb;
  v_canonical_key text;
  v_aliases text[];
begin
  if p_mode = 'player' then
    select jsonb_build_object(
      'provider_player_id', s.provider_player_id,
      'provider_competition_id', s.provider_competition_id,
      'provider_season_id', s.provider_season_id,
      'competition_name', s.competition_name,
      'metrics', s.metrics,
      'synced_at', s.synced_at
    )
    into v_provider
    from djm_os.player_provider_stat_snapshots s
    where s.player_id = p_player_id
      and s.provider = 'pitchapi'
    order by s.synced_at desc nulls last, s.updated_at desc
    limit 1;

    if v_provider is null then
      raise exception 'Update player data first so DJM can resolve a current PitchAPI competition and season.';
    end if;

    return v_provider;
  end if;

  if p_mode = 'competition' then
    select *
    into v_competition
    from djm_os.competitions c
    where c.id = p_competition_id
    limit 1;

    if not found then
      raise exception 'DJM competition not found.';
    end if;

    return jsonb_build_object(
      'competition_id', v_competition.id,
      'display_name', v_competition.display_name,
      'country', v_competition.country,
      'provider_competition_id', nullif(v_competition.provider_ids ->> 'pitchapi', '')
    );
  end if;

  if p_mode = 'provider' then
    if nullif(trim(coalesce(p_provider_competition_id, '')), '') is null then
      raise exception 'PitchAPI competition identity is required.';
    end if;

    v_canonical_key := 'pitchapi:' || p_provider_competition_id;

    select *
    into v_competition
    from djm_os.competitions c
    where c.canonical_key = v_canonical_key
       or c.provider_ids ->> 'pitchapi' = p_provider_competition_id
    order by (c.canonical_key = v_canonical_key) desc, c.updated_at desc
    limit 1;

    if found then
      v_aliases := array(
        select distinct alias
        from unnest(
          coalesce(v_competition.aliases, '{}'::text[])
          || array[nullif(trim(coalesce(p_display_name, '')), '')]
        ) alias
        where alias is not null
      );

      update djm_os.competitions
      set display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
          country = coalesce(nullif(trim(p_country), ''), country),
          aliases = v_aliases,
          provider_ids = provider_ids || jsonb_build_object('pitchapi', p_provider_competition_id),
          updated_by = p_user_id,
          updated_at = now()
      where id = v_competition.id
      returning * into v_competition;
    else
      insert into djm_os.competitions(
        canonical_key,
        display_name,
        country,
        aliases,
        provider_ids,
        created_by,
        updated_by
      )
      values (
        v_canonical_key,
        coalesce(nullif(trim(p_display_name), ''), 'PitchAPI ' || p_provider_competition_id),
        nullif(trim(p_country), ''),
        array_remove(array[nullif(trim(coalesce(p_display_name, '')), '')], null),
        jsonb_build_object('pitchapi', p_provider_competition_id),
        p_user_id,
        p_user_id
      )
      returning * into v_competition;
    end if;

    return jsonb_build_object(
      'competition_id', v_competition.id,
      'display_name', v_competition.display_name,
      'country', v_competition.country,
      'provider_competition_id', p_provider_competition_id
    );
  end if;

  raise exception 'Unsupported peer refresh context mode.';
end;
$function$;

revoke all on function public.djm_peer_refresh_context(text, uuid, uuid, text, text, text, uuid) from public;
revoke all on function public.djm_peer_refresh_context(text, uuid, uuid, text, text, text, uuid) from anon;
revoke all on function public.djm_peer_refresh_context(text, uuid, uuid, text, text, text, uuid) from authenticated;
grant execute on function public.djm_peer_refresh_context(text, uuid, uuid, text, text, text, uuid) to service_role;

create or replace function public.djm_replace_provider_peer_cache(
  p_provider_competition_id text,
  p_provider_season_id text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
begin
  if nullif(trim(coalesce(p_provider_competition_id, '')), '') is null
     or nullif(trim(coalesce(p_provider_season_id, '')), '') is null then
    raise exception 'Provider competition and season are required.';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 6 then
    raise exception 'At least six observed provider peers are required.';
  end if;

  delete from djm_os.provider_peer_stat_snapshots
  where provider = 'pitchapi'
    and provider_competition_id = p_provider_competition_id
    and provider_season_id = p_provider_season_id;

  insert into djm_os.provider_peer_stat_snapshots(
    provider,
    provider_competition_id,
    provider_season_id,
    provider_player_id,
    provider_team_id,
    player_name,
    team_name,
    provider_position,
    minutes,
    metrics,
    observed_at,
    synced_at
  )
  select
    'pitchapi',
    p_provider_competition_id,
    p_provider_season_id,
    r.provider_player_id,
    coalesce(r.provider_team_id, ''),
    r.player_name,
    r.team_name,
    r.provider_position,
    r.minutes,
    coalesce(r.metrics, '{}'::jsonb),
    coalesce(r.observed_at, now()),
    coalesce(r.synced_at, now())
  from jsonb_to_recordset(p_rows) as r(
    provider_player_id text,
    provider_team_id text,
    player_name text,
    team_name text,
    provider_position text,
    minutes integer,
    metrics jsonb,
    observed_at timestamptz,
    synced_at timestamptz
  )
  where nullif(trim(coalesce(r.provider_player_id, '')), '') is not null
  on conflict(provider, provider_competition_id, provider_season_id, provider_player_id, provider_team_id)
  do update set
    player_name = excluded.player_name,
    team_name = excluded.team_name,
    provider_position = excluded.provider_position,
    minutes = excluded.minutes,
    metrics = excluded.metrics,
    observed_at = excluded.observed_at,
    synced_at = excluded.synced_at,
    updated_at = now();

  get diagnostics v_count = row_count;

  if v_count < 6 then
    raise exception 'Fewer than six valid provider peers were supplied.';
  end if;

  return v_count;
end;
$function$;

revoke all on function public.djm_replace_provider_peer_cache(text, text, jsonb) from public;
revoke all on function public.djm_replace_provider_peer_cache(text, text, jsonb) from anon;
revoke all on function public.djm_replace_provider_peer_cache(text, text, jsonb) from authenticated;
grant execute on function public.djm_replace_provider_peer_cache(text, text, jsonb) to service_role;

comment on function public.djm_peer_refresh_context(text, uuid, uuid, text, text, text, uuid) is
  'Service-role-only bridge for peer refresh context while djm_os remains outside the public Data API schema list.';

comment on function public.djm_replace_provider_peer_cache(text, text, jsonb) is
  'Service-role-only atomic replacement of observed PitchAPI peer cache rows.';
