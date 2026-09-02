alter table public.career_entries
  add column if not exists stats_year smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='career_entries_stats_year_check'
      and conrelid='public.career_entries'::regclass
  ) then
    alter table public.career_entries
      add constraint career_entries_stats_year_check
      check (stats_year is null or stats_year between 1900 and 2100);
  end if;
end $$;

update public.career_entries
set stats_year=season_label::smallint
where stats_year is null
  and btrim(coalesce(season_label,'')) ~ '^(19|20)[0-9]{2}$';

create or replace function private.djm_normalize_season_label(p_label text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select regexp_replace(replace(lower(btrim(coalesce(p_label,''))),'/','-'),'[[:space:]]+','','g')
$$;

revoke all on function private.djm_normalize_season_label(text) from public,anon,authenticated;
grant execute on function private.djm_normalize_season_label(text) to service_role;

create or replace function private.player_career_timeline(p_player_id uuid)
returns jsonb
language sql
stable security definer
set search_path to ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'club_name', ce.club_name,
          'country', ce.country,
          'league', ce.league,
          'season_label', ce.season_label,
          'stats_year', ce.stats_year,
          'start_date', ce.start_date,
          'end_date', ce.end_date,
          'appearances', ce.appearances,
          'starts', ce.starts,
          'minutes', ce.minutes,
          'goals', ce.goals,
          'assists', ce.assists,
          'is_international', ce.is_international,
          'source_name', ce.source_name,
          'source_url', ce.source_url,
          'source_reviewed_at', ce.source_reviewed_at,
          'source_synced_at', ce.source_synced_at,
          'source_provider', ce.source_provider,
          'sort_order', ce.sort_order
        )
      )
      order by ce.sort_order asc, ce.start_date desc nulls last, ce.created_at asc
    ),
    '[]'::jsonb
  )
  from public.career_entries ce
  where ce.player_id = p_player_id
    and (
      ce.source_reviewed_at is not null
      or (
        ce.source_synced_at is not null
        and ce.source_url is not null
        and ce.source_provider is not null
      )
    );
$$;

