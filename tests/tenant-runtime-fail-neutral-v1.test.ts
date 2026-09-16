import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(path, 'utf8');

test(
  'unresolved tenant runtime is neutral and never DJM',
  () => {
    const source = read(
      'lib/tenant-runtime.ts',
    );

    assert.match(
      source,
      /UNRESOLVED_TENANT_RUNTIME/,
    );

    assert.match(
      source,
      /resolved:\s*false/,
    );

    assert.match(
      source,
      /slug:\s*'unresolved'/,
    );

    assert.match(
      source,
      /display_name:\s*'Workspace'/,
    );

    assert.match(
      source,
      /primary_color:\s*'#111827'/,
    );

    assert.match(
      source,
      /accent_color:\s*'#64748B'/,
    );

    assert.doesNotMatch(
      source,
      /DJM_TENANT_RUNTIME/,
    );
  },
);

test(
  'unresolved tenants fail feature access closed',
  () => {
    const runtime = read(
      'lib/tenant-runtime.ts',
    );

    const provider = read(
      'components/TenantRuntimeProvider.tsx',
    );

    assert.match(
      runtime,
      /runtime\.resolved\s*&&/,
    );

    assert.match(
      provider,
      /isTenantFeatureEnabled/,
    );

    assert.doesNotMatch(
      provider,
      /if\s*\(!runtime\.resolved\)\s*return\s+true/,
    );
  },
);

test(
  'unresolved hostnames are gated before workspace content renders',
  () => {
    const layout = read(
      'app/layout.tsx',
    );

    assert.match(
      layout,
      /Workspace unavailable/,
    );

    assert.match(
      layout,
      /runtime\.resolved\s*\?\s*\(/,
    );

    assert.match(
      layout,
      /index:\s*false/,
    );

    assert.match(
      layout,
      /follow:\s*false/,
    );
  },
);

test(
  'tenant runtime edge function has neutral defensive defaults',
  () => {
    const source = read(
      'supabase/functions/platform-tenant-runtime/index.ts',
    );

    assert.match(
      source,
      /const slug =\s*safeText\(data\.slug\)/,
    );

    assert.match(
      source,
      /Active tenant runtime is missing a slug/,
    );

    assert.match(
      source,
      /"#111827"/,
    );

    assert.match(
      source,
      /"#64748B"/,
    );

    assert.doesNotMatch(
      source,
      /"#061F3A"|"#F5E900"/,
    );
  },
);
