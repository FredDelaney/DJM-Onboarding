import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260829091800_djm_benchmark_acquisition_v1.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

const block = (name: string, nextName?: string) => {
  const start = migration.indexOf(`function public.${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const end = nextName
    ? migration.indexOf(`function public.${nextName}`, start + 20)
    : migration.length;
  return migration.slice(start, end === -1 ? migration.length : end);
};

test("migration extends benchmark provenance without seeding scores", () => {
  assert.match(migration, /add column if not exists raw_strength_value numeric/);
  assert.match(migration, /add column if not exists benchmark_provider text/);
  assert.match(migration, /add column if not exists methodology text/);
  assert.doesNotMatch(migration, /values\s*\(\s*'premier league'/);
  assert.doesNotMatch(migration, /values\s*\(\s*'serie a'/);
});

test("recent minutes require a defensible playing date", () => {
  const score = block("djm_player_scorecard", "djm_intelligence_benchmark_upsert");
  assert.match(score, /djm_career_evidence_date\(c\.season_label, c\.start_date, c\.end_date\)/);
  assert.match(score, /current_date - interval '24 months'/);
  assert.doesNotMatch(score, /coalesce\(c\.end_date, c\.start_date, current_date\)/);
  assert.match(migration, /source review time never makes old minutes recent/);
});

test("score distinguishes competition resolution from benchmark acquisition", () => {
  const score = block("djm_player_scorecard", "djm_intelligence_benchmark_upsert");
  assert.match(score, /competition_evidence_required/);
  assert.match(score, /benchmark_required/);
  assert.match(migration, /most_recent_verified_competition/);
  assert.match(score, /recommended_benchmark_source/);
  assert.match(score, /opta power rankings \/ stats perform league average/);
});

test("benchmark upsert keeps the existing RPC signature and records methodology", () => {
  const signature = /djm_intelligence_benchmark_upsert\(\s*p_id uuid default null,\s*p_competition_id uuid default null,\s*p_display_name text default null/;
  assert.match(migration, signature);
  const upsert = block("djm_intelligence_benchmark_upsert", "djm_intelligence_benchmark_import");
  assert.match(upsert, /league_average_power_rating/);
  assert.match(upsert, /opta_league_average_v1/);
  assert.match(upsert, /next_review_at/);
});


test("saving a benchmark automatically recalculates affected Player Scores", () => {
  const upsert = block("djm_intelligence_benchmark_upsert", "djm_intelligence_benchmark_import");
  assert.match(upsert, /djm_player_score_competition_context/);
  assert.match(upsert, /perform public\.djm_player_scorecard\(v_player_id\)/);
  assert.match(upsert, /player_scores_recalculated/);
});

test("bulk benchmark import is staff-only and source-backed", () => {
  const imported = block("djm_intelligence_benchmark_import", "djm_intelligence_data");
  assert.match(imported, /djm_os\.is_team_member\(\)/);
  assert.match(imported, /source url is required/);
  assert.match(imported, /observed date is required/);
  assert.match(imported, /must be between 0 and 100/);
  assert.match(migration, /revoke all on function public\.djm_intelligence_benchmark_import.*from public, anon/);
  assert.match(migration, /grant execute on function public\.djm_intelligence_benchmark_import.*to authenticated, service_role/);
});

test("the old live intelligence migration is not recreated or reapplied", () => {
  assert.doesNotMatch(migration, /create table if not exists djm_os\.player_evidence/);
  assert.doesNotMatch(migration, /create table if not exists djm_os\.competitions/);
});
