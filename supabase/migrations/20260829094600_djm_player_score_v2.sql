-- DJM Player Score V2
-- Adds evidence-backed position performance, recency decay, experience decay,
-- position-aware age curves and transparent component scoring.
-- Additive follow-up to benchmark acquisition V1. No benchmark or player score seeds.

begin;

alter table djm_os.player_scorecards
  add column if not exists ability_core_score smallint check (ability_core_score is null or ability_core_score between 0 and 100),
  add column if not exists performance_score smallint check (performance_score is null or performance_score between 0 and 100),
  add column if not exists role_score smallint check (role_score is null or role_score between 0 and 100),
  add column if not exists experience_score smallint check (experience_score is null or experience_score between 0 and 100),
  add column if not exists trend_score smallint check (trend_score is null or trend_score between 0 and 100),
  add column if not exists availability_score smallint check (availability_score is null or availability_score between 0 and 100),
  add column if not exists age_adjustment numeric(5,2),
  add column if not exists data_coverage smallint check (data_coverage is null or data_coverage between 0 and 100),
  add column if not exists position_group text;

create table if not exists djm_os.player_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  competition_id uuid references djm_os.competitions(id) on delete set null,
  season_label text,
  position_group text not null,
  evidence_date date not null,
  minutes integer,
  starts integer,
  appearances integer,
  possible_minutes integer,
  overall_performance_percentile numeric(5,2),
  attacking_percentile numeric(5,2),
  creativity_percentile numeric(5,2),
  progression_percentile numeric(5,2),
  possession_percentile numeric(5,2),
  defending_percentile numeric(5,2),
  aerial_percentile numeric(5,2),
  goalkeeping_percentile numeric(5,2),
  physical_percentile numeric(5,2),
  discipline_percentile numeric(5,2),
  peer_group_description text not null,
  provider text not null,
  source_name text not null,
  source_url text,
  source_reference text,
  observed_at timestamptz not null,
  verified_at timestamptz not null,
  verified_by uuid references auth.users(id) on delete set null,
  confidence numeric(4,3),
  raw_metrics jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (position_group in ('GK','CB','FB_WB','DM','CM','AM','W','ST','UNKNOWN')),
  check (minutes is null or minutes >= 0),
  check (starts is null or starts >= 0),
  check (appearances is null or appearances >= 0),
  check (possible_minutes is null or possible_minutes >= 0),
  check (possible_minutes is null or minutes is null or possible_minutes >= minutes),
  check (confidence is null or (confidence >= 0 and confidence <= 1)),
  check (overall_performance_percentile is null or overall_performance_percentile between 0 and 100),
  check (attacking_percentile is null or attacking_percentile between 0 and 100),
  check (creativity_percentile is null or creativity_percentile between 0 and 100),
  check (progression_percentile is null or progression_percentile between 0 and 100),
  check (possession_percentile is null or possession_percentile between 0 and 100),
  check (defending_percentile is null or defending_percentile between 0 and 100),
  check (aerial_percentile is null or aerial_percentile between 0 and 100),
  check (goalkeeping_percentile is null or goalkeeping_percentile between 0 and 100),
  check (physical_percentile is null or physical_percentile between 0 and 100),
  check (discipline_percentile is null or discipline_percentile between 0 and 100)
);

create index if not exists player_performance_snapshots_player_date_idx
  on djm_os.player_performance_snapshots(player_id, evidence_date desc);
create index if not exists player_performance_snapshots_competition_idx
  on djm_os.player_performance_snapshots(competition_id, position_group, evidence_date desc);

alter table djm_os.player_performance_snapshots enable row level security;
drop policy if exists djm_team_select on djm_os.player_performance_snapshots;
drop policy if exists djm_team_insert on djm_os.player_performance_snapshots;
drop policy if exists djm_team_update on djm_os.player_performance_snapshots;
drop policy if exists djm_team_delete on djm_os.player_performance_snapshots;
create policy djm_team_select on djm_os.player_performance_snapshots
  for select to authenticated using ((select djm_os.is_team_member()));
create policy djm_team_insert on djm_os.player_performance_snapshots
  for insert to authenticated with check ((select djm_os.is_team_member()));
create policy djm_team_update on djm_os.player_performance_snapshots
  for update to authenticated using ((select djm_os.is_team_member()))
  with check ((select djm_os.is_team_member()));
create policy djm_team_delete on djm_os.player_performance_snapshots
  for delete to authenticated using ((select djm_os.is_team_member()));
revoke all on table djm_os.player_performance_snapshots from public, anon;
grant select, insert, update, delete on table djm_os.player_performance_snapshots to authenticated, service_role;

