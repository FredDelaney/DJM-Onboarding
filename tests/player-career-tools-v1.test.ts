import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const source=readFileSync('components/PlayerCareerNavigator.tsx','utf8');
test('optional career tools use a closed native disclosure instead of a clipped carousel',()=>{
 assert.match(source,/<details/);
 assert.match(source,/<summary[\s\S]*Career tools/);
 assert.doesNotMatch(source,/<details[^>]*\bopen\b/);
});
test('the compact career tools preserve every destination and sharing boundary',()=>{
 for(const href of ['/home#week','/career#toolkit','/home#season','/cv','/career#record','/inbox?compose=1','/documents'])assert.ok(source.includes(href));
 assert.match(source,/Club sharing needs approval/);
 assert.match(source,/aria-current/);
});
