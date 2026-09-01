import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const resolution = readFileSync(
  'supabase/migrations/20260901172306_tell_djm_person_resolution_and_similarity_hardening.sql',
  'utf8',
);
const labels = readFileSync(
  'supabase/migrations/20260901172617_tell_djm_person_picker_context_labels.sql',
  'utf8',
);

test('Tell DJM hardens pg_trgm calls under locked search_path', () => {
  assert.match(resolution, /extensions\.similarity\(/);
  assert.match(resolution, /djm_tell_%/);
});

test('Tell DJM can offer a signed player for an ambiguous follow-up name', () => {
  assert.match(resolution, /djm_tell_resolve_entity_typed/);
  assert.match(resolution, /p_user_id,'player',p_name,null/);
  assert.match(resolution, /person_candidates/);
});

test('choosing a player rewrites the saved action before retry', () => {
  assert.match(resolution, /field_key like 'entity:contact:%'/);
  assert.match(resolution, /'\{contact_name\}'/);
  assert.match(resolution, /'\{player_name\}'/);
  assert.match(resolution, /tell_djm_aliases/);
});

test('person picker labels include enough context to choose safely', () => {
  assert.match(labels, /'Contact'/);
  assert.match(labels, /'Player'/);
  assert.match(labels, /organisation_name/);
  assert.match(labels, /candidate->>'club'/);
});
