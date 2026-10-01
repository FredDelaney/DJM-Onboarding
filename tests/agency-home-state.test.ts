import assert from 'node:assert/strict';
import test from 'node:test';
import { homeReadState, settleHomeReads, homeConversationHref } from '../lib/agency-home-state.ts';

test('missing and pending reads cannot produce an all-clear state', () => {
  assert.equal(homeReadState(undefined, ['operations', 'connected_work']), 'loading');
  assert.equal(homeReadState({ operations: 'ready', connected_work: 'loading' }, ['operations', 'connected_work']), 'loading');
  assert.equal(homeReadState({ operations: 'ready', connected_work: 'error' }, ['operations', 'connected_work']), 'error');
  assert.equal(homeReadState({ operations: 'ready', connected_work: 'ready' }, ['operations', 'connected_work']), 'ready');
});

test('failed refresh preserves evidence while explicitly marking it unavailable', () => {
  const previous = { operations: { deadlines: ['recorded task'] } };
  const patch = settleHomeReads(previous, [
    { status: 'rejected', reason: new Error('offline') },
    { status: 'fulfilled', value: { recent_conversations: [] } },
    { status: 'fulfilled', value: { items: [] } },
  ]);
  assert.deepEqual(patch.operations, previous.operations);
  assert.deepEqual(patch.home_reads, { operations: 'error', connected_work: 'ready', meeting_aftercare: 'ready' });
  assert.equal(homeReadState(patch.home_reads, ['meeting_aftercare']), 'ready');
});

test('recent conversations open the recorded entity in the current workspace', () => {
  const base = '/workspace/northstar';
  assert.equal(homeConversationHref(base, { player_id: 'a&b', person_id: 'c' }), `${base}?view=players&player=a%26b`);
  assert.equal(homeConversationHref(base, { person_id: 'contact' }), `${base}?view=network&person=contact`);
  assert.equal(homeConversationHref(base, { organisation_id: 'club' }), `${base}?view=network&club=club`);
  assert.equal(homeConversationHref(base, { prospect_id: 'target' }), `${base}?view=players&tab=recruitment&target=target`);
});
