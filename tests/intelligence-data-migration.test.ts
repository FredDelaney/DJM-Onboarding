import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260829082558_intelligence_data_layer_v1.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

const functionBlock = (name: string) => {
  const start = migration.indexOf(`function public.${name}`);
  const next = migration.indexOf("create or replace function", start + 20);
  return migration.slice(start, next === -1 ? migration.length : next);
};

test("intelligence evidence and competition identity are staff-only RLS objects", () => {
  assert.match(migration, /create table if not exists djm_os\.player_evidence/);
  assert.match(migration, /create table if not exists djm_os\.competitions/);
  assert.match(
    migration,
    /alter table djm_os\.player_evidence enable row level security/,
  );
  assert.match(
    migration,
    /alter table djm_os\.competitions enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table djm_os\.player_evidence from public, anon/,
  );
  assert.match(
    migration,
    /revoke all on table djm_os\.competitions from public, anon/,
  );
  assert.doesNotMatch(
    migration,
    /grant .*djm_os\.(?:player_evidence|competitions).* to anon/,
  );
});

test("public RPCs use caller privileges and explicit staff authorization", () => {
  for (const name of [
    "djm_intelligence_data",
    "djm_intelligence_player",
    "djm_intelligence_manual_import",
    "djm_intelligence_review_suggestion",
    "djm_intelligence_benchmark_upsert",
  ]) {
    const block = functionBlock(name);
    assert.notEqual(block.length, 0, `${name} should exist`);
    assert.match(block, /security invoker/);
    assert.match(block, /djm_os\.is_team_member\(\)/);
  }
});

test("manual import creates evidence and suggestions before canonical writes", () => {
  const importStart = migration.indexOf(
    "function public.djm_intelligence_manual_import",
  );
  const reviewStart = migration.indexOf(
    "function public.djm_intelligence_review_suggestion",
  );
  const importBlock = migration.slice(importStart, reviewStart);
  assert.match(importBlock, /insert into djm_os\.player_evidence/);
  assert.match(importBlock, /insert into public\.player_source_suggestions/);
  assert.doesNotMatch(importBlock, /insert into public\.career_entries/);

  const reviewBlock = migration.slice(
    reviewStart,
    migration.indexOf("function public.djm_intelligence_data"),
  );
  assert.match(reviewBlock, /if p_decision = 'accepted'/);
  assert.match(reviewBlock, /insert into public\.career_entries/);
  assert.match(
    reviewBlock,
    /p_decision not in \('accepted','rejected','kept_current','review_later'\)/,
  );
});

test("score calculation requires verified evidence and a verified benchmark", () => {
  const scoreStart = migration.indexOf("function public.djm_player_scorecard");
  const scoreEnd = migration.indexOf(
    "function public.djm_player_score_override",
  );
  const block = migration.slice(scoreStart, scoreEnd);
  assert.match(block, /c\.source_reviewed_at is not null/);
  assert.match(block, /v_minutes >= 500/);
  assert.match(block, /lb\.verified_at is not null/);
  assert.match(block, /not_enough_playing_time_data/);
  assert.match(block, /not_enough_benchmark_data/);
  assert.match(block, /potential remains separate from current score/);
});

test("score staleness and manual override preserve the model path", () => {
  assert.match(migration, /player_score_became_stale/);
  assert.match(
    migration,
    /after update of current_competition_id, current_league, current_country/,
  );
  assert.match(
    migration,
    /after insert or update of strength_score, verified_at, competition_id or delete/,
  );
  assert.match(migration, /manual_score = excluded\.manual_score/);
  assert.match(migration, /return public\.djm_player_scorecard\(p_player_id\)/);
  assert.match(migration, /player_score_override_removed/);
});

test("automated Transfermarkt queueing is disabled without deleting references", () => {
  assert.match(
    migration,
    /drop trigger if exists scouting_prospects_transfermarkt_autoqueue/,
  );
  assert.doesNotMatch(
    migration,
    /update public\.players set transfermarkt_url = null/,
  );
  assert.doesNotMatch(
    migration,
    /update djm_os\.scouting_prospects set transfermarkt_url = null/,
  );
});
