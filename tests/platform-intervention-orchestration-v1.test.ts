import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('customer intervention history records operator activity without manual resolution', () => {
  const migration = read('supabase/migrations/20260915112327_add_customer_intervention_orchestration_v1.sql');
  assert.match(migration, /customer_intervention_events/);
  assert.match(migration, /event_type in \('contacted','note','follow_up'\)/);
  assert.doesNotMatch(migration, /event_type in \([^\n]*resolved/);
  assert.match(migration, /intervention_fingerprint/);
  assert.match(migration, /An intervention is never manually marked resolved/);
});

test('intervention orchestration creates evidence-led activation playbooks', () => {
  const migration = read('supabase/migrations/20260915112327_add_customer_intervention_orchestration_v1.sql');
  assert.match(migration, /platform_server_customer_intervention_orchestration/);
  assert.match(migration, /'quick_action','owner_invite'/);
  assert.match(migration, /'quick_action','privacy'/);
  assert.match(migration, /'quick_action','assisted_import'/);
  assert.match(migration, /'quick_action','trial_conversion'/);
  assert.match(migration, /success_evidence/);
  assert.match(migration, /customer_message_template/);
});

test('operator can record only constrained intervention events through the platform bridge', () => {
  const migration = read('supabase/migrations/20260915112327_add_customer_intervention_orchestration_v1.sql');
  const ops = read('supabase/functions/platform-ops/index.ts');
  assert.match(migration, /platform_server_operator_record_intervention_event/);
  assert.match(migration, /platform_operator_access_required/);
  assert.match(migration, /contact_channel_required/);
  assert.match(ops, /action==="record_intervention_event"/);
  assert.match(ops, /platform_server_operator_record_intervention_event/);
});

test('ReDream shows the intervention playbook and explicit follow-up memory', () => {
  const page = read('app/platform/page.tsx');
  const card = read('app/platform/AgencyInterventionCard.tsx');
  assert.match(page, /AgencyInterventionCard/);
  assert.match(page, /intervention_orchestration/);
  assert.match(card, /Copy message/);
  assert.match(card, /Log contact/);
  assert.match(card, /Set follow-up/);
  assert.match(card, /Save note/);
  assert.match(card, /never lets a manual note resolve the intervention/);
  assert.doesNotMatch(card, /mark.*resolved/i);
});
