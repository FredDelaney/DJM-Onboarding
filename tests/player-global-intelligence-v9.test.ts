import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync(new URL('../components/PlayerIntelligencePanel.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260831230000_djm_global_intelligence_v9_completion.sql', import.meta.url), 'utf8');
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const jsonImporter = readFileSync(new URL('../supabase/functions/import-player-evidence-json/index.ts', import.meta.url), 'utf8');

test('player intelligence UI uses the canonical global score contract', () => {
  assert.match(panel, /djm_player_global_intelligence/);
  assert.match(panel, /djm_refresh_player_global_intelligence/);
  assert.doesNotMatch(panel, /djm_player_scorecard['"]/);
  assert.doesNotMatch(panel, /Recalculate V5/);
  assert.match(panel, /5Y OUTLOOK/);
  assert.match(panel, /UPSIDE CEILING/);
  assert.match(panel, /Projection confidence/);
  assert.match(panel, /scorePublishable/);
  assert.match(panel, /CALIBRATING/);
  assert.match(panel, /SCORE DRIVERS/);
  assert.doesNotMatch(panel, /WHY THE SCORE MOVED/);
});

test('V9 makes the legacy public score RPC a global compatibility wrapper', () => {
  const wrapper = migration.match(/create or replace function public\.djm_player_scorecard\(p_player_id uuid\)[\s\S]*?comment on function public\.djm_player_scorecard\(uuid\)/)?.[0] || '';
  assert.match(wrapper, /djm_refresh_player_global_intelligence/);
  assert.doesNotMatch(wrapper, /djm_player_score_v5_compute/);
  assert.match(wrapper, /global_model/);
});

test('projection is universal, uncertainty-aware and gated by evidence quality', () => {
  assert.match(migration, /football_subject_projection_snapshots/);
  assert.match(migration, /subject_id uuid not null/);
  assert.match(migration, /current_score_not_yet_projection_grade/);
  assert.match(migration, /coalesce\(v_score\.confidence, 0\) < 45/);
  assert.match(migration, /coalesce\(v_score\.data_coverage, 0\) < 40/);
  assert.match(migration, /calibrated_probability', false/);
  assert.match(migration, /research_prior_until_longitudinal_outcomes_are_sufficient/);
  assert.match(migration, /'publishable'/);
});

test('reviewed deep-performance evidence can enter V7.1 without overriding stronger data', () => {
  assert.match(migration, /subject_reviewed_performance_signal/);
  assert.match(migration, /highest_quality_verified_position_signal/);
  assert.match(migration, /reviewed_quality > provider_quality/);
  assert.match(migration, /Missing categories are never zero-imputed/);
  assert.match(migration, /trg_global_score_from_reviewed_performance/);
  assert.match(migration, /refresh_subject_from_player_performance_trigger/);
  assert.match(jsonImporter, /normalisePositionGroup/);
  assert.match(jsonImporter, /CENTRAL_MIDFIELD: \"CM\"/);
});

test('comparison contract replaces the old headline score with global intelligence', () => {
  assert.match(migration, /rename to djm_player_comparison_legacy_v5/);
  assert.match(migration, /jsonb_set\(v_base,'\{scorecard\}'/);
  assert.match(migration, /DJM Global Score V7\.1 current demonstrated level/);
});

test('production JSON evidence importer is source-controlled and refreshes global intelligence', () => {
  assert.match(config, /\[functions\.import-player-evidence-json\]\nverify_jwt = true/);
  assert.match(jsonImporter, /djm_refresh_player_global_intelligence/);
  assert.doesNotMatch(jsonImporter, /rpc\(\"djm_player_scorecard\"/);
  assert.match(jsonImporter, /Global Intelligence/);
});
