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
  assert.match(drawer, /Save strategy and continue/);
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
    /showFallback/,
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

test('Action Workspace prepares immediately after one user click', () => {
  assert.match(drawer, /preparedRef/);
  assert.match(drawer, /void prepare\(\)/);
  assert.match(drawer, /Checking the latest context/);
  assert.doesNotMatch(
    drawer,
    />\\s*Prepare action\\s*</,
  );
});

test('Action Workspace owns confirmation execution success and undo in one surface', () => {
  assert.match(drawer, /action_execute/);
  assert.match(drawer, /action_undo/);
  assert.match(drawer, /DONE/);
  assert.match(drawer, /UNDONE/);
  assert.match(drawer, /onApplied/);
});

test('career strategy progresses from strategy to confirmation to approval without repeating confirmation', () => {
  assert.match(
    drawer,
    /strategyActionType ===\s*'confirm_strategy_with_player'/,
  );
  assert.match(
    drawer,
    /strategyActionType ===\s*'complete_strategy_approval'/,
  );
  assert.doesNotMatch(
    drawer,
    /showCareerApproval\s*=\s*allowedNextSteps\.includes[^;]+!showCareerConfirmation/s,
  );
  assert.match(
    drawer,
    /Strategy[\s\S]+Player confirms[\s\S]+Agency approves/,
  );
});

test('Action Workspace can present live evidence and success criteria before confirmation', () => {
  assert.match(drawer, /request\.facts/);
  assert.match(drawer, /Done when/);
  assert.match(drawer, /You stay in control/);
  assert.match(workspace, /facts:\s*\[/);
});

test('Action Workspace stays tenant-neutral inside customer workspaces', () => {
  assert.doesNotMatch(
    drawer,
    /ReDream|DJM Sports Management/,
  );
  assert.match(
    drawer,
    /Reviewing current evidence/,
  );
});

test('Player Action Workspace explains why the action matters before asking for judgement', () => {
  assert.match(
    workspace,
    /const playerFacts = \[/,
  );
  assert.match(
    workspace,
    /label: 'Service control'/,
  );
  assert.match(
    workspace,
    /label: 'Next move'/,
  );
  assert.match(
    workspace,
    /label: 'Career timing'/,
  );
  assert.match(
    workspace,
    /label: 'Market coverage'/,
  );
  assert.match(
    workspace,
    /Assign primary owner/,
  );
  assert.match(
    workspace,
    /One accountable primary staff member owns the player/,
  );
});

test('Player preparation warnings are not misrouted as service-control mutations', () => {
  assert.doesNotMatch(
    workspace,
    /const controlFix =\s*item\.next_control_fix\?\.instruction \|\|\s*item\.next_preparation_fix\?\.instruction/s,
  );
});

test('Market search actions expose the recorded club brief before creating work', () => {
  assert.match(
    workspace,
    /label: 'Need'/,
  );
  assert.match(
    workspace,
    /label: 'Profile'/,
  );
  assert.match(
    workspace,
    /label: 'Coverage'/,
  );
  assert.match(
    workspace,
    /At least one credible candidate route is recorded against this club need/,
  );
  assert.match(
    workspace,
    /Create search task/,
  );
});

test('Market career actions expose career control without presenting readiness as probability', () => {
  assert.match(
    workspace,
    /label:\s*'Career control'/,
  );
  assert.match(
    workspace,
    /label: 'Access route'/,
  );
  assert.match(
    workspace,
    /Work-allocation signal, not success probability/,
  );
  assert.match(
    workspace,
    /The player-owned career strategy is current before the pursuit progresses externally/,
  );
});

test('Deal Action Workspace exposes commercial blockers route and value before judgement', () => {
  assert.match(
    workspace,
    /const dealFacts = \[/,
  );
  assert.match(
    workspace,
    /label: 'Primary blocker'/,
  );
  assert.match(
    workspace,
    /label: 'Commercial value'/,
  );
  assert.match(
    workspace,
    /label: 'Access route'/,
  );
  assert.match(
    workspace,
    /Warm introduction via/,
  );
  assert.match(
    workspace,
    /deal\.next_best_move\s*\?\.success_condition/,
  );
});

test('Deal actions distinguish internal introduction preparation from external sending', () => {
  assert.match(
    workspace,
    /Prepare introduction/,
  );
  assert.match(
    workspace,
    /Create introduction task/,
  );
  assert.match(
    workspace,
    /without sending an external message/,
  );
  assert.match(
    workspace,
    /hasExpectedCommission/,
  );
  assert.match(
    workspace,
    /const hasExpectedCommission =[\s\S]*deal\.expected_commission !== null[\s\S]*Number\.isFinite\(/,
  );
  assert.match(
    workspace,
    /const commissionValue =[\s\S]*hasExpectedCommission && deal\.currency[\s\S]*Commission not recorded/,
  );
  assert.match(
    workspace,
    /\{commissionValue\}/,
  );
});

test('Relationship Action Workspace carries live club context into the play', () => {
  assert.match(
    workspace,
    /const relationshipFacts = \[/,
  );
  assert.match(
    workspace,
    /label: 'Club'/,
  );
  assert.match(
    workspace,
    /label: 'Best route'/,
  );
  assert.match(
    workspace,
    /label: 'Current demand'/,
  );
  assert.match(
    workspace,
    /label: 'Live business'/,
  );
  assert.match(
    workspace,
    /facts: relationshipFacts/,
  );
});

test('Relationship plays remain human-controlled and distinguish their real next action', () => {
  assert.match(
    workspace,
    /Create introduction task/,
  );
  assert.match(
    workspace,
    /No external message is sent automatically/,
  );
  assert.match(
    workspace,
    /Protect deal/,
  );
  assert.match(
    workspace,
    /Work confirmed need/,
  );
  assert.match(
    workspace,
    /Review pitch route/,
  );
  assert.match(
    workspace,
    /human-led external action/,
  );
  assert.match(
    workspace,
    /action: 'play_prepare'/,
  );
});

test('Action Workspace uses customer language instead of execution plumbing', () => {
  assert.match(drawer, /Current context/);
  assert.match(
    drawer,
    /Context[\s\S]+Decision[\s\S]+Confirm/,
  );
  assert.match(drawer, /WHY NOW/);
  assert.match(drawer, /YOUR DECISION/);
  assert.match(drawer, /Done when/);
  assert.match(drawer, /You stay in control/);
  assert.match(
    drawer,
    /Done\. The latest view is up to/,
  );

  assert.doesNotMatch(drawer, /READY TO APPLY/);
  assert.doesNotMatch(drawer, /ACTION APPLIED/);
  assert.doesNotMatch(drawer, /ACTION REVERTED/);
  assert.doesNotMatch(drawer, /tenant evidence/);
  assert.doesNotMatch(workspace, /tenant evidence/);
  assert.doesNotMatch(
    workspace,
    /The server will/,
  );
  assert.doesNotMatch(drawer, /safety boundary/);
  assert.doesNotMatch(
    drawer,
    /workspace has updated the\s+workspace/,
  );
});
