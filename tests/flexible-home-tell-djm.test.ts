import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync('app/(djm-os)/djm/page.tsx', 'utf8');
const tellCapture = readFileSync('components/TellDjmCapture.tsx', 'utf8');
const tellProcess = readFileSync('supabase/functions/djm-tell-process/index.ts', 'utf8');
const push = readFileSync('supabase/functions/dispatch-player-push/index.ts', 'utf8');
const removePlayer = readFileSync('supabase/functions/remove-player/index.ts', 'utf8');
const homeMigration = readFileSync(
  'supabase/migrations/20260903054235_flexible_home_attention_and_notification_quality_v1.sql',
  'utf8',
);

test('DJM Home supports dismiss and snooze without deleting source records', () => {
  assert.match(home, /djm_home_item_controls/);
  assert.match(home, /djm_home_set_item_control/);
  assert.match(home, /Remove from Home/);
  assert.match(home, /Snooze until tomorrow/);
  assert.match(home, /DJM attention/);
  assert.doesNotMatch(home, /What should DJM do next\?/);
  assert.match(homeMigration, /home_item_controls/);
  assert.match(homeMigration, /state in \('dismissed','snoozed'\)/i);
});

test('dismissed and snoozed tasks can suppress reminder delivery', () => {
  assert.match(homeMigration, /v_task_key:='system:task:'\|\|coalesce\(p_payload->>'task_id',''\)/);
  assert.match(homeMigration, /c\.state='dismissed'/);
  assert.match(homeMigration, /c\.state='snoozed'/);
  assert.match(homeMigration, /interval '8 hours'/);
});

test('Tell DJM polls faster, surfaces transcript progress and uses non-reasoning extraction', () => {
  assert.match(tellCapture, /const POLL_MS = 650;/);
  assert.match(tellCapture, /Transcript ready\. Doing it now\.\.\./);
  assert.match(tellCapture, /open=\{!TERMINAL\.has\(receipt\.capture\.status\)\}/);
  assert.match(tellProcess, /reasoning: \{ effort: "none" \}/);
});

test('push delivery groups related task, request and Tell DJM notifications', () => {
  assert.match(push, /djm-task-\$\{payload\.task_id\}/);
  assert.match(push, /djm-request-\$\{payload\.request_id\}/);
  assert.match(push, /djm-tell-\$\{payload\.capture_id\}/);
});

test('player deletion commits the player row before irreversible account cleanup', () => {
  const deleteDeclaration = removePlayer.indexOf('const { data: deletedRows');
  const playerDelete = removePlayer.indexOf('.delete()', deleteDeclaration);
  const authDelete = removePlayer.indexOf('admin.auth.admin.deleteUser');
  assert.ok(deleteDeclaration >= 0, 'player deletion block must exist');
  assert.ok(playerDelete > deleteDeclaration, 'player row must be deleted in the deletion block');
  assert.ok(authDelete > playerDelete, 'auth cleanup must happen after the player row is gone');
  assert.match(removePlayer, /linked_account_preserved/);
});
