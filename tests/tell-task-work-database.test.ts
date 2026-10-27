import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const user = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const tenant = '20000000-0000-4000-8000-000000000001';
const foreign = '20000000-0000-4000-8000-000000000002';
let capture: string;
const value = async (sql: string, args: unknown[] = []) => Object.values((await db.query<any>(`select ${sql}`, args)).rows[0])[0] as any;
const task = async (owner = user, workspace = tenant) => (await db.query<any>(`insert into djm_os.tasks(tenant_id,owner_user_id,title,status,updated_at) values($1,$2,'Speak to James about Dylan availability','open','2026-10-20T09:00:00Z') returning *`, [workspace,owner])).rows[0];
const payload = (t: any, extra = {}) => ({ task_id:t.id, task_title:t.title, expected_updated_at:t.updated_at, expected_status:t.status, operation:'complete', objective_satisfied:true, ...extra });
const apply = (key: string, p: unknown) => value('public.redream_ai_update_task($1,$2,0,0.99,$3,$4)', [capture,key,'I spoke to James about Dylan availability',p]);
before(async () => {
  await db.exec(`
    create schema djm_os; create schema platform; create schema private; create schema auth;
    create role anon; create role authenticated; create role service_role;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table public.notification_preferences(user_id uuid primary key,timezone text);
    create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text);
    create table djm_os.tell_djm_permissions(tenant_id uuid,user_id uuid,is_enabled boolean,permission_scope text);
    create table djm_os.team_members(user_id uuid,display_name text,is_active boolean);
    create table djm_os.captures(id uuid primary key default gen_random_uuid(),tenant_id uuid,submitted_by uuid,transcript_text text,status text,completed_at timestamptz,receipt_json jsonb,person_id uuid,organisation_id uuid,player_id uuid,created_at timestamptz default now(),processing_version text default 'tell_djm_v1');
    create table platform.calendar_tasks(id uuid primary key default gen_random_uuid(),tenant_id uuid,owner_user_id uuid,title text,status text,due_on date,due_time time,time_zone text,due_at timestamptz,archived_at timestamptz,visibility text default 'company',responsible_user_ids uuid[] default '{}',revision integer default 1,updated_at timestamptz default now());
    create table djm_os.tasks(id uuid primary key default gen_random_uuid(),tenant_id uuid,owner_user_id uuid,title text,status text,due_at timestamptz,completed_at timestamptz,updated_at timestamptz,person_id uuid,organisation_id uuid,player_id uuid,interaction_id uuid,source text);
    create table djm_os.interactions(id uuid primary key default gen_random_uuid(),tenant_id uuid,source_type text,occurred_at timestamptz);
    create table djm_os.scouting_prospects(id uuid primary key,tenant_id uuid);
    create table djm_os.people(id uuid,tenant_id uuid,full_name text);
    create table djm_os.organisations(id uuid,tenant_id uuid,name text);
    create table public.players(id uuid primary key,tenant_id uuid,first_name text,last_name text,profile_photo_path text,archived_at timestamptz,football_status text,updated_at timestamptz);
    create schema storage; create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    create table public.staff_player_access(player_id uuid,staff_user_id uuid,can_edit boolean);
    create table platform.audit_events(tenant_id uuid,actor_user_id uuid,actor_kind text,action text,entity_type text,entity_id text,before_state jsonb,after_state jsonb,metadata jsonb);
    create table djm_os.tell_djm_actions(id uuid primary key default gen_random_uuid(),tenant_id uuid,capture_id uuid,action_hash text,action_index integer,action_type text,status text,confidence numeric,evidence text,proposed_payload jsonb,resolved_payload jsonb,target_type text,target_id uuid,before_json jsonb,after_json jsonb,verification_json jsonb,undo_supported boolean,error_message text,applied_at timestamptz,undone_at timestamptz,updated_at timestamptz,created_at timestamptz default now(),unique(capture_id,action_hash));
    create table djm_os.tell_djm_questions(capture_id uuid,status text);
    create table djm_os.review_items(tenant_id uuid,capture_id uuid,review_type text,status text,resolved_at timestamptz);
    create table djm_os.events(tenant_id uuid,event_type text,actor_user_id uuid,person_id uuid,organisation_id uuid,player_id uuid,payload jsonb,source text,confidence numeric,occurred_at timestamptz);
    create table platform.work_responsibilities(tenant_id uuid,work_kind text,work_id uuid,responsible_user_ids uuid[],revision integer,updated_by uuid,updated_at timestamptz,unique(tenant_id,work_kind,work_id));
    create function private.user_has_staff_tenant_access(t uuid,u uuid) returns boolean language sql stable as $$select exists(select 1 from platform.tenant_memberships where tenant_id=t and user_id=u and status='active' and role in ('owner','admin','agent','scout','operations'))$$;
    create function private.tell_request_tenant() returns uuid language sql stable as $$select current_setting('test.tenant')::uuid$$;
    create function private.tell_assert_capture(c uuid,w boolean) returns void language plpgsql as $$begin if not exists(select 1 from djm_os.captures where id=c and tenant_id=private.tell_request_tenant() and submitted_by=auth.uid()) then raise exception 'Capture access denied'; end if; end$$;
    create function private.tell_assert_entities(t uuid,p jsonb) returns void language sql as $$select$$;
    create function public.redream_ai_receipt(c uuid) returns jsonb language sql as $$select jsonb_build_object('capture',(select to_jsonb(x) from djm_os.captures x where id=c),'actions',(select jsonb_agg(x) from djm_os.tell_djm_actions x where capture_id=c))$$;
    create function public.redream_ai_apply_action(c uuid,h text,i integer,typ text,conf numeric,e text,p jsonb) returns jsonb language plpgsql as $$declare tid uuid; begin
      insert into djm_os.tasks(tenant_id,owner_user_id,title,status,updated_at) select tenant_id,submitted_by,p->>'title','open',now() from djm_os.captures where id=c returning id into tid;
      if p->>'simulate_failure'='true' then return jsonb_build_object('status','failed'); end if;
      update djm_os.tell_djm_actions set status='applied',target_type='task',target_id=tid where capture_id=c and action_hash=h;
      return jsonb_build_object('status','applied','target_id',tid); end$$;
    create function public.redream_ai_apply_scout_observation(uuid,text,integer,numeric,text,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.redream_ai_complete_email_thread_task(uuid,text,integer,numeric,text,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
  `);
  await db.exec(readFileSync('supabase/migrations/20261020162412_tell_redream_task_updates.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261020164842_close_resolved_capture_reviews.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261020172347_restore_missing_tell_undo_dependency.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261022191532_connected_work_and_player_photo_reliability.sql','utf8'));
  await db.query("insert into platform.tenant_memberships values($1,$2,'active','agent'),($1,$3,'active','agent'),($4,$2,'active','agent')",[tenant,user,other,foreign]);
  await db.query("insert into djm_os.tell_djm_permissions values($1,$2,true,'full')",[tenant,user]);
  await db.query("insert into djm_os.team_members values($1,'Example Agent',true),($2,'Example Colleague',true)",[user,other]);
  await db.query('insert into public.notification_preferences values($1,$2)',[user,'Pacific/Auckland']);
  capture=(await db.query<any>("insert into djm_os.captures(tenant_id,submitted_by,transcript_text,status) values($1,$2,'I spoke to James about Dylan availability. Reopen it. Move the follow-up to Tuesday.','processing') returning id",[tenant,user])).rows[0].id;
  await db.query("select set_config('test.user',$1,false),set_config('test.tenant',$2,false)",[user,tenant]);
});
after(async () => { await db.close(); });

