import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync('components/AgencyOperatingWorkspace.tsx', 'utf8');
const shellCss = readFileSync('components/AgencyOperatingWorkspace.module.css', 'utf8');
const playerCss = readFileSync('components/AgencyPlayersWorkspace.module.css', 'utf8');

test('Players mobile add action lives in the header with the account action', () => {
  assert.match(shell, /view === 'players' && createAction/);
  assert.match(shell, /styles\.mobileHeaderCreate/);
  assert.match(shell, /createAction && view !== 'players'/);
  assert.match(shellCss, /Players mobile header action refinement v1/);
  assert.match(shellCss, /\.mobileHeadActions[\s\S]*display: flex/);
  assert.match(shellCss, /\.mobileHeaderCreate[\s\S]*width: 40px/);
});

test('mobile roster cards use an inset information panel and integrated attention marker', () => {
  assert.match(playerCss, /Premium roster cards v5/);
  assert.match(playerCss, /\.playerFacts[\s\S]*border-radius: 16px[\s\S]*background: linear-gradient/);
  assert.match(playerCss, /\.playerCardEnd \.attentionPill[\s\S]*position: absolute/);
  assert.match(playerCss, /\.playerCard[\s\S]*border-radius: 22px/);
});
