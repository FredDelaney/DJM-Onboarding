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
  assert.match(players, /router\.replace/);
  assert.doesNotMatch(players, /history\.replaceState/);
});

test('Player Profile branding cannot depend on a missing helper RPC', () => {
  assert.doesNotMatch(agencyOs, /platform_server_tenant_branding/);
  assert.match(agencyOs, /platform_server_player_profile_context/);
  assert.match(agencyOs, /player-profile server context unavailable/);
  assert.match(agencyOs, /branding:fallbackBranding/);
});

test('connected communication is enrichment and cannot take down a Player Profile', () => {
  assert.match(agencyOs, /const profileCommunication=async/);
  assert.match(agencyOs, /player-profile connected activity unavailable/);
  assert.match(agencyOs, /return\{summary:\{\},items:\[\],open_followups:\[\]\}/);
});

test('a Player Profile load failure gives the agent recovery instead of a dead end', () => {
  assert.match(profile, /Player profile could not load/);
  assert.match(profile, /Nothing has been changed/);
  assert.match(profile, /Try again/);
  assert.match(profile, /Back to player/);
  assert.match(profile, /onClick=\{\(\) => void load\(\)\}/);
});


test('agency-os never reads private schemas through PostgREST', () => {
  assert.doesNotMatch(agencyOs, /\.schema\(\"platform\"\)/);
  assert.doesNotMatch(agencyOs, /\.schema\(\"djm_os\"\)/);
  assert.match(agencyOs, /platform_server_account_context/);
  assert.match(agencyOs, /platform_server_player_profile_share_target/);
});
