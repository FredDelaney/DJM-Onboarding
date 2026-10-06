import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
const uuid=(n:number)=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
test('exact opportunity entry retains real candidate gates and denies other tenants and roles',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon;create role authenticated;create role service_role;create schema djm_os;create schema private;create schema platform;
   create table platform.tenants(id uuid,status text);
   create table platform.tenant_memberships(tenant_id uuid,user_id uuid,role text,status text);
   create function private.user_is_tenant_admin(uuid,uuid) returns boolean language sql stable as $$select exists(select 1 from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active' where m.tenant_id=$1 and m.user_id=$2 and m.role in ('owner','admin') and m.status='active');$$;
   create table djm_os.organisations(id uuid,tenant_id uuid,name text,country text,city text,league_name text,archived_at timestamptz);
   create table djm_os.club_needs(id uuid,tenant_id uuid,organisation_id uuid,title text,status text,need_type text,priority int,expires_at timestamptz,received_at timestamptz,archived_at timestamptz,
    position text,secondary_position text,preferred_foot text,min_age int,max_age int,min_height_cm int,transfer_type text,transfer_budget numeric,salary_budget numeric,currency text,salary_period text,confidence numeric,prediction_probability numeric,confirmed_at timestamptz);
   create table public.players(id uuid,tenant_id uuid,preferred_name text,first_name text,last_name text,archived_at timestamptz,football_status text);
   create table djm_os.player_matches(id uuid,tenant_id uuid,club_need_id uuid,player_id uuid,status text);
   create table djm_os.relationships(tenant_id uuid,person_id uuid,access_score int,strength_score int,trust_score int,last_meaningful_at timestamptz,team_member_id uuid);
   create table djm_os.employments(tenant_id uuid,organisation_id uuid,person_id uuid,is_current boolean,role_title text);
   create table djm_os.people(id uuid,tenant_id uuid,full_name text);
   create function public.platform_server_career_pursuit_gate(uuid,uuid) returns jsonb language sql stable as $$select jsonb_build_object('state','review_human_required','reason','Recorded evidence needs review');$$;
   create function public.platform_server_introduction_routes(uuid,uuid,int) returns jsonb language sql stable as $$select '{}'::jsonb;$$;
  `);
  await db.query("insert into platform.tenants values($1,'active'),($2,'active')",[uuid(1),uuid(2)]);
  await db.query("insert into platform.tenant_memberships values($1,$2,'owner','active'),($1,$3,'scout','active'),($4,$2,'owner','active')",[uuid(1),uuid(10),uuid(11),uuid(2)]);
  await db.query("insert into djm_os.organisations(id,tenant_id,name) values($1,$2,'Exact Club')",[uuid(30),uuid(1)]);
  await db.query("insert into djm_os.club_needs(id,tenant_id,organisation_id,title,status,need_type,priority) select ('00000000-0000-0000-0000-'||lpad((100+g)::text,12,'0'))::uuid,$1,$2,'Recorded need '||g,'active','confirmed',g from generate_series(0,300)g",[uuid(1),uuid(30)]);
  await db.query("insert into public.players values($1,$2,'Assigned Candidate',null,null,null,'active'),($3,$2,'Archived Candidate',null,null,now(),'active')",[uuid(40),uuid(1),uuid(41)]);
  await db.query("insert into djm_os.player_matches values($1,$2,$3,$4,'reviewing'),($5,$2,$3,$6,'reviewing')",[uuid(50),uuid(1),uuid(100),uuid(40),uuid(51),uuid(41)]);
  const migration=readFileSync('supabase/migrations/20261006053128_exact_workspace_record_entry.sql','utf8');await db.exec(migration);await db.exec(migration);
  const get=async(tenant=uuid(1),user=uuid(10),id=uuid(100))=>(await db.query<{value:any}>('select public.platform_server_workspace_need_record($1,$2,$3) value',[tenant,user,id])).rows[0].value;
  const exact=await get();assert.equal(exact.item.club_need_id,uuid(100));assert.equal(exact.item.need.title,'Recorded need 0');
  assert.equal(exact.item.candidate_coverage.recorded_candidates,1);assert.equal(exact.item.candidate_coverage.human_review,1);
  assert.equal(exact.item.candidate_coverage.candidates[0].career_gate_reason,'Recorded evidence needs review');
  assert.equal(exact.item.coverage_state,'career_or_human_review_required');
  assert.equal((await get(uuid(2))).available,false);assert.equal((await get(uuid(1),uuid(10),uuid(999))).available,false);
  await assert.rejects(get(uuid(1),uuid(11)),/tenant_admin_access_required/);await assert.rejects(get(uuid(1),uuid(99)),/tenant_admin_access_required/);
  await db.query("update djm_os.club_needs set status='closed' where id=$1",[uuid(100)]);assert.equal((await get()).item.next_action,null);
  await db.query("update djm_os.club_needs set archived_at=now() where id=$1",[uuid(100)]);assert.equal((await get()).available,false);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(get(),/permission denied for function/);await db.exec('reset role');}
  await db.exec('set role service_role');assert.equal((await get()).available,false);await db.exec('reset role');
  await db.query("update platform.tenants set status='suspended' where id=$1",[uuid(1)]);await assert.rejects(get(),/tenant_admin_access_required/);
 }finally{await db.close();}
});
