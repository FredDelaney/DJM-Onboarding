import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260830153000_djm_player_score_v4_evidence_regression.sql",
  "utf8",
);
const panel = readFileSync("components/PlayerIntelligencePanel.tsx", "utf8");

test("V4 preserves V3 as its historical core", () => {
  assert.match(migration, /rename to djm_player_scorecard_v3_core/);
  assert.match(
    migration,
    /r := public\.djm_player_scorecard_v3_core\(p_player_id\)/,
  );
  assert.match(migration, /djm_player_score_v4_full_v2_core/);
});

test("V4 provisional weighting favours actual performance evidence", () => {
  assert.match(migration, /v_perf \* 40/);
  assert.match(migration, /v_level \* 20/);
  assert.match(migration, /v_role \* 20/);
  assert.match(migration, /v_exp \* 10/);
  assert.match(migration, /v_trend \* 5/);
  assert.match(migration, /v_avail \* 5/);
});

test("V4 never fills missing components with a fabricated neutral score", () => {
  assert.match(
    migration,
    /Only observed components are scored\. Missing components are omitted rather than filled/,
  );
  assert.doesNotMatch(migration, /coalesce\(v_perf,50\)/);
  assert.doesNotMatch(migration, /coalesce\(v_trend,50\)/);
  assert.doesNotMatch(migration, /coalesce\(v_exp,50\)/);
});

test("V4 regresses thin evidence towards 50", () => {
  assert.match(migration, /v_regression_prior numeric := 50/);
  assert.match(migration, /v_raw_observed := v_weighted_total \/ v_observed_weight/);
  assert.match(
    migration,
    /\(v_observed_weight \/ 100\.0\) \* \(\.55 \+ \.45 \* v_minutes_reliability\)/,
  );
  assert.match(migration, /least\(\s*\.85::numeric/);
  assert.match(
    migration,
    /v_regression_prior\s*\+ \(v_raw_observed - v_regression_prior\) \* v_regression_factor/,
  );
});

test("V4 confidence cannot outrun the evidence", () => {
  assert.match(migration, /round\(v_observed_weight\)::int/);
  assert.match(migration, /case when v_perf is null then 50 else 72 end/);
  assert.match(
    migration,
    /Confidence cannot exceed observed component coverage\. Without position-adjusted performance evidence it cannot exceed 50%/,
  );
});

test("V4 keeps provisional and full model values separate", () => {
  assert.doesNotMatch(migration, /model_score\s*=\s*round\(v_provisional/);
  assert.match(migration, /provisional_score=round\(v_provisional\)::smallint/);
  assert.match(migration, /v_tier := 'provisional'/);
  assert.match(migration, /'score_tier','provisional'/);
});

test("V4 refuses to publish a provisional number below the minimum context gate", () => {
  assert.match(migration, /recent_minutes_24m'\)::numeric,0\) >= 500/);
  assert.match(migration, /nullif\(b->>'level_score',''\) is not null/);
  assert.match(migration, /nullif\(b->>'role_score',''\) is not null/);
  assert.match(migration, /if v_observed_weight >= 40 then/);
});

test("current UI supersedes V4 copy while preserving transparent evidence semantics", () => {
  assert.match(panel, /Evidence confidence/);
  assert.match(panel, /Evidence grade/);
  assert.match(panel, /Evidence range/);
  assert.match(panel, /djm_player_global_intelligence/);
  assert.match(panel, /Missing evidence is treated as uncertainty, never as zero performance/);
  assert.doesNotMatch(panel, /neutral-imputed at 50/);
  assert.doesNotMatch(panel, /Missing: omitted from V4 provisional/);
});
