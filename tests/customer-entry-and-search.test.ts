import assert from 'node:assert/strict';
import test from 'node:test';
import {verifiedPlayerPortalUrl} from '../lib/player-portal-entry.ts';
import {buildServerSearchItems} from '../lib/workspace-search.ts';
test('player portals accept only a bare DNS hostname and never an arbitrary redirect',()=>{
 assert.equal(verifiedPlayerPortalUrl('Agency.Example.test'),'https://agency.example.test/sign-in');
 for(const value of [null,'','javascript:alert(1)','https://example.test','example.test/path','example.test:443','user@example.test','127.0.0.1','localhost','example..test','-example.test','example.test?next=evil','example.test#evil']){
  assert.equal(verifiedPlayerPortalUrl(value),null,String(value));
 }
});
test('server search results produce tenant-scoped links without copying private fields',()=>{
 const rows=buildServerSearchItems({items:[{id:'p/1',kind:'player',title:'Player',subtitle:'Club',private_notes:'SECRET',medical:'SECRET'},{id:'n',kind:'opportunity',title:'Need'},{id:'malicious',kind:'javascript',title:'Ignored'}]},'/workspace/example');
 assert.equal(rows[0].href,'/workspace/example?view=players&player=p%2F1&profile=1');
 assert.equal(rows[1].href,'/workspace/example?view=opportunities&tab=needs&record=n');
 assert.equal(rows.length,2);assert.ok(!JSON.stringify(rows).includes('SECRET'));
 assert.equal(buildServerSearchItems({items:[{id:'p',kind:'player'}]},'//evil.test')[0].href,'/agency?view=players&player=p&profile=1');
});
