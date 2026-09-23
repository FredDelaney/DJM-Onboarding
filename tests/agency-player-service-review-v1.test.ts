import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const player360 = fs.readFileSync(
  'components/AgencyEntityIntelligenceDrawer.tsx',
  'utf8',
);
const review = fs.readFileSync(
  'components/AgencyPlayerServiceReviewDrawer.tsx',
  'utf8',
);

test('Player 360 opens one Player Service Review without another daily navigation area', () => {
  assert.match(workspace, /AgencyPlayerServiceReviewDrawer/);
  assert.match(player360, /Service review/);
  assert.doesNotMatch(workspace, /key: 'service-review'/);
});

test('Player Service Review composes the existing service proof and history contracts', () => {
  for (const action of [
    'player_review_pack',
    'player_service_statement',
    'player_value_proof_history',
    'player_value_proof_delta',
  ]) {
    assert.match(review, new RegExp(action));
  }
});

test('Player-safe preview stays explicitly separated from internal deal intelligence', () => {
  assert.match(review, /PLAYER-SAFE PREVIEW/);
  assert.match(review, /Club names remain hidden/);
  assert.match(review, /Nothing is sent to the player automatically/);
  assert.match(review, /internal negotiation, relationship and commercial intelligence remains separate/);
});

test('Historical comparison requires persisted evidence instead of a fabricated baseline', () => {
  assert.match(review, /No comparison yet/);
  assert.match(review, /At least two persisted snapshots are required/);
  assert.match(review, /does not fabricate a historical baseline/);
  assert.match(review, /negative delta is not automatically deterioration/);
});

test('Proof snapshot capture is explicit and uses the existing audited contract', () => {
  assert.match(review, /player_value_proof_capture/);
  assert.match(review, /Capture current proof snapshot/);
  assert.match(review, /same-day 30-day capture refreshes/);
});

test('Review actions remain inside existing guarded player workflows', () => {
  assert.match(review, /player_service_move_prepare/);
  assert.match(review, /career_strategy_action_prepare/);
  assert.match(review, /Prepare service action/);
  assert.match(review, /Prepare career review/);
});

test('Player Service Review stays tenant-neutral and avoids legacy routes', () => {
  assert.doesNotMatch(review, /\bDJM\b/);
  assert.doesNotMatch(review, /\/admin\//);
});
