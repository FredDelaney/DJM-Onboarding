-- DJM Intelligence Data Layer V1
-- Additive only. This migration creates no benchmark or player score data.

create table if not exists djm_os.competitions (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  display_name text not null,
  country text,
  gender text,
  level_tier smallint,
  aliases text[] not null default '{}'::text[],
  provider_ids jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (level_tier is null or level_tier > 0)
);

create index if not exists djm_os_competitions_country_idx
  on djm_os.competitions(country, active);
create index if not exists djm_os_competitions_aliases_idx
  on djm_os.competitions using gin(aliases);

alter table public.players
  add column if not exists current_competition_id uuid
  references djm_os.competitions(id) on delete set null;
create index if not exists players_current_competition_id_idx
  on public.players(current_competition_id);

alter table public.career_entries
  add column if not exists competition_id uuid
  references djm_os.competitions(id) on delete set null;
create index if not exists career_entries_competition_id_idx
  on public.career_entries(competition_id);

alter table djm_os.league_benchmarks
  add column if not exists competition_id uuid
  references djm_os.competitions(id) on delete restrict,
  add column if not exists review_cadence_days integer not null default 365,
  add column if not exists stale_at timestamptz,
  add column if not exists stale_reason text;
create unique index if not exists djm_os_league_benchmarks_competition_unique
  on djm_os.league_benchmarks(competition_id)
  where competition_id is not null;
create index if not exists djm_os_league_benchmarks_verified_idx
  on djm_os.league_benchmarks(verified_at desc);

alter table djm_os.player_scorecards
  add column if not exists stale_at timestamptz,
  add column if not exists stale_reason text,
  add column if not exists evidence_freshness text not null default 'unknown';

alter table public.player_source_refreshes
  drop constraint if exists player_source_refreshes_source_check;
alter table public.player_source_refreshes
  drop constraint if exists player_source_refreshes_status_check;
alter table public.player_source_refreshes
  add column if not exists provider text,
  add column if not exists mode text not null default 'preview',
  add column if not exists started_at timestamptz,
  add column if not exists facts_discovered integer not null default 0,
  add column if not exists review_required integer not null default 0,
  add column if not exists accepted_count integer not null default 0,
  add column if not exists rejected_count integer not null default 0,
  add column if not exists warning_messages text[] not null default '{}'::text[],
  add column if not exists provider_version text,
  add column if not exists payload_hash text,
  add column if not exists fresh_at timestamptz,
  add column if not exists capability text not null default 'manual_import';
update public.player_source_refreshes
set provider = coalesce(provider, source)
where provider is null;
alter table public.player_source_refreshes
  alter column provider set not null;
alter table public.player_source_refreshes
  add constraint player_source_refreshes_source_check
  check (source in ('wyscout','sportmonks','transfermarkt_reference','manual','other','sofascore_reference')),
  add constraint player_source_refreshes_status_check
  check (status in ('queued','running','fetched','needs_review','reviewed','accepted','rejected','applied','failed','cancelled')),
  add constraint player_source_refreshes_mode_check
  check (mode in ('preview','apply_reviewed','manual_import')),
  add constraint player_source_refreshes_capability_check
  check (capability in ('licensed_api','manual_import','reference_only','disabled'));

alter table public.player_source_suggestions
  drop constraint if exists player_source_suggestions_decision_check;
alter table public.player_source_suggestions
  add column if not exists evidence_id uuid,
  add column if not exists observed_at timestamptz,
  add column if not exists truth_state text not null default 'sourced',
  add column if not exists applied_at timestamptz,
  add constraint player_source_suggestions_decision_check
  check (decision in ('pending','accepted','rejected','kept_current','review_later')),
  add constraint player_source_suggestions_truth_state_check
  check (truth_state in ('verified','direct','sourced','inferred','unknown','contested','stale'));

create table if not exists djm_os.player_evidence (
  id uuid primary key default gen_random_uuid(),
  refresh_id uuid references public.player_source_refreshes(id) on delete set null,
  player_id uuid not null references public.players(id) on delete cascade,
  entity_kind text not null default 'player',
  field_name text not null,
  metric_key text,
  value_json jsonb,
  provider text not null,
  source_name text not null,
  source_url text,
  source_reference text,
  truth_state text not null default 'sourced',
  confidence numeric(4,3),
  observed_at timestamptz,
  fetched_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  valid_from timestamptz,
  valid_to timestamptz,
  freshness_state text not null default 'unknown',
  review_state text not null default 'pending',
  supersedes_id uuid references djm_os.player_evidence(id) on delete set null,
  payload_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (entity_kind in ('player','career_entry','recent_match','profile_fact')),
  check (truth_state in ('verified','direct','sourced','inferred','unknown','contested','stale')),
  check (confidence is null or (confidence >= 0 and confidence <= 1)),
  check (freshness_state in ('fresh','aging','stale','unknown')),
  check (review_state in ('pending','accepted','rejected','kept_current','review_later','superseded'))
);

alter table public.player_source_suggestions
  drop constraint if exists player_source_suggestions_evidence_id_fkey;
alter table public.player_source_suggestions
  add constraint player_source_suggestions_evidence_id_fkey
  foreign key (evidence_id) references djm_os.player_evidence(id) on delete set null;

create index if not exists djm_os_player_evidence_player_review_idx
  on djm_os.player_evidence(player_id, review_state, created_at desc);
create index if not exists djm_os_player_evidence_refresh_idx
  on djm_os.player_evidence(refresh_id);
