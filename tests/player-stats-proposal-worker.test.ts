import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {test,beforeEach,after} from 'node:test';
// Execute the actual worker HTTP handler; replace only provider/database transport.
const shared=Buffer.from(stripTypeScriptTypes(readFileSync('supabase/functions/_shared/football-data/player-data-workflow.ts','utf8'))).toString('base64');
const source=readFileSync('supabase/functions/refresh-player-stats-ai-worker/index.ts','utf8')
 .replace('import "jsr:@supabase/functions-js/edge-runtime.d.ts";','')
 .replace('import { createClient } from "jsr:@supabase/supabase-js@2";','const createClient=()=>globalThis.statsReviewDb;')
 .replace('"../_shared/football-data/player-data-workflow.ts"','"data:text/javascript;base64,'+shared+'"');
let handler:(req:Request)=>Promise<Response>;
(globalThis as any).Deno={serve:(callback:any)=>{handler=callback;}};
await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const originalFetch=globalThis.fetch;
const player={id:'player',first_name:'Recorded',last_name:'Player',current_club:'Example II',current_season_label:'2026/27',current_league:'Regional League',current_country:'NZ'};
const baseline={id:'career',season_label:'2026/27',club_name:'Example Reserves',league:'Regional League',country:'NZ',appearances:8,starts:5,minutes:450,goals:0,assists:null,updated_at:'2026-10-01T12:00:00Z',source_reviewed_at:'2026-10-01T12:00:00Z'};
let calls:any[],writes:any[],candidate:any,providerSources:any[],stageError:any;
beforeEach(()=>{
 calls=[];writes=[];stageError=null;
 providerSources=[{url:'https://league.example/player',title:'Official league'},{url:'https://club.example/player',title:'Club'}];
 candidate={...baseline,appearances:9,minutes:540,source_urls:providerSources.map(s=>s.url)};
 (globalThis as any).Deno.env={get:(key:string)=>key==='SUPABASE_URL'?'https://synthetic.supabase.co':key==='OPENAI_STATS_MODEL'?'synthetic-model':'synthetic-secret'};
 (globalThis as any).statsReviewDb={
  rpc:async(name:string,args:any)=>{calls.push({name,args});return {data:name==='get_push_scheduler_secret'?'synthetic-secret':{review_id:'review',status:'needs_review'},error:name==='platform_server_stage_player_stats_review'?stageError:null};},
  from:(table:string)=>{
   const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:player,error:null}),
    insert:(values:any)=>{writes.push({table,operation:'insert',values});return q;},update:(values:any)=>{writes.push({table,operation:'update',values});return q;},
    then:(resolve:any)=>Promise.resolve({data:table==='career_entries'?[structuredClone(baseline)]:[],error:null}).then(resolve)};
   return q;
  }
 };
 globalThis.fetch=async()=>new Response(JSON.stringify({output:[{type:'web_search_call',action:{sources:providerSources}},{content:[{type:'output_text',text:JSON.stringify({identity_match:true,confidence:0.96,row:candidate,reason:'Two matching sources'})}]}]}));
});
after(()=>{globalThis.fetch=originalFetch;});
const request=(body:any={player_id:'player',review_request_id:'request'},secret='synthetic-secret')=>new Request('https://synthetic.supabase.co',{method:'POST',headers:{'x-djm-cron':secret},body:JSON.stringify(body)});
test('actual worker stages evidenced proposals against the original revision without writing canonical statistics',async()=>{
 const result=await (await handler(request())).json();assert.equal(result.refresh_ok,true);assert.equal(result.ai.review_status,'needs_review');assert.equal(result.ai.review_id,'review');assert.deepEqual(result.ai.fields_filled,[]);assert.equal(result.current_row.appearances,8);
 const call=calls.find(c=>c.name==='platform_server_stage_player_stats_review');assert.equal(call.args.p_expected_updated_at,baseline.updated_at);assert.equal(call.args.p_request_id,'request');assert.equal(call.args.p_values.goals,0);assert.equal(call.args.p_values.assists,null);assert.equal(call.args.p_values.appearances,9);assert.equal(call.args.p_context.club_name,'Example Reserves');assert.equal(call.args.p_expected_context.club_name,'Example II');assert.deepEqual(call.args.p_sources,providerSources);
 assert.deepEqual(writes,[],'No canonical DML or fake applied refresh log');
});
test('invented source URLs, one host and another competition cannot stage',async()=>{
 for(const change of [()=>{candidate.source_urls=['https://invented.example/player',providerSources[0].url];},()=>{providerSources[1]={url:'https://www.league.example/other',title:'Same host'};candidate.source_urls=providerSources.map(s=>s.url);},()=>{candidate.league='Cup';}]){
  change();const result=await (await handler(request())).json();assert.equal(result.refresh_ok,false);
  assert.ok(!calls.some(c=>c.name==='platform_server_stage_player_stats_review'));assert.ok(!writes.some(w=>w.table==='career_entries'));
 }
});
test('concurrent database conflict returns a recoverable failure with original figures',async()=>{
 stageError=new Error('player_stats_revision_conflict');
 const result=await (await handler(request())).json();assert.equal(result.refresh_ok,false);assert.equal(result.current_row.appearances,8);assert.ok(!writes.some(w=>w.table==='career_entries'));
});
test('unchanged evidence retains recorded values without opening another review',async()=>{
 candidate={...candidate,appearances:7,minutes:440};
 const result=await (await handler(request())).json();assert.equal(result.refresh_ok,true);assert.deepEqual(result.ai.fields_filled,[]);assert.ok(!calls.some(c=>c.name==='platform_server_stage_player_stats_review'));
 const log=writes.find(w=>w.table==='player_source_refreshes');assert.equal(log.values.accepted_count,0);
});
test('worker authentication remains mandatory',async()=>{assert.equal((await handler(request(undefined,'wrong'))).status,401);assert.equal(writes.length,0);});
