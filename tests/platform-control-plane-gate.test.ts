import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test(
  'platform control plane can render without weakening unresolved tenant gating',
  () => {
    const layout = read('app/layout.tsx');
    const gate = read('components/TenantRouteGate.tsx');

    assert.match(layout, /TenantRouteGate/);
    assert.match(gate, /pathname === '\/platform'/);
    assert.match(
      gate,
      /pathname\.startsWith\('\/platform\/'\)/,
    );
    assert.match(
      gate,
      /process\.env\.NEXT_PUBLIC_REDREAM_ENVIRONMENT/,
    );
    assert.match(gate, /pathname === '\/'/);
    assert.match(gate, /router\.replace\('\/platform'\)/);
    assert.ok(
      gate.includes('isPlatformControlPlane ||') &&
        gate.includes('isAgencyActivationRoute ||') &&
        gate.includes('isAgencyWorkspaceRoute'),
    );
    assert.ok(
      gate.includes("pathname === '/workspace'"),
    );
    assert.ok(
      gate.includes("pathname.startsWith('/workspace/')"),
    );
    assert.ok(
      gate.includes("pathname === '/activate'"),
    );
    assert.ok(
      gate.includes("pathname.startsWith('/activate/')"),
    );
    assert.match(
      gate,
      /\? children\s*:\s*fallback/,
    );
  },
);