create index if not exists djm_os_player_evidence_freshness_idx
  on djm_os.player_evidence(freshness_state, observed_at desc);

alter table djm_os.competitions enable row level security;
alter table djm_os.player_evidence enable row level security;

drop policy if exists djm_team_select on djm_os.competitions;
drop policy if exists djm_team_insert on djm_os.competitions;
drop policy if exists djm_team_update on djm_os.competitions;
drop policy if exists djm_team_delete on djm_os.competitions;
create policy djm_team_select on djm_os.competitions
  for select to authenticated using ((select djm_os.is_team_member()));
create policy djm_team_insert on djm_os.competitions
  for insert to authenticated with check ((select djm_os.is_team_member()));
create policy djm_team_update on djm_os.competitions
  for update to authenticated using ((select djm_os.is_team_member()))
  with check ((select djm_os.is_team_member()));
create policy djm_team_delete on djm_os.competitions
  for delete to authenticated using ((select djm_os.is_team_member()));

drop policy if exists djm_team_select on djm_os.player_evidence;
drop policy if exists djm_team_insert on djm_os.player_evidence;
drop policy if exists djm_team_update on djm_os.player_evidence;
drop policy if exists djm_team_delete on djm_os.player_evidence;
create policy djm_team_select on djm_os.player_evidence
  for select to authenticated using ((select djm_os.is_team_member()));
create policy djm_team_insert on djm_os.player_evidence
  for insert to authenticated with check ((select djm_os.is_team_member()));
create policy djm_team_update on djm_os.player_evidence
  for update to authenticated using ((select djm_os.is_team_member()))
  with check ((select djm_os.is_team_member()));
create policy djm_team_delete on djm_os.player_evidence
  for delete to authenticated using ((select djm_os.is_team_member()));

revoke all on table djm_os.competitions from public, anon;
revoke all on table djm_os.player_evidence from public, anon;
grant select, insert, update, delete on table djm_os.competitions to authenticated, service_role;
grant select, insert, update, delete on table djm_os.player_evidence to authenticated, service_role;

