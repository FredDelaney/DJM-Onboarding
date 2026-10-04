import assert from 'node:assert/strict';import test from 'node:test';
import { parseCalendarPreferences } from '../lib/calendar/preferences.ts';
test('old birthday preferences migrate without enabling other contacts or losing choices',()=>{
 const prefs=parseCalendarPreferences('{"contacts":true,"staff":false}');assert.equal(prefs.birthdays.contacts,true);assert.equal(prefs.birthdays.staff,false);assert.equal(prefs.layers.personal,true);assert.equal(prefs.view,'month');
});
test('malformed settings and unknown content cannot pollute preference state',()=>{
 const prefs=parseCalendarPreferences('{"version":2,"view":"agenda","title":"Private task","layers":{"personal":false},"birthdays":{"contacts":true}}');assert.equal(prefs.view,'agenda');assert.equal(prefs.layers.personal,false);assert.ok(!JSON.stringify(prefs).includes('Private task'));assert.equal(parseCalendarPreferences('{bad').birthdays.contacts,false);
});
