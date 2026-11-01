import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {readAgencyDashboardSnapshot} from '../supabase/functions/_shared/agency-dashboard-snapshot.ts';

const read=(p:string)=>readFileSync(p,'utf8');
const PLAYER='11111111-1111-4111-8111-111111111111';
const USER='22222222-2222-4222-8222-222222222222';
const TENANT='33333333-3333-4333-8333-333333333333';
const query=(data:any[]):any=>new Proxy({}, {get(_obj,key){
  if(key==='then')return (ok:(value:unknown)=>void)=>Promise.resolve({data,error:null}).then(ok);
  return ()=>query(data);
}});
const players=[{id:PLAYER,first_name:'Test',last_name:'Player',primary_staff_user_id:USER,contract_expiry:null,date_of_birth:null}];
const expiry=new Date(Date.now()+20*86400000).toISOString().slice(0,10);
const agreements=[{id:'44444444-4444-4444-8444-444444444444',player_id:PLAYER,agreement_type:'representation',status:'active',start_date:'2026-01-01',end_date:expiry}];
const client={from:(table:string)=>query(table==='players'?players:table==='player_agreements'?agreements:[]),schema:(_schema:string)=>({from:(_table:string)=>query([])})};
const context={client,tenantId:TENANT,userId:USER,role:'owner',scope:'agency' as const,localDate:'2026-11-01',timeZone:'Europe/Rome',basePath:'/workspace/qa'};

test('Signed agency agreements appear in upcoming events without manufacturing fixtures',async()=>{
  const snapshot=await readAgencyDashboardSnapshot(context);
  assert.equal(snapshot.agencyContractsExpiring90Days,1);
  assert.ok(snapshot.upcomingEvents.some((event:any)=>event.type==='agency-contract'&&event.label==='Test Player · Agency contract'&&event.date===expiry));
  assert.equal(snapshot.fixturesToday,null);
});
test('Other tenants and unauthorised agency scope are never accepted by shortcut',async()=>{
  await assert.rejects(readAgencyDashboardSnapshot({...context,role:'agent',scope:'agency'}),/dashboard_agency_access_denied/);
  const reader=read('supabase/functions/_shared/agency-dashboard-snapshot.ts');
  assert.match(reader,/\.in\('player_id',playerIds\)/);
  assert.match(reader,/\.eq\('tenant_id',tenantId\)/);
});
test('Calendar date picker works with snapshot date, authenticated refresh and existing task route',()=>{
  const ui=read('components/AgencyDashboardReference.tsx');
  const connected=read('components/AgencyDashboardConnected.tsx');
  const shell=read('components/AgencyOperatingWorkspace.tsx');
  assert.match(ui,/aria-label="Choose fixture date"/);
  assert.match(ui,/onDaySelect\(event\.currentTarget\.value\)/);
  assert.match(ui,/create=task/);
  assert.match(ui,/onCreate\('player'\)/);
  assert.match(ui,/onCreate\('club_need'\)/);
  assert.match(connected,/verifiedDay/);
  assert.match(connected,/refreshKey/);
  assert.match(shell,/refreshKey=\{recordRefreshRevision\}/);
  assert.match(shell,/setRecordRefreshRevision\(value=>value\+1\)/);
});
test('Reference visual hierarchy is kept with ReDream branding and honest missing data',()=>{
  const view=read('components/AgencyDashboardReference.tsx');
  const css=read('components/AgencyDashboardReference.module.css');
  assert.match(view,/Club Requests/);assert.match(view,/Upcoming Events/);assert.match(view,/Recent Activity/);
  assert.match(view,/No fixtures recorded for this day/);
  assert.match(view,/Awaiting verified data/);
  assert.match(css,/SCREENSHOT-FIDELITY-V2/);
  assert.doesNotMatch(view,/app\.athlivo|mockFixtures|fakePlayers/);
});
