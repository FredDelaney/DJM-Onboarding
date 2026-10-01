import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Platform loading has bounded reads, a recoverable state, and one active load', () => {
  const page = readFileSync('app/platform/page.tsx', 'utf8');

  assert.match(page, /withControlPlaneDeadline\(supabase\.auth\.getSession\(\), 8_000\)/);
  assert.match(page, /withControlPlaneDeadline\(\s*Promise\.all\(\[/);
  assert.match(page, /if \(timeoutId !== undefined\) clearTimeout\(timeoutId\)/);
  assert.match(page, /if \(loadInFlight\.current\) return loadInFlight\.current/);
  assert.match(page, /router\.replace\('\/platform\/sign-in'\)/);
  assert.match(page, /finally \{\s*setLoading\(false\)/);
  assert.match(page, /loadFailed && !portfolio/);
  assert.match(page, /Try again/);
});
