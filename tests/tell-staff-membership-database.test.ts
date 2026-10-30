import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {before,after,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const read=(name:string)=>readFileSync('supabase/migrations/'+name,'utf8');
const migration=read('20261028082359_canonical_tell_staff_membership.sql');
const settingsMigration=read('20261028082648_canonical_tell_settings_access.sql');
const scopedSettingsMigration=read('20261028082835_scope_tell_settings_to_request_workspace.sql');
function routine(file:string,name:string){
 const source=read(file),start=source.toLowerCase().indexOf('create or replace function '+name.toLowerCase()+'(');
 assert.ok(start>=0,name+' is present in the historical source');
 const tail=source.slice(start),tag=/\bas\s+(\$[\w]*\$)/i.exec(tail);assert.ok(tag);
 const end=tail.indexOf(tag[1],tag.index+tag[0].length);assert.ok(end>=0);
 return tail.slice(0,end+tag[1].length)+';';
}
const user=(i:number)=>`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const tenant=(i:number)=>`20000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const scalar=async(sql:string,args:any[]=[])=>Object.values((await db.query<any>('select '+sql,args)).rows[0])[0] as any;
const actor=async(i:number,t=1)=>db.query("select set_config('test.user',$1,false),set_config('test.tenant',$2,false),set_config('request.headers',$3,false)",[user(i),tenant(t),JSON.stringify({'x-redream-workspace':'qa-test-'+t})]);
const capture=async(i=1,t=1)=>(await db.query<any>("insert into djm_os.captures(tenant_id,submitted_by,transcript_text,status) values($1,$2,'Alex and Moses will send reviewed footage.','processing') returning id",[tenant(t),user(i)])).rows[0].id;
const resolve=(id:string,name:string)=>scalar('public.redream_ai_resolve_team_member($1,$2)',[id,name]);
const stage=(id:string,hash:string,ids:string[])=>scalar('public.redream_ai_stage_action($1,$2,0,\'create_task\',0.99,\'Alex and Moses will send reviewed footage.\',$3)',[id,hash,JSON.stringify({title:'Send reviewed footage',owner_user_id:ids[0],responsible_user_ids:ids})]);
const metadata=()=>db.query<any>("select oid,proname,md5(prosrc) as hash,to_jsonb(p)-'prosrc' as metadata from pg_proc p where proname in ('redream_ai_user_can_process','redream_ai_resolve_team_member','redream_ai_sync_task_responsibility','redream_ai_approve_capture','redream_ai_task_context') order by proname");
let initial:any[],baselineCapture:string;
before(async()=>{
 await db.exec(`
 create schema djm_os;create schema platform;create schema private;create schema auth;
 create role anon;create role authenticated;create role service_role;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create table platform.tenants(id uuid primary key,status text,slug text);
 create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text);
 create table public.profiles(id uuid primary key,display_name text);
 create table djm_os.team_members(user_id uuid primary key references auth.users(id) on delete cascade,display_name text,is_active boolean);
 create function djm_os.is_team_member() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from djm_os.team_members where user_id=auth.uid() and is_active)$$;
 create table djm_os.tell_djm_settings(id integer primary key,is_live boolean);
 insert into djm_os.tell_djm_settings values(1,true);
 alter table djm_os.tell_djm_settings enable row level security;
 create policy tell_djm_settings_select on djm_os.tell_djm_settings for select to authenticated using((select djm_os.is_team_member()));
 create table djm_os.tell_djm_permissions(tenant_id uuid references platform.tenants(id),user_id uuid references djm_os.team_members(user_id) on delete cascade,is_enabled boolean,permission_scope text check(permission_scope in ('full','scout','read_only')),primary key(tenant_id,user_id));
 create table public.notification_preferences(user_id uuid primary key,timezone text);
 create table djm_os.captures(id uuid primary key default gen_random_uuid(),tenant_id uuid,submitted_by uuid,transcript_text text,status text,completed_at timestamptz,receipt_json jsonb,person_id uuid,organisation_id uuid,player_id uuid,created_at timestamptz default now(),processing_version text default 'tell_djm_v1');
 create table platform.calendar_tasks(id uuid primary key default gen_random_uuid(),tenant_id uuid,owner_user_id uuid,title text,status text,due_on date,due_time time,time_zone text,due_at timestamptz,archived_at timestamptz,visibility text default 'company',responsible_user_ids uuid[] default '{}',revision integer default 1,updated_at timestamptz default now());
 create table djm_os.tasks(id uuid primary key default gen_random_uuid(),tenant_id uuid,owner_user_id uuid references djm_os.team_members(user_id) on delete set null,title text,status text,due_at timestamptz,completed_at timestamptz,updated_at timestamptz,person_id uuid,organisation_id uuid,player_id uuid,interaction_id uuid,source text);
 create table djm_os.people(id uuid,tenant_id uuid,full_name text);
 create table djm_os.organisations(id uuid,tenant_id uuid,name text);
 create table public.players(id uuid primary key,tenant_id uuid,first_name text,last_name text);
 create table platform.audit_events(tenant_id uuid,actor_user_id uuid,actor_kind text,action text,entity_type text,entity_id text,before_state jsonb,after_state jsonb,metadata jsonb);
 create table djm_os.tell_djm_actions(id uuid primary key default gen_random_uuid(),tenant_id uuid,capture_id uuid,action_hash text,action_index integer,action_type text,status text,confidence numeric,evidence text,proposed_payload jsonb,resolved_payload jsonb,target_type text,target_id uuid,before_json jsonb,after_json jsonb,verification_json jsonb,undo_supported boolean,error_message text,applied_at timestamptz,undone_at timestamptz,updated_at timestamptz,created_at timestamptz default now(),unique(capture_id,action_hash));
 create table djm_os.tell_djm_questions(capture_id uuid,status text);
 create table djm_os.review_items(tenant_id uuid,capture_id uuid,review_type text,status text,resolved_at timestamptz,owner_user_id uuid references djm_os.team_members(user_id) on delete set null);
 create table djm_os.events(tenant_id uuid,event_type text,actor_user_id uuid references djm_os.team_members(user_id) on delete set null,person_id uuid,organisation_id uuid,player_id uuid,payload jsonb,source text,confidence numeric,occurred_at timestamptz);
 create table djm_os.notifications(id uuid primary key default gen_random_uuid(),user_id uuid references djm_os.team_members(user_id) on delete cascade);
 create table djm_os.tell_djm_aliases(id uuid primary key default gen_random_uuid(),owner_user_id uuid references djm_os.team_members(user_id) on delete cascade);
 create table platform.work_responsibilities(tenant_id uuid,work_kind text,work_id uuid,responsible_user_ids uuid[],revision integer,updated_by uuid,updated_at timestamptz default now(),unique(tenant_id,work_kind,work_id),check(cardinality(responsible_user_ids)<=50));
 create function private.tell_assert_entities(t uuid,p jsonb) returns void language sql as $$select$$;
 create function public.redream_ai_receipt(c uuid) returns jsonb language sql as $$select jsonb_build_object('capture',(select to_jsonb(x) from djm_os.captures x where id=c),'actions',(select jsonb_agg(x) from djm_os.tell_djm_actions x where capture_id=c))$$;
 -- The unchanged low-level writer is a boundary fixture. Target guards and trigger below are real historical functions.
 create function public.redream_ai_apply_action(c uuid,h text,i integer,typ text,conf numeric,e text,p jsonb) returns jsonb language plpgsql as $$declare tid uuid;begin
 insert into djm_os.tasks(tenant_id,owner_user_id,title,status,updated_at,source) select tenant_id,submitted_by,p->>'title','open',now(),'tell_djm:'||c::text||':'||h from djm_os.captures where id=c returning id into tid;
 update djm_os.tell_djm_actions set status='applied',undo_supported=true,applied_at=now(),target_type='task',target_id=tid,after_json=(select to_jsonb(t) from djm_os.tasks t where id=tid) where capture_id=c and action_hash=h;
 return jsonb_build_object('status','applied','target_id',tid);end$$;
 `);
 await db.exec(routine('20260913101801_enforce_core_tenant_isolation.sql','private.user_has_staff_tenant_access'));
 await db.exec('revoke all on function private.user_has_staff_tenant_access(uuid,uuid) from public;grant execute on function private.user_has_staff_tenant_access(uuid,uuid) to authenticated,service_role');
 await db.exec(routine('20260915192303_tell_capture_workspace_boundary.sql','private.tell_request_tenant'));
 await db.exec('revoke all on function private.tell_request_tenant() from public,anon;grant execute on function private.tell_request_tenant() to authenticated,service_role');
 await db.exec(routine('20260915192303_tell_capture_workspace_boundary.sql','private.tell_assert_capture'));
 await db.exec(routine('20260915192303_tell_capture_workspace_boundary.sql','public.djm_tell_user_can_process').replace('public.djm_tell_user_can_process','public.redream_ai_user_can_process'));
 for(const name of ['redream_ai_approve_capture','redream_ai_resolve_team_member','redream_ai_stage_action','redream_ai_task_context'])await db.exec(routine('20261020162412_tell_redream_task_updates.sql','public.'+name));
 await db.exec(routine('20261022191532_connected_work_and_player_photo_reliability.sql','public.redream_ai_task_context'));
 await db.exec(routine('20261018205540_fix_redream_shared_task_responsibility_validation.sql','private.redream_ai_sync_task_responsibility'));
 await db.exec(routine('20261020162412_tell_redream_task_updates.sql','public.redream_ai_undo_action'));
 await db.exec(read('20261020172347_restore_missing_tell_undo_dependency.sql'));
 await db.exec(read('20261025072558_guard_task_creation_undo.sql'));
 await db.exec(`create trigger redream_ai_sync_task_responsibility before insert or update on djm_os.tell_djm_actions for each row execute function private.redream_ai_sync_task_responsibility();
 grant usage on schema public,private,platform,djm_os,auth to service_role,authenticated;
 grant select on all tables in schema public,platform,djm_os to service_role;
 grant select,insert,update,delete on djm_os.tell_djm_settings to authenticated;
 revoke all on function public.redream_ai_user_can_process(uuid,uuid),public.redream_ai_resolve_team_member(uuid,text),public.redream_ai_task_context(uuid),public.redream_ai_stage_action(uuid,text,integer,text,numeric,text,jsonb) from public,anon,authenticated;
 grant execute on function public.redream_ai_user_can_process(uuid,uuid),public.redream_ai_resolve_team_member(uuid,text),public.redream_ai_task_context(uuid),public.redream_ai_stage_action(uuid,text,integer,text,numeric,text,jsonb) to service_role;
 revoke all on function public.redream_ai_approve_capture(uuid) from public,anon;
 grant execute on function public.redream_ai_approve_capture(uuid) to authenticated,service_role;
 `);
 for(const i of [1,2])await db.query("insert into platform.tenants values($1,'active',$2)",[tenant(i),'qa-test-'+i]);
 for(const [i,role,status,t] of [[1,'owner','active',1],[2,'agent','active',1],[3,'operations','active',1],[4,'scout','active',1],[5,'admin','active',1],[6,'player','active',1],[7,'agent','suspended',1],[8,'agent','ended',1],[9,'agent','invited',1],[10,'owner','active',2]] as const){
 await db.query('insert into auth.users values($1)',[user(i)]);
 await db.query('insert into platform.tenant_memberships values($1,$2,$3,$4)',[tenant(t),user(i),status,role]);
 await db.query('insert into public.profiles values($1,$2)',[user(i),i===2?'Alex Agent':i===3?'Moses Agent':'Staff '+i]);
 }
 await db.query("insert into djm_os.team_members values($1,'Legacy creator',false)",[user(1)]);
 await db.query("insert into djm_os.tell_djm_permissions values($1,$2,true,'full')",[tenant(1),user(1)]);
 await assert.rejects(()=>db.query("insert into djm_os.tell_djm_permissions values($1,$2,true,'full')",[tenant(1),user(2)]),(error:any)=>error.code==='23503');
 await actor(1);baselineCapture=await capture();initial=(await metadata()).rows;
 assert.equal(await scalar('public.redream_ai_user_can_process($1,$2)',[user(1),baselineCapture]),false,'Reproduce the missing global staff prerequisite');
 assert.equal((await resolve(baselineCapture,'Alex')).resolved,false);
 await db.exec(migration);
 await db.query('delete from djm_os.team_members where user_id=$1',[user(1)]);
 assert.equal(await scalar('count(*)::int from djm_os.tell_djm_permissions where user_id=$1',[user(1)]),1,'Deleting a legacy global row cannot erase this agency permission');
 for(const i of [2,3,4,5,6,7,8,9,10])await db.query("insert into djm_os.tell_djm_permissions values($1,$2,true,'full')",[tenant(i===10?2:1),user(i)]);
 await db.exec('set role authenticated');
 try{assert.equal(await scalar('count(*)::int from djm_os.tell_djm_settings'),0,'Reproduce the invoker intake settings read-policy blocker');}finally{await db.exec('reset role');}
 await db.exec(settingsMigration);
 await db.exec('set role authenticated');
 try{await assert.rejects(()=>scalar('count(*)::int from djm_os.tell_djm_settings'),/permission denied for table tenant_memberships/);}finally{await db.exec('reset role');}
 await db.exec(scopedSettingsMigration);
});
after(async()=>{await db.close();});

test('repair preserves all target metadata and supports canonical staff without global team rows',async()=>{
 const current=(await metadata()).rows;assert.deepEqual(current.map(r=>r.metadata),initial.map(r=>r.metadata));
 assert.equal(await scalar('count(*)::int from djm_os.team_members'),0);
 for(const i of [1,2,3,4,5]){
 const id=await capture(i);assert.equal(await scalar('public.redream_ai_user_can_process($1,$2)',[user(i),id]),true);
 }
 assert.equal((await resolve(baselineCapture,'Alex')).user_id,user(2));
 assert.equal((await resolve(baselineCapture,'Moses')).user_id,user(3));
});
test('foreign, player, suspended, ended, invited, disabled-AI and inactive-agency processing remains denied',async()=>{
 for(const i of [6,7,8,9]){const id=await capture(i);assert.equal(await scalar('public.redream_ai_user_can_process($1,$2)',[user(i),id]),false);await assert.rejects(()=>resolve(id,'Alex'),/Capture access denied/);}
 assert.equal(await scalar('public.redream_ai_user_can_process($1,$2)',[user(10),baselineCapture]),false);
 await db.query('update djm_os.tell_djm_permissions set is_enabled=false where user_id=$1',[user(1)]);
 assert.equal(await scalar('public.redream_ai_user_can_process($1,$2)',[user(1),baselineCapture]),false);
 await db.query('update djm_os.tell_djm_permissions set is_enabled=true where user_id=$1',[user(1)]);
 await db.query("update platform.tenants set status='suspended' where id=$1",[tenant(1)]);
 assert.equal(await scalar('public.redream_ai_user_can_process($1,$2)',[user(1),baselineCapture]),false);
 await db.query("update platform.tenants set status='active' where id=$1",[tenant(1)]);
});
test('two current agency colleagues save together and repeated approval does not duplicate the task',async()=>{
 await actor(1);const id=await capture();await stage(id,'shared',[user(2),user(3)]);
 await scalar('public.redream_ai_approve_capture($1)',[id]);
 const action=await scalar('to_jsonb(a) from djm_os.tell_djm_actions a where capture_id=$1',[id]);assert.equal(action.status,'applied');
 assert.equal(await scalar('owner_user_id from djm_os.tasks where id=$1',[action.target_id]),user(2));
 assert.deepEqual(await scalar('responsible_user_ids from platform.work_responsibilities where work_id=$1',[action.target_id]),[user(2),user(3)]);
 const before=await scalar('count(*)::int from djm_os.tasks');await scalar('public.redream_ai_approve_capture($1)',[id]);assert.equal(await scalar('count(*)::int from djm_os.tasks'),before);
 const context=await scalar('public.redream_ai_task_context($1)',[id]);
 assert.equal(context.tasks.some((t:any)=>t.id===action.target_id),false,'The creator is not silently added to responsibility');
 const colleagueCapture=await capture(2);
 const colleagueContext=await scalar('public.redream_ai_task_context($1)',[colleagueCapture]);
 assert.equal(colleagueContext.tasks.find((t:any)=>t.id===action.target_id)?.owner_display_name,'Alex Agent');
});
test('reversed spoken order keeps one responsibility revision and supports guarded creation Undo',async()=>{
 await actor(1);const id=await capture();await stage(id,'reversed',[user(3),user(2)]);
 await scalar('public.redream_ai_approve_capture($1)',[id]);
 const action=await scalar('to_jsonb(a) from djm_os.tell_djm_actions a where capture_id=$1',[id]);assert.equal(action.status,'applied');
 assert.equal(await scalar('revision from platform.work_responsibilities where work_id=$1',[action.target_id]),1);
 assert.equal(await scalar('owner_user_id from djm_os.tasks where id=$1',[action.target_id]),user(3),'The explicit primary owner is retained');
 await scalar('public.redream_ai_undo_action($1)',[action.id]);
 assert.equal(await scalar('count(*)::int from djm_os.tasks where id=$1',[action.target_id]),0);
 assert.equal(await scalar('count(*)::int from platform.work_responsibilities where work_id=$1',[action.target_id]),0);
 assert.equal(await scalar('status from djm_os.tell_djm_actions where id=$1',[action.id]),'undone');
});
test('revoked or foreign responsibility fails atomically without creating a task',async()=>{
 for(const invalid of [6,7,8,9,10]){
 await actor(1);const id=await capture();await stage(id,'invalid-'+invalid,[user(2),user(invalid)]);
 const before=await scalar('count(*)::int from djm_os.tasks');await scalar('public.redream_ai_approve_capture($1)',[id]);
 assert.equal(await scalar('status from djm_os.tell_djm_actions where capture_id=$1',[id]),'failed');assert.equal(await scalar('count(*)::int from djm_os.tasks'),before);
 }
});
test('service-only processing and resolution grants remain enforced',async()=>{
 for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);
 try{await assert.rejects(()=>resolve(baselineCapture,'Alex'),/permission denied/);await assert.rejects(()=>scalar('public.redream_ai_user_can_process($1,$2)',[user(1),baselineCapture]),/permission denied/);}finally{await db.exec('reset role');}
 }
 await db.exec('set role service_role');try{assert.equal((await resolve(baselineCapture,'Alex')).user_id,user(2));}finally{await db.exec('reset role');}
});
test('known repair replay is a catalog and data no-op',async()=>{
 const before=(await metadata()).rows, tasks=await scalar('jsonb_agg(to_jsonb(t) order by id) from djm_os.tasks t');await db.exec(migration);
 assert.deepEqual((await metadata()).rows,before);assert.deepEqual(await scalar('jsonb_agg(to_jsonb(t) order by id) from djm_os.tasks t'),tasks);
});

