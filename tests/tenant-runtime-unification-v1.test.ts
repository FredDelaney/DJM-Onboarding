import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(path, 'utf8');

test('agency admin shell authorises through tenant workspaces', () => {
  const shell = read(
    'components/AdminShell.tsx',
  );

  assert.match(
    shell,
    /platformInvoke<\{[\s\S]*tenants\?: Workspace\[\]/,
  );

  assert.match(
    shell,
    /tenant_role/,
  );

  assert.doesNotMatch(
    shell,
    /\.select\('id,email,display_name,role/,
  );

  assert.doesNotMatch(
    shell,
    /\['admin', 'scout'\]\.includes\(profile\.role\)/,
  );
});

test('team settings no longer uses global allowlist or profile roles', () => {
  const page = read(
    'app/(djm-os)/settings/team/page.tsx',
  );

  assert.match(
    page,
    /staff_invite_create/,
  );

  assert.match(
    page,
    /staff_member_update/,
  );

  assert.match(
    page,
    /staff_member_remove/,
  );

  assert.doesNotMatch(
    page,
    /admin_allowlist/,
  );

  assert.doesNotMatch(
    page,
    /profiles'\)/,
  );
});

test('settings is tenant-native and no longer links to legacy DJM administration', () => {
  const page = read(
    'app/(djm-os)/settings/page.tsx',
  );

  assert.match(
    page,
    /tenant_role/,
  );

  assert.doesNotMatch(
    page,
    /djm_command_center|\/brain\/data/,
  );
});

test('workspace navigation points to the shared agency product', () => {
  const header = read(
    'components/WorkspaceHeader.tsx',
  );

  assert.match(
    header,
    /\/agency\?view=players/,
  );

  assert.match(
    header,
    /\/agency\?view=market/,
  );

  assert.match(
    header,
    /\/agency\?view=deals/,
  );

  assert.match(
    header,
    /\/agency\?view=relationships/,
  );

  assert.doesNotMatch(
    header,
    /href: '\/djm'/,
  );
});

test('shared search and quick add use tenant-native agency APIs', () => {
  const search = read(
    'components/WorkspaceSearch.tsx',
  );

  const quick = read(
    'components/QuickCapture.tsx',
  );

  assert.match(
    search,
    /platformInvoke/,
  );

  assert.match(
    search,
    /tenant_id: tenantId/,
  );

  assert.match(
    quick,
    /create_club_need/,
  );

  assert.match(
    quick,
    /create_contact/,
  );

  assert.match(
    quick,
    /create_player/,
  );

  assert.doesNotMatch(
    `${search}\n${quick}`,
    /djm_universal_search|djm_network_|djm_market_|djm_recruitment_|djm-network-capture|djm-transfermarkt-enrich/,
  );
});

test('legacy staff workspace URLs only redirect into shared ReDream views', () => {
  const paths = [
    'app/(djm-os)/djm/page.tsx',
    'app/(djm-os)/network/page.tsx',
    'app/(djm-os)/network/clubs/[id]/page.tsx',
    'app/(djm-os)/network/contacts/[id]/page.tsx',
    'app/(djm-os)/opportunities/page.tsx',
    'app/(djm-os)/opportunities/[id]/page.tsx',
    'app/(djm-os)/market/page.tsx',
    'app/(djm-os)/market/deals/[id]/page.tsx',
    'app/(djm-os)/deals/page.tsx',
    'app/(djm-os)/recruitment/page.tsx',
    'app/(djm-os)/recruitment/[id]/page.tsx',
    'app/(djm-os)/scout/page.tsx',
    'app/(djm-os)/brain/page.tsx',
    'app/(djm-os)/brain/data/page.tsx',
    'app/(djm-os)/brain/performance/page.tsx',
    'app/(djm-os)/brain/benchmarks/import/page.tsx',
  ];

  for (const path of paths) {
    const source = read(path);

    assert.match(
      source,
      /redirect\(/,
      path,
    );

    assert.doesNotMatch(
      source,
      /\bdjm_[a-z0-9_]+|\bdjm-[a-z0-9-]+/,
      path,
    );
  }
});

test('staff invitation system stays tenant-scoped', () => {
  const migration = read(
    'supabase/migrations/20260925121000_tenant_runtime_staff_access_v1.sql',
  );

  const publicFn = read(
    'supabase/functions/agency-staff-invite-public/index.ts',
  );

  const authFn = read(
    'supabase/functions/agency-staff-invite/index.ts',
  );

  const page = read(
    'app/workspace/join/[token]/page.tsx',
  );

  assert.match(
    migration,
    /platform\.tenant_staff_invites/,
  );

  assert.match(
    migration,
    /platform_server_complete_staff_invite/,
  );

  assert.match(
    publicFn,
    /platform_server_public_staff_invite_preflight/,
  );

  assert.match(
    authFn,
    /platform_server_complete_staff_invite/,
  );

  assert.match(
    page,
    /agency-staff-invite-public/,
  );

  assert.doesNotMatch(
    `${publicFn}\n${authFn}\n${page}`,
    /djm-sports-management/,
  );
});

test('legacy DJM staff RPC families are removed from browser execution', () => {
  const migration = read(
    'supabase/migrations/20260925123500_retire_legacy_djm_staff_runtime_v1.sql',
  );

  for (const family of [
    'djm_command_center',
    'djm_universal_search',
    'djm_network_%',
    'djm_market_%',
    'djm_opportunit%',
    'djm_recruitment_%',
    'djm_scout_%',
    'djm_intelligence_%',
    'djm_deal_room%',
  ]) {
    assert.match(
      migration,
      new RegExp(
        family
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace('%', '%'),
      ),
    );
  }

  assert.match(
    migration,
    /revoke all on function %s from public, anon, authenticated/,
  );

  assert.match(
    migration,
    /grant execute on function %s to service_role/,
  );
});
