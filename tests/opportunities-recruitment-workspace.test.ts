import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const opportunities = readFileSync(
  'app/(djm-os)/opportunities/page.tsx',
  'utf8',
);

const recruitment = readFileSync(
  'app/(djm-os)/recruitment/page.tsx',
  'utf8',
);

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

const migration = readFileSync(
  'supabase/migrations/20260901110000_djm_opportunities_recruitment_workspace_v1.sql',
  'utf8',
);

test('legacy Opportunities and Recruitment URLs now enter the shared ReDream market workspace', () => {
  assert.match(
    opportunities,
    /redirect\('\/agency\?view=market'\)/,
  );

  assert.match(
    recruitment,
    /redirect\('\/agency\?view=players&tab=recruitment'\)/,
  );
});

test('shared Market keeps demand control and scouting capabilities tenant-native', () => {
  assert.match(
    workspace,
    /redream_autopilot_market/,
  );

  assert.match(
    workspace,
    /candidate_coverage/,
  );

  assert.match(
    workspace,
    /club_need_id/,
  );

  assert.match(
    workspace,
    /career_gate_state/,
  );

  assert.doesNotMatch(
    opportunities,
    /djm_market_|djm_opportunity_/,
  );
});

test('historical recruitment migration remains source-controlled without defining the current UI', () => {
  assert.match(
    migration,
    /club_need_id = p_need_id/,
  );

  assert.match(
    migration,
    /Only the task owner can edit this task/,
  );

  assert.match(
    migration,
    /Task contact must be linked to this club/,
  );
});
