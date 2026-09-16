-- DJM Player staging private-function bootstrap — batch 06
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- and private function bootstrap batches 01-05.
--
-- Exact current-production definitions for private functions 37-53 of 70,
-- ordered by function name + identity arguments.
-- Production body MD5: 3cb4f336f09d1a304727f4d7f1ef921b
--
-- Body validation is disabled only during bootstrap because later batches
-- provide cross-function dependencies. No function is executed by this file.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.djm_v5_mark_score_stale_from_benchmark()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_competition_id uuid;
  v_league_name text;
begin
  v_competition_id := case when tg_op='DELETE' then old.competition_id else new.competition_id end;
  v_league_name := case when tg_op='DELETE' then old.league_name else new.league_name end;

  update djm_os.player_scorecards
  set
    stale_at=now(),
    stale_reason='djm_os.league_benchmarks_changed',
    evidence_freshness='stale',
    updated_at=now()
  where
    (v_competition_id is not null and basis->>'competition_id'=v_competition_id::text)
    or (
      nullif(trim(coalesce(v_league_name,'')),'') is not null
      and lower(coalesce(basis->>'competition_name',''))=lower(v_league_name)
    );

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.djm_v5_recency_weight(p_evidence_date date, p_as_of date)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_evidence_date is null or p_as_of is null then 0::numeric
    when p_evidence_date > p_as_of + 1 then 0::numeric
    when p_as_of - p_evidence_date > 730 then 0::numeric
    else least(
      1::numeric,
      greatest(
        0::numeric,
        exp(-ln(2::numeric) * greatest(0, p_as_of - p_evidence_date) / 365.0)
      )
    )
  end;
$function$;


CREATE OR REPLACE FUNCTION private.djm_v5_role_quality(p_effective_minutes numeric, p_effective_appearances numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when coalesce(p_effective_minutes,0) <= 0 then 0::numeric
    else least(
      1::numeric,
      greatest(
        0::numeric,
        sqrt(
          (1 - exp(-greatest(p_effective_minutes,0) / 900.0))
          * (1 - exp(-greatest(coalesce(p_effective_appearances,0),0) / 8.0))
        )
      )
    )
  end;
$function$;


CREATE OR REPLACE FUNCTION private.djm_v5_role_score(p_effective_minutes numeric, p_effective_appearances numeric, p_effective_starts numeric, p_starts_known boolean)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_minutes numeric;
  v_starter numeric;
begin
  if coalesce(p_effective_minutes,0) <= 0 then return null; end if;

  v_minutes := 100 * (
    1 - exp(-least(greatest(p_effective_minutes,0),4000) / 1500.0)
  );

  if p_starts_known and coalesce(p_effective_appearances,0) > 0 then
    v_starter := least(
      100::numeric,
      greatest(0::numeric, p_effective_starts / p_effective_appearances * 100)
    );
    return least(100::numeric, greatest(0::numeric, v_minutes * .82 + v_starter * .18));
  end if;

  return least(100::numeric, greatest(0::numeric, v_minutes));
end;
$function$;


CREATE OR REPLACE FUNCTION private.djm_v5_snapshot_quality(p_minutes numeric, p_source_confidence numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select least(
    1::numeric,
    greatest(
      0::numeric,
      (1 - exp(-least(greatest(coalesce(p_minutes,0),0),2700) / 900.0))
      * greatest(.35::numeric, least(1::numeric, coalesce(p_source_confidence,.60)))
    )
  );
$function$;


CREATE OR REPLACE FUNCTION private.enforce_public_profile_publish_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_status text; v_verified timestamptz;
begin
  if new.published then
    select verification_status,verified_at into v_status,v_verified from public.players where id=new.player_id;
    if v_status is distinct from 'verified' or v_verified is null then
      raise exception 'Verify player data before publishing a club profile';
    end if;
    if coalesce(new.hide_market_value,true)=false and nullif(trim(coalesce(new.market_value_display,'')),'') is not null and nullif(trim(coalesce(new.market_value_source_url,'')),'') is null then
      raise exception 'A visible market value requires a source URL';
    end if;
    new.verified_at := v_verified;
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  assigned_role text := 'player';
  new_player_id uuid;
  full_name text;
  invite_token uuid;
  invite_row public.player_invites%rowtype;
  privacy_notice_version text;
  privacy_acknowledged boolean := false;
begin
  select a.role into assigned_role
  from public.admin_allowlist a
  where lower(a.email) = lower(new.email)
  limit 1;
  assigned_role := coalesce(assigned_role,'player');
  full_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1));

  if assigned_role = 'player' then
    begin
      invite_token := nullif(new.raw_user_meta_data->>'invite_token','')::uuid;
    exception when others then
      invite_token := null;
    end;

    privacy_notice_version := nullif(btrim(coalesce(new.raw_user_meta_data->>'privacy_notice_version','')), '');
    privacy_acknowledged := lower(coalesce(new.raw_user_meta_data->>'privacy_acknowledged','false')) = 'true';

    if privacy_notice_version <> '2026-09-02' or not privacy_acknowledged then
      raise exception 'The current DJM Player Privacy Notice must be acknowledged before account creation';
    end if;

    if invite_token is not null then
      select * into invite_row
      from public.player_invites
      where token = invite_token
        and status = 'pending'
        and expires_at > now()
        and lower(email) = lower(new.email)
      for update;
    end if;

    if invite_row.id is null then
      raise exception 'A valid DJM player invitation is required to create this account';
    end if;
  end if;

  insert into public.profiles(id, email, display_name, role)
  values (new.id, new.email, full_name, assigned_role)
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        role = excluded.role;

  if assigned_role = 'player' then
    if invite_row.player_id is not null then
      new_player_id := invite_row.player_id;
      perform set_config('djm.internal_user_link', 'on', true);
      update public.players
      set user_id = new.id,
          onboarding_status = case when onboarding_status='not_started' then 'in_progress' else onboarding_status end
      where id = new_player_id;
      perform set_config('djm.internal_user_link', 'off', true);
    else
      insert into public.players(user_id, preferred_name, onboarding_status)
      values (new.id, nullif(full_name,''), 'in_progress')
      returning id into new_player_id;
    end if;

    insert into public.player_private(player_id, personal_email)
    values (new_player_id, new.email)
    on conflict (player_id) do update set personal_email = excluded.personal_email;

    insert into public.player_onboarding(player_id, current_step)
    values (new_player_id, 1)
    on conflict (player_id) do nothing;

    insert into public.player_cv_settings(player_id)
    values (new_player_id)
    on conflict (player_id) do nothing;

    insert into public.player_privacy_acceptances(player_id,user_id,notice_version,accepted_via)
    values (new_player_id,new.id,privacy_notice_version,'player_invite')
    on conflict (user_id,notice_version) do nothing;

    update public.player_invites
    set status='accepted', accepted_at=now()
    where id=invite_row.id;
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$function$;


