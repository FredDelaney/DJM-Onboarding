import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {test,beforeEach,after} from 'node:test';
const shared=Buffer.from(stripTypeScriptTypes(readFileSync('supabase/functions/_shared/football-data/player-data-workflow.ts','utf8'))).toString('base64');
const staffShared=Buffer.from(stripTypeScriptTypes(readFileSync('supabase/functions/_shared/staff-read-contract.ts','utf8'))).toString('base64');
const source=readFileSync('supabase/functions/agency-os/index.ts','utf8')
 .replace('"../_shared/staff-read-contract.ts"','"data:text/javascript;base64,'+staffShared+'"')
 .replace('import "jsr:@supabase/functions-js/edge-runtime.d.ts";','')
 .replace('import { createSupabaseContext } from "npm:@supabase/server@1.6.0";','const createSupabaseContext = () => globalThis.playerDataHttpContext;')
 .replace('"../_shared/football-data/player-data-workflow.ts"','"data:text/javascript;base64,'+shared+'"');
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const originalFetch=globalThis.fetch;
let calls:any[]=[],background:Promise<any>[]=[],writes:any[]=[],careerRows:any[]=[],dispatch=true,role='agent',allowed=true,published=true;
let publicHandler:any;
(globalThis as any).Deno={serve:(callback:any)=>{publicHandler=callback;}};
const publicSource=readFileSync('supabase/functions/player-profile-public/index.ts','utf8')
 .replace('import "jsr:@supabase/functions-js/edge-runtime.d.ts";','')
 .replace('import { createClient } from "jsr:@supabase/supabase-js@2";','const createClient = () => globalThis.playerDataHttpContext.data.supabaseAdmin;')
 .replace('"../_shared/football-data/player-data-workflow.ts"','"data:text/javascript;base64,'+shared+'"');
