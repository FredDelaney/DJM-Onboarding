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
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
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
    'import-player-evidence-json',
    'import-player-stats',
    'refresh-clubelo-team-strength',
    'refresh-global-football-identity',
    'refresh-global-football-intelligence',
    'refresh-official-football-data',
    'refresh-player-data',
    'refresh-player-data-universal',
    'refresh-player-peer-data',
    'remove-player',
    'weekly-player-refresh',
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

test('football providers are capability-gated and never expose Wyscout secrets to the client', () => {
  const importFunction = readFileSync(
    new URL('../supabase/functions/import-player-stats/index.ts', import.meta.url),
    'utf8',
  );
  const transfermarktFunction = readFileSync(
    new URL('../supabase/functions/djm-transfermarkt-enrich/index.ts', import.meta.url),
    'utf8',
  );
  const providers = readFileSync(
    new URL('../supabase/functions/_shared/football-data/providers.ts', import.meta.url),
    'utf8',
  );
  const wyscout = readFileSync(
    new URL('../supabase/functions/_shared/football-data/wyscout.ts', import.meta.url),
    'utf8',
  );

  assert.match(importFunction, /Direct provider application is disabled/);
  assert.match(importFunction, /status\.capability === "reference_only"/);
  assert.match(transfermarktFunction, /capability: "reference_only"/);
  assert.match(transfermarktFunction, /Legacy parser retained for a possible future licensed integration/);
  assert.match(providers, /DJM_WYSCOUT_API_ENABLED/);
  assert.match(providers, /WYSCOUT_API_USERNAME/);
  assert.match(providers, /WYSCOUT_API_PASSWORD/);
  assert.match(wyscout, /const MAX_ATTEMPTS = 3/);
  assert.match(wyscout, /response\.status === 429/);
  assert.match(wyscout, /Existing DJM data was not changed/);
});