test('task context is owner and workspace scoped, excludes cancelled and keeps configured timezone', async () => {
  const owned=await task(); await task(other); await task(user,foreign);
  const cancelled=await task(); await db.query("update djm_os.tasks set status='cancelled' where id=$1",[cancelled.id]);
  const result=await value('public.redream_ai_task_context($1)',[capture]);
  assert.equal(result.timezone,'Pacific/Auckland');
  assert.deepEqual(result.tasks.map((t:any)=>t.id),[owned.id]);
});
test('completion, duplicate retry and Undo use the existing action ledger', async () => {
  const t=await task(); const result=await apply('complete',payload(t));
  assert.equal(await value('status from djm_os.tasks where id=$1',[t.id]),'completed');
  assert.equal((await apply('complete',payload(t))).duplicate,true);
  assert.equal(await value("count(*)::integer from djm_os.events where event_type='REDREAM_AI_TASK_UPDATED' and payload->>'task_id'=$1",[t.id]),1);
  await value('public.redream_ai_undo_action($1)',[result.action_id]);
  assert.equal(await value('status from djm_os.tasks where id=$1',[t.id]),'open');
  assert.equal((await value('public.redream_ai_undo_action($1)',[result.action_id])).duplicate,true);
  assert.equal((await apply('complete',payload(t))).status,'undone');
});

