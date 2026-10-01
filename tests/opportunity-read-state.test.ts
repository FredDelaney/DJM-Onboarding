import assert from 'node:assert/strict';
import test from 'node:test';
import { opportunityReadState } from '../lib/opportunity-read-state.ts';

test('preloaded club needs do not report an empty deals tab', () => {
  const data = { market: { demand: { items: [] } } };
  assert.equal(opportunityReadState(data, 'needs'), 'ready');
  assert.equal(opportunityReadState(data, 'routes'), 'ready');
  assert.equal(opportunityReadState(data, 'deals'), 'loading');
});

test('an empty successful response is different from a missing or failed response', () => {
  assert.equal(opportunityReadState({ deals: {} }, 'deals'), 'ready');
  assert.equal(opportunityReadState({ opportunity_errors: { deals: true } }, 'deals'), 'error');
  assert.equal(opportunityReadState({ deals: { portfolio: { deals: ['cached'] } }, opportunity_errors: { deals: true } }, 'deals'), 'error');
  assert.equal(opportunityReadState({ deals: {}, opportunity_errors: {} }, 'deals'), 'ready');
});
