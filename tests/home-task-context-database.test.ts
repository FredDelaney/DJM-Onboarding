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
      task_type text default 'commitment',due_at timestamptz,status text default 'open',priority integer default 3,source text,created_at timestamptz default now());
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