create or replace function private.djm_mark_player_score_stale(
  p_player_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer := 0;
  v_actor uuid;
begin
  select case when exists(
    select 1 from djm_os.team_members tm
    where tm.user_id = auth.uid() and tm.is_active
  ) then auth.uid() else null end into v_actor;

  update djm_os.player_scorecards
  set score_status = 'needs_recalculation',
      stale_at = now(),
      stale_reason = p_reason,
      updated_at = now()
  where player_id = p_player_id
    and (model_score is not null or calculated_at is not null)
    and score_status is distinct from 'needs_recalculation';
  get diagnostics v_changed = row_count;

  if v_changed > 0 then
    insert into djm_os.events(
      event_type, actor_user_id, player_id, payload, source, confidence, occurred_at
    ) values (
      'PLAYER_SCORE_BECAME_STALE', v_actor, p_player_id,
      jsonb_build_object('reason', p_reason), 'intelligence_data_layer', 1, now()
    );
  end if;
end;
$$;

create or replace function private.djm_career_score_stale_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

drop trigger if exists djm_career_score_stale on public.career_entries;
create trigger djm_career_score_stale
after insert or update of minutes, appearances, league, country, competition_id, source_reviewed_at
or delete on public.career_entries
for each row execute function private.djm_career_score_stale_trigger();

create or replace function private.djm_player_competition_score_stale_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_competition_id is distinct from old.current_competition_id
     or new.current_league is distinct from old.current_league
     or new.current_country is distinct from old.current_country then
    perform private.djm_mark_player_score_stale(new.id, 'Current competition changed');
  end if;
  return new;
end;
$$;

drop trigger if exists djm_player_competition_score_stale on public.players;
create trigger djm_player_competition_score_stale
after update of current_competition_id, current_league, current_country on public.players
for each row execute function private.djm_player_competition_score_stale_trigger();

create or replace function private.djm_benchmark_score_stale_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

drop trigger if exists djm_benchmark_score_stale on djm_os.league_benchmarks;
create trigger djm_benchmark_score_stale
after insert or update of strength_score, verified_at, competition_id or delete
on djm_os.league_benchmarks
for each row execute function private.djm_benchmark_score_stale_trigger();

revoke all on function private.djm_mark_player_score_stale(uuid,text) from public, anon, authenticated;
revoke all on function private.djm_career_score_stale_trigger() from public, anon, authenticated;
revoke all on function private.djm_player_competition_score_stale_trigger() from public, anon, authenticated;
revoke all on function private.djm_benchmark_score_stale_trigger() from public, anon, authenticated;

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
  v_minutes integer;
  v_appearances integer;
  v_playing_time_score integer;
  v_model smallint;
  v_potential smallint;
  v_confidence smallint := 0;
  v_status text := 'not_enough_playing_time_data';
  v_age integer;
  v_headroom integer := 0;
  v_key text;
  v_basis jsonb;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  select * into p from public.players where id = p_player_id;
  if not found then raise exception 'Player not found'; end if;

  select sum(c.minutes)::int, sum(c.appearances)::int
  into v_minutes, v_appearances
  from public.career_entries c
  where c.player_id = p_player_id
    and c.source_reviewed_at is not null
    and coalesce(c.end_date, c.start_date, current_date) >= current_date - interval '24 months';

  v_key := lower(regexp_replace(
    trim(coalesce(p.current_country,'') || '|' || coalesce(p.current_league,'')),
    '\s+', ' ', 'g'
  ));
  select lb.* into b
  from djm_os.league_benchmarks lb
  left join djm_os.competitions c on c.id = lb.competition_id
  where lb.verified_at is not null
    and (
      lb.competition_id = p.current_competition_id
      or lb.canonical_key = v_key
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
    )
  order by (lb.competition_id = p.current_competition_id) desc
  limit 1;

  if p.date_of_birth is not null then
    v_age := date_part('year', age(current_date, p.date_of_birth))::int;
  end if;

  if v_minutes is not null then
    v_playing_time_score := least(100, round(v_minutes::numeric / 2500 * 100))::int;
  end if;
  v_confidence := least(100, round(
    (case when v_minutes is null then 0 when v_minutes >= 500 then 45 else v_minutes::numeric / 500 * 45 end)
    + (case when b.id is not null then 45 else 0 end)
    + (case when p.verification_status = 'verified' then 10 else 0 end)
  ))::smallint;

  if v_minutes is not null and v_minutes >= 500 and b.id is null then
    v_status := 'not_enough_benchmark_data';
  elsif v_minutes is not null and v_minutes >= 500 and b.id is not null then
    v_model := least(100, greatest(0, round(b.strength_score * .75 + v_playing_time_score * .25)))::smallint;
    v_status := 'calculated';
    if v_age is not null then
      v_headroom := case when v_age <= 19 then 12 when v_age <= 21 then 9 when v_age <= 23 then 6 when v_age <= 25 then 3 else 0 end;
      v_potential := least(100, v_model + v_headroom)::smallint;
    end if;
  end if;

  v_basis := jsonb_build_object(
    'model', 'DJM Player Score v1',
    'status', v_status,
    'recent_minutes_24m', v_minutes,
    'recent_appearances_24m', v_appearances,
    'current_competition_id', p.current_competition_id,
    'current_league', p.current_league,
    'current_country', p.current_country,
    'league_strength_score', b.strength_score,
    'league_benchmark_source_url', b.source_url,
    'league_benchmark_verified_at', b.verified_at,
    'playing_time_score', v_playing_time_score,
    'age', v_age,
    'potential_headroom', v_headroom,
    'evidence_window_months', 24,
    'rules', jsonb_build_array(
      'Minimum 500 verified senior minutes in the previous 24 months',
      'Current competition requires a verified DJM benchmark',
      'Current score is 75% competition benchmark and 25% playing-time signal',
      'Potential remains separate from current score'
    ),
    'calculated_at', now()
  );

  insert into djm_os.player_scorecards(
    player_id, model_score, potential_model_score, score_status, confidence,
    basis, model_version, calculated_at, stale_at, stale_reason,
    evidence_freshness, updated_by
  ) values (
    p_player_id, v_model, v_potential, v_status, v_confidence,
    v_basis, 'djm_player_score_v1', now(), null, null,
    case when v_status = 'calculated' then 'fresh' else 'unknown' end, auth.uid()
  )
  on conflict (player_id) do update set
    model_score = excluded.model_score,
    potential_model_score = excluded.potential_model_score,
    score_status = excluded.score_status,
    confidence = excluded.confidence,
    basis = excluded.basis,
    model_version = excluded.model_version,
    calculated_at = excluded.calculated_at,
    stale_at = null,
    stale_reason = null,
    evidence_freshness = excluded.evidence_freshness,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into s;

  insert into djm_os.events(
    event_type, actor_user_id, player_id, payload, source, confidence, occurred_at
  ) values (
    'PLAYER_SCORE_CALCULATED', auth.uid(), p_player_id,
    jsonb_build_object('status', v_status, 'model_score', v_model, 'model_version', 'djm_player_score_v1'),
    'deterministic_model', v_confidence::numeric / 100, now()
  );

  return jsonb_build_object(
    'player_id', p_player_id,
    'score', coalesce(s.manual_score, s.model_score),
    'model_score', s.model_score,
    'manual_score', s.manual_score,
    'potential_score', coalesce(s.manual_potential_score, s.potential_model_score),
    'potential_model_score', s.potential_model_score,
    'manual_potential_score', s.manual_potential_score,
    'source', case when s.manual_score is not null then 'manual_override' when s.model_score is not null then 'model' else 'insufficient_data' end,
    'status', case when s.manual_score is not null then 'manual_override' else s.score_status end,
    'model_status', s.score_status,
    'confidence', s.confidence,
    'override_reason', s.override_reason,
    'basis', s.basis,
    'model_version', s.model_version,
    'calculated_at', s.calculated_at
  );
end;
$$;

create or replace function public.djm_player_score_override(
  p_player_id uuid,
  p_score smallint default null,
  p_potential_score smallint default null,
  p_reason text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_removing boolean := p_score is null and p_potential_score is null;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if not exists(select 1 from public.players where id = p_player_id) then raise exception 'Player not found'; end if;
  if p_score is not null and (p_score < 0 or p_score > 100) then raise exception 'Player score must be between 0 and 100'; end if;
  if p_potential_score is not null and (p_potential_score < 0 or p_potential_score > 100) then raise exception 'Potential score must be between 0 and 100'; end if;
  if not v_removing and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Add a reason for the manual override'; end if;

  insert into djm_os.player_scorecards(
    player_id, manual_score, manual_potential_score, override_reason, updated_by
  ) values (
    p_player_id, p_score, p_potential_score,
    case when v_removing then null else trim(p_reason) end, auth.uid()
  )
  on conflict (player_id) do update set
    manual_score = excluded.manual_score,
    manual_potential_score = excluded.manual_potential_score,
    override_reason = excluded.override_reason,
    updated_by = auth.uid(),
    updated_at = now();

  insert into djm_os.events(event_type, actor_user_id, player_id, payload, source, confidence, occurred_at)
  values(
    case when v_removing then 'PLAYER_SCORE_OVERRIDE_REMOVED' else 'PLAYER_SCORE_OVERRIDE_UPDATED' end,
    auth.uid(), p_player_id,
    jsonb_build_object('manual_score', p_score, 'manual_potential_score', p_potential_score, 'reason', case when v_removing then null else trim(p_reason) end),
    'manual_ui', 1, now()
  );

  return public.djm_player_scorecard(p_player_id);
end;
$$;

create or replace function public.djm_intelligence_benchmark_upsert(
  p_id uuid default null,
  p_competition_id uuid default null,
  p_display_name text default null,
  p_country text default null,
  p_gender text default null,
  p_level_tier smallint default null,
  p_aliases text[] default '{}'::text[],
  p_provider_ids jsonb default '{}'::jsonb,
  p_strength_score smallint default null,
  p_source_url text default null,
  p_source_note text default null,
  p_verified_at timestamptz default now(),
  p_review_cadence_days integer default 365
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_competition_id uuid := p_competition_id;
  v_benchmark_id uuid;
  v_key text;
  v_event text;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if nullif(trim(coalesce(p_display_name,'')),'') is null then raise exception 'Competition name is required'; end if;
  if p_strength_score is null or p_strength_score < 0 or p_strength_score > 100 then raise exception 'Strength score must be between 0 and 100'; end if;
  if nullif(trim(coalesce(p_source_url,'')),'') is null and nullif(trim(coalesce(p_source_note,'')),'') is null then
    raise exception 'Add a benchmark source URL or evidence note';
  end if;
  if p_verified_at is null then raise exception 'Verification date is required'; end if;
  if p_review_cadence_days < 30 or p_review_cadence_days > 1095 then raise exception 'Review cadence must be between 30 and 1095 days'; end if;

  v_key := lower(regexp_replace(trim(coalesce(p_country,'') || '|' || p_display_name), '\s+', ' ', 'g'));
  if v_competition_id is null then
    insert into djm_os.competitions(
      canonical_key, display_name, country, gender, level_tier,
      aliases, provider_ids, created_by, updated_by
    ) values (
      v_key, trim(p_display_name), nullif(trim(coalesce(p_country,'')),''),
      nullif(trim(coalesce(p_gender,'')),''), p_level_tier,
      coalesce(p_aliases,'{}'::text[]), coalesce(p_provider_ids,'{}'::jsonb), auth.uid(), auth.uid()
    )
    on conflict (canonical_key) do update set
      display_name = excluded.display_name,
      country = excluded.country,
      gender = excluded.gender,
      level_tier = excluded.level_tier,
      aliases = excluded.aliases,
      provider_ids = excluded.provider_ids,
      updated_by = auth.uid(),
      updated_at = now()
    returning id into v_competition_id;
  else
    update djm_os.competitions set
      display_name = trim(p_display_name),
      country = nullif(trim(coalesce(p_country,'')),''),
      gender = nullif(trim(coalesce(p_gender,'')),''),
      level_tier = p_level_tier,
      aliases = coalesce(p_aliases,'{}'::text[]),
      provider_ids = coalesce(p_provider_ids,'{}'::jsonb),
      updated_by = auth.uid(),
      updated_at = now()
    where id = v_competition_id;
    select canonical_key into v_key from djm_os.competitions where id = v_competition_id;
  end if;

  v_event := case when p_id is null then 'BENCHMARK_CREATED' else 'BENCHMARK_CHANGED' end;
  insert into djm_os.league_benchmarks(
    id, competition_id, canonical_key, league_name, country, strength_score,
    source_url, source_note, verified_at, review_cadence_days, stale_at,
    stale_reason, updated_by
  ) values (
    coalesce(p_id, gen_random_uuid()), v_competition_id, v_key,
    trim(p_display_name), nullif(trim(coalesce(p_country,'')),''), p_strength_score,
    nullif(trim(coalesce(p_source_url,'')),''), nullif(trim(coalesce(p_source_note,'')),''),
    p_verified_at, p_review_cadence_days, null, null, auth.uid()
  )
  on conflict (id) do update set
    competition_id = excluded.competition_id,
    canonical_key = excluded.canonical_key,
    league_name = excluded.league_name,
    country = excluded.country,
    strength_score = excluded.strength_score,
    source_url = excluded.source_url,
    source_note = excluded.source_note,
    verified_at = excluded.verified_at,
    review_cadence_days = excluded.review_cadence_days,
    stale_at = null,
    stale_reason = null,
    updated_by = auth.uid(),
    updated_at = now()
  returning id into v_benchmark_id;

  insert into djm_os.events(event_type, actor_user_id, payload, source, confidence, occurred_at)
  values(v_event, auth.uid(), jsonb_build_object(
    'benchmark_id', v_benchmark_id, 'competition_id', v_competition_id,
    'strength_score', p_strength_score, 'verified_at', p_verified_at
  ), 'manual_ui', 1, now());

  return jsonb_build_object('id', v_benchmark_id, 'competition_id', v_competition_id, 'canonical_key', v_key);
end;
$$;

create or replace function public.djm_intelligence_benchmark_delete(p_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_competition_id uuid;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  delete from djm_os.league_benchmarks where id = p_id returning competition_id into v_competition_id;
  if not found then raise exception 'Benchmark not found'; end if;
  insert into djm_os.events(event_type, actor_user_id, payload, source, confidence, occurred_at)
  values('BENCHMARK_REMOVED', auth.uid(), jsonb_build_object('benchmark_id', p_id, 'competition_id', v_competition_id), 'manual_ui', 1, now());
  return true;
end;
$$;

create or replace function public.djm_intelligence_manual_import(
  p_player_id uuid,
  p_source_name text,
  p_source_url text default null,
  p_records jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_record jsonb;
  v_current jsonb;
  v_evidence_id uuid;
  v_count integer := 0;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if not exists(select 1 from public.players where id = p_player_id) then raise exception 'Player not found'; end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then raise exception 'Add at least one season record'; end if;
  if nullif(trim(coalesce(p_source_name,'')),'') is null then raise exception 'Source name is required'; end if;

  insert into public.player_source_refreshes(
    player_id, source, provider, source_url, status, requested_by,
    requested_at, started_at, completed_at, mode, capability,
    provider_version, payload_hash, fresh_at
  ) values (
    p_player_id, 'manual', 'manual', nullif(trim(coalesce(p_source_url,'')),''),
    'running', auth.uid(), now(), now(), null, 'manual_import', 'manual_import',
    'manual-v1', md5(p_records::text), now()
  ) returning id into v_run_id;

  insert into djm_os.events(event_type, actor_user_id, player_id, payload, source, confidence, occurred_at)
  values('SOURCE_REFRESH_REQUESTED', auth.uid(), p_player_id,
    jsonb_build_object('run_id', v_run_id, 'provider', 'manual', 'mode', 'manual_import'),
    'manual_import', 1, now());

  for v_record in select value from jsonb_array_elements(p_records)
  loop
    if nullif(trim(coalesce(v_record->>'club_name','')),'') is null then
      raise exception 'Every imported season requires a club name';
    end if;
    select to_jsonb(c) into v_current
    from public.career_entries c
    where c.player_id = p_player_id
      and lower(coalesce(c.season_label,'')) = lower(coalesce(v_record->>'season_label',''))
      and lower(c.club_name) = lower(v_record->>'club_name')
    order by c.updated_at desc limit 1;

    insert into djm_os.player_evidence(
      refresh_id, player_id, entity_kind, field_name, value_json, provider,
      source_name, source_url, source_reference, truth_state, confidence,
      observed_at, fetched_at, freshness_state, review_state, payload_hash, metadata
    ) values (
      v_run_id, p_player_id, 'career_entry', 'career_entry', v_record, 'manual',
      trim(p_source_name), nullif(trim(coalesce(p_source_url,'')),''),
      coalesce(v_record->>'season_label','season record'), 'sourced', 1,
      now(), now(), 'fresh', 'pending', md5(v_record::text),
      jsonb_build_object('retention', 'normalised_only')
    ) returning id into v_evidence_id;

    insert into public.player_source_suggestions(
      refresh_id, player_id, field_name, current_value, suggested_value,
      confidence, source_evidence, decision, evidence_id, observed_at, truth_state
    ) values (
      v_run_id, p_player_id, 'career_entry', v_current, v_record,
      1, jsonb_build_object('source_name', trim(p_source_name), 'source_url', nullif(trim(coalesce(p_source_url,'')),'')),
      'pending', v_evidence_id, now(), 'sourced'
    );
    v_count := v_count + 1;
  end loop;

  update public.player_source_refreshes set
    status = 'needs_review',
    completed_at = now(),
    facts_discovered = v_count,
    review_required = v_count,
    summary = jsonb_build_object('season_records', v_count, 'raw_payload_retained', false),
    updated_at = now()
  where id = v_run_id;

  insert into djm_os.events(event_type, actor_user_id, player_id, payload, source, confidence, occurred_at)
  values('SOURCE_REFRESH_COMPLETED', auth.uid(), p_player_id,
    jsonb_build_object('run_id', v_run_id, 'facts_discovered', v_count, 'review_required', v_count),
    'manual_import', 1, now());

  return jsonb_build_object('run_id', v_run_id, 'facts_discovered', v_count, 'status', 'needs_review');
exception when others then
  if v_run_id is not null then
    insert into public.player_source_refreshes(
      id, player_id, source, provider, source_url, status, requested_by,
      requested_at, started_at, completed_at, mode, capability,
      facts_discovered, review_required, provider_version, payload_hash,
      fresh_at, error_text
    ) values (
      v_run_id, p_player_id, 'manual', 'manual', nullif(trim(coalesce(p_source_url,'')),''),
      'failed', auth.uid(), now(), now(), now(), 'manual_import', 'manual_import',
      0, 0, 'manual-v1', md5(coalesce(p_records,'[]'::jsonb)::text), now(), sqlerrm
    )
    on conflict (id) do update set
      status = 'failed', completed_at = now(), error_text = sqlerrm, updated_at = now();
    insert into djm_os.events(event_type, actor_user_id, player_id, payload, source, confidence, occurred_at)
    values('SOURCE_REFRESH_FAILED', auth.uid(), p_player_id, jsonb_build_object('run_id', v_run_id, 'error', sqlerrm), 'manual_import', 1, now());
  end if;
  return jsonb_build_object(
    'run_id', v_run_id,
    'status', 'failed',
    'error', sqlerrm,
    'facts_discovered', 0
  );
end;
$$;

create or replace function public.djm_intelligence_review_suggestion(
  p_suggestion_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_suggestion public.player_source_suggestions%rowtype;
  v_value jsonb;
  v_career_id uuid;
  v_pending integer;
  v_accepted integer;
  v_rejected integer;
  v_run_status text;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_decision not in ('accepted','rejected','kept_current','review_later') then raise exception 'Invalid review decision'; end if;
  select * into v_suggestion from public.player_source_suggestions where id = p_suggestion_id for update;
  if not found then raise exception 'Suggestion not found'; end if;
  if v_suggestion.decision not in ('pending','review_later') then raise exception 'Suggestion has already been reviewed'; end if;

  v_value := v_suggestion.suggested_value;
  if p_decision = 'accepted' and v_suggestion.field_name = 'career_entry' then
    select c.id into v_career_id
    from public.career_entries c
    where c.player_id = v_suggestion.player_id
      and lower(coalesce(c.season_label,'')) = lower(coalesce(v_value->>'season_label',''))
      and lower(c.club_name) = lower(v_value->>'club_name')
    order by c.updated_at desc limit 1;

    if v_career_id is null then
      insert into public.career_entries(
        player_id, club_name, league, country, season_label,
        appearances, starts, minutes, goals, assists,
        source_name, source_url, source_reviewed_at
      ) values (
        v_suggestion.player_id, v_value->>'club_name', nullif(v_value->>'league',''),
        nullif(v_value->>'country',''), nullif(v_value->>'season_label',''),
        nullif(v_value->>'appearances','')::integer, nullif(v_value->>'starts','')::integer,
        nullif(v_value->>'minutes','')::integer, nullif(v_value->>'goals','')::integer,
        nullif(v_value->>'assists','')::integer,
        coalesce(nullif(v_value->>'source_name',''), v_suggestion.source_evidence->>'source_name', 'Manual import'),
        coalesce(nullif(v_value->>'source_url',''), v_suggestion.source_evidence->>'source_url'), now()
      ) returning id into v_career_id;
    else
      update public.career_entries set
        league = case when v_value->'league' <> 'null'::jsonb then nullif(v_value->>'league','') else league end,
        country = case when v_value->'country' <> 'null'::jsonb then nullif(v_value->>'country','') else country end,
        appearances = case when v_value->'appearances' <> 'null'::jsonb then nullif(v_value->>'appearances','')::integer else appearances end,
        starts = case when v_value->'starts' <> 'null'::jsonb then nullif(v_value->>'starts','')::integer else starts end,
        minutes = case when v_value->'minutes' <> 'null'::jsonb then nullif(v_value->>'minutes','')::integer else minutes end,
        goals = case when v_value->'goals' <> 'null'::jsonb then nullif(v_value->>'goals','')::integer else goals end,
        assists = case when v_value->'assists' <> 'null'::jsonb then nullif(v_value->>'assists','')::integer else assists end,
        source_name = coalesce(nullif(v_value->>'source_name',''), v_suggestion.source_evidence->>'source_name', source_name),
        source_url = coalesce(nullif(v_value->>'source_url',''), v_suggestion.source_evidence->>'source_url', source_url),
        source_reviewed_at = now(),
        updated_at = now()
      where id = v_career_id;
    end if;
  end if;

  update public.player_source_suggestions set
    decision = p_decision,
    reviewed_by = case when p_decision = 'review_later' then null else auth.uid() end,
    reviewed_at = case when p_decision = 'review_later' then null else now() end,
    applied_at = case when p_decision = 'accepted' then now() else null end
  where id = p_suggestion_id;

  update djm_os.player_evidence set
    review_state = p_decision,
    truth_state = case when p_decision = 'accepted' then 'verified' when p_decision in ('rejected','kept_current') then truth_state else truth_state end,
    verified_at = case when p_decision in ('accepted','rejected','kept_current') then now() else null end,
    verified_by = case when p_decision in ('accepted','rejected','kept_current') then auth.uid() else null end,
    updated_at = now()
  where id = v_suggestion.evidence_id;

  select
    count(*) filter (where decision in ('pending','review_later')),
    count(*) filter (where decision = 'accepted'),
    count(*) filter (where decision in ('rejected','kept_current'))
  into v_pending, v_accepted, v_rejected
  from public.player_source_suggestions where refresh_id = v_suggestion.refresh_id;
  v_run_status := case when v_pending > 0 then 'needs_review' when v_accepted > 0 then 'applied' else 'rejected' end;
  update public.player_source_refreshes set
    status = v_run_status,
    review_required = v_pending,
    accepted_count = v_accepted,
    rejected_count = v_rejected,
    updated_at = now()
  where id = v_suggestion.refresh_id;

  insert into djm_os.events(event_type, actor_user_id, player_id, payload, source, confidence, occurred_at)
  values(
    case when p_decision = 'accepted' then 'EVIDENCE_ACCEPTED' else 'EVIDENCE_REVIEWED' end,
    auth.uid(), v_suggestion.player_id,
    jsonb_build_object('suggestion_id', p_suggestion_id, 'evidence_id', v_suggestion.evidence_id, 'decision', p_decision, 'career_entry_id', v_career_id),
    'manual_review', coalesce(v_suggestion.confidence, 1), now()
  );
  if p_decision = 'accepted' then
    insert into djm_os.events(event_type, actor_user_id, player_id, payload, source, confidence, occurred_at)
    values('CANONICAL_PLAYER_FACT_CHANGED', auth.uid(), v_suggestion.player_id,
      jsonb_build_object('field_name', v_suggestion.field_name, 'career_entry_id', v_career_id, 'suggestion_id', p_suggestion_id),
      'reviewed_evidence', coalesce(v_suggestion.confidence, 1), now());
    perform public.djm_player_scorecard(v_suggestion.player_id);
  end if;

  return jsonb_build_object('suggestion_id', p_suggestion_id, 'decision', p_decision, 'run_status', v_run_status, 'career_entry_id', v_career_id);
end;
$$;

create or replace function public.djm_intelligence_data()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with verified_minutes as (
    select ce.player_id, sum(ce.minutes)::integer as minutes_24m,
      max(ce.source_reviewed_at) as latest_verified_at
    from public.career_entries ce
    where ce.source_reviewed_at is not null
      and coalesce(ce.end_date, ce.start_date, current_date) >= current_date - interval '24 months'
    group by ce.player_id
  ), player_state as (
    select p.id,
      trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) as player_name,
      p.current_club, p.current_league, p.current_country, p.current_competition_id,
      p.transfermarkt_url, p.wyscout_url, p.stats_url, p.updated_at,
      (select coalesce(jsonb_agg(to_jsonb(ce) order by ce.sort_order, ce.start_date desc nulls last), '[]'::jsonb)
       from public.career_entries ce where ce.player_id = p.id) as career_entries,
      vm.minutes_24m, vm.latest_verified_at,
      lb.id as benchmark_id, lb.strength_score, lb.verified_at as benchmark_verified_at,
      ps.model_score, ps.manual_score, ps.score_status, ps.confidence,
      ps.basis, ps.model_version, ps.calculated_at, ps.stale_at, ps.stale_reason, ps.override_reason
    from public.players p
    left join verified_minutes vm on vm.player_id = p.id
    left join lateral (
      select benchmark.*
      from djm_os.league_benchmarks benchmark
      left join djm_os.competitions competition on competition.id = benchmark.competition_id
      where benchmark.verified_at is not null and (
        benchmark.competition_id = p.current_competition_id
        or benchmark.canonical_key = lower(regexp_replace(trim(coalesce(p.current_country,'') || '|' || coalesce(p.current_league,'')), '\s+', ' ', 'g'))
        or (
          (competition.country is null or lower(competition.country) = lower(coalesce(p.current_country,'')))
          and (
            lower(competition.display_name) = lower(coalesce(p.current_league,''))
            or exists (
              select 1 from unnest(competition.aliases) alias_name
              where lower(alias_name) = lower(coalesce(p.current_league,''))
            )
          )
        )
      )
      order by (benchmark.competition_id = p.current_competition_id) desc
      limit 1
    ) lb on true
    left join djm_os.player_scorecards ps on ps.player_id = p.id
  ), gaps as (
    select 100 as priority, psu.player_id, p.player_name,
      'Incoming source suggestion awaiting review'::text as missing,
      'External evidence cannot become DJM truth before review.'::text as why,
      'Verified career evidence and downstream intelligence'::text as blocks,
      'Review the incoming evidence'::text as action
    from public.player_source_suggestions psu join player_state p on p.id = psu.player_id
    where psu.decision in ('pending','review_later')
    union all
    select 90, p.id, p.player_name, 'Current competition has no verified benchmark',
      'The player has enough verified recent minutes, but DJM cannot support a level score.',
      'Player Score', 'Create and verify the competition benchmark'
    from player_state p where p.minutes_24m >= 500 and p.benchmark_id is null
    union all
    select 85, p.id, p.player_name, coalesce(p.stale_reason,'Player Score needs recalculation'),
      'Evidence changed after the last model calculation.', 'Current Player Score', 'Recalculate the Player Score'
    from player_state p where p.score_status = 'needs_recalculation' or p.stale_at is not null
    union all
    select 70, p.id, p.player_name, 'Not enough verified recent playing-time data',
      'Fewer than 500 verified senior minutes are recorded in the previous 24 months.',
      'Player Score', 'Import or verify recent season evidence'
    from player_state p where p.minutes_24m is null or p.minutes_24m < 500
    union all
    select 55, p.id, p.player_name, 'No football source links',
      'Staff has no direct route to supporting external evidence.',
      'Faster verification', 'Add a Wyscout, Transfermarkt or statistics reference'
    from player_state p where p.transfermarkt_url is null and p.wyscout_url is null and p.stats_url is null
  )
  select case when not djm_os.is_team_member() then
    (select jsonb_build_object('error','DJM team access required'))
  else jsonb_build_object(
    'metrics', jsonb_build_object(
      'players', (select count(*) from player_state),
      'players_with_source_links', (select count(*) from player_state where transfermarkt_url is not null or wyscout_url is not null or stats_url is not null),
      'players_with_verified_career', (select count(*) from player_state where latest_verified_at is not null),
      'players_eligible_for_score', (select count(*) from player_state where minutes_24m >= 500 and benchmark_id is not null),
      'blocked_missing_benchmark', (select count(*) from player_state where minutes_24m >= 500 and benchmark_id is null),
      'blocked_insufficient_minutes', (select count(*) from player_state where minutes_24m is null or minutes_24m < 500),
      'stale_scores', (select count(*) from player_state where score_status = 'needs_recalculation' or stale_at is not null),
      'unresolved_suggestions', (select count(*) from public.player_source_suggestions where decision in ('pending','review_later')),
      'competitions_without_benchmark', (select count(*) from djm_os.competitions c where c.active and not exists(select 1 from djm_os.league_benchmarks lb where lb.competition_id = c.id and lb.verified_at is not null)),
      'recent_ingestion_failures', (select count(*) from public.player_source_refreshes where status = 'failed' and requested_at >= now() - interval '30 days')
    ),
    'players', coalesce((select jsonb_agg(to_jsonb(p) order by p.player_name) from player_state p), '[]'::jsonb),
    'benchmarks', coalesce((select jsonb_agg(to_jsonb(x) order by x.league_name) from (
      select lb.*, c.display_name, c.gender, c.level_tier, c.aliases, c.provider_ids,
        tm.display_name as updated_by_name,
        case when lb.verified_at is null then 'unknown'
             when lb.verified_at + make_interval(days => lb.review_cadence_days) < now() then 'stale'
             when lb.verified_at + make_interval(days => round(lb.review_cadence_days * .65)::integer) < now() then 'aging'
             else 'fresh' end as freshness
      from djm_os.league_benchmarks lb
      left join djm_os.competitions c on c.id = lb.competition_id
      left join djm_os.team_members tm on tm.user_id = lb.updated_by
    ) x), '[]'::jsonb),
    'competitions', coalesce((select jsonb_agg(to_jsonb(c) order by c.display_name) from djm_os.competitions c), '[]'::jsonb),
    'gaps', coalesce((select jsonb_agg(to_jsonb(g) order by g.priority desc, g.player_name) from (select * from gaps limit 100) g), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r.requested_at desc) from (
      select pr.*, trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) as player_name
      from public.player_source_refreshes pr join public.players p on p.id = pr.player_id
      order by pr.requested_at desc limit 50
    ) r), '[]'::jsonb),
    'suggestions', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from (
      select ps.*, trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) as player_name,
        pe.source_name, pe.source_url, pe.observed_at as evidence_observed_at, pe.freshness_state
      from public.player_source_suggestions ps
      join public.players p on p.id = ps.player_id
      left join djm_os.player_evidence pe on pe.id = ps.evidence_id
      where ps.decision in ('pending','review_later')
      order by ps.created_at desc limit 100
    ) s), '[]'::jsonb)
  ) end;
