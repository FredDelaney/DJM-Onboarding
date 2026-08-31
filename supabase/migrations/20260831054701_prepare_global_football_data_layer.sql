-- Non-destructive preparation for global football API ingestion, scoring, similarity and projections.

-- 1) Strengthen provenance on existing provider snapshot tables.
alter table djm_os.player_provider_stat_snapshots
  add column if not exists metric_schema_version text not null default 'djm_metrics_v1',
  add column if not exists data_depth text not null default 'unknown',
  add column if not exists confidence numeric,
  add column if not exists payload_hash text,
  add column if not exists request_metadata jsonb not null default '{}'::jsonb,
  add column if not exists raw_payload_retention text not null default 'normalised_only';

alter table djm_os.provider_peer_stat_snapshots
  add column if not exists metric_schema_version text not null default 'djm_metrics_v1',
  add column if not exists data_depth text not null default 'unknown',
  add column if not exists confidence numeric,
  add column if not exists payload_hash text,
  add column if not exists request_metadata jsonb not null default '{}'::jsonb,
  add column if not exists raw_payload_retention text not null default 'normalised_only';

alter table djm_os.player_provider_stat_snapshots
  add constraint player_provider_stat_snapshots_confidence_check
  check (confidence is null or (confidence >= 0 and confidence <= 1));

alter table djm_os.provider_peer_stat_snapshots
  add constraint provider_peer_stat_snapshots_confidence_check
  check (confidence is null or (confidence >= 0 and confidence <= 1));

create index if not exists player_provider_stat_snapshots_provider_competition_idx
  on djm_os.player_provider_stat_snapshots(provider, provider_competition_id, provider_season_id, synced_at desc);

-- 2) Canonical football teams. Provider IDs remain adapters, never DJM primary identity.
create table djm_os.football_teams (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  display_name text not null,
  short_name text,
  country text,
  gender text,
  provider_ids jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index football_teams_country_name_idx
  on djm_os.football_teams(country, display_name);
create index football_teams_provider_ids_idx
  on djm_os.football_teams using gin(provider_ids);

-- 3) Canonical fixtures/matches. This is intentionally separate from djm_os.player_matches,
-- which is the club-need/player matching table.
create table djm_os.football_fixtures (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  competition_id uuid references djm_os.competitions(id) on delete set null,
  season_label text,
  match_date date not null,
  kickoff_at timestamptz,
  status text not null default 'scheduled',
  home_team_id uuid references djm_os.football_teams(id) on delete set null,
  away_team_id uuid references djm_os.football_teams(id) on delete set null,
  home_team_name text,
  away_team_name text,
  home_score integer,
  away_score integer,
  venue text,
  provider_ids jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint football_fixtures_home_score_check check (home_score is null or home_score >= 0),
  constraint football_fixtures_away_score_check check (away_score is null or away_score >= 0)
);

create index football_fixtures_competition_date_idx
  on djm_os.football_fixtures(competition_id, match_date desc);
create index football_fixtures_home_team_date_idx
  on djm_os.football_fixtures(home_team_id, match_date desc);
create index football_fixtures_away_team_date_idx
  on djm_os.football_fixtures(away_team_id, match_date desc);
create index football_fixtures_provider_ids_idx
  on djm_os.football_fixtures using gin(provider_ids);

-- 4) Match-by-match player observations. Missing provider metrics stay NULL/absent in metrics,
-- never coerced to zero. This powers form, trajectories, model training and auditability.
create table djm_os.player_match_stat_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  fixture_id uuid references djm_os.football_fixtures(id) on delete set null,
  competition_id uuid references djm_os.competitions(id) on delete set null,
  team_id uuid references djm_os.football_teams(id) on delete set null,
  opponent_team_id uuid references djm_os.football_teams(id) on delete set null,
  provider text not null,
  provider_player_id text not null,
  provider_match_id text not null,
  provider_team_id text,
  provider_opponent_id text,
  provider_competition_id text,
  provider_season_id text,
  season_label text,
  match_date date not null,
  kickoff_at timestamptz,
  team_name text,
  opponent_name text,
  home_away text,
  position_group text,
  provider_position text,
  started boolean,
  minutes integer,
  metrics jsonb not null default '{}'::jsonb,
  metric_schema_version text not null default 'djm_match_metrics_v1',
  data_depth text not null default 'basic',
  confidence numeric,
  observed_at timestamptz not null,
  synced_at timestamptz not null default now(),
  payload_hash text,
  request_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_match_stat_snapshots_home_away_check check (home_away is null or home_away in ('home','away','neutral')),
  constraint player_match_stat_snapshots_minutes_check check (minutes is null or (minutes >= 0 and minutes <= 180)),
  constraint player_match_stat_snapshots_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint player_match_stat_snapshots_provider_match_player_unique unique(provider, provider_match_id, provider_player_id)
);

create index player_match_stat_snapshots_player_date_idx
  on djm_os.player_match_stat_snapshots(player_id, match_date desc);
