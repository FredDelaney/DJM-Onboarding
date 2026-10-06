import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const uuid = (n:number) => '00000000-0000-0000-0000-'+String(n).padStart(12,'0');
test('complete workspace search enforces membership, lifecycle, ranking and result bounds',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role;
   create schema platform; create schema private; create schema djm_os;
   create table platform.tenants(id uuid primary key,status text);
   create table platform.tenant_memberships(tenant_id uuid,user_id uuid,role text,status text);
   create function private.user_has_staff_tenant_access(uuid,uuid) returns boolean language sql stable as $$
    select exists(select 1 from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
     where m.tenant_id=$1 and m.user_id=$2 and m.status='active' and m.role in ('owner','admin','agent','operations','scout')); $$;
   create function private.user_is_tenant_admin(uuid,uuid) returns boolean language sql stable as $$
    select exists(select 1 from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
     where m.tenant_id=$1 and m.user_id=$2 and m.status='active' and m.role in ('owner','admin')); $$;
   create table public.staff_player_access(player_id uuid,staff_user_id uuid,can_edit boolean);
   create table public.players(id uuid primary key,tenant_id uuid,preferred_name text,first_name text,last_name text,current_club text,primary_position text,current_country text,football_status text,archived_at timestamptz);
   create table djm_os.scouting_prospects(id uuid,tenant_id uuid,full_name text,current_club text,primary_position text,current_country text,archived_at timestamptz);
   create table djm_os.organisations(id uuid,tenant_id uuid,name text,country text,league_name text,organisation_type text,archived_at timestamptz);
   create table djm_os.people(id uuid,tenant_id uuid,full_name text,preferred_name text,person_type text,archived_at timestamptz);
   create table djm_os.employments(id uuid,tenant_id uuid,person_id uuid,organisation_id uuid,role_title text,is_current boolean,started_on date,updated_at timestamptz);
   create table djm_os.club_needs(id uuid,tenant_id uuid,title text,position text,organisation_id uuid,archived_at timestamptz);
   create table djm_os.deal_rooms(id uuid,tenant_id uuid,title text,stage text,organisation_id uuid,archived_at timestamptz);
  `);
  const migration=readFileSync('supabase/migrations/20261005204011_complete_workspace_search.sql','utf8');
  await db.exec(migration);
  await db.exec(migration);
  await db.query("insert into platform.tenants values($1,'active'),($2,'active')",[uuid(1),uuid(2)]);
  await db.query("insert into platform.tenant_memberships values($1,$2,'owner','active'),($1,$3,'scout','active'),($1,$4,'agent','ended'),($1,$5,'player','active')",[uuid(1),uuid(10),uuid(11),uuid(12),uuid(13)]);
  await db.query(`insert into public.players(id,tenant_id,preferred_name,current_club,primary_position,football_status)
   select ('00000000-0000-0000-0000-'||lpad((1000+g)::text,12,'0'))::uuid,$1,'Capacity Player '||g,'Example FC','Centre back','active'
   from generate_series(0,249) g`,[uuid(1)]);
  await db.query("insert into public.players values($1,$2,'José Silva',null,null,'Example FC','Centre back','NZ','active',null),($3,$4,'Tenant Secret',null,null,null,null,null,'active',null),($5,$2,'Archived Player',null,null,null,null,null,'active',now()),($6,$2,'Retired Player',null,null,null,null,null,'retired',null)",[uuid(2000),uuid(1),uuid(2001),uuid(2),uuid(2002),uuid(2003)]);
  await db.query("insert into djm_os.organisations values($1,$2,'Needle Club','NZ','League','club',null),($3,$2,'Needle Archived Club',null,null,'club',now()),($4,$2,'Needle Sponsor',null,null,'sponsor',null)",[uuid(3000),uuid(1),uuid(3001),uuid(3002)]);
  await db.query("insert into djm_os.scouting_prospects values($1,$2,'Needle Prospect',null,null,null,null),($3,$2,'Needle Archived Prospect',null,null,null,now())",[uuid(3100),uuid(1),uuid(3101)]);
  await db.query("insert into djm_os.people values($1,$2,'Needle Director',null,'contact',null),($3,$2,'Needle Private Player',null,'player',null),($4,$2,'Needle Archived Contact',null,'contact',now())",[uuid(3200),uuid(1),uuid(3201),uuid(3202)]);
  await db.query("insert into djm_os.employments values($1,$2,$3,$4,'Director',true,'2026-01-01',now())",[uuid(3300),uuid(1),uuid(3200),uuid(3000)]);
  await db.query("insert into djm_os.club_needs values($1,$2,'Needle Opportunity','Centre back',$3,null),($4,$2,'Needle Archived Opportunity',null,$3,now())",[uuid(3400),uuid(1),uuid(3000),uuid(3401)]);
  await db.query("insert into djm_os.deal_rooms values($1,$2,'Needle Deal','open',$3,null),($4,$2,'Needle Archived Deal','open',$3,now())",[uuid(3500),uuid(1),uuid(3000),uuid(3501)]);
  const search=async(query:string,limit=30,tenant=uuid(1),user=uuid(10))=>(await db.query<{result:any}>('select public.platform_server_workspace_search($1,$2,$3,$4) result',[tenant,user,query,limit])).rows[0].result;
  await t.test('finds the 250th player beyond the former 200-record cap',async()=>{
   const result=await search('Capacity Player 249');assert.equal(result.items[0].id,uuid(1249));assert.equal(result.total,1);
  });
  await t.test('returns exact counts with a bounded ranked response',async()=>{
   const result=await search('Capacity Player',500);assert.equal(result.total,250);assert.equal(result.items.length,30);assert.equal(result.has_more,true);
  });
  await t.test('searches all six canonical record kinds and excludes archived/private player people',async()=>{
   const result=await search('Needle');assert.deepEqual(result.items.map((x:any)=>x.kind).sort(),['club','contact','deal','opportunity','recruitment']);
   assert.ok(result.items.every((x:any)=>!x.title.includes('Archived')&&!x.title.includes('Private')));
   assert.ok(result.items.some((x:any)=>x.subtitle==='Needle Club · Director'));
   assert.equal((await search('Archived Player')).total,0);assert.equal((await search('Retired Player')).total,0);
  });
  await t.test('matches accents, separate words and literal special characters',async()=>{
   assert.equal((await search('jose silva')).items[0].id,uuid(2000));
   assert.equal((await search('jose back')).items[0].id,uuid(2000));
   assert.equal((await search('example back')).total,251);
   assert.equal((await search('%')).total,0);assert.equal((await search('_')).total,0);
   assert.equal((await search("' OR 1=1 --")).total,0);
   assert.equal((await search('   ')).total,0);
  });
  await t.test('cannot return another tenant or accept unrelated, ended or player membership',async()=>{
   assert.equal((await search('Tenant Secret')).total,0);
   for(const [tenant,user] of [[uuid(2),uuid(10)],[uuid(1),uuid(12)],[uuid(1),uuid(13)],[uuid(1),uuid(99)]]){
    await assert.rejects(search('Player',30,tenant,user),/staff_tenant_access_required/);
   }
   assert.equal((await search('José',30,uuid(1),uuid(11))).total,0);
   await db.query('insert into public.staff_player_access values($1,$2,false)',[uuid(2000),uuid(11)]);
   assert.equal((await search('José',30,uuid(1),uuid(11))).total,1);
   assert.equal((await search('Capacity',30,uuid(1),uuid(11))).total,0);
   const scoped=await search('Needle',30,uuid(1),uuid(11));
   assert.deepEqual(scoped.items.map((x:any)=>x.kind).sort(),['club','contact','recruitment']);
   assert.equal((await search('Needle Deal',30,uuid(1),uuid(11))).total,0);
   assert.equal((await search('Needle Opportunity',30,uuid(1),uuid(11))).total,0);
   await db.query("update platform.tenants set status='suspended' where id=$1",[uuid(1)]);
   await assert.rejects(search('Player'),/staff_tenant_access_required/);
   await db.query("update platform.tenants set status='active' where id=$1",[uuid(1)]);
  });
  await t.test('rejects both browser roles while preserving service execution',async()=>{
   for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);
    await assert.rejects(search('Player'),/permission denied for function/);
    await db.exec('reset role');
   }
   await db.exec('set role service_role');assert.equal((await search('José')).total,1);await db.exec('reset role');
  });
  await t.test('pages the whole roster without omissions or duplicates',async()=>{
   await db.exec(`alter table public.players
    add column user_id uuid,add column date_of_birth date,add column nationalities text[],
    add column height_cm integer,add column preferred_foot text,add column secondary_positions text[],
    add column current_league text,add column contract_status text,add column contract_expiry date,
    add column profile_photo_path text,add column agency_priority text,add column next_action text,
    add column next_action_due timestamptz,add column transfermarkt_market_value numeric,
    add column transfermarkt_market_value_currency text,add column updated_at timestamptz;
   create table public.player_agreements(id uuid,player_id uuid,agreement_type text,status text,title text,start_date date,end_date date,updated_at timestamptz);
   create table public.player_public_profiles(player_id uuid,published boolean,public_slug text,display_name text,updated_at timestamptz,verified_at timestamptz);
   create table public.player_opportunities(tenant_id uuid,player_id uuid,stage text);
   create function public.platform_server_player_service_card(uuid,uuid) returns jsonb language sql stable as $$ select '{}'::jsonb; $$;`);
   await db.exec(readFileSync('supabase/migrations/20261006045124_paged_player_directory.sql','utf8'));
   const page=async(offset:number,user=uuid(10))=>(await db.query<{result:any}>('select public.platform_server_players_workspace_page($1,$2,$3,100) result',[uuid(1),user,offset])).rows[0].result;
   const one=await page(0),two=await page(one.next_offset),three=await page(two.next_offset);
   assert.deepEqual([one.items.length,two.items.length,three.items.length],[100,100,51]);
   assert.equal(one.total,251);assert.equal(three.has_more,false);
   const ids=[...one.items,...two.items,...three.items].map(x=>x.player_id);
   assert.equal(new Set(ids).size,251);assert.ok(ids.includes(uuid(1249)));
   await assert.rejects(page(0,uuid(99)),/staff_tenant_access_required/);
   await db.query("update public.players set contract_status='private-contract',contract_expiry='2027-01-01',transfermarkt_market_value=900000,next_action='Private negotiation' where id=$1",[uuid(2000)]);
   await db.query("insert into public.player_agreements values($1,$2,'representation','active','Private agreement',null,null,now())",[uuid(6000),uuid(2000)]);
   const assigned=await page(0,uuid(11));assert.equal(assigned.total,1);assert.equal(assigned.items[0].player_id,uuid(2000));
   assert.equal(assigned.items[0].access.restricted,true);
   for(const key of ['contract_status','contract_expiry','transfermarkt_market_value','next_action','next_action_due','agency_priority'])assert.equal(key in assigned.items[0].identity,false);
   for(const key of ['service','representation','active_opportunities'])assert.equal(key in assigned.items[0],false);
   assert.doesNotMatch(JSON.stringify(assigned),/Private agreement|private-contract|Private negotiation/);
   await db.query("insert into platform.tenant_memberships values($1,$2,'agent','active'),($1,$3,'operations','active')",[uuid(1),uuid(14),uuid(15)]);
   for(const member of [uuid(14),uuid(15)]){
    assert.equal((await page(0,member)).total,0);
    await db.query('insert into public.staff_player_access values($1,$2,true)',[uuid(2000),member]);
    assert.equal((await page(0,member)).total,1);
    assert.equal((await search('Capacity',30,uuid(1),member)).total,0);
   }
   await db.query("insert into platform.tenant_memberships values($1,$2,'admin','active')",[uuid(1),uuid(16)]);
   assert.equal((await page(0,uuid(16))).total,251);
   for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(page(0),/permission denied for function/);await db.exec('reset role');}
  });
  await t.test('player entry returns only owned workspaces and verified domains',async()=>{
   await db.exec(`alter table platform.tenants add column slug text;
    create table platform.tenant_branding(tenant_id uuid,display_name text,portal_name text,short_name text,logo_asset text,compact_logo_asset text,primary_color text,secondary_color text,accent_color text,support_email text,website_url text);
    create table platform.tenant_domains(id uuid,tenant_id uuid,hostname text,status text,is_primary boolean,created_at timestamptz);`);
   await db.query("update public.players set user_id=$1 where id=$2",[uuid(20),uuid(2000)]);
   await db.query("update public.players set user_id=$1 where id=$2",[uuid(21),uuid(2001)]);
   await db.query("insert into platform.tenant_domains values($1,$2,'agency.example.test','verified',true,now()),($3,$2,'pending.example.test','pending',true,now()),($4,$5,'other.example.test','verified',true,now())",[uuid(4000),uuid(1),uuid(4001),uuid(4002),uuid(2)]);
   await db.exec(readFileSync('supabase/migrations/20261006045519_verified_player_portal_entry.sql','utf8'));
   const entries=async(user:string)=>(await db.query<{result:any}>('select public.platform_server_player_workspaces($1) result',[user])).rows[0].result.workspaces;
   const owned=await entries(uuid(20));assert.equal(owned.length,1);assert.equal(owned[0].portal_hostname,'agency.example.test');assert.equal(owned[0].player_id,uuid(2000));
   assert.deepEqual(await entries(uuid(99)),[]);
   await db.query("update platform.tenant_domains set status='disabled' where tenant_id=$1 and status='verified'",[uuid(1)]);
   assert.equal((await entries(uuid(20)))[0].portal_hostname,null);
   for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(entries(uuid(20)),/permission denied for function/);await db.exec('reset role');}
   await db.exec('set role service_role');assert.equal((await entries(uuid(20))).length,1);await db.exec('reset role');
  });
 }finally{await db.close();}
});
