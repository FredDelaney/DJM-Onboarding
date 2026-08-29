-- DJM free player data sync V1
-- Adds provider identity, full provider stat snapshots and a structured Transfermarkt value.
-- Does not scrape Transfermarkt. API-Football is the default zero-cost automated stats provider.

begin;

alter table public.players
  add column if not exists football_provider_ids jsonb not null default '{}'::jsonb,
  add column if not exists transfermarkt_market_value numeric(14,2),
  add column if not exists transfermarkt_market_value_currency text,
  add column if not exists transfermarkt_value_verified_at timestamptz;

alter table public.career_entries
  add column if not exists source_provider text,
  add column if not exists source_acceptance_method text,
  add column if not exists source_provider_player_id text,
  add column if not exists source_synced_at timestamptz;

create table if not exists djm_os.player_provider_stat_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  provider text not null,
  provider_player_id text not null,
  provider_team_id text,
  provider_competition_id text,
  provider_season_id text not null,
  season_label text,
  club_name text,
  competition_name text,
  metrics jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_provider_stat_snapshots_provider_check
    check (provider in ('api_football','wyscout','sportmonks','manual')),
  constraint player_provider_stat_snapshots_unique_source
    unique nulls not distinct (
      player_id,
      provider,
      provider_season_id,
      provider_competition_id,
      provider_team_id
    )
);

create index if not exists player_provider_stat_snapshots_player_idx
  on djm_os.player_provider_stat_snapshots(player_id, synced_at desc);
create index if not exists player_provider_stat_snapshots_provider_player_idx
  on djm_os.player_provider_stat_snapshots(provider, provider_player_id);

alter table djm_os.player_provider_stat_snapshots enable row level security;

revoke all on table djm_os.player_provider_stat_snapshots from public, anon;
grant select, insert, update, delete on table djm_os.player_provider_stat_snapshots to authenticated;

create policy player_provider_stat_snapshots_team_select
  on djm_os.player_provider_stat_snapshots
  for select to authenticated
  using (djm_os.is_team_member());

create policy player_provider_stat_snapshots_team_insert
  on djm_os.player_provider_stat_snapshots
  for insert to authenticated
  with check (djm_os.is_team_member());

create policy player_provider_stat_snapshots_team_update
  on djm_os.player_provider_stat_snapshots
  for update to authenticated
  using (djm_os.is_team_member())
  with check (djm_os.is_team_member());

create policy player_provider_stat_snapshots_team_delete
  on djm_os.player_provider_stat_snapshots
  for delete to authenticated
  using (djm_os.is_team_member());

comment on column public.players.transfermarkt_market_value is
  'DJM structured Transfermarkt market value. Manual/verified until an authorised Transfermarkt interface exists.';
comment on column public.players.transfermarkt_value_verified_at is
  'Timestamp at which DJM verified the saved Transfermarkt market value against the linked Transfermarkt profile.';
comment on table djm_os.player_provider_stat_snapshots is
  'Normalised provider stat payloads retained for explainable player intelligence. Transfermarkt scraping is not used.';

commit;
