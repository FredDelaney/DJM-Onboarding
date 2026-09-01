import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const opportunities = readFileSync(
  new URL('../app/(djm-os)/opportunities/page.tsx', import.meta.url),
  'utf8',
);
const home = readFileSync(
  new URL('../app/(djm-os)/djm/page.tsx', import.meta.url),
  'utf8',
);
const adminPlayer = readFileSync(
  new URL('../app/admin/players/[id]/page.tsx', import.meta.url),
  'utf8',
);
const commandCentre = readFileSync(
  new URL('../lib/admin-command-centre.ts', import.meta.url),
  'utf8',
);
const tellDjm = readFileSync(
  new URL('../components/TellDjmCapture.tsx', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260901194000_djm_combined_workflow_cleanup_v2.sql',
    import.meta.url,
  ),
  'utf8',
);

test('Opportunities can delete an individual need without targeting the club', () => {
  assert.match(opportunities, /djm_delete_preview/);
  assert.match(opportunities, /djm_delete_entity/);
  assert.match(opportunities, /p_entity_type:\s*'club_need'/);
  assert.match(opportunities, /Delete need/);
});

test('Home supports explicit completion of real task and player request rows', () => {
  assert.match(home, /djm_network_set_task_status/);
  assert.match(home, /djm_complete_player_request/);
  assert.match(home, /can_complete/);
  assert.match(home, /Done/);
  assert.match(commandCentre, /recordId/);
});

test('player messages are direction-aware and reply through the atomic DJM reply RPC', () => {
  assert.match(adminPlayer, /created_by/);
  assert.match(adminPlayer, /replyingToRequestId/);
  assert.match(adminPlayer, /djm_player_send_reply/);
  assert.match(adminPlayer, /Send reply/);
  assert.match(migration, /request_type,\s*status,\s*created_by,\s*completed_at/s);
  assert.match(migration, /communication_task_candidates/);
});

test('automatic communication task completion happens only for one unambiguous follow-up', () => {
  assert.match(migration, /if v_candidate_task_count = 1 then/);
  assert.match(migration, /else\s+v_candidate_task_id := null/s);
});

test('Home command centre routes player-linked tasks back to the player inbox', () => {
  assert.match(migration, /when t\.player_id is not null/);
  assert.match(migration, /'\/admin\/players\/' \|\| t\.player_id::text \|\| '#inbox'/);
});

test('Tell DJM unresolved captures use the guarded delete RPC', () => {
  assert.match(tellDjm, /djm_tell_delete_capture/);
  assert.match(tellDjm, /Delete this update/);
  assert.match(migration, /a\.status = 'applied'/);
  assert.match(migration, /Undo the applied updates before deleting it/);
});

test('Recruitment promotion preserves the prospect subject and removes only the temporary player-only duplicate', () => {
  assert.match(
    migration,
    /delete from djm_os\.football_intelligence_subjects created/,
  );
  assert.match(migration, /created\.player_id = v_player_id/);
  assert.match(migration, /existing\.prospect_id = p_prospect_id/);
});
