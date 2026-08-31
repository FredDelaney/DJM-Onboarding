import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260830084953_djm_universal_player_score_v3.sql",
  "utf8",
);
const universal = readFileSync(
  "supabase/functions/refresh-player-data-universal/index.ts",
  "utf8",
);
const panel = readFileSync("components/PlayerIntelligencePanel.tsx", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");

test("V3 keeps Full and Provisional scores separate", () => {
  assert.match(migration, /provisional_score smallint/);
  assert.match(migration, /score_tier in \('full','provisional','manual_override','unavailable'\)/);
  assert.match(migration, /neutral-imputed at 50 rather than fabricated/);
  assert.match(migration, /v_conf := least\(65/);
  assert.doesNotMatch(migration, /model_score=round\(v_provisional/);
});

test("V3 preserves the V2 Full Score core", () => {
  assert.match(migration, /rename to djm_player_scorecard_v2_core/);
  assert.match(migration, /r := public\.djm_player_scorecard_v2_core\(p_player_id\)/);
});

test("benchmark auto-resolution is team-gated and source-backed", () => {
  assert.match(migration, /private\.djm_autoresolve_player_benchmark/);
  assert.match(migration, /if not djm_os\.is_team_member\(\)/);
  assert.match(migration, /country_league_strength_anchors/);
  assert.match(migration, /djm_iffhs_tier_decay_v1/);
  assert.match(migration, /revoke all on function private\.djm_autoresolve_player_benchmark\(uuid\) from public, anon/);
});

test("universal refresh uses a provider ladder without exposing secrets", () => {
  assert.match(universal, /PitchAPI deep current/);
  assert.match(universal, /TheSportsDB current\/basic/);
  assert.match(universal, /API-Football historical/);
  assert.match(universal, /refresh-player-data/);
  assert.match(universal, /djm_player_scorecard/);
  assert.doesNotMatch(universal, /service_role.*NEXT_PUBLIC/i);
});

test("universal refresh never prints an undefined V5 confidence", () => {
  assert.match(
    universal,
    /score\?\.provisional_confidence \?\? score\?\.confidence/,
  );
  assert.match(universal, /Number\.isFinite\(confidence\)/);
  assert.doesNotMatch(
    universal,
    /\$\{score\?\.provisional_confidence\}% confidence/,
  );
});

test("TheSportsDB does not overwrite reviewed evidence owned by another source", () => {
  assert.match(universal, /exact\?\.source_reviewed_at && !owned/);
  assert.match(universal, /career_conflict_kept_for_review/);
});

test("current player intelligence UI preserves the historical V3 separation contract", () => {
  assert.match(panel, /refresh-player-data-universal/);
  assert.match(panel, /Full Score/);
  assert.match(panel, /Provisional/);
  assert.match(panel, /Missing for Full Score/);
  assert.match(panel, /provisional_confidence/);
  assert.match(panel, /Evidence confidence/);
  assert.doesNotMatch(panel, /neutral-imputed at 50/);
});

test("universal edge function is JWT protected in local config", () => {
  assert.match(
    config,
    /\[functions\.refresh-player-data-universal\][\s\S]*verify_jwt = true/,
  );
});
