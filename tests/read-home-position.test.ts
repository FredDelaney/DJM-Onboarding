import assert from 'node:assert/strict';
import test from 'node:test';
import {readHomePosition} from '../lib/read-home-position.ts';
test('a valid preferred home avoids a compatibility request',async()=>{
 let fallbacks=0;assert.deepEqual(await readHomePosition(async()=>({home:{commands:[]}}),async()=>{fallbacks++;return {};},80),{commands:[]});assert.equal(fallbacks,0);
});
test('a stalled preferred read yields to the fallback promptly and cannot replace it later',async()=>{
 let finish!:(value:any)=>void;const preferred=new Promise<any>(resolve=>finish=resolve);const start=performance.now();
 const result=await readHomePosition(()=>preferred,async()=>({source:'fallback'}),160);assert.deepEqual(result,{source:'fallback'});assert.ok(performance.now()-start<145);finish({home:{source:'late'}});assert.equal(result.source,'fallback');
});
test('both stalled readers share one total deadline',async()=>{
 const start=performance.now();await assert.rejects(readHomePosition(()=>new Promise(()=>{}),()=>new Promise(()=>{}),120),/took too long/);assert.ok(performance.now()-start<210,'Fallback must not get a fresh full budget');
});
test('failed or incomplete primary envelopes use real fallback data; failed fallback does not manufacture an empty Home',async()=>{
 for(const read of [async()=>{throw new Error('unavailable');},async()=>({}),async()=>({home:null})])assert.deepEqual(await readHomePosition(read,async()=>({source:'fallback'}),100),{source:'fallback'});
 await assert.rejects(readHomePosition(async()=>({}),async()=>null,100),/could not confirm/);
 await assert.rejects(readHomePosition(async()=>({}),async()=>{throw new Error('network unavailable');},100),/network unavailable/);
});
