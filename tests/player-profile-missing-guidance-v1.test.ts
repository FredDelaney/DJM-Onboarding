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
    /Verification → Mark current data verified/,
  );
  assert.match(
    profile,
    /Automated player record → Primary position/,
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
  assert.match(profile, /Add the agency view/);
  assert.match(profile, /YouTube, Vimeo or Wyscout/);
  assert.match(
    profile,
    /Edit Player Profile → Current player footage → Video URL/,
  );
});

test('missing items have direct fix actions', () => {
  assert.match(
    profile,
    /href={\x60\/admin\/players\/\$\{playerId\}\x60}/,
  );
  assert.match(profile, /href="\/settings\/agency"/);
  assert.match(profile, /const openEditorAt =/);
  assert.match(profile, /player-profile-video/);
  assert.match(profile, /player-profile-positioning/);
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
