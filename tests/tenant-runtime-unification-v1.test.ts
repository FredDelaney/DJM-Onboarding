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

test('settings no longer depends on DJM command centre', () => {
  const page = read(
    'app/(djm-os)/settings/page.tsx',
  );

  assert.doesNotMatch(
    page,
    /djm_command_center/,
  );

  assert.match(
    page,
    /tenant_role/,
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

test('staff invitations are tenant-scoped and accepted through neutral APIs', () => {
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
