import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('app/page.tsx', 'utf8');
const layout = fs.readFileSync('app/layout.tsx', 'utf8');
const gate = fs.readFileSync('components/TenantRouteGate.tsx', 'utf8');
const marketing = fs.readFileSync('components/ReDreamPublicLanding.tsx', 'utf8');
const live = fs.readFileSync('components/ReDreamLiveOperatingDemo.tsx', 'utf8');
const decision = fs.readFileSync('components/ReDreamDecisionLayer.tsx', 'utf8');
const journey = fs.readFileSync('components/ReDreamCommercialJourney.tsx', 'utf8');
const player = fs.readFileSync('components/TenantPlayerLanding.tsx', 'utf8');
const publicLayout = fs.readFileSync('app/(redream-public)/layout.tsx', 'utf8');

test('ReDream public root is host-safe while resolved agency domains keep the tenant player landing', () => {
  assert.match(page, /shouldRenderReDreamPublicSite/);
  assert.match(page, /resolveTenantRuntime/);
  assert.match(page, /x-forwarded-host/);
  assert.match(page, /!runtime\.resolved\s*&&/);
  assert.match(page, /ReDreamPublicLanding/);
  assert.match(page, /TenantPlayerLanding/);
  assert.match(player, /useTenantRuntime/);
  assert.match(player, /Your career, in one place/);
});

test('public ReDream research routes are host-gated instead of opening white-label tenant domains', () => {
  assert.match(gate, /REDREAM_PUBLIC_ROUTES/);
  assert.match(gate, /isReDreamPublicRoute/);
  assert.match(publicLayout, /shouldRenderReDreamPublicSite/);
  assert.match(publicLayout, /notFound\(\)/);
  assert.doesNotMatch(gate, /router\.replace\('\/platform'\)/);
});

test('resolved tenant metadata still wins before public ReDream metadata', () => {
  const runtimeCheck = layout.indexOf('if (runtime.resolved)');
  const publicCheck = layout.indexOf('if (isReDreamPublicSite)');
  assert.ok(runtimeCheck >= 0);
  assert.ok(publicCheck > runtimeCheck);
  assert.match(layout, /Private career app by/);
  assert.match(layout, /Workspace unavailable/);
  assert.match(layout, /index:\s*false/);
  assert.match(layout, /follow:\s*false/);
});

test('homepage defines ReDream around Agency Autopilot and the Agency Decision Layer', () => {
  assert.match(marketing, /THE DECISION LAYER FOR FOOTBALL AGENCIES/);
  assert.match(marketing, /Know what matters next/);
  assert.match(marketing, /Move the agency forward/);
  assert.match(marketing, /Ask the agency, not the dashboard/);
  assert.match(marketing, /Agency Memory/);
  assert.match(marketing, /Automate the admin\. Protect the judgement\./);
});

test('signature decision layer reasons across priority revenue access and career control', () => {
  assert.match(marketing, /ReDreamDecisionLayer/);
  assert.match(decision, /What needs me first\?/);
  assert.match(decision, /Where is revenue exposed\?/);
  assert.match(decision, /Which relationship route is stronger\?/);
  assert.match(decision, /What is blocked by player strategy\?/);
  assert.match(decision, /Autopilot can do/);
  assert.match(decision, /Confirm with me/);
  assert.match(decision, /Agent judgement/);
});

test('commercial thread is visual and keeps the full operating journey without a numbered ten-box rail', () => {
  assert.match(marketing, /ReDreamCommercialJourney/);
  for (const term of ['Club demand','Player fit','Relationship route','Opportunity','Pitch','Follow-up','Deal','Negotiation','Closeout','Commission']) {
    assert.match(journey, new RegExp(term));
  }
  assert.doesNotMatch(marketing, /operatingSpine/);
  assert.doesNotMatch(marketing, /String\(index \+ 1\)\.padStart/);
});

test('website keeps human control evidence and synthetic-demo boundaries explicit', () => {
  assert.match(marketing, /Evidence before action/);
  assert.match(marketing, /Human decision/);
  assert.match(marketing, /player strategy/i);
  assert.match(live, /No customer data/);
  assert.match(live, /Synthetic data/);
  assert.match(live, /not transfer-outcome probabilities/);
  assert.match(decision, /Not chatbot theatre/);
});

test('website uses the current commercial plan structure', () => {
  assert.match(marketing, /€149/);
  assert.match(marketing, /€399/);
  assert.match(marketing, /€799/);
  assert.match(marketing, /From €1,500/);
  assert.match(marketing, /5 staff · 40 players/);
  assert.match(marketing, /15 staff · 100 players/);
  assert.match(marketing, /30 staff · 250 players/);
});

test('public product site is ReDream-specific while tenant player surface remains white-label', () => {
  assert.doesNotMatch(marketing, /\bDJM\b/);
  assert.doesNotMatch(decision, /\bDJM\b/);
  assert.doesNotMatch(player, /\bReDream\b/);
});