create index player_match_stat_snapshots_competition_date_idx
  on djm_os.player_match_stat_snapshots(competition_id, match_date desc);
create index player_match_stat_snapshots_provider_competition_idx
  on djm_os.player_match_stat_snapshots(provider, provider_competition_id, provider_season_id, match_date desc);
create index player_match_stat_snapshots_metrics_idx
  on djm_os.player_match_stat_snapshots using gin(metrics);

-- 5) Provider-neutral, canonical model inputs. All scoring/comparison/potential models should
-- read this layer instead of binding directly to API-Football or any future provider.
create table djm_os.player_canonical_stat_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  competition_id uuid references djm_os.competitions(id) on delete set null,
  season_label text,
  window_type text not null,
  window_start date,
  window_end date,
  as_of_date date not null,
  position_group text,
  appearances integer,
  starts integer,
  minutes integer,
  metrics jsonb not null default '{}'::jsonb,
  metric_schema_version text not null default 'djm_metrics_v1',
  feature_schema_version text not null default 'djm_features_v1',
  source_providers text[] not null default '{}'::text[],
  provenance jsonb not null default '{}'::jsonb,
  coverage jsonb not null default '{}'::jsonb,
  data_coverage smallint,
  confidence numeric,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_canonical_stat_snapshots_apps_check check (appearances is null or appearances >= 0),
  constraint player_canonical_stat_snapshots_starts_check check (starts is null or starts >= 0),
  constraint player_canonical_stat_snapshots_minutes_check check (minutes is null or minutes >= 0),
  constraint player_canonical_stat_snapshots_coverage_check check (data_coverage is null or (data_coverage >= 0 and data_coverage <= 100)),
  constraint player_canonical_stat_snapshots_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create unique index player_canonical_stat_snapshots_unique_window
  on djm_os.player_canonical_stat_snapshots(
    player_id, competition_id, season_label, window_type, as_of_date, position_group, metric_schema_version
  ) nulls not distinct;
create index player_canonical_stat_snapshots_player_asof_idx
  on djm_os.player_canonical_stat_snapshots(player_id, as_of_date desc);
create index player_canonical_stat_snapshots_competition_position_idx
  on djm_os.player_canonical_stat_snapshots(competition_id, position_group, as_of_date desc);
create index player_canonical_stat_snapshots_metrics_idx
  on djm_os.player_canonical_stat_snapshots using gin(metrics);

-- 6) Historical five-year potential/projection outputs. Keep every model run for calibration.
create table djm_os.player_projection_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  input_snapshot_id uuid references djm_os.player_canonical_stat_snapshots(id) on delete set null,
  as_of_date date not null,
  horizon_years smallint not null default 5,
  current_ability_score smallint,
  potential_score smallint,
  expected_peak_score smallint,
  lower_bound_score smallint,
  upper_bound_score smallint,
  confidence smallint not null default 0,
  probabilities jsonb not null default '{}'::jsonb,
  drivers jsonb not null default '{}'::jsonb,
  input_summary jsonb not null default '{}'::jsonb,
  model_version text not null,
  methodology_version text not null,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint player_projection_snapshots_horizon_check check (horizon_years between 1 and 10),
  constraint player_projection_snapshots_current_check check (current_ability_score is null or current_ability_score between 0 and 100),
  constraint player_projection_snapshots_potential_check check (potential_score is null or potential_score between 0 and 100),
  constraint player_projection_snapshots_peak_check check (expected_peak_score is null or expected_peak_score between 0 and 100),
  constraint player_projection_snapshots_lower_check check (lower_bound_score is null or lower_bound_score between 0 and 100),
  constraint player_projection_snapshots_upper_check check (upper_bound_score is null or upper_bound_score between 0 and 100),
  constraint player_projection_snapshots_confidence_check check (confidence between 0 and 100),
  constraint player_projection_snapshots_bounds_check check (lower_bound_score is null or upper_bound_score is null or lower_bound_score <= upper_bound_score)
);

create unique index player_projection_snapshots_unique_model_run
  on djm_os.player_projection_snapshots(player_id, as_of_date, horizon_years, model_version);
create index player_projection_snapshots_player_date_idx
  on djm_os.player_projection_snapshots(player_id, as_of_date desc);

-- 7) Cached comparison/similarity outputs. Useful at global scale without recomputing every pair.
create table djm_os.player_similarity_snapshots (
  id uuid primary key default gen_random_uuid(),
  query_player_id uuid not null references public.players(id) on delete cascade,
  candidate_player_id uuid not null references public.players(id) on delete cascade,
  query_snapshot_id uuid references djm_os.player_canonical_stat_snapshots(id) on delete set null,
  candidate_snapshot_id uuid references djm_os.player_canonical_stat_snapshots(id) on delete set null,
  as_of_date date not null,
  position_group text,
  similarity_score numeric not null,
  confidence smallint not null default 0,
  model_version text not null,
  feature_schema_version text not null default 'djm_features_v1',
  basis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint player_similarity_snapshots_score_check check (similarity_score >= 0 and similarity_score <= 100),
  constraint player_similarity_snapshots_confidence_check check (confidence between 0 and 100),
  constraint player_similarity_snapshots_distinct_players_check check (query_player_id <> candidate_player_id)
);

