import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
const uuid=(n:number)=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
test('owned onboarding saves are atomic, resumable and protected by RLS',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon;create role authenticated;create schema auth;create schema private;create schema platform;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table platform.tenants(id uuid primary key,status text);
   create table public.players(id uuid primary key,tenant_id uuid,user_id uuid,archived_at timestamptz,football_status text default 'active',first_name text,last_name text,preferred_name text,date_of_birth date,nationalities text[] not null default '{}',height_cm integer,preferred_foot text,primary_position text,secondary_positions text[] not null default '{}',current_club text,current_league text,current_country text,contract_status text,contract_expiry date,transfermarkt_url text,wyscout_url text,stats_url text,instagram_url text,onboarding_status text not null default 'not_started',verification_status text default 'reviewing',updated_at timestamptz not null default now());
   create table public.player_private(player_id uuid primary key,phone text,personal_email text,whatsapp text,residence_country text,passports_held text[] not null default '{}',work_rights text,market_preferences text,relocation_preferences text,preferred_move_timing text,salary_expectation text,travel_availability text,updated_at timestamptz default now());
   create table public.player_onboarding(player_id uuid primary key,current_step integer not null default 1,draft jsonb not null default '{}',draft_state jsonb not null default '{}',completed_at timestamptz,submitted_at timestamptz,updated_at timestamptz default now());
   create table public.player_videos(id uuid primary key default gen_random_uuid(),player_id uuid,title text,url text,video_type text,featured boolean);
   grant usage on schema public,auth,private to authenticated,anon;
   grant select,update on public.players to authenticated;
   grant select,insert,update on public.player_private,public.player_onboarding,public.player_videos to authenticated;
   alter table public.players enable row level security;
   create policy own_player on public.players for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
  `);
  for(const table of ['player_private','player_onboarding','player_videos'])await db.exec(`alter table public.${table} enable row level security;create policy own_row on public.${table} for all to authenticated using(exists(select 1 from public.players p where p.id=player_id and p.user_id=auth.uid())) with check(exists(select 1 from public.players p where p.id=player_id and p.user_id=auth.uid()));`);
  const migration=readFileSync('supabase/migrations/20261006143724_atomic_player_onboarding.sql','utf8');await db.exec(migration);await db.exec(migration);
  await db.query("insert into platform.tenants values($1,'active'),($2,'active')",[uuid(10),uuid(11)]);
  await db.query("insert into public.players(id,tenant_id,user_id,first_name,last_name,primary_position,preferred_foot) values($1,$2,$3,'First','Player','Centre back','Right'),($4,$5,$6,'Other','Player','Centre back','Left')",[uuid(20),uuid(10),uuid(1),uuid(21),uuid(11),uuid(2)]);
  await db.query("insert into public.player_private(player_id,personal_email,market_preferences) values($1,'keep@example.test','NZ')",[uuid(20)]);
  const snapshot=async()=> (await db.query<any>("select onboarding_status,first_name,updated_at from public.players where id=$1",[uuid(20)])).rows[0];
  const save=async({player=uuid(20),tenant=uuid(10),profile={},priv={},step=2,video='',finish=false,version,privVersion}:any={})=>{
   const stamp=version===undefined?(await snapshot()).updated_at:version;
   const privateStamp=privVersion===undefined?(await db.query<any>('select updated_at from public.player_private where player_id=$1',[player])).rows[0]?.updated_at || null:privVersion;
   return (await db.query<any>('select public.player_save_onboarding($1,$2,$3,$4,$5,$6,$7,$8,$9) value',[player,tenant,profile,priv,step,video,finish,stamp,privateStamp])).rows[0].value;
  };
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uuid(1)]);
  await db.exec('set role authenticated');
  await t.test('draft save preserves omitted private fields and resumes optional video',async()=>{
   const result=await save({profile:{first_name:'Updated'},priv:{phone:'+64 21234567'},step:4,video:'https://youtu.be/draft'});
   assert.equal(result.saved,true);assert.equal(result.completed,false);
   const row=(await db.query<any>('select * from public.player_private where player_id=$1',[uuid(20)])).rows[0];assert.equal(row.personal_email,'keep@example.test');assert.equal(row.market_preferences,'NZ');
   const progress=(await db.query<any>('select * from public.player_onboarding')).rows[0];assert.equal(progress.current_step,4);assert.equal(progress.draft.video_url,'https://youtu.be/draft');assert.equal(progress.draft_state.video_url,'https://youtu.be/draft');assert.equal(progress.completed_at,null);
  });
  await t.test('another user, wrong tenant, archived, retired and suspended workspaces cannot save',async()=>{
   await assert.rejects(save({player:uuid(21),tenant:uuid(11)}),/player_workspace_not_found/);
   await assert.rejects(save({tenant:uuid(11)}),/player_workspace_not_found/);
   for(const change of ["archived_at=now()","archived_at=null,football_status='retired'"]){
    await db.exec('reset role');await db.exec("update public.players set "+change+" where id='"+uuid(20)+"'");await db.exec('set role authenticated');await assert.rejects(save(),/player_workspace_not_found/);
   }
   await db.exec("reset role;update public.players set archived_at=null,football_status='active';update platform.tenants set status='suspended';set role authenticated");await assert.rejects(save(),/player_workspace_not_found/);
   await db.exec("reset role;update platform.tenants set status='active';set role authenticated");
  });
  await t.test('untrusted fields, malformed inputs and stale drafts cannot alter state',async()=>{
   for(const fields of [{user_id:uuid(2)},{tenant_id:uuid(11)},{verification_status:'verified'},{onboarding_status:'submitted'}])await assert.rejects(save({profile:fields}),/onboarding_field_not_allowed/);
   await assert.rejects(save({priv:{personal_email:'hijack@example.test'}}),/onboarding_field_not_allowed/);
   await assert.rejects(save({profile:[]}),/invalid_onboarding_payload/);
   await assert.rejects(save({step:0}),/invalid_onboarding_step/);
   await assert.rejects(save({video:'javascript:alert(1)'}),/invalid_onboarding_url/);
   await assert.rejects(save({profile:{height_cm:30}}),/invalid_onboarding_height/);
   await assert.rejects(save({profile:{date_of_birth:'2099-01-01'}}),/invalid_onboarding_birth_date/);
   await assert.rejects(save({version:'2000-01-01T00:00:00Z'}),/onboarding_changed/);
   assert.equal((await snapshot()).first_name,'Updated');
  });
  await t.test('a concurrent private-only agency edit cannot be overwritten by an older onboarding draft',async()=>{
   const old=(await db.query<any>('select updated_at from public.player_private where player_id=$1',[uuid(20)])).rows[0].updated_at;
   await db.query("update public.player_private set market_preferences='Agency update',updated_at=clock_timestamp() where player_id=$1",[uuid(20)]);
   try{
    await assert.rejects(save({priv:{market_preferences:'Stale draft'},privVersion:old}),/onboarding_changed/);
    assert.equal((await db.query<any>('select market_preferences from public.player_private')).rows[0].market_preferences,'Agency update');
   }finally{await db.query("update public.player_private set market_preferences='NZ',updated_at=clock_timestamp() where player_id=$1",[uuid(20)]);}
  });
  await t.test('video insert failure rolls back profile, private progress and completion',async()=>{
   const before=await snapshot();await db.exec("reset role;alter table public.player_videos add constraint fail_video check(url <> 'https://youtu.be/fail');set role authenticated");
   await assert.rejects(save({profile:{first_name:'Must roll back'},priv:{market_preferences:'UK'},step:4,video:'https://youtu.be/fail',finish:true}),/fail_video/);
   assert.deepEqual(await snapshot(),before);
   assert.equal((await db.query<any>('select market_preferences from public.player_private')).rows[0].market_preferences,'NZ');
   assert.equal((await db.query<any>('select completed_at from public.player_onboarding')).rows[0].completed_at,null);
   await db.exec('reset role;alter table public.player_videos drop constraint fail_video;set role authenticated');
  });
  await t.test('completion retries and late draft writes never duplicate video or regress completion',async()=>{
   const before=await snapshot();const result=await save({step:4,video:'https://youtu.be/complete',finish:true});assert.equal(result.completed,true);
   await save({step:4,video:'https://youtu.be/complete',finish:true,version:before.updated_at});
   await save({profile:{first_name:'Late draft'},step:1,version:before.updated_at});
   const row=await snapshot();assert.equal(row.onboarding_status,'submitted');assert.equal(row.first_name,'Updated');assert.equal((await db.query<any>('select count(*)::int count from public.player_videos')).rows[0].count,1);
   const progress=(await db.query<any>('select * from public.player_onboarding')).rows[0];assert.equal(progress.current_step,4);assert.ok(progress.completed_at);assert.ok(progress.submitted_at);
  });
  await t.test('agency-verified and completed onboarding cannot be reopened by a late draft',async()=>{
   for(const status of ['verified','complete']){
    await db.exec('reset role');await db.query('update public.players set onboarding_status=$1 where id=$2',[status,uuid(20)]);await db.exec('set role authenticated');
    const result=await save({profile:{first_name:'Late draft'},step:1});
    assert.equal(result.completed,true);assert.equal((await snapshot()).onboarding_status,status);assert.equal((await snapshot()).first_name,'Updated');
   }
  });
  await t.test('anonymous calls and revoked write policies cannot bypass the transaction',async()=>{
   await db.exec('reset role;set role anon');await assert.rejects(save({version:'2026-01-01',privVersion:null}),/permission denied for function/);await db.exec('reset role');
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uuid(2)]);
   await db.exec('drop policy own_row on public.player_private;set role authenticated');
   await assert.rejects(save({player:uuid(21),tenant:uuid(11),version:(await db.query<any>('select updated_at from public.players')).rows[0].updated_at,profile:{first_name:'Denied'}}),/row-level security policy/);
   assert.equal((await db.query<any>('select first_name from public.players')).rows[0].first_name,'Other');await db.exec('reset role');
  });
 }finally{await db.close();}
});
