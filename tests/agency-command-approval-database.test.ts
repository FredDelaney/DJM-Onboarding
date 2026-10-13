import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const tenant = '20000000-0000-4000-8000-000000000001';
const actor = '10000000-0000-4000-8000-000000000001';
const colleague = '10000000-0000-4000-8000-000000000002';
async function prepare(command: string, user = actor): Promise<any> {
  const result = await db.query('select public.platform_server_prepare_command_action($1,$2,$3) as proposal', [tenant, command, user]);
  return (result.rows[0] as any).proposal;
}
before(async () => {
  await db.exec(`
    create schema platform;
    create role anon; create role authenticated; create role service_role;
    create table platform.tenants(id uuid primary key,status text);
    create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text);
    create table platform.agency_action_proposals(
      id uuid primary key default gen_random_uuid(), tenant_id uuid, command_id text, command_type text,
      action_type text, target_type text, target_id uuid, risk_level text, approval_mode text, status text,
      title text, rationale text, proposed_payload jsonb, requested_by uuid, idempotency_key text,
      expires_at timestamptz default now()+interval '30 minutes', updated_at timestamptz default now()
    );
    create unique index approval_retry on platform.agency_action_proposals(tenant_id,idempotency_key)
      where status in ('proposed','needs_input','applied');
    create table platform.audit_events(tenant_id uuid,actor_user_id uuid,actor_kind text,action text,
      entity_type text,entity_id text,after_state jsonb,metadata jsonb);
    create function public.platform_server_agency_decisions(uuid,integer) returns jsonb language sql as $$
      select jsonb_build_object('commands',(select jsonb_agg(jsonb_build_object(
        'command_id',name,'command_type',case when name='review' then 'Player review required' else 'Complete follow-up' end,'source_type',case when name='review' then 'player' else 'task' end,
        'source_id','30000000-0000-4000-8000-000000000001','title','Speak with player',
        'priority_score',80,'actionability','{}'::jsonb,'evidence_health','{}'::jsonb
      )) from unnest(array['expired','applied','active','handoff','denied','review']) name))
    $$;
    insert into platform.tenants values ('${tenant}','active');
    insert into platform.tenant_memberships values ('${tenant}','${actor}','active','owner'),('${tenant}','${colleague}','active','agent');
  `);
  await db.exec(readFileSync('supabase/migrations/20260913120819_add_verify_first_action_preparation.sql','utf8'));
  const recovery = readdirSync('supabase/migrations').find(name => name.endsWith('_renew_expired_command_approvals.sql'));
  if (recovery) await db.exec(readFileSync(`supabase/migrations/${recovery}`,'utf8'));
  const context = readdirSync('supabase/migrations').find(name => name.endsWith('_home_review_context.sql'));
  if (context) {
    const sql = readFileSync(`supabase/migrations/${context}`,'utf8');
    await db.exec(sql.slice(sql.indexOf('create or replace function public.platform_server_prepare_command_action(')));
  }
});
after(() => db.close());

test('a player data review opens the existing record and never proposes creating a task', async () => {
  const proposal = await prepare('review');
  assert.equal(proposal.executable,false,'Reviewing player facts is not a task-creation action');
  assert.equal(proposal.action_type,'review_player_record');
  assert.equal(proposal.payload.player_id,'30000000-0000-4000-8000-000000000001');
});

test('preparing an expired pending approval renews its window after checking the live command', async () => {
  const first = await prepare('expired');
  await db.query("update platform.agency_action_proposals set expires_at=now()-interval '5 days' where id=$1", [first.proposal_id]);
  const renewed = await prepare('expired');
  assert.equal(renewed.proposal_id, first.proposal_id);
  assert.equal(renewed.status, 'proposed');
  assert.ok(Date.parse(renewed.expires_at) > Date.now(), 'A newly reviewed approval must not already be expired');
  assert.equal(renewed.payload.task_id, '30000000-0000-4000-8000-000000000001');
});
test('an applied action is never renewed or made executable on a retry', async () => {
  const first = await prepare('applied');
  await db.query("update platform.agency_action_proposals set status='applied',expires_at=now()-interval '5 days',proposed_payload=$2::jsonb where id=$1", [first.proposal_id,JSON.stringify({task_id:'original'})]);
  const retried = await prepare('applied');
  assert.equal(retried.status, 'applied');
  assert.equal(retried.executable, false);
  assert.equal(retried.payload.task_id, 'original');
  assert.ok(Date.parse(retried.expires_at) < Date.now());
});
test('a still-valid approval keeps its deadline rather than extending on every click', async () => {
  const first = await prepare('active');
  assert.equal((await prepare('active')).expires_at, first.expires_at);
});
test('renewed pending approval belongs to the staff member who reviewed it', async () => {
  const first = await prepare('handoff');
  await db.query("update platform.agency_action_proposals set expires_at=now()-interval '1 hour' where id=$1", [first.proposal_id]);
  await prepare('handoff', colleague);
  const row = (await db.query('select requested_by from platform.agency_action_proposals where id=$1', [first.proposal_id])).rows[0] as any;
  assert.equal(row.requested_by, colleague);
});
test('renewal cannot bypass tenant membership or make a vanished command actionable', async () => {
  await assert.rejects(() => prepare('denied', '10000000-0000-4000-8000-000000000099'), /agency_staff_access_required/);
  await assert.rejects(() => prepare('missing'), /command_no_longer_actionable/);
  const permissions = (await db.query("select has_function_privilege('authenticated','public.platform_server_prepare_command_action(uuid,text,uuid,jsonb)','execute') as client, has_function_privilege('service_role','public.platform_server_prepare_command_action(uuid,text,uuid,jsonb)','execute') as server")).rows[0];
  assert.deepEqual(permissions, {client:false,server:true});
});
