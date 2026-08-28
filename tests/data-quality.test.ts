import assert from 'node:assert/strict';
import test from 'node:test';

import { publishedDossierNeedsCurrentSeason } from '../lib/data-quality.ts';

test('published dossiers without current-season evidence are surfaced', () => {
  assert.equal(
    publishedDossierNeedsCurrentSeason({
      published: true,
      currentSeasonLabel: null,
      currentSeasonStart: null,
      now: new Date('2026-08-28T00:00:00Z'),
    }),
    true,
  );
});

test('a current published season is accepted', () => {
  assert.equal(
    publishedDossierNeedsCurrentSeason({
      published: true,
      currentSeasonLabel: '2026/27',
      currentSeasonStart: '2026-07-01',
      now: new Date('2026-08-28T00:00:00Z'),
    }),
    false,
  );
});

test('draft dossiers do not create public freshness issues', () => {
  assert.equal(
    publishedDossierNeedsCurrentSeason({
      published: false,
      currentSeasonLabel: null,
      currentSeasonStart: null,
    }),
    false,
  );
});
