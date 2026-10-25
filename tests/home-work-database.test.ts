import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { before, beforeEach, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const tenant = '20000000-0000-4000-8000-000000000001';
const foreign = '20000000-0000-4000-8000-000000000002';
const owner = '10000000-0000-4000-8000-000000000001';
const agent = '10000000-0000-4000-8000-000000000002';
const colleague = '10000000-0000-4000-8000-000000000003';
const player = '30000000-0000-4000-8000-000000000001';
const task = '60000000-0000-4000-8000-000000000001';
const capture = '80000000-0000-4000-8000-000000000001';
const migration = readdirSync('supabase/migrations').find(name => name.endsWith('_home_task_completion.sql'))!;
async function value(sql: string, params: any[] = []): Promise<any> {
  return Object.values((await db.query(`select ${sql}`, params)).rows[0])[0];
}
async function actor(id: string) { await value("set_config('test.user',$1,false)", [id]); }
async function work(kind = 'player_next_action', id = player, action = 'read', input: any = {}, state: any = null, scope = tenant): Promise<any> {
  return value('public.redream_home_work_v1($1,$2,$3,$4,$5,$6)', [kind, id, action, JSON.stringify({time_zone:'Europe/Rome',...input}), state ? JSON.stringify(state) : null, scope]);
}
before(async () => {
  await db.exec(`
    create schema auth; create schema private; create schema platform; create schema djm_os;
    create role anon; create role authenticated; create role service_role;
    grant usage on schema private,auth to authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table platform.tenants(id uuid primary key,status text);
    create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text);
    create table public.profiles(id uuid,display_name text);
    create table platform.audit_events(id uuid default gen_random_uuid(),tenant_id uuid,actor_user_id uuid,actor_kind text,action text,entity_type text,entity_id text,before_state jsonb,after_state jsonb,metadata jsonb,occurred_at timestamptz default now());
    create table public.players(id uuid primary key,tenant_id uuid,primary_staff_user_id uuid,preferred_name text,first_name text,last_name text,next_action text,next_action_due date,contract_expiry date,football_status text,verification_status text default 'verified',review_required boolean default false,updated_at timestamptz default now());
    create table djm_os.tasks(id uuid primary key,tenant_id uuid,owner_user_id uuid,title text,due_at timestamptz,status text,completed_at timestamptz,updated_at timestamptz default now(),player_id uuid,person_id uuid,organisation_id uuid,club_need_id uuid);
    create function private.redream_request_tenant() returns uuid language sql stable as $$select '${tenant}'::uuid$$;
    insert into platform.tenants values('${tenant}','active'),('${foreign}','active');
    insert into platform.tenant_memberships values('${tenant}','${owner}','active','owner'),('${tenant}','${agent}','active','agent'),('${tenant}','${colleague}','active','operations');
    insert into public.profiles values('${owner}','Owner'),('${agent}','Agent'),('${colleague}','Colleague');
    create function private.test_player_guard() returns trigger language plpgsql as $$begin
      if current_setting('djm.internal_player_service',true) is distinct from 'on' then raise exception 'protected_player_write';end if;
      if (to_jsonb(new)-array['next_action','next_action_due','updated_at']) is distinct from (to_jsonb(old)-array['next_action','next_action_due','updated_at']) then raise exception 'unexpected_player_change';end if;
      return new;
    end;$$;
    create trigger protect_player before update on public.players for each row execute function private.test_player_guard();
  `);
  for (const name of ['20261004125332_calendar_workspace_tasks_v1.sql','20261004134529_calendar_task_owner_edit_guard.sql','20261012074747_shared_work_responsibility_v1.sql','20261012075754_agency_reminder_responsibility_v1.sql','20261012083123_assigned_work_paging_v1.sql',migration]) {
    await db.exec(readFileSync(`supabase/migrations/${name}`,'utf8'));
  }
  await db.exec(readFileSync('supabase/migrations/20261025073833_normalise_active_followup_state.sql','utf8'));
  // Exercise the actual Home and Tell task writers in the same PostgreSQL
  // instance. Capture/auth transport is fixture infrastructure; no model call.
  await db.exec(`
    create table djm_os.captures(id uuid primary key,tenant_id uuid,submitted_by uuid,transcript_text text);
    create table djm_os.tell_djm_permissions(tenant_id uuid,user_id uuid,is_enabled boolean);
    create table public.notification_preferences(user_id uuid,timezone text);
    create table djm_os.tell_djm_actions(id uuid primary key default gen_random_uuid(),tenant_id uuid,capture_id uuid,action_hash text,action_index integer,action_type text,status text,confidence numeric,evidence text,proposed_payload jsonb,resolved_payload jsonb,target_type text,target_id uuid,before_json jsonb,after_json jsonb,verification_json jsonb,undo_supported boolean,error_message text,applied_at timestamptz,undone_at timestamptz,updated_at timestamptz,unique(capture_id,action_hash));
    create table djm_os.events(tenant_id uuid,event_type text,actor_user_id uuid,person_id uuid,organisation_id uuid,player_id uuid,payload jsonb,source text,confidence numeric,occurred_at timestamptz);
    create function private.user_has_staff_tenant_access(t uuid,u uuid) returns boolean language sql stable as $$select exists(select 1 from platform.tenant_memberships m join platform.tenants x on x.id=m.tenant_id where m.tenant_id=t and m.user_id=u and m.status='active' and x.status='active' and m.role in ('owner','admin','agent','operations','scout'))$$;
    create function private.tell_request_tenant() returns uuid language sql stable as $$select private.redream_request_tenant()$$;
    create function private.tell_assert_capture(c uuid,w boolean) returns void language plpgsql as $$begin if not exists(select 1 from djm_os.captures where id=c and tenant_id=private.tell_request_tenant() and submitted_by=auth.uid()) then raise exception 'Capture access denied';end if;end$$;
    insert into djm_os.tell_djm_permissions values('${tenant}','${agent}',true);
    insert into public.notification_preferences values('${agent}','Europe/Rome');
  `);
  const connected=readFileSync('supabase/migrations/20261022191532_connected_work_and_player_photo_reliability.sql','utf8');
  for(const name of ['private.redream_task_actor_can_edit','public.redream_ai_update_task','private.redream_ai_undo_task']){
    const definition=connected.match(new RegExp('create or replace function '+name.replaceAll('.','\\.')+'\\([\\s\\S]*?\\n\\$\\$;'));
    assert.ok(definition,name);
    const acl=connected.slice(definition.index!+definition[0].length).match(/^\nrevoke all[\s\S]*?(?=\n\n)/);
    assert.ok(acl,name+' canonical grants');
    await db.exec(definition[0]+acl[0]);
  }
});
beforeEach(async () => {
  await db.exec(`delete from platform.audit_events;delete from platform.work_responsibilities;delete from platform.calendar_tasks;delete from djm_os.tasks;delete from public.players;delete from djm_os.tell_djm_actions;delete from djm_os.events;delete from djm_os.captures;
    insert into djm_os.captures values('${capture}','${tenant}','${agent}','I spoke to the club and completed the call. Reopen the follow-up.');
    insert into public.players(id,tenant_id,primary_staff_user_id,preferred_name,next_action,next_action_due,football_status) values('${player}','${tenant}','${agent}','Dylan','Call the player','2026-10-14','active');
    insert into djm_os.tasks(id,tenant_id,owner_user_id,title,due_at,status,player_id) values('${task}','${tenant}','${agent}','Catch up','2026-10-14T13:30:00Z','open','${player}');
    insert into platform.work_responsibilities values('${tenant}','player_next_action','${player}',array['${agent}'::uuid],1,'${owner}',now());
  `);
  await actor(agent);
});
after(() => db.close());

test('a player follow-up completes, disappears from assignments, and Undo restores the exact action', async () => {
  const original = await work();
  const result = await work('player_next_action',player,'complete',{},original.work.state);
  assert.equal(result.work.status,'done'); assert.ok(result.undo_token);
  assert.equal((await value('public.redream_assigned_work_page_v1($1,null,200)',[tenant])).items.length,0);
  const restored = await work('player_next_action',player,'undo',{undo_token:result.undo_token},result.work.state);
  assert.equal(restored.work.title,'Call the player'); assert.equal(restored.work.due_on,'2026-10-14');
  assert.equal(restored.work.status,'open');
  assert.equal((await value('public.redream_assigned_work_page_v1($1,null,200)',[tenant])).items.length,1);
  assert.deepEqual((await db.query('select verification_status,review_required from public.players')).rows,[{verification_status:'verified',review_required:false}]);
  assert.notEqual(await value("current_setting('djm.internal_player_service',true)"),'on');
});
test('action, date and internal note save together, and notes survive reopening the editor', async () => {
  const original = await work();
  const result = await work('player_next_action',player,'update',{title:'Confirm the trial',due_on:'2026-10-20',note:'Club is available Tuesday.'},original.work.state);
  assert.equal(result.work.title,'Confirm the trial'); assert.equal(result.work.due_on,'2026-10-20');
  assert.equal((await work()).work.note,'Club is available Tuesday.');
  const logs = (await db.query('select * from platform.audit_events')).rows as any[];
  assert.equal(logs[0].actor_user_id,agent); assert.equal(logs[0].metadata.source,'home_work');
  assert.equal(logs[0].before_state.title,'Call the player');
});
test('completion can schedule the player next action atomically and Undo rejects a later edit', async () => {
  const original = await work();
  const result = await work('player_next_action',player,'complete',{note:'Spoke to Dylan.',next_title:'Send trial details',next_due_on:'2026-10-21'},original.work.state);
  assert.equal(result.work.title,'Send trial details'); assert.equal(result.work.due_on,'2026-10-21'); assert.equal(result.work.note,'');
  assert.equal(await value("(select metadata->>'completion_note' from platform.audit_events limit 1)"),'Spoke to Dylan.');
  const updated = await work('player_next_action',player,'update',{title:'Changed next action',due_on:'2026-10-22'},result.work.state);
  await assert.rejects(() => work('player_next_action',player,'undo',{undo_token:result.undo_token},updated.work.state),/home_work_undo_conflict/);
  assert.equal((await work()).work.title,'Changed next action');
});
test('Undo removes a new player follow-up and restores the preceding action and note', async () => {
  const original = await work();
  const saved = await work('player_next_action',player,'update',{note:'Original note'},original.work.state);
  const result = await work('player_next_action',player,'complete',{note:'Called the player.',next_title:'Send the details',next_due_on:'2026-10-20'},saved.work.state);
  const restored = await work('player_next_action',player,'undo',{undo_token:result.undo_token},result.work.state);
  assert.equal(restored.work.title,'Call the player');assert.equal(restored.work.due_on,'2026-10-14');assert.equal(restored.work.note,'Original note');
});
test('completing in the editor also saves task title, date and note changes', async () => {
  const original = await work('task',task);
  const result = await work('task',task,'complete',{title:'Called the club',due_on:'2026-10-20',note:'Trial agreed.'},original.work.state);
  assert.equal(result.work.status,'done');assert.equal(result.work.title,'Called the club');assert.equal(result.work.due_on,'2026-10-20');assert.equal(result.work.note,'Trial agreed.');
  const restored = await work('task',task,'undo',{undo_token:result.undo_token},result.work.state);
  assert.equal(restored.work.title,'Catch up');assert.equal(restored.work.due_on,'2026-10-14');
});
test('stale snapshots and double completion never overwrite the canonical work', async () => {
  const original = await work('task',task);
  const updated = await work('task',task,'update',{title:'Changed follow-up',note:'Keep this note'},original.work.state);
  await assert.rejects(() => work('task',task,'complete',{},original.work.state),/home_work_conflict/);
  const result = await work('task',task,'complete',{},updated.work.state);
  await assert.rejects(() => work('task',task,'complete',{},updated.work.state),/home_work_conflict/);
  assert.equal(result.work.note,'Keep this note'); assert.equal(result.work.status,'done');
  const undo = await work('task',task,'undo',{undo_token:result.undo_token},result.work.state);
  assert.equal(undo.work.title,'Changed follow-up'); assert.equal(undo.work.status,'open');
  assert.equal(undo.work.due_at,'2026-10-14T13:30:00+00:00');
});
test('date-only edits keep the existing task time, and clearing a date produces an undated task', async () => {
  let result = await work('task',task);
  result = await work('task',task,'update',{title:'Catch up',due_on:'2026-10-14',note:'A note'},result.work.state);
  assert.equal(new Date(result.work.due_at).toISOString(),'2026-10-14T13:30:00.000Z');
  result = await work('task',task,'update',{title:'Catch up',due_on:'2026-10-20'},result.work.state);
  assert.equal(new Date(result.work.due_at).toISOString(),'2026-10-20T13:30:00.000Z');
  result = await work('task',task,'update',{title:'Catch up',due_on:null},result.work.state);
  assert.equal(result.work.due_at,null);
});
test('only active tenant managers, owners or responsible staff may read and change work', async () => {
  await actor(colleague); await assert.rejects(() => work(),/home_work_access_denied/);
  await db.query('update platform.work_responsibilities set responsible_user_ids=$1',[ [agent,colleague] ]);
  const original = await work(); await work('player_next_action',player,'update',{note:'Shared outcome'},original.work.state);
  await actor(owner); assert.equal((await work()).work.note,'Shared outcome');
  await assert.rejects(() => work('player_next_action',player,'read',{},null,foreign),/calendar_access_denied/);
  await actor(''); await assert.rejects(() => work(),/calendar_access_denied/);
  await actor(colleague); await db.query("update platform.tenant_memberships set role='player' where user_id=$1",[colleague]);
  await assert.rejects(() => work(),/calendar_access_denied/);
  await db.query("update platform.tenant_memberships set role='operations' where user_id=$1",[colleague]);
  assert.equal(await value("has_function_privilege('anon','public.redream_home_work_v1(text,uuid,text,jsonb,jsonb,uuid)','execute')"),false);
});
test('invalid input and non-task work kinds cannot change records', async () => {
  const original = await work();
  for (const input of [{title:' '},{note:'x'.repeat(2001)},{title:'Valid',due_on:'bad-date'},{owner_user_id:owner}]) {
    await assert.rejects(() => work('player_next_action',player,'update',input,original.work.state),/home_work_input_invalid/);
  }
  await assert.rejects(() => work('player_next_action',player,'complete',{next_title:'New step'},original.work.state),/home_work_input_invalid/);
  await assert.rejects(() => work('career_strategy_review',player),/home_work_kind_invalid/);
  await assert.rejects(() => work('player_next_action',player,'update',{},null),/home_work_conflict/);
  assert.equal((await work()).work.title,'Call the player');
});
test('manual calendar tasks use existing privacy, notes and revision controls', async () => {
  const created = (await value('public.redream_calendar_task_create_v1($1,$2)',[JSON.stringify({title:'Private task',notes:'Private note',due_on:'2026-10-14'}),tenant])).task;
  const original = await work('calendar_task',created.id);
  await actor(owner); await assert.rejects(() => work('calendar_task',created.id),/home_work_access_denied/);
  await actor(agent);
  const result = await work('calendar_task',created.id,'complete',{note:'Private completion note'},original.work.state);
  assert.equal(result.work.status,'done'); assert.ok(result.undo_token);
  assert.equal((await work('calendar_task',created.id)).work.note,'Private completion note');
  const restored = await work('calendar_task',created.id,'undo',{undo_token:result.undo_token},result.work.state);
  assert.equal(restored.work.status,'open');
  const audit = JSON.stringify((await db.query('select * from platform.audit_events')).rows);
  assert.ok(!audit.includes('Private task')); assert.ok(!audit.includes('Private note')); assert.ok(!audit.includes('Private completion note'));
  await assert.rejects(() => work('calendar_task',created.id,'update',{title:'Stale'},original.work.state),/home_work_conflict/);
});

async function tellTask(operation:string,key:string){
 const current=(await db.query<any>('select * from djm_os.tasks where id=$1',[task])).rows[0];
 return value('public.redream_ai_update_task($1,$2,0,0.99,$3,$4)',[capture,key,operation==='reopen'?'Reopen the follow-up':'I spoke to the club and completed the call',JSON.stringify({task_id:task,task_kind:'task',task_title:current.title,expected_status:current.status,expected_updated_at:current.updated_at,operation,objective_satisfied:true})]);
}
test('Tell completion and Undo reconcile the same Home and assigned-work record',async()=>{
 const original=await work('task',task);
 const applied=await tellTask('complete','connected-complete');
 assert.equal((await work('task',task)).work.status,'done');
 assert.ok(!(await value('public.redream_assigned_work_page_v1($1,null,200)',[tenant])).items.some((item:any)=>item.work_id===task));
 await assert.rejects(()=>work('task',task,'complete',{},original.work.state),/home_work_conflict/);
 await value('private.redream_ai_undo_task($1)',[applied.action_id]);
 const restored=(await work('task',task)).work;
 assert.equal(restored.status,'open');assert.equal(restored.title,original.work.title);assert.equal(restored.due_at,original.work.due_at);
 assert.equal(await value('status from djm_os.tell_djm_actions where id=$1',[applied.action_id]),'undone');
 assert.equal(await value("count(*)::integer from djm_os.events where event_type='REDREAM_AI_TASK_UPDATED'"),1);
});
test('in-progress follow-ups remain active in the editor and assignments and Undo preserves their original status',async()=>{
 await db.query("update djm_os.tasks set status='in_progress' where id=$1",[task]);
 await db.query("insert into platform.work_responsibilities values($1,'task',$2,$3,1,$4,now())",[tenant,task,[agent],owner]);
 const current=await work('task',task);
 assert.equal(current.work.status,'open','In progress is active, not completed');
 assert.ok((await value('public.redream_assigned_work_page_v1($1,null,200)',[tenant])).items.some((item:any)=>item.work_id===task));
 const done=await work('task',task,'complete',{},current.work.state);
 const restored=await work('task',task,'undo',{undo_token:done.undo_token},done.work.state);
 assert.equal(restored.work.status,'open');
 assert.equal(await value('status from djm_os.tasks where id=$1',[task]),'in_progress');
});
test('a later Tell change prevents Home Undo from overwriting current work',async()=>{
 const original=await work('task',task);
 const completed=await work('task',task,'complete',{note:'Club confirmed the trial.'},original.work.state);
 await tellTask('reopen','connected-reopen');
 const current=await work('task',task);
 assert.equal(current.work.status,'open');assert.equal(current.work.note,'Club confirmed the trial.');
 await assert.rejects(()=>work('task',task,'undo',{undo_token:completed.undo_token},current.work.state),/home_work_undo_conflict/);
 assert.equal((await work('task',task)).work.status,'open');
 assert.equal(await value("has_function_privilege('authenticated','public.redream_ai_update_task(uuid,text,integer,numeric,text,jsonb)','execute')"),false);
});

test('cancelled tasks stay closed and their actual status is available to the receipt viewer',async()=>{
 await db.query("update djm_os.tasks set status='cancelled' where id=$1",[task]);
 const cancelled=await work('task',task);
 assert.equal(cancelled.work.status,'done');assert.equal(cancelled.work.state.original_status,'cancelled');
 await assert.rejects(()=>work('task',task,'complete',{},cancelled.work.state),/home_work_closed/);
});
test('active-state migration preserves canonical reader identity and permissions on replay',async()=>{
 const read=()=>value("jsonb_agg(jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl::text,'config',proconfig,'body',md5(prosrc)) order by oid) from pg_proc where oid in ('private.home_work_state(text,uuid,uuid,text)'::regprocedure,'private.responsibility_work(text,uuid)'::regprocedure)");
 const before=await read();await db.exec(readFileSync('supabase/migrations/20261025073833_normalise_active_followup_state.sql','utf8'));assert.deepEqual(await read(),before);
 for(const name of ['private.home_work_state(text,uuid,uuid,text)','private.responsibility_work(text,uuid)'])assert.equal(await value('has_function_privilege($1,$2,$3)',['authenticated',name,'execute']),false);
});
