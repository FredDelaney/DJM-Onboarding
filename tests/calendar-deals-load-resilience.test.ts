import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { opportunityReadState } from '../lib/opportunity-read-state.ts';

const shellPath = new URL('../components/AgencyOperatingWorkspace.tsx', import.meta.url);
const calendarPath = new URL('../lib/calendar/useCalendarSources.ts', import.meta.url);

test('Calendar does not block its first render on an unused overview RPC', async () => {
  const shell = await readFile(shellPath, 'utf8');
  assert.doesNotMatch(shell, /redream_autopilot_calendar/);
  assert.match(shell, /calendar: \{\}/);
});

test('Confirming a calendar task does not strand unrelated in-flight date reads', async () => {
  const source = await readFile(calendarPath, 'utf8');
  assert.doesNotMatch(source, /mutationVersion/);
  assert.match(source, /for\(const name of \['tasks','undated','overdue','todayTasks'\]\)requests\.current\[name\]\?\.cancel\(\)/);
  assert.match(source, /clearTimeout\(timer\);setSources\(old=>/);
});

test('Live Deals distinguishes loading, empty success, and failed first read', async () => {
  assert.equal(opportunityReadState({ market: { demand: { items: [] } } }, 'deals'), 'loading');
  assert.equal(opportunityReadState({ deals: { portfolio: { deals: [] } } }, 'deals'), 'ready');
  assert.equal(opportunityReadState({ opportunity_errors: { deals: true } }, 'deals'), 'error');
  const shell = await readFile(shellPath, 'utf8');
  assert.match(shell, /opportunity_errors: \{ \.\.\.\(current\?\.opportunity_errors \|\| \{\}\), \[failed\]: true \}/);
});
