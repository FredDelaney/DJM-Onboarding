import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const drawer = fs.readFileSync(
  'components/AgencyEntityIntelligenceDrawer.tsx',
  'utf8',
);

test('Player 360 and Deal War Room are directly available', () => {
  assert.match(workspace, /Player 360/);
  assert.match(workspace, /War room/);
  assert.match(workspace, /AgencyEntityIntelligenceDrawer/);
});

test('Player 360 uses the existing Autopilot spine', () => {
  assert.match(drawer, /player_service_card/);
  assert.match(drawer, /career_alignment/);
  assert.match(drawer, /player_value_proof/);
  assert.match(drawer, /player_control_fix_prepare/);
  assert.match(drawer, /player_service_move_prepare/);
  assert.match(drawer, /career_strategy_action_prepare/);
});

test('Deal War Room uses the existing decision engine', () => {
  assert.match(drawer, /deal_war_room/);
  assert.match(drawer, /deal_control_fix_prepare/);
  assert.match(drawer, /deal_next_move_prepare/);
  assert.match(drawer, /negotiation_next_step_prepare/);
  assert.match(drawer, /not transfer probability or predicted outcome/);
});
