import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

const lifecycle = read(
  'supabase/migrations/20260917121914_add_safe_optional_domain_lifecycle_v1.sql',
);

const overloadFix = read(
  'supabase/migrations/20260917122024_fix_custom_domain_rpc_overload_v1.sql',
);

const ops = read('supabase/functions/platform-ops/index.ts');
const page = read('app/platform/page.tsx');
const domainCard = read('app/platform/AgencyDomainCard.tsx');

test('every agency can receive a managed ReDream workspace address', () => {
  assert.match(lifecycle, /platform_server_operator_assign_platform_domain/);
  assert.match(lifecycle, /managed_platform_domain/);
  assert.match(lifecycle, /platform_subdomain/);
  assert.match(lifecycle, /'verified'/);
  assert.match(lifecycle, /platform_hostname/);

  assert.match(ops, /REDREAM_TENANT_DOMAIN_BASE/);
  assert.match(ops, /REDREAM_TENANT_DOMAIN_READY/);
  assert.match(ops, /platform_server_operator_assign_platform_domain/);
  assert.match(ops, /default_address/);
});

test('custom domains remain optional and separate from initial agency creation', () => {
  assert.match(lifecycle, /'custom_domain_optional',true/);
  assert.match(
    lifecycle,
    /A customer-owned custom domain is optional and never required to use or launch the workspace/,
  );

  assert.doesNotMatch(page, /hostname:\s*agency\.hostname/);
  assert.match(page, /AgencyDomainCard/);
  assert.match(domainCard, /Custom domain/);
  assert.match(domainCard, /Optional/);
  assert.match(domainCard, /permanent fallback/);
});

test('ReDream managed namespace cannot be claimed through the custom-domain path', () => {
  assert.match(overloadFix, /v_hostname='redreamsystems\.com'/);
  assert.match(overloadFix, /v_hostname like '%\.redreamsystems\.com'/);
  assert.match(overloadFix, /managed_redream_domain_not_custom/);
  assert.match(ops, /managed_redream_domain_not_custom/);
});

test('a custom domain can become primary only after provider and DNS verification', () => {
  assert.match(ops, /snapshot\.verified\s*===\s*true/);
  assert.match(ops, /dns\?\.misconfigured\s*===\s*false/);
  assert.match(ops, /action\s*===\s*"set_primary_domain"/);
  assert.match(lifecycle, /domain_must_be_verified/);

  assert.match(domainCard, /Check DNS/);
  assert.match(domainCard, /Make primary/);
  assert.match(domainCard, /domain\.status === 'verified'/);
});

test('disconnecting a custom primary falls back to a verified ReDream domain', () => {
  assert.match(lifecycle, /cannot_disable_platform_domain_here/);
  assert.match(
    lifecycle,
    /case when d\.domain_type='platform_subdomain' then 0 else 1 end/,
  );
  assert.match(ops, /action\s*===\s*"disable_custom_domain"/);
  assert.match(domainCard, /Disconnect/);
  assert.match(domainCard, /ReDream address remains available/);
});

test('domain lifecycle RPCs stay behind the service-role boundary', () => {
  for (const rpc of [
    'platform_server_operator_domain_control',
    'platform_server_operator_assign_platform_domain',
    'platform_server_operator_add_custom_domain',
    'platform_server_operator_record_domain_provider_state',
    'platform_server_operator_set_primary_domain',
    'platform_server_operator_disable_custom_domain',
  ]) {
    assert.match(lifecycle + overloadFix, new RegExp(`revoke all on function public\\.${rpc}`));
  }

  assert.match(
    lifecycle,
    /grant execute on function public\.platform_server_operator_domain_control\(uuid\) to service_role/,
  );
  assert.match(
    lifecycle,
    /grant execute on function public\.platform_server_operator_assign_platform_domain\(uuid,text,uuid\) to service_role/,
  );
});

test('custom-domain provider failure cannot block core customer provisioning', () => {
  assert.match(
    ops,
    /const customer\s*=\s*await rpc\("platform_server_provision_customer"/,
  );
  assert.match(ops, /provider_not_configured/);
  assert.match(
    ops,
    /Custom domain setup is optional and can be completed later from Domain control/,
  );
  assert.match(ops, /requested_custom_domain/);
});
