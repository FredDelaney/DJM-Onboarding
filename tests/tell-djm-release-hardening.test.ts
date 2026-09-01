import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

const nextConfig = read('next.config.mjs');
const supabaseConfig = read('supabase/config.toml');
const hardening = read(
  'supabase/migrations/20260901153000_djm_tell_djm_release_hardening.sql',
);

test('Tell DJM allows first-party microphone capture', () => {
  assert.match(nextConfig, /microphone=\(self\)/);
  assert.doesNotMatch(nextConfig, /microphone=\(\)/);
});

test('Tell DJM Edge Function JWT configuration matches its auth model', () => {
  assert.match(
    supabaseConfig,
    /\[functions\.djm-tell-capture\]\s+verify_jwt = true/,
  );
  assert.match(
    supabaseConfig,
    /\[functions\.djm-tell-process\]\s+verify_jwt = false/,
  );
});

test('Tell DJM capture rows have restrictive RLS without changing legacy rows', () => {
  assert.match(hardening, /as restrictive/);
  assert.match(hardening, /for select/);
  assert.match(hardening, /for insert/);
  assert.match(hardening, /for update/);
  assert.match(hardening, /for delete/);
  assert.match(
    hardening,
    /processing_version is distinct from 'tell_djm_v1'/,
  );
  assert.match(hardening, /submitted_by = \(select auth\.uid\(\)\)/);
  assert.match(hardening, /p\.permission_scope = 'full'/);
  assert.match(hardening, /p\.is_enabled = true/);
});

test('release hardening source contains no literal em dash', () => {
  for (const source of [nextConfig, supabaseConfig, hardening]) {
    assert.equal(source.includes('\u2014'), false);
  }
});
