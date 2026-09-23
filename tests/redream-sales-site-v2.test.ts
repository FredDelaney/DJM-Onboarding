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

test('sales site leads with the owned ReDream category and one primary conversion', () => {
  assert.match(site, /THE OPERATING SYSTEM FOR FOOTBALL AGENCIES/);
  assert.match(site, /Run the agency from/);
  assert.match(site, /what happens next/);

  const demos =
    site.match(/<ReDreamDemoRequestButton/g) || [];

  assert.ok(demos.length >= 4);
  assert.match(site, /Request a demo/);
});

test('public product story demonstrates signal to action instead of explaining abstractly', () => {
  assert.match(site, /CAPTURED FROM A CONVERSATION/);
  assert.match(site, /Club need structured/);
  assert.match(site, /3 players fit the brief/);
  assert.match(site, /Warm relationship identified/);
  assert.match(site, /Follow-up prepared for approval/);
  assert.match(site, /Approve the Westhaven pursuit/);
});

test('the complete agency operating spine remains visible', () => {
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
});

test('four differentiated product moments do the selling', () => {
  for (const term of [
    'Needs You',
    'Market Pursuit',
    'Player 360',
    'Deal War Room',
    'Access Intelligence',
    'Player Service',
    'Deal Control',
    'Closeout & Collection',
  ]) {
    assert.match(site, new RegExp(term));
  }
});

test('Agency Autopilot exposes explicit human control and audit semantics', () => {
  for (const term of [
    'Evidence',
    'Prepare',
    'Approve',
    'Act',
    'Record',
    'Undo where permitted',
    'Human judgement where it matters',
    'Human decision',
    'Player-safe by design',
  ]) {
    assert.match(site, new RegExp(term));
  }

  assert.match(site, /does not invent/);
});

test('homepage keeps canonical commercial structure without a long pricing wall', () => {
  assert.match(site, /€149/);
  assert.match(site, /€399/);
  assert.match(site, /€799/);
  assert.match(site, /From €1,500/);
  assert.match(site, /5 staff · 40 players/);
  assert.match(site, /15 staff · 100 players/);
  assert.match(site, /30 staff · 250 players/);
  assert.match(site, /Plans start at €149\/month/);
});

test('sales site uses synthetic product proof honestly and avoids fabricated social proof', () => {
  assert.match(site, /ILLUSTRATIVE AGENCY WORKSPACE/);
  assert.doesNotMatch(site, /trusted by/i);
  assert.doesNotMatch(site, /testimonial/i);
  assert.doesNotMatch(site, /\d+%/);
  assert.doesNotMatch(site, /\bDJM\b/);
});

test('sales site is deliberately shorter and motion communicates operating flow', () => {
  assert.match(css, /ReDream Sales Site 3\.0/);
  assert.match(css, /@keyframes storyFocus/);
  assert.match(css, /prefers-reduced-motion/);

  assert.doesNotMatch(css, /\.categoryBand/);
  assert.doesNotMatch(css, /\.faqGrid/);
  assert.doesNotMatch(css, /\.audienceGrid/);
});
