import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260831200726_djm_global_intelligence_admin_v1.sql',
  'utf8',
);
const panel = readFileSync('components/PlayerIntelligencePanel.tsx', 'utf8');
const playerPage = readFileSync('app/admin/players/[id]/page.tsx', 'utf8');

test('legacy signed-player recalculation cannot overwrite Global Score V7.1', () => {
  const mirrorStart = migration.indexOf('function djm_os.mirror_player_scorecard_to_subject');
  const mirrorEnd = migration.indexOf('comment on function djm_os.mirror_player_scorecard_to_subject');
  const mirror = migration.slice(mirrorStart, mirrorEnd);

  assert.match(mirror, /perform djm_os\.refresh_football_subject_scorecard\(v_subject_id\)/);
  assert.doesNotMatch(mirror, /insert into djm_os\.football_subject_scorecards/);
  assert.doesNotMatch(mirror, /new\.model_score/);
});

test('staff receive a safe global intelligence read model with evidence and automation state', () => {
  assert.match(migration, /function public\.djm_player_global_intelligence\(p_player_id uuid\)/);
  assert.match(migration, /'components', coalesce\(v_score\.basis -> 'components'/);
  assert.match(migration, /'provider_snapshot_count'/);
  assert.match(migration, /'match_snapshot_count'/);
  assert.match(migration, /'missing_evidence'/);
  assert.match(migration, /not djm_os\.is_team_member\(\)/);
  assert.match(migration, /revoke all on function public\.djm_player_global_intelligence\(uuid\) from public, anon/);
  assert.match(migration, /grant execute on function public\.djm_player_global_intelligence\(uuid\) to authenticated, service_role/);
});

test('official evidence is refreshed weekly without a paid provider dependency', () => {
  assert.match(migration, /djm-official-football-refresh-weekly/);
  assert.match(migration, /12 4 \* \* 1/);
  assert.match(migration, /refresh-official-football-data/);
  assert.match(migration, /'mode', 'refresh_all'/);
  assert.doesNotMatch(migration, /transfermarkt-enrich/i);
});

test('the admin score is visual, automated and honest about missing evidence', () => {
  assert.match(panel, /DJM GLOBAL INTELLIGENCE/);
  assert.match(panel, /V7\.1/);
  assert.match(panel, /SCORE DRIVERS/);
  assert.match(panel, /SignalCard/);
  assert.match(panel, /Missing evidence is treated as uncertainty, never as zero performance/);
  assert.match(panel, /5Y OUTLOOK/);
  assert.match(panel, /djm_refresh_player_global_intelligence/);
  assert.match(panel, /CALIBRATING/);
  assert.doesNotMatch(panel, /Recalculate V5/);
});

test('manual player identity fields are correction-only instead of the main workflow', () => {
  assert.match(playerPage, /AUTOMATED PLAYER RECORD/);
  assert.match(playerPage, /Open only to correct verified identity or contract information/);
  assert.match(
    playerPage,
    /<details className="admin-card admin-player-disclosure">[\s\S]*AUTOMATED PLAYER RECORD/,
  );
});
