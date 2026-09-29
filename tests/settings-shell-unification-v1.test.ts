import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const settingsWorkspace = readFileSync(
  'components/SettingsWorkspace.tsx',
  'utf8',
);
const agencyWorkspace = readFileSync(
  'components/AgencyOperatingWorkspace.tsx',
  'utf8',
);
const tenantBrand = readFileSync(
  'components/TenantWorkspaceBrand.tsx',
  'utf8',
);
const settingsRoutes = [
  'app/(djm-os)/settings/page.tsx',
  'app/(djm-os)/settings/profile/page.tsx',
  'app/(djm-os)/settings/preferences/page.tsx',
  'app/(djm-os)/settings/connections/page.tsx',
  'app/(djm-os)/settings/security/page.tsx',
  'app/(djm-os)/settings/team/page.tsx',
  'app/(djm-os)/settings/agency/page.tsx',
  'app/(djm-os)/settings/billing/page.tsx',
].map((path) => readFileSync(path, 'utf8'));

test('settings no longer switches into the legacy DJM OS CSS shell', () => {
  assert.doesNotMatch(settingsWorkspace, /AgencyShell/);
  assert.doesNotMatch(settingsWorkspace, /djm-os-root/);
  assert.match(
    settingsWorkspace,
    /AgencyOperatingWorkspace\.module\.css/,
  );
  assert.match(settingsWorkspace, /data-settings-shell="agency-workspace"/);
});

test('every avatar-menu settings destination stays inside the unified settings workspace', () => {
  for (const route of settingsRoutes) {
    assert.match(route, /SettingsWorkspace/);
  }
});

test('settings and the main agency workspace share the same tenant logo treatment', () => {
  assert.match(settingsWorkspace, /TenantWorkspaceBrand/);
  assert.match(agencyWorkspace, /TenantWorkspaceBrand/);
  assert.match(settingsWorkspace, /mobileTenantBrand/);
  assert.match(agencyWorkspace, /mobileTenantBrand/);
  assert.match(tenantBrand, /branding\.logo_asset/);
  assert.match(tenantBrand, /branding\.compact_logo_asset/);
  assert.match(tenantBrand, /branding\.light_logo_asset/);
});

test('settings keeps the same account menu and mobile Tell ReDream affordance as the app', () => {
  assert.match(settingsWorkspace, /AccountMenu/);
  assert.match(settingsWorkspace, /mobileHeadActions/);
  assert.match(settingsWorkspace, /mobileTell/);
  assert.match(settingsWorkspace, /AiLauncher/);
});
