import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');
const players = readFileSync('components/AgencyPlayersWorkspace.tsx','utf8');
const profile = readFileSync('components/AgencyPlayerProfile.tsx','utf8');
const agencyOs = readFileSync('supabase/functions/agency-os/index.ts','utf8');

test('a normal player deep link opens the agent workspace before the shareable profile', () => {
  assert.match(shell, /showPlayerProfile/);
  assert.match(shell, /search\.get\('profile'\) === '1'/);
  assert.match(shell, /showPlayerProfile \?[\s\S]*<AgencyPlayerProfile/);
  assert.match(shell, /<AgencyPlayersWorkspace/);
  assert.match(players, /profile=1/);
});

test('player workspace follows the agent decision order', () => {
  assert.match(players, /\['overview','opportunities','career','more'\]/);
  assert.match(players, />NEXT MOVE</);
  assert.match(players, /Latest activity/);
  assert.match(players, /More player detail/);
  assert.match(players, /Current club situations/);
});

test('player deep links stay recoverable when the drawer closes', () => {
  assert.match(players, /const openPlayer =/);
  assert.match(players, /params\.set\('player', id\)/);
  assert.match(players, /const closePlayer =/);
  assert.match(players, /params\.delete\('player'\)/);
  assert.match(players, /history\.replaceState/);
});

test('Player Profile branding cannot depend on a missing helper RPC', () => {
  assert.doesNotMatch(agencyOs, /platform_server_tenant_branding/);
  assert.match(agencyOs, /schema\("platform"\)\.from\("tenant_branding"\)/);
  assert.match(agencyOs, /player-profile branding unavailable/);
  assert.match(agencyOs, /return fallback/);
});

test('connected communication is enrichment and cannot take down a Player Profile', () => {
  assert.match(agencyOs, /const profileCommunication=async/);
  assert.match(agencyOs, /player-profile connected activity unavailable/);
  assert.match(agencyOs, /return\{summary:\{\},items:\[\],open_followups:\[\]\}/);
});

test('a Player Profile load failure gives the agent recovery instead of a dead end', () => {
  assert.match(profile, /Player Profile could not load/);
  assert.match(profile, /Nothing has been changed/);
  assert.match(profile, /Try again/);
  assert.match(profile, /Back to player/);
  assert.match(profile, /onClick=\{\(\) => void load\(\)\}/);
});
