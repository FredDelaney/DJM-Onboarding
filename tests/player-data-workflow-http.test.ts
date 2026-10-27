import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {test,beforeEach,after} from 'node:test';
const shared=Buffer.from(stripTypeScriptTypes(readFileSync('supabase/functions/_shared/football-data/player-data-workflow.ts','utf8'))).toString('base64');
const visibilityShared=Buffer.from(stripTypeScriptTypes(readFileSync('supabase/functions/_shared/public-profile-visibility.ts','utf8'))).toString('base64');
const staffShared=Buffer.from(stripTypeScriptTypes(readFileSync('supabase/functions/_shared/staff-read-contract.ts','utf8'))).toString('base64');
const statShared=Buffer.from(stripTypeScriptTypes(readFileSync('supabase/functions/_shared/profile-stat-evidence.ts','utf8'))).toString('base64');
const evidenceShared=Buffer.from(stripTypeScriptTypes(readFileSync('supabase/functions/_shared/player-profile-preparation.ts','utf8').replace('"./football-data/player-data-workflow.ts"','"data:text/javascript;base64,'+shared+'"'))).toString('base64');
const source=readFileSync('supabase/functions/agency-os/index.ts','utf8')
 .replace('"../_shared/player-profile-preparation.ts"','"data:text/javascript;base64,'+evidenceShared+'"')
 .replace(/^import .*player-profile-ai\.ts";$/m,'const selectPlayerProfilePresentation = () => { throw new Error("outside this test"); };')
 .replace(/^import .*player-profile-text-improvement\.ts";$/m,'const suggestPlayerProfileTextImprovement = () => { throw new Error("outside this test"); };')
 .replace(/^import .*player-context-ai\.ts";$/m,'const researchPlayerContext = (...args) => { globalThis.contextResearchCalls.push(args); if(globalThis.contextResearchThrows)throw new Error("Research transport failed"); return globalThis.contextResearchResult; };')
 .replace(/^import .*ai-router\.ts";$/m,'const selectAiRoute = () => { throw new Error("outside this test"); };')
 .replace('"../_shared/staff-read-contract.ts"','"data:text/javascript;base64,'+staffShared+'"')
 .replace('"../_shared/profile-stat-evidence.ts"','"data:text/javascript;base64,'+statShared+'"')
 .replace('import "jsr:@supabase/functions-js/edge-runtime.d.ts";','')
 .replace('import { createSupabaseContext } from "npm:@supabase/server@1.6.0";','const createSupabaseContext = () => globalThis.playerDataHttpContext;')
 .replace('"../_shared/football-data/player-data-workflow.ts"','"data:text/javascript;base64,'+shared+'"');
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const originalFetch=globalThis.fetch;
let calls:any[]=[],background:Promise<any>[]=[],writes:any[]=[],careerRows:any[]=[],dispatch=true,role='agent',allowed=true,published=true;
let cvSettings:any={key_stats:[]};
let publicHandler:any;let contextReview:any=null,contextDispatch=true;
(globalThis as any).Deno={serve:(callback:any)=>{publicHandler=callback;}};
const publicSource=readFileSync('supabase/functions/player-profile-public/index.ts','utf8')
 .replace('import "jsr:@supabase/functions-js/edge-runtime.d.ts";','')
 .replace('import { createClient } from "jsr:@supabase/supabase-js@2";','const createClient = () => globalThis.playerDataHttpContext.data.supabaseAdmin;')
 .replace('"../_shared/public-profile-visibility.ts"','"data:text/javascript;base64,'+visibilityShared+'"')
 .replace('"../_shared/profile-stat-evidence.ts"','"data:text/javascript;base64,'+statShared+'"')
 .replace('"../_shared/football-data/player-data-workflow.ts"','"data:text/javascript;base64,'+shared+'"');
await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(publicSource)).toString('base64'));
const job={id:'40000000-0000-4000-8000-000000000001',status:'queued'};
const player={id:'player',tenant_id:'tenant',primary_position:'Centre back',current_season_label:'2026/27',current_club:'Example II',current_league:'Regional League',verification_status:'verified',verified_at:'2026-10-01T12:00:00Z'};
beforeEach(()=>{
 calls=[];background=[];writes=[];careerRows=[];dispatch=true;contextReview=null;contextDispatch=true;
 (globalThis as any).contextResearchCalls=[];(globalThis as any).contextResearchThrows=false;(globalThis as any).contextResearchResult={ok:true,confidence:0.95,reason:"Explicit source evidence",fields:{current_club:"New II"},field_sources:{current_club:[{url:"https://league.example/player",title:"League"}]}};role='agent';allowed=true;published=true;player.verification_status='verified';
 cvSettings={key_stats:[]};
 (globalThis as any).Deno={env:{get:(key:string)=>key==='SUPABASE_URL'?'https://example.supabase.co':'fake-service'}};
 (globalThis as any).EdgeRuntime={waitUntil:(promise:Promise<any>)=>background.push(promise)};
 (globalThis as any).playerDataHttpContext={data:{userClaims:{sub:'actor',email:'agent@example.test'},supabaseAdmin:{
  rpc:async(name:string,args:any)=>{calls.push({name,args});if(name==='platform_server_stage_player_details_review')contextReview={id:args.p_request_id,status:args.p_confidence?'needs_review':'failed',fields:Object.entries(args.p_fields).map(([field,suggested])=>({id:'80000000-0000-4000-8000-000000000001',field,suggested,before:player[field as keyof typeof player]??null,decision:'pending',sources:args.p_sources[field]}))};return {data:name==='platform_server_player_details_review_status'?contextReview:name==='platform_server_request_player_details_review'?{id:job.id,dispatch:contextDispatch,status:'running'}:name==='platform_server_stage_player_details_review'?{review_id:job.id,status:contextReview.status}:name==='platform_server_review_player_details'?{ok:true,review_id:args.p_review_id,review:contextReview}:name==='platform_server_user_workspaces'?[{tenant_id:'tenant',role,is_primary:true}]:name==='platform_server_personal_home_commands'?{commands:[{command_id:'player_stats_review:review',source_type:'player',player_id:'player',command_type:'Player statistics suggested',actionability:{mode:'review_only',cta:'Review suggested figures'}}],player_reviews_has_more:true}:name==='get_push_scheduler_secret'?'fake-cron':name==='platform_server_request_player_stats_refresh'?{dispatch,job}:name==='platform_server_player_stats_refresh_status'?job:{ok:true,row:{}},error:null};},
  from:(table:string)=>{
   const query:any={select:()=>query,eq:()=>query,in:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>({data:table==='staff_player_access'?{player_id:'player',can_edit:true}:table==='players'?(allowed?{...player}:null):table==='player_public_profiles'?(published?{player_id:player.id,key_stats:[],hidden_sections:[],hide_market_value:true}:null):table==='player_cv_settings'?cvSettings:null,error:null}),update:(value:any)=>{writes.push({table,value});return query;},then:(resolve:any)=>Promise.resolve({data:table==='career_entries'?structuredClone(careerRows):[],error:null}).then(resolve)};
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
 assert.deepEqual(staff.profile.auto_key_stats,club.data.profile.key_stats.map(({label,value}:any)=>({label,value})),'Restricted staff retain their existing stat projection');
 assert.equal(staff.profile.auto_stats_meta.season_label,'2026/27');
 assert.deepEqual(club.data.profile.key_stats,[{label:'Apps',value:'8'},{label:'Starts',value:'5'},{label:'Minutes',value:'450'},{label:'Goals',value:'0'}].map(stat=>({...stat,season_label:'2026/27',club_name:'Example Reserves',league:'Regional League',checked_at:'2026-10-01T12:00:00Z'})));
 assert.equal(club.data.stats_meta.source_url,current.source_url);
});

test('actual publication carries only approved football evidence for selected historical figures',async()=>{
 role='owner';
 careerRows=[{id:'past',season_label:'2025',club_name:'Former FC',league:'Historical League',goals:0,source_name:'League report',source_url:'https://league.example/2025',source_reviewed_at:'2026-01-20T12:00:00Z',notes:'PRIVATE',expected_commission:123}];
 cvSettings={selected_stat_refs:['past:goals'],key_stats:[]};
 const response=await handler.fetch(request('player_profile_publish'));
 assert.equal(response.status,200,await response.text());
 const snapshot=calls.find(call=>call.name==='platform_server_publish_player_profile_snapshot')?.args.p_snapshot;
 assert.deepEqual(snapshot.key_stats,[{label:'Goals',value:'0',season_label:'2025',club_name:'Former FC',league:'Historical League',source_name:'League report',source_reviewed_at:'2026-01-20T12:00:00Z'}]);
 assert.equal(JSON.stringify(snapshot).includes('PRIVATE'),false);
 assert.equal(JSON.stringify(snapshot).includes('expected_commission'),false);
});

test('publication preserves custom scope and gives automatic figures their actual source period',async()=>{
 role='owner';
 careerRows=[{id:'current',season_label:'2026/27',club_name:'Example Reserves',league:'Regional League',goals:0,source_name:'Current report',source_url:'https://league.example/current',source_reviewed_at:'2026-10-01T12:00:00Z'}];
 cvSettings={key_stats:[{label:'Agency figure',value:'7'}]};
 let response=await handler.fetch(request('player_profile_publish'));
 assert.equal(response.status,200,await response.text());
 assert.deepEqual(calls.findLast(call=>call.name==='platform_server_publish_player_profile_snapshot')?.args.p_snapshot.key_stats,cvSettings.key_stats,'Custom figures are not attributed to the current evidence');
 cvSettings={key_stats:[],selected_stat_refs:[]};
 response=await handler.fetch(request('player_profile_publish'));
 assert.equal(response.status,200,await response.text());
 assert.deepEqual(calls.findLast(call=>call.name==='platform_server_publish_player_profile_snapshot')?.args.p_snapshot.key_stats,[{label:'Goals',value:'0',season_label:'2026/27',club_name:'Example Reserves',league:'Regional League',source_name:'Current report',checked_at:'2026-10-01T12:00:00Z'}]);
});
test('club reads cannot expose unpublished or unverified player data',async()=>{
 const read=()=>publicHandler(new Request('https://example.com',{method:'POST',body:JSON.stringify({slug:'dylan'})}));
 published=false;assert.equal((await (await read()).json()).data,null);
 published=true;player.verification_status='reviewing';assert.equal((await (await read()).json()).data,null);
});

test('pending research is recorded as needs_review with no applied fields or freshness',async()=>{
 globalThis.fetch=async(_url,options)=>{assert.equal(JSON.parse(String(options?.body)).review_request_id,job.id);return new Response(JSON.stringify({refresh_ok:true,ai:{review_id:'review',review_status:'needs_review',proposed_fields:['appearances']}}));};
 await handler.fetch(request());await Promise.all(background);
 const final=writes.find(write=>write.value.status==='needs_review');assert.ok(final);assert.equal(final.value.fresh_at,null);assert.deepEqual(final.value.summary.changed_fields,[]);
});
test('review actions use the trusted actor and tenant, with no caller actor override',async()=>{
 const r=await handler.fetch(request('player_data_review',{review_id:'review',decision:'edit',values:{goals:0},actor_user_id:'spoofed',p_tenant_id:'spoofed'}));assert.equal(r.status,200);
 const call=calls.find(c=>c.name==='platform_server_review_player_stats');assert.equal(call.args.p_actor_user_id,'actor');assert.equal(call.args.p_tenant_id,'tenant');assert.equal(call.args.p_review_id,'review');assert.deepEqual(call.args.p_values,{goals:0});
});
test('scouts cannot receive pending proposals or submit decisions',async()=>{
 role='scout';assert.equal((await handler.fetch(request('player_data_review',{review_id:'review',decision:'accept'}))).status,403);
 const r=await handler.fetch(request('player_data_status'));assert.equal((await r.json()).review,null);assert.ok(!calls.some(c=>c.name==='platform_server_player_stats_review_status'||c.name==='platform_server_review_player_stats'));
});

test('repeat rejected evidence is retained as rejected with no freshness claim',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({refresh_ok:true,ai:{review_id:'review',review_status:'rejected'}}));
 await handler.fetch(request());await Promise.all(background);
 const final=writes.find(write=>write.value.status==='rejected');assert.ok(final);assert.equal(final.value.fresh_at,null);assert.deepEqual(final.value.summary.changed_fields,[]);
});

test('Home keeps sourced reviews read-only, scopes the trusted actor and exposes bounded-review guidance',async()=>{
 const response=await handler.fetch(request('home_focus',{user_id:'spoofed',p_user_id:'spoofed'}));assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.home.attention.player_reviews_has_more,true);assert.equal(body.home.attention.delegable.length,0);assert.equal(body.home.attention.confirm.length,0);assert.equal(body.home.attention.judgement[0].command_type,'Player statistics suggested');
 const call=calls.find(c=>c.name==='platform_server_personal_home_commands');assert.equal(call.args.p_user_id,'actor');assert.equal(call.args.p_tenant_id,'tenant');assert.equal(background.length,0);assert.equal(writes.length,0);
});


test('material research claims one job and stages only server research with trusted actor and baseline',async()=>{
 const response=await handler.fetch(request('player_context_research',{fields:{current_club:'Forged FC'},sources:[{url:'https://forged.example'}],p_actor_user_id:'attacker',p_expected:{current_club:'Forged baseline'}}));assert.equal(response.status,200);
 const claim=calls.find(c=>c.name==='platform_server_request_player_details_review');assert.equal(claim.args.p_actor_user_id,'actor');assert.equal(claim.args.p_tenant_id,'tenant');assert.equal(claim.args.p_request_id,job.id);
 const staged=calls.find(c=>c.name==='platform_server_stage_player_details_review');assert.equal(staged.args.p_fields.current_club,'New II');assert.equal(staged.args.p_expected.current_club,'Example II');assert.equal(staged.args.p_sources.current_club[0].url,'https://league.example/player');assert.equal(staged.args.p_request_id,job.id);assert.equal(writes.length,0);
});
test('pending or already claimed research does not start another paid check',async()=>{
 contextReview={id:job.id,status:'needs_review',fields:[{field:'current_club',suggested:'Saved FC',decision:'pending',sources:[]}]};await handler.fetch(request('player_context_research'));assert.equal((globalThis as any).contextResearchCalls.length,0);assert.ok(!calls.some(c=>c.name==='platform_server_request_player_details_review'));
 calls=[];contextReview={id:job.id,status:'running',fields:[]};contextDispatch=false;await handler.fetch(request('player_context_research'));assert.equal((globalThis as any).contextResearchCalls.length,0);assert.ok(calls.some(c=>c.name==='platform_server_request_player_details_review'));
});
test('material review polling is read-only and scouts receive no proposal',async()=>{
 contextReview={id:job.id,status:'needs_review',fields:[]};await handler.fetch(request('player_context_status'));assert.equal((globalThis as any).contextResearchCalls.length,0);assert.ok(!calls.some(c=>/request|stage/.test(c.name)));
 role='scout';calls=[];const response=await handler.fetch(request('player_context_status'));assert.equal((await response.json()).review,null);assert.ok(!calls.some(c=>c.name==='platform_server_player_details_review_status'));
 assert.equal((await handler.fetch(request('player_context_review',{review_id:job.id,decisions:[]}))).status,403);
});
test('preparation can apply only a persisted review and cannot supply evidence or actor',async()=>{
 contextReview={id:job.id,status:'needs_review',fields:[{id:'80000000-0000-4000-8000-000000000001',field:'current_club',suggested:'Saved FC',decision:'pending'}]};
 assert.equal((await handler.fetch(request('player_context_apply',{fields:{current_club:'Old unsaved FC'}}))).status,409);
 assert.equal((await handler.fetch(request('player_context_apply',{review_id:job.id,fields:{next_action:'Forged task'}}))).status,409);
 const response=await handler.fetch(request('player_context_apply',{review_id:job.id,fields:{current_club:'Corrected FC'},sources:[{url:'https://forged.example'}],actor_user_id:'attacker'}));assert.equal(response.status,200);
 const reviewed=calls.find(c=>c.name==='platform_server_review_player_details');assert.equal(reviewed.args.p_actor_user_id,'actor');assert.equal(reviewed.args.p_tenant_id,'tenant');assert.deepEqual(reviewed.args.p_decisions,[{id:'80000000-0000-4000-8000-000000000001',decision:'edit',value:'Corrected FC'}]);assert.equal(reviewed.args.p_sources,undefined);assert.equal(writes.length,0);
});
test('a research exception closes its claim without changing canonical fields or retrying research',async()=>{
 (globalThis as any).contextResearchThrows=true;const response=await handler.fetch(request('player_context_research'));assert.equal(response.status,503);assert.equal((globalThis as any).contextResearchCalls.length,1);assert.ok(calls.some(c=>c.name==='platform_server_stage_player_details_review'&&c.args.p_confidence===0));assert.equal(writes.length,0);
});

test('a preparation retry retains the persisted suggestion id after an unconfirmed successful decision',async()=>{
 contextReview={id:job.id,status:'applied',fields:[{id:'80000000-0000-4000-8000-000000000001',field:'current_club',suggested:'Saved FC',decision:'accepted',applied_value:'Corrected FC'}]};
 const response=await handler.fetch(request('player_context_apply',{review_id:job.id,fields:{current_club:'Corrected FC'}}));assert.equal(response.status,200);assert.deepEqual(calls.find(c=>c.name==='platform_server_review_player_details')?.args.p_decisions,[{id:'80000000-0000-4000-8000-000000000001',decision:'edit',value:'Corrected FC'}]);
});


test('plain PostgreSQL review conflicts return recoverable user messages without database details',async()=>{
 const admin=(globalThis as any).playerDataHttpContext.data.supabaseAdmin;
 const rpc=admin.rpc;
 for(const [action,message,code] of [
  ['player_data_review','player_stats_context_changed','player_stats_context_changed'],
  ['player_data_review','player_stats_review_already_resolved','player_stats_review_already_resolved'],
  ['player_context_review','Player details changed. Check the record again.','player_details_review_conflict'],
  ['player_context_review','Player identity changed. Check the record again.','player_details_review_conflict'],
  ['player_context_review','This detail was already reviewed. Reload the record.','player_details_review_conflict']
 ]){
  admin.rpc=async(name:string,args:any)=>name==='platform_server_review_player_stats'||name==='platform_server_review_player_details'?{data:null,error:{code:'P0001',message,details:'private database detail'}}:rpc(name,args);
  const response=await handler.fetch(request(action,{review_id:job.id,decision:'accept',decisions:[{id:'field',decision:'accept'}]}));
  assert.equal(response.status,409);const result=await response.json();assert.equal(result.code,code);
  assert.match(result.error,/Reload|Check|Reload/);assert.ok(!JSON.stringify(result).includes('private database detail'));assert.notEqual(result.error,'Agency OS request failed');
 }
});
