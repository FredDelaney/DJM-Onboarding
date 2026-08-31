import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  'supabase/functions/refresh-official-football-data/index.ts',
  'utf8',
);

test('official profiles fall back to the newest season actually published by the source', () => {
  assert.match(source, /let latestSeasonRow: any = null/);
  assert.match(source, /Number\(rowSeason\) > Number\(latestSeasonRow\.season_label\)/);
  assert.match(source, /seasonRow \|\|= latestSeasonRow/);
  assert.match(source, /const season = String\(parsed\.season\.season_label\)/);
});

test('player and peer evidence always use the same resolved season', () => {
  assert.match(source, /context = await buildLeagueContext\(season\)/);
  assert.match(source, /provider_season_id: season/);
  assert.match(source, /startsWith\(seasonRow\.season_label\)/);
  assert.doesNotMatch(source, /buildLeagueContext\(requestedSeason\)/);
});
