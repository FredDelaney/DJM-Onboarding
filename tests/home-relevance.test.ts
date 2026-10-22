import assert from 'node:assert/strict';
import {test} from 'node:test';
import {homeRelevanceReference,readHomeRelevance} from '../lib/home-relevance.ts';
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
