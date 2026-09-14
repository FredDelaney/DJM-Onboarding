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
      /isPlatformControlPlane \? children : fallback/,
    );
  },
);
