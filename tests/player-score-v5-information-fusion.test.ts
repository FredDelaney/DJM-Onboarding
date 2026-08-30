import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260830170000_djm_player_score_v5_information_fusion.sql",
    import.meta.url,
  ),
  "utf8",
);

const ui = readFileSync(
  new URL("../components/PlayerIntelligencePanel.tsx", import.meta.url),
  "utf8",
);

function recencyWeight(ageDays: number) {
  if (ageDays < -1 || ageDays > 730) return 0;
  return Math.min(1, Math.max(0, Math.exp((-Math.log(2) * Math.max(0, ageDays)) / 365)));
}

function roleScore(effectiveMinutes: number) {
  if (effectiveMinutes <= 0) return null;
  return Math.min(100, Math.max(0, 100 * (1 - Math.exp(-Math.min(effectiveMinutes, 4000) / 1500))));
}

function roleQuality(effectiveMinutes: number, effectiveAppearances: number) {
  if (effectiveMinutes <= 0) return 0;
  return Math.min(
    1,
    Math.max(
      0,
      Math.sqrt(
        (1 - Math.exp(-effectiveMinutes / 900)) *
          (1 - Math.exp(-Math.max(0, effectiveAppearances) / 8)),
      ),
    ),
  );
}

function experienceQuality(age: number, seasons: number, careerMinutes: number) {
  if (seasons <= 0 || careerMinutes <= 0) return 0;
  const expectedSeasons = Math.max(1, Math.min(4, age - 18));
  const seasonQuality = Math.min(1, seasons / expectedSeasons);
  const minutesQuality = Math.min(1, careerMinutes / 6000);
  return Math.min(1, Math.max(0, Math.sqrt(seasonQuality * minutesQuality)));
}

test("V5 is source-controlled as a self-contained model rather than depending on runtime V4 helpers", () => {
  assert.match(migration, /djm_player_score_v5_information_fusion/);
  assert.match(migration, /djm_player_scorecard_v2_core/);
  assert.match(migration, /djm_player_scorecard_v4_runtime_core/);
  assert.doesNotMatch(migration, /private\.djm_v4_role_score/);
  assert.doesNotMatch(migration, /private\.djm_v4_sample_reliability/);
  assert.doesNotMatch(migration, /private\.djm_v4_benchmark_quality/);
});

