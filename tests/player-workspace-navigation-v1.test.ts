import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const players = readFileSync(
  'components/AgencyPlayersWorkspace.tsx',
  'utf8',
);
const shell = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

test('Players workspace uses Next navigation so the shell stays in sync', () => {
  assert.match(players, /useRouter, useSearchParams/);
  assert.match(players, /const router = useRouter\(\)/);
  assert.match(players, /router\.push\(/);
  assert.match(players, /router\.replace\(/);
  assert.doesNotMatch(players, /window\.history\.(pushState|replaceState)/);
});

test('Players and Recruitment tabs write their state to the URL', () => {
  assert.match(players, /const changeSection = \(nextSection: 'players' \| 'recruitment'\)/);
  assert.match(players, /params\.set\('tab', 'recruitment'\)/);
  assert.match(players, /params\.delete\('tab'\)/);
  assert.match(players, /onClick=\{\(\)=>changeSection\('players'\)\}/);
  assert.match(players, /onClick=\{\(\)=>changeSection\('recruitment'\)\}/);
});

test('Shell hides Add player when Recruitment or a player detail is active', () => {
  assert.match(
    shell,
    /view === 'players'[\s\S]*!selectedPlayerId[\s\S]*search\.get\('tab'\) !== 'recruitment'[\s\S]*label: 'Add player'/,
  );
});

test('Player detail controls meet the mobile touch baseline', () => {
  const css = readFileSync(
    'components/AgencyPlayersWorkspace.module.css',
    'utf8',
  );
  assert.match(css, /Player workspace touch polish v1/);
  assert.match(css, /\.closeButton[\s\S]*width: 44px[\s\S]*height: 44px/);
  assert.match(
    css,
    /\.heroActions \.secondaryButton,[\s\S]*\.heroActions \.primaryButton[\s\S]*min-height: 44px/,
  );
});