test('the permission identity FK still rejects unknown users and cascades on auth deletion',async()=>{
 await assert.rejects(()=>db.query("insert into djm_os.tell_djm_permissions values($1,$2,true,'full')",[tenant(1),user(99)]),(error:any)=>error.code==='23503');
 await db.query('insert into auth.users values($1)',[user(11)]);
 await db.query("insert into djm_os.tell_djm_permissions values($1,$2,true,'full')",[tenant(1),user(11)]);
 const id=await capture(11);assert.equal(await scalar('public.redream_ai_user_can_process($1,$2)',[user(11),id]),false,'An enabled flag never grants nonmember access');
 await db.query('delete from auth.users where id=$1',[user(11)]);
 assert.equal(await scalar('count(*)::int from djm_os.tell_djm_permissions where user_id=$1',[user(11)]),0);
});
test('membership revoked after preparation prevents the whole proposed task from saving',async()=>{
 await actor(1);const id=await capture();await stage(id,'revoked-later',[user(2),user(3)]);
 const before=await scalar('count(*)::int from djm_os.tasks');
 await db.query("update platform.tenant_memberships set status='ended' where tenant_id=$1 and user_id=$2",[tenant(1),user(3)]);
 try{await scalar('public.redream_ai_approve_capture($1)',[id]);assert.equal(await scalar('status from djm_os.tell_djm_actions where capture_id=$1',[id]),'failed');assert.equal(await scalar('count(*)::int from djm_os.tasks'),before);}
 finally{await db.query("update platform.tenant_memberships set status='active' where tenant_id=$1 and user_id=$2",[tenant(1),user(3)]);}
});
test('read-only AI scope can process but cannot approve proposed writes',async()=>{
 await actor(1);const id=await capture();await stage(id,'read-only',[user(2),user(3)]);
 const before=await scalar('count(*)::int from djm_os.tasks');
 await db.query("update djm_os.tell_djm_permissions set permission_scope='read_only' where tenant_id=$1 and user_id=$2",[tenant(1),user(1)]);
 try{assert.equal(await scalar('public.redream_ai_user_can_process($1,$2)',[user(1),id]),true);await assert.rejects(()=>scalar('public.redream_ai_approve_capture($1)',[id]),/Capture access denied/);assert.equal(await scalar('count(*)::int from djm_os.tasks'),before);}
 finally{await db.query("update djm_os.tell_djm_permissions set permission_scope='full' where tenant_id=$1 and user_id=$2",[tenant(1),user(1)]);}
});
test('creation Undo still refuses newer task and responsibility changes',async()=>{
 for(const kind of ['task','responsibility']){
 await actor(1);const id=await capture();await stage(id,'newer-'+kind,[user(3),user(2)]);await scalar('public.redream_ai_approve_capture($1)',[id]);
 const action=await scalar('to_jsonb(a) from djm_os.tell_djm_actions a where capture_id=$1',[id]);
 if(kind==='task')await db.query("update djm_os.tasks set title='A newer agreed action' where id=$1",[action.target_id]);
 else await db.query('update platform.work_responsibilities set responsible_user_ids=$1,revision=revision+1,updated_at=now() where work_id=$2',[[user(2)],action.target_id]);
 await assert.rejects(()=>scalar('public.redream_ai_undo_action($1)',[action.id]),/changed/);assert.equal(await scalar('count(*)::int from djm_os.tasks where id=$1',[action.target_id]),1);
 }
});
test('legacy names, ambiguity and agency isolation remain factual',async()=>{
 await db.query('insert into auth.users values($1)',[user(12)]);await db.query("insert into platform.tenant_memberships values($1,$2,'active','agent')",[tenant(1),user(12)]);await db.query("insert into public.profiles values($1,'Alex Second')",[user(12)]);
 assert.equal((await resolve(baselineCapture,'Alex')).resolved,false);assert.equal((await resolve(baselineCapture,'Alex')).candidates.length,2);
 assert.equal((await resolve(baselineCapture,'Alex Second')).user_id,user(12));
 await db.query("insert into djm_os.team_members values($1,'Legacy Alex',false)",[user(2)]);
 assert.equal((await resolve(baselineCapture,'Legacy Alex')).user_id,user(2),'Current agency membership wins over an unrelated legacy active flag');
 await db.query('delete from djm_os.team_members where user_id=$1',[user(2)]);
 assert.equal(await scalar('count(*)::int from djm_os.tell_djm_permissions where user_id=$1',[user(2)]),1);
 assert.equal((await resolve(baselineCapture,'Staff 10')).resolved,false,'Foreign agency profiles cannot appear in the current agency resolver');
 const foreignCapture=await capture(10,2);assert.equal((await resolve(foreignCapture,'Alex')).resolved,false);
 await db.query('delete from platform.tenant_memberships where user_id=$1',[user(12)]);await db.query('delete from public.profiles where id=$1',[user(12)]);await db.query('delete from auth.users where id=$1',[user(12)]);
});
test('a foreign profile cannot become a legacy task owner label',async()=>{
 const row=(await db.query<any>("insert into djm_os.tasks(tenant_id,owner_user_id,title,status,updated_at) values($1,$2,'Legacy mismatched owner','open',now()) returning id",[tenant(1),user(10)])).rows[0];
 await db.query("insert into platform.work_responsibilities values($1,'task',$2,$3,1,$4,now())",[tenant(1),row.id,[user(1)],user(1)]);
 const context=await scalar('public.redream_ai_task_context($1)',[baselineCapture]);assert.equal(context.tasks.find((t:any)=>t.id===row.id).owner_display_name,null);
});
test('reviewed metadata and body guards refuse privilege drift and disabled triggers even after repair',async()=>{
 const before=(await metadata()).rows;
 await db.exec('grant execute on function public.redream_ai_resolve_team_member(uuid,text) to anon');
 try{await assert.rejects(()=>db.exec(migration),/reviewed baseline/);}finally{await db.exec('revoke execute on function public.redream_ai_resolve_team_member(uuid,text) from anon');}
 assert.deepEqual((await metadata()).rows,before);
 await db.exec('alter table djm_os.tell_djm_actions disable trigger redream_ai_sync_task_responsibility');
 try{await assert.rejects(()=>db.exec(migration),/trigger differs/);}finally{await db.exec('alter table djm_os.tell_djm_actions enable trigger redream_ai_sync_task_responsibility');}
 assert.deepEqual((await metadata()).rows,before);
 const original=await scalar("pg_get_functiondef('public.redream_ai_user_can_process(uuid,uuid)'::regprocedure)");
 await db.exec(routine('20261018205540_fix_redream_shared_task_responsibility_validation.sql','private.redream_ai_sync_task_responsibility'));
 await db.exec(original.replace('$function$','$function$\n-- unreviewed drift'));
 const mixed=(await metadata()).rows;
 await assert.rejects(()=>db.exec(migration),/reviewed baseline/);assert.deepEqual((await metadata()).rows,mixed,'A later mismatch cannot partially repair earlier functions');
 await db.exec(original);await db.exec(migration);assert.deepEqual((await metadata()).rows,before);
});

