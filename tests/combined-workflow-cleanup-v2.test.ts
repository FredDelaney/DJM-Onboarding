import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const opportunities = readFileSync(
  new URL(
    '../app/(djm-os)/opportunities/page.tsx',
    import.meta.url,
  ),
  'utf8',
);

const home = readFileSync(
  new URL(
    '../app/(djm-os)/djm/page.tsx',
    import.meta.url,
  ),
  'utf8',
);

const agencyWorkspace = readFileSync(
  new URL(
    '../components/AgencyOperatingWorkspace.tsx',
    import.meta.url,
  ),
  'utf8',
);

const adminPlayer = readFileSync(
  new URL(
    '../app/admin/players/[id]/page.tsx',
    import.meta.url,
  ),
  'utf8',
);

const tellDjm = readFileSync(
  new URL(
    '../components/AiCapture.tsx',
    import.meta.url,
  ),
  'utf8',
);

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260901194000_djm_combined_workflow_cleanup_v2.sql',
    import.meta.url,
  ),
  'utf8',
);

test('legacy Opportunities now hands off to the shared market workspace', () => {
  assert.match(
    opportunities,
    /redirect\('\/agency\?view=market'\)/,
  );

  assert.doesNotMatch(
    opportunities,
    /djm_delete_preview|djm_delete_entity/,
  );
});

test('Home alias routes real work through the shared guarded agency action system', () => {
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
    /actionability\?\.mode === 'one_tap'/,
  );

  assert.match(
    agencyWorkspace,
    /action_prepare/,
  );

  assert.match(
    agencyWorkspace,
    /action_execute/,
  );

  assert.match(
    agencyWorkspace,
    /Nothing changes until you confirm/,
  );

  assert.doesNotMatch(
    home,
    /djm_complete_player_request|djm_home_item_controls/,
  );
});

test('player messages remain direction-aware and preserve the historical atomic reply contract', () => {
  assert.match(
    adminPlayer,
    /created_by/,
  );

  assert.match(
    adminPlayer,
    /replyingToRequestId/,
  );

  assert.match(
    adminPlayer,
    /djm_player_send_reply/,
  );

  assert.match(
    adminPlayer,
    /Send reply/,
  );

  assert.match(
    migration,
    /request_type,\s*status,\s*created_by,\s*completed_at/s,
  );

  assert.match(
    migration,
    /communication_task_candidates/,
  );
});

test('automatic communication task completion happens only for one unambiguous follow-up', () => {
  assert.match(
    migration,
    /if v_candidate_task_count = 1 then/,
  );

  assert.match(
    migration,
    /else\s+v_candidate_task_id := null/s,
  );
});

test('historical Home command centre migration preserves player-linked inbox routing', () => {
  assert.match(
    migration,
    /when t\.player_id is not null/,
  );

  assert.match(
    migration,
    /'\/admin\/players\/' \|\| t\.player_id::text \|\| '#inbox'/,
  );
});

test('ReDream AI unresolved captures use the guarded delete RPC', () => {
  assert.match(
    tellDjm,
    /redream_ai_delete_capture/,
  );

  assert.match(
    tellDjm,
    /Delete this update/,
  );

  assert.match(
    migration,
    /a\.status = 'applied'/,
  );

  assert.match(
    migration,
    /Undo the applied updates before deleting it/,
  );
});

test('historical recruitment promotion preserves the prospect subject', () => {
  assert.match(
    migration,
    /delete from djm_os\.football_intelligence_subjects created/,
  );

  assert.match(
    migration,
    /created\.player_id = v_player_id/,
  );

  assert.match(
    migration,
    /existing\.prospect_id = p_prospect_id/,
  );
});
