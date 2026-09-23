import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const site = fs.readFileSync('components/ReDreamPublicLanding.tsx', 'utf8');
const css = fs.readFileSync('components/ReDreamPublicLanding.module.css', 'utf8');
const experience = fs.readFileSync('components/ReDreamInteractiveExperience.tsx', 'utf8');
const experienceCss = fs.readFileSync('components/ReDreamInteractiveExperience.module.css', 'utf8');
const story = fs.readFileSync('components/ReDreamProductStory.tsx', 'utf8');
const demo = fs.readFileSync('components/ReDreamDemoRequestButton.tsx', 'utf8');

test('V4 owns the category but sells the next-action thesis', () => {
  assert.match(site, /THE OPERATING SYSTEM FOR FOOTBALL AGENCIES/);
  assert.match(site, /Know what/);
  assert.match(site, /happens next/);
  assert.match(site, /what your agency knows into what your agency should do next/);
  assert.match(site, /Agency Memory/);
});

test('homepage includes a browser-only interactive agency situation engine', () => {
  assert.match(site, /ReDreamInteractiveExperience/);
  assert.match(experience, /INTERACTIVE PRODUCT DEMONSTRATION/);
  assert.match(experience, /Browser-only until you submit a demo request/);
  assert.match(experience, /Club need/);
  assert.match(experience, /Player situation/);
  assert.match(experience, /Live deal/);
  assert.match(experience, /Relationship/);
  assert.match(experience, /Run ReDream/);
  assert.match(experience, /NEEDS YOU/);
});

test('real-world names can come from the visitor without fabricated live football claims', () => {
  assert.match(experience, /Use real names if appropriate/);
  assert.match(experience, /does not query or verify live football data/);
  assert.match(experience, /does not represent a live requirement, endorsement or relationship/);
  assert.doesNotMatch(site, /Arsenal asked/i);
  assert.doesNotMatch(site, /Chelsea need/i);
});

test('Agency Memory visibly connects the signal to controlled next work', () => {
  for (const term of ['Capture', 'Understand', 'Connect', 'Prepare', 'Needs You']) {
    assert.match(experience, new RegExp(term));
  }
  assert.match(experience, /AGENCY MEMORY/);
  assert.match(experience, /EVIDENCE USED/);
  assert.match(experienceCss, /routeFill/);
});

test('one immersive workspace switches across the four core operating questions', () => {
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
    assert.match(story, new RegExp(term));
  }
});

test('the complete commercial operating spine stays visible', () => {
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

test('Agency Autopilot keeps evidence human approval and undo explicit', () => {
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

test('conversion starts with value and preserves scenario context', () => {
  assert.match(experience, /initialPriority=\{demoContext\}/);
  assert.match(demo, /initialPriority/);
  assert.match(demo, /Step \$\{step\} of 2/);
  assert.match(demo, /Three details first/);
  assert.match(demo, /What should we run through ReDream\?/);
  assert.match(site, /Run ReDream on my agency/);
});

test('canonical pricing remains compact and unchanged', () => {
  assert.match(site, /€149/);
  assert.match(site, /€399/);
  assert.match(site, /€799/);
  assert.match(site, /From €1,500/);
  assert.match(site, /5 staff · 40 players/);
  assert.match(site, /15 staff · 100 players/);
  assert.match(site, /30 staff · 250 players/);
  assert.match(site, /Plans start at €149\/month/);
});

test('V4 avoids fake social proof generic feature walls and inaccessible motion', () => {
  assert.match(css, /ReDream Sales Site 4\.0/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(experienceCss, /prefers-reduced-motion/);
  assert.doesNotMatch(site, /trusted by/i);
  assert.doesNotMatch(site, /testimonial/i);
  assert.doesNotMatch(site, /\d+%/);
  assert.doesNotMatch(site, /\bDJM\b/);
});
