import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
} from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(path, 'utf8');

test(
  'automatic agency manifest is resolved through the shared workspace shell',
  () => {
    const layout =
      read('app/layout.tsx');

    assert.equal(
      existsSync('app/manifest.ts'),
      false,
    );

    assert.match(
      layout,
      /manifest: '\/workspace-manifest\.webmanifest'/,
    );

    assert.doesNotMatch(
      layout,
      /manifest: '\/manifest\.webmanifest'/,
    );
  },
);

test(
  'workspace manifest resolves branding from the request hostname',
  () => {
    const route =
      read(
        'app/workspace-manifest.webmanifest/route.ts',
      );

    assert.match(
      route,
      /x-forwarded-host/,
    );

    assert.match(
      route,
      /resolveTenantRuntime/,
    );

    assert.match(
      route,
      /runtime\.branding\.portal_name/,
    );

    assert.match(
      route,
      /runtime\.branding\.display_name/,
    );

    assert.match(
      route,
      /runtime\.branding\s*\.primary_color/,
    );

    assert.match(
      route,
      /runtime\.branding\s*\.secondary_color/,
    );
  },
);

test(
  'workspace manifest derives app identity from tenant branding without tenant-specific branches',
  () => {
    const route =
      read(
        'app/workspace-manifest.webmanifest/route.ts',
      );

    assert.match(
      route,
      /runtime\.branding\s*\.favicon_asset/,
    );

    assert.match(
      route,
      /Private career app by/,
    );

    assert.doesNotMatch(
      route,
      /djm-sports-management/,
    );

    assert.doesNotMatch(
      route,
      /\bisDjm\b/,
    );

    assert.doesNotMatch(
      route,
      /\/icon-192\.png/,
    );

    assert.doesNotMatch(
      route,
      /\/djm-mark\.png/,
    );
  },
);

test(
  'temporary owner activation does not opt into an agency or ReDream manifest',
  () => {
    const activation =
      read(
        'app/activate/[tenantSlug]/layout.tsx',
      );

    const platform =
      read(
        'app/platform/layout.tsx',
      );

    assert.doesNotMatch(
      activation,
      /manifest:/,
    );

    assert.doesNotMatch(
      activation,
      /DJM/,
    );

    assert.doesNotMatch(
      activation,
      /ReDream/,
    );

    assert.match(
      platform,
      /manifest: '\/platform\/manifest\.webmanifest'/,
    );
  },
);

test(
  'shared app shell never falls back to a named agency identity',
  () => {
    const layout =
      read('app/layout.tsx');

    assert.match(
      layout,
      /runtime\.branding\.favicon_asset/,
    );

    assert.doesNotMatch(
      layout,
      /djm-sports-management/,
    );

    assert.doesNotMatch(
      layout,
      /\bisDjm\b/,
    );

    assert.doesNotMatch(
      layout,
      /\/icon-192\.png/,
    );

    assert.doesNotMatch(
      layout,
      /\/djm-mark\.png/,
    );
  },
);