test("recency decays continuously and has no six-month scoring cliff", () => {
  const day179 = recencyWeight(179);
  const day180 = recencyWeight(180);
  const day181 = recencyWeight(181);

  assert.ok(day179 > day180);
  assert.ok(day180 > day181);
  assert.ok(Math.abs(day180 - day181) < 0.01);
  assert.ok(Math.abs(recencyWeight(365) - 0.5) < 0.001);
  assert.equal(recencyWeight(731), 0);

  assert.match(migration, /half_life_days',365/);
  assert.match(migration, /hard_horizon_days',730/);
});

test("current-club live-season evidence may use a reviewed or synchronised as-of date", () => {
  assert.match(migration, /v_same_current_club/);
  assert.match(migration, /p_source_reviewed_at/);
  assert.match(migration, /p_source_synced_at/);
  assert.match(migration, /return least\(v_source_date, p_as_of\)/);
});

test("incomplete career history cannot masquerade as low experience", () => {
  const simonQuality = experienceQuality(24, 1, 1288);
  assert.ok(simonQuality < 0.35);

  assert.match(migration, /v_exp_quality >= \.35/);
  assert.match(migration, /Thin history is treated as unknown, not low experience/);
  assert.match(migration, /experience_history/);
});

test("V5 uses the canonical 30-30-15-10-10-5 dimensions but quality-adjusts their influence", () => {
  assert.match(migration, /'competition_level',30/);
  assert.match(migration, /'position_performance',30/);
  assert.match(migration, /'role_minutes',15/);
  assert.match(migration, /'experience',10/);
  assert.match(migration, /'trend',10/);
  assert.match(migration, /'availability',5/);
  assert.match(migration, /effective_component_weights/);
  assert.match(migration, /component_quality/);
});

test("missing performance creates a context-only provisional with a stronger neutral prior", () => {
  assert.match(migration, /v_grade := 'context_only'/);
  assert.match(migration, /v_prior_strength := 45/);
  assert.match(migration, /when 'context_only' then 45/);
  assert.match(migration, /v_prior_score\*v_prior_strength \+ v_weighted_total/);
});

test("Simon shadow fixture remains centrally stable while confidence falls to an evidence-honest level", () => {
  const benchmarkQuality = 0.82;
  const minutes = 1288;
  const appearances = 19;
  const level = 54;
  const role = roleScore(minutes)!;
  const roleQ = roleQuality(minutes, appearances);
  const expQ = experienceQuality(24, 1, 1288);

  assert.ok(expQ < 0.35, "thin history should exclude experience from score influence");

  const levelWeight = 30 * benchmarkQuality;
  const roleWeight = 15 * roleQ;
  const effectiveWeight = levelWeight + roleWeight;
  const weightedTotal = level * levelWeight + role * roleWeight;
  const raw = weightedTotal / effectiveWeight;
  const priorStrength = 45;
  const score = (50 * priorStrength + weightedTotal) / (priorStrength + effectiveWeight);
  const verificationQuality = 0.75; // live player status was reviewing during the shadow audit
  const qualityMean = (benchmarkQuality + roleQ + verificationQuality) / 3;
  const posteriorInformation = effectiveWeight / (effectiveWeight + priorStrength);
  const confidence = Math.min(
    45,
    Math.max(15, Math.round(100 * posteriorInformation * (0.65 + 0.35 * qualityMean))),
  );

  assert.ok(raw > 55 && raw < 56);
  assert.equal(Math.round(score), 52);
  assert.equal(confidence, 42);
});

test("Full, performance-backed provisional and context-only provisional are distinct evidence states", () => {
  assert.match(migration, /v_grade := 'full'/);
  assert.match(migration, /v_grade := 'performance_backed'/);
  assert.match(migration, /v_grade := 'context_only'/);
  assert.match(migration, /v_perf_quality >= \.60/);
  assert.match(migration, /v_effective_weight >= 68/);
  assert.match(migration, /v_effective_weight >= 38/);
  assert.match(migration, /v_effective_weight >= 30/);
});

test("manual judgement remains separate from model output", () => {
  assert.match(migration, /v_manual_active := after_s\.manual_score is not null/);
  assert.match(migration, /case when v_manual_active then 'manual_override' else 'full' end/);
  assert.match(migration, /case when v_manual_active then 'manual_override' else 'provisional' end/);
});

test("V5 stores an audit fingerprint, prior mechanics and an explicitly non-statistical evidence band", () => {
  assert.match(migration, /input_fingerprint/);
  assert.match(migration, /posterior_information/);
  assert.match(migration, /prior_strength/);
  assert.match(migration, /heuristic_evidence_band_not_statistical_confidence_interval/);
  assert.match(migration, /Evidence strength only\. It is not a probability/);
});

test("score-driving source changes mark the score stale rather than silently leaving an authoritative old number", () => {
  assert.match(migration, /djm_v5_score_stale_career_entries/);
  assert.match(migration, /djm_v5_score_stale_performance/);
  assert.match(migration, /djm_v5_score_stale_player_identity/);
  assert.match(migration, /djm_v5_score_stale_benchmark/);
  assert.match(migration, /evidence_freshness='stale'/);
});

test("the UI explains evidence state instead of presenting confidence as certainty", () => {
  assert.match(ui, /Evidence confidence/);
  assert.match(ui, /Provisional grade/);
  assert.match(ui, /Context-only provisional current-level estimate/);
  assert.match(ui, /Performance-backed provisional current-level estimate/);
  assert.match(ui, /Evidence band/);
  assert.match(ui, /not a CI/);
  assert.match(ui, /Missing: treated as unknown/);
  assert.match(ui, /Input fingerprint/);
  assert.doesNotMatch(ui, /neutral-imputed at 50/);
  assert.doesNotMatch(ui, /omitted from V4 provisional/);
});
