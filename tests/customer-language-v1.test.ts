import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync('components/AgencyOperatingWorkspace.tsx', 'utf8');

test('main workspace screens explain themselves in simple customer language', () => {
  assert.match(workspace, /What needs attention\./);
  assert.match(workspace, /Roster and next steps\./);
  assert.match(workspace, /Needs, matches and deals\./);
  assert.match(workspace, /Clubs and relationships\./);
  assert.match(workspace, /Meetings and deadlines\./);
  assert.match(workspace, /Deals and revenue\./);
});

test('empty states tell a new customer what will happen next', () => {
  assert.match(workspace, /Add your first player/);
  assert.match(workspace, /No club needs yet/);
  assert.match(workspace, /No player opportunities yet/);
  assert.match(workspace, /Add your first club relationship/);
  assert.match(workspace, /Nothing coming up yet/);
  assert.match(workspace, /No live deals yet/);
});

test('primary workspace copy avoids internal operating jargon', () => {
  assert.doesNotMatch(workspace, /Ranked across the agency/);
  assert.doesNotMatch(workspace, /Commercial agency signals require admin access/);
  assert.doesNotMatch(workspace, /No player-service gap recorded/);
  assert.doesNotMatch(workspace, /No active player-club pursuits/);
  assert.doesNotMatch(workspace, /No live deals recorded/);
});
