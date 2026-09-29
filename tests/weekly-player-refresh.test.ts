import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fn = readFileSync("supabase/functions/weekly-player-refresh/index.ts", "utf8");
const sync = readFileSync(
  "supabase/functions/_shared/football-data/thesportsdb-weekly.ts",
  "utf8",
);
const schedule = readFileSync(
  "supabase/migrations/20260830190000_djm_weekly_player_refresh_schedule_v1.sql",
  "utf8",
);
const bridge = readFileSync(
  "supabase/migrations/20260831052000_djm_weekly_refresh_service_bridge_v1.sql",
  "utf8",
);

test("weekly player refresh reuses the established protected scheduler secret", () => {
  assert.match(fn, /get_push_scheduler_secret/);
  assert.match(fn, /x-djm-cron/);
  assert.match(fn, /suppliedSecret\s*!==\s*expectedSecret/);
  assert.doesNotMatch(fn, /auth\.role\(\)/);
  assert.doesNotMatch(fn, /is_team_member/);
});

test("daily stale-first refresh uses real verification freshness rather than completeness alone", () => {
  assert.match(fn, /FRESHNESS_MS\s*=\s*20\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.match(fn, /BATCH_LIMIT\s*=\s*10/);
  assert.match(fn, /latestCheck\.get\(left\.id\)/);
  assert.match(fn, /latestCheck\.get\(right\.id\)/);
  assert.match(fn, /freeApplied/);
  assert.match(fn, /daily_stale_first_provider_then_cross_checked_web/);
  assert.match(schedule, /'17 3 \* \* \*'/);
  assert.match(schedule, /djm-weekly-player-data-refresh/);
});

test("scheduled data sync is conservative and never scrapes Transfermarkt", () => {
  assert.match(sync, /https:\/\/www\.thesportsdb\.com/);
  assert.match(sync, /exact\?\.source_reviewed_at\s*&&\s*!providerOwned/);
  assert.match(sync, /conflict/);
  assert.match(sync, /monotonic/);
  assert.doesNotMatch(sync, /transfermarkt/i);
});

test("weekly refresh keeps football data on the canonical public evidence boundary", () => {
  assert.doesNotMatch(fn, /\.schema\("djm_os"\)/);
  assert.doesNotMatch(sync, /\.schema\("djm_os"\)/);
  assert.match(fn, /player_source_refreshes/);
  assert.match(fn, /career_entries/);
});

test("scheduled evidence remains traceable through canonical writes", () => {
  assert.match(sync, /source_acceptance_method:\s*"scheduled_free_api_sync"/);
  assert.match(sync, /source_provider:\s*"thesportsdb"/);
  assert.match(sync, /source_url:\s*"https:\/\/www\.thesportsdb\.com\/"/);
  assert.match(sync, /source_synced_at:\s*now/);
});


const aiWorker = readFileSync("supabase/functions/refresh-player-stats-ai-worker/index.ts", "utf8");

test("AI fallback advances cumulative current-season figures without reducing trusted values", () => {
  assert.match(aiWorker, /FRESHNESS_MS=20\*60\*60\*1000/);
  assert.match(aiWorker, /newV>oldV/);
  assert.match(aiWorker, /source_synced_at:\s*now/);
  assert.match(aiWorker, /two independent supporting sources/);
  assert.match(aiWorker, /complete\(existing\)&&fresh\(existing\)&&!force/);
});
