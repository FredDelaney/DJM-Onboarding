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
  const {normaliseCalendarEvents,groupCalendarEvents}=await import('../lib/calendar/events.ts');
  const events=normaliseCalendarEvents({}, {items:[{item_id:'today',date_at:'2026-10-04',title:'Today birthday'},{item_id:'tomorrow',date_at:'2026-10-05',title:'Tomorrow birthday'}]},[]);
  assert.deepEqual(groupCalendarEvents(events,'2026-10-04','agenda',7,new Date('2026-10-04T12:00:00')).map(group=>group.label),['Today','Tomorrow']);

  assert.doesNotMatch(source, /WorkspaceIntro/);
  assert.doesNotMatch(source, /<Metric/);
  assert.doesNotMatch(source, /calendarSummary/);
});

test('Calendar V2 keeps one direct destination per agenda row', async () => {
  const source = await readFile(workspacePath, 'utf8');

  assert.match(source, /Meeting link/);
  assert.match(source, /Open player/);
  assert.match(source, /Open deal/);
  assert.match(source, /Open route/);
  assert.match(source, /Open need/);
  assert.match(source, /Open person/);
  assert.match(source, /Open club/);
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


test('past meetings hand directly into the existing outcome aftercare', async () => {
  const [source, shell] = await Promise.all([
    readFile(workspacePath, 'utf8'),
    readFile(shellPath, 'utf8'),
  ]);

  assert.match(source, /const meetingStarted = Boolean/);
  assert.match(source, /startsAt\.getTime\(\) <= Date\.now\(\)/);
  assert.match(source, />\s*Record outcome\s*</);
  assert.match(source, /onRecordOutcome\(meeting\)/);
  assert.match(
    shell,
    /onRecordMeetingOutcome=\{\(meeting\) =>[\s\S]*setMeetingOutcomeRequest\(meeting\)/,
  );
  assert.match(shell, /AgencyMeetingOutcomeDrawer/);
});
