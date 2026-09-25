import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync(
  'app/(djm-os)/djm/page.tsx',
  'utf8',
);

const agencyWorkspace =
  readFileSync(
    'components/AgencyOperatingWorkspace.tsx',
    'utf8',
  );

const tellCapture = readFileSync(
  'components/AiCapture.tsx',
  'utf8',
);

const tellProcess = readFileSync(
  'supabase/functions/_shared/ai-process.ts',
  'utf8',
);

const aiRouter = readFileSync(
  'supabase/functions/_shared/ai-router.ts',
  'utf8',
);

const push = readFileSync(
  'supabase/functions/dispatch-player-push/index.ts',
  'utf8',
);

const removePlayer = readFileSync(
  'supabase/functions/remove-player/index.ts',
  'utf8',
);

const homeMigration =
  readFileSync(
    'supabase/migrations/20260903054235_flexible_home_attention_and_notification_quality_v1.sql',
    'utf8',
  );

test('shared Agency Home replaces the DJM alias and legacy dismiss controls with an evidence-led action queue', () => {
  assert.match(
    home,
    /redirect\('\/agency'\)/,
  );

  assert.match(
    agencyWorkspace,
    /redream_autopilot_home/,
  );

  assert.match(
    agencyWorkspace,
    /const priority = \[\.\.\.judgement, \.\.\.confirm, \.\.\.delegable\]/,
  );

  assert.match(
    agencyWorkspace,
    /onOpenAction\(command\)/,
  );

  assert.match(
    agencyWorkspace,
    /You are clear for now/,
  );

  assert.doesNotMatch(
    home,
    /djm_home_item_controls|djm_home_set_item_control/,
  );

  assert.match(
    homeMigration,
    /home_item_controls/,
  );

  assert.match(
    homeMigration,
    /state in \('dismissed','snoozed'\)/i,
  );
});

test('dismissed and snoozed tasks can suppress reminder delivery in historical deployments', () => {
  assert.match(
    homeMigration,
    /v_task_key:='system:task:'\|\|coalesce\(p_payload->>'task_id',''\)/,
  );

  assert.match(
    homeMigration,
    /c\.state='dismissed'/,
  );

  assert.match(
    homeMigration,
    /c\.state='snoozed'/,
  );

  assert.match(
    homeMigration,
    /interval '8 hours'/,
  );
});

test('ReDream AI polls faster, surfaces transcript progress and uses routed reasoning effort', () => {
  assert.match(
    tellCapture,
    /const ACTIVE_POLL_MS = 200;/,
  );

  assert.match(
    tellCapture,
    /const TRANSCRIBING_POLL_MS = 400;/,
  );

  assert.match(
    tellCapture,
    /const BACKGROUND_POLL_MS = 1000;/,
  );

  assert.match(
    tellCapture,
    /Transcript ready\. Doing it now\.\.\./,
  );

  assert.match(
    tellCapture,
    /open=\{!TERMINAL\.has\(receipt\.capture\.status\)\}/,
  );

  assert.match(
    tellProcess,
    /reasoning: \{ effort: reasoningEffort \}/,
  );

  assert.match(
    tellProcess,
    /selectAiRoute/,
  );

  assert.match(
    aiRouter,
    /reasoning_effort: 'none'/,
  );
});

test('push delivery groups related notifications without tenant-specific branding', () => {
  assert.match(
    push,
    /task-\$\{payload\.task_id\}/,
  );

  assert.match(
    push,
    /request-\$\{payload\.request_id\}/,
  );

  assert.match(
    push,
    /capture-\$\{payload\.capture_id\}/,
  );

  assert.doesNotMatch(
    push,
    /djm-task-|djm-request-|djm-tell-/,
  );
});

test('player deletion commits the player row before irreversible account cleanup', () => {
  const deleteDeclaration =
    removePlayer.indexOf(
      'const { data: deletedRows',
    );

  const playerDelete =
    removePlayer.indexOf(
      '.delete()',
      deleteDeclaration,
    );

  const authDelete =
    removePlayer.indexOf(
      'admin.auth.admin.deleteUser',
    );

  assert.ok(
    deleteDeclaration >= 0,
    'player deletion block must exist',
  );

  assert.ok(
    playerDelete >
      deleteDeclaration,
    'player row must be deleted in the deletion block',
  );

  assert.ok(
    authDelete > playerDelete,
    'auth cleanup must happen after the player row is gone',
  );

  assert.match(
    removePlayer,
    /linked_account_preserved/,
  );
});
