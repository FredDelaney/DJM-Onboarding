import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function fixture(existing = false) {
  let handler!: (request: Request) => Promise<Response>;
  let created: any;
  const source = readFileSync('supabase/functions/agency-staff-invite-public/index.ts','utf8').replace(/^import .*;\r?$/gm,'');
  const code = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  new Function('Deno','createClient',code)(
    {serve:(fn:typeof handler)=>{handler=fn;},env:{get:()=> 'fixture-server-only'}},
    () => ({
      rpc: async (name:string) => ({data:name==='platform_server_public_staff_invite_preflight'
        ? {invite_id:'verified-invite',email:'invited@example.test',role:'agent',tenant:{id:'verified-tenant'}}
        : name==='platform_server_find_auth_user_by_email' ? (existing?'existing-user':null) : {ok:true},error:null}),
      auth:{admin:{createUser:async(payload:any)=>{
        created=payload;
        const verified=payload.app_metadata?.invitation_kind==='agency_staff'
          && payload.app_metadata?.staff_invite_id==='verified-invite'
          && payload.app_metadata?.invited_tenant_id==='verified-tenant'
          && payload.user_metadata?.staff_invite_token==='a'.repeat(64);
        return verified?{data:{user:{id:'created-user'}},error:null}:{data:{user:null},error:{message:'Database error creating new user'}};
      },updateUserById:async(_id:string,payload:any)=>{
        assert.equal(payload.user_metadata.staff_invite_token,null);
        return {data:{user:{id:'created-user'}},error:null};
      },deleteUser:async()=>({error:null})}},
    }),
  );
  return {created:()=>created,call:()=>handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({action:'register',token:'a'.repeat(64),email:'invited@example.test',password:'Synthetic-Password1!',full_name:'Invited Colleague',role:'owner',staff_invite_id:'forged-invite',invited_tenant_id:'forged-tenant'})}))};
}

test('registration supplies server-owned invitation claims derived from preflight rather than the request body',async()=>{
  const f=fixture(); const response=await f.call();
  assert.equal(response.status,200);
  assert.equal((await response.json()).account_created,true);
  assert.deepEqual(f.created().app_metadata,{invitation_kind:'agency_staff',staff_invite_id:'verified-invite',invited_tenant_id:'verified-tenant'});
});

test('an existing staff account must sign in and its password is never replaced',async()=>{
  const f=fixture(true); const response=await f.call();
  assert.equal(response.status,409); assert.equal((await response.json()).account_exists,true);
  assert.equal(f.created(),undefined);
});
