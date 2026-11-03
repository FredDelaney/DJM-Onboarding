import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const migration=readFileSync('supabase/migrations/20261103120209_verified_request_shortlist.sql','utf8');
const tenant='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
const owner='10000000-0000-4000-8000-000000000001',staff='10000000-0000-4000-8000-000000000002';
const club='30000000-0000-4000-8000-000000000001',need='40000000-0000-4000-8000-000000000001';
const player='50000000-0000-4000-8000-000000000001',match='60000000-0000-4000-8000-000000000001';
const expired='60000000-0000-4000-8000-000000000002',pitched='60000000-0000-4000-8000-000000000003';
const one=async(query:string,params:unknown[]=[])=>Object.values((await db.query<any>('SELECT '+query,params)).rows[0])[0] as any;

before(async()=>{
 await db.exec([
  'create role anon','create role authenticated','create role service_role',
  'create schema private','create schema djm_os','create schema platform',
  'create table platform.tenants(id uuid primary key,status text)',
  'create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text)',
  'create table djm_os.organisations(id uuid primary key,tenant_id uuid,organisation_type text,archived_at timestamptz)',
  'create table djm_os.club_needs(id uuid primary key,tenant_id uuid,organisation_id uuid,archived_at timestamptz,status text,expires_at timestamptz)',
  'create table public.players(id uuid primary key,tenant_id uuid,archived_at timestamptz,football_status text)',
  'create table djm_os.player_matches(id uuid primary key,tenant_id uuid,club_need_id uuid,player_id uuid,status text,updated_at timestamptz)',
  'create table platform.audit_events(tenant_id uuid,actor_user_id uuid,actor_kind text,action text,entity_type text,entity_id text,after_state jsonb,metadata jsonb)',
  "create function private.user_is_tenant_admin(t uuid,u uuid) returns boolean language sql stable as $$select exists(select 1 from platform.tenant_memberships m join platform.tenants x on x.id=m.tenant_id and x.status='active' where m.tenant_id=t and m.user_id=u and m.status='active' and m.role in ('owner','admin'))$$"
 ].join(';\n')+';');
 for(const t of [tenant,other])await db.query("insert into platform.tenants values($1,'active')",[t]);
 await db.query("insert into platform.tenant_memberships values($1,$2,'active','owner')",[tenant,owner]);
 await db.query("insert into platform.tenant_memberships values($1,$2,'active','agent')",[tenant,staff]);
 await db.query("insert into djm_os.organisations values($1,$2,'club',null)",[club,tenant]);
 await db.query("insert into djm_os.club_needs values($1,$2,$3,null,'active','2099-01-01')",[need,tenant,club]);
 await db.query("insert into public.players values($1,$2,null,'active')",[player,tenant]);
 for(const [id,status] of [[match,'suggested'],[expired,'suggested'],[pitched,'pitched']]){
  await db.query("insert into djm_os.player_matches values($1,$2,$3,$4,$5,now())",[id,tenant,need,player,status]);
 }
 await db.exec(migration);
});
after(()=>db.close());

test('only an active tenant owner can shortlist a recorded candidate',async()=>{
 await assert.rejects(()=>one('public.platform_server_club_need_shortlist($1,$2,$3,$4)',[tenant,staff,match,'shortlist']),/admin_required/);
 await assert.rejects(()=>one('public.platform_server_club_need_shortlist($1,$2,$3,$4)',[other,owner,match,'shortlist']),/admin_required/);
 await assert.rejects(()=>one('public.platform_server_club_need_shortlist($1,$2,$3,$4)',[tenant,owner,match,'pitch']),/Invalid shortlist operation/);
 const response=await one('public.platform_server_club_need_shortlist($1,$2,$3,$4)',[tenant,owner,match,'shortlist']);
 assert.equal(response.saved,true);assert.equal(response.changed,true);assert.equal(response.status,'shortlisted');
 assert.equal(await one('status FROM djm_os.player_matches WHERE id=$1',[match]),'shortlisted');
 assert.equal(await one('count(*) FROM platform.audit_events'),1);
 const again=await one('public.platform_server_club_need_shortlist($1,$2,$3,$4)',[tenant,owner,match,'shortlist']);
 assert.equal(again.changed,false);assert.equal(await one('count(*) FROM platform.audit_events'),1);
});

test('removing from shortlist returns to internal review without deleting audit',async()=>{
 const result=await one('public.platform_server_club_need_shortlist($1,$2,$3,$4)',[tenant,owner,match,'remove']);
 assert.equal(result.status,'reviewing');assert.equal(result.changed,true);
 assert.equal(await one('count(*) FROM platform.audit_events'),2);
 assert.equal(await one("metadata->>'external_pitch_sent' FROM platform.audit_events ORDER BY action LIMIT 1"),'false');
});

test('existing pitches cannot be changed by the shortlist button',async()=>{
 await assert.rejects(()=>one('public.platform_server_club_need_shortlist($1,$2,$3,$4)',[tenant,owner,pitched,'shortlist']),/progressed beyond/);
 assert.equal(await one('status FROM djm_os.player_matches WHERE id=$1',[pitched]),'pitched');
 await db.query("update djm_os.club_needs set expires_at='2020-01-01' where id=$1",[need]);
 await assert.rejects(()=>one('public.platform_server_club_need_shortlist($1,$2,$3,$4)',[tenant,owner,expired,'shortlist']),/club_match_unavailable/);
 assert.equal(await one('count(*) FROM platform.audit_events'),2);
});
test('new privileged RPC is never exposed to ordinary browser roles',async()=>{
 const name='public.platform_server_club_need_shortlist(uuid,uuid,uuid,text)';
 assert.equal(await one("has_function_privilege('anon',$1::regprocedure,'EXECUTE')",[name]),false);
 assert.equal(await one("has_function_privilege('authenticated',$1::regprocedure,'EXECUTE')",[name]),false);
 assert.equal(await one("has_function_privilege('service_role',$1::regprocedure,'EXECUTE')",[name]),true);
});
