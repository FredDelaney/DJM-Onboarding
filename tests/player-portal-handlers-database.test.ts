import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
const uuid=(n:number)=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
test('restored player portal handlers preserve ownership and atomic request history',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon;create role authenticated;create role service_role;
   create schema auth;create schema platform;
   create table auth.users(id uuid primary key);
   create table platform.tenants(id uuid primary key,status text);
   create table public.players(id uuid primary key,tenant_id uuid,user_id uuid,archived_at timestamptz,football_status text);
   create table public.player_requests(id uuid primary key default gen_random_uuid(),player_id uuid,title text,message text,request_type text,status text,created_by uuid);
   create table platform.audit_events(tenant_id uuid,actor_user_id uuid,actor_kind text,action text,entity_type text,entity_id text,after_state jsonb,metadata jsonb);
  `);
  const migration=readFileSync('supabase/migrations/20261006052223_restore_player_portal_handlers.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  await db.query("insert into auth.users values($1),($2)",[uuid(1),uuid(2)]);
  await db.query("insert into platform.tenants values($1,'active'),($2,'active')",[uuid(10),uuid(11)]);
  await db.query("insert into public.players values($1,$2,$3,null,'active'),($4,$5,$6,null,'active')",[uuid(20),uuid(10),uuid(1),uuid(21),uuid(11),uuid(2)]);
  const request=async(user=uuid(1),tenant=uuid(10),title='Review my club options',message='A factual question',type='action')=>(await db.query<{value:any}>('select public.platform_server_player_create_request($1,$2,$3,$4,$5) value',[user,tenant,title,message,type])).rows[0].value;
  const event=async(user=uuid(1),tenant=uuid(10),type='portal_opened')=>(await db.query<{value:any}>('select public.platform_server_record_player_portal_event($1,$2,$3,$4) value',[user,tenant,type,{}])).rows[0].value;
  await t.test('a valid request records the owned player, portal event and linked audit',async()=>{
   await db.exec('set role service_role');const result=await request();assert.equal(result.created,true);assert.equal((await event()).recorded,true);await db.exec('reset role');
   const rows=(await db.query<any>('select * from public.player_requests')).rows;assert.equal(rows.length,1);assert.equal(rows[0].player_id,uuid(20));assert.equal(rows[0].created_by,uuid(1));
   const audit=(await db.query<any>("select * from platform.audit_events")).rows[0];assert.equal(audit.entity_id,result.request_id);assert.equal(audit.actor_user_id,uuid(1));
   const events=(await db.query<any>('select * from platform.player_portal_events')).rows;
   assert.equal(events.length,2);assert.equal(events.find(e=>e.event_type==='request_created').id,audit.metadata.portal_event_id);
  });
  await t.test('another user, wrong tenant, archived and retired player cannot write',async()=>{
   for(const [user,tenant] of [[uuid(2),uuid(10)],[uuid(1),uuid(11)],[uuid(99),uuid(10)]]){
    await assert.rejects(request(user,tenant),/player_workspace_not_found/);await assert.rejects(event(user,tenant),/player_workspace_not_found/);
   }
   for(const change of ["archived_at=now()","archived_at=null,football_status='retired'"]){
    await db.exec("update public.players set "+change+" where id='"+uuid(20)+"'");
    await assert.rejects(request(),/player_workspace_not_found/);await assert.rejects(event(),/player_workspace_not_found/);
   }
   await db.exec("update public.players set archived_at=null,football_status='active'");
   await db.exec("update platform.tenants set status='suspended'");await assert.rejects(request(),/player_workspace_not_found/);
   await db.exec("update platform.tenants set status='active'");
  });
  await t.test('invalid, empty and oversized inputs cannot create partial records',async()=>{
   await assert.rejects(request(uuid(1),uuid(10),' '),/request_title_required/);
   await assert.rejects(request(uuid(1),uuid(10),'x'.repeat(201)),/request_title_too_long/);
   await assert.rejects(request(uuid(1),uuid(10),'Valid','x'.repeat(5001)),/request_message_too_long/);
   await assert.rejects(request(uuid(1),uuid(10),'Valid','Message','untrusted'),/invalid_player_request_type/);
   await assert.rejects(event(uuid(1),uuid(10),'fake'),/invalid_player_portal_event_type/);
   assert.equal((await db.query<any>('select count(*)::int count from public.player_requests')).rows[0].count,1);
   await db.exec("alter table platform.audit_events add constraint fail_audit check(action <> 'player_request.created') not valid");
   await assert.rejects(request(),/fail_audit/);
   assert.equal((await db.query<any>('select count(*)::int count from public.player_requests')).rows[0].count,1);
   assert.equal((await db.query<any>('select count(*)::int count from platform.player_portal_events')).rows[0].count,2);
   await db.exec('alter table platform.audit_events drop constraint fail_audit');
  });
  await t.test('browser roles cannot call server writers or read telemetry',async()=>{
   for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);await assert.rejects(request(),/permission denied for function/);await assert.rejects(event(),/permission denied for function/);
    await assert.rejects(db.query('select * from platform.player_portal_events'),/permission denied/);await db.exec('reset role');
   }
  });
 }finally{await db.close();}
});
