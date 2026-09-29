import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(
  'components/SettingsWorkspace.tsx',
  'utf8',
);
const workspaceCss = readFileSync(
  'components/SettingsWorkspace.module.css',
  'utf8',
);
const menu = readFileSync(
  'components/AccountMenu.tsx',
  'utf8',
);
const settings = readFileSync(
  'app/(djm-os)/settings/page.tsx',
  'utf8',
);
const profile = readFileSync(
  'app/(djm-os)/settings/profile/page.tsx',
  'utf8',
);
const preferences = readFileSync(
  'app/(djm-os)/settings/preferences/page.tsx',
  'utf8',
);
const connections = readFileSync(
  'app/(djm-os)/settings/connections/page.tsx',
  'utf8',
);
const team = readFileSync(
  'app/(djm-os)/settings/team/page.tsx',
  'utf8',
);
const agency = readFileSync(
  'app/(djm-os)/settings/agency/page.tsx',
  'utf8',
);
const billing = readFileSync(
  'app/(djm-os)/settings/billing/page.tsx',
  'utf8',
);
const security = readFileSync(
  'app/(djm-os)/settings/security/page.tsx',
  'utf8',
);

test('settings is one persistent page workspace rather than disconnected back-link pages', () => {
  assert.match(workspace, /Settings navigation/);
  assert.match(workspace, /Back to workspace/);
  assert.match(workspace, /Overview/);
  assert.match(workspace, /My profile/);
  assert.match(workspace, /Preferences/);
  assert.match(workspace, /Connections/);
  assert.match(workspace, /Security/);
  assert.match(workspace, /Team & access/);
  assert.match(workspace, /Agency settings/);
  assert.match(workspace, /Plan & billing/);

  for (const source of [profile, preferences, connections, team, agency, billing, security]) {
    assert.match(source, /SettingsWorkspace/);
    assert.doesNotMatch(source, /className="ux-back-link"/);
  }
});

test('settings navigation remains role aware', () => {
  assert.match(workspace, /\['owner', 'admin'\]\.includes\(role\)/);
  assert.match(workspace, /canManageBilling = role === 'owner'/);
  assert.match(workspace, /canManagePlayerExperience = auth\.profile\?\.role === 'admin'/);
  assert.match(workspace, /aria-current=\{current \? 'page' : undefined\}/);
});

test('preferences is a first-class personal setting in both the avatar menu and settings overview', () => {
  assert.match(menu, /href="\/settings\/preferences"/);
  assert.match(menu, /Notifications and calendar/);
  assert.match(settings, /href="\/settings\/preferences"/);
  assert.match(preferences, /sections="preferences"/);
});

test('Connections is a real page for provider accounts and inline identity review', () => {
  assert.match(connections, /AgencyConnectionsDrawer/);
  assert.match(connections, /AgencyConnectedIdentityResolverDrawer/);
  assert.match(connections, /presentation="page"/);
  assert.match(connections, /reviewingIdentities/);
  assert.match(connections, /onResolveIdentities=\{\(\) => setReviewingIdentities\(true\)\}/);
  assert.match(connections, /onClose=\{\(\) => setReviewingIdentities\(false\)\}/);
  assert.doesNotMatch(connections, /ConnectionsPanel/);
});

test('Security owns password session and passkey controls without duplicating preferences', () => {
  assert.match(security, /Send password reset/);
  assert.match(security, /This device/);
  assert.match(security, /ConnectionsPanel/);
  assert.match(security, /sections="security"/);
  assert.doesNotMatch(security, /sections="preferences"/);
});

test('settings mobile navigation is horizontal and touch safe instead of a side drawer', () => {
  assert.match(workspaceCss, /@media \(max-width: 820px\)/);
  assert.match(workspaceCss, /overflow-x: auto/);
  assert.match(workspaceCss, /display: flex/);
  assert.match(workspaceCss, /border-radius: 999px/);
  assert.match(workspaceCss, /min-height: 44px/);
  assert.doesNotMatch(workspaceCss, /position: fixed/);
});

test('settings overview is deliberately concise', () => {
  assert.match(settings, /Manage your account and agency in one place\./);
  assert.match(settings, /Photo, name and preferences\./);
  assert.match(settings, /Email, calendar and messaging\./);
  assert.match(settings, /Invite people and manage roles\./);
  assert.doesNotMatch(settings, /CURRENT WORKSPACE/);
  assert.doesNotMatch(settings, /ACCESS RULE/);
});
