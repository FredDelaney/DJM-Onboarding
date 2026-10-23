import assert from 'node:assert/strict';
import test from 'node:test';
import { playerRosterPriority } from '../lib/player-roster-priority.ts';

const now = new Date(2026, 9, 23, 15);
const setup = { fix_type: 'set_player_next_action', instruction: 'Set one concrete player next action and due date.' };
const maintain = { move_type: 'maintain_player_plan', instruction: 'Keep the player plan current.' };

test('missing-plan guidance is quiet and does not pretend to be urgent work', () => {
  const result = playerRosterPriority({ service: { next_control_fix: setup, next_service_move: maintain } }, now);
  assert.equal(result.kind, 'control');
  assert.equal(result.tone, 'calm');
  assert.equal(result.badge, 'Set next step');
  assert.equal(result.dueAt, null);
});

test('a real contract move is not hidden behind setup guidance or given an unrelated deadline', () => {
  const result = playerRosterPriority({
    identity: { next_action: 'Call the player', next_action_due: '2026-11-02' },
    service: { next_control_fix: setup, next_service_move: { move_type: 'contract_strategy', instruction: 'Agree the extension strategy.' } },
  }, now);
  assert.equal(result.kind, 'service');
  assert.equal(result.badge, 'Contract decision');
  assert.equal(result.instruction, 'Agree the extension strategy.');
  assert.equal(result.dueAt, null);
});

test('actual overdue and today actions survive generic control guidance', () => {
  for (const [date, badge] of [['2026-10-22', 'Overdue'], ['2026-10-23', 'Due today']]) {
    const result = playerRosterPriority({ identity: { next_action: 'Call the club', next_action_due: date },
      service: { next_control_fix: setup, next_service_move: maintain } }, now);
    assert.equal(result.kind, 'work');
    assert.equal(result.badge, badge);
    assert.equal(result.instruction, 'Call the club');
    assert.equal(result.dueAt, date);
  }
});

test('a due date remains a calendar day rather than becoming overdue at midnight', () => {
  for (const hour of [0, 12, 23]) {
    assert.equal(playerRosterPriority({ identity: { next_action: 'Check the trial', next_action_due: '2026-10-23' } },
      new Date(2026, 9, 23, hour)).badge, 'Due today');
  }
});

test('recorded future work remains visible without being marked urgent', () => {
  const result = playerRosterPriority({ identity: { next_action: 'Check the trial dates', next_action_due: '2026-10-29' },
    service: { next_service_move: maintain } }, now);
  assert.equal(result.kind, 'work');
  assert.equal(result.tone, 'calm');
  assert.equal(result.instruction, 'Check the trial dates');
  assert.equal(result.dueAt, '2026-10-29');
});

test('an undated recorded action asks for its date without discarding the actual objective', () => {
  const result = playerRosterPriority({ identity: { next_action: 'Discuss the offer' }, service: { next_control_fix: setup } }, now);
  assert.equal(result.kind, 'control');
  assert.equal(result.badge, 'Set a date');
  assert.equal(result.actionLabel, 'Set due date');
  assert.equal(result.instruction, 'Discuss the offer');
});

test('an overdue player request retains precedence over an overdue routine next action', () => {
  const result = playerRosterPriority({ identity: { next_action: 'Update the profile', next_action_due: '2026-10-21' },
    service: { next_service_move: { move_type: 'resolve_player_request', instruction: 'Respond to the player request.' } } }, now);
  assert.equal(result.badge, 'Player request');
  assert.equal(result.instruction, 'Respond to the player request.');
  assert.equal(result.dueAt, null);
});

test('restricted summaries reveal no task, deadline, contract or service instruction', () => {
  const result = playerRosterPriority({ access: { restricted: true }, identity: { next_action: 'Private objective', next_action_due: '2026-10-20' },
    service: { next_control_fix: setup, next_service_move: { move_type: 'contract_strategy', instruction: 'Private contract plan' } } }, now);
  assert.equal(result.badge, 'Assigned player');
  assert.equal(result.instruction, null);
  assert.equal(result.dueAt, null);
  assert.equal(result.actionLabel, null);
});

test('invalid dates do not produce an invented overdue action or an unrenderable deadline', () => {
  for (const date of ['not-a-date', '2026-02-31']) {
    const result = playerRosterPriority({ identity: { next_action: 'Review the offer', next_action_due: date },
      service: { next_control_fix: setup } }, now);
    assert.equal(result.tone, 'calm');
    assert.equal(result.badge, 'Set a date');
    assert.equal(result.dueAt, null);
  }
});

test('an empty summary does not claim that the player data is current', () => {
  const result = playerRosterPriority({}, now);
  assert.equal(result.badge, 'Next step not set');
  assert.equal(result.kind, 'none');
  assert.equal(result.actionLabel, null);
});
