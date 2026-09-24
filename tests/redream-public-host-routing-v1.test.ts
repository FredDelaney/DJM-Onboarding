import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const host = read('lib/redream-public-host.ts');
const page = read('app/page.tsx');
const layout = read('app/layout.tsx');
const gate = read('components/TenantRouteGate.tsx');
const publicLayout = read('app/(redream-public)/layout.tsx');

test('canonical ReDream hosts are explicitly first-party', () => {
  assert.match(host, /'redreamsystems\.com'/);
  assert.match(host, /'www\.redreamsystems\.com'/);
  assert.match(host, /CANONICAL_REDREAM_HOSTS\.has\(hostname\)/);
});

test('ReDream Vercel deployments are recognised without opening every Vercel hostname', () => {
  assert.match(host, /REDREAM_VERCEL_HOST/);
  assert.match(host, /redream-systems/);
  assert.match(host, /vercel\\\.app/);
  assert.doesNotMatch(host, /endsWith\([^)]*vercel/);
});

test('managed agency subdomains are not blanket-classified as the public site', () => {
  assert.doesNotMatch(host, /endsWith\([^)]*redreamsystems/);
  assert.doesNotMatch(host, /\*\.redreamsystems\.com/);
});

test('resolved agency runtime wins before public ReDream host classification', () => {
  assert.match(page, /!runtime\.resolved\s*&&\s*shouldRenderReDreamPublicSite/);
  const resolvedCheck = layout.indexOf('if (runtime.resolved)');
  const publicCheck = layout.indexOf('if (isReDreamPublicSite)');
  assert.ok(resolvedCheck >= 0);
  assert.ok(publicCheck > resolvedCheck);
});

test('server host decision controls the public root and deeper ReDream research routes', () => {
  assert.match(layout, /allowReDreamPublicRoot=/);
  assert.match(gate, /REDREAM_PUBLIC_ROUTES/);
  for (const route of ['/', '/product', '/security', '/switch']) {
    assert.match(gate, new RegExp(route.replaceAll('/', '\\/')));
  }
  assert.match(gate, /allowReDreamPublicRoot\s*&&/);
  assert.match(publicLayout, /shouldRenderReDreamPublicSite/);
  assert.match(publicLayout, /notFound\(\)/);
  assert.doesNotMatch(gate, /NEXT_PUBLIC_REDREAM_ENVIRONMENT/);
});

test('local development remains an explicit exception', () => {
  assert.match(host, /'localhost'/);
  assert.match(host, /'127\.0\.0\.1'/);
  assert.match(host, /Boolean\(developmentFlag\?\.trim\(\)\)/);
});
