create or replace function djm_os.mirror_player_provider_snapshot_to_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_id uuid;
begin
  select s.id into v_subject_id
  from djm_os.football_intelligence_subjects s
  where s.player_id = new.player_id
  limit 1;

  if v_subject_id is null then
    return new;
  end if;

  insert into djm_os.football_subject_provider_snapshots(
    subject_id, provider, provider_player_id, provider_team_id, provider_competition_id,
    provider_season_id, season_label, club_name, competition_name, metrics,
    metric_schema_version, data_depth, confidence, provenance, observed_at, synced_at, updated_at
  ) values (
    v_subject_id, new.provider, new.provider_player_id, coalesce(new.provider_team_id,''),
    coalesce(new.provider_competition_id,''), new.provider_season_id, new.season_label,
    new.club_name, new.competition_name, coalesce(new.metrics,'{}'::jsonb),
    coalesce(new.metric_schema_version,'djm_metrics_v1'), coalesce(new.data_depth,'unknown'),
    new.confidence,
    jsonb_build_object('mirrored_from','djm_os.player_provider_stat_snapshots') || coalesce(new.request_metadata,'{}'::jsonb),
    new.observed_at, new.synced_at, now()
  )
  on conflict(subject_id, provider, provider_season_id, provider_competition_id, provider_team_id)
  do update set
    provider_player_id=excluded.provider_player_id,
    season_label=excluded.season_label,
    club_name=excluded.club_name,
    competition_name=excluded.competition_name,
    metrics=excluded.metrics,
    metric_schema_version=excluded.metric_schema_version,
    data_depth=excluded.data_depth,
    confidence=excluded.confidence,
    provenance=excluded.provenance,
    observed_at=excluded.observed_at,
    synced_at=excluded.synced_at,
    updated_at=now();

  return new;
end;
$$;

drop trigger if exists mirror_player_provider_snapshot_to_subject_trg on djm_os.player_provider_stat_snapshots;
create trigger mirror_player_provider_snapshot_to_subject_trg
after insert or update on djm_os.player_provider_stat_snapshots
for each row execute function djm_os.mirror_player_provider_snapshot_to_subject();

insert into djm_os.football_subject_provider_snapshots(
  subject_id, provider, provider_player_id, provider_team_id, provider_competition_id,
  provider_season_id, season_label, club_name, competition_name, metrics,
  metric_schema_version, data_depth, confidence, provenance, observed_at, synced_at
)
select s.id, p.provider, p.provider_player_id, coalesce(p.provider_team_id,''),
       coalesce(p.provider_competition_id,''), p.provider_season_id, p.season_label,
       p.club_name, p.competition_name, p.metrics, p.metric_schema_version, p.data_depth,
       p.confidence,
       jsonb_build_object('mirrored_from','djm_os.player_provider_stat_snapshots') || coalesce(p.request_metadata,'{}'::jsonb),
       p.observed_at, p.synced_at
from djm_os.player_provider_stat_snapshots p
join djm_os.football_intelligence_subjects s on s.player_id=p.player_id
on conflict(subject_id, provider, provider_season_id, provider_competition_id, provider_team_id)
do update set
  provider_player_id=excluded.provider_player_id,
  season_label=excluded.season_label,
  club_name=excluded.club_name,
  competition_name=excluded.competition_name,
  metrics=excluded.metrics,
  metric_schema_version=excluded.metric_schema_version,
  data_depth=excluded.data_depth,
  confidence=excluded.confidence,
  provenance=excluded.provenance,
  observed_at=excluded.observed_at,
  synced_at=excluded.synced_at,
  updated_at=now();