import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { before, beforeEach, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const tenant = '20000000-0000-4000-8000-000000000001';
const actor = '10000000-0000-4000-8000-000000000001';
const dylan = '30000000-0000-4000-8000-000000000001';
const james = '30000000-0000-4000-8000-000000000002';
const migration = readdirSync('supabase/migrations').find(name => name.endsWith('_home_review_context.sql'));
const baseline = readFileSync('supabase/migrations/20260929194000_redream_recruitment_chat_identity_v1.sql','utf8');
const personalSql = migration ? readFileSync(`supabase/migrations/${migration}`,'utf8') : baseline.slice(baseline.indexOf('create or replace function public.platform_server_user_task_commands('));
const agencySql = migration ? personalSql : readFileSync('supabase/migrations/20260913110607_fix_agency_command_engine_uuid_dedupe_v1.sql','utf8');
before(async () => {
  await db.exec(`
    create schema platform; create schema djm_os;
    create role anon; create role authenticated; create role service_role;
    create table platform.tenants(id uuid,status text);
    create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text);
    create table platform.agency_action_proposals(id uuid,tenant_id uuid,command_id text,command_type text,action_type text,
      target_type text,target_id uuid,risk_level text,approval_mode text,status text,title text,rationale text,
      proposed_payload jsonb,requested_by uuid,idempotency_key text,expires_at timestamptz,updated_at timestamptz);
    create table djm_os.team_members(user_id uuid,is_active boolean);
    create table public.players(id uuid,tenant_id uuid,preferred_name text,first_name text,last_name text,review_reason text);
    create table djm_os.tasks(id uuid default gen_random_uuid(),tenant_id uuid,owner_user_id uuid,title text,
      player_id uuid,person_id uuid,organisation_id uuid,club_need_id uuid,interaction_id uuid,
      task_type text default 'commitment',due_at timestamptz,status text default 'open',priority integer default 3,source text,created_at timestamptz default now(),updated_at timestamptz default now());
    create table djm_os.interactions(id uuid,tenant_id uuid,team_member_id uuid,channel text,direction text,
      person_id uuid,player_id uuid,prospect_id uuid,summary text);
    create function platform.command_priority_profile(jsonb) returns jsonb language sql as $$ select '{"effective_score":80,"effective_band":"high"}'::jsonb $$;
    create function platform.command_evidence_health_v2(uuid,jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function platform.command_actionability(jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$;
    insert into platform.tenants values ('${tenant}','active');
    insert into platform.tenant_memberships values ('${tenant}','${actor}','active','owner');
    insert into djm_os.team_members values ('${actor}',true);
    insert into public.players values ('${dylan}','${tenant}','Dylan',null,null,'Career statistics changed'),('${james}','${tenant}','James',null,null,'Career statistics changed');
  `);
  // Exercise the complete personal function, retaining its actual permission checks.
  const start = personalSql.indexOf('create or replace function public.platform_server_user_task_commands(');
  const end = personalSql.indexOf('$function$;',start) + '$function$;'.length;
  await db.exec(migration ? personalSql : personalSql.slice(start,end));
  // Reproduce the actual staging contract after canonical staff access.
  // Preserve the exact deployed source hash before exercising the forward fix.
  const legacy=readFileSync('supabase/migrations/20260926094944_redream_user_owned_work_v1.sql','utf8');
  const legacyStart=legacy.indexOf('create or replace function public.platform_server_user_task_commands(');
  const legacyEnd=legacy.indexOf('$function$;',legacyStart)+'$function$;'.length;
  await db.exec(legacy.slice(legacyStart,legacyEnd).replace('    join djm_os.team_members tm\n      on tm.user_id=m.user_id\n     and tm.is_active\n',''));
  const hash=(await db.query("select md5(prosrc) as hash from pg_proc where oid='public.platform_server_user_task_commands(uuid,uuid,integer)'::regprocedure")).rows[0];
  assert.equal(hash.hash,'00ba3e3519f7f9cfa853a50faccc088f');
  await db.exec(readFileSync('supabase/migrations/20261025085756_restore_personal_task_context.sql','utf8'));
});
beforeEach(() => db.exec('delete from djm_os.tasks'));
after(() => db.close());
async function task(playerId: string | null, extra: Record<string,string> = {}) {
  await db.query('insert into djm_os.tasks(tenant_id,owner_user_id,title,player_id,person_id,organisation_id,club_need_id,interaction_id) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [extra.tenant || tenant,extra.owner || actor,'Review the player record and resolve the flagged issue.',playerId,extra.person||null,extra.organisation||null,extra.need||null,extra.interaction||null]);
}
async function commands(user = actor): Promise<any[]> {
  const result = await db.query('select public.platform_server_user_task_commands($1,$2,50) as feed',[tenant,user]);
  return (result.rows[0] as any).feed.commands;
}
async function agencyGroups(): Promise<any[]> {
  // Run the real agency task CTE independently of unrelated market tables.
  const start = agencySql.indexOf('  task_groups as (');
  const end = agencySql.indexOf('  task_signals as (',start);
  const query = 'with ' + agencySql.slice(start,end).trim().replace(/,$/,'').replaceAll('p_tenant_id',"'"+tenant+"'::uuid") + ' select * from task_groups';
  return (await db.query(query)).rows;
}
test('identical reminders for Dylan and James remain separate in personal and agency feeds', async () => {
  await task(dylan); await task(james);
  const personal = await commands();
  assert.equal(personal.length,2,'Different players must never become duplicate tasks');
  assert.deepEqual(personal.map(item=>item.player_id).sort(),[dylan,james]);
  assert.ok(personal.every(item=>item.evidence.task_count===1));
  assert.ok(personal.every(item=>item.task_title==='Review the player record and resolve the flagged issue.'),'Canonical title stays distinct from the player-labelled presentation');
  assert.equal((await agencyGroups()).length,2);
});
test('same-title tasks for different contacts, clubs, needs or conversations stay separate', async () => {
  for (const key of ['person','organisation','need','interaction']) {
    await db.exec('delete from djm_os.tasks');
    await task(dylan,{[key]:dylan}); await task(dylan,{[key]:james});
    assert.equal((await commands()).length,2,key);
    assert.equal((await agencyGroups()).length,2,key);
  }
});
test('possible copies still require review when their full context matches', async () => {
  await task(dylan); await task(dylan);
  const personal = await commands();
  assert.equal(personal.length,1);
  assert.equal(personal[0].command_type,'Consolidate duplicate follow-up');
  assert.equal(personal[0].evidence.task_count,2);
  assert.equal((await agencyGroups()).length,1);
});
test('a review reminder names its player instead of showing an anonymous generic task', async () => {
  await task(dylan);
  const [command] = await commands();
  assert.match(command.title,/Dylan/);
  assert.equal(command.evidence.player_name,'Dylan');
});
test('task context never bypasses the personal owner and tenant boundary', async () => {
  await task(dylan); await task(james,{owner:james}); await task(james,{tenant:james});
  assert.equal((await commands()).length,1);
  assert.equal((await agencyGroups()).length,2);
  await assert.rejects(()=>commands(james),/active_tenant_staff_required/);
});

test('in-progress work remains active while completed and cancelled tasks stay out of personal Home',async()=>{
 await task(dylan);
 for(const status of ['open','in_progress','completed','done','cancelled']){
  await db.query('update djm_os.tasks set status=$1',[status]);
  assert.equal((await commands()).length,['open','in_progress'].includes(status)?1:0,status);
 }
});

test('canonical agency membership governs this feed without a legacy global record',async()=>{
 await db.exec('begin');
 try{
  await db.exec('delete from djm_os.team_members');await task(dylan);
  assert.equal((await commands()).length,1);
  await db.query("update platform.tenant_memberships set status='ended' where user_id=$1",[actor]);
  await assert.rejects(()=>commands(),/active_tenant_staff_required/);
 }finally{await db.exec('rollback');}
});

test('the forward context repair preserves metadata/data, replays safely, upgrades the reviewed current variant and refuses unknown bodies',async()=>{
 const identity='public.platform_server_user_task_commands(uuid,uuid,integer)';
 const metadata=async()=>Object.values((await db.query("select jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef) from pg_proc where oid=$1::regprocedure",[identity])).rows[0])[0];
 const readHash=async()=>Object.values((await db.query('select md5(prosrc) from pg_proc where oid=$1::regprocedure',[identity])).rows[0])[0];
 const repair=readFileSync('supabase/migrations/20261025085756_restore_personal_task_context.sql','utf8');
 await task(dylan);const rows=(await db.query('select * from djm_os.tasks')).rows,before=await metadata();
 await db.exec(repair);await db.exec(repair);
 assert.deepEqual(await metadata(),before);assert.deepEqual((await db.query('select * from djm_os.tasks')).rows,rows);
 for(const role of ['anon','authenticated','service_role'])assert.equal(Object.values((await db.query('select has_function_privilege($1,$2,\'execute\')',[role,identity])).rows[0])[0],role==='service_role',role);
 const current=Object.values((await db.query('select pg_get_functiondef($1::regprocedure)',[identity])).rows[0])[0] as string;
 try{
  const start=personalSql.indexOf('create or replace function public.platform_server_user_task_commands('),end=personalSql.indexOf('$function$;',start)+'$function$;'.length;
  await db.exec(personalSql.slice(start,end).replace('    join djm_os.team_members tm\n      on tm.user_id=m.user_id\n     and tm.is_active\n',''));
  assert.equal(await readHash(),'a75e24785b5d9d8165e004be60a2c2c4');
  await db.exec(repair);assert.equal(await readHash(),'d6c581a48f1a5c788da80e1570d0688e');assert.deepEqual(await metadata(),before);
  await db.exec(current.replace('begin','begin\n -- unknown later version'));
  await assert.rejects(()=>db.exec(repair),/differs from the reviewed canonical baseline/);
 }finally{await db.exec(current);}
});

test('restored reply context stays actor/tenant scoped and never embeds the private conversation',async()=>{
 await db.exec('begin');
 try{
  const interaction='70000000-0000-4000-8000-000000000001';
  await db.query("insert into djm_os.interactions(id,tenant_id,team_member_id,channel,direction,player_id,summary) values($1,$2,$3,'google_email','inbound',$4,'PRIVATE_INTERACTION_SENTINEL')",[interaction,tenant,actor,dylan]);
  await task(dylan,{interaction});
  const [allowed]=await commands();assert.equal(allowed.reply_interaction_id,interaction);assert.ok(!JSON.stringify(allowed).includes('PRIVATE_INTERACTION_SENTINEL'));
  for(const change of ["team_member_id='"+james+"'","tenant_id='"+james+"'","direction='outbound'","channel='phone'","person_id='"+james+"'","summary='' "]){
   await db.query("update djm_os.interactions set tenant_id=$1,team_member_id=$2,direction='inbound',channel='google_email',person_id=null,summary='PRIVATE_INTERACTION_SENTINEL' where id=$3",[tenant,actor,interaction]);
   await db.exec('update djm_os.interactions set '+change);
   assert.equal((await commands())[0].reply_interaction_id,null,change);
  }
 }finally{await db.exec('rollback');}
});
