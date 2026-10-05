import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSearchItems,searchWorkspaceItems,filterArchivedSearchItems} from '../lib/workspace-search.ts';
import {readListMemory,listMemoryKey} from '../lib/workspace-list-memory.ts';
test('search opens exact tenant-scoped canonical records',()=>{
 const path='/workspace/example';
 const player=buildSearchItems('players',{items:[{player_id:'p/1',identity:{name:'José Player',current_club:'Example FC',primary_position:'Centre back'}}]},path)[0];
 assert.equal(player.href,'/workspace/example?view=players&player=p%2F1&profile=1');
 const recruit=buildSearchItems('recruitment',{items:[{id:'r1',full_name:'Recruit'}]},path)[0];
 assert.equal(recruit.href,path+'?view=players&tab=recruitment&target=r1');
 const network=buildSearchItems('network',{accounts:{clubs:[{organisation_id:'c1',name:'Club'}]},contacts:{items:[{person_id:'u1',person:{full_name:'Contact'},employment:{organisation_name:'Club',role_title:'Director'}}]}},path);
 assert.equal(network[0].href,path+'?view=network&club=c1');
 assert.equal(network[1].href,path+'?view=network&person=u1');
 assert.equal(network[1].subtitle,'Club · Director');
 const need=buildSearchItems('opportunities',{demand:{items:[{club_need_id:'n1',need:{title:'Centre back'},club:{name:'Club'}}]}},path)[0];
 assert.equal(need.href,path+'?view=opportunities&tab=needs&record=n1');
 const deal=buildSearchItems('deals',{portfolio:{deals:[{deal_room_id:'d1',title:'Transfer',organisation:'Club'}]}},path)[0];
 assert.equal(deal.href,path+'?view=opportunities&tab=deals&record=d1');
});
test('search ignores malformed or unidentified records and unsafe navigation roots',()=>{
 assert.deepEqual(buildSearchItems('players',{items:[null,{}, {identity:{name:'Missing ID'}}]},'/agency'),[]);
 assert.equal(buildSearchItems('players',{items:[{player_id:'p1',identity:{name:'Player'}}]},'https://outside.example')[0].href,'/agency?view=players&player=p1&profile=1');
 assert.deepEqual(buildSearchItems('network',{accounts:{clubs:'not a list'},contacts:null},'/agency'),[]);
});
test('search ranks exact titles ahead of context matches and handles accents and separate words',()=>{
 const items=buildSearchItems('players',{items:[{player_id:'p1',identity:{name:'José Silva',current_club:'Example FC',primary_position:'Centre back'}},{player_id:'p2',identity:{name:'Other',current_club:'José Silva'}}]},'/agency');
 assert.equal(searchWorkspaceItems(items,'jose silva')[0].id,'p1');
 assert.equal(searchWorkspaceItems(items,'example back')[0].id,'p1');
 assert.equal(searchWorkspaceItems(items,'missing').length,0);
});
test('archived records are excluded without confusing different entity types',()=>{
 const items=buildSearchItems('network',{accounts:{clubs:[{organisation_id:'same',name:'Club'}]},contacts:{items:[{person_id:'same',person:{full_name:'Contact'}}]}},'/agency');
 assert.deepEqual(filterArchivedSearchItems(items,[{entity_type:'club',entity_id:'same'}]).map(x=>x.kind),['contact']);
});
test('search never copies private evidence or financial fields into its index',()=>{
 const item=buildSearchItems('players',{items:[{player_id:'p',identity:{name:'Player',private_note:'private'},commission:99999,medical:'private'}]},'/agency')[0];
 assert.ok(!JSON.stringify(item).includes('private'));assert.ok(!JSON.stringify(item).includes('99999'));
});
test('list memory keeps only bounded display preferences and separates users and tenants',()=>{
 const initial={search:'',stage:'all'};
 assert.notEqual(listMemoryKey('tenant-a:user-a','players'),listMemoryKey('tenant-a:user-b','players'));
 assert.notEqual(listMemoryKey('tenant-a:user-a','players'),listMemoryKey('tenant-b:user-a','players'));
 assert.deepEqual(readListMemory('{bad',initial),initial);
 assert.deepEqual(readListMemory(JSON.stringify({search:'John',stage:'contacted',canonicalPlayer:{name:'private'}}),initial),{search:'John',stage:'contacted'});
 assert.deepEqual(readListMemory(JSON.stringify({search:12,stage:null}),initial),initial);
 assert.equal(readListMemory(JSON.stringify({search:'x'.repeat(1000)}),initial).search.length,200);
});
import {getCachedPlayerProfile,setCachedPlayerProfile,prefetchPlayerProfile,invalidatePlayerProfile} from '../lib/player-profile-cache.ts';
test('profile prefetch deduplicates within a scope and never shares data across users',async()=>{
 let reads=0;let finish:any;
 const invoke=async()=>{reads++;return await new Promise<any>(resolve=>finish=resolve);};
 const first=prefetchPlayerProfile('scoped-player',invoke as any,'tenant:user-a:agent');
 const duplicate=prefetchPlayerProfile('scoped-player',invoke as any,'tenant:user-a:agent');
 assert.equal(first,duplicate);assert.equal(reads,1);
 finish({profile:{name:'Allowed profile'}});await first;
 assert.equal(getCachedPlayerProfile('scoped-player','tenant:user-a:agent').name,'Allowed profile');
 assert.equal(getCachedPlayerProfile('scoped-player','tenant:user-b:agent'),null);
 assert.equal(getCachedPlayerProfile('scoped-player','other-tenant:user-a:agent'),null);
 assert.equal(getCachedPlayerProfile('scoped-player','tenant:user-a:scout'),null);
 assert.equal(getCachedPlayerProfile('scoped-player'),null);
});
test('a late prefetched response cannot replace newer saved profile data',async()=>{
 let finish:any;
 const request=prefetchPlayerProfile('revision-player',async()=>await new Promise<any>(resolve=>finish=resolve),'tenant:user:owner');
 setCachedPlayerProfile('revision-player',{revision:2},'tenant:user:owner');
 finish({profile:{revision:1}});await request;
 assert.equal(getCachedPlayerProfile('revision-player','tenant:user:owner').revision,2);
 invalidatePlayerProfile('revision-player','tenant:user:owner');
 assert.equal(getCachedPlayerProfile('revision-player','tenant:user:owner'),null);
});