create or replace function private.djm_position_group(p_position text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := upper(regexp_replace(trim(coalesce(p_position,'')), '[.[:space:]-]+', '_', 'g'));
begin
  if v ~ '^(GK|GOALKEEPER)$' then return 'GK'; end if;
  if v ~ '^(CB|LCB|RCB|CENTRE_BACK|CENTER_BACK)$' then return 'CB'; end if;
  if v ~ '^(LB|RB|LWB|RWB|WB|FULL_BACK|FULLBACK|WING_BACK|WINGBACK)$' then return 'FB_WB'; end if;
  if v ~ '^(DM|CDM|6|DEFENSIVE_MIDFIELDER)$' then return 'DM'; end if;
  if v ~ '^(CM|8|CENTRAL_MIDFIELDER)$' then return 'CM'; end if;
  if v ~ '^(AM|CAM|10|ATTACKING_MIDFIELDER)$' then return 'AM'; end if;
  if v ~ '^(LW|RW|LM|RM|W|WINGER)$' then return 'W'; end if;
  if v ~ '^(ST|CF|9|STRIKER|CENTRE_FORWARD|CENTER_FORWARD|FORWARD)$' then return 'ST'; end if;
  return 'UNKNOWN';
end;
$$;

create or replace function private.djm_current_recency_weight(p_date date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when p_date is null or p_date > current_date then 0::numeric
    when current_date - p_date <= 180 then 1::numeric
    when current_date - p_date <= 365 then 0.85::numeric
    when current_date - p_date <= 548 then 0.65::numeric
    when current_date - p_date <= 730 then 0.45::numeric
    else 0::numeric
  end;
$$;

create or replace function private.djm_experience_recency_weight(p_date date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when p_date is null or p_date > current_date then 0::numeric
    when current_date - p_date <= 730 then 1::numeric
    when current_date - p_date <= 1460 then 0.65::numeric
    when current_date - p_date <= 2190 then 0.35::numeric
    else 0.15::numeric
  end;
$$;

create or replace function private.djm_position_performance_score(
  p_position_group text,
  p_overall numeric,
  p_attacking numeric,
  p_creativity numeric,
  p_progression numeric,
  p_possession numeric,
  p_defending numeric,
  p_aerial numeric,
  p_goalkeeping numeric,
  p_physical numeric,
  p_discipline numeric
) returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_weighted numeric := 0;
  v_weight numeric := 0;
  v_group text := coalesce(p_position_group, 'UNKNOWN');
begin
  if p_overall is not null then return least(100, greatest(0, p_overall)); end if;

  if v_group = 'GK' then
    if p_goalkeeping is not null then v_weighted:=v_weighted+least(100,greatest(0,p_goalkeeping))*65; v_weight:=v_weight+65; end if;
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*15; v_weight:=v_weight+15; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*10; v_weight:=v_weight+10; end if;
    if p_aerial is not null then v_weighted:=v_weighted+least(100,greatest(0,p_aerial))*10; v_weight:=v_weight+10; end if;
  elsif v_group = 'CB' then
    if p_defending is not null then v_weighted:=v_weighted+least(100,greatest(0,p_defending))*35; v_weight:=v_weight+35; end if;
    if p_aerial is not null then v_weighted:=v_weighted+least(100,greatest(0,p_aerial))*20; v_weight:=v_weight+20; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*20; v_weight:=v_weight+20; end if;
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*15; v_weight:=v_weight+15; end if;
    if p_physical is not null then v_weighted:=v_weighted+least(100,greatest(0,p_physical))*10; v_weight:=v_weight+10; end if;
  elsif v_group = 'FB_WB' then
    if p_defending is not null then v_weighted:=v_weighted+least(100,greatest(0,p_defending))*25; v_weight:=v_weight+25; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*20; v_weight:=v_weight+20; end if;
    if p_creativity is not null then v_weighted:=v_weighted+least(100,greatest(0,p_creativity))*20; v_weight:=v_weight+20; end if;
    if p_attacking is not null then v_weighted:=v_weighted+least(100,greatest(0,p_attacking))*10; v_weight:=v_weight+10; end if;
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*10; v_weight:=v_weight+10; end if;
    if p_physical is not null then v_weighted:=v_weighted+least(100,greatest(0,p_physical))*15; v_weight:=v_weight+15; end if;
  elsif v_group = 'DM' then
    if p_defending is not null then v_weighted:=v_weighted+least(100,greatest(0,p_defending))*25; v_weight:=v_weight+25; end if;
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*25; v_weight:=v_weight+25; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*25; v_weight:=v_weight+25; end if;
    if p_creativity is not null then v_weighted:=v_weighted+least(100,greatest(0,p_creativity))*10; v_weight:=v_weight+10; end if;
    if p_physical is not null then v_weighted:=v_weighted+least(100,greatest(0,p_physical))*10; v_weight:=v_weight+10; end if;
    if p_aerial is not null then v_weighted:=v_weighted+least(100,greatest(0,p_aerial))*5; v_weight:=v_weight+5; end if;
  elsif v_group = 'CM' then
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*25; v_weight:=v_weight+25; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*25; v_weight:=v_weight+25; end if;
    if p_creativity is not null then v_weighted:=v_weighted+least(100,greatest(0,p_creativity))*20; v_weight:=v_weight+20; end if;
    if p_defending is not null then v_weighted:=v_weighted+least(100,greatest(0,p_defending))*15; v_weight:=v_weight+15; end if;
    if p_attacking is not null then v_weighted:=v_weighted+least(100,greatest(0,p_attacking))*5; v_weight:=v_weight+5; end if;
    if p_physical is not null then v_weighted:=v_weighted+least(100,greatest(0,p_physical))*10; v_weight:=v_weight+10; end if;
  elsif v_group = 'AM' then
    if p_creativity is not null then v_weighted:=v_weighted+least(100,greatest(0,p_creativity))*30; v_weight:=v_weight+30; end if;
    if p_attacking is not null then v_weighted:=v_weighted+least(100,greatest(0,p_attacking))*25; v_weight:=v_weight+25; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*20; v_weight:=v_weight+20; end if;
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*10; v_weight:=v_weight+10; end if;
    if p_physical is not null then v_weighted:=v_weighted+least(100,greatest(0,p_physical))*10; v_weight:=v_weight+10; end if;
    if p_defending is not null then v_weighted:=v_weighted+least(100,greatest(0,p_defending))*5; v_weight:=v_weight+5; end if;
  elsif v_group = 'W' then
    if p_attacking is not null then v_weighted:=v_weighted+least(100,greatest(0,p_attacking))*30; v_weight:=v_weight+30; end if;
    if p_creativity is not null then v_weighted:=v_weighted+least(100,greatest(0,p_creativity))*25; v_weight:=v_weight+25; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*25; v_weight:=v_weight+25; end if;
    if p_physical is not null then v_weighted:=v_weighted+least(100,greatest(0,p_physical))*10; v_weight:=v_weight+10; end if;
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*5; v_weight:=v_weight+5; end if;
    if p_defending is not null then v_weighted:=v_weighted+least(100,greatest(0,p_defending))*5; v_weight:=v_weight+5; end if;
  elsif v_group = 'ST' then
    if p_attacking is not null then v_weighted:=v_weighted+least(100,greatest(0,p_attacking))*45; v_weight:=v_weight+45; end if;
    if p_creativity is not null then v_weighted:=v_weighted+least(100,greatest(0,p_creativity))*15; v_weight:=v_weight+15; end if;
    if p_aerial is not null then v_weighted:=v_weighted+least(100,greatest(0,p_aerial))*15; v_weight:=v_weight+15; end if;
    if p_physical is not null then v_weighted:=v_weighted+least(100,greatest(0,p_physical))*15; v_weight:=v_weight+15; end if;
    if p_possession is not null then v_weighted:=v_weighted+least(100,greatest(0,p_possession))*5; v_weight:=v_weight+5; end if;
    if p_progression is not null then v_weighted:=v_weighted+least(100,greatest(0,p_progression))*5; v_weight:=v_weight+5; end if;
  else
    return null;
  end if;

  if v_weight < 50 then return null; end if;
  return v_weighted / v_weight;
end;
$$;

create or replace function private.djm_age_performance_adjustment(
  p_age integer,
  p_position_group text,
  p_performance_score numeric
) returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_peak_end integer := case p_position_group
    when 'GK' then 32 when 'CB' then 31 when 'FB_WB' then 29
    when 'DM' then 30 when 'CM' then 30 when 'AM' then 29
    when 'W' then 28 when 'ST' then 29 else 29 end;
  v_step numeric := case p_position_group
    when 'GK' then .9 when 'CB' then 1.1 when 'FB_WB' then 1.5
    when 'DM' then 1.25 when 'CM' then 1.25 when 'AM' then 1.4
    when 'W' then 1.6 when 'ST' then 1.45 else 1.35 end;
  v_factor numeric := case
    when p_performance_score >= 75 then .35
    when p_performance_score >= 60 then .55
    when p_performance_score >= 45 then .75
    else 1 end;
  v_years integer;
begin
  if p_age is null then return 0; end if;
  v_years := greatest(0, p_age - v_peak_end);
  if v_years = 0 then return 0; end if;
  return -least(6::numeric, v_years * v_step * v_factor);
end;
$$;

create or replace function private.djm_potential_age_adjustment(
  p_age integer,
  p_position_group text
) returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_peak_start integer := case p_position_group
    when 'GK' then 27 when 'CB' then 26 when 'FB_WB' then 24
    when 'DM' then 25 when 'CM' then 25 when 'AM' then 24
    when 'W' then 23 when 'ST' then 24 else 24 end;
  v_peak_end integer := case p_position_group
    when 'GK' then 32 when 'CB' then 31 when 'FB_WB' then 29
    when 'DM' then 30 when 'CM' then 30 when 'AM' then 29
    when 'W' then 28 when 'ST' then 29 else 29 end;
begin
  if p_age is null then return null; end if;
  if p_age < v_peak_start then return least(12::numeric, 2 + (v_peak_start - p_age) * 2); end if;
  if p_age <= v_peak_end then return 0; end if;
  return -least(18::numeric, (p_age - v_peak_end) * 2);
end;
$$;

create or replace function public.djm_player_performance_snapshot_upsert(
  p_player_id uuid,
  p_snapshot jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_snapshot->>'id','')::uuid;
  v_group text := private.djm_position_group(coalesce(p_snapshot->>'position_group', p_snapshot->>'position'));
  v_source_name text := nullif(trim(coalesce(p_snapshot->>'source_name','')), '');
  v_provider text := nullif(trim(coalesce(p_snapshot->>'provider','')), '');
  v_peer text := nullif(trim(coalesce(p_snapshot->>'peer_group_description','')), '');
  v_evidence_date date := nullif(p_snapshot->>'evidence_date','')::date;
  v_observed_at timestamptz := nullif(p_snapshot->>'observed_at','')::timestamptz;
  v_verified_at timestamptz := nullif(p_snapshot->>'verified_at','')::timestamptz;
  v_score numeric;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if not exists(select 1 from public.players where id = p_player_id) then raise exception 'Player not found'; end if;
  if v_source_name is null then raise exception 'Source name is required'; end if;
  if v_provider is null then raise exception 'Provider is required'; end if;
  if v_peer is null then raise exception 'Peer group is required'; end if;
  if v_evidence_date is null then raise exception 'Evidence date is required'; end if;
  if v_observed_at is null then raise exception 'Observed date is required'; end if;
  if v_verified_at is null then raise exception 'Verification date is required'; end if;

  v_score := private.djm_position_performance_score(
    v_group,
    nullif(p_snapshot->>'overall_performance_percentile','')::numeric,
    nullif(p_snapshot->>'attacking_percentile','')::numeric,
    nullif(p_snapshot->>'creativity_percentile','')::numeric,
    nullif(p_snapshot->>'progression_percentile','')::numeric,
    nullif(p_snapshot->>'possession_percentile','')::numeric,
    nullif(p_snapshot->>'defending_percentile','')::numeric,
    nullif(p_snapshot->>'aerial_percentile','')::numeric,
    nullif(p_snapshot->>'goalkeeping_percentile','')::numeric,
    nullif(p_snapshot->>'physical_percentile','')::numeric,
    nullif(p_snapshot->>'discipline_percentile','')::numeric
  );
  if v_score is null then raise exception 'Add an overall performance percentile or enough position-specific percentile evidence'; end if;

  if v_id is null then
    insert into djm_os.player_performance_snapshots(
      player_id, competition_id, season_label, position_group, evidence_date,
      minutes, starts, appearances, possible_minutes,
      overall_performance_percentile, attacking_percentile, creativity_percentile,
      progression_percentile, possession_percentile, defending_percentile,
      aerial_percentile, goalkeeping_percentile, physical_percentile,
      discipline_percentile, peer_group_description, provider, source_name,
      source_url, source_reference, observed_at, verified_at, verified_by,
      confidence, raw_metrics, metadata
    ) values (
      p_player_id, nullif(p_snapshot->>'competition_id','')::uuid,
      nullif(trim(coalesce(p_snapshot->>'season_label','')), ''), v_group, v_evidence_date,
      nullif(p_snapshot->>'minutes','')::integer, nullif(p_snapshot->>'starts','')::integer,
      nullif(p_snapshot->>'appearances','')::integer, nullif(p_snapshot->>'possible_minutes','')::integer,
      nullif(p_snapshot->>'overall_performance_percentile','')::numeric,
      nullif(p_snapshot->>'attacking_percentile','')::numeric,
      nullif(p_snapshot->>'creativity_percentile','')::numeric,
      nullif(p_snapshot->>'progression_percentile','')::numeric,
      nullif(p_snapshot->>'possession_percentile','')::numeric,
      nullif(p_snapshot->>'defending_percentile','')::numeric,
      nullif(p_snapshot->>'aerial_percentile','')::numeric,
      nullif(p_snapshot->>'goalkeeping_percentile','')::numeric,
      nullif(p_snapshot->>'physical_percentile','')::numeric,
      nullif(p_snapshot->>'discipline_percentile','')::numeric,
      v_peer, v_provider, v_source_name, nullif(trim(coalesce(p_snapshot->>'source_url','')), ''),
      nullif(trim(coalesce(p_snapshot->>'source_reference','')), ''), v_observed_at, v_verified_at,
      auth.uid(), nullif(p_snapshot->>'confidence','')::numeric,
      coalesce(p_snapshot->'raw_metrics','{}'::jsonb), coalesce(p_snapshot->'metadata','{}'::jsonb)
    ) returning id into v_id;
  else
    update djm_os.player_performance_snapshots set
      competition_id = nullif(p_snapshot->>'competition_id','')::uuid,
      season_label = nullif(trim(coalesce(p_snapshot->>'season_label','')), ''),
      position_group = v_group,
      evidence_date = v_evidence_date,
      minutes = nullif(p_snapshot->>'minutes','')::integer,
      starts = nullif(p_snapshot->>'starts','')::integer,
      appearances = nullif(p_snapshot->>'appearances','')::integer,
      possible_minutes = nullif(p_snapshot->>'possible_minutes','')::integer,
      overall_performance_percentile = nullif(p_snapshot->>'overall_performance_percentile','')::numeric,
      attacking_percentile = nullif(p_snapshot->>'attacking_percentile','')::numeric,
      creativity_percentile = nullif(p_snapshot->>'creativity_percentile','')::numeric,
      progression_percentile = nullif(p_snapshot->>'progression_percentile','')::numeric,
      possession_percentile = nullif(p_snapshot->>'possession_percentile','')::numeric,
      defending_percentile = nullif(p_snapshot->>'defending_percentile','')::numeric,
      aerial_percentile = nullif(p_snapshot->>'aerial_percentile','')::numeric,
      goalkeeping_percentile = nullif(p_snapshot->>'goalkeeping_percentile','')::numeric,
      physical_percentile = nullif(p_snapshot->>'physical_percentile','')::numeric,
      discipline_percentile = nullif(p_snapshot->>'discipline_percentile','')::numeric,
      peer_group_description = v_peer,
      provider = v_provider,
      source_name = v_source_name,
      source_url = nullif(trim(coalesce(p_snapshot->>'source_url','')), ''),
      source_reference = nullif(trim(coalesce(p_snapshot->>'source_reference','')), ''),
      observed_at = v_observed_at,
      verified_at = v_verified_at,
      verified_by = auth.uid(),
      confidence = nullif(p_snapshot->>'confidence','')::numeric,
      raw_metrics = coalesce(p_snapshot->'raw_metrics', raw_metrics),
      metadata = coalesce(p_snapshot->'metadata', metadata),
      updated_at = now()
    where id = v_id and player_id = p_player_id;
    if not found then raise exception 'Performance snapshot not found'; end if;
  end if;

  perform private.djm_mark_player_score_stale(p_player_id, 'Verified performance evidence changed');
  insert into djm_os.events(event_type, actor_user_id, player_id, payload, source, confidence, occurred_at)
  values('PLAYER_PERFORMANCE_EVIDENCE_SAVED', auth.uid(), p_player_id,
    jsonb_build_object('snapshot_id', v_id, 'position_group', v_group, 'performance_score', round(v_score,2), 'peer_group', v_peer),
    'performance_evidence', coalesce(nullif(p_snapshot->>'confidence','')::numeric, 1), now());

  return jsonb_build_object('id', v_id, 'position_group', v_group, 'performance_score', round(v_score,2));
end;
$$;

create or replace function public.djm_player_performance_data(p_player_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when not djm_os.is_team_member() then jsonb_build_object('error','DJM team access required')
  else jsonb_build_object(
    'player', (select jsonb_build_object(
      'id', p.id,
      'name', trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')),
      'primary_position', p.primary_position,
      'position_group', private.djm_position_group(p.primary_position),
      'date_of_birth', p.date_of_birth
    ) from public.players p where p.id = p_player_id),
    'snapshots', coalesce((select jsonb_agg(to_jsonb(s) order by s.evidence_date desc, s.verified_at desc)
      from djm_os.player_performance_snapshots s where s.player_id = p_player_id), '[]'::jsonb),
    'scorecard', (select to_jsonb(ps) from djm_os.player_scorecards ps where ps.player_id = p_player_id)
  ) end;
$$;

create or replace function public.djm_player_scorecard(p_player_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.players%rowtype;
  b djm_os.league_benchmarks%rowtype;
  s djm_os.player_scorecards%rowtype;
  v_context jsonb;
  v_competition_id uuid;
  v_competition_name text;
  v_competition_country text;
  v_competition_basis text;
  v_position_group text;
  v_age integer;
  v_recent_minutes integer := 0;
  v_recent_apps numeric := 0;
  v_recent_starts numeric := 0;
  v_weighted_minutes numeric := 0;
  v_weighted_apps numeric := 0;
  v_weighted_starts numeric := 0;
  v_minutes_signal numeric;
  v_starter_signal numeric;
  v_role_score numeric;
  v_performance_score numeric;
  v_performance_confidence numeric;
  v_recent_perf numeric;
  v_prior_perf numeric;
  v_trend_score numeric;
  v_availability_score numeric;
  v_experience_score numeric;
  v_experience_minutes numeric := 0;
  v_international_apps integer := 0;
  v_level_score numeric;
  v_core_score numeric;
  v_age_adjustment numeric := 0;
  v_potential_adjustment numeric;
  v_potential numeric;
  v_model numeric;
  v_status text := 'not_enough_playing_time_data';
  v_coverage integer := 0;
  v_weighted_total numeric := 0;
  v_benchmark_freshness text := 'unknown';
  v_confidence integer := 0;
  v_basis jsonb;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  select * into p from public.players where id = p_player_id;
  if not found then raise exception 'Player not found'; end if;

  v_position_group := private.djm_position_group(p.primary_position);
  if p.date_of_birth is not null then v_age := date_part('year', age(current_date, p.date_of_birth))::int; end if;

  select
    coalesce(sum(coalesce(c.minutes,0)),0)::int,
    coalesce(sum(coalesce(c.appearances,0)),0),
    coalesce(sum(coalesce(c.starts,0)),0),
    coalesce(sum(coalesce(c.minutes,0) * private.djm_current_recency_weight(public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date))),0),
    coalesce(sum(coalesce(c.appearances,0) * private.djm_current_recency_weight(public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date))),0),
    coalesce(sum(coalesce(c.starts,0) * private.djm_current_recency_weight(public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date))),0)
  into v_recent_minutes, v_recent_apps, v_recent_starts, v_weighted_minutes, v_weighted_apps, v_weighted_starts
  from public.career_entries c
  where c.player_id = p_player_id
    and c.source_reviewed_at is not null
    and public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date) >= current_date - interval '24 months';

  if v_recent_minutes >= 500 then
    v_minutes_signal := least(100, v_weighted_minutes / 2200 * 100);
    if v_weighted_apps > 0 then v_starter_signal := least(100, greatest(0, v_weighted_starts / v_weighted_apps * 100)); end if;
    v_role_score := case when v_starter_signal is null then v_minutes_signal else v_minutes_signal * .8 + v_starter_signal * .2 end;
  end if;

  v_context := public.djm_player_score_competition_context(p_player_id);
  v_competition_id := nullif(v_context->>'competition_id','')::uuid;
  v_competition_name := nullif(v_context->>'competition_name','');
  v_competition_country := nullif(v_context->>'country','');
  v_competition_basis := coalesce(v_context->>'basis','unresolved');

  select lb.* into b
  from djm_os.league_benchmarks lb
  left join djm_os.competitions c on c.id = lb.competition_id
  where lb.verified_at is not null
    and (
      (v_competition_id is not null and lb.competition_id = v_competition_id)
      or (v_competition_name is not null and lower(lb.league_name)=lower(v_competition_name)
        and (lb.country is null or v_competition_country is null or lower(lb.country)=lower(v_competition_country)))
      or (v_competition_name is not null and (lower(c.display_name)=lower(v_competition_name)
        or exists(select 1 from unnest(c.aliases) a where lower(a)=lower(v_competition_name)))
        and (c.country is null or v_competition_country is null or lower(c.country)=lower(v_competition_country)))
    )
  order by (v_competition_id is not null and lb.competition_id=v_competition_id) desc, lb.verified_at desc
  limit 1;

  if b.id is not null then
    v_level_score := b.strength_score;
    v_benchmark_freshness := case
      when coalesce(b.next_review_at, b.verified_at + interval '90 days') < now() then 'stale'
      when now() > b.verified_at + interval '30 days' then 'aging'
      else 'fresh' end;
  end if;

  with scored as (
    select s.*,
      private.djm_position_performance_score(
        s.position_group, s.overall_performance_percentile, s.attacking_percentile,
        s.creativity_percentile, s.progression_percentile, s.possession_percentile,
        s.defending_percentile, s.aerial_percentile, s.goalkeeping_percentile,
        s.physical_percentile, s.discipline_percentile
      ) as perf_score,
      private.djm_current_recency_weight(s.evidence_date) as recency
    from djm_os.player_performance_snapshots s
    where s.player_id = p_player_id
      and s.verified_at is not null
      and s.evidence_date >= current_date - interval '18 months'
      and coalesce(s.minutes,0) >= 180
      and (s.position_group = v_position_group or v_position_group = 'UNKNOWN')
  )
  select
    sum(perf_score * greatest(coalesce(minutes,180),180) * recency) / nullif(sum(greatest(coalesce(minutes,180),180) * recency),0),
    sum(coalesce(confidence,1) * greatest(coalesce(minutes,180),180) * recency) / nullif(sum(greatest(coalesce(minutes,180),180) * recency),0),
    sum(case when evidence_date >= current_date - interval '6 months' then perf_score * greatest(coalesce(minutes,180),180) else 0 end)
      / nullif(sum(case when evidence_date >= current_date - interval '6 months' then greatest(coalesce(minutes,180),180) else 0 end),0),
    sum(case when evidence_date < current_date - interval '6 months' then perf_score * greatest(coalesce(minutes,180),180) else 0 end)
      / nullif(sum(case when evidence_date < current_date - interval '6 months' then greatest(coalesce(minutes,180),180) else 0 end),0),
    least(100, sum(case when possible_minutes > 0 and evidence_date >= current_date - interval '12 months' then coalesce(minutes,0) else 0 end)::numeric
      / nullif(sum(case when possible_minutes > 0 and evidence_date >= current_date - interval '12 months' then possible_minutes else 0 end),0) * 100)
  into v_performance_score, v_performance_confidence, v_recent_perf, v_prior_perf, v_availability_score
  from scored
  where perf_score is not null and recency > 0;

  if v_recent_perf is not null and v_prior_perf is not null then
    v_trend_score := least(100, greatest(0, 50 + (v_recent_perf - v_prior_perf) * 1.25));
  end if;

  with career_level as (
    select c.*,
      public.djm_career_evidence_date(c.season_label,c.start_date,c.end_date) as evidence_date,
      lb.strength_score as level_score
    from public.career_entries c
    left join lateral (
      select x.strength_score
      from djm_os.league_benchmarks x
      left join djm_os.competitions xc on xc.id=x.competition_id
      where x.verified_at is not null and (
        (c.competition_id is not null and x.competition_id=c.competition_id)
        or (c.league is not null and lower(x.league_name)=lower(c.league)
          and (x.country is null or c.country is null or lower(x.country)=lower(c.country)))
        or (c.league is not null and (lower(xc.display_name)=lower(c.league)
          or exists(select 1 from unnest(xc.aliases) a where lower(a)=lower(c.league)))
          and (xc.country is null or c.country is null or lower(xc.country)=lower(c.country)))
      ) order by (c.competition_id is not null and x.competition_id=c.competition_id) desc, x.verified_at desc limit 1
    ) lb on true
    where c.player_id=p_player_id and c.source_reviewed_at is not null
  )
  select
    coalesce(sum(case when level_score is not null then coalesce(minutes,0) * private.djm_experience_recency_weight(evidence_date)
      * (.5 + level_score / 200) else 0 end),0),
    coalesce(sum(case when is_international then coalesce(appearances,0) else 0 end),0)::int
  into v_experience_minutes, v_international_apps
  from career_level where evidence_date is not null;

  if v_experience_minutes > 0 then
    v_experience_score := least(100, v_experience_minutes / 8000 * 100 + least(8, v_international_apps * .5));
  end if;

  if v_recent_minutes < 500 then
    v_status := 'not_enough_playing_time_data';
  elsif v_competition_name is null then
    v_status := 'competition_evidence_required';
  elsif b.id is null then
    v_status := 'benchmark_required';
  elsif v_performance_score is null then
    v_status := 'performance_data_required';
  else
    v_coverage := 30 + 30 + 15
      + case when v_experience_score is not null then 10 else 0 end
      + case when v_trend_score is not null then 10 else 0 end
      + case when v_availability_score is not null then 5 else 0 end;

    v_weighted_total := v_level_score * 30 + v_performance_score * 30 + v_role_score * 15
      + coalesce(v_experience_score * 10,0) + coalesce(v_trend_score * 10,0) + coalesce(v_availability_score * 5,0);

    if v_coverage < 75 then
      v_status := 'not_enough_model_coverage';
    else
      v_core_score := v_weighted_total / v_coverage;
      v_age_adjustment := private.djm_age_performance_adjustment(v_age, v_position_group, v_performance_score);
      v_model := least(100, greatest(0, v_core_score + v_age_adjustment));
      v_potential_adjustment := private.djm_potential_age_adjustment(v_age, v_position_group);
      if v_potential_adjustment is not null then
        v_potential := least(100, greatest(0, v_model + v_potential_adjustment
          + case when v_trend_score is null then 0 else greatest(-6,least(6,(v_trend_score-50)*.12)) end));
      end if;
      v_status := 'calculated';
    end if;
  end if;

  if v_status <> 'calculated' then
    v_coverage := case
      when b.id is null then 0
      else 30 + case when v_performance_score is not null then 30 else 0 end
        + case when v_role_score is not null then 15 else 0 end
        + case when v_experience_score is not null then 10 else 0 end
        + case when v_trend_score is not null then 10 else 0 end
        + case when v_availability_score is not null then 5 else 0 end
      end;
  end if;

  v_confidence := least(100, greatest(0, round(
    v_coverage * .5
    + least(20, v_recent_minutes::numeric / 1800 * 20)
    + case v_benchmark_freshness when 'fresh' then 10 when 'aging' then 7 when 'stale' then 3 else 0 end
    + coalesce(v_performance_confidence * 15,0)
    + case when p.verification_status='verified' then 5 else 0 end
  )))::int;

  v_basis := jsonb_build_object(
    'model','DJM Player Score v2',
    'model_definition','Current demonstrated football level, not readiness, Club Match, transfer probability or market price',
    'status',v_status,
    'position_group',v_position_group,
    'competition_id',v_competition_id,
    'competition_name',v_competition_name,
    'competition_country',v_competition_country,
    'competition_basis',v_competition_basis,
    'current_club',p.current_club,
    'league_strength_score',b.strength_score,
    'league_benchmark_provider',b.benchmark_provider,
    'league_benchmark_metric',b.benchmark_metric,
    'league_benchmark_raw_value',b.raw_strength_value,
    'league_benchmark_verified_at',b.verified_at,
    'league_benchmark_methodology',b.methodology,
    'benchmark_freshness',v_benchmark_freshness,
    'recent_minutes_24m',v_recent_minutes,
    'weighted_recent_minutes',round(v_weighted_minutes,0),
    'playing_time_score',case when v_role_score is null then null else round(v_role_score) end,
    'level_score',case when v_level_score is null then null else round(v_level_score) end,
    'performance_score',case when v_performance_score is null then null else round(v_performance_score) end,
    'role_score',case when v_role_score is null then null else round(v_role_score) end,
    'experience_score',case when v_experience_score is null then null else round(v_experience_score) end,
    'trend_score',case when v_trend_score is null then null else round(v_trend_score) end,
    'availability_score',case when v_availability_score is null then null else round(v_availability_score) end,
    'ability_core_score',case when v_core_score is null then null else round(v_core_score) end,
    'age',v_age,
    'age_performance_adjustment',round(v_age_adjustment,2),
    'potential_age_adjustment',round(v_potential_adjustment,2),
    'data_coverage',v_coverage,
    'evidence_window_months',24,
    'current_recency_weights',jsonb_build_object('0_6_months',1,'7_12_months',.85,'13_18_months',.65,'19_24_months',.45,'older',0),
    'experience_recency_weights',jsonb_build_object('0_24_months',1,'25_48_months',.65,'49_72_months',.35,'older',.15),
    'component_weights',jsonb_build_object('level',30,'position_performance',30,'role_minutes',15,'experience',10,'trend',10,'availability',5),
    'performance_peer_rule','Performance percentiles must be benchmarked against a relevant position and competition or level peer group',
    'age_rule','Age is a modest position-specific performance prior. Strong recent performance reduces the age penalty. Potential carries the larger future age effect.',
    'recommended_performance_source','Licensed Wyscout Data or another authorised position-adjusted dataset',
    'recommended_benchmark_source','Opta Power Rankings / licensed Stats Perform league-strength data or a reviewed authorised equivalent',
    'calculated_at',now()
  );

  insert into djm_os.player_scorecards(
    player_id, model_score, potential_model_score, score_status, confidence, basis,
    model_version, calculated_at, stale_at, stale_reason, evidence_freshness, updated_by,
    ability_core_score, performance_score, role_score, experience_score, trend_score,
    availability_score, age_adjustment, data_coverage, position_group
  ) values (
    p_player_id, case when v_model is null then null else round(v_model)::smallint end,
    case when v_potential is null then null else round(v_potential)::smallint end,
    v_status, v_confidence::smallint, v_basis, 'djm_player_score_v2', now(), null, null,
    case when v_status='calculated' and v_benchmark_freshness='fresh' then 'fresh'
         when v_status='calculated' then v_benchmark_freshness else 'unknown' end,
    auth.uid(),
    case when v_core_score is null then null else round(v_core_score)::smallint end,
    case when v_performance_score is null then null else round(v_performance_score)::smallint end,
    case when v_role_score is null then null else round(v_role_score)::smallint end,
    case when v_experience_score is null then null else round(v_experience_score)::smallint end,
    case when v_trend_score is null then null else round(v_trend_score)::smallint end,
    case when v_availability_score is null then null else round(v_availability_score)::smallint end,
    round(v_age_adjustment,2), v_coverage::smallint, v_position_group
  ) on conflict (player_id) do update set
    model_score=excluded.model_score,
    potential_model_score=excluded.potential_model_score,
    score_status=excluded.score_status,
    confidence=excluded.confidence,
    basis=excluded.basis,
    model_version=excluded.model_version,
    calculated_at=excluded.calculated_at,
    stale_at=null,
    stale_reason=null,
    evidence_freshness=excluded.evidence_freshness,
    updated_by=auth.uid(),
    ability_core_score=excluded.ability_core_score,
    performance_score=excluded.performance_score,
    role_score=excluded.role_score,
    experience_score=excluded.experience_score,
    trend_score=excluded.trend_score,
    availability_score=excluded.availability_score,
    age_adjustment=excluded.age_adjustment,
    data_coverage=excluded.data_coverage,
    position_group=excluded.position_group,
    updated_at=now()
  returning * into s;

  insert into djm_os.events(event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values('PLAYER_SCORE_CALCULATED',auth.uid(),p_player_id,
    jsonb_build_object('status',v_status,'model_score',s.model_score,'model_version','djm_player_score_v2','coverage',v_coverage,'position_group',v_position_group),
    'deterministic_model',v_confidence::numeric/100,now());

  return jsonb_build_object(
    'player_id',p_player_id,
    'score',coalesce(s.manual_score,s.model_score),
    'model_score',s.model_score,
    'manual_score',s.manual_score,
    'potential_score',coalesce(s.manual_potential_score,s.potential_model_score),
    'potential_model_score',s.potential_model_score,
    'manual_potential_score',s.manual_potential_score,
    'source',case when s.manual_score is not null then 'manual_override' when s.model_score is not null then 'model' else 'insufficient_data' end,
    'status',case when s.manual_score is not null then 'manual_override' else s.score_status end,
    'model_status',s.score_status,
    'confidence',s.confidence,
    'data_coverage',s.data_coverage,
    'override_reason',s.override_reason,
    'basis',s.basis,
    'model_version',s.model_version,
    'calculated_at',s.calculated_at
  );
end;
$$;

revoke all on function public.djm_player_performance_snapshot_upsert(uuid,jsonb) from public, anon;
revoke all on function public.djm_player_performance_data(uuid) from public, anon;
grant execute on function public.djm_player_performance_snapshot_upsert(uuid,jsonb) to authenticated, service_role;
grant execute on function public.djm_player_performance_data(uuid) to authenticated, service_role;

revoke all on function private.djm_position_group(text) from public, anon, authenticated;
revoke all on function private.djm_current_recency_weight(date) from public, anon, authenticated;
revoke all on function private.djm_experience_recency_weight(date) from public, anon, authenticated;
revoke all on function private.djm_position_performance_score(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) from public, anon, authenticated;
revoke all on function private.djm_age_performance_adjustment(integer,text,numeric) from public, anon, authenticated;
revoke all on function private.djm_potential_age_adjustment(integer,text) from public, anon, authenticated;

comment on table djm_os.player_performance_snapshots is
  'Verified position-adjusted performance evidence. Percentiles must describe the peer group and source; missing metrics remain null.';
comment on function public.djm_player_scorecard(uuid) is
  'DJM Player Score V2. Current demonstrated football level using competition level, position-adjusted performance, role/minutes, decayed experience, recent trend, availability and a modest position-aware age prior.';

notify pgrst, 'reload schema';
commit;
