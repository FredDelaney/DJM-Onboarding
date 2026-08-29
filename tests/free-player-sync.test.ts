import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260829101500_djm_free_player_sync_v1.sql", "utf8");
const fn = readFileSync("supabase/functions/refresh-player-data/index.ts", "utf8");
const panel = readFileSync("components/PlayerIntelligencePanel.tsx", "utf8");

test("free sync stores structured Transfermarkt value without scraping Transfermarkt", () => {
  assert.match(migration, /transfermarkt_market_value numeric/);
  assert.match(migration, /transfermarkt_value_verified_at timestamptz/);
  assert.doesNotMatch(fn, /tmapi\.transfermarkt/i);
  assert.doesNotMatch(fn, /fetch\([^\n]*transfermarkt/i);
});

test("API-Football free sync is server-side and preserves the full provider stat payload", () => {
  assert.match(fn, /API_FOOTBALL_KEY/);
  assert.match(fn, /x-apisports-key/);
  assert.match(fn, /raw_metrics/);
  assert.match(fn, /player_provider_stat_snapshots/);
});

test("one-click refresh does not overwrite a reviewed row owned by another source", () => {
  assert.match(fn, /source_reviewed_at && !ownedByProvider/);
  assert.match(fn, /conflicts \+= 1/);
});

test("player profile exposes one-click refresh and Transfermarkt value", () => {
  assert.match(panel, /Refresh player data/);
  assert.match(panel, /Save verified TM value/);
  assert.match(panel, /transfermarkt_market_value/);
});
