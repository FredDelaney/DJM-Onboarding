import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  aggregateFootballStats,
  headlineSeasonRows,
  resolveHeadlineSeason,
} from '../lib/football-season-stats.ts';

const jamesRows = [
  {
    season_label: '2026',
    stats_year: 2026,
    club_name: 'Auckland FC Reserves',
    league: 'National League - North',
    appearances: 9,
    starts: 9,
    minutes: 777,
    goals: 0,
    assists: 0,
  },
  {
    season_label: '2025-26',
    stats_year: 2026,
    club_name: 'Auckland FC',
    league: 'A-League Men',
    appearances: 2,
    starts: 0,
    minutes: 13,
    goals: 0,
    assists: 0,
  },
  {
    season_label: '2025',
    stats_year: 2025,
    club_name: 'Auckland FC Reserves',
    league: 'National League',
    appearances: 28,
    starts: 23,
    minutes: 1943,
    goals: 2,
    assists: 0,
  },
];

test('headline totals combine verified competitions in the selected calendar year', () => {
  const season = resolveHeadlineSeason(jamesRows, '2026');
  assert.equal(season, '2026');
  assert.deepEqual(aggregateFootballStats(headlineSeasonRows(jamesRows, season)), {
    appearances: 11,
    starts: 9,
    minutes: 790,
    goals: 0,
    assists: 0,
    contributions: 0,
  });
});

test('cross-year rows never join a calendar year without explicit evidence classification', () => {
  const unclassified = jamesRows.map((row) =>
    row.season_label === '2025-26' ? { ...row, stats_year: null } : row,
  );
  const totals = aggregateFootballStats(headlineSeasonRows(unclassified, '2026'));
  assert.equal(totals.appearances, 9);
  assert.equal(totals.minutes, 777);
});

test('dossier and stats panel use the shared full-period rule and six totals', () => {
  const panel = readFileSync('components/PlayerStatsPanel.tsx', 'utf8');
  const dossier = readFileSync('lib/dossier.ts', 'utf8');
  const publicProfile = readFileSync('components/PublicProfile.tsx', 'utf8');
  const pdf = readFileSync('components/ClubCvPdf.tsx', 'utf8');

  assert.match(panel, /stats_year/);
  assert.match(panel, /All competitions/);
  assert.match(panel, /headlineSeasonRows/);
  assert.match(panel, /Season history/);
  assert.match(dossier, /limit = 6/);
  assert.match(publicProfile, /dossierHeadlineStats\([\s\S]*profile,[\s\S]*6,/);
  assert.match(pdf, /dossierHeadlineStats\([\s\S]*profile,[\s\S]*6,/);
});

test('production connectivity hotfixes and edge functions are source controlled', () => {
  const config = readFileSync('supabase/config.toml', 'utf8');
  const compatibility = readFileSync(
    'supabase/migrations/20260902112123_djm_connectivity_preference_compatibility_v1.sql',
    'utf8',
  );
  const reminders = readFileSync(
    'supabase/migrations/20260902112254_djm_smart_reminder_multichannel_delivery_v1.sql',
    'utf8',
  );
  const dossierMigration = readFileSync(
    'supabase/migrations/20260902113027_djm_dossier_season_totals_v1.sql',
    'utf8',
  );

  assert.match(config, /\[functions\.djm-calendar-feed\][\s\S]*verify_jwt = false/);
  assert.match(config, /\[functions\.dispatch-djm-email\][\s\S]*verify_jwt = false/);
  assert.match(compatibility, /djm_sync_notification_preference_aliases/);
  assert.match(reminders, /djm_queue_delivery/);
  assert.match(reminders, /djm_queue_smart_reminders/);
  assert.match(dossierMigration, /add column if not exists stats_year smallint/);
  assert.match(dossierMigration, /'G\+A'/);
});
