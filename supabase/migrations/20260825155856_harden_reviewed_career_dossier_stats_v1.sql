create or replace function private.player_authoritative_key_stats(
  p_player_id uuid,
  p_manual jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_latest_season text;
  v_position text;
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
  select p.primary_position
  into v_position
  from public.players p
  where p.id = p_player_id;

  select ce.season_label
  into v_latest_season
  from public.career_entries ce
  where ce.player_id = p_player_id
    and ce.source_reviewed_at is not null
    and coalesce(ce.is_international, false) = false
  order by
    case
      when ce.season_label ~ '(19|20)[0-9]{2}' then
        substring(ce.season_label from '(19|20)[0-9]{2}')::integer
      when ce.season_label ~ '^[0-9]{2}/[0-9]{2}$' then
        case
          when split_part(ce.season_label, '/', 1)::integer < 50
            then 2000 + split_part(ce.season_label, '/', 1)::integer
          else 1900 + split_part(ce.season_label, '/', 1)::integer
        end
      when ce.start_date is not null then extract(year from ce.start_date)::integer
      else 0
    end desc,
    ce.sort_order asc,
    ce.created_at asc
  limit 1;

  if v_latest_season is null then
    return case
      when pg_catalog.jsonb_typeof(p_manual) = 'array' then p_manual
      else '[]'::jsonb
    end;
  end if;

  select
    sum(ce.appearances),
    sum(ce.starts),
    sum(ce.minutes),
    sum(ce.goals),
    sum(ce.assists)
  into
    v_apps,
    v_starts,
    v_minutes,
    v_goals,
    v_assists
  from public.career_entries ce
  where ce.player_id = p_player_id
    and ce.source_reviewed_at is not null
    and coalesce(ce.is_international, false) = false
    and ce.season_label is not distinct from v_latest_season;

  if v_goals is not null or v_assists is not null then
    v_ga := coalesce(v_goals, 0) + coalesce(v_assists, 0);
  end if;

  v_position := lower(coalesce(v_position, ''));

  if v_position like '%goalkeep%' or v_position = 'gk' then
    if v_starts is not null then v_result := v_result || jsonb_build_array(jsonb_build_object('label','Starts','value',v_starts::text)); end if;
    if v_apps is not null then v_result := v_result || jsonb_build_array(jsonb_build_object('label','Apps','value',v_apps::text)); end if;
    if v_minutes is not null then v_result := v_result || jsonb_build_array(jsonb_build_object('label','Minutes','value',to_char(v_minutes,'FM999,999,999,999'))); end if;
  elsif v_position like '%winger%'
     or v_position like '%forward%'
     or v_position like '%striker%'
     or v_position like '%attacking%'
     or v_position in ('rw','lw','cf','st') then
    if v_apps is not null then v_result := v_result || jsonb_build_array(jsonb_build_object('label','Apps','value',v_apps::text)); end if;
    if v_goals is not null then v_result := v_result || jsonb_build_array(jsonb_build_object('label','Goals','value',v_goals::text)); end if;
    if v_assists is not null then v_result := v_result || jsonb_build_array(jsonb_build_object('label','Assists','value',v_assists::text)); end if;
    if v_ga is not null then v_result := v_result || jsonb_build_array(jsonb_build_object('label','G + A','value',v_ga::text)); end if;
  elsif v_position like '%defender%'
     or v_position like '%centre-back%'
     or v_position like '%center-back%'
     or v_position like '%full-back%'
     or v_position in ('cb','lb','rb','lcb','rcb') then
    if v_starts is not null then v_result := v_result || jsonb_build_array(jsonb_build_object('label','Starts','value',v_starts::text)); end if;
    if v_minutes is not null then v_result := v_result || jsonb_build_array(jsonb_build_object('label','Minutes','value',to_char(v_minutes,'FM999,999,999,999'))); end if;
    if v_apps is not null then v_result := v_result || jsonb_build_array(jsonb_build_object('label','Apps','value',v_apps::text)); end if;
    if v_goals is not null then v_result := v_result || jsonb_build_array(jsonb_build_object('label','Goals','value',v_goals::text)); end if;
  else
    if v_apps is not null then v_result := v_result || jsonb_build_array(jsonb_build_object('label','Apps','value',v_apps::text)); end if;
    if v_starts is not null then v_result := v_result || jsonb_build_array(jsonb_build_object('label','Starts','value',v_starts::text)); end if;
    if v_minutes is not null then v_result := v_result || jsonb_build_array(jsonb_build_object('label','Minutes','value',to_char(v_minutes,'FM999,999,999,999'))); end if;
    if v_goals is not null then v_result := v_result || jsonb_build_array(jsonb_build_object('label','Goals','value',v_goals::text)); end if;
  end if;

  if pg_catalog.jsonb_typeof(p_manual) = 'array' then
    for v_item in select value from pg_catalog.jsonb_array_elements(p_manual)
    loop
      if pg_catalog.jsonb_typeof(v_item) <> 'object' then
        continue;
      end if;

      v_label := pg_catalog.btrim(coalesce(v_item->>'label', v_item->>'name', ''));
      v_value := pg_catalog.btrim(coalesce(v_item->>'value', v_item->>'stat', ''));
      v_norm := pg_catalog.regexp_replace(lower(v_label), '\s+', ' ', 'g');

      if v_label = '' or v_value = '' then
        continue;
      end if;

      if v_norm = any(array[
        'apps','app','appearances','appearance','starts','start',
        'minutes','minute','mins','min','goals','goal','assists','assist',
        'g+a','g + a','ga','goal contributions','goal contribution'
      ]) then
        continue;
      end if;

      v_result := v_result || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('label', v_label, 'value', v_value)
      );
    end loop;
  end if;

  return v_result;
