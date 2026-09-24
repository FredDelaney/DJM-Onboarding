import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('approved ReDream brand assets are source controlled', () => {
  for (const path of [
    'public/brand/redream-mark.png',
    'public/brand/redream-lockup-dark.png',
    'public/brand/redream-lockup-light.png',
    'public/brand/redream-app-icon.png',
    'public/brand/redream-og.jpg',
  ]) {
    assert.equal(existsSync(path), true, `${path} should exist`);
  }
});

test('public ReDream site uses the approved identity instead of a lettermark', () => {
  const page = read('components/ReDreamPublicLanding.tsx');
  const css = read('components/ReDreamPublicLanding.module.css');

  assert.match(page, /\/brand\/redream-lockup-light\.png/);
  assert.match(page, /\/brand\/redream-lockup-dark\.png/);
  assert.doesNotMatch(page, /className=\{styles\.brandMark\}>R</);

  assert.match(css, /#0A1B3D/i);
  assert.match(css, /#086BFF/i);
  assert.match(css, /#111827/i);
  assert.match(css, /#526176/i);
  assert.match(css, /#F8FAFC/i);
});

test('ReDream operator surfaces use the approved identity and blue system', () => {
  const page = read('app/platform/page.tsx');
  const css = read('app/platform/platform.module.css');
  const signin = read('app/platform/sign-in/page.tsx');
  const signinCss = read('app/platform/sign-in/page.module.css');

  assert.match(page, /\/brand\/redream-lockup-dark\.png/);
  assert.match(page, /\/brand\/redream-mark\.png/);
  assert.match(signin, /\/brand\/redream-lockup-light\.png/);

  assert.doesNotMatch(page, /className=\{styles\.brandMark\}>R</);
  assert.doesNotMatch(signin, /className=\{styles\.mark\}>R</);

  assert.match(css, /#086BFF/i);
  assert.match(signinCss, /#0A1B3D/i);
});

test('public metadata and operator PWA use the supplied ReDream app icon', () => {
  const layout = read('app/layout.tsx');
  const operatorLayout = read('app/platform/layout.tsx');
  const manifest = read('public/redream.webmanifest');
  const operatorManifest = read('public/platform/manifest.webmanifest');

  assert.match(layout, /redream-app-icon\.png/);
  assert.match(layout, /redream-og\.jpg/);
  assert.match(operatorLayout, /redream-app-icon\.png/);
  assert.match(manifest, /redream-app-icon\.png/);
  assert.match(operatorManifest, /redream-app-icon\.png/);
});

test('customer workspaces remain tenant-derived and are not overwritten by ReDream branding', () => {
  const brand = read('components/Brand.tsx');
  const workspaceCss = read('components/AgencyOperatingWorkspace.module.css');

  assert.match(brand, /useTenantRuntime/);
  assert.match(brand, /branding\.logo_asset/);
  assert.doesNotMatch(brand, /redream-lockup/);

  assert.match(workspaceCss, /--agency-primary/);
  assert.match(workspaceCss, /--agency-accent/);
});
