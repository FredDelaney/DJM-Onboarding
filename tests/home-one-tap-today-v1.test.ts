import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const styles = readFileSync(
  'components/AgencyOperatingWorkspace.module.css',
  'utf8',
);

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

test('Today rows themselves are the action without another button column', () => {
  assert.match(home, /<Link[\s\S]*className=\{styles\.simpleTimelineRow\}[\s\S]*href=\{dayHrefFor\(item\)\}/);
  assert.match(home, /simpleTimelineArrow/);
  assert.match(styles, /\.simpleTimelineRow[\s\S]*text-decoration: none/);
  assert.match(styles, /\.simpleTimelineRow:hover/);
  assert.match(styles, /\.simpleTimelineArrow/);
});

test('Home section labels are concise and do not repeat themselves', () => {
  assert.match(home, /<h2>Needs attention<\/h2>/);
  assert.match(home, /<h2>Today<\/h2>/);
  assert.doesNotMatch(home, /What needs your attention/);
  assert.doesNotMatch(home, /<p className=\{styles\.eyebrow\}>TODAY<\/p>/);
  assert.match(home, /Capture the outcome and next move\./);
});
