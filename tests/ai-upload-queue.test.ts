import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flushAiQueue, uploadAiCaptureOnce } from '../lib/ai-upload-queue.ts';

test('revoked agency upload cannot strand another agency or notes after the first twenty',async()=>{
  const saved=Array.from({length:24},(_,id)=>({id,workspace:id<21?'revoked':'northstar'}));
  const uploaded:number[]=[];
  const result=await flushAiQueue(async()=>saved,async item=>{
    if(item.workspace==='revoked')throw Error('Access denied');
    uploaded.push(item.id);
  });
  assert.deepEqual(result,{uploaded:3,failed:21});
  assert.deepEqual(uploaded,[21,22,23]);
  assert.equal(saved.length,24,'the queue never deletes failed records');
});
test('overlapping reconnect events share one drain and failures release it for retry',async()=>{
  let finish!:()=>void;
  const pause=new Promise<void>(resolve=>{finish=resolve;});
  let reads=0,calls=0;
  const read=async()=>{reads++;return [1];};
  const upload=async()=>{calls++;await pause;};
  const first=flushAiQueue(read,upload),second=flushAiQueue(read,upload);
  finish();
  await Promise.all([first,second]);
  assert.equal(reads,1);assert.equal(calls,1);
  await assert.rejects(flushAiQueue(async()=>{throw Error('storage unavailable');},upload));
  assert.deepEqual(await flushAiQueue(async()=>[],upload),{uploaded:0,failed:0});
});
test('foreground and reconnect upload share one request per capture; a failed request can retry',async()=>{
  let finish!:(value:string)=>void;
  const pause=new Promise<string>(resolve=>{finish=resolve;});
  let calls=0;
  const upload=()=>{calls++;return pause;};
  const first=uploadAiCaptureOnce('capture',upload),second=uploadAiCaptureOnce('capture',upload);
  finish('server-id');
  assert.deepEqual(await Promise.all([first,second]),['server-id','server-id']);assert.equal(calls,1);
  await assert.rejects(uploadAiCaptureOnce('failed',async()=>{throw Error('offline');}));
  assert.equal(await uploadAiCaptureOnce('failed',async()=> 'retried'),'retried');
});

test('losing connectivity pauses the drain without attempting the remaining records',async()=>{
  let online=true;
  const attempted:number[]=[];
  const result=await flushAiQueue(async()=>[1,2,3],async id=>{attempted.push(id);online=false;},()=>online);
  assert.deepEqual(attempted,[1]);
  assert.deepEqual(result,{uploaded:1,failed:0});
});
