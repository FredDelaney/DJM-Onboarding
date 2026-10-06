import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import {restrictedPlayerProfile,restrictedClubAccount} from '../supabase/functions/_shared/staff-read-contract.ts';
const source=readFileSync('supabase/functions/agency-os/index.ts','utf8').replace(/^import .*;\r?$/gm,'');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function fixture(role:string,assigned=true){
 const calls:string[]=[];
 const workspace={tenant_id:'own-tenant',slug:'example',role,is_primary:true};
 const tables:Record<string,any[]>={
  players:[{id:'own-player',tenant_id:'own-tenant',user_id:'private-login',first_name:'Football',last_name:'Player',archived_at:null,football_status:'active',contract_status:'SECRET_CONTRACT',contract_expiry:'2039-01-01',agency_priority:'SECRET_PRIORITY',next_action:'SECRET_ACTION'},
   {id:'other-player',tenant_id:'other-tenant',first_name:'OTHER_TENANT'}],
  staff_player_access:assigned?[{player_id:'own-player',staff_user_id:'current-user',can_edit:false}]:[],
  career_entries:[{id:'career',player_id:'own-player',club_name:'Recorded FC',season_label:'2026/27',appearances:14,minutes:900,notes:'SECRET_NOTES',source_url:'https://evidence.example.test',source_reviewed_at:'2026-10-01'}],
  player_videos:[{id:'video',player_id:'own-player',title:'Recorded football',url:'https://video.example.test',private:'SECRET_VIDEO_EXTRA'}],
  player_cv_settings:[{player_id:'own-player',market_value_display:'SECRET_MARKET'}],
  player_public_profiles:[{player_id:'own-player',published:false}],
  player_source_refreshes:[],
  player_documents:[{player_id:'own-player',title:'SECRET_DOCUMENT',club_shareable:true}],
  club_share_links:[{player_id:'own-player',token:'SECRET_SHARE_TOKEN'}],
 };
 const rpc=async(name:string)=>{
  calls.push(name);
  const data=name==='platform_server_user_workspaces'?[workspace]:
   name==='platform_server_club_account'?{club:{id:'club',name:'Recorded Club',country:'NZ',private:'SECRET_CLUB_EXTRA'},commercial:{expected_commission:'SECRET_COMMISSION'},pursuits:[{player_name:'SECRET_UNASSIGNED'}]}:
   name==='platform_server_player_profile_context'?{deals:[{id:'deal',title:'SECRET_DEAL'}],clubs:[{id:'club',name:'Recorded Club'}]}:
   name==='platform_server_player_connected_activity'?{items:[{summary:'SECRET_MESSAGE'}]}:{};
  return {data,error:null};
 };
 const from=(table:string)=>{
  calls.push(table);const conditions:Array<[string,unknown]>=[];let single=false;
  const result=()=>{const rows=(tables[table]||[]).filter(row=>conditions.every(([field,value])=>row[field]===value));return {data:single?rows[0]||null:rows,error:null};};
  const builder:any={select:()=>builder,eq:(field:string,value:unknown)=>{conditions.push([field,value]);return builder;},order:()=>builder,limit:()=>builder,maybeSingle:()=>{single=true;return Promise.resolve(result());},then:(yes:any,no:any)=>Promise.resolve(result()).then(yes,no)};
  return builder;
 };
 const ctx={userClaims:{sub:'current-user'},supabaseAdmin:{from,rpc}};
 const build=new Function('createSupabaseContext','selectCurrentSeasonEvidence','restrictedPlayerProfile','restrictedClubAccount','const exports={};'+code+';return exports.default;');
 // The handler is executed; only external Supabase I/O and unrelated football refresh are replaced.
 const handler=build(async()=>({data:ctx,error:null}),()=>null,restrictedPlayerProfile,restrictedClubAccount);
 return {calls,call:async(action:string,player_id='own-player',extra={})=>{
  const response=await handler.fetch(new Request('https://fixture.example.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,player_id,organisation_id:'club',tenant_id:'own-tenant',...extra})}));
  return {status:response.status,body:await response.json()};
 }};
}
test('assigned staff profile endpoints cannot rehydrate internal fields or sharing tokens',async()=>{
 for(const role of ['scout','agent','operations']){
  const f=fixture(role);
  for(const action of ['player_profile_core','player_profile','player_profile_detail']){
   const response=await f.call(action,'own-player',{p_user_id:'owner-user',user_id:'owner-user'});
   assert.equal(response.status,200);assert.doesNotMatch(JSON.stringify(response.body),/SECRET_|private-login/);
   assert.equal((response.body.profile||response.body.detail).access.restricted,true);
   if(action!=='player_profile_detail'){assert.equal(response.body.profile.career[0].appearances,14);assert.equal(response.body.profile.career[0].source_url,'https://evidence.example.test');}
  }
  assert.ok(!f.calls.includes('club_share_links'));assert.ok(!f.calls.includes('player_documents'));assert.ok(!f.calls.includes('platform_server_player_connected_activity'));
 }
});
test('unassigned and cross-tenant profiles are denied even with forged body identity',async()=>{
 const f=fixture('scout',false);
 for(const action of ['player_profile_core','player_profile','player_profile_detail']){
  assert.equal((await f.call(action,'own-player',{user_id:'owner-user'})).status,403);
  assert.equal((await f.call(action,'other-player')).status,404);
 }
});
test('staff exact club reads return identity while administrators retain commercial detail',async()=>{
 for(const role of ['scout','agent','operations']){const response=await fixture(role).call('club_account');assert.equal(response.status,200);assert.equal(response.body.club.club.name,'Recorded Club');assert.equal(response.body.club.access.restricted,true);assert.doesNotMatch(JSON.stringify(response.body),/SECRET_/);}
 const owner=await fixture('owner').call('club_account');assert.equal(owner.status,200);assert.equal(owner.body.club.commercial.expected_commission,'SECRET_COMMISSION');
 const profile=await fixture('admin').call('player_profile_core');assert.equal(profile.body.profile.player.contract_status,'SECRET_CONTRACT');
});
