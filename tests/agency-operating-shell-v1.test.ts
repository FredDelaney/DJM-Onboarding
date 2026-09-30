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

test('agency workspace exposes the V2 operating areas with management-only Business', () => {
  const app = read('components/AgencyOperatingWorkspace.tsx');
  assert.match(app, /label: 'Home'/);
  assert.match(app, /label: 'Players'/);
  assert.match(app, /label: 'Opportunities'/);
  assert.match(app, /label: 'Network'/);
  assert.match(app, /label: 'Calendar'/);
  assert.match(app, /label: 'Business'/);
  assert.doesNotMatch(app, /label: 'Relationships'/);
  assert.doesNotMatch(app, /label: 'Market'/);
  assert.doesNotMatch(app, /label: 'Deals'/);
  assert.doesNotMatch(app, /label: 'Brain'/);
  assert.match(app, /rawRequestedView === 'market'/);
  assert.match(app, /rawRequestedView === 'deals'/);
  assert.match(app, /rawRequestedView === 'relationships'/);
  assert.match(app, /item\.key !== 'business' \|\| canSeeBusiness/);
});

test('agency workspace uses tenant-native Autopilot reads while preserving the relationship surface', () => {
  const app = read('components/AgencyOperatingWorkspace.tsx');
  assert.match(app, /redream_autopilot_home/);
  assert.match(app, /redream_autopilot_operations/);
  assert.match(app, /invoke<any>\('players_workspace'/);
  assert.match(app, /redream_autopilot_market/);
  assert.match(app, /redream_autopilot_deals/);
  assert.match(app, /redream_autopilot_relationships/);
  assert.match(app, /workspace\.slug/);
  assert.match(app, /service_control/);
  assert.match(app, /market_coverage/);
  assert.match(app, /representation_records/);
  assert.doesNotMatch(app, /invoke\('club_portfolio_control'/);
});

test('Capture stays out of the workspace grid and mobile navigation fits all five areas', () => {
  const app = read('components/AgencyOperatingWorkspace.tsx');
  const css = read('components/AgencyOperatingWorkspace.module.css');

  assert.doesNotMatch(
    app,
    /<div className=\{styles\.root\} style=\{theme\}>\s*<AiLauncher \/>/,
  );

  assert.match(
    app,
    /className=\{styles\.desktopHeadActions\}[\s\S]*<AiLauncher \/>/,
  );
  assert.match(
    app,
    /className=\{styles\.mobileTell\}[\s\S]*<AiLauncher \/>/,
  );

  assert.match(
    css,
    /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(css, /\.navManagement[\s\S]*display:\s*none/);
});

test('one-tap actions still require prepare and explicit confirmation', () => {
  const app = read('components/AgencyOperatingWorkspace.tsx');
  assert.match(app, /actionability\?\.mode === 'one_tap'/);
  assert.match(app, /action_prepare/);
  assert.match(app, /action_execute/);
  assert.match(app, /Nothing changes until you confirm/);
});

test('temporary same-origin workspace stays membership-bound before custom domain', () => {
  const gate = read('components/TenantRouteGate.tsx');
  const temp = read('app/workspace/[tenantSlug]/page.tsx');
  const live = read('app/agency/page.tsx');
  assert.match(gate, /pathname\.startsWith\('\/workspace\/'\)/);
  assert.match(temp, /AgencyOperatingWorkspace/);
  assert.match(live, /AgencyOperatingWorkspace/);
});

test('operating surface stays tenant-neutral without DJM agency branding', () => {
  const app = read('components/AgencyOperatingWorkspace.tsx');
  const layout = read('app/workspace/[tenantSlug]/layout.tsx');
  assert.match(app, /Recently handled by ReDream/);
  assert.doesNotMatch(app, /DJM Sports Management/);
  assert.doesNotMatch(layout, /DJM Sports Management/);
});

test('owner launch hands first-value agencies into the operating workspace', () => {
  const tempLaunch = read('app/activate/[tenantSlug]/page.tsx');
  const liveLaunch = read('app/launch/page.tsx');
  assert.match(tempLaunch, /\/workspace\/\$\{encodeURIComponent\(runtime\.slug\)\}/);
  assert.match(liveLaunch, /window\.location\.assign\('\/agency'\)/);
});
