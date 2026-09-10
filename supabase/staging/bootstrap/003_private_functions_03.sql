-- DJM Player staging private-function bootstrap — batch 03
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- 003_private_functions_01.sql and 003_private_functions_02.sql.
--
-- Exact current-production definitions for private functions 9-12 of 70,
-- ordered by function name + identity arguments.
-- Production body MD5: 6c3caf207b2d2bcb944306a633212724
--
-- Body validation is disabled only during bootstrap because later batches
-- provide cross-function dependencies. No function is executed by this file.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.djm_autoresolve_player_benchmark(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public.players%rowtype;
  m private.djm_competition_tier_aliases%rowtype;
  a djm_os.country_league_strength_anchors%rowtype;
  c djm_os.competitions%rowtype;
  v_penalty integer;
  v_strength integer;
  v_key text;
  v_benchmark_key text;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  select * into p from public.players where id=p_player_id;
  if not found then return jsonb_build_object('resolved',false,'reason','player_not_found'); end if;
  if p.current_league is null or p.current_country is null then return jsonb_build_object('resolved',false,'reason','league_or_country_missing'); end if;

  select * into m from private.djm_competition_tier_aliases
  where country_key=lower(trim(p.current_country)) and league_key=lower(trim(p.current_league))
  limit 1;
  if not found then return jsonb_build_object('resolved',false,'reason','tier_alias_missing'); end if;

  select * into a from djm_os.country_league_strength_anchors where lower(country)=lower(m.country_name) limit 1;
  if not found then return jsonb_build_object('resolved',false,'reason','country_anchor_missing'); end if;

  v_penalty := case m.tier when 1 then 0 when 2 then 12 when 3 then 20 when 4 then 27 when 5 then 33 else null end;
  if v_penalty is null then return jsonb_build_object('resolved',false,'reason','tier_penalty_missing'); end if;
  v_strength := greatest(10,a.strength_score-v_penalty);
  v_key := 'auto:'||md5(m.country_key||'|'||lower(m.canonical_name));

  select * into c from djm_os.competitions where canonical_key=v_key limit 1;
  if not found then
    insert into djm_os.competitions(canonical_key,display_name,country,level_tier,aliases,provider_ids,created_by,updated_by)
    values(v_key,m.canonical_name,m.country_name,m.tier,array[p.current_league,m.canonical_name],jsonb_build_object('autoresolved',true),auth.uid(),auth.uid())
    returning * into c;
  else
    update djm_os.competitions set display_name=m.canonical_name,country=m.country_name,level_tier=m.tier,
      aliases=(select array_agg(distinct x) from unnest(coalesce(c.aliases,'{}'::text[])||array[p.current_league,m.canonical_name]) x),updated_by=auth.uid(),updated_at=now()
    where id=c.id returning * into c;
  end if;

  update public.players set current_competition_id=c.id,updated_at=now() where id=p_player_id and current_competition_id is null;
  update public.career_entries set competition_id=c.id,updated_at=now()
    where player_id=p_player_id and lower(coalesce(league,''))=lower(p.current_league) and competition_id is null;

  v_benchmark_key := v_key||':iffhs_2025:t'||m.tier;
  insert into djm_os.league_benchmarks(
    canonical_key,league_name,country,strength_score,source_url,source_note,verified_at,updated_by,competition_id,review_cadence_days,
    raw_strength_value,raw_strength_scale,benchmark_provider,benchmark_metric,methodology,methodology_version,source_reference,observed_at,next_review_at
  ) values(
    v_benchmark_key,m.canonical_name,m.country_name,v_strength,a.source_url,
    case when m.tier=1 then 'IFFHS 2025 national top-division anchor, rank '||a.iffhs_rank||'.' else 'Derived from IFFHS 2025 national top-division anchor with DJM tier-'||m.tier||' penalty of '||v_penalty||' points.' end,
    now(),auth.uid(),c.id,365,a.iffhs_points,'IFFHS 2025 national league points',
    case when m.tier=1 then 'iffhs_2025' else 'djm_iffhs_tier_decay_v1' end,'national_league_strength',
    case when m.tier=1 then a.methodology else a.methodology||' Lower division adjustment is model-derived and explicitly tier-based.' end,
    'djm_global_league_strength_v1','IFFHS rank '||a.iffhs_rank||'; tier '||m.tier,a.observed_at,'2027-02-01T00:00:00Z'::timestamptz
  ) on conflict(canonical_key) do update set
    league_name=excluded.league_name,country=excluded.country,strength_score=excluded.strength_score,source_url=excluded.source_url,
    source_note=excluded.source_note,verified_at=excluded.verified_at,updated_by=excluded.updated_by,competition_id=excluded.competition_id,
    raw_strength_value=excluded.raw_strength_value,benchmark_provider=excluded.benchmark_provider,methodology=excluded.methodology,
    source_reference=excluded.source_reference,observed_at=excluded.observed_at,next_review_at=excluded.next_review_at;

  return jsonb_build_object('resolved',true,'competition_id',c.id,'competition_name',m.canonical_name,'tier',m.tier,'strength_score',v_strength,'source','IFFHS 2025');
end;
$function$


CREATE OR REPLACE FUNCTION private.djm_benchmark_score_stale_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player record;
  v_competition_id uuid;
  v_key text;
begin
  if tg_op = 'DELETE' then
    v_competition_id := old.competition_id;
    v_key := old.canonical_key;
  else
    v_competition_id := new.competition_id;
    v_key := new.canonical_key;
  end if;
  for v_player in
    select p.id
    from public.players p
    left join djm_os.competitions c on c.id = v_competition_id
    where p.current_competition_id = v_competition_id
       or lower(regexp_replace(trim(coalesce(p.current_country,'') || '|' || coalesce(p.current_league,'')), '\s+', ' ', 'g')) = v_key
       or (
         (c.country is null or lower(c.country) = lower(coalesce(p.current_country,'')))
         and (
           lower(c.display_name) = lower(coalesce(p.current_league,''))
           or exists (
             select 1 from unnest(c.aliases) alias_name
             where lower(alias_name) = lower(coalesce(p.current_league,''))
           )
         )
       )
  loop
    perform private.djm_mark_player_score_stale(v_player.id, 'Competition benchmark changed');
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION private.djm_career_score_stale_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player_id uuid;
begin
  v_player_id := case when tg_op = 'DELETE' then old.player_id else new.player_id end;
  perform private.djm_mark_player_score_stale(
    v_player_id,
    'Verified career evidence changed'
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION private.djm_current_recency_weight(p_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case
    when p_date is null or p_date > current_date then 0::numeric
    when current_date - p_date <= 180 then 1::numeric
    when current_date - p_date <= 365 then 0.85::numeric
    when current_date - p_date <= 548 then 0.65::numeric
    when current_date - p_date <= 730 then 0.45::numeric
    else 0::numeric
  end;
$function$

commit;
