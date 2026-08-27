import assert from 'node:assert/strict';
import test from 'node:test';

import {
  brainIntent,
  commandRecommendation,
  dealCredibility,
  matchAssessment,
  truthStateLabel,
} from '../lib/intelligence.ts';

test('hard blockers always win matching', () => {
  const result = matchAssessment({
    strengths: ['Position matches', 'Role evidence exists'],
    hard_blockers: ['EU passport required'],
  });
  assert.equal(result.strength, 'Weak');
  assert.deepEqual(result.hardBlockers, ['EU passport required']);
});

test('matching refuses precision when evidence is absent', () => {
  assert.equal(matchAssessment({}).strength, 'Insufficient evidence');
});

test('future scheduled actions can recommend hold', () => {
  const tomorrow = new Date(Date.now() + 48 * 3_600_000).toISOString();
  assert.equal(
    commandRecommendation({ kind: 'task', action_at: tomorrow }).kind,
    'Hold',
  );
});

test('overdue action is prioritised', () => {
  const yesterday = new Date(Date.now() - 24 * 3_600_000).toISOString();
  assert.equal(
    commandRecommendation({ kind: 'deal', action_at: yesterday }).kind,
    'Act now',
  );
});

test('deal credibility is qualitative and evidence-led', () => {
  assert.equal(dealCredibility({ stage: 'offer' }), 'High credibility');
  assert.equal(
    dealCredibility({ stage: 'qualifying', primary_blocker: 'Budget unknown' }),
    'Low credibility',
  );
});

test('truth states and Brain intents are deterministic', () => {
  assert.equal(truthStateLabel('inferred'), 'Inferred');
  assert.equal(truthStateLabel('made_up'), 'Unknown');
  assert.equal(brainIntent('What should I do today?'), 'today');
  assert.equal(brainIntent('What is Club X budget?'), 'commercial');
  assert.equal(brainIntent('Who do we know at Wellington Phoenix?'), 'contacts');
  assert.equal(brainIntent('Show all club contacts'), 'contacts');
  assert.equal(brainIntent('Which recruitment targets have no contact route?'), 'recruitment');
  assert.equal(brainIntent('Which signed players can play CDM?'), 'players');
  assert.equal(brainIntent('Show clubs in New Zealand'), 'clubs');
  assert.equal(brainIntent('Write me a poem'), 'unsupported');
});
