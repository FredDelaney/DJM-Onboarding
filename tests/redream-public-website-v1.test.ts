import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('app/page.tsx', 'utf8');
const layout = fs.readFileSync('app/layout.tsx', 'utf8');
const gate = fs.readFileSync(
  'components/TenantRouteGate.tsx',
  'utf8',
);
const marketing = fs.readFileSync(
  'components/ReDreamPublicLanding.tsx',
  'utf8',
);
const player = fs.readFileSync(
  'components/TenantPlayerLanding.tsx',
  'utf8',
);

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

test('public ReDream root is allowed by unresolved tenant gate instead of redirecting into operator control plane', () => {
  assert.match(gate, /isReDreamPublicRoot/);
  assert.match(gate, /pathname === '\/'/);
  assert.doesNotMatch(gate, /router\.replace\('\/platform'\)/);
  assert.doesNotMatch(gate, /shouldRedirectReDreamRoot/);
});

test('resolved tenant metadata wins before public ReDream metadata and unresolved unknown domains remain private', () => {
  const runtimeCheck = layout.indexOf('if (runtime.resolved)');
  const publicCheck = layout.indexOf('if (isReDreamPublicSite)');

  assert.ok(runtimeCheck >= 0);
  assert.ok(publicCheck > runtimeCheck);
  assert.match(layout, /Private career app by/);
  assert.match(layout, /Operating system for football agencies/);
  assert.match(layout, /index:\s*true/);
  assert.match(layout, /follow:\s*true/);
  assert.match(layout, /Workspace unavailable/);
  assert.match(layout, /index:\s*false/);
  assert.match(layout, /follow:\s*false/);
});

test('website presents the agency operating spine as a distinct operating category', () => {
  assert.match(marketing, /The operating system/);
  assert.match(marketing, /football agencies/);
  assert.match(marketing, /How ReDream Works/);
  assert.match(marketing, /Agency Memory/);
  assert.match(marketing, /players who need an update/);
  assert.match(marketing, /club requests worth pursuing/);
  assert.match(marketing, /deals waiting on a decision/);
  assert.match(marketing, /Club need/);
  assert.match(marketing, /Commission/);
});

test('website keeps human control and evidence boundaries explicit', () => {
  assert.match(marketing, /Human judgement where it matters/);
  assert.match(marketing, /does not invent/);
  assert.match(marketing, /Human decision/);
  assert.match(marketing, /Player-safe by design/);
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
  assert.doesNotMatch(player, /\bReDream\b/);
});

