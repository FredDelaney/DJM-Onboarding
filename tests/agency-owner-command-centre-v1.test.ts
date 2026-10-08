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

test('Business is a management-only entry point to the existing owner command centre', () => {
  assert.match(workspace, /AgencyOwnerCommandCentre/);
  assert.match(workspace, /key: 'business'/);
  assert.match(workspace, /const canSeeBusiness = \['owner', 'admin'\]/);
  assert.match(
    workspace,
    /!\['business','opportunities'\]\.includes\(item\.key\) \|\| canSeeBusiness/,
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
  assert.match(owner, /DEALS/);
  assert.match(owner, /TEAM/);
  assert.match(owner, /PLAYER SERVICE/);
  assert.match(owner, /Open receivables/);
  assert.match(owner, /LAST 30 DAYS/);
});

test('Commercial exposure remains evidence-led and multi-currency safe', () => {
  assert.match(
    owner,
    /not guaranteed revenue/,
  );
  assert.match(
    owner,
    /Totals are shown separately for each currency/,
  );
  assert.match(
    owner,
    /No exchange-rate conversion is applied/,
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
    /No utilisation percentage is estimated/,
  );
  assert.match(
    owner,
    /Operations, commercial exposure and platform activity are shown separately/,
  );
  assert.doesNotMatch(
    owner,
    /agency health score/i,
  );
});
