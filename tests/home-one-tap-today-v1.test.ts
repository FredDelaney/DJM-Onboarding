import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync('components/AgencyOperatingWorkspace.tsx', 'utf8');
const styles = readFileSync('components/AgencyOperatingWorkspace.module.css', 'utf8');

const homeStart = workspace.indexOf('function Home(');
const homeEnd = workspace.indexOf('function Players(', homeStart);
const home = workspace.slice(homeStart, homeEnd);

test('Home receives the stable workspace base path for direct Today routing', () => {
  assert.match(workspace, /<Home[\s\S]*basePath=\{basePath\}/);
  assert.match(home, /basePath: string/);
});

test('Today opens meeting preparation directly through Calendar', () => {
  assert.match(home, /const meetingId = String\(item\?\.meeting_id \|\| ''\)\.trim\(\)/);
  assert.match(home, /\?view=calendar&meeting=\$\{encodeURIComponent\(meetingId\)\}/);
  assert.match(home, /Open meeting/);
});

test('Today routes player and opportunity dates to the real work surface', () => {
  assert.match(home, /item\?\.context\?\.player_id \|\| item\?\.player_id/);
  assert.match(home, /\?view=players&player=\$\{encodeURIComponent\(playerId\)\}/);
  assert.match(home, /entityType === 'deal'/);
  assert.match(home, /\?view=opportunities&tab=deals/);
  assert.match(home, /entityType === 'player_match'/);
  assert.match(home, /\?view=opportunities&tab=routes/);
  assert.match(home, /entityType === 'club_need'/);
  assert.match(home, /\?view=opportunities&tab=needs/);
  assert.match(home, /\?view=network&person=\$\{encodeURIComponent\(personId\)\}/);
  assert.match(home, /\?view=network&club=\$\{encodeURIComponent\(organisationId\)\}/);
});

test('Today gives each ranked item one explicit primary action', () => {
  assert.match(home, /const queueAction = \(item: QueueItem\)/);
  assert.match(home, /queueAction\(item\)/);
  assert.match(home, /actionFor\(item\.payload\)/);
  assert.match(home, /Open relationship/);
  assert.match(home, /Record outcome/);
  assert.match(styles, /\.todayQueueAction/);
});

test('Home hierarchy is one concise Today surface', () => {
  assert.match(home, /<h2>Today<\/h2>/);
  assert.match(home, /What matters most/);
  assert.doesNotMatch(home, /<h2>Needs attention<\/h2>/);
  assert.doesNotMatch(home, /What changed/);
  assert.doesNotMatch(home, /Recently handled by ReDream/);
});
