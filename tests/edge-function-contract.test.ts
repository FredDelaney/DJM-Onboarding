import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const functionsUrl = new URL('../supabase/functions/', import.meta.url);
const config = readFileSync(
  new URL('../supabase/config.toml', import.meta.url),
  'utf8',
);

test('every deployed Edge Function has source and explicit JWT configuration', () => {
  const functionNames = readdirSync(functionsUrl, {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(functionNames, [
    'accept-player-invite',
    'club-document',
    'dispatch-player-push',
    'djm-build-src-00',
    'djm-network-capture',
    'djm-network-import',
    'djm-transfermarkt-enrich',
    'import-player-stats',
    'remove-player',
  ]);

  for (const functionName of functionNames) {
    assert.match(
      config,
      new RegExp(
        `\\[functions\\.${functionName.replaceAll('-', '\\-')}\\]\\nverify_jwt = (?:true|false)`,
      ),
    );
    assert.doesNotThrow(() =>
      readFileSync(
        new URL(
          `../supabase/functions/${functionName}/index.ts`,
          import.meta.url,
        ),
        'utf8',
      ),
    );
  }
});
