import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const opportunities = readFileSync('components/AgencyOpportunitiesWorkspace.tsx','utf8');
const network = readFileSync('components/AgencyNetworkWorkspace.tsx','utf8');
const players = readFileSync('components/AgencyPlayersWorkspace.tsx','utf8');
const layout = readFileSync('app/layout.tsx','utf8');
const shell = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');
const manifest = readFileSync('app/workspace-manifest.webmanifest/route.ts','utf8');

test('Opportunities use the shared entity actions menu', () => {
  assert.match(opportunities, /kind="club_need"/);
  assert.match(opportunities, /kind="deal_room"/);
  assert.match(opportunities, /EntityActionsMenu/);
});

test('Network clubs and contacts use the same entity actions menu', () => {
  assert.match(network, /kind="club"/);
  assert.match(network, /kind="club_contact"/);
  assert.match(network, /EntityActionsMenu/);
});

test('Players and Recruitment use the same entity actions menu', () => {
  assert.match(players, /kind="player"/);
  assert.match(players, /kind="recruitment_target"/);
  assert.match(players, /EntityActionsMenu/);
});

test('active workspaces hide archived records after refresh', () => {
  assert.match(opportunities, /redream_entity_archives/);
  assert.match(network, /redream_entity_archives/);
  assert.match(players, /redream_entity_archives/);
});

test('authenticated mobile shell has no top haze or dark status-bar tint', () => {
  assert.match(layout, /statusBarStyle:\s*'default'/);
  assert.match(layout, /isReDreamPublicSite[\s\S]*\? '#0A1B3D'[\s\S]*: '#ffffff'/);
  assert.doesNotMatch(shell, /\.mobileTopVeil\s*\{/);
  assert.match(manifest, /background_color: '#FFFFFF'/);
  assert.match(manifest, /theme_color: '#FFFFFF'/);
});
