import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const playerPage = readFileSync('app/admin/players/[id]/page.tsx', 'utf8');
const statsPanel = readFileSync('components/PlayerStatsPanel.tsx', 'utf8');
const comparePage = readFileSync('app/admin/players/[id]/compare/page.tsx', 'utf8');
const freeRefresh = readFileSync(
  'supabase/functions/refresh-player-stats-free/index.ts',
  'utf8',
);
const refreshPlayerData = readFileSync(
  'supabase/functions/refresh-player-data/index.ts',
  'utf8',
);
const weekly = readFileSync('supabase/functions/weekly-player-refresh/index.ts', 'utf8');
const playerDirectory = readFileSync('app/admin/page.tsx', 'utf8');
const connectionHub = readFileSync('components/PlayerConnectionHub.tsx', 'utf8');

test('admin player surface is stats-first and hides unfinished intelligence', () => {
  assert.match(playerPage, /PlayerStatsPanel/);
  assert.match(playerPage, /<PlayerStatsPanel[\s\S]*compact/);
  assert.doesNotMatch(playerPage, /<PlayerIntelligencePanel/);

  assert.match(statsPanel, /PLAYER STATS/);
  assert.match(statsPanel, /STATS ONLY/);
  assert.match(statsPanel, /career_entries/);
  assert.match(statsPanel, /Refresh free stats/);
  assert.match(statsPanel, /refresh-player-stats-free/);
  assert.match(statsPanel, /Scoring, projections and player[\s\S]*comparison are intentionally hidden/);

  assert.doesNotMatch(statsPanel, /djm_player_global_intelligence/);
  assert.doesNotMatch(statsPanel, /djm_refresh_player_global_intelligence/);
  assert.doesNotMatch(statsPanel, /5Y OUTLOOK/);
  assert.doesNotMatch(statsPanel, /Compare player/);
});

test('comparison route is disabled while comparison quality is not decision-grade', () => {
  assert.match(comparePage, /redirect/);
  assert.match(comparePage, /\/admin\/players\/\$\{id\}/);
  assert.doesNotMatch(comparePage, /PlayerComparisonExplorer/);
});

test('manual free refresh uses free sources and never requests a score rebuild', () => {
  assert.match(freeRefresh, /syncTheSportsDbWeekly/);
  assert.match(freeRefresh, /mode: "free_stats"/);
  assert.match(freeRefresh, /refresh-player-data/);
  assert.match(refreshPlayerData, /API_FOOTBALL_KEY/);
  assert.match(freeRefresh, /sevenDaysAgo/);
  assert.match(freeRefresh, /score_refresh: false/);
  assert.match(freeRefresh, /comparison_refresh: false/);
  assert.doesNotMatch(freeRefresh, /djm_player_scorecard/);
  assert.doesNotMatch(freeRefresh, /djm_refresh_player_global_intelligence/);

  assert.match(refreshPlayerData, /statsOnly/);
  assert.match(refreshPlayerData, /keys\.pitchKey\s*&&\s*!statsOnly/);
});

test('background free refresh remains rotating and stale-first', () => {
  assert.match(weekly, /daily_rotating_stale_first_weekly_coverage/);
  assert.match(weekly, /djm_weekly_refresh_snapshot_status/);
  assert.match(weekly, /slice\(rotationPage \* 10, rotationPage \* 10 \+ 10\)/);
  assert.match(weekly, /syncTheSportsDbWeekly/);
});


test('visible player maintenance never triggers the intelligence or peer pipeline', () => {
  assert.match(playerDirectory, /refresh-player-stats-free/);
  assert.doesNotMatch(playerDirectory, /refresh-player-data-universal/);
  assert.doesNotMatch(playerDirectory, /refresh-player-peer-data/);

  assert.match(connectionHub, /refresh-player-stats-free/);
  assert.doesNotMatch(connectionHub, /refresh-player-data-universal/);
});
