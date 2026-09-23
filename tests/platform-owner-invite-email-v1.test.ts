import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const platformOps = fs.readFileSync(
  'supabase/functions/platform-ops/index.ts',
  'utf8',
);
const activation = fs.readFileSync(
  'app/platform/AgencyActivationCard.tsx',
  'utf8',
);
const activationCss = fs.readFileSync(
  'app/platform/AgencyActivationCard.module.css',
  'utf8',
);

const migrations = fs
  .readdirSync('supabase/migrations')
  .filter((name) =>
    name.endsWith('_add_platform_owner_invite_email_delivery_v1.sql'),
  );

assert.equal(migrations.length, 1);

const migration = fs.readFileSync(
  `supabase/migrations/${migrations[0]}`,
  'utf8',
);

test('ReDream owner invitation email configuration remains private and service-role only', () => {
  assert.match(migration, /private\.platform_email_config/);
  assert.match(migration, /platform_server_email_delivery_config/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(
    migration,
    /revoke all on function public\.platform_server_email_delivery_config\(\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.platform_server_email_delivery_config\(\)[\s\S]*to service_role/,
  );
});

test('platform ops checks configuration before creating a fresh owner invite', () => {
  const statusIndex = platformOps.indexOf(
    'if(action==="owner_invite_email_status")',
  );
  const sendIndex = platformOps.indexOf(
    'if(action==="send_owner_invite_email")',
  );
  const createIndex = platformOps.indexOf(
    'platform_server_operator_create_owner_invite',
    sendIndex,
  );
  const configIndex = platformOps.indexOf(
    'platform_server_email_delivery_config',
    sendIndex,
  );

  assert.ok(statusIndex >= 0);
  assert.ok(sendIndex >= 0);
  assert.ok(configIndex > sendIndex);
  assert.ok(createIndex > configIndex);
});

test('owner email send is provider-backed and never claims success before Resend accepts it', () => {
  assert.match(platformOps, /https:\/\/api\.resend\.com\/emails/);
  assert.match(platformOps, /if\(!response\.ok\)/);
  assert.match(platformOps, /platform_server_operator_mark_owner_invite_sent/);
  assert.match(platformOps, /p_channel:"email"/);
  assert.match(platformOps, /status:"accepted"/);
});

test('failed provider delivery revokes the fresh invitation instead of leaving an unknown live token', () => {
  assert.match(platformOps, /platform_server_operator_revoke_owner_invite/);
  assert.match(
    platformOps,
    /No invitation was left active/,
  );
});

test('operator activation card sends email in place and keeps manual secure-link fallback', () => {
  assert.match(activation, /owner_invite_email_status/);
  assert.match(activation, /send_owner_invite_email/);
  assert.match(activation, /Send by email/);
  assert.match(activation, /Copy secure link/);
  assert.match(activation, /Generate secure link/);
  assert.match(
    activation,
    /Emailing creates a fresh\s+secure link and invalidates any older pending link/,
  );
});

test('unconfigured delivery is shown truthfully instead of pretending an email was sent', () => {
  assert.match(
    activation,
    /Email delivery is not configured yet/,
  );
  assert.match(
    activation,
    /Use the secure-link\s+fallback/,
  );
  assert.match(activationCss, /\.emailDeliveryState/);
});
