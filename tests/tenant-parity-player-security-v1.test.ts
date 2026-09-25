import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260924214500_tenant_parity_player_security_v1.sql',
  'utf8',
);

test('player-domain admin access is scoped through the player tenant', () => {
  assert.match(migration, /user_is_player_tenant_admin/);
  assert.match(migration, /user_is_tenant_admin\(p\.tenant_id,p_user_id\)/);

  for (const table of [
    'player_agreements',
    'player_invites',
    'player_public_profiles',
    'player_requests',
    'staff_player_access',
  ]) {
    assert.match(migration, new RegExp(`on public\\.${table}`));
  }

  assert.doesNotMatch(migration, /private\.is_admin\(\)/);
});

test('public profile contact follows normal tenant branding', () => {
  const start = migration.indexOf(
    'create or replace function private.enforce_public_profile_tenant_contact',
  );
  const end = migration.indexOf(
    'create or replace function private.protect_document_club_share_approval',
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const source = migration.slice(start, end);

  assert.match(source, /tenant_branding/);
  assert.match(source, /tenant_support_email_required/);
  assert.doesNotMatch(source, /internal_tenant/);
  assert.doesNotMatch(source, /djm-sports-management/);
});

test('protected player writes use tenant membership instead of global admin role', () => {
  assert.match(
    migration,
    /tenant_admin boolean:=private\.user_is_tenant_admin\(old\.tenant_id\)/,
  );
  assert.match(
    migration,
    /private\.user_is_player_tenant_admin\(old\.player_id\)/,
  );
  assert.match(
    migration,
    /private\.user_is_tenant_admin\(old\.tenant_id\)/,
  );
});

test('legacy team-member storage is no longer the authorisation source', () => {
  const ensureStart = migration.indexOf(
    'create or replace function private.platform_server_ensure_team_member',
  );
  const validateStart = migration.indexOf(
    'create or replace function djm_os.validate_player_primary_staff',
  );

  assert.ok(ensureStart >= 0);
  assert.ok(validateStart > ensureStart);

  const ensure = migration.slice(ensureStart, validateStart);
  const validate = migration.slice(validateStart);

  assert.match(ensure, /platform\.tenant_memberships/);
  assert.match(ensure, /agency_staff_membership_required/);
  assert.match(ensure, /insert into djm_os\.team_members/);

  assert.match(validate, /user_has_staff_tenant_access/);
  assert.doesNotMatch(
    validate,
    /where tm\.user_id=new\.primary_staff_user_id/,
  );
});

test('tenant ownership remains immutable on core operational records', () => {
  const prior = readFileSync(
    'supabase/migrations/20260913103355_tenantize_tell_djm_and_agency_workspaces.sql',
    'utf8',
  );

  assert.match(prior, /Tenant ownership is immutable/);
});
