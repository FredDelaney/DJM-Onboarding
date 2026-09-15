import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('privacy readiness is a separate operational readiness layer', () => {
  const migration = read(
    'supabase/migrations/20260915101022_tenant_privacy_readiness_and_owner_configuration_v1.sql',
  );

  assert.match(migration, /platform_server_tenant_privacy_readiness/);
  assert.match(migration, /ready_for_player_invites/);
  assert.match(migration, /privacy_profile/);
  assert.match(migration, /privacy_readiness/);
});

test('privacy writes require an active owner or platform operator', () => {
  const migration = read(
    'supabase/migrations/20260915101022_tenant_privacy_readiness_and_owner_configuration_v1.sql',
  );

  assert.match(migration, /m\.role\s*=\s*'owner'/);
  assert.match(migration, /m\.status\s*=\s*'active'/);
  assert.match(migration, /platform_operator_access_required/);
  assert.match(
    migration,
    /revoke all on function public\.platform_server_owner_update_privacy_profile[\s\S]*from public,anon,authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.platform_server_owner_update_privacy_profile[\s\S]*to service_role/,
  );
});

test('privacy profile is required for external customer onboarding only', () => {
  const migration = read(
    'supabase/migrations/20260915101022_tenant_privacy_readiness_and_owner_configuration_v1.sql',
  );

  assert.match(
    migration,
    /\('privacy_profile','privacy','Configure privacy profile'[\s\S]*not v_is_internal,35\)/,
  );
});

test('agency privacy edge route is authenticated and uses server bridge RPCs', () => {
  const edge = read('supabase/functions/agency-privacy/index.ts');
  const config = read('supabase/config.toml');

  assert.match(edge, /createSupabaseContext\(req, \{\s*auth: "user"/);
  assert.match(edge, /platform_server_owner_privacy_profile/);
  assert.match(edge, /platform_server_owner_update_privacy_profile/);
  assert.doesNotMatch(edge, /\.schema\("platform"\)/);
  assert.match(config, /\[functions\.agency-privacy\]\nverify_jwt = true/);
});

test('operator backend can assist privacy setup and still tracks owner invite delivery', () => {
  const platformOps = read('supabase/functions/platform-ops/index.ts');

  assert.match(platformOps, /action==="update_privacy_profile"/);
  assert.match(platformOps, /platform_server_operator_update_privacy_profile/);
  assert.match(platformOps, /action==="mark_owner_invite_sent"/);
});
