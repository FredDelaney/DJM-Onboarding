import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {readAgencyDashboardSnapshot} from '../supabase/functions/_shared/agency-dashboard-snapshot.ts';

const shell=readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');
const edge=readFileSync('supabase/functions/agency-os/index.ts','utf8');
const calendar=readFileSync('components/AgencyCalendarWorkspace.tsx','utf8');
const dashboard=readFileSync('components/AgencyDashboardReference.tsx','utf8');
const reader=readFileSync('supabase/functions/_shared/agency-dashboard-snapshot.ts','utf8');

test('Dashboard wraps, rather than deletes, canonical Home tasks and workflow',()=>{
  assert.match(shell,/AgencyDashboardConnected/);
  assert.match(shell,/<Home\s/);
  assert.match(shell,/onCreate=\{\(kind\) => setCreateKind\(kind\)\}/);
  assert.match(shell,/<\/AgencyDashboardConnected>/);
});
test('Server remains the sole data source with actor and tenant resolved by existing auth',()=>{
  assert.match(edge,/if\(action==="dashboard_snapshot"\)/);
  assert.match(edge,/readAgencyDashboardSnapshot/);
  assert.match(edge,/tenantId,userId,role/);
  assert.match(reader,/\.eq\('tenant_id',tenantId\)/);
  assert.doesNotMatch(dashboard,/mockData|demoFixtures|localStorage/);
  assert.match(dashboard,/Unavailable|No fixtures recorded/);
});
test('Quick actions use canonical create drawer and real calendar task composer',()=>{
  assert.match(dashboard,/onCreate\('player'\)/);
  assert.match(dashboard,/onCreate\('club_need'\)/);
  assert.match(dashboard,/view=calendar/);
  assert.match(dashboard,/create=task/);
  assert.match(calendar,/quickCreateTask/);
  assert.match(calendar,/setTaskForm\(\{scope:source\.scope\}\)/);
});
test('No implicit private player data or fabricated fixture-to-player matching',()=>{
  assert.doesNotMatch(reader,/\.from\('player_private'\)/);
  assert.doesNotMatch(reader,/\.from\('profiles'\)/);
  assert.match(reader,/fixture_id/);
  assert.match(reader,/staff_player_access/);
});
const UUID_A='11111111-1111-4111-8111-111111111111';
const UUID_B='22222222-2222-4222-8222-222222222222';
const rows=(data:any[]=[])=>(new Proxy({},{get(_target,key){
  if(key==='then')return (ok:(result:any)=>void)=>Promise.resolve({data,error:null}).then(ok);
  return ()=>rows(data);
}}));
const client={from:(_name:string)=>rows([]),schema:(_schema:string)=>({from:(_name:string)=>rows([])})};
const context={client,tenantId:UUID_A,userId:UUID_B,role:'admin',scope:'me' as const,localDate:'2026-10-31',timeZone:'Europe/Rome',basePath:'/workspace/djm'};
test('Snapshot refuses agency scope for unauthorised roles',async()=>{
  await assert.rejects(readAgencyDashboardSnapshot({...context,role:'agent',scope:'agency'}),/dashboard_agency_access_denied/);
});
test('No evidence does not become a false zero client or fixture count',async()=>{
  const result=await readAgencyDashboardSnapshot(context);
  assert.equal(result.activeClients,null);
  assert.equal(result.fixturesToday,null);
  assert.equal(result.scope,'me');
});
test('Snapshot rejects malformed dates and untrusted tenant identifiers',async()=>{
  await assert.rejects(readAgencyDashboardSnapshot({...context,localDate:'2026-02-30'}),/dashboard_date_invalid/);
  await assert.rejects(readAgencyDashboardSnapshot({...context,tenantId:'xyz'}),/dashboard_context_invalid/);
});
