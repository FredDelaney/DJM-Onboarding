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
  'unresolved tenant resolution preserves the existing DJM experience',
  () => {
    assert.match(
      runtime,
      /slug: 'djm-sports-management'/,
    );

    assert.match(
      runtime,
      /primary_color: '#061F3A'/,
    );

    assert.match(
      provider,
      /if \(!runtime\.resolved\) return true/,
    );
  },
);

test(
  'root shell exposes tenant identity, plan and theme without a tenant switcher',
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
  'brand component preserves DJM but does not leak the DJM mark into another agency',
  () => {
    assert.match(
      brand,
      /useTenantRuntime/,
    );

    assert.match(
      brand,
      /isDjm/,
    );

    assert.match(
      brand,
      /isDjm[\s\S]{0,120}'\/djm-mark\.png'/,
    );

    assert.match(
      brand,
      /tenant-lettermark/,
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
