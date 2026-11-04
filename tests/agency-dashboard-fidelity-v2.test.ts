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
const client={from:(table:string)=>query(table==='players'?players:table==='player_agreements'?agreements:[]),rpc:async (name:string)=>({data:name==='platform_server_dashboard_sources'?{fixture_links:[],requests:[],tasks:[]}:[],error:null})};
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
  assert.match(reader,/platform_server_dashboard_sources/);
  assert.doesNotMatch(reader,/client\.schema/);
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

test('Private dashboard sources return only the active tenant and permitted staff scope',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  const other='44444444-4444-4444-8444-444444444444';
  const agent='55555555-5555-4555-8555-555555555555';
  const hiddenPlayer='66666666-6666-4666-8666-666666666666';
  const fixture='77777777-7777-4777-8777-777777777777';
  const need='88888888-8888-4888-8888-888888888888';
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA platform; CREATE SCHEMA djm_os;
      CREATE TABLE platform.tenants (id uuid, status text);
      CREATE TABLE platform.tenant_memberships (tenant_id uuid, user_id uuid, role text, status text);
      CREATE TABLE public.players (id uuid, tenant_id uuid, archived_at timestamptz, primary_staff_user_id uuid);
      CREATE TABLE public.staff_player_access (player_id uuid, staff_user_id uuid);
      CREATE TABLE djm_os.football_fixtures (id uuid, kickoff_at timestamptz, home_team_name text, away_team_name text, status text);
      CREATE TABLE djm_os.player_match_stat_snapshots (player_id uuid, fixture_id uuid, match_date date);
      CREATE TABLE djm_os.club_needs (id uuid, tenant_id uuid, organisation_id uuid, updated_at timestamptz, position text, title text, need_type text, archived_at timestamptz, status text, owner_user_id uuid);
      CREATE TABLE djm_os.organisations (id uuid, tenant_id uuid, name text);
      CREATE TABLE djm_os.player_matches (tenant_id uuid, club_need_id uuid, status text);
      CREATE TABLE djm_os.deal_rooms (tenant_id uuid, club_need_id uuid, pitch_status text);
      CREATE TABLE djm_os.tasks (id uuid, title text, due_at timestamptz, tenant_id uuid, owner_user_id uuid, status text);
      INSERT INTO platform.tenants VALUES ('${TENANT}','active'),('${other}','active');
      INSERT INTO platform.tenant_memberships VALUES ('${TENANT}','${USER}','owner','active'),('${TENANT}','${agent}','agent','active');
      INSERT INTO public.players VALUES ('${PLAYER}','${TENANT}',null,'${USER}'),('${hiddenPlayer}','${other}',null,'${agent}');
      INSERT INTO public.staff_player_access VALUES ('${PLAYER}','${agent}');
      INSERT INTO djm_os.football_fixtures VALUES ('${fixture}','2026-11-04 17:00:00Z','Home','Away','scheduled');
      INSERT INTO djm_os.player_match_stat_snapshots VALUES ('${PLAYER}','${fixture}','2026-11-04'),('${hiddenPlayer}','${fixture}','2026-11-04');
      INSERT INTO djm_os.organisations VALUES ('${fixture}','${other}','Hidden Club');
      INSERT INTO djm_os.club_needs VALUES ('${need}','${TENANT}','${fixture}',now(),'Centre back','Request','confirmed',null,'active','${USER}');
      INSERT INTO djm_os.player_matches VALUES ('${TENANT}','${need}','shortlisted'),('${other}','${need}','selected');
      INSERT INTO djm_os.deal_rooms VALUES ('${TENANT}','${need}','accepted'),('${other}','${need}','accepted');
      INSERT INTO djm_os.tasks VALUES ('${need}','Own task','2026-11-05','${TENANT}','${USER}','open'),
        ('${fixture}','Other staff task','2026-11-05','${TENANT}','${agent}','open'),
        ('${other}','Other tenant task','2026-11-05','${other}','${USER}','open');
    `);
    await db.exec(read('supabase/migrations/20261104193315_read_private_dashboard_sources.sql'));
    const load=(tenant:string,actor:string,scope:string)=>db.query<{result:any}>(
      "select public.platform_server_dashboard_sources($1,$2,$3,'2026-11-04','2026-11-04') as result",[tenant,actor,scope],
    ).then(({rows})=>rows[0].result);
    await db.exec('SET ROLE service_role');
    const owner=await load(TENANT,USER,'agency');
    assert.deepEqual(owner.fixture_links.map((row:any)=>row.player_id),[PLAYER]);
    assert.equal(owner.requests[0].club_name,'Club');
    assert.equal(owner.requests[0].candidate_count,1);
    assert.equal(owner.requests[0].shortlisted_count,1);
    assert.equal(owner.requests[0].pitched_count,1);
    assert.deepEqual(owner.tasks.map((row:any)=>row.title),['Own task']);
    const snapshot=await readAgencyDashboardSnapshot({
      ...context,localDate:'2026-11-04',
      client:{...client,rpc:async name=>({data:name==='platform_server_dashboard_sources'?owner:[],error:null})},
    });
    assert.equal(snapshot.fixturesToday,1);
    assert.deepEqual(snapshot.fixtures[0].relatedPlayerNames,['Test Player']);
    assert.equal(snapshot.clubRequests[0].href,'/workspace/qa?view=opportunities&tab=needs&record='+need);
    const personal=await load(TENANT,agent,'me');
    assert.deepEqual(personal.fixture_links.map((row:any)=>row.player_id),[PLAYER]);
    assert.equal(personal.requests,null);
    assert.deepEqual(personal.tasks.map((row:any)=>row.title),['Other staff task']);
    await assert.rejects(load(TENANT,agent,'agency'),/dashboard_access_denied/);
    await assert.rejects(load(other,USER,'agency'),/dashboard_access_denied/);
    await db.exec('RESET ROLE; SET ROLE authenticated');
    await assert.rejects(load(TENANT,USER,'agency'),/permission denied/);
  } finally { await db.close(); }
});
