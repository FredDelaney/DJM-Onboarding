import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) =>
  fs.readFileSync(path, 'utf8');

const workspace = read(
  'components/AgencyOperatingWorkspace.tsx',
);

const drawer = read(
  'components/AgencyActionDrawer.tsx',
);

const drawerCss = read(
  'components/AgencyActionDrawer.module.css',
);

test('Universal Actionability has one tenant-native action drawer', () => {
  assert.match(workspace, /AgencyActionDrawer/);
  assert.match(workspace, /actionRequest/);
  assert.match(drawer, /action_prepare|request\.action/);
  assert.match(drawer, /Continue to confirmation/);
});

test('Home never surfaces Needs You work as a passive label', () => {
  assert.match(workspace, /onOpenAction\(command\)/);
  assert.match(workspace, /onOpenAction\(top\)/);
  assert.doesNotMatch(
    workspace,
    /<span className=\{styles\.needsInput\}>\s*\{command\.actionability/,
  );
});

test('unsupported execution still routes to the correct working area', () => {
  assert.match(workspace, /commandWorkingView/);
  assert.match(workspace, /source === 'deal_room'/);
  assert.match(workspace, /source === 'club_need'/);
  assert.match(workspace, /source === 'player'/);
  assert.match(drawer, /fallbackHref/);
});

test('action drawer stays outside the workspace grid flow', () => {
  assert.match(
    drawerCss,
    /\.backdrop\{[^}]*position:fixed/s,
  );
  assert.match(
    drawerCss,
    /\.drawer\{[^}]*max-height:100dvh/s,
  );
});

test('Player service actions can be completed where the exception is shown', () => {
  assert.match(
    workspace,
    /player_control_fix_prepare/,
  );
  assert.match(
    workspace,
    /player_service_move_prepare/,
  );
  assert.match(workspace, /Fix control/);
  assert.match(workspace, /Prepare next move/);
});

test('Market routes expose scouting and career prerequisites directly', () => {
  assert.match(
    workspace,
    /scouting_mandate_prepare/,
  );
  assert.match(
    workspace,
    /career_strategy_action_prepare/,
  );
  assert.match(workspace, /Start search/);
  assert.match(workspace, /Review strategy/);

  assert.match(drawer, /career_strategy_save/);
  assert.match(drawer, /career_strategy_confirm/);
  assert.match(drawer, /career_strategy_approve/);
  assert.match(drawer, /Save strategy draft/);
});

test('Deal actions use the guarded next-move and control-fix boundaries', () => {
  assert.match(
    workspace,
    /deal_next_move_prepare/,
  );
  assert.match(
    workspace,
    /deal_control_fix_prepare/,
  );
  assert.match(workspace, /Fix control/);
  assert.match(workspace, /Prepare next move/);
});

test('Relationship plays can be prepared beside the relationship evidence', () => {
  assert.match(workspace, /play_prepare/);
  assert.match(
    workspace,
    /relationship-play:/,
  );
  assert.match(
    workspace,
    /Prepare introduction/,
  );
  assert.match(workspace, /Prepare play/);
  assert.match(
    workspace,
    /topPlay\.play_type/,
  );
  assert.match(
    workspace,
    /fallbackLabel/,
  );
  assert.match(
    drawer,
    /\(result \|\| error\) && request\.fallbackHref/,
  );
});

test('aggregate warnings point to actionable rows instead of becoming dead ends', () => {
  assert.match(
    workspace,
    /Player service exceptions are surfaced on the cards above/,
  );
  assert.match(
    workspace,
    /Recovery actions are surfaced on the live deal rows above/,
  );
  assert.doesNotMatch(
    workspace,
    /Protect the player relationship before lower-value admin/,
  );
  assert.doesNotMatch(
    workspace,
    /Protect momentum before adding more pipeline/,
  );
});
