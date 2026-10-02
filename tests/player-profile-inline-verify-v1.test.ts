import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profile = readFileSync(
  'components/AgencyPlayerProfile.tsx',
  'utf8',
);
const css = readFileSync(
  'components/AgencyPlayerProfile.module.css',
  'utf8',
);
const agencyOs = readFileSync(
  'supabase/functions/agency-os/index.ts',
  'utf8',
);
const verificationMigration = readFileSync(
  'supabase/migrations/20261002104000_player_profile_verification_writer_v1.sql',
  'utf8',
);

test('verification stays inside the current Player Profile experience', () => {
  assert.match(profile, /REVIEW PLAYER DATA/);
  assert.match(profile, /Check the current player record/);
  assert.match(profile, /Confirm & verify/);
  assert.match(profile, /const openVerify =/);
  assert.match(profile, /const verifyPlayerData = async/);
  assert.doesNotMatch(profile, /href={`\/admin\/players/);
});

test('inline verification can correct the publish-critical player data', () => {
  assert.match(profile, /Primary position/);
  assert.match(profile, /Current club/);
  assert.match(profile, /Country/);
  assert.match(profile, /Date of birth/);
  assert.match(profile, /Nationality/);
  assert.match(profile, /Preferred foot/);
  assert.match(profile, /Height/);
  assert.match(profile, /Contract status/);
  assert.match(profile, /Contract expiry/);
});

test('agency-os verifies the player through a narrow tenant-aware writer', () => {
  assert.match(agencyOs, /action==="player_profile_verify"/);
  assert.match(agencyOs, /if\(!operator\(\)\)return deny/);
  assert.match(agencyOs, /platform_server_confirm_player_profile_verification/);
  assert.match(verificationMigration, /djm\.internal_profile_verification/);
  assert.match(verificationMigration, /m\.role in \('owner','admin','agent','operations'\)/);
  assert.match(verificationMigration, /player_profile\.player_data_verified/);
  assert.match(verificationMigration, /grant execute[\s\S]*to service_role/);
});

test('inline verification has a deliberate mobile layout', () => {
  assert.match(css, /Inline player verification v1/);
  assert.match(css, /\.verifyModal/);
  assert.match(css, /\.verifyConfirmNote/);
  assert.match(
    css,
    /@media\(max-width:720px\)[\s\S]*\.verifyModal \.twoFields[\s\S]*grid-template-columns:1fr/,
  );
  assert.match(profile, /styles\.verifyBackdrop/);
  assert.match(css, /\.verifyBackdrop[\s\S]*env\(safe-area-inset-top\)/);
  assert.match(css, /\.verifyBackdrop[\s\S]*place-items:end center/);
});
