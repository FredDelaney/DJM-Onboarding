begin;

create index if not exists competitions_created_by_idx
on djm_os.competitions(created_by);

create index if not exists competitions_updated_by_idx
on djm_os.competitions(updated_by);

create index if not exists player_evidence_supersedes_id_idx
on djm_os.player_evidence(supersedes_id);

create index if not exists player_evidence_verified_by_idx
on djm_os.player_evidence(verified_by);

create index if not exists player_performance_snapshots_verified_by_idx
on djm_os.player_performance_snapshots(verified_by);

create index if not exists player_source_suggestions_evidence_id_idx
on public.player_source_suggestions(evidence_id);

commit;
