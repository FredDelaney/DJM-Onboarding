import test from 'node:test';
import assert from 'node:assert/strict';
import {writeWithDeadline} from '../lib/write-with-deadline.ts';

test('a stalled write becomes unconfirmed, is aborted and is never automatically retried',async()=>{
 let calls=0;let signal:AbortSignal|undefined;
 const result=await writeWithDeadline(current=>{calls++;signal=current;return new Promise(()=>{});},20);
 assert.deepEqual(result,{status:'unknown'});
 assert.equal(signal?.aborted,true);
 assert.equal(calls,1);
});
test('a confirmed write preserves the actual returned result',async()=>{
 const result=await writeWithDeadline(async()=>({data:{id:'owned-record'},error:null}),100);
 assert.deepEqual(result,{status:'complete',result:{data:{id:'owned-record'},error:null}});
});
test('a transport failure is unconfirmed rather than an assertion that nothing saved',async()=>{
 const result=await writeWithDeadline(async()=>{throw new Error('connection lost');},100);
 assert.deepEqual(result,{status:'unknown'});
});
test('late completion cannot turn an unconfirmed write into success',async()=>{
 let complete!:(value:string)=>void;
 const pending=new Promise<string>(resolve=>{complete=resolve;});
 const result=await writeWithDeadline(()=>pending,20);
 complete('saved');
 await pending;
 assert.deepEqual(result,{status:'unknown'});
});

test('a server denial is returned for the caller to handle, never reported as success',async()=>{
 const result=await writeWithDeadline(async()=>({data:null,error:{code:'42501',message:'denied'}}),100);
 assert.deepEqual(result,{status:'complete',result:{data:null,error:{code:'42501',message:'denied'}}});
});
