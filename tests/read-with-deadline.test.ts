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
test('owner cancellation releases a stalled read and its timer without accepting a late result',async t=>{
 const original=globalThis.clearTimeout,cleared:unknown[]=[];
 t.mock.method(globalThis,'clearTimeout',(timer:ReturnType<typeof setTimeout>)=>{cleared.push(timer);original(timer);});
 const controller=new AbortController();let complete!:(value:string)=>void;
 const request=new Promise<string>(resolve=>{complete=resolve;});
 const result=readWithDeadline(request,12000,controller.signal);controller.abort();
 await assert.rejects(result,error=>error instanceof DOMException&&error.name==='AbortError');
 assert.equal(cleared.length,1);assert.ok(cleared[0]);complete('Late');
 await assert.rejects(result,{name:'AbortError'});
});
test('an already cancelled read never installs a new deadline',async t=>{
 const set=t.mock.method(globalThis,'setTimeout');const controller=new AbortController();controller.abort();
 await assert.rejects(readWithDeadline(Promise.resolve('Done'),12000,controller.signal),{name:'AbortError'});
 await assert.rejects(readWithDeadline(Promise.reject(new Error('Old read failed')),12000,controller.signal),{name:'AbortError'});
 assert.equal(set.mock.callCount(),0);
});
