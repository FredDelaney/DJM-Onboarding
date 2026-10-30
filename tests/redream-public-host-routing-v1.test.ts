import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

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

const require = createRequire(import.meta.url);
const compiledGate = ts.transpileModule(gate, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function renderGate(pathname: string) {
  const exports: any = {};
  vm.runInNewContext(compiledGate, {
    exports,
    require: (name: string) => {
      if (name === 'next/navigation') return { usePathname: () => pathname };
      if (name === 'react/jsx-runtime') return require(name);
      throw new Error(`Unexpected gate dependency: ${name}`);
    },
  });
  return renderToStaticMarkup(createElement(exports.TenantRouteGate, {
    children: 'APPROVED_PUBLIC_ROUTE', fallback: 'WORKSPACE_UNAVAILABLE',
  }));
}

test('actual tenant gate permits the slug-scoped public player route without a private host mapping', () => {
  for (const path of ['/p/example-player-a1b2c', '/p/example-player-a1b2c/']) {
    assert.equal(renderGate(path), 'APPROVED_PUBLIC_ROUTE');
  }
});

test('public player routing does not open legacy, private or nested routes on unresolved hosts', () => {
  for (const path of ['/p', '/p/', '/p/example/admin', '/players', '/admin', '/profile', '/app', '/']) {
    assert.equal(renderGate(path), 'WORKSPACE_UNAVAILABLE', path);
  }
});

test('actual tenant gate retains existing workspace, control plane and authentication entrypoints', () => {
  for (const path of ['/workspace/djm-sports-management', '/platform', '/platform/sign-in', '/sign-in']) {
    assert.equal(renderGate(path), 'APPROVED_PUBLIC_ROUTE', path);
  }
});

test('actual tenant gate permits the token-scoped club recipient on a shared host',()=>{
 for(const path of ['/s/98df9d8f-2f83-4ff0-bd1f-49c7c3133c96','/s/98df9d8f-2f83-4ff0-bd1f-49c7c3133c96/','/s/not-a-token'])assert.equal(renderGate(path),'APPROVED_PUBLIC_ROUTE',path);
});
test('club recipient routing keeps root, nested and private paths closed',()=>{
 for(const path of ['/s','/s/','/s/token/admin','/s/token/edit','/share','/agency','/admin/players'])assert.equal(renderGate(path),'WORKSPACE_UNAVAILABLE',path);
});
