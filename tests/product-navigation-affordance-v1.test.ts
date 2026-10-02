import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const opportunities = readFileSync('components/AgencyOpportunitiesWorkspace.tsx','utf8');
const opportunitiesCss = readFileSync('components/AgencyOpportunitiesWorkspace.module.css','utf8');
const calendar = readFileSync('components/AgencyCalendarWorkspace.tsx','utf8');
const calendarCss = readFileSync('components/AgencyCalendarWorkspace.module.css','utf8');
const network = readFileSync('components/AgencyNetworkWorkspace.tsx','utf8');

test('Opportunities card navigation uses clean chevrons with no visible circle', () => {
  assert.doesNotMatch(opportunities, /<ArrowRight/);
  assert.match(opportunities, /<ChevronRight size=\{18\}/);
  const final = opportunitiesCss.slice(opportunitiesCss.lastIndexOf('Product navigation affordance system v1'));
  assert.match(final, /\.action,[\s\S]*border-radius: 0/);
  assert.match(final, /background: transparent/);
  assert.match(final, /place-items: center/);
});

test('Calendar row navigation uses the same clean chevron system', () => {
  assert.doesNotMatch(calendar, /<ArrowRight size=\{13\}/);
  assert.match(calendar, /<ChevronRight size=\{17\}/);
  const final = calendarCss.slice(calendarCss.lastIndexOf('Product navigation affordance system v1'));
  assert.match(final, /\.action[\s\S]*border-radius: 0/);
  assert.match(final, /background: transparent/);
});

test('Network row and action navigation uses chevrons rather than long arrows', () => {
  assert.match(network, /<ChevronRight size=\{16\}/);
  assert.match(network, /ArrowRight size=\{15\}[\s\S]*NEXT FOLLOW-UP/);
});
