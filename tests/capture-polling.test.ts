import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pollCaptureReceipt, waitForCapturePoll } from '../lib/capture-polling.ts';

test('denied receipt stops immediately without claiming completion or retrying',async()=>{
  let reads=0,denied=0;
  await pollCaptureReceipt({signal:new AbortController().signal,attempts:180,retryDelayMs:0,
    read:async()=>{reads++;throw Object.assign(Error('Denied'),{code:'42501'});},
    received:()=>assert.fail('unauthorised result'),denied:()=>{denied++;},exhausted:()=>assert.fail('must not claim safe save'),
  });
  assert.equal(reads,1);assert.equal(denied,1);
});
test('closing capture aborts a pending read and suppresses late receipt updates',async()=>{
  const controller=new AbortController();let finish!:(value:string)=>void;
  const response=new Promise<string>(resolve=>{finish=resolve;});
  const operation=pollCaptureReceipt({signal:controller.signal,attempts:180,retryDelayMs:0,
    read:async(signal)=>{assert.equal(signal,controller.signal);return response;},
    received:()=>assert.fail('late receipt must be ignored'),denied:()=>assert.fail(),exhausted:()=>assert.fail(),
  });
  controller.abort();finish('late receipt');await operation;
});
test('transient errors retry and a terminal receipt stops further requests',async()=>{
  let reads=0;
  await pollCaptureReceipt({signal:new AbortController().signal,attempts:5,retryDelayMs:0,
    read:async()=>{if(++reads===1)throw Error('Network down');return 'done';},
    received:value=>{assert.equal(value,'done');return null;},denied:()=>assert.fail(),exhausted:()=>assert.fail(),
  });assert.equal(reads,2);
});
test('abort clears a long polling delay promptly',async()=>{
  const controller=new AbortController();const delay=waitForCapturePoll(60000,controller.signal);
  controller.abort();await delay;
});
