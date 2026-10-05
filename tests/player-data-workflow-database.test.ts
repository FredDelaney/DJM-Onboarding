import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {before,after,beforeEach,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const tenant='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',actor='10000000-0000-4000-8000-000000000001',scout='10000000-0000-4000-8000-000000000002',player='30000000-0000-4000-8000-000000000001',foreign='30000000-0000-4000-8000-000000000002';
const request='40000000-0000-4000-8000-000000000001',second='40000000-0000-4000-8000-000000000002';
const path='supabase/migrations/20261005170000_player_data_workflow.sql';
const values={season_label:'2026/27',club_name:'Example II',league:'Regional League',country:'NZ',appearances:'8',starts:'5',minutes:'450',goals:'0',assists:'',source_name:'Official league',source_url:'https://league.example/player',source_confirmed:true};
before(async()=>{
 await db.exec(`
 create schema platform;create schema private;create role anon;create role authenticated;create role service_role;
 create table platform.tenants(id uuid,status text);
 create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text);
 create table public.players(id uuid primary key,tenant_id uuid,current_club text,current_season_label text,current_league text,current_country text,verification_status text,verified_at timestamptz,review_required_at timestamptz,review_reason text);
 create table public.career_entries(id uuid primary key default gen_random_uuid(),player_id uuid,season_label text,club_name text,league text,country text,appearances int,starts int,minutes int,goals int,assists int,source_name text,source_url text,source_provider text,source_acceptance_method text,source_reviewed_at timestamptz,source_synced_at timestamptz,updated_at timestamptz default now());
 create table public.player_public_profiles(player_id uuid,published boolean,career_timeline jsonb);
 create table public.player_source_refreshes(id uuid primary key default gen_random_uuid(),player_id uuid,source text,provider text,mode text,capability text,status text,requested_by uuid,requested_at timestamptz default now(),started_at timestamptz,completed_at timestamptz,summary jsonb default '{}',raw_snapshot jsonb default '{}',error_text text,updated_at timestamptz default now());
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
});
after(()=>db.close());
beforeEach(()=>db.exec(`delete from public.player_source_refreshes;delete from public.career_entries;delete from platform.audit_events;update public.players set verification_status='verified',verified_at=now(),review_reason=null,review_required_at=null;update public.player_public_profiles set published=true;`));
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
 await db.query("update platform.tenant_memberships set status='inactive' where user_id=$1",[actor]);
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
