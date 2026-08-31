create index if not exists player_match_stat_snapshots_fixture_idx
  on djm_os.player_match_stat_snapshots(fixture_id);
create index if not exists player_match_stat_snapshots_team_idx
  on djm_os.player_match_stat_snapshots(team_id);
create index if not exists player_match_stat_snapshots_opponent_team_idx
  on djm_os.player_match_stat_snapshots(opponent_team_id);
create index if not exists player_projection_snapshots_input_snapshot_idx
  on djm_os.player_projection_snapshots(input_snapshot_id);
create index if not exists player_similarity_snapshots_candidate_player_idx
  on djm_os.player_similarity_snapshots(candidate_player_id);
create index if not exists player_similarity_snapshots_query_snapshot_idx
  on djm_os.player_similarity_snapshots(query_snapshot_id);
create index if not exists player_similarity_snapshots_candidate_snapshot_idx
  on djm_os.player_similarity_snapshots(candidate_snapshot_id);