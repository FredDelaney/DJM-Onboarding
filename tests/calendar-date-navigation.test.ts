import assert from 'node:assert/strict';
import test from 'node:test';
import { monthDays, shiftMonth, calendarDateKey, calendarPreferences } from '../lib/calendar/dates.ts';

test('month navigation clamps the selected day and crosses year boundaries', () => {
  assert.equal(shiftMonth('2026-01-31', 1), '2026-02-28');
  assert.equal(shiftMonth('2028-01-31', 1), '2028-02-29');
  assert.equal(shiftMonth('2026-12-15', 1), '2027-01-15');
});
test('the date slider includes every number, including leap day', () => {
  assert.equal(monthDays('2028-02-10').length, 29);
  assert.equal(monthDays('2026-10-04')[30], '2026-10-31');
});
test('date-only birthdays retain their date while timed meetings use local time', () => {
  assert.equal(calendarDateKey('2026-10-04', true), '2026-10-04');
  assert.equal(calendarDateKey('invalid'), '');
});
test('malformed saved settings fall back without enabling contact birthdays', () => {
  assert.deepEqual(calendarPreferences('{broken'), { players: true, contacts: false, staff: true });
  assert.deepEqual(calendarPreferences('{"contacts":true,"staff":false}'), { players: true, contacts: true, staff: false });
});
