import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const room = fs.readFileSync(
  'components/AgencyPursuitRoom.tsx',
  'utf8',
);
const marketEdge = fs.readFileSync(
  'supabase/functions/agency-market/index.ts',
  'utf8',
);

test('Market opens one tenant-native Pursuit Room from a live player-club route', () => {
  assert.match(workspace, /AgencyPursuitRoom/);
  assert.match(workspace, /Open route/);
  assert.match(workspace, /playerMatchId/);
});

test('Pursuit Room carries career dossier pitch response and deal control together', () => {
  assert.match(room, /PURSUIT ROOM/);
  assert.match(room, /CAREER PERMISSION/);
  assert.match(room, /CLUB DOSSIER/);
  assert.match(room, /PITCH CONTROL/);
  assert.match(room, /CLUB RESPONSE/);
  assert.match(room, /DEAL CONTROL/);
});

test('Pursuit Room reuses the existing guarded market write contracts', () => {
  for (const action of [
    'dossier_draft_create',
    'dossier_publish',
    'pitch_draft_create',
    'pitch_publish',
    'pitch_confirm_sent',
    'pitch_response_action_prepare',
    'pitch_response_action_execute',
    'pursuit_deal_create',
  ]) {
    assert.match(room, new RegExp(action));
  }
});

test('Pursuit Room preserves explicit human external-action boundaries', () => {
  assert.match(
    room,
    /Publishing is not the same as sending/,
  );
  assert.match(room, /I sent this pitch/);
  assert.match(
    room,
    /ReDream never marks a pitch sent/,
  );
  assert.match(
    room,
    /Pursuit readiness is not deal probability/,
  );
});

test('Pitch token retrieval is tenant-bound through the share player record', () => {
  assert.match(
    marketEdge,
    /action==="pitch_detail"/,
  );
  assert.match(
    marketEdge,
    /token,label,active,expires_at/,
  );
  assert.match(
    marketEdge,
    /\.eq\("tenant_id",tenantId\)\.maybeSingle\(\)/,
  );
  assert.match(
    marketEdge,
    /Pitch not found for agency/,
  );
});

test('Pursuit Room stays tenant-neutral and avoids legacy product routes', () => {
  assert.doesNotMatch(room, /\bDJM\b/);
  assert.doesNotMatch(room, /\/opportunities/);
  assert.doesNotMatch(room, /\/admin\/players/);
});
