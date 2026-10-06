import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync('components/AgencyOperatingWorkspace.tsx', 'utf8');

test('main workspace screens explain themselves in simple customer language', () => {
  assert.match(workspace, /What needs your attention today\./);
  assert.match(workspace, /Your players, what needs attention and what to do next\./);
  assert.match(workspace, /Live opportunities, the people involved and the next step\./);
  assert.match(workspace, /Your club relationships and the people you know\./);
  assert.match(workspace, /Meetings, follow-ups and deadlines in one place\./);
  assert.match(workspace, /Live deals, expected income and the agency position\./);
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
  assert.doesNotMatch(workspace, /Commercial agency signals require administrator access/);
  assert.doesNotMatch(workspace, /No player-service gap recorded/);
  assert.doesNotMatch(workspace, /No active player-club pursuits/);
  assert.doesNotMatch(workspace, /No live deals recorded/);
});
