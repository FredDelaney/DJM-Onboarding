import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260901175308_tell_djm_canonical_person_names.sql',
  'utf8',
);

test('Tell DJM separates person picker display labels from canonical names', () => {
  assert.match(migration, /canonical_label/);
  assert.match(migration, /concat_ws\(\s*' · '/);
  assert.match(migration, /split_part\(/);
});

test('Tell DJM writes the canonical player name back into the saved action', () => {
  assert.match(migration, /'\{player_name\}'/);
  assert.match(migration, /to_jsonb\(v_canonical_label\)/);
  assert.match(migration, /'\{contact_name\}'/);
});
