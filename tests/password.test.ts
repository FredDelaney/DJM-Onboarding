import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isStrongPassword } from '../lib/password.ts';

test('new passwords require length and mixed character classes', () => {
  assert.equal(isStrongPassword('short'), false);
  assert.equal(isStrongPassword('twelvecharacters'), false);
  assert.equal(isStrongPassword('TwelveCharacters1'), false);
  assert.equal(isStrongPassword('TwelveChars1!'), true);
});

test('the invitation Edge Function enforces the same password boundary', () => {
  const source = readFileSync(
    new URL('../supabase/functions/accept-player-invite/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /passwordValue\.length >= 12/);
  assert.match(source, /\/\[A-Z\]\//);
  assert.match(source, /\/\[\^A-Za-z0-9\]\//);
});
