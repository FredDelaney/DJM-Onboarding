import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL and the repository's actual tenant trigger. Synthetic records only.
const db = new PGlite();
const read = (file: string) => readFileSync('supabase/migrations/' + file, 'utf8');
const core = read('20260913101801_enforce_core_tenant_isolation.sql');
const workspace = read('20260913103355_tenantize_tell_djm_and_agency_workspaces.sql');
const boundary = read('20260915192303_tell_capture_workspace_boundary.sql');
const legacy = read('20260826174916_add_contact_change_monitoring_and_network_routing_v3.sql');
const repair = read('20261023142549_repair_change_review_tenant_context_v1.sql');
const sourceBoundary = read('20261023142943_scope_change_observations_to_canonical_tenants_v1.sql');
const schema = readFileSync('supabase/staging/bootstrap/001_application_schema.sql', 'utf8');
const a = '20000000-0000-4000-8000-000000000001';
const b = '20000000-0000-4000-8000-000000000002';
const member = (i: number) => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const entity = (i: number) => `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
let legacyError: any;
let originalAcl: unknown;
let legacyForeignRead = false;
function definition(source: string, name: string) {
  // These source definitions use $$, including the old inline end/delimiter.
  const start = source.toLowerCase().indexOf('create or replace function ' + name.toLowerCase() + '(');
  assert.ok(start >= 0, name);
  const end = source.indexOf('$$;', source.indexOf('as $$', start)) + 3;
  assert.ok(end > start, name);
  return source.slice(start, end);
}
async function scalar(sql: string, args: unknown[] = []) {
  return Object.values((await db.query('select ' + sql, args)).rows[0])[0] as any;
}
before(async () => {
  await db.exec(`create schema auth; create schema private; create schema platform; create schema djm_os;
    create role anon; create role authenticated; create role service_role bypassrls;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
    create table platform.tenants(id uuid primary key,status text);
    create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text,is_primary boolean);
    grant usage on schema djm_os,auth,private,platform to anon,authenticated,service_role;`);
  const membershipChecks = read('20260904133549_create_tenants_and_memberships.sql')
    .match(/constraint tenant_memberships_(?:role|status)_check\s+check \([^\n]+\)/g);
  assert.equal(membershipChecks?.length, 2);
  for (const check of membershipChecks!) await db.exec('alter table platform.tenant_memberships add '+check);
  for (const table of ['public.players', ...['people','organisations','relationships','team_members','scouting_prospects','review_items','change_observations'].map(name => 'djm_os.' + name)]) {
    const ddl = schema.match(new RegExp(`create table ${table.replace('.', '\\.')} \\([\\s\\S]*?\\n\\);`));
    assert.ok(ddl, table);
    await db.exec(ddl[0]);
    if (!['djm_os.change_observations','djm_os.team_members'].includes(table)) await db.exec(`alter table ${table} add column tenant_id uuid not null;`);
  }
  for (const name of ['primary_active_tenant_id','merge_tenant_candidate','user_has_staff_tenant_access']) await db.exec(definition(core, 'private.' + name));
  await db.exec(definition(workspace, 'private.workspace_entity_tenant'));
  await db.exec(definition(boundary, 'private.assign_workspace_tenant'));
  const teamCheck = readFileSync('supabase/staging/bootstrap/004_djm_os_functions_02_21-40.sql','utf8').match(/CREATE OR REPLACE FUNCTION djm_os\.is_team_member\(\)[\s\S]*?\$function\$;/);
  assert.ok(teamCheck);
  await db.exec(teamCheck[0]);
  await db.exec(`alter table djm_os.change_observations enable row level security;
    grant select,insert,update,delete on djm_os.change_observations to authenticated;
    create policy djm_team_select on djm_os.change_observations for select to authenticated using ((select djm_os.is_team_member()));
    create policy djm_team_insert on djm_os.change_observations for insert to authenticated with check ((select djm_os.is_team_member()));
    create policy djm_team_update on djm_os.change_observations for update to authenticated using ((select djm_os.is_team_member())) with check ((select djm_os.is_team_member()));
    create policy djm_team_delete on djm_os.change_observations for delete to authenticated using ((select djm_os.is_team_member()));`);
  await db.exec(`create trigger assign_workspace_tenant before insert or update on djm_os.review_items for each row execute function private.assign_workspace_tenant();`);
  await db.query("insert into platform.tenants values ($1,'active'),($2,'active')", [a,b]);
  await db.query(`insert into platform.tenant_memberships values
    ($1,$3,'active','agent',true),($2,$3,'active','agent',false),
    ($1,$4,'active','agent',true),($2,$5,'suspended','agent',false),
    ($2,$6,'active','agent',false),($2,$7,'active','player',false),
    ($2,$8,'active','admin',true),($2,$9,'active','player',true)`, [a,b,...[1,2,3,4,5,6,7].map(member)]);
  for (let i = 1; i <= 5; i++) await db.query('insert into djm_os.team_members(user_id,display_name,is_active) values ($1,$2,$3)', [member(i),'Synthetic member '+i,i!==4]);
  await db.query("insert into djm_os.people(id,tenant_id,full_name) values ($1,$3,'Same Name'),($2,$4,'Same Name'),($5,$4,'Unowned Contact')", [entity(1),entity(2),a,b,entity(6)]);
  await db.query("insert into djm_os.organisations(id,tenant_id,name,organisation_type) values ($1,$2,'Synthetic FC','club')", [entity(3),a]);
  await db.query("insert into public.players(id,tenant_id,first_name,last_name) values ($1,$2,'Synthetic','Player')", [entity(4),b]);
  await db.query("insert into djm_os.scouting_prospects(id,tenant_id,full_name) values ($1,$2,'Synthetic Prospect')", [entity(5),b]);
  // Include stale and corrupt legacy relationships. The repaired selector must ignore them.
  for (const [tenant,user,strength] of [[a,2,100],[b,3,99],[b,4,98],[b,5,97],[b,1,10]] as const) {
    await db.query('insert into djm_os.relationships(tenant_id,person_id,team_member_id,strength_score) values ($1,$2,$3,$4)', [tenant,entity(2),member(user),strength]);
  }
  await db.exec(definition(legacy, 'djm_os.queue_change_review_items'));
  await db.exec('revoke all on function djm_os.queue_change_review_items() from public,anon,authenticated; grant execute on function djm_os.queue_change_review_items() to service_role;');
  originalAcl = await scalar("proacl::text from pg_proc where oid='djm_os.queue_change_review_items()'::regprocedure");
  await db.query("insert into djm_os.change_observations(entity_type,entity_id,change_type,observed_value) values ('prospect',$1,'club_changed','{}')", [entity(5)]);
  try { await scalar('djm_os.queue_change_review_items()'); } catch (error) { legacyError=error; }
  await db.query("select set_config('test.user',$1,false)",[member(2)]);
  await db.exec('set role authenticated');
  try { legacyForeignRead = await scalar('count(*)::int from djm_os.change_observations')===1; }
  finally { await db.exec('reset role'); }
  await db.exec("select set_config('test.user','',false)");
  await db.exec('truncate djm_os.change_observations,djm_os.review_items');
  await db.exec(repair);
  await db.exec(sourceBoundary);
});
beforeEach(async () => { await db.exec("truncate djm_os.change_observations,djm_os.review_items; select set_config('test.user','',false)"); });
after(async () => { await db.close(); });

async function observation(type: string, id: string, confidence = 0.8, status = 'pending') {
  return (await db.query<{id:string}>(`insert into djm_os.change_observations(entity_type,entity_id,change_type,previous_value,observed_value,source_uri,confidence,status)
    values ($1,$2,'club_changed','{"club":"Before"}','{"club":"After"}','https://example.test/evidence',$3,$4) returning id`, [type,id,confidence,status])).rows[0].id;
}

test('reproduces the actual legacy prospect failure and preserves server-only grants', async () => {
  assert.equal(legacyError?.code, '23514');
  assert.match(legacyError?.message || '', /Trusted tenant context is required/);
  assert.equal(await scalar("proacl::text from pg_proc where oid='djm_os.queue_change_review_items()'::regprocedure"), originalAcl);
  for (const role of ['anon','authenticated']) {
    await db.exec('set role '+role);
    try { await assert.rejects(scalar('djm_os.queue_change_review_items()'), (error:any) => error.code==='42501'); }
    finally { await db.exec('reset role'); }
  }
});

test('cron resolves prospect, player, contact and club to their canonical agencies without a session', async () => {
  const observations = [];
  for (const [type,id] of [['person',1],['person',2],['organisation',3],['player',4],['prospect',5],['person',6]] as const) observations.push(await observation(type,entity(id)));
  const before = await db.query('select * from djm_os.change_observations order by id');
  await db.exec('set role service_role');
  try { assert.deepEqual(await scalar('djm_os.queue_change_review_items()'), {review_items:6,skipped_unresolved:0,busy:false}); }
  finally { await db.exec('reset role'); }
  const rows = (await db.query<any>('select * from djm_os.review_items')).rows;
  assert.equal(rows.length,6);
  for (const [index,tenant] of [a,b,a,b,b,b].entries()) {
    const row=rows.find(row=>row.payload.change_observation_id===observations[index]);
    assert.equal(row.tenant_id,tenant);
    assert.equal(row.payload.observed.club,'After');
    assert.equal(row.payload.source_uri,'https://example.test/evidence');
  }
  assert.equal(rows.find(row=>row.person_id===entity(2)).owner_user_id,member(1),'Only a currently active matching-agency staff relationship can own the review, regardless of primary agency');
  assert.equal(rows.find(row=>row.person_id===entity(6)).owner_user_id,null,'An unowned review never invents a staff owner');
  assert.equal(rows.find(row=>row.payload.entity_type==='player').player_id,entity(4));
  assert.equal(rows.find(row=>row.payload.entity_type==='prospect').payload.entity_id,entity(5));
  assert.deepEqual(await db.query('select * from djm_os.change_observations order by id'),before,'The writer queues review evidence without accepting or rewriting any observation');
  assert.deepEqual(await scalar('djm_os.queue_change_review_items()'), {review_items:0,skipped_unresolved:0,busy:false},'Repeated cron/manual calls do not duplicate open reviews');
});

test('unresolved subjects remain pending without borrowing the signed-in primary tenant or blocking valid work', async () => {
  await db.query("select set_config('test.user',$1,false)",[member(1)]);
  await observation('unknown',entity(5));
  await observation('prospect',entity(99));
  await observation('person',entity(98));
  await observation('prospect',entity(5));
  await observation('player',entity(4),0.99);
  await observation('organisation',entity(3),0.5,'applied');
  assert.deepEqual(await scalar('djm_os.queue_change_review_items()'), {review_items:1,skipped_unresolved:3,busy:false});
  assert.equal(await scalar('tenant_id from djm_os.review_items'),b);
  assert.equal(await scalar("count(*)::int from djm_os.change_observations where status='pending'"),5);
});

test('a wrong-agency legacy review cannot suppress the correct review and tenant guards stay enforced', async () => {
  const id=await observation('prospect',entity(5));
  await db.query("insert into djm_os.review_items(tenant_id,review_type,title,payload) values ($1,'entity_change','Legacy wrong context',$2)",[a,JSON.stringify({change_observation_id:id})]);
  assert.equal((await scalar('djm_os.queue_change_review_items()')).review_items,1);
  assert.equal(await scalar('count(*)::int from djm_os.review_items where tenant_id=$1',[b]),1);
  await assert.rejects(db.query("insert into djm_os.review_items(tenant_id,review_type,title,person_id) values ($1,'entity_change','Wrong agency',$2)",[a,entity(2)]), (error:any)=>error.code==='23514');
  await assert.rejects(db.query('update djm_os.review_items set tenant_id=$1 where tenant_id=$2',[a,b]),(error:any)=>error.code==='23514');
});

test('migration refuses unreviewed writer drift instead of silently overwriting it', async () => {
  const original=await scalar("pg_get_functiondef('djm_os.queue_change_review_items()'::regprocedure)");
  await assert.rejects(db.exec(repair),/Unexpected queue_change_review_items definition/);
  assert.equal(await scalar("pg_get_functiondef('djm_os.queue_change_review_items()'::regprocedure)"),original);
});

test('migration refuses a legacy writer with unexpected browser execute access', async () => {
  await db.exec('begin');
  try {
    await db.exec(definition(legacy,'djm_os.queue_change_review_items'));
    await db.exec('grant execute on function djm_os.queue_change_review_items() to authenticated');
    await assert.rejects(db.exec(repair),/Unexpected browser execute grant/);
  } finally { await db.exec('rollback'); }
  assert.equal(await scalar("proacl::text from pg_proc where oid='djm_os.queue_change_review_items()'::regprocedure"),originalAcl);
});

test('reproduces and closes the legacy global-team observation read/write boundary', async () => {
  assert.equal(legacyForeignRead,true,'The original table policy exposed a B prospect observation to an A-only team member');
  const own=await observation('person',entity(1));
  const foreign=await observation('prospect',entity(5));
  await observation('person',entity(2));
  await observation('player',entity(4));
  await observation('unknown',entity(5));
  await db.query("select set_config('test.user',$1,false)",[member(2)]);
  await db.exec('set role authenticated');
  try {
    assert.deepEqual((await db.query<{id:string}>('select id from djm_os.change_observations')).rows.map(row=>row.id),[own]);
    await observation('organisation',entity(3));
    await assert.rejects(observation('prospect',entity(5)),(error:any)=>error.code==='42501');
    await assert.rejects(observation('unknown',entity(1)),(error:any)=>error.code==='42501');
    await assert.rejects(db.query("update djm_os.change_observations set entity_type='prospect',entity_id=$1 where id=$2",[entity(5),own]),(error:any)=>error.code==='42501');
    assert.equal((await db.query("update djm_os.change_observations set status='applied' where id=$1 returning id",[foreign])).rows.length,0);
    assert.equal((await db.query('delete from djm_os.change_observations where id=$1 returning id',[foreign])).rows.length,0);
    assert.equal((await db.query('delete from djm_os.change_observations where id=$1 returning id',[own])).rows.length,1);
  } finally { await db.exec('reset role'); }
});

test('independent-agency staff work without legacy DJM membership; ended memberships and players stay denied', async () => {
  await observation('prospect',entity(5));
  await db.query("select set_config('test.user',$1,false)",[member(6)]);
  await db.exec('set role authenticated');
  try {
    assert.equal(await scalar('djm_os.is_team_member()'),false);
    assert.equal(await scalar('count(*)::int from djm_os.change_observations'),1);
    await observation('player',entity(4));
    await assert.rejects(observation('person',entity(1)),(error:any)=>error.code==='42501');
  } finally { await db.exec('reset role'); }
  await db.query("update platform.tenant_memberships set status='ended' where user_id=$1",[member(6)]);
  for (const user of [member(6),member(7)]) {
    await db.query("select set_config('test.user',$1,false)",[user]);
    await db.exec('set role authenticated');
    try {
      assert.equal(await scalar('count(*)::int from djm_os.change_observations'),0);
      await assert.rejects(observation('prospect',entity(5)),(error:any)=>error.code==='42501');
    } finally { await db.exec('reset role'); }
  }
  await db.exec('set role anon');
  try { await assert.rejects(scalar('count(*)::int from djm_os.change_observations'),(error:any)=>error.code==='42501'); }
  finally { await db.exec('reset role'); }
});

test('observation policy migration refuses mismatched policies without changing them', async () => {
  const before=await scalar("jsonb_agg(jsonb_build_object('name',polname,'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) order by polname) from pg_policy where polrelid='djm_os.change_observations'::regclass");
  await assert.rejects(db.exec(sourceBoundary),/Unexpected change_observations policies/);
  assert.deepEqual(await scalar("jsonb_agg(jsonb_build_object('name',polname,'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) order by polname) from pg_policy where polrelid='djm_os.change_observations'::regclass"),before);
});
