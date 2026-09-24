import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const site = fs.readFileSync('components/ReDreamPublicLanding.tsx', 'utf8');
const css = fs.readFileSync('components/ReDreamPublicLanding.module.css', 'utf8');
const story = fs.readFileSync('components/ReDreamSimpleStory.tsx', 'utf8');
const storyCss = fs.readFileSync('components/ReDreamSimpleStory.module.css', 'utf8');
const live = fs.readFileSync('components/ReDreamLiveOperatingDemo.tsx', 'utf8');
const decision = fs.readFileSync('components/ReDreamDecisionLayer.tsx', 'utf8');
const product = fs.readFileSync('app/(redream-public)/product/page.tsx', 'utf8');
const security = fs.readFileSync('app/(redream-public)/security/page.tsx', 'utf8');
const switchPage = fs.readFileSync('app/(redream-public)/switch/page.tsx', 'utf8');
const sandboxContract = fs.readFileSync('lib/redream-public-sandbox.ts', 'utf8');
const edge = fs.readFileSync('supabase/functions/redream-public-sandbox/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260924122500_redream_public_demo_snapshot_v1.sql', 'utf8');

test('V6.1 homepage explains the product in plain football-agency language', () => {
  assert.match(site, /SOFTWARE FOR FOOTBALL AGENCIES/);
  assert.match(site, /Run your agency without relying on memory/);
  assert.match(site, /players, club requests, contacts and deals connected/);
  assert.match(site, /what needs attention and what to do next/);
  assert.doesNotMatch(site, /THE DECISION LAYER FOR FOOTBALL AGENCIES/);
  assert.doesNotMatch(site, /Ask the agency, not the dashboard/);
  assert.doesNotMatch(site, /Agency Memory/);
  assert.doesNotMatch(site, /bounded autonomy/i);
});

test('homepage follows problem value current state and business outcome', () => {
  assert.match(site, /PROBLEM TO OUTCOME/);
  assert.match(site, /Today/);
  assert.match(site, /With ReDream/);
  assert.match(site, /Business outcome/);
  assert.match(site, /Respond to clubs faster/);
  assert.match(site, /Miss fewer opportunities/);
  assert.match(site, /Spend more time on relationships and deals/);
});

test('homepage uses one simple football story instead of multiple technical demos', () => {
  assert.match(site, /ReDreamSimpleStory/);
  assert.doesNotMatch(site, /ReDreamDecisionLayer/);
  assert.doesNotMatch(site, /ReDreamLiveOperatingDemo/);
  assert.doesNotMatch(site, /ReDreamCommercialJourney/);
  assert.match(story, /Arsenal need a left-footed centre-back/);
  assert.match(story, /Daniel Costa looks like the strongest fit/);
  assert.match(story, /warm route into Arsenal/);
  assert.match(story, /Send Daniel's latest clips and confirm his availability/);
  assert.match(story, /One message becomes a tracked opportunity/);
});

test('real-club example is clearly labelled as fictional', () => {
  assert.match(story, /EXAMPLE AGENCY SCENARIO/);
  assert.match(story, /Arsenal is used only as an example club/);
  assert.match(story, /player and request are fictional/);
});

test('homepage stays connected to the first-party funnel', () => {
  assert.match(site, /ReDreamFunnelTracker/);
  assert.match(site, /data-funnel-cta="hero_how_it_works"/);
  assert.match(site, /id="how-it-works"/);
  assert.match(site, /id="value"/);
  assert.match(site, /id="control"/);
  assert.match(site, /id="pricing"/);
  assert.match(site, /id="final-cta"/);
  assert.match(story, /trackFunnel\('product_mode'/);
  assert.match(story, /simple_story/);
});

test('market-leading intelligence remains available on the deeper product experience', () => {
  assert.match(product, /ReDreamDecisionLayer/);
  assert.match(product, /ReDreamLiveOperatingDemo/);
  assert.match(decision, /What needs me first\?/);
  assert.match(decision, /Where is revenue exposed\?/);
  assert.match(live, /LIVE REDREAM OPERATING MODEL/);
  assert.match(sandboxContract, /redream_public_sandbox_v1/);
});

test('sandbox remains isolated synthetic and read-only', () => {
  assert.match(migration, /northstar-football-management/);
  assert.match(migration, /synthetic_test_tenant/);
  assert.match(migration, /staging/);
  assert.match(migration, /revoke all[\s\S]*public, anon, authenticated/i);
  assert.match(edge, /req\.method !== "GET"/);
  assert.match(edge, /source\.synthetic !== true/);
  assert.doesNotMatch(edge, /insert\(/);
  assert.doesNotMatch(edge, /update\(/);
  assert.doesNotMatch(edge, /delete\(/);
});

test('deeper buyer pages remain available without bloating the homepage', () => {
  assert.match(site, /href="\/product"/);
  assert.match(site, /href="\/security"/);
  assert.match(site, /href="\/switch"/);
  assert.match(product, /THREE LAYERS, ONE SYSTEM/);
  assert.match(security, /AUTONOMY ROUTER/);
  assert.match(switchPage, /PLAYER ROSTER MIGRATION/);
});

test('canonical pricing remains unchanged', () => {
  assert.match(site, /€149/);
  assert.match(site, /€399/);
  assert.match(site, /€799/);
  assert.match(site, /From €1,500/);
  assert.match(site, /5 staff · 40 players/);
  assert.match(site, /15 staff · 100 players/);
  assert.match(site, /30 staff · 250 players/);
});

test('homepage copy uses no em dash and public typography remains readable', () => {
  assert.doesNotMatch(site, /—/);
  assert.doesNotMatch(story, /—/);
  for (const source of [css, storyCss]) {
    const sizes = [...source.matchAll(/font-size:\s*([\d.]+)px/g)].map((match) => Number(match[1]));
    assert.ok(sizes.every((size) => size >= 13), 'Public text must stay readable');
  }
  assert.match(css, /prefers-reduced-motion/);
  assert.match(storyCss, /prefers-reduced-motion/);
});

test('homepage avoids fabricated social proof and football visual clichés', () => {
  assert.doesNotMatch(site, /trusted by/i);
  assert.doesNotMatch(site, /testimonial/i);
  assert.doesNotMatch(site, /\bDJM\b/);
  assert.doesNotMatch(site, /stadium|football pitch|soccer ball/i);
});
