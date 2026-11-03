import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const migration=readFileSync('supabase/migrations/20261103053623_verified_player_club_links.sql','utf8');
const tenant='20000000-0000-4000-8000-000000000001';
const other='20000000-0000-4000-8000-000000000002';
const actor='10000000-0000-4000-8000-000000000001';
const outsider='10000000-0000-4000-8000-000000000002';
const club='30000000-0000-4000-8000-000000000001';
const otherClub='30000000-0000-4000-8000-000000000002';
const player='40000000-0000-4000-8000-000000000001';
const otherPlayer='40000000-0000-4000-8000-000000000002';
const rogue='40000000-0000-4000-8000-000000000003';
const scalar=async(s:string,args:unknown[]=[])=>Object.values((await db.query<any>('SELECT '+s,args)).rows[0])[0] as any;

before(async()=>{
 await db.exec([
 "create role anon","create role authenticated","create role service_role",
 "create schema private","create schema djm_os","create schema platform",
 "create table platform.tenants(id uuid primary key,status text not null)",
 "create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text)",
 "create table public.players(id uuid primary key,tenant_id uuid not null,first_name text,last_name text,preferred_name text,current_club text,current_country text,archived_at timestamptz,primary_position text,primary_staff_user_id uuid)",
 "create table public.staff_player_access(player_id uuid,staff_user_id uuid,can_edit boolean)",
 "create table djm_os.organisations(id uuid primary key,tenant_id uuid not null,name text,organisation_type text,country text,city text,league_name text,archived_at timestamptz)",
 "create unique index organisations_request_tenant_identity_uidx on djm_os.organisations(tenant_id,id)",
 "create table djm_os.people(id uuid primary key,tenant_id uuid,full_name text,archived_at timestamptz)",
 "create table djm_os.employments(tenant_id uuid,organisation_id uuid,person_id uuid,is_current boolean,role_title text,updated_at timestamptz)",
 "create table djm_os.club_needs(tenant_id uuid,organisation_id uuid,id uuid,archived_at timestamptz,status text)",
 "create table djm_os.deal_rooms(tenant_id uuid,organisation_id uuid,status text)",
 "create table platform.club_catalogue_links(tenant_id uuid,organisation_id uuid,source text,source_id text)",
 "create table platform.audit_events(tenant_id uuid,actor_user_id uuid,actor_kind text,action text,entity_type text,entity_id text,after_state jsonb,metadata jsonb)",
 "create function private.user_is_tenant_admin(t uuid,u uuid) returns boolean language sql stable as $$select exists(select 1 from platform.tenant_memberships m join platform.tenants a on a.id=m.tenant_id and a.status='active' where m.tenant_id=t and m.user_id=u and m.status='active' and m.role in ('owner','admin'))$$"
 ].join(';\n')+';');
 for(const [t,s] of [[tenant,'active'],[other,'active']])await db.query('insert into platform.tenants values($1,$2)',[t,s]);
 for(const [t,u] of [[tenant,actor],[other,outsider]])await db.query("insert into platform.tenant_memberships values($1,$2,'active','owner')",[t,u]);
 await db.query("insert into djm_os.organisations values($1,$2,'Example FC','club','England',null,null,null)",[club,tenant]);
 await db.query("insert into djm_os.organisations values($1,$2,'Other FC','club','France',null,null,null)",[otherClub,other]);
 await db.query("insert into public.players values($1,$2,'Alice','Jones',null,'Legacy Club','England',null,'Striker',null)",[player,tenant]);
 await db.query("insert into public.players values($1,$2,'Bob','Smith',null,'Example FC','England',null,'Striker',null)",[otherPlayer,tenant]);
 await db.query("insert into public.players values($1,$2,'Eve','Rogue',null,'Other FC','France',null,'Striker',null)",[rogue,other]);
 await db.exec(migration);
});
after(()=>db.close());

