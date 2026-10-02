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

test('Player Profile names each missing publish blocker precisely', () => {
  assert.match(profile, /Verify current player data/);
  assert.match(profile, /Add the primary position/);
  assert.match(profile, /Add the agency support email/);
  assert.match(
    profile,
    /Player Profile → Review current data → Confirm & verify/,
  );
  assert.match(
    profile,
    /Player Profile → Review current data → Primary position/,
  );
  assert.match(
    profile,
    /Workspace identity → Support email/,
  );
});

test('recommended profile gaps say exactly what is missing', () => {
  assert.match(profile, /Add a player profile photo/);
  assert.match(profile, /Add career history/);
  assert.match(profile, /Add current player footage/);
  assert.match(profile, /selectedVideos\[0\]\?\.url \|\| published\.primary_video_url \|\| null/);
  assert.match(profile, /Add Transfermarkt URL/);
  assert.match(profile, /Add contract status/);
  assert.match(profile, /Add contract expiry/);
  assert.match(profile, /under contract\|contracted\|on loan/);
  assert.match(profile, /Add the agency view/);
  assert.match(profile, /YouTube, Vimeo or Wyscout/);
  assert.match(
    profile,
    /Edit Player Profile → Current player footage → Video URL/,
  );
});

test('mobile profile keeps share and evidence ahead of status guidance', () => {
  assert.match(profile, /Share Player Profile/);
  assert.match(profile, /Before sharing: /);
  assert.match(css, /grid-template-areas:"identity" "actions" "readiness"/);
  assert.match(css, /\.profileLinks a\{min-height:44px/);
});

test('missing items have direct fix actions without legacy admin routing', () => {
  assert.match(profile, /const openVerify =/);
  assert.match(profile, /player_profile_verify/);
  assert.match(profile, /href={backHref}/);
  assert.match(profile, /href="\/settings\/agency"/);
  assert.match(profile, /const openEditorAt =/);
  assert.match(profile, /player-profile-video/);
  assert.match(profile, /player-profile-positioning/);
  assert.doesNotMatch(profile, /href={\x60\/admin\/players/);
});

test('status headline uses the actual missing item instead of only a count', () => {
  assert.match(
    profile,
    /missingRequiredCount === 1[\s\S]*missingRequiredChecks\[0\]\.missingTitle/,
  );
  assert.match(
    profile,
    /missingRequiredCount === 1[\s\S]*missingRequiredChecks\[0\]\.where/,
  );
});

test('missing guidance is visible and usable on mobile', () => {
  assert.match(css, /Player Profile missing-item guidance v1/);
  assert.match(css, /\.fixGuide/);
  assert.match(css, /\.fixRequired/);
  assert.match(
    css,
    /@media\(max-width:720px\)[\s\S]*\.fixAction a,[\s\S]*min-height:44px/,
  );
});

test('Transfermarkt is directly editable from the player header and missing guidance', () => {
  assert.match(profile, /action: 'transfermarkt'/);
  assert.match(profile, /const openTransfermarkt =/);
  assert.match(profile, /player_profile_transfermarkt_save/);
  assert.match(profile, /'Edit Transfermarkt'/);
  assert.match(profile, /'Add Transfermarkt'/);
  assert.match(profile, /onClick={openTransfermarkt}/);
  assert.match(profile, /Paste the direct Transfermarkt player profile URL/);
  assert.match(profile, /Save link/);
});
