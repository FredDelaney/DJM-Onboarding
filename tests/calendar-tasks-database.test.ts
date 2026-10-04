import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const tenant='20000000-0000-4000-8000-000000000001', foreign='20000000-0000-4000-8000-000000000002';
const owner='10000000-0000-4000-8000-000000000001', agent='10000000-0000-4000-8000-000000000002', colleague='10000000-0000-4000-8000-000000000003';
async function value(sql:string,params:any[]=[]):Promise<any>{return Object.values((await db.query(`select ${sql}`,params)).rows[0])[0];}
async function actor(id:string){await value("set_config('test.user',$1,false)",[id]);}
async function create(input:any){return (await value('public.redream_calendar_task_create_v1($1,null)',[JSON.stringify(input)])).task;}
async function change(task:any,action:string,input:any={}){return (await value('public.redream_calendar_task_update_v1($1,$2,$3,$4,null)',[task.id,task.revision,action,JSON.stringify(input)])).task;}
async function read(mode='range',options:any={}){return value("public.redream_calendar_tasks_v1('2026-10-01','2026-11-01','Europe/Rome',$1,$2,$3,$4,$5,null)",[mode,options.done||false,options.archived||false,options.cursor?JSON.stringify(options.cursor):null,options.limit||100]);}
before(async()=>{
 await db.exec(`create schema auth;create schema private;create schema platform;create schema djm_os;
 create role authenticated;create role anon;create role service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create table platform.tenants(id uuid primary key,status text);
 create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text);
 create table public.profiles(id uuid,display_name text);
 create table platform.audit_events(tenant_id uuid,actor_user_id uuid,actor_kind text,action text,entity_type text,entity_id text,before_state jsonb,after_state jsonb,metadata jsonb);
 create table djm_os.tasks(id uuid,title text);insert into djm_os.tasks values(gen_random_uuid(),'Existing work');
 create function private.redream_request_tenant() returns uuid language sql stable as $$select '${tenant}'::uuid$$;
 insert into platform.tenants values('${tenant}','active'),('${foreign}','active');
 insert into platform.tenant_memberships values('${tenant}','${owner}','active','owner'),('${tenant}','${agent}','active','agent'),('${tenant}','${colleague}','active','scout');
 insert into public.profiles values('${owner}','Owner'),('${agent}','Agent'),('${colleague}','Colleague');`);
 await actor(owner);
 const migration=readdirSync('supabase/migrations').find(name=>name.endsWith('_calendar_workspace_tasks_v1.sql'));
 assert.ok(migration,'calendar task migration is required');
 await db.exec(readFileSync(`supabase/migrations/${migration}`,'utf8'));
 await db.exec(readFileSync('supabase/migrations/20261004134529_calendar_task_owner_edit_guard.sql','utf8'));
});
after(()=>db.close());
test('personal content is owner-only, including against tenant administrators',async()=>{
 await actor(agent);const task=await create({title:'Private plan',notes:'Secret note',due_on:'2026-10-04'});
 assert.equal(task.visibility,'personal');assert.equal(task.owner_user_id,agent);
 for(const other of [owner,colleague]){await actor(other);assert.ok(!(await read()).items.some((row:any)=>row.id===task.id));await assert.rejects(()=>change(task,'complete'),/task_access_denied/);}
 await actor(agent);assert.equal((await change(task,'complete')).status,'done');
});
test('company tasks are staff-readable with explicit mutation rights',async()=>{
 await actor(owner);let task=await create({title:'Company plan',visibility:'company',owner_user_id:agent,due_on:'2026-10-08'});
 await actor(colleague);const shared=(await read()).items.find((row:any)=>row.id===task.id);assert.equal(shared.can_edit,false);await assert.rejects(()=>change(task,'complete'),/task_edit_denied/);
 await actor(agent);task=await change(task,'complete');assert.equal(task.status,'done');
 await actor(owner);task=await change(task,'reopen');assert.equal(task.status,'open');
 for(const role of ['admin','agent','scout','operations','owner']){await db.query('update platform.tenant_memberships set role=$1 where user_id=$2',[role,colleague]);await actor(colleague);assert.ok((await read()).items.some((row:any)=>row.id===task.id));}
 await db.query("update platform.tenant_memberships set role='scout' where user_id=$1",[colleague]);
});
test('stale revisions, inactive assignees and immutable visibility reject',async()=>{
 await actor(owner);let task=await create({title:'Versioned work',visibility:'company',owner_user_id:agent,due_on:'2026-10-09'});
 const old=task;task=await change(task,'edit',{title:'New title'});await assert.rejects(()=>change(old,'complete'),/task_revision_conflict/);
 await assert.rejects(()=>change(task,'edit',{visibility:'personal'}),/task_visibility_immutable/);
 await db.query("update platform.tenant_memberships set status='inactive' where user_id=$1",[agent]);
 assert.equal((await read()).items.find((row:any)=>row.id===task.id).needs_reassignment,true);
 await assert.rejects(()=>create({title:'Inactive owner',visibility:'company',owner_user_id:agent}),/task_owner_inactive/);
 await assert.rejects(()=>change(task,'edit',{owner_user_id:agent}),/task_owner_inactive/);
 await assert.rejects(()=>change(task,'edit',{title:'Owner left while editing'}),/task_owner_inactive/);
 task=await change(task,'complete');assert.equal(task.status,'done');
 task=await change(task,'reopen');
 task=await change(task,'edit',{owner_user_id:owner});assert.equal(task.owner_user_id,owner);
 await db.query("update platform.tenant_memberships set status='active' where user_id=$1",[agent]);
});
test('audit contains no personal title, notes or dates and legacy rows are untouched',async()=>{
 await actor(agent);const task=await create({title:'PrivateSentinel',notes:'SecretSentinel',due_on:'2041-02-15'});await change(task,'complete');
 const logs=JSON.stringify((await db.query('select * from platform.audit_events')).rows);assert.ok(!logs.includes('PrivateSentinel'));assert.ok(!logs.includes('SecretSentinel'));assert.ok(!logs.includes('2041-02-15'));
 assert.deepEqual((await db.query('select title from djm_os.tasks')).rows,[{title:'Existing work'}]);
});
test('validation, retry idempotency and reversible archive',async()=>{
 await actor(owner);for(const input of [{title:' '},{title:'x'.repeat(201)},{title:'Valid',notes:'x'.repeat(2001)},{title:'Valid',visibility:'public'},{title:'Valid',owner_user_id:agent}])await assert.rejects(()=>create(input),/task_/);
 const input={id:'50000000-0000-4000-8000-000000000001',title:'Retry safe',due_on:'2026-10-12'};let task=await create(input);assert.equal((await create(input)).id,task.id);await assert.rejects(()=>create({...input,title:'Different'}),/task_create_conflict/);
 task=await change(task,'archive');assert.ok(task.archived_at);assert.ok(!(await read()).items.some((row:any)=>row.id===task.id));await assert.rejects(()=>change(task,'edit',{title:'Oops'}),/task_archived/);task=await change(task,'restore');assert.equal(task.archived_at,null);
});
test('foreign tenants, player actors, anonymous and direct table reads deny',async()=>{
 await actor(owner);await assert.rejects(()=>value('public.redream_calendar_task_create_v1($1,$2)',[JSON.stringify({title:'Foreign'}),foreign]),/calendar_access_denied/);
 await db.exec('set role authenticated');await assert.rejects(()=>db.query('select * from platform.calendar_tasks'),/permission denied/);await db.exec('reset role');
 assert.equal(await value("has_function_privilege('anon','public.redream_calendar_task_create_v1(jsonb,uuid)','execute')"),false);
 await actor('');await assert.rejects(()=>read(),/calendar_access_denied/);
 await actor(colleague);await db.query("update platform.tenant_memberships set role='player' where user_id=$1",[colleague]);await assert.rejects(()=>read(),/calendar_access_denied/);await db.query("update platform.tenant_memberships set role='scout' where user_id=$1",[colleague]);
});
test('timed task writes reject daylight-saving gaps and overlaps',async()=>{
 await actor(owner);
 await assert.rejects(()=>create({title:'Gap',due_on:'2026-03-29',due_time:'02:30',time_zone:'Europe/Rome'}),/task_time_invalid/);
 await assert.rejects(()=>create({title:'Overlap',due_on:'2026-10-25',due_time:'02:30',time_zone:'Europe/Rome'}),/task_time_ambiguous/);
 const valid=await create({title:'Normal time',due_on:'2026-10-25',due_time:'03:30',time_zone:'Europe/Rome'});
 assert.equal(new Date(valid.due_at).toISOString(),'2026-10-25T02:30:00.000Z');
 await assert.rejects(()=>create({title:'Bad zone',due_on:'2026-10-25',due_time:'03:30',time_zone:'Made/Up'}),/task_time_invalid/);
 await assert.rejects(()=>create({title:'No date',due_time:'03:30',time_zone:'Europe/Rome'}),/task_time_invalid/);
});
test('range reads paginate authorised rows and keep undated work separate',async()=>{
 await actor(agent);const task=await create({title:'No date personal'});
 const undated=await read('undated');assert.ok(undated.items.some((r:any)=>r.id===task.id));
 assert.ok(!(await read()).items.some((r:any)=>r.id===task.id));
 await actor(owner);assert.ok(!(await read('undated')).items.some((r:any)=>r.id===task.id));
 const first=await read('range',{limit:1});assert.equal(first.items.length,1);assert.ok(first.next_cursor);const second=await read('range',{limit:1,cursor:first.next_cursor});assert.notEqual(first.items[0].id,second.items[0].id);assert.equal(first.count,second.count);
 const assignees=await value('public.redream_calendar_task_assignees_v1(null)');assert.equal(assignees.items.length,3);
});