end;
$function$;

create or replace function private.player_career_timeline(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'club_name', ce.club_name,
          'country', ce.country,
          'league', ce.league,
          'season_label', ce.season_label,
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
          'sort_order', ce.sort_order
        )
      )
      order by ce.sort_order asc, ce.start_date desc nulls last, ce.created_at asc
    ),
    '[]'::jsonb
  )
  from public.career_entries ce
  where ce.player_id = p_player_id
    and ce.source_reviewed_at is not null;
$function$;

create or replace function private.set_public_profile_career_timeline()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  new.career_timeline := private.player_career_timeline(new.player_id);
  new.key_stats := private.player_authoritative_key_stats(new.player_id, new.key_stats);

  select p.stats_url into new.stats_url
  from public.players p
  where p.id = new.player_id;

  return new;
end;
$function$;

create or replace function private.normalize_cv_key_stats()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  new.key_stats := private.player_authoritative_key_stats(new.player_id, new.key_stats);
  return new;
end;
$function$;

drop trigger if exists normalize_cv_key_stats on public.player_cv_settings;
create trigger normalize_cv_key_stats
before insert or update of key_stats on public.player_cv_settings
for each row execute function private.normalize_cv_key_stats();

revoke all on function private.player_authoritative_key_stats(uuid,jsonb) from public, anon, authenticated;
revoke all on function private.normalize_cv_key_stats() from public, anon, authenticated;

update public.player_cv_settings cvs
set key_stats = private.player_authoritative_key_stats(cvs.player_id, cvs.key_stats)
where exists (
  select 1 from public.career_entries ce
  where ce.player_id = cvs.player_id
    and ce.source_reviewed_at is not null
);

update public.player_public_profiles pp
set career_timeline = private.player_career_timeline(pp.player_id),
    key_stats = private.player_authoritative_key_stats(pp.player_id, pp.key_stats)
where exists (
  select 1 from public.career_entries ce
  where ce.player_id = pp.player_id
    and ce.source_reviewed_at is not null
);
