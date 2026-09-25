import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const networkPath = new URL(
  '../components/AgencyNetworkWorkspace.tsx',
  import.meta.url,
);

const shellPath = new URL(
  '../components/AgencyOperatingWorkspace.tsx',
  import.meta.url,
);

test('Network V2 keeps the agent-facing model to clubs and people', async () => {
  const source = await readFile(networkPath, 'utf8');

  assert.match(source, /Clubs/);
  assert.match(source, /People/);
  assert.match(source, /BEST ROUTE/);
  assert.match(source, /NEXT MOVE/);
  assert.doesNotMatch(source, />Contacts</);
});

test('Network V2 reuses the authenticated relationship read model', async () => {
  const source = await readFile(shellPath, 'utf8');

  assert.match(
    source,
    /redream_autopilot_relationships/,
  );

  assert.match(
    source,
    /AgencyNetworkWorkspace/,
  );
});

test('Network V2 does not query Supabase tables directly', async () => {
  const source = await readFile(networkPath, 'utf8');

  assert.doesNotMatch(source, /\.from\(/);
  assert.doesNotMatch(source, /supabase\./);
});
