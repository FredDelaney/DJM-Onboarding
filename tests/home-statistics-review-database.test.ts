import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {before,beforeEach,after,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const tenant='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
const owner='10000000-0000-4000-8000-000000000001',agent='10000000-0000-4000-8000-000000000002',colleague='10000000-0000-4000-8000-000000000003',scout='10000000-0000-4000-8000-000000000004';
const player='30000000-0000-4000-8000-000000000001';
const migration='supabase/migrations/20261024125919_connect_sourced_statistics_to_personal_home_v1.sql';
const file=(name:string)=>readFileSync('supabase/migrations/'+name,'utf8');
function definition(text:string,name:string){
 const match=new RegExp('create (?:or replace )?function '+name.replaceAll('.','\\.')+'\\s*\\(','i').exec(text);assert.ok(match,name);
 const tail=text.slice(match.index),delimiter=/\bas\s+(\$\w*\$)/i.exec(tail);assert.ok(delimiter,name+' body');
 const end=tail.indexOf(delimiter[1],delimiter.index+delimiter[0].length);assert.ok(end>0);return tail.slice(0,end+delimiter[1].length+1);
}
async function result(sql:string,args:any[]=[]):Promise<any>{return Object.values((await db.query(sql,args)).rows[0])[0];}
async function denied(action:()=>Promise<unknown>,pattern:RegExp,reason?:string){await db.exec('savepoint denied_call');try{await assert.rejects(action,pattern,reason);}finally{await db.exec('rollback to savepoint denied_call;release savepoint denied_call');}}
const home=(user=owner,limit=8,scope=tenant)=>result('select public.platform_server_personal_home_commands($1,$2,$3)',[scope,user,limit]);
let oldCrowding=false,oldTaskCrowding=false;
async function crowd(count=40){await db.query("insert into public.players(id,tenant_id,first_name,review_required_at,review_reason,verification_status) select gen_random_uuid(),$1,'Review player '||n,now(),'Career statistics changed','reviewing' from generate_series(1,$2) n",[tenant,count]);}
async function seed(){
 await db.exec('delete from djm_os.review_items;delete from public.player_source_suggestions;delete from public.player_source_refreshes;delete from public.career_entries;delete from public.player_public_profiles;delete from platform.agency_command_feedback;delete from platform.audit_events;delete from platform.player_staff_tags;delete from public.staff_player_access;delete from djm_os.tasks;delete from public.players;update platform.tenant_memberships set status=\'active\';update djm_os.team_members set is_active=true;update platform.tenants set status=\'active\';');
 await db.query("insert into public.players(id,tenant_id,first_name,current_club,current_season_label,current_league,current_country,primary_staff_user_id,next_action,next_action_due) values($1,$2,'Recorded player','Example II','2026/27','Regional League','NZ',$3,'Call the club',current_date)",[player,tenant,agent]);
 await db.query("insert into public.career_entries(player_id,club_name,season_label,league,country,appearances,starts,minutes,goals,assists,source_name,source_url,notes) values($1,'Example II','2026/27','Regional League','NZ',8,5,450,0,null,'Official league','https://league.example/player','PRIVATE_CAREER_SENTINEL')",[player]);
 await db.query("update public.players set verification_status='verified',verified_at=now(),review_required_at=null,review_reason=null where id=$1",[player]);
 await db.query('insert into public.player_public_profiles(player_id,published) values($1,true)',[player]);
 await db.query('insert into platform.player_staff_tags values($1,$2,false,$3)',[tenant,player,[owner,agent]]);
 await db.query('insert into public.staff_player_access values($1,$2,true),($1,$3,true),($1,$4,true)',[player,agent,colleague,scout]);
 await db.query("insert into djm_os.tasks(id,tenant_id,owner_user_id,title,status) values(gen_random_uuid(),$1,$2,'Existing follow-up','open')",[tenant,owner]);
}
async function stage(pid=player){
 const row:any=(await db.query('select * from public.career_entries where player_id=$1',[pid])).rows[0];
 return result('select public.platform_server_stage_player_stats_review($1,$2,$3,$4,$5,$6,$7,$8)',[pid,row.id,row.updated_at,
 {season_label:'2026/27',club_name:'Example II',league:'Regional League'},{season_label:'2026/27',club_name:'Example II',league:'Regional League',country:'NZ'},
 {appearances:9,starts:5,minutes:540,goals:0,assists:null},[{url:'https://league.example/player',title:'Official league'},{url:'https://club.example/player',title:'Club record'}],0.95]);
}
const reviews=(feed:any)=>feed.commands.filter((c:any)=>['Player statistics suggested','Player review required'].includes(c.command_type));
async function colleagueTasks(){await db.query("insert into djm_os.tasks(tenant_id,owner_user_id,title,due_at,status,priority) select $1,$2,'Colleague task '||n,now()-interval '20 days','open',4 from generate_series(1,40) n",[tenant,colleague]);}
before(async()=>{
 await db.exec(`
 create schema platform;create schema private;create schema djm_os;create schema auth;
 create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table platform.tenants(id uuid primary key,status text check(status in ('provisioning','active','suspended','closed')));
 create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text check(status in ('invited','active','suspended','ended')),role text check(role in ('owner','admin','agent','scout','operations','player')));
 create table djm_os.team_members(user_id uuid,is_active boolean);
 create table public.staff_player_access(player_id uuid,staff_user_id uuid,can_edit boolean);
 create table platform.player_staff_tags(tenant_id uuid,player_id uuid,all_staff boolean,user_ids uuid[]);
 create table platform.agency_command_feedback(tenant_id uuid,actor_user_id uuid,command_id text,feedback_type text,snoozed_until timestamptz,created_at timestamptz default now());
 create table public.players(id uuid primary key default gen_random_uuid(),tenant_id uuid,first_name text,last_name text,preferred_name text,current_club text,current_season_label text,current_league text,current_country text,primary_staff_user_id uuid,football_status text default 'active',archived_at timestamptz,next_action text,next_action_due date,agency_priority int,contract_expiry date,contract_status text,verification_status text,verified_at timestamptz,review_required_at timestamptz,review_reason text);
 create table public.career_entries(id uuid primary key default gen_random_uuid(),player_id uuid,season_label text,club_name text,league text,country text,appearances int,starts int,minutes int,goals int,assists int,source_name text,source_url text,source_provider text,source_acceptance_method text,source_reviewed_at timestamptz,source_synced_at timestamptz,updated_at timestamptz default now(),notes text);
 create table public.player_public_profiles(player_id uuid,published boolean,career_timeline jsonb);
 create table public.player_source_refreshes(id uuid primary key default gen_random_uuid(),player_id uuid,source text,provider text,mode text,capability text,status text,requested_by uuid,requested_at timestamptz default now(),started_at timestamptz,completed_at timestamptz,summary jsonb default '{}',raw_snapshot jsonb default '{}',error_text text,updated_at timestamptz default now(),source_url text,facts_discovered int default 0,review_required int default 0,accepted_count int default 0,rejected_count int default 0,payload_hash text);
 create table public.player_source_suggestions(id uuid default gen_random_uuid(),refresh_id uuid,player_id uuid,decision text);
 create table djm_os.review_items(id uuid default gen_random_uuid(),tenant_id uuid,owner_user_id uuid,review_type text,title text,detail text,player_id uuid,confidence numeric,payload jsonb,status text default 'open',resolved_at timestamptz);
 create table platform.audit_events(tenant_id uuid,actor_user_id uuid,actor_kind text,action text,entity_type text,entity_id text,before_state jsonb,after_state jsonb,metadata jsonb);
 create table djm_os.tasks(id uuid default gen_random_uuid(),tenant_id uuid,owner_user_id uuid,title text,player_id uuid,person_id uuid,organisation_id uuid,club_need_id uuid,interaction_id uuid,task_type text,source text,due_at timestamptz,status text,priority int,created_at timestamptz default now());
 create table djm_os.interactions(id uuid,tenant_id uuid,team_member_id uuid,channel text,direction text,person_id uuid,player_id uuid,prospect_id uuid,summary text);
 create table djm_os.captures(id uuid,tenant_id uuid,status text,summary text,created_at timestamptz,player_id uuid,confidence numeric,last_error_code text,receipt_json jsonb);
 create table public.player_opportunities(id uuid,tenant_id uuid,player_id uuid,club_name text,country text,contact_name text,stage text,next_action text,next_action_due date,last_contacted_at timestamptz);
 create table djm_os.deal_rooms(id uuid,tenant_id uuid,status text,stage text,title text,player_id uuid,club_need_id uuid,next_action_at timestamptz,next_action_text text,next_decision text,probability numeric,expected_commission numeric,currency text,primary_blocker text,last_meaningful_at timestamptz);
 create table djm_os.organisations(id uuid,name text);
 create table djm_os.club_needs(id uuid,tenant_id uuid,title text,organisation_id uuid,need_type text,priority int,position text,confirmed_at timestamptz,expires_at timestamptz,status text);
 create table djm_os.player_matches(id uuid,tenant_id uuid,club_need_id uuid,player_id uuid,status text,created_at timestamptz,overall_score numeric,football_score numeric,commercial_score numeric,registration_score numeric,career_score numeric,access_score numeric,reasoning text);
 create function private.user_is_tenant_admin(t uuid,u uuid) returns boolean language sql as $$select exists(select 1 from platform.tenant_memberships where tenant_id=t and user_id=u and status='active' and role in ('owner','admin'))$$;
 create function private.player_career_timeline(uuid) returns jsonb language sql as $$select '[]'::jsonb$$;
 -- Keep the real admission and ranking SQL. These existing enrichment adapters
 -- are outside this test; retain the incoming score so review crowding is real.
 create function platform.command_priority_profile(c jsonb) returns jsonb language sql as $$select jsonb_build_object('effective_score',c->'priority_score','effective_band','normal')$$;
 create function platform.command_evidence_health_v2(uuid,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function platform.command_actionability(jsonb) returns jsonb language sql as $$select '{"mode":"review_only"}'::jsonb$$;
 insert into platform.tenants values('${tenant}','active'),('${other}','active');
 insert into platform.tenant_memberships values('${tenant}','${owner}','active','owner'),('${tenant}','${agent}','active','agent'),('${tenant}','${colleague}','active','operations'),('${tenant}','${scout}','active','scout');
 insert into djm_os.team_members values('${owner}',true),('${agent}',true),('${colleague}',true),('${scout}',true);
 `);
 await db.exec(definition(file('20261021182616_player_staff_tags_and_personal_home.sql'),'private.player_home_relevant'));
 await db.exec(definition(file('20260825153435_allow_internal_career_review_state_updates_v1.sql'),'private.career_change_requires_review'));
 await db.exec('create trigger career_review after insert or update on public.career_entries for each row execute function private.career_change_requires_review()');
 const raw=file('20261005123654_home_review_context.sql');
 await db.exec(definition(raw,'public.platform_server_agency_commands'));
 await db.exec(definition(raw,'public.platform_server_user_task_commands'));
 await db.exec(definition(file('20260913121107_refine_evidence_source_freshness.sql'),'public.platform_server_agency_decisions'));
 let personal=definition(file('20260926094944_redream_user_owned_work_v1.sql'),'public.platform_server_personal_home_commands');
 const patches=file('20261006120000_staff_workspace_authorization.sql');
 const pattern=/select pg_temp\.patch_staff_boundary\('public\.platform_server_personal_home_commands\(uuid,uuid,integer\)'::regprocedure,\s*\$boundary\$([\s\S]*?)\$boundary\$,\s*\$boundary\$([\s\S]*?)\$boundary\$\);/g;
 for(const match of patches.matchAll(pattern)){assert.ok(personal.includes(match[1]));personal=personal.replace(match[1],match[2]);}
 await db.exec(personal);
 for(const fn of ['platform_server_agency_commands(uuid,integer)','platform_server_agency_decisions(uuid,integer)','platform_server_personal_home_commands(uuid,uuid,integer)','platform_server_user_task_commands(uuid,uuid,integer)'])await db.exec('revoke all on function public.'+fn+' from public,anon,authenticated;grant execute on function public.'+fn+' to service_role');
 await db.exec(file('20261005182123_player_data_workflow.sql'));
 await db.exec(file('20261024114808_approval_first_player_stats_review_v1.sql'));
 await db.exec(file('20261024120738_scope_stats_review_policy_without_platform_grants_v1.sql'));
 await seed();await crowd();oldCrowding=!(await home()).commands.some((c:any)=>c.command_type==='Player follow-up due');
 await seed();await colleagueTasks();oldTaskCrowding=!(await home()).commands.some((c:any)=>c.command_type==='Player follow-up due');
 const oldRaw=await result('select public.platform_server_agency_commands($1,25)',[tenant]);const oldDecisions=await result('select public.platform_server_agency_decisions($1,25)',[tenant]);
 await db.exec(readFileSync(migration,'utf8'));
 await db.exec(file('20261024151913_connect_player_details_reviews_to_personal_home_v1.sql'));
 const ownerGuard=file('20260926094944_redream_user_owned_work_v1.sql');
 await db.exec(ownerGuard.slice(0,ownerGuard.indexOf('create or replace function public.platform_server_user_task_commands(')));
 await db.exec(file('20261025082614_canonical_agency_home_staff_access.sql'));
 const stable=(v:any)=>{const {generated_at,...rest}=v;return rest;};
 assert.deepEqual(stable(await result('select public.platform_server_agency_commands($1,25)',[tenant])),stable(oldRaw),'Other callers retain the exact raw feed contract');
 assert.deepEqual(stable(await result('select public.platform_server_agency_decisions($1,25)',[tenant])),stable(oldDecisions),'Other callers retain the exact enriched feed contract');
});
beforeEach(seed);after(()=>db.close());
test('real upstream and personal admission limits retain business work even behind forty review flags',async()=>{
 assert.equal(oldCrowding,true,'The original installed function chain must reproduce the loss');await crowd();
 const feed=await home(owner,1);assert.equal(feed.commands.filter((c:any)=>c.command_type==='Player follow-up due').length,1);assert.equal(reviews(feed).length,40);
 assert.equal(feed.commands.filter((c:any)=>!reviews(feed).includes(c)).length,1);
});
test('pending review uses canonical player/team and minimal evidence without changing figures or publication',async()=>{
 const p=await stage();for(const user of [owner,agent]){
  const [review]=reviews(await home(user));assert.equal(review.command_type,'Player statistics suggested');assert.equal(review.player_id,player);assert.equal(review.evidence.stats_review_id,p.review_id);assert.equal(review.due_at,null);assert.equal(review.actionability.mode,'review_only');
  assert.doesNotMatch(JSON.stringify(review),/PRIVATE_CAREER|league\.example|proposed|appearances/);
 }
 assert.equal(await result('select appearances from public.career_entries'),8);assert.equal(await result('select published from public.player_public_profiles'),true);
});
test('scouts, non-editors, untagged colleagues, archived players and foreign tenants receive no pending review',async()=>{
 await stage();assert.equal(reviews(await home(scout)).length,0);assert.equal(reviews(await home(colleague)).length,0);
 await db.query('update public.staff_player_access set can_edit=false where staff_user_id=$1',[agent]);assert.equal(reviews(await home(agent)).length,0);
 await assert.rejects(()=>home(agent,8,other),/active_tenant_staff_required/);
 await db.query('update public.players set archived_at=now() where id=$1',[player]);assert.equal(reviews(await home(owner)).length,0);
});
test('all-staff tags and explicit empty team use existing relevance rules, without granting edit rights',async()=>{
 await stage();await db.exec("update platform.player_staff_tags set all_staff=true,user_ids='{}'");assert.equal(reviews(await home(colleague)).length,1);assert.equal(reviews(await home(scout)).length,0);
 await db.exec("update platform.player_staff_tags set all_staff=false,user_ids='{}'");assert.equal(reviews(await home(owner)).length,1);assert.equal(reviews(await home(agent)).length,0);
});
test('generic completion feedback cannot hide a pending suggestion and rejection leaves ordinary tasks open',async()=>{
 const p=await stage();await db.query("insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,feedback_type) values($1,$2,$3,'completed')",[tenant,owner,'player_stats_review:'+p.review_id]);assert.equal(reviews(await home()).length,1);
 await result('select public.platform_server_review_player_stats($1,$2,$3,$4,$5)',[tenant,player,owner,p.review_id,'reject']);
 assert.equal(reviews(await home()).length,0);assert.equal(await result('select status from djm_os.tasks'),'open');assert.equal(await result('select published from public.player_public_profiles'),true);
});
test('acceptance replaces suggestion work with canonical verification, without completing tasks or publishing',async()=>{
 const p=await stage();await result('select public.platform_server_review_player_stats($1,$2,$3,$4,$5)',[tenant,player,agent,p.review_id,'accept']);
 assert.equal(reviews(await home(agent)).length,0,'The source decision is done; verification remains an admin action');
 const [review]=reviews(await home(owner));assert.equal(review.command_type,'Player review required');assert.equal(await result('select status from djm_os.tasks'),'open');assert.equal(await result('select published from public.player_public_profiles'),false);
});
test('large review volume is bounded and labelled without consuming the requested business slots',async()=>{
 await crowd(205);const feed=await home(owner,1);assert.equal(reviews(feed).length,200);assert.equal(feed.player_reviews_has_more,true);assert.equal(feed.commands.length,201);assert.equal(feed.commands[0].command_type,'Player follow-up due');
});
test('revoked agency memberships and tenants fail closed; browser execution stays denied',async()=>{
 await stage();await db.query("update platform.tenant_memberships set status='suspended' where user_id=$1",[agent]);await assert.rejects(()=>home(agent),/active_tenant_staff_required/);
 for(const status of ['provisioning','suspended','closed']){await db.query('update platform.tenants set status=$1 where id=$2',[status,tenant]);await assert.rejects(()=>home(),/active_tenant_staff_required/);}
 for(const fn of ['platform_server_agency_commands(uuid,integer)','platform_server_agency_decisions(uuid,integer)','platform_server_personal_home_commands(uuid,uuid,integer)']){
  const r:any=(await db.query("select has_function_privilege('anon',$1,'execute') as anon,has_function_privilege('authenticated',$1,'execute') as browser,has_function_privilege('service_role',$1,'execute') as server",[fn])).rows[0];assert.deepEqual(r,{anon:false,browser:false,server:true});
 }
});

test('administrator agency overview remains available while personal relevance keeps colleague-only reviews out of My work',async()=>{
 await stage();await db.query('update platform.player_staff_tags set user_ids=$1',[ [colleague] ]);
 const feed=await home(owner);assert.equal(reviews(feed).length,1,'Admin can still inspect agency review work');
 assert.equal(await result('select private.player_home_relevant($1,$2,$3)',[tenant,owner,player]),false,'The existing Home scope reader hides it in My work');
 assert.equal(reviews(await home(agent)).length,0,'An ordinary staff response never includes irrelevant reviews');
});
test('an administrator belonging to both agencies gets only the explicitly requested tenant review',async()=>{
 await stage();const foreignPlayer='30000000-0000-4000-8000-000000000099';
 await db.query('insert into platform.tenant_memberships values($1,$2,$3,$4)',[other,owner,'active','owner']);
 await db.query("insert into public.players(id,tenant_id,first_name,current_club,current_season_label,current_league,current_country) values($1,$2,'Other tenant player','Example II','2026/27','Regional League','NZ')",[foreignPlayer,other]);
 await db.query("insert into public.career_entries(player_id,season_label,club_name,league,country,appearances,starts,minutes,goals) values($1,'2026/27','Example II','Regional League','NZ',8,5,450,0)",[foreignPlayer]);
 await stage(foreignPlayer);
 assert.deepEqual(reviews(await home(owner)).map((c:any)=>c.player_id),[player]);
 assert.ok(reviews(await home(owner,8,other)).every((c:any)=>c.player_id===foreignPlayer));
});

test('review-only work never becomes urgent, and clearing canonical verification leaves reminders separate',async()=>{
 await stage();await db.query('update public.players set next_action_due=null where id=$1',[player]);await db.exec('delete from djm_os.tasks');
 const feed=await home();assert.equal(feed.status,'normal');assert.equal(feed.critical_count,0);assert.equal(feed.high_count,0);assert.equal(feed.commands.length,1);
 const p=reviews(feed)[0];await result('select public.platform_server_review_player_stats($1,$2,$3,$4,$5)',[tenant,player,owner,p.evidence.stats_review_id,'accept']);
 assert.equal(reviews(await home()).length,1);
 // Model the already separately tested canonical verification transition.
 await db.query("update public.players set verification_status='verified',review_required_at=null,review_reason=null where id=$1",[player]);
 assert.equal(reviews(await home()).length,0);assert.equal(await result('select published from public.player_public_profiles'),false);
});

test('colleagues overdue tasks cannot consume personal Home business admission slots',async()=>{
 assert.equal(oldTaskCrowding,true,'The original chain must reproduce task crowding');await colleagueTasks();
 const feed=await home(owner,1);assert.equal(feed.commands[0].command_type,'Player follow-up due');assert.ok(!feed.commands.some((c:any)=>String(c.title).includes('Colleague task')));
});
test('shared private feed helpers stay owner-only invokers without expanding caller privileges',async()=>{
 for(const fn of ['private.agency_command_feed(uuid,integer,boolean,boolean)','private.agency_decision_feed(uuid,integer,boolean,boolean)']){
  const r:any=(await db.query("select prosecdef,has_function_privilege('anon',oid,'execute') as anon,has_function_privilege('authenticated',oid,'execute') as browser,has_function_privilege('service_role',oid,'execute') as server from pg_proc where oid=$1::regprocedure",[fn])).rows[0];assert.deepEqual(r,{prosecdef:false,anon:false,browser:false,server:false});
 }
});

async function stageDetails(){
 const id=await result("insert into public.player_source_refreshes(player_id,provider,status,completed_at,raw_snapshot) values($1,'agency_player_context_v1','needs_review',now(),'{\"PRIVATE_CONTEXT_SENTINEL\":true}') returning id",[player]);
 await db.query("insert into public.player_source_suggestions(refresh_id,player_id,decision) values($1,$2,'pending')",[id,player]);return id;
}
test('saved details use the same quiet authorised Home group without leaking proposed values or sources',async()=>{
 const id=await stageDetails();for(const actor of [owner,agent]){
  const feed=await home(actor);const card=feed.commands.find((c:any)=>c.command_type==='Player details suggested');
  assert.equal(card.command_id,'player_details_review:'+id);assert.equal(card.evidence.details_review_id,id);assert.equal(card.player_id,player);assert.equal(card.priority_score,40);assert.equal(card.due_at,null);assert.equal(card.actionability.mode,'review_only');
  assert.doesNotMatch(JSON.stringify(card),/PRIVATE_CONTEXT|suggested_value|source_evidence|league\.example/);
 }
 assert.ok(!(await home(scout)).commands.some((c:any)=>c.command_type==='Player details suggested'));
 assert.ok(!(await home(colleague)).commands.some((c:any)=>c.command_type==='Player details suggested'));
});
test('resolved details leave verification and ordinary tasks separate; generic completion cannot resolve them',async()=>{
 const id=await stageDetails();await db.query("insert into platform.agency_command_feedback(tenant_id,actor_user_id,command_id,feedback_type) values($1,$2,$3,'completed')",[tenant,owner,'player_details_review:'+id]);
 assert.ok((await home()).commands.some((c:any)=>c.command_type==='Player details suggested'));
 await db.query("update public.player_source_suggestions set decision='accepted' where refresh_id=$1",[id]);
 await db.query("update public.player_source_refreshes set status='applied' where id=$1",[id]);
 await db.query("update public.players set verification_status='reviewing',review_required_at=now(),review_reason='Reviewed player details changed' where id=$1",[player]);
 const feed=await home();assert.ok(!feed.commands.some((c:any)=>c.command_type==='Player details suggested'));assert.ok(feed.commands.some((c:any)=>c.command_type==='Player review required'));
 assert.equal(await result('select status from djm_os.tasks'),'open');
});
test('details and statistics decisions coexist while business admission remains available',async()=>{
 await stage();await stageDetails();await colleagueTasks();const feed=await home(owner,1);
 assert.ok(feed.commands.some((c:any)=>c.command_type==='Player follow-up due'));assert.equal(feed.commands.filter((c:any)=>c.command_type==='Player details suggested').length,1);assert.equal(feed.commands.filter((c:any)=>c.command_type==='Player statistics suggested').length,1);
});

test('all supported staff roles can use Home and create owned tasks without a legacy global staff row',async()=>{
 await db.exec('begin');
 try{
  await db.query('delete from djm_os.team_members where user_id=$1',[owner]);
  await db.query("select set_config('test.uid',$1,true)",[owner]);
  for(const role of ['owner','admin','agent','operations','scout']){
   await db.query('update platform.tenant_memberships set role=$2 where tenant_id=$3 and user_id=$1',[owner,role,tenant]);
   const feed=await home(owner);assert.ok(Array.isArray(feed.commands),role+' can load Home');
   const created:any=(await db.query("insert into djm_os.tasks(tenant_id,title,status) values($1,$2,'open') returning *",[tenant,'Canonical staff task '+role])).rows[0];
   assert.equal(created.owner_user_id,owner,role+' receives canonical ownership');
   const personal=await result('select public.platform_server_user_task_commands($1,$2,50)',[tenant,owner]);
   assert.ok(personal.commands.some((c:any)=>c.source_id===created.id),role+' sees own new task');
   assert.equal((await db.query('select * from djm_os.team_members where user_id=$1',[owner])).rows.length,0,'No global staff backfill');
  }
 }finally{await db.exec('rollback');}
});

test('active agency membership is authoritative even when a legacy global record is inactive',async()=>{
 await db.exec('begin');
 try{
  await db.query('update djm_os.team_members set is_active=false where user_id=$1',[owner]);
  assert.ok(Array.isArray((await home(owner)).commands));
  await db.query("insert into djm_os.tasks(tenant_id,owner_user_id,title,status) values($1,$2,'Agency-owned work','open')",[tenant,owner]);
  for(const status of ['invited','suspended','ended']){
   await db.query('update platform.tenant_memberships set status=$2 where tenant_id=$3 and user_id=$1',[owner,status,tenant]);
   await denied(()=>home(owner),/active_tenant_staff_required/);
   await denied(()=>result('select public.platform_server_user_task_commands($1,$2,8)',[tenant,owner]),/active_tenant_staff_required/);
  }
 }finally{await db.exec('rollback');}
});

test('global staff alone, player membership, missing identity and inactive tenants cannot open Home or own active tasks',async()=>{
 for(const kind of ['missing membership','player role','inactive tenant']){
  await db.exec('begin');
  try{
   if(kind==='missing membership')await db.query('delete from platform.tenant_memberships where tenant_id=$1 and user_id=$2',[tenant,owner]);
   if(kind==='player role')await db.query("update platform.tenant_memberships set role='player' where tenant_id=$1 and user_id=$2",[tenant,owner]);
   if(kind==='inactive tenant')await db.query("update platform.tenants set status='suspended' where id=$1",[tenant]);
   await denied(()=>home(owner),/active_tenant_staff_required/,kind);
   await denied(()=>db.query("insert into djm_os.tasks(tenant_id,owner_user_id,title,status) values($1,$2,'Denied work','open')",[tenant,owner]),/task_owner_must_be_active_tenant_staff/,kind);
  }finally{await db.exec('rollback');}
 }
 await assert.rejects(()=>home(null as any),/active_tenant_staff_required/);
 await assert.rejects(()=>home(owner,8,null as any),/active_tenant_staff_required/);
});

test('multi-agency staff keep task feeds and revocation scoped to the selected agency',async()=>{
 await db.exec('begin');
 try{
  await db.query("insert into platform.tenant_memberships values($1,$2,'active','agent')",[other,owner]);
  await db.query('delete from djm_os.team_members where user_id=$1',[owner]);
  const created:any=(await db.query("insert into djm_os.tasks(tenant_id,owner_user_id,title,status) values($1,$2,'FOREIGN_AGENCY_TASK','open') returning id",[other,owner])).rows[0];
  assert.ok(!(await home(owner)).commands.some((c:any)=>c.source_id===created.id));
  assert.ok((await home(owner,8,other)).commands.some((c:any)=>c.source_id===created.id));
  await denied(()=>home(agent,8,other),/active_tenant_staff_required/);
  await db.query("update platform.tenant_memberships set status='ended' where tenant_id=$1 and user_id=$2",[tenant,owner]);
  await denied(()=>home(owner),/active_tenant_staff_required/);
  assert.ok((await home(owner,8,other)).commands.some((c:any)=>c.source_id===created.id));
 }finally{await db.exec('rollback');}
});

test('canonical Home access migration preserves identities, grants, security modes and data; replay and unknown bodies are guarded',async()=>{
 const identities=['public.platform_server_personal_home_commands(uuid,uuid,integer)','public.platform_server_user_task_commands(uuid,uuid,integer)','private.redream_enforce_staff_task_owner()'];
 const metadata=(id:string)=>result("select jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef) from pg_proc where oid=$1::regprocedure",[id]);
 const before=await Promise.all(identities.map(metadata));
 const rows=await result('select jsonb_agg(to_jsonb(t)) from djm_os.tasks t');
 const migration=file('20261025082614_canonical_agency_home_staff_access.sql');
 await db.exec(migration);await db.exec(migration);
 assert.deepEqual(await Promise.all(identities.map(metadata)),before);
 assert.deepEqual(await result('select jsonb_agg(to_jsonb(t)) from djm_os.tasks t'),rows);
 for(const identity of identities){
  assert.equal(await result("select has_function_privilege('anon',$1,'execute')",[identity]),false,identity);
  assert.equal(await result("select has_function_privilege('authenticated',$1,'execute')",[identity]),false,identity);
  assert.equal(await result("select has_function_privilege('service_role',$1,'execute')",[identity]),true);
 }
 const definition=await result('select pg_get_functiondef($1::regprocedure)',[identities[0]]);
 await db.exec(definition.replace('begin','begin\n -- unexpected later change'));
 try{await assert.rejects(()=>db.exec(migration),/differs from the reviewed baseline/);}finally{await db.exec(definition);}
});

test('the reviewed older staging task feed keeps its body and metadata apart from canonical staff admission',async()=>{
 const identity='public.platform_server_user_task_commands(uuid,uuid,integer)';
 const current=await result('select pg_get_functiondef($1::regprocedure)',[identity]);
 try{
  await db.exec(definition(file('20260926094944_redream_user_owned_work_v1.sql'),'public.platform_server_user_task_commands'));
  assert.equal(await result('select md5(prosrc) from pg_proc where oid=$1::regprocedure',[identity]),'b2cec93693b824128df375b7e7d7dce0');
  const original=await result('select pg_get_functiondef($1::regprocedure)',[identity]);
  await db.exec(file('20261025082614_canonical_agency_home_staff_access.sql'));
  const patched=await result('select pg_get_functiondef($1::regprocedure)',[identity]);
  const legacy='    join djm_os.team_members tm\n      on tm.user_id=m.user_id\n     and tm.is_active\n';
  assert.equal(patched,original.replace(legacy,''));
  await db.exec('begin');
  try{await db.query('delete from djm_os.team_members where user_id=$1',[owner]);assert.ok((await home(owner)).commands.some((c:any)=>c.title==='Existing follow-up'));}finally{await db.exec('rollback');}
 }finally{await db.exec(current);}
});
