import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const clubPath = new URL(
  '../components/AgencyClubAccountDrawer.tsx',
  import.meta.url,
);

const pursuitPath = new URL(
  '../components/AgencyPursuitRoom.tsx',
  import.meta.url,
);

const workspacePath = new URL(
  '../components/AgencyOperatingWorkspace.tsx',
  import.meta.url,
);

test('Club opens the exact recorded player pursuit instead of a generic market page', async () => {
  const club = await readFile(
    clubPath,
    'utf8',
  );

  assert.match(
    club,
    /onOpenPursuit/,
  );
  assert.match(
    club,
    /playerMatchId:/,
  );
  assert.match(
    club,
    /careerGateState:/,
  );
  assert.match(
    club,
    /accessLabel:/,
  );
  assert.match(
    club,
    /Open pursuit/,
  );
});

test('Club can open the exact Player Profile from a live route', async () => {
  const club = await readFile(
    clubPath,
    'utf8',
  );

  assert.match(
    club,
    /onOpenPlayer/,
  );
  assert.match(
    club,
    /Player Profile/,
  );
  assert.match(
    club,
    /pursuit\s*\?\.player\s*\?\.player_id/,
  );
});

test('workspace turns a Club player handoff into the canonical Player Profile route', async () => {
  const workspace = await readFile(
    workspacePath,
    'utf8',
  );

  assert.match(
    workspace,
    /onOpenPlayer=\{\(playerId\)/,
  );
  assert.match(
    workspace,
    /view=players&player=/,
  );
  assert.match(
    workspace,
    /encodeURIComponent/,
  );
  assert.match(
    workspace,
    /setPursuitRequest\(request\)/,
  );
});

test('Pursuit Room refreshes its own current pitch state regardless of origin workspace', async () => {
  const pursuit = await readFile(
    pursuitPath,
    'utf8',
  );

  assert.match(
    pursuit,
    /'pitch_readiness'/,
  );
  assert.match(
    pursuit,
    /'pitch_execution'/,
  );

  assert.match(
    pursuit,
    /'pitch_responses'/,
  );
  assert.match(
    pursuit,
    /currentPitch/,
  );
  assert.match(
    pursuit,
    /'pitch_detail'/,
  );
  assert.match(
    pursuit,
    /setReadinessControl/,
  );
  assert.match(
    pursuit,
    /setExecutionControl/,
  );
  assert.match(
    pursuit,
    /setResponseControl/,
  );
});

test('Network pursuit handoff does not add direct browser database access', async () => {
  const [club, pursuit] =
    await Promise.all([
      readFile(clubPath, 'utf8'),
      readFile(pursuitPath, 'utf8'),
    ]);

  assert.doesNotMatch(
    club,
    /\.from\(/,
  );
  assert.doesNotMatch(
    pursuit,
    /\.from\(/,
  );
  assert.doesNotMatch(
    club,
    /supabase\./,
  );
  assert.doesNotMatch(
    pursuit,
    /supabase\./,
  );
});