create unique index player_similarity_snapshots_unique_pair
  on djm_os.player_similarity_snapshots(query_player_id, candidate_player_id, as_of_date, model_version, feature_schema_version);
create index player_similarity_snapshots_query_rank_idx
  on djm_os.player_similarity_snapshots(query_player_id, as_of_date desc, similarity_score desc);

-- 8) Provider request/quota observability. Critical for keeping a low-cost API plan under control.
create table djm_os.provider_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  operation text not null,
  entity_type text,
  entity_id uuid,
  endpoint text,
  status text not null default 'running',
  request_count integer not null default 0,
  cache_hits integer not null default 0,
  rows_written integer not null default 0,
  retry_count integer not null default 0,
  http_status integer,
  quota_limit integer,
  quota_remaining integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  response_metadata jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  constraint provider_sync_runs_request_count_check check (request_count >= 0),
  constraint provider_sync_runs_cache_hits_check check (cache_hits >= 0),
  constraint provider_sync_runs_rows_written_check check (rows_written >= 0),
  constraint provider_sync_runs_retry_count_check check (retry_count >= 0)
);

create index provider_sync_runs_provider_started_idx
  on djm_os.provider_sync_runs(provider, started_at desc);
create index provider_sync_runs_status_started_idx
  on djm_os.provider_sync_runs(status, started_at desc);

-- Security: keep these analytical tables behind DJM staff membership. Writes are server/service-role only.
alter table djm_os.football_teams enable row level security;
alter table djm_os.football_fixtures enable row level security;
alter table djm_os.player_match_stat_snapshots enable row level security;
alter table djm_os.player_canonical_stat_snapshots enable row level security;
alter table djm_os.player_projection_snapshots enable row level security;
alter table djm_os.player_similarity_snapshots enable row level security;
alter table djm_os.provider_sync_runs enable row level security;

revoke all on djm_os.football_teams from anon, authenticated;
revoke all on djm_os.football_fixtures from anon, authenticated;
revoke all on djm_os.player_match_stat_snapshots from anon, authenticated;
revoke all on djm_os.player_canonical_stat_snapshots from anon, authenticated;
revoke all on djm_os.player_projection_snapshots from anon, authenticated;
revoke all on djm_os.player_similarity_snapshots from anon, authenticated;
revoke all on djm_os.provider_sync_runs from anon, authenticated;

grant select on djm_os.football_teams to authenticated;
grant select on djm_os.football_fixtures to authenticated;
grant select on djm_os.player_match_stat_snapshots to authenticated;
grant select on djm_os.player_canonical_stat_snapshots to authenticated;
grant select on djm_os.player_projection_snapshots to authenticated;
grant select on djm_os.player_similarity_snapshots to authenticated;
grant select on djm_os.provider_sync_runs to authenticated;

grant all on djm_os.football_teams to service_role;
grant all on djm_os.football_fixtures to service_role;
grant all on djm_os.player_match_stat_snapshots to service_role;
grant all on djm_os.player_canonical_stat_snapshots to service_role;
grant all on djm_os.player_projection_snapshots to service_role;
grant all on djm_os.player_similarity_snapshots to service_role;
grant all on djm_os.provider_sync_runs to service_role;

create policy football_teams_team_select on djm_os.football_teams
  for select to authenticated using ((select djm_os.is_team_member()));
create policy football_fixtures_team_select on djm_os.football_fixtures
  for select to authenticated using ((select djm_os.is_team_member()));
create policy player_match_stat_snapshots_team_select on djm_os.player_match_stat_snapshots
  for select to authenticated using ((select djm_os.is_team_member()));
create policy player_canonical_stat_snapshots_team_select on djm_os.player_canonical_stat_snapshots
  for select to authenticated using ((select djm_os.is_team_member()));
create policy player_projection_snapshots_team_select on djm_os.player_projection_snapshots
  for select to authenticated using ((select djm_os.is_team_member()));
create policy player_similarity_snapshots_team_select on djm_os.player_similarity_snapshots
  for select to authenticated using ((select djm_os.is_team_member()));
create policy provider_sync_runs_team_select on djm_os.provider_sync_runs
  for select to authenticated using ((select djm_os.is_team_member()));

comment on table djm_os.player_match_stat_snapshots is 'Appendable match-level player statistics from licensed providers. Missing metrics remain absent/null, never fabricated as zero.';
comment on table djm_os.player_canonical_stat_snapshots is 'Provider-neutral DJM model-input layer used by scoring, comparison and potential models.';
comment on table djm_os.player_projection_snapshots is 'Historical probabilistic player potential projections retained for calibration and backtesting.';
comment on table djm_os.player_similarity_snapshots is 'Cached player similarity results for the DJM comparison engine.';
comment on table djm_os.provider_sync_runs is 'Provider API request, quota, cache and error observability for low-cost ingestion.';