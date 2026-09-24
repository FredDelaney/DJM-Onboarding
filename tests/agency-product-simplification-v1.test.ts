import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const launcher = readFileSync(
  'components/AiLauncher.tsx',
  'utf8',
);

test('every agency tenant receives the same simple five-area product shell', () => {
  assert.match(workspace, /label: 'Today'/);
  assert.match(workspace, /label: 'Players'/);
  assert.match(workspace, /label: 'Market'/);
  assert.match(workspace, /label: 'Deals'/);
  assert.match(workspace, /label: 'Network'/);
  assert.doesNotMatch(workspace, /label: 'Relationships'/);
  assert.doesNotMatch(workspace, /DJM Sports Management/);
  assert.doesNotMatch(workspace, /ReDream/);
});

test('legacy URLs still resolve into the shared tenant workspace', () => {
  assert.match(workspace, /rawRequestedView === 'opportunities'/);
  assert.match(workspace, /rawRequestedView === 'network'/);
  assert.match(workspace, /workspace\.slug/);
  assert.match(workspace, /tenant_id: workspace\.tenant_id/);
});

test('agents get simple football language without losing guarded execution', () => {
  assert.match(workspace, /Know what every player needs next\./);
  assert.match(workspace, /Club needs\. Player fits\. Best route in\./);
  assert.match(workspace, /Keep every live deal moving\./);
  assert.match(workspace, /Your football network\./);
  assert.match(workspace, /action_prepare/);
  assert.match(workspace, /action_execute/);
  assert.match(workspace, /Nothing changes until you confirm/);
});

test('Tell ReDream is the universal capture entry point', () => {
  assert.match(launcher, />Tell ReDream</);
  assert.match(
    launcher,
    /Tell ReDream what happened\. We’ll handle the admin\./,
  );
  assert.match(launcher, /redream_ai_current_access/);
});

test('player import lives with Players rather than cluttering Today', () => {
  assert.match(workspace, /view === 'players'/);
  assert.match(workspace, /Add \/ import players/);
  assert.doesNotMatch(
    workspace,
    /view === 'home'[\s\S]{0,280}Import roster/,
  );
});

test('advanced capability remains available through progressive disclosure', () => {
  assert.match(workspace, /AgencyMemoryDrawer/);
  assert.match(workspace, /AgencyOwnerCommandCentre/);
  assert.match(workspace, /AgencyPursuitRoom/);
  assert.match(workspace, /AgencyEntityIntelligenceDrawer/);
  assert.match(workspace, /AgencyContactIntelligenceDrawer/);
  assert.match(workspace, /AgencyNegotiationCommandRoom/);
});
