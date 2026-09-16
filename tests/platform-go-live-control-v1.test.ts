import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('go-live readiness is evidence-derived instead of a manually completed checklist', () => {
  const migration = read(
    'supabase/migrations/20260915105150_add_customer_go_live_readiness_v1.sql',
  );

  assert.match(migration, /platform_server_customer_go_live_readiness/);
  assert.match(migration, /Owner access/);
  assert.match(migration, /Customer-facing brand/);
  assert.match(migration, /Privacy and controller identity/);
  assert.match(migration, /Verified workspace address/);
  assert.match(migration, /First player loaded/);
  assert.match(migration, /task_completion_is_evidence_managed/);
});

test('operator intervention separates launch, activation, retention and revenue work', () => {
  const migration = read(
    'supabase/migrations/20260915105150_add_customer_go_live_readiness_v1.sql',
  );

  assert.match(migration, /platform_server_customer_intervention/);
  assert.match(migration, /'impact','launch'/);
  assert.match(migration, /'impact','activation'/);
  assert.match(migration, /'impact','retention'/);
  assert.match(migration, /'impact','revenue'/);
  assert.match(migration, /'responsible_party','agency_owner'/);
  assert.match(migration, /'responsible_party','redream'/);
});

test('portfolio exposes launch readiness and who owns the next intervention', () => {
  const migration = read(
    'supabase/migrations/20260915105150_add_customer_go_live_readiness_v1.sql',
  );

  assert.match(migration, /'launch_ready'/);
  assert.match(migration, /'launch_blocked'/);
  assert.match(migration, /'redream_actions'/);
  assert.match(migration, /'customer_actions'/);
  assert.match(migration, /'operator_intervention'/);
});

test('ReDream cockpit makes launch blockers actionable without becoming a manual checklist', () => {
  const page = read('app/platform/page.tsx');
  const card = read('app/platform/AgencyGoLiveCard.tsx');

  assert.match(page, /AgencyGoLiveCard/);
  assert.match(page, /Launch readiness/);
  assert.match(page, /operator_intervention/);
  assert.doesNotMatch(page, /onClick=\{\(\) => void updateOnboardingTask/);
  assert.match(card, /update_privacy_profile/);
  assert.match(card, /ReDream records the supplied identity and version/);
  assert.match(card, /Agency action/);
  assert.match(card, /ReDream action/);
});
