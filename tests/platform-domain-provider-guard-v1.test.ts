import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

const migration = read(
  'supabase/migrations/20260917193000_harden_provider_managed_custom_domains_v1.sql',
);

const ops = read('supabase/functions/platform-ops/index.ts');

test('provider state can only mutate provider-managed custom domains', () => {
  assert.match(
    migration,
    /platform_server_operator_record_domain_provider_state/,
  );

  assert.match(
    migration,
    /metadata->>'provider',''\)\)='vercel'/,
  );

  assert.match(
    migration,
    /metadata->>'created_from',''\)\)='platform_ops'/,
  );

  assert.match(
    migration,
    /custom_domain_not_provider_managed/,
  );
});

test('legacy custom domains cannot be disconnected through the provider path', () => {
  assert.match(
    migration,
    /platform_server_operator_disable_custom_domain/,
  );

  const guardMatches =
    migration.match(/custom_domain_not_provider_managed/g) ?? [];

  assert.equal(
    guardMatches.length,
    2,
    'both DB mutation paths must reject non-provider-managed custom domains',
  );
});

test('edge provider calls reject legacy domains before contacting Vercel', () => {
  assert.match(
    ops,
    /const providerManagedDomain=/,
  );

  assert.match(
    ops,
    /metadata\.provider/,
  );

  assert.match(
    ops,
    /metadata\.created_from/,
  );

  assert.match(
    ops,
    /Existing workspace domains cannot be managed through ReDream provider controls/,
  );

  assert.match(
    ops,
    /Existing workspace domains cannot be disconnected through ReDream domain control/,
  );

  const edgeGuards =
    ops.match(/custom_domain_not_provider_managed/g) ?? [];

  assert.ok(
    edgeGuards.length >= 2,
    'refresh and disconnect must both have a provider-management guard',
  );
});

test('provider-managed domain hardening remains service-role only', () => {
  assert.match(
    migration,
    /revoke all on function[\s\S]*platform_server_operator_record_domain_provider_state/,
  );

  assert.match(
    migration,
    /revoke all on function[\s\S]*platform_server_operator_disable_custom_domain/,
  );

  assert.match(
    migration,
    /grant execute on function[\s\S]*platform_server_operator_record_domain_provider_state[\s\S]*to service_role/,
  );

  assert.match(
    migration,
    /grant execute on function[\s\S]*platform_server_operator_disable_custom_domain[\s\S]*to service_role/,
  );
});
