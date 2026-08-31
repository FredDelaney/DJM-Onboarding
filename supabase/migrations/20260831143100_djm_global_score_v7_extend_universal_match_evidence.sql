alter table djm_os.football_subject_match_snapshots
  add column if not exists fixture_id uuid references djm_os.football_fixtures(id) on delete set null,
  add column if not exists team_id uuid references djm_os.football_teams(id) on delete set null,
  add column if not exists opponent_team_id uuid references djm_os.football_teams(id) on delete set null,
  add column if not exists kickoff_at timestamptz,
  add column if not exists payload_hash text,
  add column if not exists request_metadata jsonb not null default '{}'::jsonb;

create index if not exists football_subject_match_subject_date_idx
  on djm_os.football_subject_match_snapshots(subject_id, match_date desc);
create index if not exists football_subject_match_competition_idx
  on djm_os.football_subject_match_snapshots(competition_id, match_date desc);
create index if not exists football_subject_match_opponent_idx
  on djm_os.football_subject_match_snapshots(opponent_team_id, match_date desc);

alter table djm_os.football_subject_match_snapshots enable row level security;
revoke all on djm_os.football_subject_match_snapshots from public, anon, authenticated;
grant select, insert, update, delete on djm_os.football_subject_match_snapshots to service_role;

create or replace function djm_os.mirror_player_match_to_subject()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_subject uuid;
begin
  if tg_op='DELETE' then
    select id into v_subject from djm_os.football_intelligence_subjects where player_id=old.player_id limit 1;
    if v_subject is not null then
      delete from djm_os.football_subject_match_snapshots
      where subject_id=v_subject and provider=old.provider and provider_match_id=old.provider_match_id
        and coalesce(provider_player_id,'')=coalesce(old.provider_player_id,'');
    end if;
    return old;
  end if;

  select id into v_subject from djm_os.football_intelligence_subjects where player_id=new.player_id limit 1;
  if v_subject is null then return new; end if;

  insert into djm_os.football_subject_match_snapshots(
    subject_id, fixture_id, competition_id, team_id, opponent_team_id,
    provider, provider_player_id, provider_match_id, provider_team_id,
    provider_opponent_id, provider_competition_id, provider_season_id,
    season_label, match_date, kickoff_at, team_name, opponent_name,
    home_away, position_group, provider_position, started, minutes, metrics,
    metric_schema_version, data_depth, confidence, observed_at, synced_at,
    payload_hash, request_metadata, provenance, updated_at
  ) values (
    v_subject, new.fixture_id, new.competition_id, new.team_id, new.opponent_team_id,
    new.provider, new.provider_player_id, new.provider_match_id, new.provider_team_id,
    new.provider_opponent_id, new.provider_competition_id, new.provider_season_id,
    new.season_label, new.match_date, new.kickoff_at, new.team_name, new.opponent_name,
    new.home_away, new.position_group, new.provider_position, new.started, new.minutes, new.metrics,
    new.metric_schema_version, new.data_depth, new.confidence, new.observed_at, new.synced_at,
    new.payload_hash, new.request_metadata,
    jsonb_build_object('source_table','djm_os.player_match_stat_snapshots','mirrored_at',now()),
    now()
  )
  on conflict(subject_id,provider,provider_match_id,provider_player_id) do update set
    fixture_id=excluded.fixture_id,
    competition_id=excluded.competition_id,
    team_id=excluded.team_id,
    opponent_team_id=excluded.opponent_team_id,
    provider_team_id=excluded.provider_team_id,
    provider_opponent_id=excluded.provider_opponent_id,
    provider_competition_id=excluded.provider_competition_id,
    provider_season_id=excluded.provider_season_id,
    season_label=excluded.season_label,
    match_date=excluded.match_date,
    kickoff_at=excluded.kickoff_at,
    team_name=excluded.team_name,
    opponent_name=excluded.opponent_name,
    home_away=excluded.home_away,
    position_group=excluded.position_group,
    provider_position=excluded.provider_position,
    started=excluded.started,
    minutes=excluded.minutes,
    metrics=excluded.metrics,
    metric_schema_version=excluded.metric_schema_version,
    data_depth=excluded.data_depth,
    confidence=excluded.confidence,
    observed_at=excluded.observed_at,
    synced_at=excluded.synced_at,
    payload_hash=excluded.payload_hash,
    request_metadata=excluded.request_metadata,
    provenance=excluded.provenance,
    updated_at=now();
  return new;
end;
$$;

drop trigger if exists trg_mirror_player_match_to_subject on djm_os.player_match_stat_snapshots;
create trigger trg_mirror_player_match_to_subject
after insert or update or delete on djm_os.player_match_stat_snapshots
for each row execute function djm_os.mirror_player_match_to_subject();

insert into djm_os.football_subject_match_snapshots(
  subject_id, fixture_id, competition_id, team_id, opponent_team_id,
  provider, provider_player_id, provider_match_id, provider_team_id,
  provider_opponent_id, provider_competition_id, provider_season_id,
  season_label, match_date, kickoff_at, team_name, opponent_name,
  home_away, position_group, provider_position, started, minutes, metrics,
  metric_schema_version, data_depth, confidence, observed_at, synced_at,
  payload_hash, request_metadata, provenance, updated_at
)
select
  s.id, m.fixture_id, m.competition_id, m.team_id, m.opponent_team_id,
  m.provider, m.provider_player_id, m.provider_match_id, m.provider_team_id,
  m.provider_opponent_id, m.provider_competition_id, m.provider_season_id,
  m.season_label, m.match_date, m.kickoff_at, m.team_name, m.opponent_name,
  m.home_away, m.position_group, m.provider_position, m.started, m.minutes, m.metrics,
  m.metric_schema_version, m.data_depth, m.confidence, m.observed_at, m.synced_at,
  m.payload_hash, m.request_metadata,
  jsonb_build_object('source_table','djm_os.player_match_stat_snapshots','backfilled_at',now()),
  now()
from djm_os.player_match_stat_snapshots m
join djm_os.football_intelligence_subjects s on s.player_id=m.player_id
on conflict(subject_id,provider,provider_match_id,provider_player_id) do nothing;