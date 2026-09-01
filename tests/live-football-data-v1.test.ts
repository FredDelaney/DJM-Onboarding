import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260901032000_djm_verified_live_football_data_v1.sql',
  'utf8',
);

test('weekly official snapshots keep the connected career record current', () => {
  assert.match(migration, /function djm_os\.sync_official_subject_career_snapshot\(\)/);
  assert.match(migration, /after insert or update of metrics, season_label/);
  assert.match(migration, /source_provider_player_id = new\.provider_player_id/);
  assert.match(migration, /appearances = coalesce\(nullif\(v_current ->> 'apps'/);
  assert.match(migration, /source_acceptance_method[\s\S]*official_source_sync/);
  assert.match(migration, /where ps\.provider = 'official_league'/);
});

test('the reconciliation preserves evidence timestamps and uses stored official data', () => {
  assert.match(migration, /with latest as/);
  assert.match(migration, /source_reviewed_at = l\.observed_at/);
  assert.match(migration, /source_synced_at = l\.synced_at/);
  assert.match(migration, /l\.metrics #>> '\{current_season,minutes\}'/);
  assert.doesNotMatch(
    migration,
    /update djm_os\.football_subject_provider_snapshots[\s\S]*set synced_at/,
  );
});
