import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtime = readFileSync('lib/tenant-runtime.ts', 'utf8');
const layout = readFileSync('app/layout.tsx', 'utf8');
const recovery = readFileSync(
  'components/TenantRuntimeUnavailable.tsx',
  'utf8',
);

test('tenant resolution distinguishes missing workspaces from service failure', () => {
  assert.match(runtime, /resolution_status\?: 'resolved' \| 'unresolved' \| 'unavailable'/);
  assert.match(runtime, /response\.status === 404[\s\S]*\? 'unresolved'[\s\S]*: 'unavailable'/);
  assert.match(runtime, /catch \{[\s\S]*fallbackRuntime\(hostname, 'unavailable'\)/);
});

test('root layout does not mislabel a transient outage as an unknown workspace', () => {
  assert.match(layout, /runtime\.resolution_status === 'unavailable'/);
  assert.match(layout, /<TenantRuntimeUnavailable \/>/);
  assert.match(layout, /Workspace unavailable/);
});

test('temporary outage recovery retries without relaxing tenant isolation', () => {
  assert.match(recovery, /router\.refresh\(\)/);
  assert.match(recovery, /window\.setTimeout\(\(\) => \{[\s\S]*retry\(\)[\s\S]*6500/);
  assert.match(recovery, /Your workspace and access[\s\S]*have not been changed/);
  assert.doesNotMatch(recovery, /djmsports|DJM/i);
});

test('tenant resolver never contains a DJM-specific outage bypass', () => {
  assert.doesNotMatch(
    runtime,
    /TRUSTED_DJM_HOSTNAMES|trustedDjmOutageRuntime|app\.djmsports\.com|DJM Sports Management/,
  );
});
