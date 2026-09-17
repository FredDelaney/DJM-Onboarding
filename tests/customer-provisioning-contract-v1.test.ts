import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

const provisioning = read(
  'supabase/migrations/20260917201500_canonicalize_customer_provisioning_contract_v1.sql',
);

const onboarding = read(
  'supabase/migrations/20260917201600_preserve_completed_onboarding_after_go_live_v1.sql',
);

const ops = read('supabase/functions/platform-ops/index.ts');

test('customer provisioning has one explicit canonical 16-argument contract', () => {
  const match = provisioning.match(
    /create function public\.platform_server_provision_customer\(([\s\S]*?)\)\nreturns jsonb/,
  );

  assert.ok(match, 'canonical customer provisioner must exist');

  const args = match[1];

  assert.match(args, /p_owner_contact_email text/);
  assert.doesNotMatch(
    args,
    /\bdefault\b/i,
    'canonical customer provisioner must not use optional defaults',
  );

  assert.match(
    provisioning,
    /drop function if exists public\.platform_server_provision_customer\([\s\S]*?integer\n\);/,
  );

  assert.match(
    provisioning,
    /platform_server_provision_tenant/,
  );
});

test('customer lifecycle keeps modern onboarding and owner contact support', () => {
  assert.match(provisioning, /p_owner_contact_email text/);
  assert.match(provisioning, /owner_contact_email/);
  assert.match(provisioning, /privacy_profile/);
  assert.match(provisioning, /first_tell_djm/);
  assert.match(provisioning, /feature_key='ai_assistant'/);
  assert.match(provisioning, /billing_mode='internal'/);

  assert.match(
    provisioning,
    /platform_server_seed_customer_lifecycle\(\s*p_tenant_id uuid,\s*p_stage text,\s*p_trial_days integer,\s*p_owner_contact_email text/,
  );
});

test('legacy three-argument lifecycle calls remain compatible', () => {
  assert.match(
    provisioning,
    /create function public\.platform_server_seed_customer_lifecycle\(\s*p_tenant_id uuid,\s*p_stage text default null,\s*p_trial_days integer default 14/,
  );

  assert.match(
    provisioning,
    /p_trial_days,\s*null::text/,
  );
});

test('customer provisioning and lifecycle helpers remain service-role only', () => {
  assert.match(
    provisioning,
    /revoke all on function[\s\S]*platform_server_provision_customer/,
  );

  assert.match(
    provisioning,
    /grant execute on function[\s\S]*platform_server_provision_customer[\s\S]*to service_role/,
  );

  assert.match(
    provisioning,
    /grant execute on function[\s\S]*platform_server_seed_customer_lifecycle[\s\S]*to service_role/,
  );
});

test('platform-ops supplies the full customer provision contract explicitly', () => {
  assert.match(
    ops,
    /rpc\("platform_server_provision_customer"/,
  );

  for (const argument of [
    'p_slug',
    'p_display_name',
    'p_plan_key',
    'p_hostname',
    'p_domain_type',
    'p_tenant_type',
    'p_legal_name',
    'p_billing_mode',
    'p_owner_user_id',
    'p_branding',
    'p_settings',
    'p_metadata',
    'p_actor_user_id',
    'p_customer_stage',
    'p_trial_days',
    'p_owner_contact_email',
  ]) {
    assert.match(
      ops,
      new RegExp(`${argument}:`),
      `${argument} must be supplied explicitly`,
    );
  }
});

test('a completed live launch cannot regress to onboarding in progress', () => {
  assert.match(
    onboarding,
    /l\.go_live_at is not null/,
  );

  assert.match(
    onboarding,
    /if coalesce\(v_has_gone_live,false\) then\s*v_status := 'complete'/,
  );

  assert.match(
    onboarding,
    /'go_live_preserved'/,
  );
});

test('onboarding refresh stays behind the service-role boundary', () => {
  assert.match(
    onboarding,
    /revoke all on function[\s\S]*platform_server_refresh_customer_onboarding\(uuid\)[\s\S]*from public,anon,authenticated/,
  );

  assert.match(
    onboarding,
    /grant execute on function[\s\S]*platform_server_refresh_customer_onboarding\(uuid\)[\s\S]*to service_role/,
  );
});
