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

test('missing match percentages remain unknown rather than zero, and blockers suppress a high score',()=>{
 for(const value of [undefined,null,'', '   ',false,true,NaN]){const result=matchAssessment({overall_score:value as any});assert.equal(result.percentage,null);assert.equal(result.strength,'Insufficient evidence');assert.doesNotMatch(result.display,/%/);}
 assert.equal(matchAssessment({overall_score:0}).percentage,0);
 const blocked=matchAssessment({overall_score:99,hard_blockers:['Confirmed financial incompatibility']});assert.equal(blocked.strength,'Weak');assert.equal(blocked.percentage,null);assert.doesNotMatch(blocked.display,/99|%/);
 const legacy=matchAssessment({overall_score:99,reasoning:{source:'djm_fit_prediction_v3',strengths:['Position fits','Age fits']}});assert.equal(legacy.percentage,null);assert.equal(legacy.strength,'Moderate');assert.match(legacy.concerns.join(' '),/legacy fit estimate needs review/);
});
