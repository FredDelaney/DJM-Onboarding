import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const players = readFileSync(
  'components/AgencyPlayersWorkspace.tsx',
  'utf8',
);
const css = readFileSync(
  'components/AgencyPlayersWorkspace.module.css',
  'utf8',
);
const shell = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);

test('Recruitment uses a compact mobile Stage select instead of overflowing chips', () => {
  assert.match(players, /mobileStageSelect/);
  assert.match(players, /<option value="all">All/);
  assert.match(css, /Recruitment mobile control v1/);
  assert.match(css, /\.mobileStageSelect select[\s\S]*font-size: 16px/);
  assert.match(css, /\.stageFilters[\s\S]*display: none/);
});

test('Recruitment removes the unrelated Add player header action', () => {
  assert.match(
    shell,
    /search\.get\('tab'\) !== 'recruitment'[\s\S]*label: 'Add player'/,
  );
});
