import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const owner = fs.readFileSync(
  'components/AgencyOwnerCommandCentre.tsx',
  'utf8',
);

test('Owner Command Centre is part of Home rather than a sixth daily navigation area', () => {
  assert.match(workspace, /AgencyOwnerCommandCentre/);
  assert.match(workspace, /Open Owner Command Centre/);
  assert.doesNotMatch(
    workspace,
    /key: 'business'/,
  );
});

test('Owner business evidence loads only for owner and admin roles', () => {
  assert.match(
    workspace,
    /\['owner', 'admin'\]\.includes/,
  );
  assert.match(
    workspace,
    /agency_control_centre/,
  );
  assert.match(
    workspace,
    /agency_roi_proof/,
  );
  assert.match(
    workspace,
    /receivables_command/,
  );
});

test('Owner Command Centre keeps revenue service ownership and collection separate', () => {
  assert.match(owner, /PROTECT REVENUE/);
  assert.match(owner, /TEAM OWNERSHIP/);
  assert.match(owner, /SERVICE CONTROL/);
  assert.match(owner, /Open receivables/);
  assert.match(owner, /RECORDED VALUE/);
});

test('Commercial exposure remains evidence-led and multi-currency safe', () => {
  assert.match(
    owner,
    /not guaranteed revenue/,
  );
  assert.match(
    owner,
    /Currencies remain separate/,
  );
  assert.match(
    owner,
    /does not invent an FX conversion/,
  );
});

test('Owner can move from exposed revenue straight into the existing Deal War Room', () => {
  assert.match(owner, /War room/);
  assert.match(owner, /onOpenDeal/);
  assert.match(owner, /deal_room_id/);
});

test('Owner service gaps remain directly actionable through guarded player actions', () => {
  assert.match(
    owner,
    /player_control_fix_prepare/,
  );
  assert.match(
    owner,
    /player_service_move_prepare/,
  );
  assert.match(
    owner,
    /career_strategy_action_prepare/,
  );
});

test('Owner Command Centre does not invent a composite agency score or staff utilisation percentage', () => {
  assert.match(
    owner,
    /does not calculate a fake utilisation percentage/,
  );
  assert.match(
    owner,
    /does not turn them into one opaque agency score/,
  );
  assert.doesNotMatch(
    owner,
    /agency health score/i,
  );
});
