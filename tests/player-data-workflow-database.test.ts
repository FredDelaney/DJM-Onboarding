import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {before,after,beforeEach,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const tenant='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',actor='10000000-0000-4000-8000-000000000001',scout='10000000-0000-4000-8000-000000000002',player='30000000-0000-4000-8000-000000000001',foreign='30000000-0000-4000-8000-000000000002';
const request='40000000-0000-4000-8000-000000000001',second='40000000-0000-4000-8000-000000000002';
const path='supabase/migrations/20261005182123_player_data_workflow.sql';
const values={season_label:'2026/27',club_name:'Example II',league:'Regional League',country:'NZ',appearances:'8',starts:'5',minutes:'450',goals:'0',assists:'',source_name:'Official league',source_url:'https://league.example/player',source_confirmed:true};
before(async()=>{
 await db.exec(`
 create schema platform;create schema private;create schema djm_os;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create role anon;create role authenticated;create role service_role;
 create table platform.tenants(id uuid,status text);
 create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text);
 create table public.players(id uuid primary key,tenant_id uuid,current_club text,current_season_label text,current_league text,current_country text,verification_status text,verified_at timestamptz,review_required_at timestamptz,review_reason text);
 create table public.career_entries(id uuid primary key default gen_random_uuid(),player_id uuid,season_label text,club_name text,league text,country text,appearances int,starts int,minutes int,goals int,assists int,source_name text,source_url text,source_provider text,source_acceptance_method text,source_reviewed_at timestamptz,source_synced_at timestamptz,updated_at timestamptz default now());
 create table public.player_public_profiles(player_id uuid,published boolean,career_timeline jsonb);
 create table public.player_source_refreshes(id uuid primary key default gen_random_uuid(),player_id uuid,source text,provider text,mode text,capability text,status text,requested_by uuid,requested_at timestamptz default now(),started_at timestamptz,completed_at timestamptz,summary jsonb default '{}',raw_snapshot jsonb default '{}',error_text text,updated_at timestamptz default now(),source_url text,facts_discovered int default 0,review_required int default 0,accepted_count int default 0,rejected_count int default 0,payload_hash text);
 create table public.staff_player_access(player_id uuid,staff_user_id uuid,can_edit boolean);
 create table djm_os.team_members(user_id uuid,is_active boolean);
 create table djm_os.review_items(id uuid default gen_random_uuid(),tenant_id uuid,owner_user_id uuid,review_type text,title text,detail text,player_id uuid,confidence numeric,payload jsonb,status text default 'open',resolved_at timestamptz);
 create table platform.audit_events(tenant_id uuid,actor_user_id uuid,actor_kind text,action text,entity_type text,entity_id text,before_state jsonb,after_state jsonb,metadata jsonb);
 create function private.player_career_timeline(uuid) returns jsonb language sql as $$select '[]'::jsonb$$;
 insert into platform.tenants values('20000000-0000-4000-8000-000000000001','active'),('20000000-0000-4000-8000-000000000002','active');
 insert into platform.tenant_memberships values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','active','agent'),('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','active','scout');
 insert into public.players values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Example II','2026/27','Regional League','NZ','verified',now(),null,null),('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Other','2026','League','NZ','verified',now(),null,null);
 insert into public.player_public_profiles values('30000000-0000-4000-8000-000000000001',true,'[]');
 `);
 const trigger=readFileSync('supabase/migrations/20260825153435_allow_internal_career_review_state_updates_v1.sql','utf8');
 await db.exec(trigger.slice(trigger.indexOf('create or replace function private.career_change_requires_review()')));
 await db.exec('create trigger career_review after insert or update on public.career_entries for each row execute function private.career_change_requires_review()');
 if(existsSync(path))await db.exec(readFileSync(path,'utf8'));
 await db.exec(readFileSync('supabase/migrations/20261024114808_approval_first_player_stats_review_v1.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261024120738_scope_stats_review_policy_without_platform_grants_v1.sql','utf8'));
 await db.query('insert into public.staff_player_access values($1,$2,true)',[player,actor]);
});
after(()=>db.close());
beforeEach(()=>db.exec(`delete from djm_os.review_items;delete from public.player_source_refreshes;delete from public.career_entries;delete from platform.audit_events;update public.players set verification_status='verified',verified_at=now(),review_reason=null,review_required_at=null;update public.player_public_profiles set published=true;`));
async function requestJob(id=request,pid=player,user=actor):Promise<any>{return (await db.query('select public.platform_server_request_player_stats_refresh($1,$2,$3,$4) as result',[tenant,pid,user,id])).rows[0].result;}
async function status(pid=player):Promise<any>{return (await db.query('select public.platform_server_player_stats_refresh_status($1,$2) as result',[tenant,pid])).rows[0].result;}
async function save(v:any=values,row:any=null,user=actor,pid=player):Promise<any>{return (await db.query('select public.platform_server_save_current_player_stats($1,$2,$3,$4,$5,$6) as result',[tenant,pid,user,row?.id||null,row?.updated_at||null,v])).rows[0].result;}
test('refresh requests deduplicate per player and preserve request-id replay after completion',async()=>{
 const first=await requestJob();assert.equal(first.dispatch,true);
 const pending=await requestJob(second);assert.equal(pending.dispatch,false);assert.equal(pending.job.id,first.job.id);
 await db.query("update public.player_source_refreshes set status='applied' where id=$1",[request]);
 assert.equal((await requestJob()).dispatch,false);
 assert.equal((await db.query('select count(*)::int as count from public.player_source_refreshes')).rows[0].count,1);
});
test('a dead worker becomes a recoverable failure and never fresh evidence',async()=>{
 await requestJob();await db.query("update public.player_source_refreshes set requested_at=now()-interval '3 minutes' where id=$1",[request]);
 const result=await status();assert.equal(result.status,'failed');assert.equal(result.summary.checked_at,null);
 assert.equal((await requestJob(second)).dispatch,true);
});
test('foreign player ids, inactive actors and scouts cannot start or save updates',async()=>{
 await assert.rejects(()=>requestJob(request,foreign),/player_not_found/);
 await assert.rejects(()=>status(foreign),/player_not_found/);
 await assert.rejects(()=>requestJob(request,player,scout),/agency_operator/);
 await assert.rejects(()=>save(values,null,scout),/agency_operator/);
 await assert.rejects(()=>save(values,null,actor,foreign),/player_not_found/);
 await db.query("update platform.tenant_memberships set status='suspended' where user_id=$1",[actor]);
 await assert.rejects(()=>requestJob(),/agency_operator/);
 await assert.rejects(()=>save(),/agency_operator/);
 await db.query("update platform.tenant_memberships set status='active' where user_id=$1",[actor]);
});
test('missing current context cannot dispatch research',async()=>{
 await db.query('update public.players set current_season_label=null where id=$1',[player]);
 await assert.rejects(()=>requestJob(),/current_season_context_required/);
 await db.query("update public.players set current_season_label='2026/27' where id=$1",[player]);
});
test('human corrections preserve zero/unknown, request fresh verification and unpublish stale shares',async()=>{
 const result=await save();assert.equal(result.row.goals,0);assert.equal(result.row.assists,null);assert.equal(result.row.source_provider,'manual');
 const data=(await db.query('select * from public.players where id=$1',[player])).rows[0];
 assert.equal(data.verification_status,'reviewing');assert.equal(data.verified_at,null);assert.ok(data.review_required_at);
 assert.equal((await db.query('select published from public.player_public_profiles')).rows[0].published,false);
 assert.equal((await db.query('select count(*)::int as count from platform.audit_events')).rows[0].count,1);
});
test('stale revisions, duplicate creation and missing source confirmation never overwrite data',async()=>{
 const {row}=await save();
 await assert.rejects(()=>save({...values,appearances:'9'},{...row,updated_at:'2000-01-01T00:00:00Z'}),/revision_conflict/);
 await assert.rejects(()=>save(values),/row_exists/);
 await assert.rejects(()=>save({...values,source_confirmed:false},row),/reviewed_stats_source_required/);
 assert.equal((await db.query('select appearances from public.career_entries')).rows[0].appearances,8);
});
test('corrections cannot race a running update and invalid figures are rejected',async()=>{
 await requestJob();await assert.rejects(()=>save(),/refresh_running/);
 await db.exec('delete from public.player_source_refreshes');
 for(const appearances of ['-1','1.5','Infinity'])await assert.rejects(()=>save({...values,appearances}),/invalid_player_stats/);
 await assert.rejects(()=>save({...values,starts:'9'}),/starts_exceed_appearances/);
 await assert.rejects(()=>save({...values,source_url:'javascript:alert(1)'}),/reviewed_stats_source_required/);
});
test('changing season context adds a record and preserves historical figures',async()=>{
 const first=await save();
 const next=await save({...values,season_label:'2027/28',appearances:'0',starts:'0',minutes:'0'},first.row);
 assert.notEqual(next.row.id,first.row.id);
 const rows=(await db.query('select season_label,appearances from public.career_entries order by season_label')).rows;
 assert.deepEqual(rows,[{season_label:'2026/27',appearances:8},{season_label:'2027/28',appearances:0}]);
 await db.query("update public.players set current_season_label='2026/27' where id=$1",[player]);
});
test('server RPCs are unavailable to browser and anonymous roles',async()=>{
 for(const fn of ['platform_server_request_player_stats_refresh(uuid,uuid,uuid,uuid)','platform_server_player_stats_refresh_status(uuid,uuid)','platform_server_save_current_player_stats(uuid,uuid,uuid,uuid,timestamptz,jsonb)']){
  const result=(await db.query("select has_function_privilege('anon',$1,'execute') as anon,has_function_privilege('authenticated',$1,'execute') as staff,has_function_privilege('service_role',$1,'execute') as service",[fn])).rows[0];
  assert.equal(result.anon,false);assert.equal(result.staff,false);assert.equal(result.service,true);
 }
});

const sources=[{url:'https://league.example/player',title:'Official league'},{url:'https://club.example/stats',title:'Club record'}];
const context={season_label:values.season_label,club_name:values.club_name,league:values.league,country:values.country};
const expectedContext={season_label:values.season_label,club_name:values.club_name,league:values.league};
async function proposal(row:any=null,options:any={}):Promise<any>{
 return (await db.query('select public.platform_server_stage_player_stats_review($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',
 [player,row?.id||null,row?.updated_at||null,options.expectedContext||expectedContext,options.context||context,options.values||{...values,appearances:9},options.sources||sources,options.confidence??0.95,options.requestId||null])).rows[0].result;
}
async function review(id:string,decision='accept',edited:any=null,user=actor,pid=player):Promise<any>{
 return (await db.query('select public.platform_server_review_player_stats($1,$2,$3,$4,$5,$6) as result',[tenant,pid,user,id,decision,edited])).rows[0].result;
}
async function reviewStatus(user=actor,pid=player):Promise<any>{return (await db.query('select public.platform_server_player_stats_review_status($1,$2,$3) as result',[tenant,pid,user])).rows[0].result;}
async function verifiedBaseline(){
 const {row}=await save();
 await db.exec("update public.players set verification_status='verified',verified_at=now(),review_reason=null,review_required_at=null;update public.player_public_profiles set published=true;delete from platform.audit_events;");
 return row;
}
test('sourced suggestions retain true before/after, zero/unknown and leave verified public figures unchanged',async()=>{
 const row=await verifiedBaseline();const result=await proposal(row);
 assert.equal(result.status,'needs_review');
 const pending=await reviewStatus();assert.equal(pending.before.appearances,8);assert.equal(pending.proposed.appearances,9);assert.equal(pending.before.goals,0);assert.equal(pending.proposed.assists,null);
 assert.deepEqual(pending.context,context);assert.deepEqual(pending.sources,sources);assert.ok(pending.checked_at);
 assert.equal((await db.query('select appearances from public.career_entries')).rows[0].appearances,8);
 assert.equal((await db.query('select verification_status from public.players where id=$1',[player])).rows[0].verification_status,'verified');
 assert.equal((await db.query('select published from public.player_public_profiles')).rows[0].published,true);
 const work=(await db.query('select * from djm_os.review_items')).rows[0];assert.equal(work.tenant_id,tenant);assert.equal(work.player_id,player);assert.equal(work.payload.stats_review_id,result.review_id);
});
test('accept is atomic, audited, repeat-safe and preserves parent-club identity',async()=>{
 const row=await verifiedBaseline();
 await db.query("update public.players set current_club='Example FC' where id=$1",[player]);
 const p=await proposal(row,{expectedContext:{...expectedContext,club_name:'Example FC'}});
 assert.equal((await review(p.review_id)).status,'accepted');assert.equal((await review(p.review_id)).replayed,true);
 assert.equal((await db.query('select count(*)::int as count from platform.audit_events')).rows[0].count,1);
 const current=(await db.query('select * from public.career_entries')).rows[0];assert.equal(current.appearances,9);assert.equal(current.goals,0);assert.equal(current.assists,null);assert.ok(current.source_reviewed_at);
 const pl=(await db.query('select * from public.players where id=$1',[player])).rows[0];assert.equal(pl.current_club,'Example FC');assert.equal(pl.verification_status,'reviewing');
 assert.equal((await db.query('select published from public.player_public_profiles')).rows[0].published,false);
 assert.equal((await db.query('select status from djm_os.review_items')).rows[0].status,'approved');
 const audit:any=(await db.query('select * from platform.audit_events')).rows[0];assert.equal(audit.actor_user_id,actor);assert.equal(audit.before_state.appearances,8);assert.equal(audit.after_state.appearances,9);
 await assert.rejects(()=>review(p.review_id,'reject'),/already_resolved/);
 await db.query("update public.players set current_club='Example II' where id=$1",[player]);
});
test('reject never changes figures or publication and the same evidence stays rejected',async()=>{
 const row=await verifiedBaseline();const p=await proposal(row);await review(p.review_id,'reject');
 assert.equal((await review(p.review_id,'reject')).replayed,true);
 assert.equal((await proposal(row)).review_id,p.review_id);assert.equal((await proposal(row)).status,'rejected');
 assert.equal((await db.query('select appearances from public.career_entries')).rows[0].appearances,8);
 assert.equal((await db.query('select published from public.player_public_profiles')).rows[0].published,true);
 assert.equal((await db.query('select status from djm_os.review_items')).rows[0].status,'rejected');
});
test('edit requires explicit source review and may correct a suggested figure down to a genuine zero',async()=>{
 const row=await verifiedBaseline();const p=await proposal(row);
 await assert.rejects(()=>review(p.review_id,'edit',{...values,source_confirmed:false}),/reviewed_stats_source_required/);
 assert.equal((await reviewStatus()).status,'needs_review');
 await review(p.review_id,'edit',{...values,goals:'0',appearances:'7',starts:'5'});
 const saved=(await db.query('select * from public.career_entries')).rows[0];assert.equal(saved.appearances,7);assert.equal(saved.assists,null);assert.equal(saved.source_provider,'manual');
});
test('stale row or player context conflicts retain the pending proposal and never overwrite a correction',async()=>{
 const row=await verifiedBaseline();const p=await proposal(row);
 await db.query("update public.career_entries set appearances=10,updated_at=now()+interval '1 second' where id=$1",[row.id]);
 await assert.rejects(()=>review(p.review_id),/revision_conflict/);assert.equal((await reviewStatus()).status,'needs_review');
 assert.equal((await db.query('select appearances from public.career_entries')).rows[0].appearances,10);
 await review(p.review_id,'reject');
 const next=(await db.query('select * from public.career_entries')).rows[0];const p2=await proposal(next,{values:{...values,appearances:11}});
 await db.query("update public.players set current_season_label='2027/28' where id=$1",[player]);
 await assert.rejects(()=>review(p2.review_id),/context_changed/);await review(p2.review_id,'reject');
 await db.query("update public.players set current_season_label='2026/27' where id=$1",[player]);
});
test('research baseline is captured before research, pending work deduplicates and invalid evidence cannot stage',async()=>{
 const row=await verifiedBaseline();
 await assert.rejects(()=>proposal({...row,updated_at:'2000-01-01T00:00:00Z'}),/revision_conflict/);
 await assert.rejects(()=>proposal(row,{confidence:0.5}),/evidence_required/);
 await assert.rejects(()=>proposal(row,{sources:[sources[0],{...sources[0],url:'https://www.league.example/other'}]}),/evidence_required/);
 await assert.rejects(()=>proposal(row,{sources:[sources[0],{url:'javascript:alert(1)'}]}),/evidence_required/);
 for(const n of [-1,1.5,2147483648])await assert.rejects(()=>proposal(row,{values:{...values,appearances:n}}),/invalid_player_stats/);
 const first=await proposal(row);const second=await proposal(row,{values:{...values,appearances:10}});assert.equal(first.review_id,second.review_id);
 assert.equal((await db.query('select count(*)::int as count from djm_os.review_items')).rows[0].count,1);
});
test('review and pending read reject scout, suspended and foreign-tenant actors',async()=>{
 const row=await verifiedBaseline();const p=await proposal(row);
 await assert.rejects(()=>review(p.review_id,'accept',null,scout),/agency_operator/);
 await assert.rejects(()=>reviewStatus(scout),/agency_operator/);
 await assert.rejects(()=>review(p.review_id,'accept',null,actor,foreign),/player_not_found/);
 await assert.rejects(()=>reviewStatus(actor,foreign),/player_not_found/);
 await db.query("update platform.tenant_memberships set status='suspended' where user_id=$1",[actor]);
 await assert.rejects(()=>review(p.review_id),/agency_operator/);
 await db.query("update platform.tenant_memberships set status='active' where user_id=$1",[actor]);
});
test('new reviewed season inserts only after approval and duplicate creation conflicts',async()=>{
 const p=await proposal();assert.equal((await db.query('select count(*)::int as count from public.career_entries')).rows[0].count,0);
 await review(p.review_id);assert.equal((await db.query('select appearances from public.career_entries')).rows[0].appearances,9);
});
test('proposal RPCs are service-only and browser ledger tampering including delete/truncate is rejected',async()=>{
 const row=await verifiedBaseline();const p=await proposal(row);
 for(const fn of ['platform_server_stage_player_stats_review(uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb,numeric,uuid)','platform_server_player_stats_review_status(uuid,uuid,uuid)','platform_server_review_player_stats(uuid,uuid,uuid,uuid,text,jsonb)']){
  const r:any=(await db.query("select has_function_privilege('authenticated',$1,'execute') as browser,has_function_privilege('anon',$1,'execute') as anon,has_function_privilege('service_role',$1,'execute') as server",[fn])).rows[0];assert.equal(r.browser,false);assert.equal(r.anon,false);assert.equal(r.server,true);
 }
 await db.exec('grant usage on schema public,private to authenticated;grant all on public.player_source_refreshes to authenticated;set role authenticated;');
 try{
  for(const sql of ["update public.player_source_refreshes set raw_snapshot='{}' where id='"+p.review_id+"'","delete from public.player_source_refreshes where id='"+p.review_id+"'","truncate public.player_source_refreshes","insert into public.player_source_refreshes(player_id,provider) values('"+player+"','agency_stats_proposal_v1')"]){await assert.rejects(()=>db.exec(sql),/proposal_server_only/);}
 }finally{await db.exec('reset role');}
});

test('proposal browser reads require canonical tenancy, active operators and cannot use legacy admin access across agencies',async()=>{
 const row=await verifiedBaseline();const p=await proposal(row);
 await db.exec("grant usage on schema public,private,auth to authenticated;revoke all on schema platform from authenticated;revoke all on platform.tenant_memberships,platform.tenants from authenticated;grant select on public.player_source_refreshes to authenticated;alter table public.player_source_refreshes enable row level security;create policy legacy_admin_fixture on public.player_source_refreshes for select to authenticated using(true);set role authenticated;");
 try{
  await db.query("select set_config('test.uid',$1,false)",[actor]);assert.equal((await db.query('select count(*)::int as count from public.player_source_refreshes where id=$1',[p.review_id])).rows[0].count,1);
  await db.exec('reset role');await db.query('update public.staff_player_access set can_edit=false where staff_user_id=$1',[actor]);await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::int as count from public.player_source_refreshes where id=$1',[p.review_id])).rows[0].count,0);
  await db.exec('reset role');await db.query('update public.staff_player_access set can_edit=true where staff_user_id=$1',[actor]);await db.exec('set role authenticated');
  for(const user of [scout,'90000000-0000-4000-8000-000000000009']){await db.query("select set_config('test.uid',$1,false)",[user]);assert.equal((await db.query('select count(*)::int as count from public.player_source_refreshes where id=$1',[p.review_id])).rows[0].count,0);}
 }finally{await db.exec('reset role;alter table public.player_source_refreshes disable row level security;drop policy legacy_admin_fixture on public.player_source_refreshes');}
});
