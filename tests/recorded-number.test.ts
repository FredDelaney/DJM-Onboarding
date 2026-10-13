import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRecordedNumber } from '../lib/recorded-number.ts';

test('missing and invalid recorded values cannot become numeric evidence', () => {
  for (const value of [null, undefined, '', '  ', false, true, [], {}, NaN, Infinity, -Infinity, 'unknown']) {
    assert.equal(hasRecordedNumber(value), false, String(value) + ' must stay missing');
  }
});

test('recorded zero and finite numbers remain valid evidence', () => {
  for (const value of [0, '0', ' 0 ', 13, '13.5', -2, '-2']) {
    assert.equal(hasRecordedNumber(value), true, String(value) + ' is recorded');
  }
});
