import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {readAgencyDashboardSnapshot} from '../supabase/functions/_shared/agency-dashboard-snapshot.ts';

const PLAYER='11111111-1111-4111-8111-111111111111';
const USER='22222222-2222-4222-8222-222222222222';
const TENANT='33333333-3333-4333-8333-333333333333';
const rows=(data:any[])=>(new Proxy({},{get(_target,key){
  if(key==='then')return (ok:(result:any)=>void)=>Promise.resolve({data,error:null}).then(ok);
  return ()=>rows(data);
}}));
const audit=[{id:'audit-1',actor_user_id:USER,entity_id:PLAYER,action:'platform.agency.player_created',entity_type:'player',occurred_at:'2026-10-31T10:00:00Z'}];
const player=[{id:PLAYER,first_name:'Example',last_name:'Player',primary_staff_user_id:null,contract_expiry:null,date_of_birth:null}];
const client={from:(table:string)=>rows(table==='players'?player:[]),schema:(_schema:string)=>({from:(_table:string)=>rows([])}),rpc:(_name:string,args:Record<string,unknown>)=>Promise.resolve({data:args.p_scope==='agency'?audit:audit.filter(row=>row.actor_user_id===args.p_actor_user_id),error:null})};
const context={client,tenantId:TENANT,userId:USER,role:'owner',scope:'agency' as const,localDate:'2026-10-31',timeZone:'Europe/Rome',basePath:'/workspace/djm'};
test('Activity names and links are grounded in authorised player records',async()=>{
  const snapshot=await readAgencyDashboardSnapshot(context);
  assert.equal(snapshot.recentActivity[0]?.title,'Example Player added as a new player');
  assert.equal(snapshot.recentActivity[0]?.href,`/workspace/djm?view=players&player=${PLAYER}`);
});
test('Me scope does not infer player access from an audit event',async()=>{
  const snapshot=await readAgencyDashboardSnapshot({...context,scope:'me'});
  assert.doesNotMatch(snapshot.recentActivity[0]?.title||'',/Example Player/);
  assert.equal(snapshot.recentActivity[0]?.href,undefined);
});
test('Dashboard preserves honest unknown values and timezone-aware dates',()=>{
  const view=readFileSync('components/AgencyDashboardReference.tsx','utf8');
  const connected=readFileSync('components/AgencyDashboardConnected.tsx','utf8');
  assert.match(view,/Awaiting verified data/);
  assert.match(view,/readableActivityDate/);
  assert.match(connected,/todayInZone/);
  assert.doesNotMatch(view,/snapshot\.errors\?\.counts\?'–'/);
});
