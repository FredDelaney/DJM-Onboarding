import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const read = (name:string) => readFileSync('supabase/migrations/'+name,'utf8');
const migration = read('20261023143715_restore_owner_branding_contract_v1.sql');
const signature = 'public.platform_server_owner_update_branding(uuid,uuid,text,text,text,text,text,text,text)';
const tenant = (i:number) => `20000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const user = (i:number) => `10000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const args = () => [tenant(1),user(1),' New Agency ',' Agency Portal ','#123abc','#45def0',' AGENT@EXAMPLE.TEST ','https://example.test','+1234'];
async function scalar(sql:string,values:unknown[]=[]) { return Object.values((await db.query('select '+sql,values)).rows[0])[0] as any; }
async function save(values:unknown[]=args()) {
  return scalar('public.platform_server_owner_update_branding($1,$2,$3,$4,$5,$6,$7,$8,$9)',values);
}
before(async()=>{
  await db.exec(`create schema platform; create role anon; create role authenticated; create role service_role bypassrls;
    create table platform.tenants(id uuid primary key,status text);
    create table platform.tenant_memberships(tenant_id uuid,user_id uuid,role text,status text);`);
  const membershipChecks = read('20260904133549_create_tenants_and_memberships.sql')
    .match(/constraint tenant_memberships_(?:role|status)_check\s+check \([^\n]+\)/g);
  assert.equal(membershipChecks?.length, 2);
  for (const check of membershipChecks!) await db.exec('alter table platform.tenant_memberships add '+check);
  for (const [file,table] of [
    ['20260904133625_create_branding_and_domains.sql','tenant_branding'],
    ['20260904135421_create_audit_and_idempotency.sql','audit_events'],
  ]) {
    const ddl=read(file).match(new RegExp(`create table platform.${table} \\([\\s\\S]*?\\n\\);`));
    assert.ok(ddl);await db.exec(ddl[0]);
    await db.exec('alter table platform.'+table+' enable row level security');
  }
  await db.query("insert into platform.tenants values ($1,'active'),($2,'active')",[tenant(1),tenant(2)]);
  await db.query("insert into platform.tenant_memberships values ($1,$3,'owner','active'),($2,$4,'owner','active'),($1,$5,'admin','active'),($1,$6,'owner','suspended')",[tenant(1),tenant(2),user(1),user(2),user(3),user(4)]);
  assert.equal(await scalar('to_regprocedure($1)::text',[signature]),null,'Reproduce the live missing dependency before restoring it');
  await db.exec(migration);
});
beforeEach(async()=>{
  await db.exec('truncate platform.audit_events,platform.tenant_branding');
  for (const i of [1,2]) await db.query(`insert into platform.tenant_branding(tenant_id,display_name,portal_name,primary_color,secondary_color,accent_color,support_email,logo_asset,legal_name,metadata)
    values ($1,$2,'Original Portal','#111111','#222222','#333333','original@example.test','tenant-logo','Original Legal Name','{"retained":true}')`,[tenant(i),'Original Agency '+i]);
});
after(async()=>{await db.close();});

test('restored live branding contract is server-only even when a browser knows an owner UUID',async()=>{
  for (const role of ['anon','authenticated']) {
    await db.exec('set role '+role);
    try { await assert.rejects(save(),(error:any)=>error.code==='42501'); }
    finally { await db.exec('reset role'); }
  }
  await db.exec('set role service_role');
  try { assert.equal((await save()).display_name,'New Agency'); }
  finally { await db.exec('reset role'); }
});

test('owner save normalises editable branding, retains other agency assets and records accurate audit evidence',async()=>{
  const before=await scalar('to_jsonb(b) from platform.tenant_branding b where tenant_id=$1',[tenant(1)]);
  const other=await scalar('to_jsonb(b) from platform.tenant_branding b where tenant_id=$1',[tenant(2)]);
  const result=await save();
  assert.equal(result.display_name,'New Agency');assert.equal(result.portal_name,'Agency Portal');
  assert.equal(result.primary_color,'#123ABC');assert.equal(result.accent_color,'#45DEF0');assert.equal(result.support_email,'agent@example.test');
  assert.equal(result.logo_asset,'tenant-logo');assert.equal(result.secondary_color,'#222222');assert.equal(result.legal_name,'Original Legal Name');assert.deepEqual(result.metadata,{retained:true});
  assert.deepEqual(await scalar('to_jsonb(b) from platform.tenant_branding b where tenant_id=$1',[tenant(2)]),other);
  const audit=await scalar('to_jsonb(e) from platform.audit_events e');
  assert.equal(audit.tenant_id,tenant(1));assert.equal(audit.actor_user_id,user(1));assert.equal(audit.actor_kind,'user');
  assert.equal(audit.action,'platform.owner.branding_updated');assert.deepEqual(audit.before_state,before);assert.deepEqual(audit.after_state,result);
});

test('cross-agency owners, admins and suspended owners cannot change branding or create audit events',async()=>{
  const before=await scalar('jsonb_agg(to_jsonb(b) order by tenant_id) from platform.tenant_branding b');
  for (const id of [user(2),user(3),user(4),null]) {
    const values=args();values[1]=id as any;
    await assert.rejects(save(values),/tenant_owner_access_required/);
  }
  assert.deepEqual(await scalar('jsonb_agg(to_jsonb(b) order by tenant_id) from platform.tenant_branding b'),before);
  assert.equal(await scalar('count(*)::int from platform.audit_events'),0);
});

test('invalid branding cannot partly save or create misleading audit evidence',async()=>{
  const before=await scalar('to_jsonb(b) from platform.tenant_branding b where tenant_id=$1',[tenant(1)]);
  for (const [index,value,message] of [[2,'','invalid_display_name'],[3,'x'.repeat(121),'invalid_portal_name'],[4,'blue','invalid_brand_colour'],[6,'bad-email','invalid_support_email'],[7,'javascript:alert(1)','invalid_website_url'],[8,'1'.repeat(51),'invalid_phone']] as const) {
    const values=args();values[index]=value;await assert.rejects(save(values),new RegExp(message));
  }
  assert.deepEqual(await scalar('to_jsonb(b) from platform.tenant_branding b where tenant_id=$1',[tenant(1)]),before);
  assert.equal(await scalar('count(*)::int from platform.audit_events'),0);
});

test('the staging canonical writer is preserved exactly on migration replay without data mutations',async()=>{
  const before=await scalar("jsonb_build_object('oid',oid,'source',prosrc,'acl',proacl,'owner',proowner,'config',proconfig) from pg_proc where oid=$1::regprocedure",[signature]);
  await db.exec(migration);
  assert.deepEqual(await scalar("jsonb_build_object('oid',oid,'source',prosrc,'acl',proacl,'owner',proowner,'config',proconfig) from pg_proc where oid=$1::regprocedure",[signature]),before);
  assert.equal(await scalar('count(*)::int from platform.audit_events'),0);
});

test('unexpected existing writer or browser-grant drift is refused rather than overwritten',async()=>{
  for (const drift of [
    'grant execute on function '+signature+' to authenticated',
    "alter function "+signature+" set search_path='public'",
  ]) {
    await db.exec('begin');
    try { await db.exec(drift);await assert.rejects(db.exec(migration),/Unexpected owner branding writer or grants/); }
    finally { await db.exec('rollback'); }
  }
});