test('restored internal Undo handles ordinary notes and follow-ups without exposing its helper', async () => {
  const note=(await db.query<any>("insert into djm_os.interactions(tenant_id,source_type) values($1,'tell_djm') returning id",[tenant])).rows[0];
  const followup=await task();
  for(const [key,type,target] of [['undo-note','log_interaction',note.id],['undo-followup','create_task',followup.id]]){
    await db.query("update djm_os.tasks set source='tell_djm:'||$1||':'||$2,updated_at=now() where id=$3",[capture,key,followup.id]);
    const a=(await db.query<any>("insert into djm_os.tell_djm_actions(tenant_id,capture_id,action_hash,action_type,status,target_id,undo_supported,applied_at) values($1,$2,$3,$4,'applied',$5,true,now()) returning id",[tenant,capture,key,type,target])).rows[0];
    assert.equal((await value('public.redream_ai_undo_action($1)',[a.id])).undone,true);
    assert.equal(await value('status from djm_os.tell_djm_actions where id=$1',[a.id]),'undone');
  }
  assert.equal(await value('count(*)::integer from djm_os.interactions where id=$1',[note.id]),0);
  assert.equal(await value('count(*)::integer from djm_os.tasks where id=$1',[followup.id]),0);
  assert.equal(await value("has_function_privilege('authenticated','public.redream_ai_undo_action_core_pre_email(uuid)','execute')"),false);
  const before=await value("pg_get_functiondef('public.redream_ai_undo_action_core_pre_email(uuid)'::regprocedure)");
  await db.exec(readFileSync('supabase/migrations/20261020172347_restore_missing_tell_undo_dependency.sql','utf8'));
  assert.equal(await value("pg_get_functiondef('public.redream_ai_undo_action_core_pre_email(uuid)'::regprocedure)"),before);
});
test('a stale proposal and another person or workspace task cannot mutate', async () => {
  const t=await task(); await db.query("update djm_os.tasks set title='New objective' where id=$1",[t.id]);
  await assert.rejects(()=>apply('stale',payload(t)),/changed/);
  await assert.rejects(async()=>apply('other',payload(await task(other))),/own available/);
  await assert.rejects(async()=>apply('foreign',payload(await task(user,foreign))),/own available/);
});
test('Undo refuses subsequent changes and another workspace', async () => {
  const t=await task(); const result=await apply('undo-stale',payload(t));
  await db.query("update djm_os.tasks set due_at=now() where id=$1",[t.id]);
  await assert.rejects(()=>value('public.redream_ai_undo_action($1)',[result.action_id]),/changed after/);
  await db.query("select set_config('test.tenant',$1,false)",[foreign]);
  await assert.rejects(()=>value('public.redream_ai_undo_action($1)',[result.action_id]),/access denied/);
  await db.query("select set_config('test.tenant',$1,false)",[tenant]);
});
test('reschedule and reopen change only the requested task fields', async () => {
  const t=await task(); await apply('reschedule',payload(t,{operation:'reschedule',due_at:'2026-10-27T09:00:00+01:00'}));
  let changed=(await db.query<any>('select * from djm_os.tasks where id=$1',[t.id])).rows[0];
  assert.equal(changed.status,'open'); assert.equal(new Date(changed.due_at).toISOString(),'2026-10-27T08:00:00.000Z');
  await apply('finish-reopen',payload(changed)); changed=(await db.query<any>('select * from djm_os.tasks where id=$1',[t.id])).rows[0];
  await apply('reopen',payload(changed,{operation:'reopen'}));
  assert.equal(await value('status from djm_os.tasks where id=$1',[t.id]),'open');
  assert.equal(await value('completed_at from djm_os.tasks where id=$1',[t.id]),null);
});
test('one failed action preserves successful work; retry only runs failed work', async () => {
  const t=await task();
  for(const [key,type,p] of [['batch-task','update_task',payload(t)],['batch-followup','create_task',{title:'Send updated profile',simulate_failure:true}]] as const){
    await db.query("insert into djm_os.tell_djm_actions(tenant_id,capture_id,action_hash,action_type,status,confidence,evidence,resolved_payload,action_index) values($1,$2,$3,$4,'pending',0.99,'I spoke to James about Dylan availability',$5,1)",[tenant,capture,key,type,p]);
  }
  const first=await value('public.redream_ai_approve_capture($1)',[capture]); assert.equal(first.status,'partial');
  assert.equal(await value('status from djm_os.tasks where id=$1',[t.id]),'completed');
  assert.equal(await value("count(*)::integer from djm_os.tasks where title='Send updated profile'"),0,'Failed write is rolled back within its action');
  await db.query("update djm_os.tell_djm_actions set resolved_payload=resolved_payload-'simulate_failure' where action_hash='batch-followup'");
  const retry=await value('public.redream_ai_approve_capture($1)',[capture]); assert.equal(retry.status,'done');
  await value('public.redream_ai_approve_capture($1)',[capture]);
  assert.equal(await value("count(*)::integer from djm_os.tasks where title='Send updated profile'"),1);
});
test('browser roles cannot call privileged task retrieval or mutation', async () => {
  await db.exec('grant usage on schema public to authenticated; set role authenticated;');
  try {
    await assert.rejects(()=>value('public.redream_ai_task_context($1)',[capture]),/permission denied/);
    await assert.rejects(()=>apply('denied',{}),/permission denied/);
  }finally{await db.exec('reset role');}
});