await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(publicSource)).toString('base64'));
const job={id:'40000000-0000-4000-8000-000000000001',status:'queued'};
const player={id:'player',tenant_id:'tenant',current_season_label:'2026/27',current_club:'Example II',current_league:'Regional League',verification_status:'verified',verified_at:'2026-10-01T12:00:00Z'};
beforeEach(()=>{
 calls=[];background=[];writes=[];careerRows=[];dispatch=true;role='agent';allowed=true;published=true;player.verification_status='verified';
 (globalThis as any).Deno={env:{get:(key:string)=>key==='SUPABASE_URL'?'https://example.supabase.co':'fake-service'}};
 (globalThis as any).EdgeRuntime={waitUntil:(promise:Promise<any>)=>background.push(promise)};
 (globalThis as any).playerDataHttpContext={data:{userClaims:{sub:'actor'},supabaseAdmin:{
  rpc:async(name:string,args:any)=>{calls.push({name,args});return {data:name==='platform_server_user_workspaces'?[{tenant_id:'tenant',role,is_primary:true}]:name==='get_push_scheduler_secret'?'fake-cron':name==='platform_server_request_player_stats_refresh'?{dispatch,job}:name==='platform_server_player_stats_refresh_status'?job:{ok:true,row:{}},error:null};},
  from:(table:string)=>{
   const query:any={select:()=>query,eq:()=>query,in:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>({data:table==='staff_player_access'?{player_id:'player'}:table==='players'?(allowed?{...player}:null):table==='player_public_profiles'?(published?{player_id:player.id,key_stats:[]}:null):table==='player_cv_settings'?{key_stats:[]}:null,error:null}),update:(value:any)=>{writes.push({table,value});return query;},then:(resolve:any)=>Promise.resolve({data:table==='career_entries'?structuredClone(careerRows):[],error:null}).then(resolve)};
   return query;
  }
 }},error:null};
 globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,refresh_ok:true,current_data:true,ai:{fields_filled:['appearances']}}),{status:200});
});
after(()=>{globalThis.fetch=originalFetch;});
const request=(action='player_data_refresh',extra={})=>new Request('https://example.com',{method:'POST',body:JSON.stringify({action,tenant_id:'tenant',player_id:'player',request_id:job.id,...extra})});
test('an agency agent gets a persisted background job without waiting for research',async()=>{
 let release:(response:Response)=>void=()=>{};
 globalThis.fetch=()=>new Promise(resolve=>{release=resolve;});
 const response=await handler.fetch(request());
 assert.equal(response.status,202);assert.equal(background.length,1);
 assert.equal((await response.json()).job.id,job.id);
 await new Promise(resolve=>setImmediate(resolve));
 release(new Response(JSON.stringify({ok:true,refresh_ok:true,ai:{fields_filled:['appearances']}})));
 await Promise.all(background);
 assert.ok(writes.some(write=>write.value.status==='applied'));
 const claim=calls.find(call=>call.name==='platform_server_request_player_stats_refresh');
 assert.equal(claim.args.p_actor_user_id,'actor');assert.equal(claim.args.p_tenant_id,'tenant');
});
test('replayed requests never dispatch a second background worker',async()=>{
 dispatch=false;
 const response=await handler.fetch(request());assert.equal(response.status,202);assert.equal(background.length,0);
});
test('scout and foreign-player requests cannot reach refresh or save RPCs',async()=>{
 role='scout';assert.equal((await handler.fetch(request())).status,403);
 role='agent';allowed=false;assert.equal((await handler.fetch(request())).status,404);
 assert.equal((await handler.fetch(request('player_data_save'))).status,404);
 assert.ok(!calls.some(call=>call.name==='platform_server_request_player_stats_refresh'));
});
test('existing figures returned after worker failure are recorded as failed, without freshness',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,refresh_ok:false,current_data:true,ai:{timed_out:true}}));
 await handler.fetch(request());await Promise.all(background);
 const final=writes.find(write=>write.value.status==='failed');
 assert.ok(final);assert.equal(final.value.fresh_at,null);
});
test('status polling is scoped and never starts research',async()=>{
 const response=await handler.fetch(request('player_data_status'));assert.equal(response.status,200);assert.equal(background.length,0);
 const read=calls.find(call=>call.name==='platform_server_player_stats_refresh_status');assert.equal(read.args.p_tenant_id,'tenant');
});
test('context changes during research prevent a successful freshness claim',async()=>{
 await handler.fetch(request());player.current_club='Changed club';await Promise.all(background);
 assert.ok(writes.some(write=>write.value.status==='failed'));player.current_club='Example II';
});

test('the staff profile and published club profile select the same sourced reserve-season figures',async()=>{
 const current={season_label:'2026/27',club_name:'Example Reserves',league:'Regional League',appearances:8,starts:5,minutes:450,goals:0,assists:null,source_reviewed_at:'2026-10-01T12:00:00Z',source_url:'https://league.example/player'};
 careerRows=[{...current,club_name:'Example',appearances:30},{...current,season_label:'2025/26',appearances:21},current];
 const staff=await (await handler.fetch(request('player_profile_core'))).json();
 const club=await (await publicHandler(new Request('https://example.com',{method:'POST',body:JSON.stringify({slug:'dylan'})}))).json();
 assert.deepEqual(staff.profile.auto_key_stats,club.data.profile.key_stats);
 assert.deepEqual(club.data.profile.key_stats,[{label:'Apps',value:'8'},{label:'Starts',value:'5'},{label:'Minutes',value:'450'},{label:'Goals',value:'0'}]);
 assert.equal(club.data.stats_meta.source_url,current.source_url);
});
test('club reads cannot expose unpublished or unverified player data',async()=>{
 const read=()=>publicHandler(new Request('https://example.com',{method:'POST',body:JSON.stringify({slug:'dylan'})}));
 published=false;assert.equal((await (await read()).json()).data,null);
 published=true;player.verification_status='reviewing';assert.equal((await (await read()).json()).data,null);
});
