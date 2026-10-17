import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

// Keep the real HTTP handler. Only replace the external Supabase context.
const shared = Buffer.from(stripTypeScriptTypes(readFileSync('supabase/functions/_shared/football-data/player-data-workflow.ts','utf8'))).toString('base64');
const staffShared=Buffer.from(stripTypeScriptTypes(readFileSync('supabase/functions/_shared/staff-read-contract.ts','utf8'))).toString('base64');
const source = readFileSync('supabase/functions/agency-os/index.ts','utf8')
 .replace(/^import .*player-profile-preparation\.ts";$/m,'const preparePlayerProfileEvidence = () => { throw new Error("outside this test"); }; const reviewPlayerProfileEvidence = preparePlayerProfileEvidence;')
 .replace(/^import .*player-profile-ai\.ts";$/m,'const selectPlayerProfilePresentation = () => { throw new Error("outside this test"); };')
 .replace(/^import .*player-profile-text-improvement\.ts";$/m,'const suggestPlayerProfileTextImprovement = () => { throw new Error("outside this test"); };')
 .replace(/^import .*player-context-ai\.ts";$/m,'const researchPlayerContext = () => { throw new Error("outside this test"); };')
 .replace(/^import .*ai-router\.ts";$/m,'const selectAiRoute = () => { throw new Error("outside this test"); };')
 .replace('"../_shared/staff-read-contract.ts"','"data:text/javascript;base64,'+staffShared+'"')
  .replace('"../_shared/football-data/player-data-workflow.ts"', '"data:text/javascript;base64,'+shared+'"')
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

test('an incomplete career approval returns actionable JSON with CORS instead of rejecting the request', async () => {
  (globalThis as any).agencyErrorTestContext = {data:{userClaims:{sub:'actor'},supabaseAdmin:{rpc:async(name:string) =>
    name === 'platform_server_user_workspaces'
      ? {data:[{tenant_id:'tenant',role:'owner',is_primary:true}],error:null}
      : {data:null,error:{message:'career_strategy_incomplete_for_approval',code:'P0001',details:null,hint:null}}
  }},error:null};
  const response = await handler.fetch(new Request('https://example.com', {method:'POST',body:JSON.stringify({action:'career_strategy_approve',tenant_id:'tenant',player_id:'player'})}));
  assert.equal(response.status,400);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
  const body = await response.json();
  assert.equal(body.code,'career_strategy_incomplete_for_approval');
  assert.match(body.error,/preferred.*fallback/i);
});

test('a career approval awaiting player confirmation returns a recoverable conflict', async () => {
  (globalThis as any).agencyErrorTestContext = {data:{userClaims:{sub:'actor'},supabaseAdmin:{rpc:async(name:string) =>
    name === 'platform_server_user_workspaces'
      ? {data:[{tenant_id:'tenant',role:'owner',is_primary:true}],error:null}
      : {data:null,error:{message:'player_confirmation_required_before_approval',code:'P0001',details:null,hint:null}}
  }},error:null};
  const response = await handler.fetch(new Request('https://example.com', {method:'POST',body:JSON.stringify({action:'career_strategy_approve',tenant_id:'tenant',player_id:'player'})}));
  assert.equal(response.status,409);
  const body = await response.json();
  assert.equal(body.code,'player_confirmation_required_before_approval');
  assert.match(body.error,/record.*player.*confirmation/i);
});

for (const fixture of [
  {name:'incomplete draft',confirmation:'unconfirmed',strategy:{objective:'Earn a first-team role',next_checkpoint:'Speak with the coach',notes:'Keep these notes',player_priorities:{playing_time:5}},expected:'define_career_strategy',steps:['save_career_strategy']},
  {name:'complete unconfirmed draft',confirmation:'unconfirmed',strategy:{objective:'Earn a first-team role',preferred_pathway:'Progress at the current club',fallback_pathway:'Review a loan',next_checkpoint:'Speak with the coach'},expected:'confirm_strategy_with_player',steps:['record_player_confirmation']},
  {name:'complete confirmed draft',confirmation:'confirmed',strategy:{objective:'Earn a first-team role',preferred_pathway:'Progress at the current club',fallback_pathway:'Review a loan',next_checkpoint:'Speak with the coach'},expected:'complete_strategy_approval',steps:['approve_career_strategy']},
]) {
  test(`career preparation routes a ${fixture.name} from the saved record`, async () => {
    (globalThis as any).agencyErrorTestContext = {data:{userClaims:{sub:'actor'},supabaseAdmin:{rpc:async(name:string) => {
      if(name==='platform_server_user_workspaces')return {data:[{tenant_id:'tenant',role:'owner',is_primary:true}],error:null};
      if(name==='platform_server_prepare_career_strategy_action')return {data:{status:'needs_human_input',player_id:'player',strategy_action_type:'complete_strategy_approval',allowed_next_steps:['record_player_confirmation','approve_career_strategy']},error:null};
      if(name==='platform_server_player_career_strategy')return {data:{state:'draft',confirmation_state:fixture.confirmation,strategy:{id:'strategy',strategy:fixture.strategy,review_due_at:'2026-10-21'}},error:null};
      throw new Error(`Unexpected RPC: ${name}`);
    }}},error:null};
    const response=await handler.fetch(new Request('https://example.com',{method:'POST',body:JSON.stringify({action:'career_strategy_action_prepare',tenant_id:'tenant',player_id:'player'})}));
    assert.equal(response.status,200);
    const {proposal}=await response.json();
    assert.equal(proposal.strategy_action_type,fixture.expected);
    assert.deepEqual(proposal.allowed_next_steps,fixture.steps);
    assert.deepEqual(proposal.career_strategy.strategy.strategy,fixture.strategy);
    assert.equal(proposal.suggested_input.career_objective,'Earn a first-team role');
  });
}

test('a successful asynchronous career approval still returns the saved response', async () => {
  (globalThis as any).agencyErrorTestContext={data:{userClaims:{sub:'actor'},supabaseAdmin:{rpc:async(name:string)=>
    name==='platform_server_user_workspaces'
      ? {data:[{tenant_id:'tenant',role:'owner',is_primary:true}],error:null}
      : {data:{state:'approved',confirmation_state:'confirmed'},error:null}
  }},error:null};
  const response=await handler.fetch(new Request('https://example.com',{method:'POST',body:JSON.stringify({action:'career_strategy_approve',tenant_id:'tenant',player_id:'player'})}));
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).career_strategy,{state:'approved',confirmation_state:'confirmed'});
});