CREATE OR REPLACE FUNCTION private.normalize_career_competition_label()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_code text := upper(pg_catalog.btrim(coalesce(new.league, '')));
begin
  new.league := case v_code
    when 'SE1' then 'Allsvenskan'
    when 'SE2' then 'Superettan'
    when 'SE3N' then 'Ettan Norra'
    when 'SE3S' then 'Ettan Södra'
    when 'SEC' then 'Svenska Cupen'
    when 'SLO1' then 'Niké Liga'
    when 'SK2' then 'Slovak 2. Liga'
    when '511' then 'Derde Divisie Sunday'
    else new.league
  end;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.normalize_cv_key_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.key_stats := private.player_authoritative_key_stats(new.player_id, new.key_stats);
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.player_authoritative_key_stats(p_player_id uuid, p_manual jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select 1
    from public.career_entries ce
    where ce.player_id=p_player_id
      and coalesce(ce.is_international,false)=false
      and (
        ce.source_reviewed_at is not null
        or (ce.source_synced_at is not null and ce.source_url is not null and ce.source_provider is not null)
      )
      and (
        private.djm_normalize_season_label(ce.season_label)=v_selected_norm
        or (
          v_selected_norm ~ '^(19|20)[0-9]{2}$'
          and ce.stats_year=v_selected_norm::smallint
        )
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
      if v_norm=any(array['apps','app','appearances','appearance','starts','start','minutes','minute','mins','min','goals','goal','assists','assist','g+a','g + a','ga','goal contributions','goal contribution']) then continue; end if;
      v_result:=v_result||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('label',v_label,'value',v_value));
    end loop;
  end if;
  return v_result;
end;
$function$;


CREATE OR REPLACE FUNCTION private.player_career_timeline(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION private.player_is_currently_verified(p_player_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.players p
    where p.id = p_player_id
      and p.verification_status = 'verified'
      and p.verified_at is not null
  );
$function$;


CREATE OR REPLACE FUNCTION private.prevent_sensitive_player_document_share()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if coalesce(new.club_shareable,false)
     and lower(coalesce(new.document_type,'')) in ('passport','visa','id','medical','contract','agreement') then
    new.club_shareable := false;
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.protect_admin_allowlist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  admin_count integer;
  actor_email text;
begin
  select email into actor_email from public.profiles where id=auth.uid();
  select count(*) into admin_count from public.admin_allowlist where role='admin';

  if tg_op='DELETE' then
    if lower(coalesce(actor_email,''))=lower(old.email) then
      raise exception 'You cannot remove your own DJM access';
    end if;
    if old.role='admin' and admin_count<=1 then
      raise exception 'DJM must always have at least one admin';
    end if;
    return old;
  end if;

  if tg_op='UPDATE' then
    if lower(coalesce(actor_email,''))=lower(old.email) and new.role is distinct from old.role then
      raise exception 'You cannot change your own DJM role';
    end if;
    if old.role='admin' and new.role<>'admin' and admin_count<=1 then
      raise exception 'DJM must always have at least one admin';
    end if;
    new.email:=lower(trim(new.email));
    return new;
  end if;

  if tg_op='INSERT' then
    new.email:=lower(trim(new.email));
    return new;
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.protect_career_entry_staff_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player_id uuid := coalesce(new.player_id, old.player_id);
begin
  if auth.uid() is not null
     and coalesce(auth.jwt()->>'role','') <> 'service_role'
     and not private.can_staff_edit_player(v_player_id) then
    raise exception 'Only DJM staff can change canonical career statistics';
  end if;
  return coalesce(new, old);
end;
$function$;


CREATE OR REPLACE FUNCTION private.protect_document_club_share_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.club_shareable, false)
       and not private.is_admin()
       and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
      raise exception 'Only DJM admins can approve documents for club sharing';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.club_shareable is distinct from old.club_shareable
       and not private.is_admin()
       and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
      raise exception 'Only DJM admins can change club sharing approval';
    end if;
  end if;

  return new;
end;
$function$;


commit;
