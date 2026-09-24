import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const site = fs.readFileSync('components/ReDreamPublicLanding.tsx', 'utf8');
const css = fs.readFileSync('components/ReDreamPublicLanding.module.css', 'utf8');
const experience = fs.readFileSync('components/ReDreamInteractiveExperience.tsx', 'utf8');
const experienceCss = fs.readFileSync('components/ReDreamInteractiveExperience.module.css', 'utf8');
const story = fs.readFileSync('components/ReDreamProductStory.tsx', 'utf8');
const storyCss = fs.readFileSync('components/ReDreamProductStory.module.css', 'utf8');
const demo = fs.readFileSync('components/ReDreamDemoRequestButton.tsx', 'utf8');

test('V5 explains the product before introducing its vocabulary', () => {
  assert.match(site, /SOFTWARE BUILT FOR FOOTBALL AGENTS/);
  assert.match(site, /Manage your players, deals and follow-ups in one place/);
  assert.match(site, /How ReDream Works/);
  assert.match(site, /Tell it what happened/);
  assert.match(site, /Connect the details/);
  assert.match(site, /Make your next move/);
  assert.ok(site.indexOf('Manage your players') < site.indexOf('Agency Memory'));
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

test('V4.1 evidence is specific deduplicated and never exposes parser fragments', () => {
  assert.match(experience, /Role requirement:/);
  assert.match(experience, /Age requirement: under/);
  assert.match(experience, /Transfer options: permanent or loan/);
  assert.match(experience, /Warm relationship route stated/);
  assert.match(experience, /Offer amount stated:/);
  assert.match(experience, /Contract runway:/);
  assert.doesNotMatch(experience, /Constraint stated:/);
  assert.match(experience, /!evidence\.includes\(item\)/);
});

test('Agency Memory visibly connects the signal to controlled next work without a dense card wall', () => {
  for (const term of ['Capture', 'Understand', 'Connect', 'Prepare', 'Needs You']) {
    assert.match(experience, new RegExp(term));
  }
  assert.match(experience, /AGENCY MEMORY/);
  assert.match(experience, /EVIDENCE USED/);
  assert.match(experienceCss, /resultGrid/);
  assert.match(experienceCss, /routeFill/);
  assert.doesNotMatch(experienceCss, /\.evidenceGrid/);
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
  assert.match(storyCss, /1\.45fr/);
  assert.match(storyCss, /min-height: 430px/);
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

test('canonical pricing remains unchanged while plan language is buyer-facing', () => {
  assert.match(site, /€149/);
  assert.match(site, /€399/);
  assert.match(site, /€799/);
  assert.match(site, /From €1,500/);
  assert.match(site, /5 staff · 40 players/);
  assert.match(site, /15 staff · 100 players/);
  assert.match(site, /30 staff · 250 players/);
  assert.match(site, /Plans start at €149\/month/);
  assert.match(site, /Boutique agency/);
  assert.match(site, /Growing team/);
  assert.match(site, /Multi-market agency/);
  assert.match(site, /Large organisation/);
  assert.doesNotMatch(site, /tenant-aware architecture/i);
});

test('V5 keeps the commercial journey and readable homepage typography', () => {
  assert.match(css, /ReDream Sales Site 5/);
  assert.match(site, /From club demand to commission\. One thread, full context\./);
  assert.match(site, /Bring one real situation\. See how ReDream would run it\./);
  for (const source of [css, experienceCss, storyCss, fs.readFileSync('components/ReDreamDemoRequestButton.module.css', 'utf8')]) {
    const sizes = [...source.matchAll(/font-size:\s*([\d.]+)px/g)].map((match) => Number(match[1]));
    assert.ok(sizes.every((size) => size >= 13), 'Public text must stay readable');
  }
  assert.match(experience, /Pick a situation/);
  assert.match(experience, /See the next move/);
  assert.match(demo, /createPortal/);
});

test('V4.1 avoids fake social proof generic feature walls and inaccessible motion', () => {
  assert.match(css, /prefers-reduced-motion/);
  assert.match(experienceCss, /prefers-reduced-motion/);
  assert.doesNotMatch(site, /trusted by/i);
  assert.doesNotMatch(site, /testimonial/i);
  assert.doesNotMatch(site, /\d+%/);
  assert.doesNotMatch(site, /\bDJM\b/);
});

