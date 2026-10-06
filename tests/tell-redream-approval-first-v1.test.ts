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
const approvalSchemaFix = readFileSync(
  'supabase/migrations/20261006092915_fix_tell_redream_approval_capture_schema.sql',
  'utf8',
);
const workerClaimFix = readFileSync(
  'supabase/migrations/20261006094427_include_channel_in_ai_worker_claim.sql',
  'utf8',
);
const ownerResolverFix = readFileSync(
  'supabase/migrations/20261006094938_secure_ai_team_member_resolver.sql',
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

test('worker claim preserves capture channel so approval-first routing cannot silently downgrade', () => {
  assert.match(workerClaimFix, /'channel',c\.channel/);
  assert.match(workerClaimFix, /redream_ai_worker_claim/);
  assert.match(worker, /const captureChannel = String\(/);
  assert.match(worker, /capture\?\.channel/);
  assert.match(worker, /\["voice_debrief", "typed_debrief"\]\.includes\(captureChannel\)/);
});

test('spoken owner resolver is privileged only for the internal service worker', () => {
  assert.match(ownerResolverFix, /STABLE SECURITY DEFINER/);
  assert.match(ownerResolverFix, /SET search_path TO ''/);
  assert.match(ownerResolverFix, /platform\.tenant_memberships/);
  assert.match(
    ownerResolverFix,
    /revoke all on function public\.redream_ai_resolve_team_member\(uuid,text\) from public,anon,authenticated/,
  );
  assert.match(
    ownerResolverFix,
    /grant execute on function public\.redream_ai_resolve_team_member\(uuid,text\) to service_role/,
  );
  assert.doesNotMatch(
    ownerResolverFix,
    /grant execute on function public\.redream_ai_resolve_team_member\(uuid,text\) to authenticated/,
  );
});


test('player self-statements prefer the signed player identity over a duplicate contact lookup', () => {
  assert.match(worker, /function preferSignedPlayerReference/);
  assert.match(worker, /claimType === "player_preference"/);
  assert.match(worker, /claimType === "player_transfer_preference"/);
  assert.match(worker, /next\.player_name = next\.contact_name/);
  assert.match(worker, /if \(playerName && contactName && playerName === contactName\)/);
  assert.match(worker, /Kota told me he wants Denmark means player_name Kota, not contact_name Kota/);
  assert.match(worker, /preferSignedPlayerReference\([\s\S]*enrichNeedDependentAction/);
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

test('follow-up approval function matches the real captures schema', () => {
  const captureUpdateStart = approvalSchemaFix.indexOf('update djm_os.captures');
  const captureUpdateEnd = approvalSchemaFix.indexOf(
    'where id=p_capture_id and tenant_id=v_tenant;',
    captureUpdateStart,
  );
  const captureUpdate = approvalSchemaFix.slice(captureUpdateStart, captureUpdateEnd);
  assert.ok(captureUpdateStart >= 0);
  assert.ok(captureUpdateEnd > captureUpdateStart);
  assert.doesNotMatch(captureUpdate, /updated_at=now\(\)/);
  assert.match(approvalSchemaFix, /redream_ai_approve_capture/);
});

test('new approval-first source contains no literal em dash', () => {
  for (const source of [capture, captureCss, worker, migration, approvalSchemaFix, workerClaimFix, ownerResolverFix]) {
    assert.equal(source.includes('\u2014'), false);
  }
});
