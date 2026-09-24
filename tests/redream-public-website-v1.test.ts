import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('app/page.tsx', 'utf8');
const layout = fs.readFileSync('app/layout.tsx', 'utf8');
const gate = fs.readFileSync('components/TenantRouteGate.tsx', 'utf8');
const marketing = fs.readFileSync('components/ReDreamPublicLanding.tsx', 'utf8');
const story = fs.readFileSync('components/ReDreamSimpleStory.tsx', 'utf8');
const decision = fs.readFileSync('components/ReDreamDecisionLayer.tsx', 'utf8');
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

test('public ReDream research routes stay host-gated', () => {
  assert.match(gate, /REDREAM_PUBLIC_ROUTES/);
  assert.match(gate, /isReDreamPublicRoute/);
  assert.match(publicLayout, /shouldRenderReDreamPublicSite/);
  assert.match(publicLayout, /notFound\(\)/);
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

test('homepage explains ReDream without requiring product vocabulary', () => {
  assert.match(marketing, /Run your agency without relying on memory/);
  assert.match(marketing, /what needs attention and what to do next/);
  assert.match(marketing, /Less admin/);
  assert.match(marketing, /Fewer missed follow-ups/);
  assert.match(marketing, /More time for deals/);
  assert.doesNotMatch(marketing, /Agency Memory/);
  assert.doesNotMatch(marketing, /Decision Layer/);
});

test('simple story connects club request player relationship next move and outcome', () => {
  for (const term of [
    'Club asks',
    'Player fits',
    'Best route',
    'Next move',
    'Arsenal',
    'Daniel Costa',
    'Problem',
    'ReDream',
    'Outcome',
  ]) {
    assert.match(story, new RegExp(term));
  }
});

test('website keeps human control simple and explicit', () => {
  assert.match(marketing, /ReDream helps with the work\. You make the decisions\./);
  assert.match(marketing, /You approve important actions/);
  assert.match(marketing, /You own the judgement/);
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

test('public product site stays ReDream-specific while tenant player surface remains white-label', () => {
  assert.doesNotMatch(marketing, /\bDJM\b/);
  assert.doesNotMatch(decision, /\bDJM\b/);
  assert.doesNotMatch(player, /\bReDream\b/);
});
