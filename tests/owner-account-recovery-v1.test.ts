import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { recoveryReturnPath } from '../lib/recovery-return-path.ts';

const activation = fs.readFileSync(
  'app/activate/[tenantSlug]/page.tsx',
  'utf8',
);
const forgot = fs.readFileSync(
  'app/forgot-password/page.tsx',
  'utf8',
);
const reset = fs.readFileSync(
  'app/reset-password/page.tsx',
  'utf8',
);

test('recovery return paths are limited to same-origin agency activation and workspace routes', () => {
  assert.equal(
    recoveryReturnPath('/activate/northstar-football'),
    '/activate/northstar-football',
  );
  assert.equal(
    recoveryReturnPath('/workspace/northstar-football?view=home'),
    '/workspace/northstar-football?view=home',
  );
  assert.equal(recoveryReturnPath('https://evil.example'), null);
  assert.equal(recoveryReturnPath('//evil.example'), null);
  assert.equal(recoveryReturnPath('/platform'), null);
});

test('owner activation exposes password visibility and a recovery path back to the exact agency route', () => {
  assert.match(activation, /EyeOff/);
  assert.match(activation, /Eye/);
  assert.match(activation, /showPassword/);
  assert.match(activation, /forgot-password\?next=/);
  assert.match(activation, /Forgot password\?/);
});

test('forgot password carries only a validated agency return path into the Supabase recovery redirect', () => {
  assert.match(forgot, /useSearchParams/);
  assert.match(forgot, /recoveryReturnPath/);
  assert.match(forgot, /redirectTo/);
  assert.match(forgot, /reset-password\?next=/);
  assert.match(forgot, /returnPath \|\| '\/sign-in'/);
});

test('password reset returns the user to the same agency journey instead of generic legacy routing', () => {
  assert.match(reset, /useSearchParams/);
  assert.match(reset, /recoveryReturnPath/);
  assert.match(reset, /returnPath \|\| '\/sign-in'/);
  assert.match(reset, /Back to owner workspace/);
  assert.match(reset, /Request a new link/);
});

test('recovery copy is workspace-neutral so white-label agency users do not see player-only wording', () => {
  assert.doesNotMatch(forgot, /Private player environment/);
  assert.doesNotMatch(reset, /Private player environment/);
  assert.match(forgot, /Get back into your workspace securely/);
  assert.match(reset, /Choose a new password for your workspace/);
});
