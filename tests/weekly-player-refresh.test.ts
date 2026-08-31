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
  assert.match(fn, /suppliedSecret !== expectedSecret/);
  assert.doesNotMatch(fn, /auth\.role\(\)/);
  assert.doesNotMatch(fn, /is_team_member/);
});

test("daily rotating stale-first batches provide weekly coverage inside free limits", () => {
  assert.match(fn, /Math\.ceil\(orderedPlayers\.length \/ 10\)/);
  assert.match(fn, /utcDay % rotationPages/);
  assert.match(fn, /\.slice\(rotationPage \* 10, rotationPage \* 10 \+ 10\)/);
  assert.match(fn, /inBatches\(selected, 2/);
  assert.match(fn, /daily_rotating_stale_first_weekly_coverage/);
  assert.match(schedule, /'17 3 \* \* \*'/);
  assert.match(schedule, /djm-weekly-player-data-refresh/);
});

test("scheduled data sync is conservative and never scrapes Transfermarkt", () => {
  assert.match(sync, /https:\/\/www\.thesportsdb\.com/);
  assert.match(sync, /exact\?\.source_reviewed_at && !providerOwned/);
  assert.match(sync, /conflict/);
  assert.match(sync, /djm_upsert_weekly_provider_snapshot/);
  assert.doesNotMatch(sync, /transfermarkt/i);
});

test("weekly refresh reaches private snapshots only through service-only bridge RPCs", () => {
  assert.match(fn, /djm_weekly_refresh_snapshot_status/);
  assert.match(sync, /djm_upsert_weekly_provider_snapshot/);
  assert.doesNotMatch(fn, /\.schema\("djm_os"\)/);
  assert.doesNotMatch(sync, /\.schema\("djm_os"\)/);
  assert.match(bridge, /security definer/);
  assert.match(
    bridge,
    /revoke all on function public\.djm_weekly_refresh_snapshot_status\(\) from authenticated/,
  );
  assert.match(
    bridge,
    /grant execute on function public\.djm_upsert_weekly_provider_snapshot\(jsonb\) to service_role/,
  );
  assert.match(bridge, /notify pgrst, 'reload schema'/);
});

test("scheduled evidence remains traceable and marks V5 stale through canonical writes", () => {
  assert.match(sync, /source_acceptance_method: "scheduled_free_api_sync"/);
  assert.match(sync, /source_synced_at: now/);
  assert.match(sync, /observed_at: now/);
  assert.match(sync, /synced_at: now/);
});
