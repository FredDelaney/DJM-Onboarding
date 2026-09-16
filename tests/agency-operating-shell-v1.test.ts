import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('agency workspace authorises with tenant memberships rather than legacy global admin', () => {
  const app = read('components/AgencyOperatingWorkspace.tsx');
  assert.match(app, /'agency-os'/);
  assert.match(app, /action: 'tenants'/);
  assert.match(app, /tenant\.slug/);
  assert.match(app, /owner', 'admin', 'agent', 'operations/);
  assert.doesNotMatch(app, /useAdmin/);
  assert.doesNotMatch(app, /\.from\('profiles'\)/);
});

test('agency workspace is deliberately limited to four daily operating areas', () => {
  const app = read('components/AgencyOperatingWorkspace.tsx');
  assert.match(app, /label: 'Home'/);
  assert.match(app, /label: 'Players'/);
  assert.match(app, /label: 'Network'/);
  assert.match(app, /label: 'Opportunities'/);
  assert.doesNotMatch(app, /label: 'Brain'/);
});

test('agency workspace consumes existing authoritative agency-os surfaces', () => {
  const app = read('components/AgencyOperatingWorkspace.tsx');
  assert.match(app, /invoke\('home'/);
  assert.match(app, /invoke\('roster_command'/);
  assert.match(app, /invoke\('club_portfolio_control'/);
  assert.match(app, /invoke\('deal_portfolio'/);
  assert.match(app, /invoke\('demand_control_fast'/);
});

test('one-tap actions still require prepare and explicit confirmation', () => {
  const app = read('components/AgencyOperatingWorkspace.tsx');
  assert.match(app, /actionability\?\.mode === 'one_tap'/);
  assert.match(app, /action_prepare/);
  assert.match(app, /action_execute/);
  assert.match(app, /Nothing is applied until you confirm/);
});

test('temporary same-origin workspace stays membership-bound before custom domain', () => {
  const gate = read('components/TenantRouteGate.tsx');
  const temp = read('app/workspace/[tenantSlug]/page.tsx');
  const live = read('app/agency/page.tsx');
  assert.match(gate, /pathname\.startsWith\('\/workspace\/'\)/);
  assert.match(temp, /AgencyOperatingWorkspace/);
  assert.match(live, /AgencyOperatingWorkspace/);
});

test('operating surface contains no parent or DJM agency branding', () => {
  const app = read('components/AgencyOperatingWorkspace.tsx');
  const layout = read('app/workspace/[tenantSlug]/layout.tsx');
  assert.doesNotMatch(app, /ReDream/);
  assert.doesNotMatch(app, /DJM Sports Management/);
  assert.doesNotMatch(layout, /ReDream/);
  assert.doesNotMatch(layout, /DJM/);
});

test('owner launch hands first-value agencies into the operating workspace', () => {
  const tempLaunch = read('app/activate/[tenantSlug]/page.tsx');
  const liveLaunch = read('app/launch/page.tsx');
  assert.match(tempLaunch, /\/workspace\/\$\{encodeURIComponent\(runtime\.slug\)\}/);
  assert.match(liveLaunch, /window\.location\.assign\('\/agency'\)/);
});
