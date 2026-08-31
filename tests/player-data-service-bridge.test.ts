import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const core = readFileSync(
  "supabase/functions/refresh-player-data/index.ts",
  "utf8",
);
const universal = readFileSync(
  "supabase/functions/refresh-player-data-universal/index.ts",
  "utf8",
);
const bridge = readFileSync(
  "supabase/migrations/20260831054000_djm_player_data_service_bridge_v1.sql",
  "utf8",
);

test("deployed player-data functions never request the private schema through PostgREST", () => {
  assert.doesNotMatch(core, /\.schema\("djm_os"\)/);
  assert.doesNotMatch(universal, /\.schema\("djm_os"\)/);
  assert.match(core, /djm_refresh_player_data_context/);
  assert.match(core, /djm_upsert_pitchapi_player_snapshot/);
  assert.match(core, /djm_upsert_pitchapi_performance_snapshot/);
  assert.match(universal, /djm_upsert_weekly_provider_snapshot/);
});

test("player-data bridges keep competition and evidence writes service-only", () => {
  assert.match(bridge, /security definer/);
  assert.match(
    bridge,
    /revoke all on function public\.djm_refresh_player_data_context\(text, jsonb\) from authenticated/,
  );
  assert.match(
    bridge,
    /grant execute on function public\.djm_upsert_pitchapi_player_snapshot\(jsonb\) to service_role/,
  );
  assert.match(
    bridge,
    /grant execute on function public\.djm_upsert_pitchapi_performance_snapshot\(jsonb\) to service_role/,
  );
  assert.match(bridge, /notify pgrst, 'reload schema'/);
});

test("the bridge preserves sourced benchmark and current performance provenance", () => {
  assert.match(bridge, /IFFHS 2025 national top-division anchor/);
  assert.match(bridge, /djm_iffhs_tier_decay_v1/);
  assert.match(bridge, /pitchapi_current_peer_v1/);
  assert.match(bridge, /raw_metrics/);
  assert.match(bridge, /source_reference/);
});