$$;

create or replace function public.djm_intelligence_player(p_player_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when not djm_os.is_team_member() then
    jsonb_build_object('error','DJM team access required')
  else jsonb_build_object(
    'scorecard', (select to_jsonb(ps) from djm_os.player_scorecards ps where ps.player_id = p_player_id),
    'evidence', coalesce((select jsonb_agg(to_jsonb(pe) order by pe.created_at desc) from (
      select * from djm_os.player_evidence where player_id = p_player_id order by created_at desc limit 50
    ) pe), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(to_jsonb(pr) order by pr.requested_at desc) from (
      select * from public.player_source_refreshes where player_id = p_player_id order by requested_at desc limit 20
    ) pr), '[]'::jsonb),
    'suggestions', coalesce((select jsonb_agg(to_jsonb(ps) order by ps.created_at desc) from (
      select * from public.player_source_suggestions
      where player_id = p_player_id and decision in ('pending','review_later')
      order by created_at desc limit 30
    ) ps), '[]'::jsonb)
  ) end;
$$;

-- Automated Transfermarkt queueing is disabled. Links and reviewed manual evidence remain supported.
drop trigger if exists scouting_prospects_transfermarkt_autoqueue on djm_os.scouting_prospects;

revoke all on function public.djm_player_scorecard(uuid) from public, anon;
revoke all on function public.djm_player_score_override(uuid,smallint,smallint,text) from public, anon;
revoke all on function public.djm_intelligence_benchmark_upsert(uuid,uuid,text,text,text,smallint,text[],jsonb,smallint,text,text,timestamptz,integer) from public, anon;
revoke all on function public.djm_intelligence_benchmark_delete(uuid) from public, anon;
revoke all on function public.djm_intelligence_manual_import(uuid,text,text,jsonb) from public, anon;
revoke all on function public.djm_intelligence_review_suggestion(uuid,text) from public, anon;
revoke all on function public.djm_intelligence_data() from public, anon;
revoke all on function public.djm_intelligence_player(uuid) from public, anon;