test('current staging without the optional legacy trigger keeps that state and saves/undoes shared work',async()=>{
 await db.exec('drop trigger redream_ai_sync_task_responsibility on djm_os.tell_djm_actions');
 try{
  await db.exec(migration);
  assert.equal(await scalar("count(*)::int from pg_trigger where tgrelid='djm_os.tell_djm_actions'::regclass and tgname='redream_ai_sync_task_responsibility'"),0,'The repair does not install another writer');
  await actor(1);const id=await capture();await stage(id,'current-staging',[user(3),user(2)]);await scalar('public.redream_ai_approve_capture($1)',[id]);
  const action=await scalar('to_jsonb(a) from djm_os.tell_djm_actions a where capture_id=$1',[id]);assert.equal(action.status,'applied');
  assert.deepEqual(await scalar('responsible_user_ids from platform.work_responsibilities where work_id=$1',[action.target_id]),[user(2),user(3)]);
  assert.equal(await scalar('revision from platform.work_responsibilities where work_id=$1',[action.target_id]),1);
  await scalar('public.redream_ai_undo_action($1)',[action.id]);assert.equal(await scalar('count(*)::int from djm_os.tasks where id=$1',[action.target_id]),0);
 }finally{await db.exec('create trigger redream_ai_sync_task_responsibility before insert or update on djm_os.tell_djm_actions for each row execute function private.redream_ai_sync_task_responsibility()');}
});

