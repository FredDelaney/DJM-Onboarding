import test from 'node:test';
import assert from 'node:assert/strict';
import {readWithDeadline} from '../lib/read-with-deadline.ts';

test('server statement timeouts use recoverable read language and retain the original diagnostic',async()=>{
 for(const original of [Object.assign(new Error('canceling statement due to statement timeout'),{code:'57014'}),{message:'canceling statement due to statement timeout',code:'57014'}]){
  await assert.rejects(readWithDeadline(Promise.reject(original)),error=>{
   assert.ok(error instanceof Error);
   assert.equal(error.message,'The request took too long. Please try again.');
   assert.equal(error.cause,original);assert.equal((error as Error & {code:string}).code,'57014');return true;
  });
 }
});
test('other denials, cancellation and network errors preserve their identity and meaning',async()=>{
 for(const original of [new Error('Workspace access denied'),new Error('Network unavailable'),Object.assign(new Error('canceling statement due to user request'),{code:'57014'})]){
  await assert.rejects(readWithDeadline(Promise.reject(original)),error=>error===original);
 }
});
test('a read result is preserved and both success and server failure release their deadline',async t=>{
 const original=globalThis.clearTimeout;
 const cleared:unknown[]=[];
 t.mock.method(globalThis,'clearTimeout',(timer:ReturnType<typeof setTimeout>)=>{cleared.push(timer);original(timer);});
 const response={items:[{id:'record'}]};
 assert.equal(await readWithDeadline(Promise.resolve(response)),response);
 await assert.rejects(readWithDeadline(Promise.reject(new Error('canceling statement due to statement timeout'))));
 assert.equal(cleared.length,2);assert.ok(cleared.every(Boolean));
});
test('a stalled read expires once and a late result cannot turn it into success',async()=>{
 let resolve!:(value:string)=>void;
 const request=new Promise<string>(done=>{resolve=done;});
 const bounded=readWithDeadline(request,10);
 await assert.rejects(bounded,/The request took too long/);
 resolve('late result');await request;
 await assert.rejects(bounded,/The request took too long/);
});
