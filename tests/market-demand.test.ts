import assert from 'node:assert/strict';
import test from 'node:test';

import { extractMarketCommercialTerms } from '../lib/market-demand.ts';

test('extracts a permanent transfer fee and weekly salary from a pasted brief', () => {
  assert.deepEqual(
    extractMarketCommercialTerms('Left-footed RW, age 19-23, permanent. Transfer fee up to €1.5m and salary €12k/week. EU passport preferred.'),
    {
      currency: 'EUR',
      maxAge: 23,
      minAge: 19,
      registrationNotes: 'EU passport preferred.',
      salaryBudget: 12_000,
      salaryPeriod: 'week',
      transferBudget: 1_500_000,
      transferType: 'transfer',
    },
  );
});

test('understands free-or-loan language without inventing financial limits', () => {
  assert.deepEqual(
    extractMarketCommercialTerms('Number 6, maximum age 23, free or loan. Salary to be discussed.'),
    {
      currency: null,
      maxAge: null,
      minAge: null,
      registrationNotes: null,
      salaryBudget: null,
      salaryPeriod: null,
      transferBudget: null,
      transferType: 'free_or_loan',
    },
  );
});

test('supports UK salary shorthand and comma-separated transfer fees', () => {
  assert.deepEqual(
    extractMarketCommercialTerms('Permanent striker. Transfer budget £1,500,000. Wages £20k per week.'),
    {
      currency: 'GBP',
      maxAge: null,
      minAge: null,
      registrationNotes: null,
      salaryBudget: 20_000,
      salaryPeriod: 'week',
      transferBudget: 1_500_000,
      transferType: 'transfer',
    },
  );
});

test('supports U+2014 age ranges in external text without a literal source character', () => {
  const emDash = String.fromCodePoint(0x2014);
  const result = extractMarketCommercialTerms(
    `Left winger, age 19${emDash}23, permanent.`,
  );

  assert.equal(result.minAge, 19);
  assert.equal(result.maxAge, 23);
});