test('settings SELECT supports canonical staff while preserving denied roles, read-only RLS and replay guards',async()=>{
 const policy=()=>scalar("to_jsonb(p) from pg_policy p where polrelid='djm_os.tell_djm_settings'::regclass and polname='tell_djm_settings_select'");
 const original=await policy();
 for(const i of [1,2,3,4,5,6,7,8,9]){
  await actor(i);await db.exec('set role authenticated');
  try{
   if(i<=5)assert.equal(await scalar('count(*)::int from djm_os.tell_djm_settings'),1);
   else await assert.rejects(()=>scalar('count(*)::int from djm_os.tell_djm_settings'),/Workspace access denied/);
   if(i<=5)assert.equal((await db.query('update djm_os.tell_djm_settings set is_live=false returning id')).rows.length,0,'A read policy never authorises settings writes');
   await assert.rejects(()=>db.exec('insert into djm_os.tell_djm_settings values(2,false)'),/row-level security/);
  }finally{await db.exec('reset role');}
 }
 assert.equal(await scalar('is_live from djm_os.tell_djm_settings where id=1'),true);
 await db.exec(scopedSettingsMigration);assert.deepEqual(await policy(),original,'Known repair replay keeps the policy OID and metadata');
 await db.exec('alter policy tell_djm_settings_select on djm_os.tell_djm_settings using(true)');
 try{await assert.rejects(()=>db.exec(scopedSettingsMigration),/reviewed baseline/);}finally{
  await db.exec('alter policy tell_djm_settings_select on djm_os.tell_djm_settings using ( (select private.user_has_staff_tenant_access(private.tell_request_tenant(),auth.uid())) )');
 }
 assert.deepEqual(await policy(),original);
 await actor(1);
});
