import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {before,after,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite(),tenant=randomUUID(),other=randomUUID(),user=randomUUID();
const migration=readFileSync('supabase/migrations/20261028182236_restore_scoped_entity_management_entrypoints.sql','utf8');
const kinds=['player','club','club_contact','recruitment_target','club_need','deal_room'] as const;
type Kind=typeof kinds[number];
const tables:Record<Kind,string>={player:'public.players',club:'djm_os.organisations',club_contact:'djm_os.people',recruitment_target:'djm_os.scouting_prospects',club_need:'djm_os.club_needs',deal_room:'djm_os.deal_rooms'};
const edits:Partial<Record<Kind,Record<string,string>>>={player:{preferred_name:'Updated player'},club:{name:'Updated FC'},club_contact:{full_name:'Updated contact',role_title:'Director'},recruitment_target:{full_name:'Updated prospect',transfermarkt_url:'https://www.transfermarkt.com/example'},deal_room:{title:'Updated deal',next_action_text:'Call the club'}};
const scalar=async(sql:string,args:unknown[]=[])=>Object.values((await db.query<any>('select '+sql,args)).rows[0])[0] as any;
const actor=async(t=tenant)=>db.query("select set_config('test.user',$1,false),set_config('test.tenant',$2,false)",[user,t]);
const call=(action:string,kind:string,id:string,value:unknown)=>scalar('public.redream_entity_'+action+'($1,$2,$3)',[kind,id,value]);
const seed=async(kind:Kind,t=tenant)=>{
 const id=randomUUID();let columns='id,tenant_id',values:unknown[]=[id,t];
 if(kind==='club'){columns+=',name,organisation_type';values.push('Example FC','club');}
 if(kind==='club_contact'||kind==='recruitment_target'){columns+=',full_name';values.push('Example person');}
 if(kind==='club_need'||kind==='deal_room'){columns+=',title';values.push('Example request');}
 await db.query('insert into '+tables[kind]+'('+columns+') values('+values.map((_,i)=>'$'+(i+1)).join(',')+')',values);return id;
};
let contracts:any[]=[];
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema private;create schema platform;create schema djm_os;
 create table platform.tenants(id uuid primary key,status text check(status in('provisioning','active','suspended','closed')));
 create table platform.tenant_memberships(tenant_id uuid,user_id uuid,role text,status text check(status in('invited','active','suspended','ended')));
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create function private.redream_request_tenant() returns uuid language sql stable as $$select nullif(current_setting('test.tenant',true),'')::uuid$$;
 create function private.user_is_tenant_admin(t uuid,u uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$select t is not null and u is not null and exists(select 1 from platform.tenant_memberships m join platform.tenants a on a.id=m.tenant_id and a.status='active' where m.tenant_id=t and m.user_id=u and m.status='active' and m.role in('owner','admin'))$$;
 create function private.redream_admin_tenant() returns uuid language plpgsql stable security definer set search_path='' as $$declare t uuid:=private.redream_request_tenant();begin if not private.user_is_tenant_admin(t,auth.uid()) then raise exception 'agency_admin_access_required' using errcode='42501';end if;return t;end$$;
 create function private.user_has_staff_tenant_access(t uuid,u uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from platform.tenant_memberships where tenant_id=t and user_id=u and status='active' and role<>'player')$$;
 create table public.players(id uuid primary key,tenant_id uuid,first_name text,last_name text,preferred_name text,primary_position text,current_club text,current_country text,contract_expiry date,archived_at timestamptz,updated_at timestamptz);
 create table djm_os.organisations(id uuid primary key,tenant_id uuid,name text,organisation_type text,country text,city text,website_url text,last_verified_at timestamptz,archived_at timestamptz,updated_at timestamptz);
 create table djm_os.people(id uuid primary key,tenant_id uuid,full_name text,preferred_name text,person_type text,country text,city text,last_verified_at timestamptz,archived_at timestamptz,updated_at timestamptz);
 create table djm_os.employments(tenant_id uuid,person_id uuid,organisation_id uuid,role_title text,is_current boolean,updated_at timestamptz);
 create table djm_os.scouting_prospects(id uuid primary key,tenant_id uuid,full_name text,primary_position text,current_club text,current_country text,contract_expiry date,transfermarkt_url text,linked_player_id uuid,signed_player_id uuid,archived_at timestamptz,updated_at timestamptz);
 create table djm_os.club_needs(id uuid primary key,tenant_id uuid,title text,position text,profile_notes text,expires_at timestamptz,archived_at timestamptz,updated_at timestamptz);
 create table djm_os.deal_rooms(id uuid primary key,tenant_id uuid,title text,next_action_text text,prospect_id uuid,archived_at timestamptz,updated_at timestamptz);
 create table djm_os.events(event_type text,actor_user_id uuid,tenant_id uuid,payload jsonb,source text,confidence numeric,occurred_at timestamptz);
 create table djm_os.recruitment_interactions(prospect_id uuid);create table djm_os.scouting_reports(prospect_id uuid);
 create table djm_os.freshness_queue(entity_type text,entity_id uuid);`);
 await db.exec(readFileSync('tests/fixtures/entity-management/writers.sql','utf8'));
 await db.exec(`revoke all on function public.djm_entity_patch_v1(text,uuid,jsonb),public.djm_entity_archive_v1(text,uuid,boolean),public.djm_delete_entity(text,uuid,boolean),public.djm_delete_preview(text,uuid) from public,anon,authenticated;
 grant execute on function public.djm_entity_patch_v1(text,uuid,jsonb),public.djm_entity_archive_v1(text,uuid,boolean),public.djm_delete_entity(text,uuid,boolean),public.djm_delete_preview(text,uuid) to service_role;`);
 contracts=(await db.query("select oid,proowner,proacl,prosecdef,proconfig,md5(prosrc) body_md5 from pg_proc where proname in('djm_entity_patch_v1','djm_entity_archive_v1','djm_delete_entity','djm_delete_preview') order by oid")).rows;
 await db.query("insert into platform.tenants values($1,'active'),($2,'active')",[tenant,other]);
 await db.query("insert into platform.tenant_memberships values($1,$3,'owner','active'),($2,$3,'owner','active')",[tenant,other,user]);
 await actor();for(const signature of ['public.redream_entity_patch(text,uuid,jsonb)','public.redream_entity_archive(text,uuid,boolean)','public.redream_entity_delete(text,uuid,boolean)'])assert.equal(await scalar('to_regprocedure($1)',[signature]),null);await db.exec(migration);await db.exec(readFileSync('supabase/migrations/20261028213902_protect_signed_prospect_management_history.sql','utf8'));
});
after(()=>db.close());

test('browser entrypoints are absent before repair and remain narrow over unchanged canonical contracts',async()=>{
 assert.deepEqual((await db.query("select oid,proowner,proacl,prosecdef,proconfig,md5(prosrc) body_md5 from pg_proc where proname in('djm_entity_patch_v1','djm_entity_archive_v1','djm_delete_entity','djm_delete_preview') order by oid")).rows,contracts);
 for(const signature of ['redream_entity_patch(text,uuid,jsonb)','redream_entity_archive(text,uuid,boolean)','redream_entity_delete(text,uuid,boolean)']){
  assert.equal(await scalar("has_function_privilege('authenticated',$1,'execute')",['public.'+signature]),true);
  assert.equal(await scalar("has_function_privilege('anon',$1,'execute')",['public.'+signature]),false);
 }
 assert.equal(await scalar("has_function_privilege('authenticated','private.redream_entity_management_access(text,uuid)','execute')"),false);
});
test('existing edits save through every supported generic kind and preserve audit identity',async()=>{
 for(const kind of kinds.filter(kind=>kind!=='club_need')){
  const id=await seed(kind);if(kind==='club_contact')await db.query('insert into djm_os.employments(tenant_id,person_id,is_current) values($1,$2,true)',[tenant,id]);
  await db.exec('set role authenticated');let result;try{result=await call('patch',kind,id,edits[kind]);}finally{await db.exec('reset role');}
  assert.equal(result.ok,true);assert.equal(result.id,id);assert.equal(result.entity_type,kind);
  const row=await scalar('to_jsonb(t) from '+tables[kind]+' t where id=$1',[id]);
  for(const [key,value] of Object.entries(edits[kind]!))if(key!=='role_title')assert.equal(row[key],value);
  assert.equal(await scalar("actor_user_id from djm_os.events where payload->>'entity_id'=$1 and event_type='ENTITY_EDITED'",[id]),user);
 }
});
test('archive and restore work for all six existing kinds without changing canonical identity',async()=>{
 for(const kind of kinds){const id=await seed(kind);for(const archived of [true,false]){
  await db.exec('set role authenticated');try{const result=await call('archive',kind,id,archived);assert.equal(result.ok,true);assert.equal(result.archived,archived);}finally{await db.exec('reset role');}
  assert.equal((await scalar('archived_at from '+tables[kind]+' where id=$1',[id]))!==null,archived);
  assert.equal(await scalar('tenant_id from '+tables[kind]+' where id=$1',[id]),tenant);
 }}
});
test('deletion requires true, preserves linked representation and records successful deletion for all kinds',async()=>{
 for(const kind of kinds){const id=await seed(kind);await db.exec('set role authenticated');try{
  for(const confirm of [false,null])await assert.rejects(()=>call('delete',kind,id,confirm),/explicit confirmation/);
  assert.equal((await call('delete',kind,id,true)).deleted,true);
 }finally{await db.exec('reset role');}assert.equal(await scalar('count(*) from '+tables[kind]+' where id=$1',[id]),0);}
 const linked=await seed('recruitment_target');await db.query('update djm_os.scouting_prospects set linked_player_id=$1 where id=$2',[randomUUID(),linked]);
 await db.exec('set role authenticated');try{await assert.rejects(()=>call('delete','recruitment_target',linked,true),/representation history/);}finally{await db.exec('reset role');}
});
test('an administrator in both agencies cannot act on the other workspace through any entrypoint',async()=>{
 for(const kind of kinds){const id=await seed(kind,other);await db.exec('set role authenticated');try{
  for(const [action,value] of [['patch',edits[kind]||{}],['archive',true],['delete',true]] as const)await assert.rejects(()=>call(action,kind,id,value),/unavailable in this workspace/);
 }finally{await db.exec('reset role');}assert.equal(await scalar('count(*) from '+tables[kind]+' where id=$1',[id]),1);}
});
test('ordinary staff, players, revoked membership, suspended agencies and absent identities cannot manage records',async()=>{
 const id=await seed('club');
 for(const role of ['agent','operations','scout','player']){await db.query('update platform.tenant_memberships set role=$1 where tenant_id=$2 and user_id=$3',[role,tenant,user]);
  await db.exec('set role authenticated');try{for(const [action,value] of [['patch',{name:'Forbidden'}],['archive',true],['delete',true]] as const)await assert.rejects(()=>call(action,'club',id,value),/agency_admin_access_required/);}finally{await db.exec('reset role');}
 }
 await db.query("update platform.tenant_memberships set role='admin',status='ended' where tenant_id=$1 and user_id=$2",[tenant,user]);
 await assert.rejects(()=>call('archive','club',id,true),/agency_admin_access_required/);
 await db.query("update platform.tenant_memberships set status='active' where tenant_id=$1 and user_id=$2",[tenant,user]);
 await db.query("update platform.tenants set status='suspended' where id=$1",[tenant]);await assert.rejects(()=>call('archive','club',id,true),/agency_admin_access_required/);
 await db.query("update platform.tenants set status='active' where id=$1",[tenant]);
 await db.query("select set_config('test.user','',false)");await assert.rejects(()=>call('archive','club',id,true),/agency_admin_access_required/);await actor();
});
test('unsupported changes and generic club-brief edits fail instead of dropping fields or bypassing version checks',async()=>{
 const id=await seed('club');for(const patch of [null,[],{tenant_id:other},{internal_notes:'Private'},{name:4},{name:{value:'Bad'}}])await assert.rejects(()=>call('patch','club',id,patch),/object|unsupported/);
 await assert.rejects(()=>call('archive','club',id,null),/Choose whether/);
 const need=await seed('club_need');await assert.rejects(()=>call('patch','club_need',need,{title:'Bypass'}),/current club request editor/);
 assert.equal(await scalar('name from djm_os.organisations where id=$1',[id]),'Example FC');
});
test('both representation links disable delete preview and deletion while allowing archive',async()=>{
 for(const field of ['linked_player_id','signed_player_id']){
  const id=await seed('recruitment_target');await db.query('update djm_os.scouting_prospects set '+field+'=$1 where id=$2',[randomUUID(),id]);
  assert.equal((await scalar('public.redream_entity_action_preview($1,$2)',['recruitment_target',id])).can_delete,false);
  await assert.rejects(()=>call('delete','recruitment_target',id,true),/representation history/);
  assert.equal((await call('archive','recruitment_target',id,true)).archived,true);
 }
});
test('club and contact aliases cannot modify another organisation type or a player person',async()=>{
 const org=await seed('club'),person=await seed('club_contact');await db.query("update djm_os.organisations set organisation_type='agency' where id=$1",[org]);await db.query("update djm_os.people set person_type='player' where id=$1",[person]);
 for(const [kind,id] of [['club',org],['club_contact',person]])for(const [action,value] of [['patch',{}],['archive',true],['delete',true]] as const)await assert.rejects(()=>call(action,kind,id,value),/unavailable in this workspace/);
});
