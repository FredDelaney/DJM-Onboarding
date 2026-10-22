import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {before,beforeEach,after,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const tenant='20000000-0000-4000-8000-000000000001',foreign='20000000-0000-4000-8000-000000000002';
const owner='10000000-0000-4000-8000-000000000001',alex='10000000-0000-4000-8000-000000000002',sam='10000000-0000-4000-8000-000000000003',newStaff='10000000-0000-4000-8000-000000000004';
const player='30000000-0000-4000-8000-000000000001',otherPlayer='30000000-0000-4000-8000-000000000002',task='60000000-0000-4000-8000-000000000001';
async function value(sql:string,args:any[]=[]):Promise<any>{return Object.values((await db.query(`select ${sql}`,args)).rows[0])[0];}
async function actor(id:string){await value("set_config('test.user',$1,false)",[id]);}
async function tags(input:any=null,revision:any=null,id=player,t=tenant){return value('public.redream_player_staff_tags_v1($1,$2,$3,$4)',[id,input===null?null:JSON.stringify(input),revision,t]);}
async function visible(items:any[],overview=false,t=tenant){return (await value('public.redream_home_relevance_v1($1,$2,$3)',[JSON.stringify(items),t,overview])).visible_indices;}
const signal={source_type:'player',source_id:player};
before(async()=>{
 await db.exec(`create schema auth;create schema private;create schema platform;create schema djm_os;
 create role authenticated;create role anon;create role service_role;
 grant usage on schema auth,private to authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create function private.redream_request_tenant() returns uuid language sql stable as $$select '${tenant}'::uuid$$;
 create table platform.tenants(id uuid primary key,status text);
 create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text);
 create table public.profiles(id uuid,display_name text);
 create table platform.audit_events(tenant_id uuid,actor_user_id uuid,actor_kind text,action text,entity_type text,entity_id text,metadata jsonb);
 create table public.players(id uuid primary key,tenant_id uuid,primary_staff_user_id uuid,preferred_name text,first_name text,last_name text,next_action text,next_action_due date,contract_expiry date,football_status text);
 create table platform.player_career_strategies(id uuid,tenant_id uuid,player_id uuid,review_due_at date,strategy jsonb,status text);
 create table djm_os.deal_rooms(id uuid,tenant_id uuid,owner_user_id uuid,title text,next_action_text text,next_action_at timestamptz,status text,player_id uuid);
 create table djm_os.club_needs(id uuid,tenant_id uuid,owner_user_id uuid,title text,expires_at timestamptz,status text,organisation_id uuid);
 create table public.player_requests(id uuid,player_id uuid,assigned_to_user_id uuid,title text,due_at timestamptz,status text);
 create table public.player_agreements(id uuid,player_id uuid,title text,agreement_type text,end_date date,status text);
 create table public.player_documents(id uuid,player_id uuid,title text,expires_at date);
 create table djm_os.tasks(id uuid,tenant_id uuid,owner_user_id uuid,title text,due_at timestamptz,status text,player_id uuid,person_id uuid,organisation_id uuid,club_need_id uuid);
 insert into platform.tenants values('${tenant}','active'),('${foreign}','active');
 insert into platform.tenant_memberships values('${tenant}','${owner}','active','owner'),('${tenant}','${alex}','active','agent'),('${tenant}','${sam}','active','agent');
 insert into public.profiles values('${owner}','Owner'),('${alex}','Alex'),('${sam}','Sam'),('${newStaff}','New colleague');`);
 for(const file of ['20261004125332_calendar_workspace_tasks_v1.sql','20261012074747_shared_work_responsibility_v1.sql','20261012075754_agency_reminder_responsibility_v1.sql','20261021182616_player_staff_tags_and_personal_home.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
});
beforeEach(async()=>{
 await db.exec('reset role;delete from platform.player_staff_tags;delete from platform.work_responsibilities;delete from platform.calendar_tasks;delete from djm_os.tasks;delete from public.players;delete from platform.audit_events;');
 await db.exec(`update platform.tenant_memberships set status='active',role=case when user_id='${owner}' then 'owner' else 'agent' end;delete from platform.tenant_memberships where user_id='${newStaff}';
 insert into public.players(id,tenant_id,primary_staff_user_id,first_name) values('${player}','${tenant}','${sam}','Player'),('${otherPlayer}','${foreign}',null,'Foreign');
 insert into djm_os.tasks(id,tenant_id,owner_user_id,player_id,title,status) values('${task}','${tenant}','${alex}','${player}','Call the club','open');`);
 await actor(owner);
});
after(()=>db.close());
test('existing lead is the fallback; selected staff persist without changing player permissions or ownership',async()=>{
 const original=await tags();assert.deepEqual(original.user_ids,[sam]);assert.equal(original.revision,0);
 await tags({all_staff:false,user_ids:[alex,sam,alex]},0);
 const saved=await tags();assert.deepEqual(saved.user_ids.sort(),[alex,sam]);assert.equal(saved.revision,1);
 assert.equal(await value('(select primary_staff_user_id from public.players where id=$1)',[player]),sam);
 await actor(alex);assert.equal((await tags()).can_edit,false);assert.deepEqual(await visible([signal]),[0]);
 await actor(owner);await tags({all_staff:false,user_ids:[sam]},1);
 await actor(alex);assert.deepEqual(await visible([signal]),[]);
});
test('all staff includes a future active agency colleague; inactive and foreign users are denied',async()=>{
 await tags({all_staff:true,user_ids:[]},0);
 await db.query("insert into platform.tenant_memberships values($1,$2,'active','operations')",[tenant,newStaff]);
 await actor(newStaff);assert.deepEqual(await visible([signal]),[0]);
 await db.query("update platform.tenant_memberships set status='inactive' where user_id=$1",[newStaff]);
 await assert.rejects(()=>visible([signal]),/calendar_access_denied/);
 await actor(owner);await assert.rejects(()=>tags(null,null,otherPlayer),/player_tags_access_denied/);
 await assert.rejects(()=>tags(null,null,player,foreign),/calendar_access_denied/);
});
test('explicit task and reminder responsibility takes priority over player tags, including removals',async()=>{
 await tags({all_staff:false,user_ids:[sam]},0);
 await actor(alex);assert.deepEqual(await visible([{work_kind:'task',work_id:task,player_id:player}]),[0]);
 await db.query("insert into platform.work_responsibilities(tenant_id,work_kind,work_id,responsible_user_ids,updated_by) values($1,'task',$2,$3,$4)",[tenant,task,[sam],owner]);
 assert.deepEqual(await visible([{source_type:'task',source_id:task,player_id:player}]),[]);
 await db.query('update platform.work_responsibilities set responsible_user_ids=$1',[[alex,sam]]);
 assert.deepEqual(await visible([{source_type:'task',source_id:task,player_id:player}]),[0]);
 await db.query("insert into platform.work_responsibilities(tenant_id,work_kind,work_id,responsible_user_ids,updated_by) values($1,'player_next_action',$2,$3,$4)",[tenant,player,[alex],owner]);
 assert.deepEqual(await visible([{work_kind:'player_next_action',work_id:player}]),[0]);
 await actor(sam);assert.deepEqual(await visible([{work_kind:'player_next_action',work_id:player}]),[]);
});
test('personal and shared Calendar tasks keep their existing privacy and person assignments',async()=>{
 await actor(alex);
 const personal=(await value('public.redream_calendar_task_create_v1($1,$2)',[JSON.stringify({title:'Private',visibility:'personal'}),tenant])).task;
 const shared=(await value('public.redream_calendar_task_create_v1($1,$2)',[JSON.stringify({title:'Shared',visibility:'company',responsible_user_ids:[alex,sam]}),tenant])).task;
 await actor(sam);assert.deepEqual(await visible([{work_kind:'calendar_task',work_id:personal.id},{work_kind:'calendar_task',work_id:shared.id}]),[1]);
 await actor(owner);assert.deepEqual(await visible([{work_kind:'calendar_task',work_id:personal.id}]),[]);
});
test('stale saves, outsiders, inactive members and invalid payloads reject without overwriting tags',async()=>{
 await tags({all_staff:false,user_ids:[alex]},0);
 await assert.rejects(()=>tags({all_staff:true,user_ids:[]},0),/player_tags_conflict/);
 await assert.rejects(()=>tags({all_staff:false,user_ids:[newStaff]},1),/task_owner_inactive/);
 await assert.rejects(()=>tags({all_staff:true,user_ids:[alex]},1),/player_tags_input_invalid/);
 await assert.rejects(()=>tags({all_staff:false,user_ids:'all'},1),/player_tags_input_invalid/);
 assert.deepEqual((await tags()).user_ids,[alex]);
 await actor(alex);await assert.rejects(()=>tags({all_staff:true,user_ids:[]},1),/player_tags_edit_denied/);
 await actor(sam);assert.equal((await tags()).can_edit,true);
});
test('unassigned players reach admin triage; agency overview is restricted to managers',async()=>{
 await tags({all_staff:false,user_ids:[]},0);
 assert.deepEqual(await visible([signal]),[0]);
 await actor(alex);assert.deepEqual(await visible([signal]),[]);
 await assert.rejects(()=>visible([signal],true),/home_overview_denied/);
 await actor(owner);await tags({all_staff:false,user_ids:[sam]},1);
 assert.deepEqual(await visible([signal]),[]);assert.deepEqual(await visible([signal],true),[0]);
});
test('direct table and private helper access, players and anonymous callers are denied',async()=>{
 assert.equal(await value("has_function_privilege('anon','public.redream_player_staff_tags_v1(uuid,jsonb,integer,uuid)','execute')"),false);
 assert.equal(await value("has_function_privilege('authenticated','private.staff_home_item_relevant(uuid,uuid,jsonb)','execute')"),false);
 assert.equal(await value("(select relrowsecurity from pg_class where oid='platform.player_staff_tags'::regclass)"),true);
 await db.exec('set role authenticated');await assert.rejects(()=>db.query('select * from platform.player_staff_tags'),/permission denied/);await db.exec('reset role');
 await actor('');await assert.rejects(()=>tags(),/calendar_access_denied/);
 await actor(alex);await db.query("update platform.tenant_memberships set role='player' where user_id=$1",[alex]);await assert.rejects(()=>tags(),/calendar_access_denied/);
});
test('foreign player/task references and malformed IDs never enter My work',async()=>{
 assert.deepEqual(await visible([{source_type:'player',source_id:otherPlayer},{work_kind:'task',work_id:otherPlayer},{source_type:'player',source_id:'bad'}]),[]);
});

test('a player tag changes attention, never completion or reassignment rights',async()=>{
 await tags({all_staff:false,user_ids:[alex]},0);
 await actor(alex);
 const refs=[{work_kind:'player_next_action',work_id:player},{work_kind:'task',work_id:task}];
 const result=await value('public.redream_home_relevance_v1($1,$2,false)',[JSON.stringify(refs),tenant]);
 assert.deepEqual(result.visible_indices,[0,1]);assert.deepEqual(result.editable_indices,[1]);
});
