import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

const workspaceCss = readFileSync(
  'components/AgencyOperatingWorkspace.module.css',
  'utf8',
);

const demandControl = readFileSync(
  'supabase/migrations/20260914050302_fast_demand_control_v1.sql',
  'utf8',
);

test('opportunities already receive candidate names and career gate evidence', () => {
  assert.match(demandControl, /'candidates',candidates/);
  assert.match(demandControl, /'player_name',c\.player_name/);
  assert.match(demandControl, /'career_gate_state',c\.gate->>'state'/);
  assert.match(demandControl, /pm\.tenant_id=p_tenant_id/);
});

test('club demand shows real recorded candidate names in the operating workspace', () => {
  assert.match(workspace, /candidate_coverage\?\.candidates/);
  assert.match(workspace, /candidate\.player_name \|\| 'Player'/);
  assert.match(workspace, /aria-label="Recorded player routes"/);
  assert.match(workspace, /No recorded candidate yet/);
});

test('candidate context exposes the player decision gate without adding false precision', () => {
  assert.match(workspace, /careerGateLabel/);
  assert.match(workspace, /Open to progress/);
  assert.match(workspace, /Review needed/);
  assert.match(workspace, /Player decision needed/);
  assert.doesNotMatch(workspace, /candidate\.overall_score/);
  assert.doesNotMatch(workspace, /candidate\.readiness_score/);
});

test('candidate context stays compact when a need has many recorded players', () => {
  assert.match(workspace, /candidates\.slice\(0, 4\)/);
  assert.match(workspace, /\+\{hiddenCandidates\} more/);
});

test('live route context is responsive and workspace-scoped', () => {
  assert.match(workspaceCss, /\.routeCandidates\s*\{/);
  assert.match(workspaceCss, /\.routeCandidate\s*\{/);
  assert.match(
    workspaceCss,
    /@media \(max-width: 680px\)[\s\S]*\.routeCandidates/,
  );
});
