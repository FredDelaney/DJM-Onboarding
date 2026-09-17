import assert from 'node:assert/strict';
import {
  readFileSync,
} from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(path, 'utf8');

const layout =
  read('app/layout.tsx');

const runtime =
  read('lib/tenant-runtime.ts');

const provider =
  read(
    'components/TenantRuntimeProvider.tsx',
  );

const brand =
  read('components/Brand.tsx');

const theme =
  read('app/tenant-theme.css');

const edge =
  read(
    'supabase/functions/platform-tenant-runtime/index.ts',
  );

const config =
  read('supabase/config.toml');

test(
  'tenant runtime resolves from the trusted request hostname',
  () => {
    assert.match(
      layout,
      /x-forwarded-host/,
    );

    assert.match(
      layout,
      /requestHeaders\.get\('host'\)/,
    );

    assert.match(
      runtime,
      /platform-tenant-runtime/,
    );

    assert.match(
      runtime,
      /normaliseTenantHostname/,
    );
  },
);

test(
  'unresolved tenant resolution fails neutral and feature access fails closed',
  () => {
    assert.match(
      runtime,
      /slug: 'unresolved'/,
    );

    assert.match(
      runtime,
      /display_name: 'Workspace'/,
    );

    assert.match(
      runtime,
      /primary_color: '#111827'/,
    );

    assert.match(
      provider,
      /isTenantFeatureEnabled/,
    );

    assert.doesNotMatch(
      provider,
      /if \(!runtime\.resolved\) return true/,
    );

    assert.doesNotMatch(
      runtime,
      /DJM_TENANT_RUNTIME/,
    );
  },
);

test(
  'root shell exposes tenant identity plan and theme without a tenant switcher',
  () => {
    assert.match(
      layout,
      /TenantRuntimeProvider/,
    );

    assert.match(
      layout,
      /data-tenant=/,
    );

    assert.match(
      layout,
      /data-tenant-plan=/,
    );

    assert.match(
      layout,
      /--tenant-primary/,
    );

    assert.match(
      theme,
      /--navy: var\(--tenant-primary\)/,
    );

    assert.match(
      theme,
      /--yellow: var\(--tenant-accent\)/,
    );

    assert.doesNotMatch(
      layout,
      /tenant switcher/i,
    );
  },
);

test(
  'brand component is tenant-derived with a neutral lettermark fallback',
  () => {
    assert.match(
      brand,
      /useTenantRuntime/,
    );

    assert.match(
      brand,
      /branding\.logo_asset/,
    );

    assert.match(
      brand,
      /branding\.compact_logo_asset/,
    );

    assert.match(
      brand,
      /branding\.light_logo_asset/,
    );

    assert.match(
      brand,
      /branding\.portal_name/,
    );

    assert.match(
      brand,
      /tenant-lettermark/,
    );

    assert.doesNotMatch(
      brand,
      /\bisDjm\b/,
    );

    assert.doesNotMatch(
      brand,
      /djm-sports-management/,
    );

    assert.doesNotMatch(
      brand,
      /\/djm-mark\.png/,
    );
  },
);

test(
  'public tenant edge endpoint returns a sanitised feature surface',
  () => {
    assert.match(
      edge,
      /platform_server_tenant_context/,
    );

    assert.match(
      edge,
      /safeFeatures/,
    );

    assert.match(
      edge,
      /feature\.enabled === true/,
    );

    assert.doesNotMatch(
      edge,
      /ai_monthly_budget_micros/,
    );

    assert.match(
      config,
      /\[functions\.platform-tenant-runtime\][\s\S]*verify_jwt = false/,
    );
  },
);
