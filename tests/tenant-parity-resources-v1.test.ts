import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260924220000_tenant_parity_resources_and_legacy_surface_v1.sql',
  'utf8',
);

test('player resources belong to exactly one tenant', () => {
  assert.match(migration, /add column if not exists tenant_id uuid/);
  assert.match(migration, /alter column tenant_id set not null/);
  assert.match(migration, /resources_tenant_published_sort_idx/);
  assert.match(migration, /private\.user_is_tenant_admin\(tenant_id\)/);
  assert.match(migration, /p\.tenant_id=resources\.tenant_id/);
  assert.doesNotMatch(migration, /private\.is_admin\(\)/);
});

test('legacy DJM resource authorization is retired', () => {
  assert.match(
    migration,
    /drop function if exists private\.is_legacy_djm_tenant_admin\(uuid\)/,
  );
  assert.match(
    migration,
    /drop policy if exists "djm tenant admins upload legacy djm resources"/,
  );
  assert.match(migration, /Message your agency/);
});

test('obsolete legacy Home RPCs are no longer browser APIs', () => {
  for (const rpc of [
    'djm_home_item_controls',
    'djm_home_set_item_control',
    'djm_complete_player_request',
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${rpc}`),
    );
  }

  assert.match(migration, /to service_role/);
});

test('tenant runtime carries the canonical tenant id', () => {
  const runtime = readFileSync('lib/tenant-runtime.ts', 'utf8');
  const edge = readFileSync(
    'supabase/functions/platform-tenant-runtime/index.ts',
    'utf8',
  );

  assert.match(runtime, /tenant_id: string \| null/);
  assert.match(runtime, /tenant_id:\s*null/);
  assert.match(runtime, /cleanString\(source\.tenant_id\)/);
  assert.match(edge, /safeText\(data\.tenant_id\)/);
});

test('player and settings resource queries are explicitly tenant scoped', () => {
  const player = readFileSync('components/PlayerShell.tsx', 'utf8');
  const career = readFileSync('app/career/page.tsx', 'utf8');
  const settings = readFileSync(
    'app/(djm-os)/settings/player-experience/page.tsx',
    'utf8',
  );
  const editor = readFileSync('components/AdminResourceStudio.tsx', 'utf8');

  assert.match(player, /id,tenant_id,user_id/);
  assert.match(career, /\.eq\('tenant_id', ctx\.player\.tenant_id\)/);
  assert.match(settings, /const tenantId = runtime\.tenant_id/);
  assert.match(settings, /\.eq\('tenant_id', tenantId\)/);
  assert.match(settings, /tenant_id: tenantId/);
  assert.match(editor, /tenantId: string/);
  assert.match(editor, /tenant_id: tenantId/);
  assert.match(editor, /\.eq\('tenant_id', tenantId\)/);
});
