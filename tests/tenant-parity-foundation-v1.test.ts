import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('DJM compatibility route uses the shared agency operating workspace', () => {
  const page = read('app/(djm-os)/djm/page.tsx');

  assert.match(page, /AgencyOperatingWorkspace/);

  assert.doesNotMatch(
    page,
    /djm_command_center|djm_home_item_controls|djm_home_set_item_control|djm_network_set_task_status|djm_complete_player_request/,
  );
});

test('agency, workspace and DJM routes converge on one product workspace', () => {
  const agency = read('app/agency/page.tsx');
  const workspace = read('app/workspace/[tenantSlug]/page.tsx');
  const djm = read('app/(djm-os)/djm/page.tsx');

  for (const source of [agency, workspace, djm]) {
    assert.match(source, /AgencyOperatingWorkspace/);
  }
});

test('shared agency workspace resolves and carries tenant context', () => {
  const workspace = read('components/AgencyOperatingWorkspace.tsx');

  assert.match(workspace, /useTenantRuntime/);
  assert.match(workspace, /workspace\.tenant_id/);
  assert.match(workspace, /workspace\.slug/);
  assert.match(workspace, /platformInvoke<T>\('agency-os'/);
  assert.match(workspace, /platformRpc<T>/);
  assert.match(workspace, /workspace\.slug/);

  assert.doesNotMatch(workspace, /djm-sports-management/);
  assert.doesNotMatch(workspace, /isDjm/i);
});

test('tenant runtime remains neutral when a tenant cannot be resolved', () => {
  const runtime = read('lib/tenant-runtime.ts');

  assert.match(runtime, /slug: 'unresolved'/);
  assert.match(runtime, /display_name: 'Workspace'/);

  assert.doesNotMatch(runtime, /djm-sports-management/);
  assert.doesNotMatch(runtime, /isDjm/i);
});
