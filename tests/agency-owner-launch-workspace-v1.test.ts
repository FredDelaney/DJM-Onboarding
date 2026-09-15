import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('owner launch workspace is membership-bound and evidence-derived', () => {
  const migration = read(
    'supabase/migrations/20260915131901_add_agency_owner_launch_workspace_v1.sql',
  );

  assert.match(migration, /platform_server_owner_launch_workspace/);
  assert.match(migration, /m\.role='owner'/);
  assert.match(migration, /m\.status='active'/);
  assert.match(migration, /Owner launch progress is derived from saved workspace evidence/);
  assert.match(migration, /platform_server_customer_activation/);
  assert.match(migration, /'activation',v_activation/);
  assert.match(migration, /workspace_address_ready/);
});

test('owner launch mutations are narrow first-value bridges and audited', () => {
  const migration = read(
    'supabase/migrations/20260915131901_add_agency_owner_launch_workspace_v1.sql',
  );
  const opportunity = read(
    'supabase/migrations/20260915132501_harden_owner_first_opportunity_capture_v1.sql',
  );

  assert.match(migration, /first_player_already_exists/);
  assert.match(migration, /first_relationship_already_exists/);
  assert.match(opportunity, /first_opportunity_already_exists/);
  assert.match(migration, /platform\.owner\.branding_updated/);
  assert.match(migration, /platform\.owner\.first_player_created/);
  assert.match(migration, /platform\.owner\.first_relationship_created/);
  assert.match(opportunity, /platform\.owner\.first_opportunity_created/);
  assert.match(opportunity, /insert into djm_os\.club_needs/);
});

test('agency launch edge route authenticates the owner and keeps tenant id server-resolved', () => {
  const fn = read('supabase/functions/agency-launch/index.ts');
  const config = read('supabase/config.toml');

  assert.match(fn, /createSupabaseContext\(req,\{auth:"user"\}\)/);
  assert.match(fn, /platform_server_owner_launch_workspace/);
  assert.match(fn, /const tenantId=String\(launch\?\.tenant_id/);
  assert.match(fn, /platform_server_owner_create_first_player/);
  assert.match(fn, /platform_server_owner_create_first_relationship/);
  assert.match(fn, /platform_server_owner_create_first_opportunity/);
  assert.match(config, /\[functions\.agency-launch\]\s+verify_jwt = true/);
});

test('owner launch is white-label and drives real setup rather than manual checklist completion', () => {
  const page = read('app/launch/page.tsx');
  const invite = read('app/platform/join/[token]/page.tsx');

  assert.match(page, /useTenantRuntime/);
  assert.match(page, /agency-launch/);
  assert.match(page, /agency-privacy/);
  assert.match(page, /Start with one real player/);
  assert.match(page, /create_first_player/);
  assert.match(page, /Add one club contact you actually know/);
  assert.match(page, /Capture something commercially real/);
  assert.doesNotMatch(page, />ReDream</);
  assert.doesNotMatch(page, />DJM</);
  assert.doesNotMatch(page, /mark.*complete/i);
  assert.match(invite, /\/activate\//);
});

test('owner activation continues on the same origin before a customer domain exists', () => {
  const invite = read('app/platform/join/[token]/page.tsx');
  const temporaryLaunch = read('app/activate/[tenantSlug]/page.tsx');
  const temporaryLayout = read('app/activate/[tenantSlug]/layout.tsx');

  assert.match(
    invite,
    /\/activate\/\$\{encodeURIComponent\(workspace\.tenant_slug/,
  );
  assert.doesNotMatch(invite, /https:\/\/\$\{workspace\.hostname\}\/launch/);
  assert.match(temporaryLaunch, /useParams<\{ tenantSlug: string \}>/);
  assert.match(temporaryLaunch, /agency-launch/);
  assert.match(temporaryLaunch, /Private agency workspace/);
  assert.doesNotMatch(temporaryLayout, /ReDream/);
  assert.doesNotMatch(temporaryLayout, /DJM/);
  assert.match(temporaryLayout, /title: 'Agency workspace'/);
  const gate = read('components/TenantRouteGate.tsx');
  assert.match(gate, /pathname\.startsWith\('\/activate\/'\)/);
});
