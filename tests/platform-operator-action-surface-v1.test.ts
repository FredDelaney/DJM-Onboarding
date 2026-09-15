import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('operator action surface routes due work to the control that can change evidence', () => {
  const migration = read(
    'supabase/migrations/20260915124245_add_operator_action_surface_v1.sql',
  );

  assert.match(migration, /platform_server_customer_action_surface/);
  assert.match(migration, /'target','intervention-control'/);
  assert.match(migration, /'target','activation-control'/);
  assert.match(migration, /'target','privacy-control'/);
  assert.match(migration, /'target','commercial-control'/);
  assert.match(migration, /'target','domain-control'/);
  assert.match(migration, /They do not mark the blocker complete/);
});

test('moving an agency live is guarded by evidence and commercial readiness', () => {
  const migration = read(
    'supabase/migrations/20260915124245_add_operator_action_surface_v1.sql',
  );

  assert.match(migration, /platform_server_operator_go_live_customer/);
  assert.match(migration, /launch_readiness_incomplete/);
  assert.match(migration, /first_value_not_reached/);
  assert.match(migration, /commercial_contract_required/);
  assert.match(migration, /active_plan_required/);
  assert.match(migration, /serious_incident_unresolved/);
  assert.match(migration, /platform_operator_access_required/);
  assert.match(migration, /'platform\.customer\.go_live'/);
});

test('platform bridge exposes only the guarded go-live mutation', () => {
  const ops = read('supabase/functions/platform-ops/index.ts');

  assert.match(ops, /action==="go_live_customer"/);
  assert.match(ops, /platform_server_operator_go_live_customer/);
  assert.doesNotMatch(ops, /action==="mark_intervention_complete"/);
});

test('ReDream action bar focuses existing controls and confirms high-impact execution', () => {
  const page = read('app/platform/page.tsx');
  const actionBar = read('app/platform/AgencyActionBar.tsx');
  const goLive = read('app/platform/AgencyGoLiveCard.tsx');
  const activation = read('app/platform/AgencyActivationCard.tsx');
  const intervention = read('app/platform/AgencyInterventionCard.tsx');

  assert.match(page, /AgencyActionBar/);
  assert.match(page, /action_surface/);
  assert.match(page, /commercial-control/);
  assert.match(page, /domain-control/);
  assert.match(goLive, /id="go-live-control"/);
  assert.match(goLive, /id="privacy-control"/);
  assert.match(activation, /id="activation-control"/);
  assert.match(intervention, /id="intervention-control"/);
  assert.match(actionBar, /Confirm go live/);
  assert.match(actionBar, /never mark a blocker complete/);
});
