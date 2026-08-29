import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260829094600_djm_player_score_v2.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

const snapshotAliasHotfix = readFileSync(
  new URL(
    "../supabase/migrations/20260829103000_fix_djm_player_score_v2_snapshot_alias.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

test("V2 adds verified performance evidence without seeding player scores", () => {
  assert.match(migration, /create table if not exists djm_os\.player_performance_snapshots/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /peer_group_description text not null/);
  const rpcStart = migration.indexOf("function public.djm_player_performance_snapshot_upsert");
  assert.doesNotMatch(migration.slice(0, rpcStart), /insert into djm_os\.player_performance_snapshots/);
});

test("V2 current score contains all major football components", () => {
  const scoreStart = migration.indexOf("function public.djm_player_scorecard");
  const block = migration.slice(scoreStart);
  for (const token of [
    "league_strength_score",
    "performance_score",
    "role_score",
    "experience_score",
    "trend_score",
    "availability_score",
    "age_performance_adjustment",
    "data_coverage",
  ]) assert.match(block, new RegExp(token));
  assert.match(block, /model_version','djm_player_score_v2/);
});

test("old football decays rather than remaining fully current", () => {
  assert.match(migration, /current_date - p_date <= 180 then 1/);
  assert.match(migration, /current_date - p_date <= 365 then 0\.85/);
  assert.match(migration, /current_date - p_date <= 548 then 0\.65/);
  assert.match(migration, /current_date - p_date <= 730 then 0\.45/);
  assert.match(migration, /else 0::numeric/);
  assert.match(migration, /when current_date - p_date <= 1460 then 0\.65/);
  assert.match(migration, /when current_date - p_date <= 2190 then 0\.35/);
  assert.match(migration, /else 0\.15::numeric/);
});

test("V2 requires position-adjusted performance instead of scoring league and minutes alone", () => {
  assert.match(migration, /elsif v_performance_score is null then\s+v_status := 'performance_data_required'/);
  assert.match(migration, /v_coverage := 30 \+ 30 \+ 15/);
  assert.match(migration, /performance percentiles must be benchmarked against a relevant position/);
});

test("age is capped and recent strong performance reduces its current-level penalty", () => {
  assert.match(migration, /p_performance_score >= 75 then \.35/);
  assert.match(migration, /return -least\(6::numeric/);
  assert.match(migration, /when 'gk' then 32/);
  assert.match(migration, /when 'cb' then 31/);
  assert.match(migration, /when 'w' then 28/);
});

test("Potential has a larger forward age effect than current Player Score", () => {
  assert.match(migration, /private\.djm_potential_age_adjustment/);
  assert.match(migration, /return -least\(18::numeric/);
  assert.match(migration, /potential_model_score/);
});

test("performance RPC is staff-only and uses caller privileges", () => {
  const start = migration.indexOf("function public.djm_player_performance_snapshot_upsert");
  const end = migration.indexOf("function public.djm_player_performance_data", start);
  const block = migration.slice(start, end);
  assert.match(block, /security invoker/);
  assert.match(block, /djm_os\.is_team_member\(\)/);
  assert.match(migration, /revoke all on function public\.djm_player_performance_snapshot_upsert\(uuid,jsonb\) from public, anon/);
});

test("V2 scorer avoids the PL/pgSQL snapshot alias collision", () => {
  const scorerStart = snapshotAliasHotfix.indexOf("function public.djm_player_scorecard");
  const scoredStart = snapshotAliasHotfix.indexOf("with scored as", scorerStart);
  const scoredEnd = snapshotAliasHotfix.indexOf("from scored", scoredStart);
  assert.ok(scorerStart >= 0 && scoredStart > scorerStart && scoredEnd > scoredStart);

  const scoredCte = snapshotAliasHotfix.slice(scoredStart, scoredEnd);
  assert.match(scoredCte, /from\s+djm_os\.player_performance_snapshots\s+snap\b/);
  assert.doesNotMatch(scoredCte, /from\s+djm_os\.player_performance_snapshots\s+s\b/);
  for (const field of [
    "player_id",
    "position_group",
    "overall_performance_percentile",
    "attacking_percentile",
    "creativity_percentile",
    "progression_percentile",
    "possession_percentile",
    "defending_percentile",
    "aerial_percentile",
    "goalkeeping_percentile",
    "physical_percentile",
    "discipline_percentile",
    "evidence_date",
    "verified_at",
    "minutes",
  ]) {
    assert.match(scoredCte, new RegExp(`\\bsnap\\.${field}\\b`));
  }
});
