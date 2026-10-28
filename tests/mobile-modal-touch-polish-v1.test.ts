import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const createDrawer = readFileSync(
  'components/AgencyCreateDrawer.module.css',
  'utf8',
);
const players = readFileSync(
  'components/AgencyPlayersWorkspace.module.css',
  'utf8',
);
const profile = readFileSync(
  'components/AgencyPlayerProfile.module.css',
  'utf8',
);

test('shared create drawer close meets the mobile touch baseline', () => {
  assert.match(createDrawer, /Final mobile touch polish v1/);
  assert.match(
    createDrawer,
    /\.close[\s\S]*width: 44px[\s\S]*height: 44px/,
  );
});

test('Add target modal footer actions meet the mobile touch baseline', () => {
  const source=readFileSync('components/AgencyPlayersWorkspace.tsx','utf8');
  assert.match(source,/AgencyCreateDrawer[\s\S]{0,130}kind="recruitment_target"/);
  assert.match(
    createDrawer,
    /\.primary,[\s\S]*\.secondary[\s\S]*min-height: 44px/,
  );
});

test('Player Profile edit controls meet the mobile touch baseline', () => {
  assert.match(profile, /Final mobile Player Profile touch polish v1/);
  assert.match(
    profile,
    /\.modal > header \.iconButton[\s\S]*width: 44px[\s\S]*height: 44px/,
  );
  assert.match(
    profile,
    /\.modal > footer \.primaryAction,[\s\S]*\.modal > footer \.secondaryAction[\s\S]*min-height: 44px/,
  );
  assert.match(
    profile,
    /\.sectionOn,[\s\S]*\.sectionOff[\s\S]*min-height: 44px/,
  );
  assert.match(profile, /\.addVideo button[\s\S]*min-height: 44px/);
  assert.match(
    profile,
    /\.videoList a,[\s\S]*\.videoList button[\s\S]*width: 44px[\s\S]*height: 44px/,
  );
});
