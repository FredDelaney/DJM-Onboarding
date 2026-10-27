import assert from 'node:assert/strict';
import {test} from 'node:test';
import {homeRelevanceReference,readHomeRelevance} from '../lib/home-relevance.ts';
import {isMissingStaffAssignmentRpc} from '../lib/staff-assignment-capability.ts';
const player='30000000-0000-4000-8000-000000000001';
test('player follow-ups preserve canonical reminder responsibility; notes and titles are excluded',()=>{
 assert.deepEqual(homeRelevanceReference({source_type:'player',source_id:player,command_type:'Player follow-up due',title:'Private title',notes:'Private note'}),{source_type:'player',source_id:player,work_kind:'player_next_action',work_id:player});
 assert.deepEqual(homeRelevanceReference({calendar_kind:'birthday',context:{player_id:player,private_note:'Not needed'}}),{context:{player_id:player}});
});
test('batch results validate, paginate and keep indices aligned',async()=>{
 let calls=0;
 const result=await readHomeRelevance(async<T,>(name:string,args:any)=>{calls++;assert.equal(name,'redream_home_relevance_v1');assert.equal(args.p_tenant_id,'agency');assert.equal(args.p_agency_overview,false);return {editable_indices:[],visible_indices:args.p_items.map((_:any,index:number)=>index).filter((index:number)=>index%2===0)} as T;},Array.from({length:205},()=>({})), 'agency',false);
 assert.equal(calls,2);assert.equal(result.visible.length,103);assert.equal(result.visible.at(-1),204);
 for(const bad of [{},{visible_indices:[-1]},{visible_indices:[2]},{visible_indices:['0']}])await assert.rejects(()=>readHomeRelevance(async<T,>()=>bad as T,[{}],'agency',false),/home_relevance_unconfirmed/);
});

test('an absent migration preserves the existing authorised feed and disables personalisation',async()=>{
 const result=await readHomeRelevance(async()=>{throw Object.assign(new Error('Could not find the function public.redream_home_relevance_v1 in the schema cache'),{code:'PGRST202'});},[{},{}],'agency',false);
 assert.deepEqual(result,{visible:[0,1],editable:[0,1],personalisationReady:false});
 let reads=0;
 const empty=await readHomeRelevance(async<T,>()=>{reads++;return {visible_indices:[],editable_indices:[]} as T;},[],'agency',false);
 assert.equal(reads,1,'Empty Home also confirms backend availability');assert.equal(empty.personalisationReady,true);
});
test('denials, outages and missing underlying objects never fall back to the old feed',async()=>{
 for(const error of [new Error('Connection failed'),Object.assign(new Error('permission denied'),{code:'42501'}),Object.assign(new Error('redream_home_relevance_v1 failed'),{code:'42883'}),Object.assign(new Error('Another missing function'),{code:'PGRST202'})]){
  assert.equal(isMissingStaffAssignmentRpc(error,'redream_home_relevance_v1'),false);
  await assert.rejects(()=>readHomeRelevance(async()=>{throw error;},[{}],'agency',false),error);
 }
 assert.equal(isMissingStaffAssignmentRpc({code:'PGRST202',message:'Could not find public.redream_player_staff_tags_v1'},'redream_player_staff_tags_v1'),true);
});
