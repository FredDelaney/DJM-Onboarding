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
  assert.match(fn, /djm_upsert_pitchapi_player_snapshot/);
});

test("one-click refresh does not overwrite reviewed evidence owned by another source", () => {
  // PitchAPI current-data path.
  assert.match(
    fn,
    /exact\?\.source_reviewed_at\s*&&\s*!providerOwned/,
  );

  // API-Football fallback path.
  assert.match(
    fn,
    /exact\?\.source_reviewed_at\s*&&\s*!owned/,
  );
  assert.match(fn, /conflicts\s*\+\+/);
});

test("Player Score recalculation uses the signed-in admin JWT", () => {
  // The caller client must carry the incoming admin token, rather than scoring as service role.
  assert.match(
    fn,
    /createClient\(\s*url\s*,\s*Deno\.env\.get\("SUPABASE_ANON_KEY"\)\s*\|\|\s*serviceKey[\s\S]{0,320}Authorization:\s*`Bearer \$\{token\}`/,
  );
  assert.match(
    fn,
    /caller\.rpc\(\s*"djm_player_scorecard"\s*,\s*\{\s*p_player_id:\s*player\.id\s*\}\s*\)/,
  );
  assert.doesNotMatch(fn, /admin\.rpc\(\s*"djm_player_scorecard"/);
  assert.match(fn, /operation:\s*"recalculate_player_score"/);
  assert.match(fn, /result_status:\s*"skipped"/);
});

test("player profile exposes one-click refresh and Transfermarkt value", () => {
  assert.match(panel, /Refresh player data/);
  assert.match(panel, /Save verified TM value/);
  assert.match(panel, /transfermarkt_market_value/);
});