test('historic links are not guessed; exact-name matches remain visibly unverified',async()=>{
 assert.equal(await scalar('count(*) FROM djm_os.player_club_links'),0);
 const data=await scalar('public.platform_server_club_reference_people($1,$2,$3)',[tenant,actor,club]);
 assert.equal(data.players.length,1);
 assert.equal(data.players[0].verified_link,false);
});
test('only correct tenant owner can search and link the existing player',async()=>{
 const candidates=await scalar('public.platform_server_club_link_candidates($1,$2,$3,$4)',[tenant,actor,club,'Alice']);
 assert.equal(candidates.items.length,1);assert.equal(candidates.items[0].can_link,true);
 await assert.rejects(()=>scalar('public.platform_server_club_link_candidates($1,$2,$3,$4)',[tenant,outsider,club,'']),/admin_required/);
 await assert.rejects(()=>scalar('public.platform_server_club_link_player($1,$2,$3,$4)',[tenant,actor,rogue,club]),/player_not_found/);
 await assert.rejects(()=>scalar('public.platform_server_club_link_player($1,$2,$3,$4)',[tenant,actor,player,otherClub]),/club_not_found/);
 const result=await scalar('public.platform_server_club_link_player($1,$2,$3,$4)',[tenant,actor,player,club]);
 assert.equal(result.linked,true);assert.equal(result.already_linked,false);
 assert.equal(await scalar('current_club FROM public.players WHERE id=$1',[player]),'Example FC');
 assert.equal(await scalar('source_club_name FROM djm_os.player_club_links WHERE player_id=$1',[player]),'Legacy Club');
 assert.equal(await scalar('count(*) FROM platform.audit_events'),1);
});
test('verified and name-fallback players are counted exactly once; link is idempotent',async()=>{
 const result=await scalar('public.platform_server_club_link_player($1,$2,$3,$4)',[tenant,actor,player,club]);
 assert.equal(result.already_linked,true);assert.equal(await scalar('count(*) FROM platform.audit_events'),1);
 const data=await scalar('public.platform_server_club_reference_people($1,$2,$3)',[tenant,actor,club]);
 assert.equal(data.players.length,2);
 assert.equal(data.players.find((x:any)=>x.id===player).verified_link,true);
 assert.equal(data.players.find((x:any)=>x.id===otherPlayer).verified_link,false);
 const directory=await scalar('public.platform_server_clubs_directory($1,$2,$3,$4,$5)',[tenant,actor,'',20,0]);
 assert.equal(directory.items[0].player_count,2);
});
test('editing the player current club removes the stale verified association',async()=>{
 await db.query('update public.players set current_club=$1 where id=$2',['New Destination',player]);
 assert.equal(await scalar('count(*) FROM djm_os.player_club_links'),0);
 const data=await scalar('public.platform_server_club_reference_people($1,$2,$3)',[tenant,actor,club]);
 assert.equal(data.players.length,1);
});
test('direct anonymous and authenticated access is not granted',async()=>{
 assert.equal(await scalar("has_table_privilege('authenticated','djm_os.player_club_links','SELECT')"),false);
 assert.equal(await scalar("has_table_privilege('anon','djm_os.player_club_links','INSERT')"),false);
 for(const name of ['public.platform_server_club_link_candidates(uuid,uuid,uuid,text)','public.platform_server_club_link_player(uuid,uuid,uuid,uuid)']){
  assert.equal(await scalar("has_function_privilege('anon',$1::regprocedure,'EXECUTE')",[name]),false);
  assert.equal(await scalar("has_function_privilege('authenticated',$1::regprocedure,'EXECUTE')",[name]),false);
  assert.equal(await scalar("has_function_privilege('service_role',$1::regprocedure,'EXECUTE')",[name]),true);
 }
 await assert.rejects(()=>scalar('public.platform_server_club_reference_people($1,$2,$3)',[tenant,outsider,club]),/access_denied/);
});
