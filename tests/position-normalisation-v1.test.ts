import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260901043000_djm_position_normalisation_v1.sql',
  'utf8',
);

test('score normalisation recognises common long-form football positions', () => {
  assert.match(migration, /DEFENSIVE_MIDFIELD/);
  assert.match(migration, /CENTRAL_MIDFIELD/);
  assert.match(migration, /CENTRE_MIDFIELDER/);
  assert.match(migration, /ATTACKING_MIDFIELD/);
  assert.match(migration, /LEFT_WINGER/);
  assert.match(migration, /RIGHT_WING/);
  assert.match(migration, /LEFT_BACK/);
  assert.match(migration, /CENTRE_FORWARD/);
});

test('the migration validates aliases and refreshes only resolved unknown subjects', () => {
  assert.match(migration, /DJM position normalisation self-test failed/);
  assert.match(migration, /where sc\.position_group = 'UNKNOWN'/);
  assert.match(
    migration,
    /private\.djm_position_group\(s\.primary_position\) <> 'UNKNOWN'/,
  );
  assert.match(migration, /refresh_football_subject_scorecard\(r\.id\)/);
});

test('private helper permissions remain restricted', () => {
  assert.match(
    migration,
    /revoke all on function private\.djm_position_group\(text\) from public, anon/,
  );
  assert.match(
    migration,
    /grant execute on function private\.djm_position_group\(text\) to authenticated, service_role/,
  );
});
