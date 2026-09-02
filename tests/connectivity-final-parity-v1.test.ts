import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Connections defaults global users to the device timezone', () => {
  const source = readFileSync('components/ConnectionsPanel.tsx', 'utf8');
  assert.doesNotMatch(source, /timezone:\s*['\"]Europe\/London['\"]/);
  assert.doesNotMatch(source, /saved\.timezone\s*\|\|\s*['\"]Europe\/London['\"]/);
  assert.match(source, /resolvedOptions\(\)\.timeZone/);
  assert.match(source, /deviceTimezone/);
});

test('hourly smart reminder scheduler is source controlled', () => {
  const source = readFileSync('supabase/migrations/20260902122251_djm_smart_reminder_schedule_v1.sql', 'utf8');
  assert.match(source, /djm-smart-reminders-hourly/);
  assert.match(source, /'15 \* \* \* \*'/);
  assert.match(source, /private\.djm_queue_smart_reminders\(\)/);
  assert.match(source, /dispatch-player-push/);
  assert.match(source, /dispatch-djm-email/);
});

test('free stats source preserves the production web evidence safeguards', () => {
  const source = readFileSync('supabase/functions/refresh-player-stats-free/index.ts', 'utf8');
  assert.match(source, /provider_first_then_current_cross_checked_public_web/);
  assert.match(source, /tools:\s*\[\{ type: \"web_search\" \}\]/);
  assert.match(source, /identity_match/);
  assert.match(source, /minItems:\s*2/);
  assert.match(source, /distinctHosts\.length < 2/);
  assert.match(source, /web_current_season_cross_checked_monotonic/);
  assert.match(source, /if \(newValue == null\) return oldValue/);
  assert.match(source, /score_refresh:\s*false/);
  assert.match(source, /comparison_refresh:\s*false/);
  assert.match(source, /from \"\.\.\/_shared\/football-data\/thesportsdb-weekly\.ts\"/);
});
