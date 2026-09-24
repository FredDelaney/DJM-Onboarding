import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const website = fs.readFileSync(
  'components/ReDreamPublicLanding.tsx',
  'utf8',
);
const demo = fs.readFileSync(
  'components/ReDreamDemoRequestButton.tsx',
  'utf8',
);
const operator = fs.readFileSync(
  'app/platform/DemoRequestsPanel.tsx',
  'utf8',
);
const platformPage = fs.readFileSync(
  'app/platform/page.tsx',
  'utf8',
);
const platformOps = fs.readFileSync(
  'supabase/functions/platform-ops/index.ts',
  'utf8',
);
const publicEdge = fs.readFileSync(
  'supabase/functions/redream-demo-request/index.ts',
  'utf8',
);
const config = fs.readFileSync(
  'supabase/config.toml',
  'utf8',
);

const migrations = fs
  .readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('_add_redream_demo_requests_v1.sql'));

assert.equal(migrations.length, 1);
const migration = fs.readFileSync(
  `supabase/migrations/${migrations[0]}`,
  'utf8',
);

const bridgeMigrations = fs
  .readdirSync('supabase/migrations')
  .filter((name) =>
    name.endsWith('_add_redream_demo_request_service_bridges_v1.sql'),
  );

assert.equal(bridgeMigrations.length, 1);
const bridgeMigration = fs.readFileSync(
  `supabase/migrations/${bridgeMigrations[0]}`,
  'utf8',
);

test('public website uses a structured demo flow instead of mailto for conversion CTAs', () => {
  assert.match(website, /ReDreamDemoRequestButton/);
  assert.match(demo, /redream-demo-request/);
  assert.match(demo, /agencyName/);
  assert.match(demo, /staffSize/);
  assert.match(demo, /playerCount/);
  assert.match(demo, /consent/);
  assert.match(demo, /does not create an account, start a trial or commit/);
});

test('public demo endpoint is intentionally public but validates body consent and bot trap', () => {
  assert.match(config, /\[functions\.redream-demo-request\][\s\S]*verify_jwt = false/);
  assert.match(publicEdge, /content-length/);
  assert.match(publicEdge, /company_website/);
  assert.match(publicEdge, /body\?\.consent !== true/);
  assert.match(publicEdge, /client_request_id/);
  assert.match(publicEdge, /platform_server_create_demo_request/);
});

test('demo leads live in a private platform table without browser grants', () => {
  assert.match(migration, /create table if not exists platform\.demo_requests/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table platform\.demo_requests from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table platform\.demo_requests to service_role/);
  assert.match(migration, /never provisions a tenant or starts a trial/);
});


test('demo request access stays behind service-only public bridges rather than exposing platform schema', () => {
  assert.match(bridgeMigration, /platform_server_create_demo_request/);
  assert.match(bridgeMigration, /platform_server_operator_demo_requests/);
  assert.match(bridgeMigration, /platform_server_operator_update_demo_request/);
  assert.match(bridgeMigration, /security definer/);
  assert.match(bridgeMigration, /set search_path = ''/);
  assert.match(
    bridgeMigration,
    /revoke all on function[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    bridgeMigration,
    /grant execute on function[\s\S]*to service_role/,
  );
  assert.match(
    bridgeMigration,
    /on conflict \(client_request_id\) do nothing/,
  );
  assert.doesNotMatch(bridgeMigration, /grant usage on schema platform/);
  assert.match(platformOps, /platform_server_operator_demo_requests/);
  assert.match(platformOps, /platform_server_operator_update_demo_request/);
});

test('operator cockpit can read and deliberately progress inbound demo requests', () => {
  assert.match(platformOps, /action==="demo_requests"/);
  assert.match(platformOps, /action==="demo_request_update"/);
  assert.match(platformOps, /platform_role:adminRecord\.role/);
  assert.match(platformPage, /DemoRequestsPanel/);
  assert.match(operator, /Create agency/);
  assert.match(operator, /Mark contacted/);
  assert.match(operator, /Qualify/);
});

test('demo conversion pre-fills the guarded customer provisioning path instead of auto provisioning', () => {
  assert.match(platformPage, /startAgencyFromDemo/);
  assert.match(platformPage, /pendingDemoRequestId/);
  assert.match(platformPage, /action: 'create_customer'/);
  assert.match(platformPage, /status: 'converted'/);
  assert.match(operator, /Customer lifecycle owns this stage/);
});