test('calendar tasks use the same reviewed flow and preserve all-day dates', async () => {
  const t=(await db.query<any>("insert into platform.calendar_tasks(tenant_id,owner_user_id,title,status,due_on) values($1,$2,'Review Dylan profile','open','2026-10-22') returning *",[tenant,user])).rows[0];
  const context=await value('public.redream_ai_task_context($1)',[capture]);
  assert.ok(context.tasks.some((x:any)=>x.id===t.id && x.task_kind==='calendar_task'));
  const p=payload(t,{task_kind:'calendar_task'});
  const result=await apply('calendar-complete',p);
  assert.equal(await value('status from platform.calendar_tasks where id=$1',[t.id]),'done');
  await value('public.redream_ai_undo_action($1)',[result.action_id]);
  const changed=(await db.query<any>('select * from platform.calendar_tasks where id=$1',[t.id])).rows[0];
  await apply('calendar-move',payload(changed,{task_kind:'calendar_task',operation:'reschedule',due_at:'2026-10-27T09:00:00+13:00'}));
  assert.equal(await value('due_on::text from platform.calendar_tasks where id=$1',[t.id]),'2026-10-27');
  assert.equal(await value('due_at from platform.calendar_tasks where id=$1',[t.id]),null);
});
test('colleague resolution uses active staff memberships and preserves ambiguity', async () => {
  assert.equal((await value("public.redream_ai_resolve_team_member($1,'Example Colleague')",[capture])).user_id,other);
  await db.query("insert into djm_os.team_members values('10000000-0000-4000-8000-000000000003','Example Colleague',true)");
  await db.query("insert into platform.tenant_memberships values($1,'10000000-0000-4000-8000-000000000003','active','player')",[tenant]);
  assert.equal((await value("public.redream_ai_resolve_team_member($1,'Example Colleague')",[capture])).user_id,other);
  await db.query("update platform.tenant_memberships set role='agent' where user_id='10000000-0000-4000-8000-000000000003'");
  assert.equal((await value("public.redream_ai_resolve_team_member($1,'Example Colleague')",[capture])).resolved,false);
});
test('dismissal persists through retries and closes only the resolved capture action review',async()=>{
  const result=await value("public.redream_ai_stage_action($1,'dismiss-review',0,'update_task',0.9,'Synthetic evidence','{}')",[capture]);
  await db.query("insert into djm_os.review_items values($1,$2,'tell_djm_action_review','open',null),($1,$2,'other_review','open',null)",[tenant,capture]);
  await value('public.redream_ai_dismiss_action($1)',[result.action_id]);
  await value('public.redream_ai_dismiss_action($1)',[result.action_id]);
  const retry=await value("public.redream_ai_stage_action($1,'dismiss-review',0,'update_task',0.9,'Synthetic evidence','{}')",[capture]);
  assert.equal(retry.status,'superseded');
  assert.equal(await value("status from djm_os.review_items where review_type='tell_djm_action_review'"),'resolved');
  assert.equal(await value("status from djm_os.review_items where review_type='other_review'"),'open');
  assert.equal(await value("count(*)::integer from djm_os.events where event_type='REDREAM_AI_ACTION_DISMISSED'"),1);
});

