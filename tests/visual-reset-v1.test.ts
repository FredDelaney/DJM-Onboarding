import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync('components/AgencyOperatingWorkspace.module.css','utf8');
const players = readFileSync('components/AgencyPlayersWorkspace.module.css','utf8');
const opportunities = readFileSync('components/AgencyOpportunitiesWorkspace.module.css','utf8');
const network = readFileSync('components/AgencyNetworkWorkspace.module.css','utf8');
const calendar = readFileSync('components/AgencyCalendarWorkspace.module.css','utf8');
const profile = readFileSync('components/AgencyPlayerProfile.module.css','utf8');
const profileView = readFileSync('components/AgencyPlayerProfile.tsx','utf8');

test('mobile shell is content-first with compact page heading', () => {
  assert.match(shell, /ReDream visual reset v1/);
  assert.match(shell, /\.pageHead h1[\s\S]*font-size: 18px/);
  assert.match(shell, /\.pageDescription[\s\S]*display: none/);
  assert.match(shell, /\.root[\s\S]*background: #fff/);
});

test('mobile navigation floats separately from Tell ReDream', () => {
  assert.match(shell, /\.sidebar[\s\S]*inset:[\s\S]*auto 86px/);
  assert.match(shell, /border-radius: 24px/);
  assert.match(shell, /backdrop-filter: blur\(18px\)/);
  assert.match(shell, /\.mobileTell button[\s\S]*width: 58px/);
});

test('player list is a scan surface rather than a mini detail page', () => {
  assert.match(players, /\.playerFacts,[\s\S]*\.playerCardActions[\s\S]*display: none/);
  assert.match(players, /\.avatar[\s\S]*border-radius: 50%/);
  assert.match(players, /\.attentionPill[\s\S]*width: 10px/);
});

test('network removes dashboard-style analysis blocks from mobile', () => {
  assert.match(network, /\.hero,[\s\S]*\.intelligence,[\s\S]*\.signalBar[\s\S]*display: none/);
  assert.match(network, /\.secondaryAction[\s\S]*display: none/);
});

test('opportunities and calendar use quiet segmented controls', () => {
  assert.match(opportunities, /\.tabActive[\s\S]*background: #fff/);
  assert.match(opportunities, /\.controls[\s\S]*background: transparent/);
  assert.match(opportunities, /\.row[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(opportunities, /\.copy[\s\S]*grid-column: 1/);
  assert.match(opportunities, /\.action,[\s\S]*grid-column: 2[\s\S]*grid-row: 1/);
  assert.doesNotMatch(opportunities, /grid-template-columns: 32px minmax\(0, 1fr\) auto/);
  assert.match(calendar, /\.rangeActive[\s\S]*background: #fff/);
  assert.match(calendar, /\.controls[\s\S]*background: #f3f5f7/);
});

test('player profile leads with identity instead of admin readiness', () => {
  assert.match(profile, /\.photo[\s\S]*width: 104px[\s\S]*border-radius: 50%/);
  assert.match(profile, /\.readinessGrid[\s\S]*display: none/);
  assert.match(profile, /\.heroIdentity[\s\S]*text-align: center/);
  assert.match(profileView, /<h3>Player overview<\/h3>/);
  assert.match(profileView, /<h3>Evidence<\/h3>/);
  assert.match(profileView, /<h3>Recent activity<\/h3>/);
});