grant execute on function public.djm_player_scorecard(uuid) to authenticated, service_role;
grant execute on function public.djm_player_score_override(uuid,smallint,smallint,text) to authenticated, service_role;
grant execute on function public.djm_intelligence_benchmark_upsert(uuid,uuid,text,text,text,smallint,text[],jsonb,smallint,text,text,timestamptz,integer) to authenticated, service_role;
grant execute on function public.djm_intelligence_benchmark_delete(uuid) to authenticated, service_role;
grant execute on function public.djm_intelligence_manual_import(uuid,text,text,jsonb) to authenticated, service_role;
grant execute on function public.djm_intelligence_review_suggestion(uuid,text) to authenticated, service_role;
grant execute on function public.djm_intelligence_data() to authenticated, service_role;
grant execute on function public.djm_intelligence_player(uuid) to authenticated, service_role;

comment on table djm_os.player_evidence is
  'Staff-only provenance ledger. External values are evidence until an explicit review applies them to DJM canonical records.';
comment on table djm_os.competitions is
  'Canonical competition identity and aliases. Competition identity never implies a strength score.';
comment on function public.djm_intelligence_manual_import(uuid,text,text,jsonb) is
  'Creates reviewed evidence suggestions from authorised manual season data without directly changing canonical records.';

notify pgrst, 'reload schema';
