import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('agency owner invitations store only hashed tokens and keep RPCs server-only', () => {
  const migration = read('supabase/migrations/20260915082000_add_secure_agency_owner_invites_v1.sql');

  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /extensions\.digest\(v_token, 'sha256'\)/);
  assert.doesNotMatch(migration, /\btoken text\b/);
  assert.match(
    migration,
    /revoke all on function public\.platform_server_operator_create_owner_invite[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.platform_server_operator_create_owner_invite[\s\S]*to service_role/,
  );
});

test('owner invite edge routes keep public registration separate from authenticated acceptance', () => {
  const config = read('supabase/config.toml');
  const publicInvite = read('supabase/functions/agency-owner-invite-public/index.ts');
  const protectedInvite = read('supabase/functions/agency-owner-invite/index.ts');

  assert.match(config, /\[functions\.agency-owner-invite-public\]\nverify_jwt = false/);
  assert.match(config, /\[functions\.agency-owner-invite\]\nverify_jwt = true/);
  assert.match(publicInvite, /platform_server_public_owner_invite_preflight/);
  assert.match(publicInvite, /admin\.auth\.admin\.createUser/);
  assert.match(publicInvite, /admin\.auth\.admin\.deleteUser/);
  assert.match(protectedInvite, /createSupabaseContext\(req, \{ auth: "user" \}\)/);
  assert.match(protectedInvite, /Sign in with the email address that received this invitation/);
});

test('platform provisioning creates an owner invite only when the owner account does not exist', () => {
  const platformOps = read('supabase/functions/platform-ops/index.ts');

  assert.match(platformOps, /if\(tenantId&&ownerEmail&&!ownerUserId\)/);
  assert.match(platformOps, /platform_server_operator_create_owner_invite/);
  assert.match(platformOps, /action==="create_owner_invite"/);
  assert.match(platformOps, /action==="revoke_owner_invite"/);
});
