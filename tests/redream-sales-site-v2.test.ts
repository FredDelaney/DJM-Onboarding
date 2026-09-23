import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const site = fs.readFileSync(
  'components/ReDreamPublicLanding.tsx',
  'utf8',
);
const css = fs.readFileSync(
  'components/ReDreamPublicLanding.module.css',
  'utf8',
);

test('public sales site defines ReDream as the agency operating system', () => {
  assert.match(site, /The operating system for football agencies\./);
  assert.match(site, /ReDream is the operating system for football agencies/);
  assert.match(site, /Not another system of record\./);
  assert.match(site, /A system of operation\./);
});

test('sales positioning focuses on operating leakage instead of generic contact management', () => {
  assert.match(site, /conversations,\s+spreadsheets, inboxes, databases and people/);
  assert.match(site, /Structured agency work/);
  assert.match(site, /Controlled pursuit/);
  assert.match(site, /Access route/);
  assert.match(site, /Deal momentum/);
  assert.match(site, /Service proof/);
  assert.match(site, /Commission closeout/);
});

test('commercial value is specific without fabricated ROI or customer proof', () => {
  assert.match(site, /Protect the revenue already inside the agency/);
  assert.match(site, /Miss less follow-up/);
  assert.match(site, /Make player service visible/);
  assert.match(site, /Close the revenue loop/);
  assert.doesNotMatch(site, /\d+%/);
  assert.doesNotMatch(site, /trusted by/i);
  assert.doesNotMatch(site, /testimonial/i);
});

test('real ReDream operating surfaces do the selling', () => {
  for (const term of [
    'Needs You',
    'Tell ReDream',
    'Club Account Room',
    'Player 360',
    'Deal War Room',
    'Owner Command Centre',
  ]) {
    assert.match(site, new RegExp(term));
  }
});

test('sales page keeps the revenue spine and structured demo conversion funnel', () => {
  for (const term of [
    'Club need',
    'Player match',
    'Relationship route',
    'Opportunity',
    'Pitch',
    'Follow-up',
    'Deal',
    'Negotiation',
    'Closeout',
    'Commission',
  ]) {
    assert.match(site, new RegExp(term));
  }

  const demoButtons = site.match(/<ReDreamDemoRequestButton/g) || [];
  assert.ok(demoButtons.length >= 4);
  assert.match(site, /See how ReDream would run your agency/);
});

test('category positioning stays independent and never names adjacent agency software', () => {
  assert.doesNotMatch(site, /Athlivo/i);
  assert.match(site, /operating layer of the agency/);
  assert.match(css, /ReDream Sales Site 2\.0/);
  assert.match(css, /\.categoryBand/);
  assert.match(css, /\.proofGrid/);
  assert.match(css, /\.faqGrid/);
});
