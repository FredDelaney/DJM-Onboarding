import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const baseline = readFileSync('tests/fixtures/staff-invite-auth-baseline.sql', 'utf8');
const migrationFile = readdirSync('supabase/migrations').find(name => name.endsWith('_repair_staff_invite_signup.sql'));
const followupFile = readdirSync('supabase/migrations').find(name => name.endsWith('_repair_staff_invite_auth_insert_order.sql'));
const profileSyncFile = readdirSync('supabase/migrations').find(name => name.endsWith('_preserve_staff_membership_on_profile_save.sql'));
const migration = [migrationFile,followupFile,profileSyncFile].filter(Boolean).map(name=>readFileSync(`supabase/migrations/${name}`,'utf8')).join('\n');
const tenant = '10000000-0000-4000-8000-000000000001';
const invite = '20000000-0000-4000-8000-000000000001';
const user = '30000000-0000-4000-8000-000000000001';
const trusted = { invitation_kind: 'agency_staff', staff_invite_id: invite, invited_tenant_id: tenant };

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private; create schema platform; create schema extensions; create schema djm_os;
    create function extensions.digest(text,text) returns bytea language sql as $$select sha256(convert_to($1,'UTF8'))$$;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
    create table public.admin_allowlist(email text,role text);
    create table public.profiles(id uuid primary key references auth.users, email text,display_name text,role text check(role in ('player','admin','scout')));
    create table platform.tenants(id uuid primary key,status text);
    create table platform.tenant_memberships(tenant_id uuid,user_id uuid,role text,status text);
    create table djm_os.team_members(user_id uuid primary key,display_name text,role_title text,is_active boolean,updated_at timestamptz default now());
    create table platform.tenant_staff_invites(id uuid primary key,tenant_id uuid,email text,role text,status text,expires_at timestamptz,token_hash text);
    create table public.player_invites(id uuid primary key,token uuid,email text,status text,expires_at timestamptz,player_id uuid,accepted_at timestamptz);
    create table public.players(id uuid primary key default gen_random_uuid(),user_id uuid,preferred_name text,onboarding_status text);
    create table public.player_private(player_id uuid primary key,personal_email text);
    create table public.player_onboarding(player_id uuid primary key,current_step integer);
    create table public.player_cv_settings(player_id uuid primary key);
    create table public.player_privacy_acceptances(player_id uuid,user_id uuid,notice_version text,accepted_via text,unique(user_id,notice_version));
    insert into platform.tenants values('${tenant}','active');
    insert into platform.tenant_staff_invites values('${invite}','${tenant}','invited@example.test','admin','pending',now()+interval '1 day',encode(extensions.digest(repeat('a',64),'sha256'),'hex'));
  `);
  await db.exec(baseline);
  await db.exec(readFileSync('supabase/migrations/20260828051133_sync_authorised_staff_team_membership.sql','utf8'));
  const ensure = readFileSync('supabase/migrations/20260924214500_tenant_parity_player_security_v1.sql','utf8').match(/create or replace function private\.platform_server_ensure_team_member\([\s\S]*?\n\$\$;/)![0];
  await db.exec(ensure);
  await db.exec('create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user()');
  if (migration) await db.exec(migration);
  return db;
}

async function create(db: PGlite, app = {}, meta = {}, email = 'invited@example.test') {
  return db.query('insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values($1,$2,$3,$4)', [user,email,JSON.stringify(app),JSON.stringify(meta)]);
}

test('a server-verified staff invitation creates a neutral profile without player onboarding or global admin rights', async () => {
  const db = await fixture();
  try {
    await create(db, trusted, {full_name:'Invited Colleague',invited_role:'owner'});
    assert.deepEqual((await db.query('select email,display_name,role from public.profiles')).rows, [{email:'invited@example.test',display_name:'Invited Colleague',role:'player'}]);
    for (const table of ['players','player_private','player_onboarding','player_cv_settings','player_privacy_acceptances']) {
      assert.equal((await db.query(`select count(*)::integer as total from public.${table}`)).rows[0].total, 0);
    }
    assert.equal((await db.query('select status from platform.tenant_staff_invites')).rows[0].status, 'pending', 'Only token-checked completion may consume the invite');
  } finally { await db.close(); }
});

test('user-editable staff metadata cannot bypass player invitation and privacy checks', async () => {
  const db = await fixture();
  try {
    await assert.rejects(create(db, {}, {...trusted,full_name:'Forged Admin'}), /Privacy Notice/);
    assert.equal((await db.query('select count(*)::integer as total from public.profiles')).rows[0].total,0);
  } finally { await db.close(); }
});

test('Auth INSERT validates the actual invitation token before server app metadata is written', async () => {
  const db = await fixture();
  try {
    await create(db, {provider:'email',providers:['email']}, {staff_invite_token:'a'.repeat(64),full_name:'Invited Colleague',invited_role:'owner'});
    assert.equal((await db.query('select role from public.profiles')).rows[0].role,'player');
    assert.equal((await db.query('select count(*)::integer as total from public.players')).rows[0].total,0);
  } finally { await db.close(); }
});

test('untrusted token transport cannot invent or transfer an invitation', async t => {
  for (const [name,token,email,sql] of [
    ['wrong token','b'.repeat(64),'invited@example.test',''],
    ['malformed token','invalid','invited@example.test',''],
    ['wrong email','a'.repeat(64),'other@example.test',''],
    ['revoked token','a'.repeat(64),'invited@example.test',"update platform.tenant_staff_invites set status='revoked'"],
  ] as const) await t.test(name,async()=>{
    const db=await fixture();try{
      if(sql)await db.exec(sql);
      await assert.rejects(create(db,{}, {staff_invite_token:token},email),/valid agency staff invitation/);
    }finally{await db.close();}
  });
});

test('trusted staff claims are rejected when the actual invitation or agency is unavailable', async t => {
  for (const [name,sql,app,email] of [
    ['revoked', "update platform.tenant_staff_invites set status='revoked'", trusted, 'invited@example.test'],
    ['accepted', "update platform.tenant_staff_invites set status='accepted'", trusted, 'invited@example.test'],
    ['expired', "update platform.tenant_staff_invites set expires_at=now()-interval '1 second'", trusted, 'invited@example.test'],
    ['inactive agency', "update platform.tenants set status='suspended'", trusted, 'invited@example.test'],
    ['wrong email', '', trusted, 'someone-else@example.test'],
    ['wrong tenant', '', {...trusted,invited_tenant_id:'10000000-0000-4000-8000-000000000002'}, 'invited@example.test'],
    ['missing invite', '', {...trusted,staff_invite_id:'not-an-id'}, 'invited@example.test'],
    ['invalid role', "update platform.tenant_staff_invites set role='owner'", trusted, 'invited@example.test'],
  ] as const) {
    await t.test(name, async () => {
      const db = await fixture();
      try {
        if (sql) await db.exec(sql);
        await assert.rejects(create(db,app,{},email), /valid agency staff invitation/);
        assert.equal((await db.query('select count(*)::integer as total from auth.users')).rows[0].total,0);
      } finally { await db.close(); }
    });
  }
});

test('player invitation onboarding and privacy acknowledgement remain enforced', async () => {
  const db = await fixture();
  try {
    await db.exec(`insert into public.player_invites values('${invite}','${invite}','player@example.test','pending',now()+interval '1 day',null,null)`);
    await assert.rejects(create(db, {}, {invite_token:invite},'player@example.test'), /Privacy Notice/);
    await assert.rejects(create(db, {}, {privacy_acknowledged:true,privacy_notice_version:'2026-09-02'},'player@example.test'), /valid DJM player invitation/);
    await create(db, {}, {full_name:'Invited Player',invite_token:invite,privacy_acknowledged:true,privacy_notice_version:'2026-09-02'},'player@example.test');
    assert.equal((await db.query('select count(*)::integer as total from public.players')).rows[0].total,1);
    assert.equal((await db.query('select status from public.player_invites')).rows[0].status,'accepted');
    assert.equal((await db.query('select notice_version from public.player_privacy_acceptances')).rows[0].notice_version,'2026-09-02');
  } finally { await db.close(); }
});

test('the staff repair replays safely and preserves the existing legacy allowlist path', async () => {
  const db = await fixture();
  try {
    if (migration) await db.exec(migration);
    await db.exec("insert into public.admin_allowlist values('legacy@example.test','admin')");
    await create(db, {}, {full_name:'Legacy Admin'},'legacy@example.test');
    assert.equal((await db.query('select role from public.profiles')).rows[0].role,'admin');
    assert.equal((await db.query('select count(*)::integer as total from public.players')).rows[0].total,0);
  } finally { await db.close(); }
});

test('saving an invited colleague profile preserves active team identity without granting global admin',async()=>{
  const db=await fixture();
  try{
    await create(db,{}, {staff_invite_token:'a'.repeat(64),full_name:'Invited Colleague'});
    await db.exec(`insert into platform.tenant_memberships values('${tenant}','${user}','admin','active'); select private.platform_server_ensure_team_member('${user}');`);
    await db.exec("update public.profiles set display_name='Updated Colleague'");
    assert.deepEqual((await db.query('select display_name,is_active from djm_os.team_members')).rows,[{display_name:'Updated Colleague',is_active:true}]);
    assert.equal((await db.query('select role from public.profiles')).rows[0].role,'player');
    await db.exec("update platform.tenant_memberships set status='inactive'; update public.profiles set display_name='Former Colleague'");
    assert.equal((await db.query('select is_active from djm_os.team_members')).rows[0].is_active,false);
  }finally{await db.close();}
});

const wiring=readFileSync('supabase/migrations/20261021170117_restore_auth_signup_trigger_wiring.sql','utf8');
test('missing Auth wiring is restored and repeated application preserves the repaired function',async()=>{
 const db=await fixture();try{
 const before=(await db.query("select pg_get_functiondef('private.handle_new_user()'::regprocedure) body")).rows[0].body;
 await db.exec('drop trigger on_auth_user_created on auth.users');await db.exec(wiring);await db.exec(wiring);
 await create(db,{}, {staff_invite_token:'a'.repeat(64),full_name:'Recovered Colleague'});
 assert.equal((await db.query('select role from public.profiles')).rows[0].role,'player');
 assert.equal((await db.query('select count(*)::integer count from public.players')).rows[0].count,0);
 assert.equal((await db.query("select pg_get_functiondef('private.handle_new_user()'::regprocedure) body")).rows[0].body,before);
 }finally{await db.close();}
});
test('healthy or unexpected signup wiring is never silently replaced',async()=>{
 const db=await fixture();try{
 await db.exec(wiring);await db.exec('alter table auth.users disable trigger on_auth_user_created');
 await assert.rejects(db.exec(wiring),/existing wiring was preserved/);
 assert.equal((await db.query("select tgenabled from pg_trigger where tgname='on_auth_user_created'")).rows[0].tgenabled,'D');
 await db.exec('drop trigger on_auth_user_created on auth.users;create trigger alternative_signup after insert on auth.users for each row execute function private.handle_new_user()');
 await assert.rejects(db.exec(wiring),/Other Auth INSERT trigger exists/);
 }finally{await db.close();}
});
