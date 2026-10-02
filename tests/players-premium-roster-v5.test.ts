import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync('components/AgencyOperatingWorkspace.tsx', 'utf8');
const shellCss = readFileSync('components/AgencyOperatingWorkspace.module.css', 'utf8');
const playerCss = readFileSync('components/AgencyPlayersWorkspace.module.css', 'utf8');

test('Players mobile add action shares the labelled contextual action pattern', () => {
  assert.match(shell, /createAction && !inlineEntityWorkspaceOpen/);
  assert.doesNotMatch(shell, /view === 'players' && createAction/);
  assert.match(shellCss, /Mobile action commonality \+ scroll-aware top fade v1/);
  assert.match(shellCss, /\.mobileContextAction \.createButton[\s\S]*border-radius: 22px/);
  assert.match(shellCss, /\.mobileContextAction \.createButton[\s\S]*font-size: 12px/);
});

test('mobile roster cards use an inset information panel and integrated attention marker', () => {
  assert.match(playerCss, /Premium roster cards v5/);
  assert.match(playerCss, /\.playerFacts[\s\S]*border-radius: 16px[\s\S]*background: linear-gradient/);
  assert.match(playerCss, /\.playerCardEnd \.attentionPill[\s\S]*position: absolute/);
  assert.match(playerCss, /\.playerCard[\s\S]*border-radius: 22px/);
});
