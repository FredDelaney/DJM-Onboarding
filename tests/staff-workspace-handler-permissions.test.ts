import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { restrictedPlayerProfile, restrictedClubAccount } from '../supabase/functions/_shared/staff-read-contract.ts';

function fixture(file='agency-os', role='agent', canEdit=false, assigned=true, multiple=false) {
  const calls: Array<{name:string; args?:any}> = [];
  const workspaces = [{tenant_id:'own-tenant',player_id:'own-player',role,is_primary:true}, ...(multiple?[{tenant_id:'second-tenant',role:'scout'}]:[])];
  const tables: Record<string, any[]> = {
    players: [{id:'own-player',tenant_id:'own-tenant',archived_at:null,football_status:'active',first_name:'Recorded',last_name:'Player'},
      {id:'archived-player',tenant_id:'own-tenant',archived_at:'2026-10-01',football_status:'active'},
      {id:'foreign-player',tenant_id:'foreign-tenant',archived_at:null,football_status:'active'}],
    staff_player_access: assigned?[{player_id:'own-player',staff_user_id:'trusted-user',can_edit:canEdit}]:[],
    organisations:[{id:'own-club',tenant_id:'own-tenant',name:'Recorded Club',country:'NZ',organisation_type:'club'}],
  };
  const rpc = async (name:string,args:any={}) => {
    calls.push({name,args});
    const data = name==='platform_server_staff_club_identity'?{club:{id:'club',name:'Recorded Club',country:'NZ'},access:{restricted:true}}:
   name==='platform_server_user_workspaces'?workspaces:
      name==='platform_server_player_workspaces'?{workspaces}:
      name==='platform_server_personal_home_commands'?{commands:[],status:'normal'}:
      {private:'SECRET_COMMERCIAL',args};
    return {data,error:null};
  };
  const from = (table:string) => {
    calls.push({name:table});
    const conditions:Array<[string,unknown]>=[];
    let values:any=null, operation='', single=false;
    const result=()=>{
      let rows=(tables[table]||[]).filter(row=>conditions.every(([field,value])=>row[field]===value));
      if(operation) calls.push({name:'write:'+table,args:{operation,values,conditions}});
      if(operation==='update') rows=rows.map(row=>({...row,...values}));
      if(operation==='insert') rows=[{id:'new-video',...values}];
      return {data:single?rows[0]||null:rows,error:null};
    };
    const b:any={select:()=>b,eq:(field:string,value:unknown)=>{conditions.push([field,value]);return b;},
      update:(v:any)=>{operation='update';values=v;return b;},insert:(v:any)=>{operation='insert';values=v;return b;},
      delete:()=>{operation='delete';return b;},order:()=>b,limit:()=>b,
      maybeSingle:()=>{single=true;return Promise.resolve(result());},single:()=>{single=true;return Promise.resolve(result());},
      then:(yes:any,no:any)=>Promise.resolve(result()).then(yes,no)};
    return b;
  };
  const source=readFileSync('supabase/functions/'+file+'/index.ts','utf8').replace(/^import .*;\r?$/gm,'');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const build=new Function('createSupabaseContext','selectCurrentSeasonEvidence','restrictedPlayerProfile','restrictedClubAccount','const exports={};'+code+';return exports.default;');
  const handler=build(async()=>({data:{userClaims:{sub:'trusted-user'},supabaseAdmin:{rpc,from}},error:null}),()=>null,restrictedPlayerProfile,restrictedClubAccount);
  return {calls,call:async(action:string, extra:any={})=>{
    const response=await handler.fetch(new Request('https://test.example.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,tenant_id:'own-tenant',player_id:'own-player',organisation_id:'own-club',...extra})}));
    return {status:response.status,body:await response.json()};
  }};
}

test('explicit unknown workspace is rejected by every Edge entry before any read or write',async()=>{
  for(const file of ['agency-os','agency-market','player-os']){
    const f=fixture(file,'owner');
    const r=await f.call(file==='agency-market'?'market_execution':'home',{tenant_id:'foreign-tenant',user_id:'owner'});
    assert.equal(r.status,403,file);
    assert.equal(f.calls.length,1,'Only trusted workspace discovery may run');
  }
});
test('omitted, primary and explicit authorized workspace selection still work',async()=>{
  assert.equal((await fixture('agency-os','owner').call('home_focus',{tenant_id:undefined})).status,200);
  assert.equal((await fixture('agency-os','owner',false,true,true).call('home_focus',{tenant_id:undefined})).status,200);
  assert.equal((await fixture('player-os','owner').call('home',{tenant_id:undefined})).status,200);
  assert.equal((await fixture('player-os','owner',false,true,true).call('home',{tenant_id:undefined})).status,409);
});
test('raw internal aliases are denied before privileged retrieval for each restricted role',async()=>{
  const actions=['home','brief','player_workspace','player_intelligence','player_service_card','player_value_proof','career_strategy','career_alignment','revenue_command','deal_portfolio','club_accounts','demand_control_fast','player_review_pack','player_owner_candidates','deal_war_room','deal_policy_set'];
  for(const role of ['scout','agent','operations']) for(const action of actions) {
    const f=fixture('agency-os',role,true,true);
    assert.equal((await f.call(action,{deal_room_id:'deal',user_id:'owner',p_user_id:'owner'})).status,403,role+':'+action);
    assert.equal(f.calls.length,1,role+':'+action+' must not retrieve privileged context');
  }
});
test('profile publication, contract verification and private CV settings require administrators',async()=>{
  for(const action of ['player_profile_save','player_profile_verify','player_profile_publish','player_profile_unpublish','player_profile_share_create','player_profile_share_revoke']){
    const f=fixture('agency-os','agent',true);
    assert.equal((await f.call(action)).status,403,action);
    assert.equal(f.calls.length,1,action);
  }
});
test('football writes require trusted assignment and can_edit before any mutation',async()=>{
  for(const role of ['agent','operations']) for(const [assigned,canEdit] of [[true,false],[false,true]]) for(const action of ['player_profile_transfermarkt_save','player_profile_video_add','player_profile_video_remove','player_data_save','player_data_refresh']){
    const f=fixture('agency-os',role,canEdit,assigned);
    assert.equal((await f.call(action,{url:'https://www.transfermarkt.com/example/profil/spieler/123',video_id:'video',staff_user_id:'owner',can_edit:true})).status,403,role+':'+action);
    assert.equal(f.calls.filter(c=>c.name.startsWith('write:')||c.name.startsWith('platform_server_')&&c.name!=='platform_server_user_workspaces').length,0);
    assert.ok(f.calls.some(c=>c.name==='staff_player_access'));
  }
});
test('assigned editors retain football updates; cross-tenant and archived targets are denied',async()=>{
  for(const role of ['agent','operations']){
    const f=fixture('agency-os',role,true);
    assert.equal((await f.call('player_profile_transfermarkt_save',{url:'https://www.transfermarkt.com/example/profil/spieler/123'})).status,200);
    assert.ok(f.calls.some(c=>c.name==='write:players'));
    for(const player_id of ['foreign-player','archived-player']) {
      const denied=fixture('agency-os',role,true);
      assert.equal((await denied.call('player_profile_transfermarkt_save',{player_id,url:''})).status,404);
      assert.ok(!denied.calls.some(c=>c.name.startsWith('write:')));
    }
  }
});
test('restricted club identity is read without loading commercial context',async()=>{
  const f=fixture('agency-os','scout');
  const r=await f.call('club_account');
  assert.equal(r.status,200);
  assert.equal(r.body.club.club.name,'Recorded Club');
  assert.doesNotMatch(JSON.stringify(r.body),/SECRET_/);
  assert.ok(!f.calls.some(c=>c.name==='platform_server_club_account'));
});
test('administrator raw context and explicitly permitted operations finance remain available',async()=>{
  assert.equal((await fixture('agency-os','admin').call('player_service_card')).status,200);
  assert.equal((await fixture('agency-os','operations').call('receivables_command')).status,200);
});
test('market tenant-wide commercial and pitch routes require administrators',async()=>{
  for(const role of ['scout','agent','operations']) {
    const f=fixture('agency-market',role);
    assert.equal((await f.call('market_execution')).status,403);
    assert.equal(f.calls.length,1);
  }
});
