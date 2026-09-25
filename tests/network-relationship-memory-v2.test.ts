import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const drawerPath = new URL(
  '../components/AgencyContactIntelligenceDrawer.tsx',
  import.meta.url,
);

const memoryPath = new URL(
  '../components/AgencyRelationshipMemory.tsx',
  import.meta.url,
);

test('person intelligence uses the tenant-aware relationship memory read model', async () => {
  const drawer = await readFile(drawerPath, 'utf8');

  assert.match(drawer, /redream_relationship_person/);
  assert.match(drawer, /AgencyRelationshipMemory/);
  assert.doesNotMatch(drawer, /djm_network_person/);
});

test('relationship memory surfaces routes, conversations and follow-up', async () => {
  const source = await readFile(memoryPath, 'utf8');

  assert.match(source, /BEST AGENCY ROUTE/);
  assert.match(source, /Recent conversations/);
  assert.match(source, /Open follow-up/);
  assert.match(source, /Needs attention/);
});

test('relationship memory component does not query database tables directly', async () => {
  const source = await readFile(memoryPath, 'utf8');

  assert.doesNotMatch(source, /\.from\(/);
  assert.doesNotMatch(source, /supabase\./);
});
