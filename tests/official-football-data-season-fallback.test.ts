import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  'supabase/functions/refresh-official-football-data/index.ts',
  'utf8',
);

test('official profiles fall back to the newest season actually published by the source', () => {
  assert.match(source, /let activeCompetition = "veikkausliiga"/);
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

test('official squad roles are paced, retried and observable', () => {
  assert.match(source, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  assert.match(source, /response\.status !== 429 && response\.status < 500/);
  assert.match(source, /for \(const slug of TEAM_SLUGS\)/);
  assert.match(source, /await pause\(300\)/);
  assert.match(source, /role_rows: context\.roles\.size/);
  assert.match(source, /role_source_failures: context\.roleSourceFailures/);
});
