import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const players = readFileSync(
  'components/AgencyPlayersWorkspace.tsx',
  'utf8',
);
const profile = readFileSync(
  'components/AgencyPlayerProfile.tsx',
  'utf8',
);
const agencyOs = readFileSync(
  'supabase/functions/agency-os/index.ts',
  'utf8',
);
const ai = readFileSync(
  'components/AiLauncher.tsx',
  'utf8',
);
const account = readFileSync(
  'components/AccountMenu.tsx',
  'utf8',
);
const cache = readFileSync(
  'lib/player-profile-cache.ts',
  'utf8',
);

test('Players loads only the visible list instead of both player and recruitment data', () => {
  assert.match(shell, /playersSection/);
  assert.match(shell, /if \(inlineEntityWorkspaceOpen\)/);
  assert.match(shell, /playersSection === 'recruitment'/);
  assert.doesNotMatch(
    shell,
    /Promise\.allSettled\(\[\s*invoke<any>\('players_workspace'[\s\S]*invoke<any>\('recruitment_board'/,
  );
});

test('inline player and profile routes skip expensive index loading', () => {
  assert.match(
    shell,
    /if \(inlineEntityWorkspaceOpen\)[\s\S]*directory: \{\}[\s\S]*recruitment: \{\}/,
  );
});

test('player cards have a direct Player Profile shortcut', () => {
  assert.match(players, /const openPlayerProfile =/);
  assert.match(players, /profileShortcut/);
  assert.match(players, />\s*Profile\s*</);
  assert.match(players, /prefetchPlayerProfile\(id, invoke\)/);
});

test('opening a player renders known summary data immediately and prefetches the profile', () => {
  assert.match(players, /summary\?: any/);
  assert.match(players, /const initialDetail = summary/);
  assert.match(players, /useState\(!initialDetail\)/);
  assert.match(
    players,
    /prefetchPlayerProfile\(playerId, invoke\)/,
  );
});

test('Player Profile reuses a short-lived prefetched cache', () => {
  assert.match(cache, /const TTL_MS = 60_000/);
  assert.match(cache, /profileRequests/);
  assert.match(profile, /getCachedPlayerProfile\(playerId\)/);
  assert.match(profile, /setCachedPlayerProfile\(playerId, profile\)/);
});

test('duplicate AI and account identity reads are deduplicated', () => {
  assert.match(ai, /aiAccessRequests/);
  assert.match(ai, /aiRouteRequests/);
  assert.match(ai, /cachedAiAccess/);
  assert.match(ai, /cachedAiRouteContext/);
  assert.match(account, /cachedProfileIdentity/);
  assert.match(account, /profileIdentityRequest/);
  assert.match(account, /supabase\.auth\.getSession\(\)/);
  assert.doesNotMatch(account, /supabase\.auth\.getUser\(\)/);
});

test('verification-only profiles can publish in one user action', () => {
  assert.match(profile, /const verificationOnly =/);
  assert.match(profile, /Verify & publish/);
  assert.match(profile, /confirmCurrentData: verificationOnly/);
  assert.match(profile, /saveFirst: false/);
  assert.match(agencyOs, /body\?\.confirm_current_data===true/);
  assert.match(agencyOs, /verification_method:"publish_confirmation"/);
});

test('manual agency positioning is not requested when an automatic headline already exists', () => {
  assert.match(
    profile,
    /form\.why_review \|\|[\s\S]*form\.intro_line \|\|[\s\S]*draftProfile\.headline/,
  );
});
