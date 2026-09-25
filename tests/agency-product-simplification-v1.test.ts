import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const launcher = readFileSync(
  'components/AiLauncher.tsx',
  'utf8',
);
const header = readFileSync(
  'components/WorkspaceHeader.tsx',
  'utf8',
);

test('agency tenants receive the simple ReDream V2 product shell', () => {
  assert.match(workspace, /label: 'Home'/);
  assert.match(workspace, /label: 'Players'/);
  assert.match(workspace, /label: 'Opportunities'/);
  assert.match(workspace, /label: 'Network'/);
  assert.match(workspace, /label: 'Calendar'/);
  assert.match(workspace, /label: 'Business'/);

  assert.doesNotMatch(workspace, /label: 'Market'/);
  assert.doesNotMatch(workspace, /label: 'Deals'/);
  assert.doesNotMatch(workspace, /label: 'Relationships'/);
  assert.doesNotMatch(workspace, /DJM Sports Management/);
});

test('business is management-only in primary navigation', () => {
  assert.match(workspace, /const canSeeBusiness = \['owner', 'admin'\]/);
  assert.match(
    workspace,
    /item\.key !== 'business' \|\| canSeeBusiness/,
  );
});

test('legacy market, deals and relationships URLs resolve into V2 areas', () => {
  assert.match(workspace, /rawRequestedView === 'market'/);
  assert.match(workspace, /rawRequestedView === 'deals'/);
  assert.match(workspace, /rawRequestedView === 'relationships'/);
  assert.match(workspace, /\?view=opportunities/);
  assert.match(workspace, /\?view=network/);
  assert.match(workspace, /workspace\.slug/);
  assert.match(workspace, /tenant_id: workspace\.tenant_id/);
});

test('Home shows only the few things that need attention', () => {
  assert.match(workspace, /\.slice\(0, 5\)/);
  assert.match(workspace, /Good morning\./);
  assert.match(workspace, /things need/);
  assert.match(workspace, /OPPORTUNITIES MOVING/);
  assert.match(workspace, /PLAYERS NEEDING ATTENTION/);
  assert.doesNotMatch(workspace, />Agency history</);
  assert.doesNotMatch(workspace, />Owner view</);
});

test('Opportunities combines existing market and deal capability without rebuilding backend', () => {
  assert.match(workspace, /redream_autopilot_market/);
  assert.match(workspace, /redream_autopilot_deals/);
  assert.match(workspace, /function Opportunities/);
  assert.match(workspace, /Club needs\. Player fits\. Best route in\./);
  assert.match(workspace, /AgencyPursuitRoom/);
  assert.match(workspace, /AgencyNegotiationCommandRoom/);
  assert.match(workspace, /AgencyDealCloseoutDrawer/);
});

test('Calendar reuses existing dated operations rather than inventing a new backend', () => {
  assert.match(workspace, /view === 'calendar'/);
  assert.match(workspace, /redream_autopilot_operations/);
  assert.match(workspace, /function AgencyCalendar/);
});

test('Tell ReDream remains the universal capture entry point', () => {
  assert.match(launcher, />Tell ReDream</);
  assert.match(
    launcher,
    /Tell ReDream what happened\. We’ll handle the admin\./,
  );
  assert.match(launcher, /redream_ai_current_access/);
});

test('shared header no longer presents Market or Deals as products', () => {
  assert.match(header, /label: 'Home'/);
  assert.match(header, /label: 'Opportunities'/);
  assert.match(header, /label: 'Calendar'/);
  assert.doesNotMatch(header, /label: 'Market'/);
  assert.doesNotMatch(header, /label: 'Deals'/);
});

test('advanced capability remains in code underneath progressive disclosure', () => {
  assert.match(workspace, /AgencyMemoryDrawer/);
  assert.match(workspace, /AgencyOwnerCommandCentre/);
  assert.match(workspace, /AgencyPursuitRoom/);
  assert.match(workspace, /AgencyEntityIntelligenceDrawer/);
  assert.match(workspace, /AgencyContactIntelligenceDrawer/);
  assert.match(workspace, /AgencyNegotiationCommandRoom/);
  assert.match(workspace, /action_prepare/);
  assert.match(workspace, /action_execute/);
  assert.match(workspace, /Nothing changes until you confirm/);
});
