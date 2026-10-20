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
    create table djm_os.captures(id uuid primary key default gen_random_uuid(),tenant_id uuid,submitted_by uuid,transcript_text text,status text,completed_at timestamptz,receipt_json jsonb,person_id uuid,organisation_id uuid,player_id uuid,processing_version text default 'tell_djm_v1');
    create table platform.calendar_tasks(id uuid primary key default gen_random_uuid(),tenant_id uuid,owner_user_id uuid,title text,status text,due_on date,due_time time,time_zone text,due_at timestamptz,archived_at timestamptz,revision integer default 1,updated_at timestamptz default now());
    create table djm_os.tasks(id uuid primary key default gen_random_uuid(),tenant_id uuid,owner_user_id uuid,title text,status text,due_at timestamptz,completed_at timestamptz,updated_at timestamptz,person_id uuid,organisation_id uuid,player_id uuid,interaction_id uuid);
    create table djm_os.people(id uuid,tenant_id uuid,full_name text);
    create table djm_os.organisations(id uuid,tenant_id uuid,name text);
    create table public.players(id uuid,tenant_id uuid,first_name text,last_name text);
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
    create function public.redream_ai_undo_action_core_pre_email(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
  `);
  await db.exec(readFileSync('supabase/migrations/20261020162412_tell_redream_task_updates.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261020164842_close_resolved_capture_reviews.sql','utf8'));
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
