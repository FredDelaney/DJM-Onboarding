import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const menu = readFileSync(
  'components/AccountMenu.tsx',
  'utf8',
);
const menuStyles = readFileSync(
  'components/AccountMenu.module.css',
  'utf8',
);
const migration = readFileSync(
  'supabase/migrations/20260929131500_account_agency_control_centre_v1.sql',
  'utf8',
);
const agencyOs = readFileSync(
  'supabase/functions/agency-os/index.ts',
  'utf8',
);
const profile = readFileSync(
  'app/(djm-os)/settings/profile/page.tsx',
  'utf8',
);
const billing = readFileSync(
  'app/(djm-os)/settings/billing/page.tsx',
  'utf8',
);
const agency = readFileSync(
  'app/(djm-os)/settings/agency/page.tsx',
  'utf8',
);
const settings = readFileSync(
  'app/(djm-os)/settings/page.tsx',
  'utf8',
);
const settingsWorkspace = readFileSync(
  'components/SettingsWorkspace.tsx',
  'utf8',
);

test('avatar menu is the account and agency control centre', () => {
  assert.match(menu, /My profile/);
  assert.match(menu, /Preferences/);
  assert.match(menu, /Connections/);
  assert.match(menu, /Security/);
  assert.match(menu, /Team & access/);
  assert.match(menu, /Agency settings/);
  assert.match(menu, /Plan & billing/);
  assert.match(menu, /canManageBilling = role === 'owner'/);
  assert.match(menu, /\['owner', 'admin'\]\.includes\(role\)/);
});

test('profile images stay inside the signed-in user storage folder', () => {
  assert.match(profile, /player-public/);
  assert.match(profile, /\$\{userId\}\/account\/avatar-/);
  assert.match(profile, /upsert: false/);
  assert.match(agencyOs, /avatarPath\.startsWith\(userId\+"\/"\)/);
  assert.match(profile, /5 \* 1024 \* 1024/);
});

test('account control centre never stores raw card details', () => {
  assert.doesNotMatch(migration, /card_number|card_cvc|card_expiry/i);
  assert.doesNotMatch(billing, /card number|cvc|cvv/i);
  assert.match(billing, /Card details stay with the secure payment provider/);
});

test('payment changes use the secure provider portal server-side', () => {
  assert.match(agencyOs, /STRIPE_SECRET_KEY/);
  assert.match(agencyOs, /billing_portal\/sessions/);
  assert.match(agencyOs, /external_customer_reference/);
  assert.match(agencyOs, /role!=="owner"/);
  assert.match(billing, /Manage payment & invoices/);
});

test('plan changes are explicit audited requests rather than hidden assignment mutation', () => {
  assert.match(migration, /platform\.tenant_plan_change_requests/);
  assert.match(migration, /account\.plan_change\.requested/);
  assert.match(migration, /account\.plan_change\.cancelled/);
  assert.doesNotMatch(
    migration,
    /update platform\.tenant_plan_assignments[\s\S]*requested_plan_key/,
  );
  assert.match(migration, /where status = 'pending'/);
});

test('private plan requests are service-only', () => {
  assert.match(
    migration,
    /alter table platform\.tenant_plan_change_requests enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on platform\.tenant_plan_change_requests from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant select, insert, update on platform\.tenant_plan_change_requests to service_role/,
  );
});

test('agency and billing changes require the agency owner', () => {
  assert.match(agencyOs, /account_agency_save[\s\S]*role!=="owner"/);
  assert.match(agencyOs, /account_billing_save[\s\S]*role!=="owner"/);
  assert.match(
    migration,
    /m\.role='owner' and m\.status='active'/,
  );
  assert.match(agency, /Agency identity is owner-controlled/);
});

test('settings workspace separates personal agency and ReDream controls without a text-heavy landing page', () => {
  assert.match(settingsWorkspace, /SettingsGroup label="You"/);
  assert.match(settingsWorkspace, /SettingsGroup label="Agency"/);
  assert.match(settingsWorkspace, /SettingsGroup label="ReDream"/);
  assert.match(settingsWorkspace, /canManageAgency/);
  assert.match(settingsWorkspace, /canManageBilling/);
  assert.match(settings, /canManageAgency/);
  assert.match(settings, /canManageBilling/);
  assert.doesNotMatch(settings, />YOUR REDREAM ACCOUNT</);
});

test('account menu and settings remain mobile friendly', () => {
  assert.match(menuStyles, /@media \(max-width: 680px\)/);
  assert.match(menuStyles, /env\(safe-area-inset-top\)/);
  assert.match(menuStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(menuStyles, /min-height: 44px/);
});
