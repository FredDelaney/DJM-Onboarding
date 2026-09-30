import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profile = readFileSync(
  'components/AgencyPlayerProfile.tsx',
  'utf8',
);
const cache = readFileSync(
  'lib/player-profile-cache.ts',
  'utf8',
);
const agencyOs = readFileSync(
  'supabase/functions/agency-os/index.ts',
  'utf8',
);

test('Player Profile first paint uses the core profile read', () => {
  assert.match(cache, /player_profile_core/);
  assert.match(profile, /player_profile_core/);
  assert.match(profile, /prefetchPlayerProfile/);
  assert.match(agencyOs, /action==="player_profile_core"/);
  assert.match(agencyOs, /const profileCore=async/);
});

test('secondary evidence streams after the profile is visible', () => {
  assert.match(profile, /player_profile_detail/);
  assert.match(profile, /secondary_ready === false/);
  assert.match(profile, /setBundle\(\(current: any\)/);
  assert.match(agencyOs, /action==="player_profile_detail"/);
  assert.match(agencyOs, /const profileSecondary=async/);
});

test('secondary loading never pretends missing evidence is zero', () => {
  assert.match(profile, /secondaryReady \? documents\.length : '…'/);
  assert.match(profile, /Loading recent activity\.\.\./);
  assert.match(profile, /Loading profile activity\.\.\./);
  assert.match(
    profile,
    /Share history is loading without delaying the Player Profile/,
  );
});

test('full profile endpoint remains as a compatibility fallback', () => {
  assert.match(profile, /invoke<any>\('player_profile'/);
  assert.match(agencyOs, /action==="player_profile"/);
});

test('core profile read excludes secondary club and communication context', () => {
  const coreStart = agencyOs.indexOf('const profileCore=async');
  const coreEnd = agencyOs.indexOf(
    'const profileSecondary=async',
    coreStart,
  );
  const core = agencyOs.slice(coreStart, coreEnd);

  assert.doesNotMatch(core, /profileContext\(pid\)/);
  assert.doesNotMatch(core, /profileCommunication\(pid\)/);
  assert.doesNotMatch(core, /player_documents/);
  assert.doesNotMatch(core, /club_share_links/);
  assert.match(core, /secondary_ready:false/);
});

test('secondary profile context streams in after first paint', () => {
  assert.match(profile, /player_profile_detail/);
  assert.match(profile, /profile\.secondary_ready === false/);
  assert.match(profile, /setCachedPlayerProfile\(playerId, next\)/);
  assert.match(agencyOs, /action==="player_profile_detail"/);
  assert.match(agencyOs, /const profileSecondary=async/);
  assert.match(agencyOs, /profileCommunication\(pid\)/);
  assert.match(agencyOs, /secondary_ready:true/);
});
