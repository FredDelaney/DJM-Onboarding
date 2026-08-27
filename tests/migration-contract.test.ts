import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260827130000_djm_intelligence_foundation.sql', import.meta.url),
  'utf8',
).toLowerCase();

test('intelligence migration preserves the visibility and truth contracts', () => {
  for (const state of ['verified', 'direct', 'sourced', 'inferred', 'unknown', 'contested', 'stale']) {
    assert.match(migration, new RegExp(`'${state}'`));
  }
  for (const visibility of ['player_private', 'djm_internal', 'club_shareable', 'explicit_collaboration']) {
    assert.match(migration, new RegExp(`'${visibility}'`));
  }
});

test('new player tables use RLS and deny anonymous access', () => {
  assert.match(migration, /alter table public\.player_goals enable row level security/);
  assert.match(migration, /alter table public\.player_service_events enable row level security/);
  assert.match(migration, /revoke all on public\.player_goals, public\.player_service_events from anon/);
  assert.doesNotMatch(migration, /grant .*public\.player_(?:goals|service_events).* to anon/);
});

test('staff role changes synchronise the internal authorisation boundary', () => {
  assert.match(migration, /create trigger sync_djm_team_membership_after_profile_change/);
  assert.match(migration, /on conflict \(user_id\) do update/);
  assert.match(migration, /set is_active = false/);
});

test('connected workflows record both service and decision-room events', () => {
  assert.match(migration, /create or replace function public\.djm_record_player_service/);
  assert.match(migration, /'player_service_recorded'/);
  assert.match(migration, /create or replace function public\.djm_create_decision_room_snapshot/);
  assert.match(migration, /'decision_room_snapshot_created'/);
});