const share = (id:string) => db.query("insert into platform.work_responsibilities(tenant_id,work_kind,work_id,responsible_user_ids) values($1,'task',$2,$3)",[tenant,id,[user,other]]);
const propose = async (t:any,key:string,extra={}) => {
 const p=payload(t,{_automatic:false,...extra});
 await db.query("insert into djm_os.tell_djm_actions(tenant_id,capture_id,action_hash,action_type,status,resolved_payload,action_index,confidence,evidence) values($1,$2,$3,'update_task','pending',$4,0,0.99,'I spoke to James about Dylan availability')",[tenant,capture,key,p]);
 return p;
};
test('shared work is visible, reviewed, auditable and reversible without changing ownership',async()=>{
 const t=await task(other);await share(t.id);
 const context=await value('public.redream_ai_task_context($1)',[capture]);
 const visible=context.tasks.find((x:any)=>x.id===t.id);
 assert.equal(visible.shared_with_you,true);assert.equal(visible.owner_display_name,'Example Colleague');
 await assert.rejects(()=>apply('shared-auto',payload(t,{_automatic:true})),/Review and approve/);
 await assert.rejects(()=>apply('shared-direct',payload(t)),/Review and approve/);
 const p=await propose(t,'shared-reviewed');const result=await apply('shared-reviewed',p);
 assert.equal(await value('status from djm_os.tasks where id=$1',[t.id]),'completed');
 assert.equal(await value('owner_user_id from djm_os.tasks where id=$1',[t.id]),other);
 await value('public.redream_ai_undo_action($1)',[result.action_id]);
 assert.equal(await value('status from djm_os.tasks where id=$1',[t.id]),'open');
});
test('revoked shared responsibility blocks approval and Undo even when a plan was already saved',async()=>{
 const t=await task(other);await share(t.id);const p=await propose(t,'shared-revoked');
 await db.query('delete from platform.work_responsibilities where work_id=$1',[t.id]);
 await assert.rejects(()=>apply('shared-revoked',p),/explicitly shared/);
 await share(t.id);const result=await apply('shared-revoked',p);
 await db.query('delete from platform.work_responsibilities where work_id=$1',[t.id]);
 await assert.rejects(()=>value('public.redream_ai_undo_action($1)',[result.action_id]),/changed after/);
});
test('shared calendar work respects private visibility, archives and tenant boundaries',async()=>{
 const create=async(visibility:string,workspace=tenant)=>(await db.query<any>("insert into platform.calendar_tasks(tenant_id,owner_user_id,title,status,responsible_user_ids,visibility) values($1,$2,'Speak to James about Dylan availability','open',$3,$4) returning *",[workspace,other,[user,other],visibility])).rows[0];
 const shared=await create('company'),hidden=await create('private'),cross=await create('company',foreign),archived=await create('company');
 await db.query('update platform.calendar_tasks set archived_at=now() where id=$1',[archived.id]);
 const context=await value('public.redream_ai_task_context($1)',[capture]);
 assert.ok(context.tasks.some((x:any)=>x.id===shared.id));
 for(const t of [hidden,cross,archived]){
  assert.ok(!context.tasks.some((x:any)=>x.id===t.id));
  await assert.rejects(()=>apply('calendar-denied-'+t.id,payload(t,{task_kind:'calendar_task'})),/available|shared/);
 }
 const p=await propose(shared,'calendar-shared',{task_kind:'calendar_task'});const result=await apply('calendar-shared',p);
 assert.equal(await value('status from platform.calendar_tasks where id=$1',[shared.id]),'done');
 await value('public.redream_ai_undo_action($1)',[result.action_id]);
 assert.equal(await value('status from platform.calendar_tasks where id=$1',[shared.id]),'open');
});
test('inactive agency membership cannot retain shared-task access',async()=>{
 const t=await task(other);await share(t.id);
 await db.query("update platform.tenant_memberships set status='inactive' where tenant_id=$1 and user_id=$2",[tenant,user]);
 try{await assert.rejects(()=>value('public.redream_ai_task_context($1)',[capture]),/access denied/);await assert.rejects(()=>apply('inactive',payload(t)),/access denied/);}
 finally{await db.query("update platform.tenant_memberships set status='active' where tenant_id=$1 and user_id=$2",[tenant,user]);}
});

