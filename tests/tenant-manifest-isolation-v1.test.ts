import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('automatic DJM manifest is removed from the shared app shell', () => {
  const layout = read('app/layout.tsx');

  assert.equal(existsSync('app/manifest.ts'), false);
  assert.match(layout, /manifest: '\/workspace-manifest\.webmanifest'/);
  assert.doesNotMatch(layout, /manifest: '\/manifest\.webmanifest'/);
});

test('workspace manifest resolves branding from the request hostname', () => {
  const route = read('app/workspace-manifest.webmanifest/route.ts');

  assert.match(route, /x-forwarded-host/);
  assert.match(route, /resolveTenantRuntime\(hostname\)/);
  assert.match(route, /runtime\.branding\.portal_name/);
  assert.match(route, /runtime\.branding\.display_name/);
  assert.match(route, /runtime\.branding\.primary_color/);
  assert.match(route, /runtime\.branding\.secondary_color/);
});

test('DJM manifest assets remain DJM-only while external tenants stay brand-derived', () => {
  const route = read('app/workspace-manifest.webmanifest/route.ts');

  assert.match(route, /runtime\.slug === 'djm-sports-management'/);
  assert.match(route, /if \(isDjm\)/);
  assert.match(route, /\/icon-192\.png/);
  assert.match(route, /Private player and agency workspace by/);
});

test('temporary owner activation does not opt into a DJM or ReDream manifest', () => {
  const activation = read('app/activate/[tenantSlug]/layout.tsx');
  const platform = read('app/platform/layout.tsx');

  assert.doesNotMatch(activation, /manifest:/);
  assert.doesNotMatch(activation, /DJM/);
  assert.doesNotMatch(activation, /ReDream/);
  assert.match(platform, /manifest: '\/platform\/manifest\.webmanifest'/);
});


test('external tenants never inherit DJM root icons', () => {
  const layout = read('app/layout.tsx');

  assert.match(
    layout,
    /: isDjm[\s\S]*\/icon-192\.png[\s\S]*: undefined/,
  );
});
