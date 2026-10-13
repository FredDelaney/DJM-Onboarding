import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as routes from '../lib/legacy-workspace-route.ts';

test('saved record links retain the selected record when moving to the current workspace',()=>{
 const href=(routes as any).legacyWorkspaceRecordHref;
 assert.equal(typeof href,'function');
 assert.equal(href('club','club-1'),'/agency?view=network&club=club-1');
 assert.equal(href('contact','contact-1'),'/agency?view=network&person=contact-1');
 assert.equal(href('deal','deal-1'),'/agency?view=opportunities&tab=deals&record=deal-1');
 assert.equal(href('recruitment','target-1'),'/agency?view=players&tab=recruitment&target=target-1');
 assert.equal(href('club','club & other'),'/agency?view=network&club=club+%26+other');
});