create or replace function private.player_authoritative_key_stats(
  p_player_id uuid,
  p_manual jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
declare
  v_selected_season text;
  v_selected_norm text;
  v_selected_year smallint;
  v_apps bigint;
  v_starts bigint;
  v_minutes bigint;
  v_goals bigint;
  v_assists bigint;
  v_ga bigint;
  v_result jsonb := '[]'::jsonb;
  v_item jsonb;
  v_label text;
  v_value text;
  v_norm text;
begin
  select nullif(pg_catalog.btrim(p.current_season_label),'')
  into v_selected_season
  from public.players p
  where p.id=p_player_id;

  v_selected_norm := private.djm_normalize_season_label(v_selected_season);

  if v_selected_norm='' or not exists (
    select 1 from public.career_entries ce
    where ce.player_id=p_player_id
      and coalesce(ce.is_international,false)=false
      and (
        ce.source_reviewed_at is not null
        or (ce.source_synced_at is not null and ce.source_url is not null and ce.source_provider is not null)
      )
      and (
        private.djm_normalize_season_label(ce.season_label)=v_selected_norm
        or (v_selected_norm ~ '^(19|20)[0-9]{2}$' and ce.stats_year=v_selected_norm::smallint)
      )
  ) then
    select ce.season_label
    into v_selected_season
    from public.career_entries ce
    where ce.player_id=p_player_id
      and coalesce(ce.is_international,false)=false
      and (
        ce.source_reviewed_at is not null
        or (ce.source_synced_at is not null and ce.source_url is not null and ce.source_provider is not null)
      )
    order by
      case
        when pg_catalog.btrim(coalesce(ce.season_label,'')) ~ '^(19|20)[0-9]{2}$'
          then pg_catalog.btrim(ce.season_label)::integer
        when ce.season_label ~ '(19|20)[0-9]{2}'
          then substring(ce.season_label from '(19|20)[0-9]{2}')::integer
        when ce.start_date is not null then extract(year from ce.start_date)::integer
        else 0
      end desc,
      ce.sort_order asc,
      ce.created_at asc
    limit 1;
    v_selected_norm := private.djm_normalize_season_label(v_selected_season);
  end if;

  if coalesce(v_selected_norm,'')='' then
    return case when pg_catalog.jsonb_typeof(p_manual)='array' then p_manual else '[]'::jsonb end;
  end if;

  if v_selected_norm ~ '^(19|20)[0-9]{2}$' then
    v_selected_year := v_selected_norm::smallint;
  end if;

  select
    sum(ce.appearances),
    sum(ce.starts),
    sum(ce.minutes),
    sum(ce.goals),
    sum(ce.assists)
  into v_apps,v_starts,v_minutes,v_goals,v_assists
  from public.career_entries ce
  where ce.player_id=p_player_id
    and coalesce(ce.is_international,false)=false
    and (
      ce.source_reviewed_at is not null
      or (ce.source_synced_at is not null and ce.source_url is not null and ce.source_provider is not null)
    )
    and (
      private.djm_normalize_season_label(ce.season_label)=v_selected_norm
      or (v_selected_year is not null and ce.stats_year=v_selected_year)
    );

  if v_goals is not null or v_assists is not null then
    v_ga := coalesce(v_goals,0)+coalesce(v_assists,0);
  end if;

  if v_apps is not null then v_result:=v_result||jsonb_build_array(jsonb_build_object('label','Apps','value',v_apps::text)); end if;
  if v_starts is not null then v_result:=v_result||jsonb_build_array(jsonb_build_object('label','Starts','value',v_starts::text)); end if;
  if v_minutes is not null then v_result:=v_result||jsonb_build_array(jsonb_build_object('label','Minutes','value',to_char(v_minutes,'FM999,999,999,999'))); end if;
  if v_goals is not null then v_result:=v_result||jsonb_build_array(jsonb_build_object('label','Goals','value',v_goals::text)); end if;
  if v_assists is not null then v_result:=v_result||jsonb_build_array(jsonb_build_object('label','Assists','value',v_assists::text)); end if;
  if v_ga is not null then v_result:=v_result||jsonb_build_array(jsonb_build_object('label','G+A','value',v_ga::text)); end if;

  if pg_catalog.jsonb_typeof(p_manual)='array' then
    for v_item in select value from pg_catalog.jsonb_array_elements(p_manual)
    loop
      if pg_catalog.jsonb_typeof(v_item)<>'object' then continue; end if;
      v_label:=pg_catalog.btrim(coalesce(v_item->>'label',v_item->>'name',''));
      v_value:=pg_catalog.btrim(coalesce(v_item->>'value',v_item->>'stat',''));
      v_norm:=pg_catalog.regexp_replace(lower(v_label),'\s+',' ','g');
      if v_label='' or v_value='' then continue; end if;
      if v_norm=any(array[
        'apps','app','appearances','appearance','starts','start',
        'minutes','minute','mins','min','goals','goal','assists','assist',
        'g+a','g + a','ga','goal contributions','goal contribution'
      ]) then continue; end if;
      v_result:=v_result||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('label',v_label,'value',v_value)
      );
    end loop;
  end if;
  return v_result;
end;
$$;

create or replace function private.djm_refresh_public_profile_from_career()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_player_id uuid:=coalesce(new.player_id,old.player_id);
begin
  update public.player_public_profiles pp
  set updated_at=pg_catalog.now()
  where pp.player_id=v_player_id;
  return coalesce(new,old);
end;
$$;

revoke all on function private.djm_refresh_public_profile_from_career() from public,anon,authenticated;

drop trigger if exists trg_refresh_public_profile_from_career on public.career_entries;
create trigger trg_refresh_public_profile_from_career
after insert or delete or update of
  season_label,stats_year,appearances,starts,minutes,goals,assists,
  source_name,source_url,source_provider,source_reviewed_at,source_synced_at
on public.career_entries
for each row execute function private.djm_refresh_public_profile_from_career();
