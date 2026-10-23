import assert from 'node:assert/strict';
import { test } from 'node:test';
import { homeCommandCategory, isHomePlayerDataReview } from '../lib/home-priority.ts';

const now = new Date(2026, 9, 23, 12);
test('a player data-review timestamp is not treated as an overdue business deadline', () => {
  const review = { source_type: 'player', command_type: 'Player review required', due_at: '2020-01-01', title: 'Contract statistics changed' };
  assert.equal(isHomePlayerDataReview(review), true);
  assert.equal(homeCommandCategory(review, now), 'FYI');
});
test('review reminders and other player work retain their actual deadline and actions', () => {
  for (const command of [
    { source_type: 'task', command_type: 'Player review required', title: 'Review player data: Alex', due_at: '2020-01-01' },
    { source_type: 'player', command_type: 'Player follow-up due', title: 'Call Alex about the contract', due_at: '2020-01-01' },
    { source_type: 'player', command_type: 'Contract decision approaching', due_at: '2020-01-01' },
    { source_type: 'task', title: 'Awaiting club response', due_at: '2020-01-01' },
  ]) {
    assert.equal(isHomePlayerDataReview(command), false);
    assert.equal(homeCommandCategory(command, now), 'Needs action now');
  }
});
test('a deadline later today remains attention now, not an upcoming risk', () => {
  assert.equal(homeCommandCategory({ title: 'Contract decision', due_at: new Date(2026, 9, 23, 23).toISOString() }, now), 'Needs action now');
  assert.equal(homeCommandCategory({ title: 'Contract decision', due_at: new Date(2026, 10, 1).toISOString() }, now), 'Upcoming risk');
});
test('undated and invalid-date context retains existing categories without fabricated deadlines', () => {
  for (const due_at of [undefined, null, 'not-a-date']) {
    assert.equal(homeCommandCategory({ title: 'Awaiting a reply from the club', due_at }, now), 'Waiting on someone');
    assert.equal(homeCommandCategory({ title: 'Review player match for club need', due_at }, now), 'Opportunity detected');
    assert.equal(homeCommandCategory({ source_type: 'capture', title: 'Clarify which Alex', due_at }, now), 'Needs action now');
  }
});
