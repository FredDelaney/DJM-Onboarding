import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const capture = readFileSync('components/AiCapture.tsx', 'utf8');
const captureCss = readFileSync('components/AiCapture.module.css', 'utf8');
const worker = readFileSync('supabase/functions/_shared/ai-process.ts', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20261006084929_tell_redream_approval_today_v1.sql',
  'utf8',
);

test('Tell ReDream voice text and share capture stage resolved work and wait for approval', () => {
  assert.match(worker, /redream_ai_stage_action/);
  assert.match(worker, /voice_debrief/);
  assert.match(worker, /typed_debrief/);
  assert.match(worker, /share_target/);
  assert.match(migration, /p_action_type,'pending'/);
  assert.match(migration, /pending_approval_actions/);
  assert.match(migration, /approval_required/);
  assert.match(capture, /redream_ai_approve_capture/);
  assert.match(capture, /Approve updates/);
  assert.match(capture, /Nothing has changed yet/);
});

test('Tell ReDream preview exposes the agency consequences before commit', () => {
  for (const label of [
    'Club need',
    'Position',
    'Age',
    'Budget',
    'Suggested player',
    'Next action',
    'Owner',
    'Due',
    'Relationship event',
  ]) {
    assert.match(capture, new RegExp(label));
  }
  assert.match(capture, /From your words:/);
  assert.match(captureCss, /\.previewGrid/);
  assert.match(captureCss, /\.approvalBar/);
});

test('Edit returns the original note without committing staged changes', () => {
  assert.match(capture, /const editCapture = async/);
  assert.match(capture, /redream_ai_delete_capture/);
  assert.match(capture, /setMode\('text'\)/);
  assert.match(capture, /setText\(transcript\)/);
  assert.match(capture, /editingCapture \? 'Opening\.\.\.' : 'Edit'/);
});

test('explicit spoken task ownership is resolved inside the capture tenant', () => {
  assert.match(worker, /owner_name: nullableString/);
  assert.match(worker, /Dapo owns it/);
  assert.match(worker, /redream_ai_resolve_team_member/);
  assert.match(worker, /owner_user_id/);
  assert.match(migration, /platform\.tenant_memberships/);
  assert.match(migration, /tm\.is_active/);
  assert.match(migration, /REDREAM_AI_TASK_OWNER_ASSIGNED/);
});

test('approval preserves deterministic writes, provenance and undo', () => {
  assert.match(migration, /redream_ai_apply_action/);
  assert.match(migration, /redream_ai_apply_scout_observation/);
  assert.match(migration, /redream_ai_complete_email_thread_task/);
  assert.match(migration, /REDREAM_AI_CAPTURE_APPROVED/);
  assert.match(capture, /undoAction/);
  assert.match(capture, /Undo/);
  assert.match(migration, /verification_json/);
});

test('approval RPC is explicitly access checked and narrowly granted', () => {
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /private\.tell_assert_capture\(p_capture_id,true\)/);
  assert.match(migration, /private\.tell_request_tenant\(\)/);
  assert.match(
    migration,
    /Only the capture owner or a full-access agency user can approve this/,
  );
  assert.match(
    migration,
    /revoke all on function public\.redream_ai_approve_capture\(uuid\)/,
  );
  assert.match(
    migration,
    /grant execute on function public\.redream_ai_approve_capture\(uuid\)[\s\S]*to authenticated,service_role/,
  );
});

test('new approval-first source contains no literal em dash', () => {
  for (const source of [capture, captureCss, worker, migration]) {
    assert.equal(source.includes('\u2014'), false);
  }
});
