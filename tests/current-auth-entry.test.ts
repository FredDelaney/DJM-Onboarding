import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveActiveAuthDestination,resolveCurrentAuthentication} from '../lib/current-auth-entry.ts';
const deferred=<T,>()=>{let resolve!:(value:T)=>void;let reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
test('workspace routing confirms the same current account after destination lookup',async()=>{
 let current=true,user='a';const pending=deferred<string>();
 const request=resolveActiveAuthDestination({userId:'a',resolve:()=>pending.promise,getCurrentUserId:async()=>user,isCurrent:()=>current});
 user='b';pending.resolve('/workspace/a');assert.equal(await request,null);
 const active=await resolveActiveAuthDestination({userId:'b',resolve:async()=>'/workspace/b',getCurrentUserId:async()=>user,isCurrent:()=>current});
 assert.equal(active,'/workspace/b');
});
test('leaving sign-in invalidates late destinations and errors',async()=>{
 for(const fail of [false,true]){
  let current=true;const pending=deferred<string>();
  const request=resolveActiveAuthDestination({userId:'a',resolve:()=>pending.promise,getCurrentUserId:async()=>'a',isCurrent:()=>current});
  current=false;if(fail)pending.reject(new Error('Old failed request'));else pending.resolve('/workspace/a');
  assert.equal(await request,null);
 }
});
test('sign-out while the final session read is pending cannot redirect',async()=>{
 let current=true;const identity=deferred<string|null>();let started!:()=>void;const reading=new Promise<void>(r=>{started=r;});
 const request=resolveActiveAuthDestination({userId:'a',resolve:async()=>'/workspace/a',getCurrentUserId:()=>{started();return identity.promise;},isCurrent:()=>current});
 await reading;current=false;identity.resolve('a');assert.equal(await request,null);
});
test('a current lookup failure is reported for retry',async()=>{
 await assert.rejects(resolveActiveAuthDestination({userId:'a',resolve:async()=>{throw new Error('Unavailable');},getCurrentUserId:async()=>'a',isCurrent:()=>true}),/Unavailable/);
});

test('password and passkey attempts cannot continue after unmount or replacement',async()=>{
 for(const kind of ['password','passkey']){
  let active=true,attempt=1;const pending=deferred<{userId:string}>();let routed=false;
  const request=resolveCurrentAuthentication(()=>pending.promise,()=>active&&attempt===1).then(result=>{if(result)routed=true;});
  active=false;pending.resolve({userId:kind});await request;assert.equal(routed,false);
  active=true;const replaced=deferred<string>();
  const old=resolveCurrentAuthentication(()=>replaced.promise,()=>active&&attempt===1);
  attempt=2;replaced.resolve('old-user');assert.equal(await old,null);
 }
});
