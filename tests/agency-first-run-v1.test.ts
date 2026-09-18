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

const rosterPanel = readFileSync(
  'components/AgencyRosterMigrationPanel.tsx',
  'utf8',
);

test('owner first run offers one-player quick start and existing roster import', () => {
  assert.match(ownerLaunch, /Add one player now/);
  assert.match(ownerLaunch, /Bring your players in/);
  assert.match(ownerLaunch, /AgencyRosterMigrationPanel/);
  assert.match(ownerLaunch, /create_first_player/);
});

test('roster import reuses the tenant-bound agency operating bridge', () => {
  assert.match(ownerLaunch, /platformInvoke<T>\('agency-os'/);
  assert.match(ownerLaunch, /tenant_id: launch\.tenant_id/);
  assert.match(ownerLaunch, /invoke=\{invokeAgencyOs\}/);
  assert.match(ownerLaunch, /await loadLaunch\(\)/);
});

test('privacy remains ahead of first player onboarding', () => {
  const privacyIndex = ownerLaunch.indexOf("privacy: {");
  const playerIndex = ownerLaunch.indexOf("first_player: {");
  assert.ok(privacyIndex >= 0);
  assert.ok(playerIndex > privacyIndex);
  assert.match(ownerLaunch, /platformInvoke\('agency-privacy'/);
});

test('existing roster path keeps preflight and human duplicate decisions', () => {
  assert.match(rosterPanel, /migration_preflight/);
  assert.match(rosterPanel, /migration_row_decision/);
  assert.match(rosterPanel, /decision: 'create' \| 'skip'/);
  assert.match(rosterPanel, /row_id: rowId,[\s\S]*decision,/);
  assert.match(rosterPanel, /migration_approve/);
  assert.match(rosterPanel, /migration_apply/);
});

test('first-run experience stays evidence-derived rather than manually completed', () => {
  assert.doesNotMatch(ownerLaunch, /mark_first_player_complete/);
  assert.doesNotMatch(ownerLaunch, /complete_owner_step/);
  assert.doesNotMatch(ownerLaunch, /set_first_value/);
  assert.match(
    ownerLaunch,
    /Your first player milestone now comes from the real roster/,
  );
});

test('first-player choice surface has responsive activation-only styling', () => {
  assert.match(activationCss, /\.firstPlayerRoutes\s*\{/);
  assert.match(
    activationCss,
    /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(activationCss, /button\.firstPlayerRoute:hover/);
  assert.match(
    activationCss,
    /@media \(max-width: 620px\)[\s\S]*\.firstPlayerRoutes/,
  );
});
