import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workspace = fs.readFileSync(
  new URL('../components/AgencyOperatingWorkspace.tsx', import.meta.url),
  'utf8',
);
const css = fs.readFileSync(
  new URL('../components/AgencyOperatingWorkspace.module.css', import.meta.url),
  'utf8',
);

test('quiet Home turns spare attention into useful agency work', () => {
  assert.match(workspace, /Check your players or capture a new update/);
  assert.match(workspace, /<AiLauncher\b/);
  assert.match(workspace, /Check players/);
  assert.match(workspace, /emptyStateActions/);
});

test('empty workspaces explain the first useful move', () => {
  assert.match(workspace, /Add the player once\. Their contract/);
  assert.match(workspace, /Connect your calendar or add a meeting/);
  assert.match(workspace, /Add what the club needs/);
  assert.match(workspace, /Add a club need and player/);
  assert.match(workspace, /Create a deal when money or terms are being discussed/);
});

test('empty-state actions remain touch friendly', () => {
  assert.match(css, /\.emptyStateAction\{/);
  assert.match(css, /\.emptyStateActions\{/);
  assert.match(css, /min-height:40px/);
});
