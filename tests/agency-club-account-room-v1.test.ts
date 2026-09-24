import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const room = fs.readFileSync(
  'components/AgencyClubAccountDrawer.tsx',
  'utf8',
);

test('Network opens a tenant-native Club Account Room without adding another daily workspace', () => {
  assert.match(workspace, /AgencyClubAccountDrawer/);
  assert.match(workspace, /Open club/);
  assert.doesNotMatch(workspace, /key: 'club-account'/);
});

test('Club Account Room reuses the existing combined club account contract', () => {
  assert.match(room, /invoke\(\s*'club_account'/);
  assert.match(room, /organisation_id/);
  assert.match(room, /network_coverage/);
  assert.match(room, /strategic_plays/);
});

test('Club Account Room separates direct access from warm introduction evidence', () => {
  assert.match(room, /DIRECT ROUTE/);
  assert.match(room, /WARM INTRODUCTION/);
  assert.match(room, /deterministic route ranking/);
  assert.match(room, /deterministic introduction ranking/);
  assert.match(room, /not probabilities/);
});

test('Club Account Room connects relationship context directly to live commercial and market work', () => {
  assert.match(room, /LIVE BUSINESS/);
  assert.match(room, /War room/);
  assert.match(room, /MARKET POSITION/);
  assert.match(room, /Open Market/);
});

test('Strategic club plays remain guarded internal preparations rather than external sending', () => {
  assert.match(room, /play_prepare/);
  assert.match(room, /No external message is sent automatically/);
  assert.match(workspace, /onOpenClubAccount/);
});

test('Club Account Room keeps currencies separate and stays tenant-neutral', () => {
  assert.match(room, /Currency totals remain separate/);
  assert.match(room, /does not invent an FX conversion/);
  assert.doesNotMatch(room, /\bDJM\b/);
  assert.doesNotMatch(room, /\/admin\//);
});
