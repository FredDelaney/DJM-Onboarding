import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('shared workspace composes Market and Deals underneath Opportunities while legacy URLs remain compatible', () => {
  const opportunities = read('app/(djm-os)/opportunities/page.tsx');
  const detail = read('app/(djm-os)/opportunities/[id]/page.tsx');
  const workspace = read('components/AgencyOperatingWorkspace.tsx');
  const header = read('components/WorkspaceHeader.tsx');

  assert.match(opportunities, /redirect\('\/agency\?view=market'\)/);
  assert.match(detail, /redirect\('\/agency\?view=deals'\)/);
  assert.match(
    workspace,
    /type View = 'home' \| 'players' \| 'opportunities' \| 'network' \| 'calendar' \| 'business'/,
  );
  assert.match(workspace, /rawRequestedView === 'market'/);
  assert.match(workspace, /rawRequestedView === 'deals'/);
  assert.match(workspace, /redream_autopilot_market/);
  assert.match(workspace, /redream_autopilot_deals/);
  assert.match(workspace, /function Opportunities/);
  assert.match(header, /href: '\/agency\?view=opportunities'/);
  assert.doesNotMatch(header, /href: '\/agency\?view=deals'/);

  assert.doesNotMatch(
    opportunities,
    /djm_market_needs_v3|djm_market_candidates_v2|djm_opportunities|djm_opportunity_upsert/,
  );
});

test('Secure club shares render their approved club-specific pitch context', () => {
  const sharePage = read('app/s/[token]/page.tsx');
  const profile = read('components/PublicProfile.tsx');
  assert.match(sharePage, /pitchMessage=\{data\.pitch_message\}/);
  assert.match(sharePage, /targetClub=\{data\.target_club\}/);
  assert.match(profile, /CLUB-SPECIFIC INTRODUCTION/);
  assert.match(profile, /PREPARED FOR/);
});
