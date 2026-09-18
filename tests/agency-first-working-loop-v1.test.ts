import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ownerLaunch = readFileSync(
  'app/activate/[tenantSlug]/page.tsx',
  'utf8',
);

const activationCss = readFileSync(
  'app/activate/[tenantSlug]/page.module.css',
  'utf8',
);

const activationModel = readFileSync(
  'supabase/migrations/20260915083727_add_agency_activation_journey_v1.sql',
  'utf8',
);

test('first relationship becomes one guided working loop for the owner', () => {
  assert.match(ownerLaunch, /FIRST WORKING LOOP/);
  assert.match(ownerLaunch, /Put one player in motion/);
  assert.match(ownerLaunch, /Real club relationship/);
  assert.match(ownerLaunch, /Live player route/);
  assert.match(ownerLaunch, /Create first working loop/);
});

test('working loop orchestrates the existing guarded writes in evidence order', () => {
  const relationship = ownerLaunch.indexOf(
    "action: 'create_first_relationship'",
  );
  const opportunity = ownerLaunch.indexOf(
    "action: 'create_first_opportunity'",
    relationship,
  );

  assert.ok(relationship >= 0);
  assert.ok(opportunity > relationship);
  assert.match(ownerLaunch, /tenant_slug: runtime\.slug/);
  assert.match(ownerLaunch, /player_id: opportunity\.playerId/);
  assert.match(ownerLaunch, /club_name: relationship\.clubName/);
});

test('partial failure preserves saved evidence and reloads canonical progress', () => {
  assert.match(ownerLaunch, /let opportunityFailure = ''/);
  assert.match(ownerLaunch, /await loadLaunch\(\)/);
  assert.match(ownerLaunch, /Club relationship saved\. Your progress is safe\./);
  assert.match(ownerLaunch, /Finish the live opportunity below to reach first value/);
  assert.match(ownerLaunch, /const message = friendlyError\(relationshipError\);[\s\S]*await loadLaunch\(\);/);
  assert.match(ownerLaunch, /nextStep === 'first_opportunity'/);
});

test('working loop carries club context into the existing opportunity fallback', () => {
  assert.match(
    ownerLaunch,
    /setOpportunity\(\(current\) => \(\{[\s\S]*clubName: value/,
  );
  assert.match(
    ownerLaunch,
    /setOpportunity\(\(current\) => \(\{[\s\S]*country: value/,
  );
});

test('first value remains defined by real player relationship and opportunity evidence', () => {
  assert.match(
    activationModel,
    /roster_player_count>0 and relationship_count>0 and \(player_opportunity_count>0 or active_club_need_count>0\)\) first_value_ready/,
  );
  assert.doesNotMatch(ownerLaunch, /mark_first_value/);
  assert.doesNotMatch(ownerLaunch, /complete_first_value/);
});

test('working loop has a responsive activation-only treatment', () => {
  assert.match(activationCss, /\.workingLoopIntro\s*\{/);
  assert.match(
    activationCss,
    /grid-template-columns:\s*minmax\(0,\s*1fr\) auto minmax\(0,\s*1fr\)/,
  );
  assert.match(activationCss, /\.workingLoopTruth\s*\{/);
  assert.match(
    activationCss,
    /@media \(max-width: 620px\)[\s\S]*\.workingLoopIntro/,
  );
});
