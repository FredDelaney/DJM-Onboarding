import assert from 'node:assert/strict';
import test from 'node:test';
import { readStaffInviteResult } from '../lib/staff-invite-result.ts';

test('registration exposes the actionable server error hidden by a FunctionsHttpError',async()=>{
  const error={message:'Edge Function returned a non-2xx status code',context:new Response(JSON.stringify({error:'Invitation email does not match'}),{status:400})};
  await assert.rejects(readStaffInviteResult({data:null,error}),/Invitation email does not match/);
  assert.equal(error.context.bodyUsed,false);
});
test('a 409 account_exists response reaches the sign-in recovery path',async()=>{
  assert.deepEqual(await readStaffInviteResult({data:null,error:{context:new Response(JSON.stringify({error:'Sign in to accept',account_exists:true}),{status:409})}}),{error:'Sign in to accept',account_exists:true});
});
test('network and malformed failures give readable retry guidance',async()=>{
  for (const error of [new TypeError('Failed to fetch'),{message:'Edge Function returned a non-2xx status code',context:new Response('<html>Bad Gateway</html>',{status:502})}]) {
    await assert.rejects(readStaffInviteResult({data:null,error}),/try again/i);
  }
});
test('successful registration and explicit application errors retain their meaning',async()=>{
  assert.deepEqual(await readStaffInviteResult({data:{ok:true,account_created:true},error:null}),{ok:true,account_created:true});
  await assert.rejects(readStaffInviteResult({data:{error:'This invitation has expired.'},error:null}),/invitation has expired/);
});

test('inactive and malformed successful HTTP responses never imply accepted access',async()=>{
 await assert.rejects(readStaffInviteResult({data:{invite:null},error:null}),/no longer active/);
 for(const data of [{}, {ok:false}, [], null, 'unexpected', true])await assert.rejects(readStaffInviteResult({data,error:null}),/try again/i);
});
