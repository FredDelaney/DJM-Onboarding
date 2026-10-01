import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { homeConversationHref } from '../lib/agency-home-state.ts';
import { resolveTenantRuntime } from '../lib/tenant-runtime.ts';

const read = (path: string) => readFileSync(path, 'utf8');
const workspace = read('components/AgencyOperatingWorkspace.tsx');

test('DJM resolves through the tenant runtime and workspace membership path', async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example';
  globalThis.fetch = (async (input) => {
    const request = new URL(String(input));
    assert.equal(request.pathname, '/functions/v1/platform-tenant-runtime');
    assert.equal(request.searchParams.get('hostname'), 'app.redream.systems');
    return Response.json({
      resolved: true,
      tenant_id: '50efabc7-7a08-4579-a142-f5325cafc02e',
      slug: 'djm-sports-management',
      branding: { display_name: 'DJM Sports Management' },
    });
  }) as typeof fetch;

  try {
    const runtime = await resolveTenantRuntime('app.redream.systems');
    assert.equal(runtime.resolved, true);
    assert.equal(runtime.slug, 'djm-sports-management');
    assert.equal(runtime.branding.display_name, 'DJM Sports Management');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  }

  const gate = read('components/TenantRouteGate.tsx');
  assert.match(gate, /pathname\.startsWith\('\/workspace\/'\)/);
  assert.match(read('app/workspace/[tenantSlug]/page.tsx'), /<AgencyOperatingWorkspace \/>/);
  assert.match(workspace, /explicitSlug \|\|\s*\(runtime\.resolved \? runtime\.slug : ''\)/);
  assert.match(workspace, /action: 'tenants'/);
  assert.match(workspace, /String\(tenant\.slug \|\| ''\)\.toLowerCase\(\) === targetSlug/);
  assert.match(workspace, /setWorkspace\(match\)/);
});

test('the five primary destinations stay inside the selected workspace', () => {
  const nav = workspace.match(/const NAV:[\s\S]*?= \[([\s\S]*?)\];/)?.[1];
  assert.ok(nav, 'workspace navigation exists');
  const destinations = [...nav.matchAll(/\{ key: '([^']+)', label: '([^']+)'/g)]
    .map(([, key, label]) => [key, label]);
  assert.deepEqual(destinations.slice(0, 5), [
    ['home', 'Home'],
    ['players', 'Players'],
    ['opportunities', 'Opportunities'],
    ['network', 'Network'],
    ['calendar', 'Calendar'],
  ]);
  assert.match(workspace, /const basePath = explicitSlug\s*\? `\/workspace\/\$\{encodeURIComponent\(explicitSlug\)\}`/);
  assert.match(workspace, /item\.key === 'home'\s*\? basePath\s*: `\$\{basePath\}\?view=\$\{item\.key\}`/);

  const primaryNav = workspace.match(/<nav className=\{styles\.nav\}[\s\S]*?<\/nav>/)?.[0];
  assert.ok(primaryNav, 'primary workspace navigation exists');
  assert.doesNotMatch(primaryNav, /\/agency|\/admin|\/dashboard|router\.replace/);
});

test('record deep links retain the selected tenant', () => {
  for (const slug of ['djm-sports-management', 'northstar-football-management']) {
    const base = `/workspace/${slug}`;
    assert.equal(homeConversationHref(base, { player_id: 'player/1' }), `${base}?view=players&player=player%2F1`);
    assert.equal(homeConversationHref(base, { person_id: 'person/1' }), `${base}?view=network&person=person%2F1`);
    assert.equal(homeConversationHref(base, { organisation_id: 'club/1' }), `${base}?view=network&club=club%2F1`);
    assert.equal(homeConversationHref(base, { prospect_id: 'target/1' }), `${base}?view=players&tab=recruitment&target=target%2F1`);
  }
  assert.match(workspace, /href=\{`\$\{basePath\}\?view=calendar`\}/);
});

test('Platform loading is bounded and offers recovery instead of an endless opening screen', () => {
  const platform = read('app/platform/page.tsx');
  assert.match(platform, /withControlPlaneDeadline\(supabase\.auth\.getSession\(\), 8_000\)/);
  assert.match(platform, /withControlPlaneDeadline\(\s*Promise\.all\(\[/);
  assert.match(platform, /finally \{\s*setLoading\(false\)/);
  assert.match(platform, /if \(loadInFlight\.current\) return loadInFlight\.current/);
  assert.match(platform, /loadFailed && !portfolio/);
  assert.match(platform, /onClick=\{\(\) => void load\(\)\}[\s\S]*?Try again/);
});