test('forward migration can run twice without rewriting existing tasks or actions',async()=>{
 const before=await value("jsonb_build_object('tasks',(select count(*) from djm_os.tasks),'actions',(select count(*) from djm_os.tell_djm_actions))");
 await db.exec(readFileSync('supabase/migrations/20261022191532_connected_work_and_player_photo_reliability.sql','utf8'));
 assert.deepEqual(await value("jsonb_build_object('tasks',(select count(*) from djm_os.tasks),'actions',(select count(*) from djm_os.tell_djm_actions))"),before);
});

test('photo attachment verifies stored bytes metadata, scope, permissions, revision and retry idempotence',async()=>{
 const security=readFileSync('supabase/migrations/20260924214500_tenant_parity_player_security_v1.sql','utf8');
 const trigger=security.slice(security.indexOf('create or replace function private.protect_player_admin_fields()'),security.indexOf('create or replace function private.platform_server_ensure_team_member'));
 const fields=[...new Set([...trigger.matchAll(/(?:old|new)\.([a-z_]+)/g)].map(match=>match[1]))];
 for(const field of fields){
  const type=field==='user_id'?'uuid':field.endsWith('_at')?'timestamptz':'text';
  await db.exec(`alter table public.players add column if not exists ${field} ${type}`);
 }
 await db.exec(`create function private.user_is_tenant_admin(t uuid,u uuid default auth.uid()) returns boolean language sql stable as $$select exists(select 1 from platform.tenant_memberships where tenant_id=t and user_id=u and status='active' and role in ('owner','admin'))$$;`);
 await db.exec(trigger);
 await db.exec('create trigger guard_player_photo_update before update on public.players for each row execute function private.protect_player_admin_fields()');
 const pid='30000000-0000-4000-8000-000000000001';
 const path=`agency/${tenant}/players/${pid}/${user}/40000000-0000-4000-8000-000000000001.png`;
 await db.query("insert into public.players(id,tenant_id,football_status,verification_status) values($1,$2,'active','verified')",[pid,tenant]);
 await db.query('insert into public.staff_player_access values($1,$2,true)',[pid,user]);
 const attach=(photo=path,expected:string|null=null,workspace=tenant)=>value('public.platform_server_attach_player_photo($1,$2,$3,$4,$5)',[workspace,pid,user,photo,expected]);
 await assert.rejects(()=>attach(),/upload_incomplete/);
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('player-public',$1,jsonb_build_object('mimetype','image/png','size',100))",[path]);
 assert.equal((await attach()).profile_photo_path,path);assert.equal((await attach()).profile_photo_path,path);
 assert.equal(await value('verification_status from public.players where id=$1',[pid]),'reviewing','A changed photo still invalidates the existing verified profile through the real player trigger');
 assert.equal(await value("count(*)::integer from platform.audit_events where action='player.photo_updated'"),1);
 await assert.rejects(()=>attach(path.replace(user,other),path),/path_invalid/);
 await assert.rejects(()=>attach(path,null,foreign),/edit access/);
 const next=path.replace('000000000001.png','000000000002.png');
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('player-public',$1,jsonb_build_object('mimetype','image/png','size',100))",[next]);
 await assert.rejects(()=>attach(next),/revision_conflict/);
 await db.query("update storage.objects set metadata=jsonb_build_object('mimetype','image/svg+xml','size',100) where name=$1",[next]);
 await assert.rejects(()=>attach(next,path),/upload_incomplete/);
 await db.query('update public.staff_player_access set can_edit=false where player_id=$1',[pid]);
 await assert.rejects(()=>attach(path),/edit access/);
 await db.exec('grant usage on schema public to authenticated;set role authenticated');
 try{await assert.rejects(()=>attach(path),/permission denied/);}finally{await db.exec('reset role');}
});

test('staging link repair keeps existing records and enforces canonical player/prospect references',async()=>{
 const prospect='30000000-0000-4000-8000-000000000002';
 await db.query('insert into djm_os.scouting_prospects values($1,$2)',[prospect,tenant]);
 await db.query('update djm_os.captures set prospect_id=$1 where id=$2',[prospect,capture]);
 assert.equal(await value('prospect_id from djm_os.captures where id=$1',[capture]),prospect);
 await db.query("insert into djm_os.interactions(tenant_id,source_type,prospect_id) values($1,'tell_djm',$2)",[tenant,prospect]);
 await assert.rejects(()=>db.query("insert into djm_os.interactions(tenant_id,player_id) values($1,gen_random_uuid())",[tenant]),/foreign key/);
});
