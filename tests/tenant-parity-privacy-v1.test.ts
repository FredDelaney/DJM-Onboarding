import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const migrationName = readdirSync('supabase/migrations')
  .filter((name) =>
    name.endsWith('_tenant_parity_privacy_and_invites_v1.sql'),
  )
  .sort()
  .at(-1);

assert.ok(
  migrationName,
  'tenant parity privacy migration must exist',
);

const migration = readFileSync(
  `supabase/migrations/${migrationName}`,
  'utf8',
);

test('DJM privacy is normal tenant configuration', () => {
  assert.match(migration, /DJM Sports Management/);
  assert.match(migration, /https:\/\/app\.djmsports\.com\/privacy/);
  assert.match(migration, /tenant_privacy_profiles/);
  assert.match(migration, /tenant_privacy_notice_versions/);
});

test('player invite activation no longer has an internal tenant bypass', () => {
  const preflightStart = migration.indexOf(
    'platform_server_public_invite_preflight',
  );
  const acceptanceStart = migration.indexOf(
    'platform_server_complete_player_invite_acceptance',
  );

  assert.ok(preflightStart >= 0);
  assert.ok(acceptanceStart > preflightStart);

  const activeInviteLogic = migration.slice(preflightStart);

  assert.doesNotMatch(activeInviteLogic, /legacy_internal/);
  assert.doesNotMatch(activeInviteLogic, /internal_tenant/);
  assert.match(activeInviteLogic, /tenant_privacy_not_ready/);
  assert.match(activeInviteLogic, /'privacy_notice_mode','tenant'/);
});

test('player invitation creation resolves the trusted ReDream workspace', () => {
  const inviteStart = migration.indexOf(
    'create or replace function public.create_player_invitation',
  );

  assert.ok(inviteStart >= 0);

  const invite = migration.slice(inviteStart);

  assert.match(invite, /private\.redream_request_tenant\(\)/);
  assert.match(invite, /private\.user_is_tenant_admin\(v_tenant,v_uid\)/);
  assert.match(invite, /tenant_privacy_not_ready/);
  assert.doesNotMatch(invite, /Internal DJM tenant admin access required/);
  assert.doesNotMatch(invite, /internal_tenant/);
});
