import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workspacePath = new URL(
  '../components/AgencyCalendarWorkspace.tsx',
  import.meta.url,
);

const shellPath = new URL(
  '../components/AgencyOperatingWorkspace.tsx',
  import.meta.url,
);


test('Calendar V2 is one clean agenda instead of another dashboard', async () => {
  const source = await readFile(workspacePath, 'utf8');

  assert.match(source, /\[7, 30, 90\]/);
  assert.match(source, /\{days\} days/);
  assert.match(source, /Today/);
  assert.match(source, /Tomorrow/);

  assert.doesNotMatch(source, /WorkspaceIntro/);
  assert.doesNotMatch(source, /<Metric/);
  assert.doesNotMatch(source, /calendarSummary/);
});

test('Calendar V2 keeps one direct destination per agenda row', async () => {
  const source = await readFile(workspacePath, 'utf8');

  assert.match(source, /Meeting link/);
  assert.match(source, /Open player/);
  assert.match(source, /Open Opportunities/);
  assert.match(source, /Open Network/);
  assert.match(source, /Open Home/);
});

test('Calendar V2 stays behind tenant-aware read models', async () => {
  const [source, shell] = await Promise.all([
    readFile(workspacePath, 'utf8'),
    readFile(shellPath, 'utf8'),
  ]);

  assert.match(shell, /AgencyCalendarWorkspace/);
  assert.match(shell, /redream_autopilot_calendar/);
  assert.doesNotMatch(source, /\.from\(/);
  assert.doesNotMatch(source, /supabase\./);
});
