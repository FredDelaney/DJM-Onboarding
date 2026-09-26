import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workspacePath = new URL(
  '../components/AgencyOpportunitiesWorkspace.tsx',
  import.meta.url,
);

const shellPath = new URL(
  '../components/AgencyOperatingWorkspace.tsx',
  import.meta.url,
);

test('Opportunities V2 keeps one clean agent-facing working surface', async () => {
  const source = await readFile(workspacePath, 'utf8');

  assert.match(source, />\s*Needs\s*</);
  assert.match(source, />\s*Player routes\s*</);
  assert.match(source, />\s*Live deals\s*</);
  assert.match(source, /Search opportunities/);

  assert.doesNotMatch(source, /WorkspaceIntro/);
  assert.doesNotMatch(source, /<Metric/);
  assert.doesNotMatch(source, /opportunityColumns/);
  assert.doesNotMatch(source, /Deals losing momentum/);
});

test('Opportunities V2 keeps one primary next action per visible row', async () => {
  const source = await readFile(workspacePath, 'utf8');

  assert.match(source, /Open route/);
  assert.match(source, /Start search/);
  assert.match(source, /Open pursuit/);
  assert.match(source, /Open deal/);
  assert.match(source, /Fix now/);
  assert.match(source, /Assign owner/);

  assert.doesNotMatch(source, /Review strategy/);
});

test('Opportunities V2 reuses tenant-aware read models and guarded drawers', async () => {
  const [source, shell] = await Promise.all([
    readFile(workspacePath, 'utf8'),
    readFile(shellPath, 'utf8'),
  ]);

  assert.match(shell, /AgencyOpportunitiesWorkspace/);
  assert.match(shell, /redream_autopilot_market/);
  assert.match(shell, /redream_autopilot_deals/);
  assert.match(source, /onOpenPursuit/);
  assert.match(source, /onOpenAction/);
  assert.match(source, /onOpenIntelligence/);

  assert.doesNotMatch(source, /\.from\(/);
  assert.doesNotMatch(source, /supabase\./);
});
