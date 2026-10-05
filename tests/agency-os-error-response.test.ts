import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

// Keep the real HTTP handler. Only replace the external Supabase context.
const source = readFileSync('supabase/functions/agency-os/index.ts','utf8')
  .replace('import "jsr:@supabase/functions-js/edge-runtime.d.ts";', '')
  .replace('import { createSupabaseContext } from "npm:@supabase/server@1.6.0";', 'const createSupabaseContext = () => globalThis.agencyErrorTestContext;');
const {default: handler} = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
test('a plain PostgREST expired-approval error returns a recoverable conflict, not a generic 500', async () => {
  (globalThis as any).agencyErrorTestContext = {data:{userClaims:{sub:'actor'},supabaseAdmin:{rpc:async(name:string) =>
    name === 'platform_server_user_workspaces'
      ? {data:[{tenant_id:'tenant',role:'owner',is_primary:true}],error:null}
      : {data:null,error:{message:'proposal_expired',code:'P0001',details:null,hint:null}}
  }},error:null};
  const response = await handler.fetch(new Request('https://example.com', {method:'POST',body:JSON.stringify({action:'action_execute',tenant_id:'tenant',proposal_id:'proposal'})}));
  assert.equal(response.status,409);
  const body = await response.json();
  assert.equal(body.code,'proposal_expired');
  assert.match(body.error,/expired/i);
  assert.match(body.error,/open.*again/i);
});
test('a vanished command returns a conflict with a refresh recovery path', async () => {
  (globalThis as any).agencyErrorTestContext = {data:{userClaims:{sub:'actor'},supabaseAdmin:{rpc:async(name:string) =>
    name === 'platform_server_user_workspaces'
      ? {data:[{tenant_id:'tenant',role:'owner',is_primary:true}],error:null}
      : {data:null,error:{message:'command_no_longer_actionable',code:'P0001',details:null,hint:null}}
  }},error:null};
  const response = await handler.fetch(new Request('https://example.com', {method:'POST',body:JSON.stringify({action:'action_prepare',tenant_id:'tenant',command_id:'missing'})}));
  assert.equal(response.status,409);
  const body = await response.json();
  assert.equal(body.code,'command_no_longer_actionable');
  assert.match(body.error,/refresh/i);
});
test('only known conflict codes are translated; inherited object keys remain generic errors', async () => {
  (globalThis as any).agencyErrorTestContext = {data:{userClaims:{sub:'actor'},supabaseAdmin:{rpc:async(name:string) =>
    name === 'platform_server_user_workspaces'
      ? {data:[{tenant_id:'tenant',role:'owner',is_primary:true}],error:null}
      : {data:null,error:{message:'__proto__',code:'P0001',details:null,hint:null}}
  }},error:null};
  const response = await handler.fetch(new Request('https://example.com', {method:'POST',body:JSON.stringify({action:'action_execute',tenant_id:'tenant',proposal_id:'proposal'})}));
  assert.equal(response.status,500);
  assert.deepEqual(await response.json(),{error:'Agency OS request failed'});
});
