import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {after,before,beforeEach,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const migration=readFileSync('supabase/migrations/20261023075343_restore_profile_release_writers_v1.sql','utf8');
const lockMigration=readFileSync('supabase/migrations/20261023092411_lock_profile_publication_player_v1.sql','utf8');
const previousPublisher=readFileSync('supabase/migrations/20261002105500_player_profile_publish_snapshot_writer_v1.sql','utf8').match(/create or replace function public\.platform_server_publish_player_profile_snapshot[\s\S]*?\bas (\$\w*\$)[\s\S]*?\1;/i)![0];
const parent=readFileSync('supabase/migrations/20260924214500_tenant_parity_player_security_v1.sql','utf8');
const tenant='20000000-0000-4000-8000-000000000001',foreign='20000000-0000-4000-8000-000000000002';
const owner='10000000-0000-4000-8000-000000000001',agent='10000000-0000-4000-8000-000000000002',outsider='10000000-0000-4000-8000-000000000003';
const player='30000000-0000-4000-8000-000000000001',otherPlayer='30000000-0000-4000-8000-000000000002';
const verification='public.platform_server_confirm_player_profile_verification(uuid,uuid,uuid,text)';
const publication='public.platform_server_publish_player_profile_snapshot(uuid,uuid,uuid,jsonb)';
const guardNames=['protect_player_admin_fields','protect_public_profile_admin_fields'];
const value=async(sql:string,args:unknown[]=[])=>Object.values((await db.query<any>('select '+sql,args)).rows[0])[0] as any;
const verify=(actor=owner,id=player)=>value('public.platform_server_confirm_player_profile_verification($1,$2,$3,$4)',[tenant,id,actor,'operator_confirmation']);
const publish=(snapshot:any={},actor=owner)=>value('public.platform_server_publish_player_profile_snapshot($1,$2,$3,$4)',[tenant,player,actor,snapshot]);
function guard(name:string){
 const match=parent.match(new RegExp('create or replace function private\\.'+name+'\\(\\)[\\s\\S]*?as (\\$\\w*\\$)[\\s\\S]*?\\1;','i'));
 assert.ok(match,'The canonical parent guard must exist');return match[0];
}
async function records(){return (await db.query('select to_jsonb(p) as row from public.players p order by id')).rows;}
before(async()=>{
 await db.exec(`
 create schema platform;create schema private;create schema auth;
 create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table platform.tenants(id uuid primary key,status text);
 create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text);
 create table platform.tenant_branding(tenant_id uuid primary key,support_email text);
 create table platform.audit_events(tenant_id uuid,actor_user_id uuid,actor_kind text,action text,entity_type text,entity_id text,before_state jsonb,after_state jsonb,metadata jsonb);
 create table public.staff_player_access(player_id uuid,staff_user_id uuid,can_edit boolean);
 create table public.players(
  id uuid primary key,tenant_id uuid,user_id uuid,first_name text,last_name text,preferred_name text,
  date_of_birth date,nationalities text[],height_cm integer,preferred_foot text,primary_position text,secondary_positions text[],
  current_club text,current_league text,current_country text,current_season_label text,current_season_start date,
  contract_status text,contract_expiry date,football_status text,transfermarkt_url text,wyscout_url text,stats_url text,instagram_url text,
  profile_photo_path text,verification_status text,verified_at timestamptz,review_required_at timestamptz,review_reason text,
  agency_priority text,next_action text,next_action_due date,onboarding_status text,verification_notes text,
  created_at timestamptz default now(),updated_at timestamptz default now()
 );
 create table public.player_public_profiles(
  player_id uuid primary key,public_slug text,published boolean default false,published_at timestamptz,display_name text,
  headline text,primary_position text,secondary_positions text[],preferred_foot text,age_display text,height_display text,nationalities text[],
  current_status text,current_club text,key_stats jsonb,why_review text,career_summary text,profile_photo_path text,hero_image_path text,
  primary_video_url text,transfermarkt_url text,wyscout_url text,stats_url text,contact_email text,
  career_timeline jsonb,selected_videos jsonb,notable_experience jsonb,market_value_display text,market_value_source_url text,
  hidden_sections text[],hide_market_value boolean,verified_at timestamptz,updated_at timestamptz default now()
 );
 create function private.user_is_tenant_admin(t uuid) returns boolean language sql stable as $$
  select exists(select 1 from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id
   where m.tenant_id=$1 and m.user_id=auth.uid() and m.status='active' and t.status='active' and m.role in ('owner','admin'))$$;
 create function private.user_is_player_tenant_admin(p uuid) returns boolean language sql stable as $$
  select private.user_is_tenant_admin(tenant_id) from public.players where id=p$$;
 `);
 for(const name of guardNames)await db.exec(guard(name));
 await db.exec(`create trigger player_guard before update on public.players for each row execute function private.protect_player_admin_fields();
 create trigger profile_guard before update on public.player_public_profiles for each row execute function private.protect_public_profile_admin_fields();`);
});
beforeEach(async()=>{
 await db.exec('reset role');
 for(const name of ['request.jwt.claim.sub','djm.internal_profile_verification','djm.internal_tenant_dossier_mode','djm.internal_tenant_dossier_tenant'])await value("set_config($1,'',false)",[name]);
 for(const name of guardNames)await db.exec(guard(name));
 await db.exec(`drop function if exists ${verification};drop function if exists ${publication};
 delete from platform.audit_events;delete from public.player_public_profiles;delete from public.players;
 delete from platform.tenant_memberships;delete from platform.tenants;delete from platform.tenant_branding;delete from public.staff_player_access;`);
 await db.query("insert into platform.tenants values($1,'active'),($2,'active')",[tenant,foreign]);
 await db.query("insert into platform.tenant_memberships values($1,$2,'active','owner'),($1,$3,'active','agent'),($4,$5,'active','owner')",[tenant,owner,agent,foreign,outsider]);
 await db.query("insert into platform.tenant_branding values($1,'agent@example.invalid')",[tenant]);
 await db.query("insert into public.players(id,tenant_id,first_name,last_name,primary_position,current_club,nationalities,secondary_positions,date_of_birth,height_cm,verification_status) values($1,$2,'Example','Player','Centre back','Example FC',array['NZ'],array['Right back'],'2000-06-01',185,'reviewing'),($3,$4,'Foreign','Player','Goalkeeper','Other FC',array['AU'],'{}',null,null,'reviewing')",[player,tenant,otherPlayer,foreign]);
 await db.query('insert into public.staff_player_access values($1,$2,true)',[player,agent]);
 const before=await records();
 await db.exec(migration);
 assert.deepEqual(await records(),before,'Installing the repair must not rewrite player records');
});
after(()=>db.close());

test('verification and publication use canonical football facts, tenant branding and audit records',async()=>{
 const verified=await verify();assert.equal(verified.player.verification_status,'verified');assert.ok(verified.verified_at);
 const result=await publish({headline:'Club-facing profile',key_stats:[{label:'Appearances',value:'12'}],career_timeline:[{club:'Example FC'}]});
 assert.equal(result.profile.display_name,'Example Player');assert.equal(result.profile.current_club,'Example FC');
 assert.equal(result.profile.primary_position,'Centre back');assert.equal(result.profile.contact_email,'agent@example.invalid');
 assert.equal(result.profile.published,true);assert.equal(result.profile.age_display,String(new Date().getUTCFullYear()-2000-(new Date().toISOString().slice(5,10)<'06-01'?1:0)));
 assert.equal(result.profile.market_value_display,null);
 assert.deepEqual(await value("array_agg(action order by action) from platform.audit_events"),['player_profile.player_data_verified','player_profile.published']);
 const firstPublished=result.profile.published_at;
 const updated=await publish({headline:'Reviewed revision'});assert.equal(updated.profile.published_at,firstPublished);assert.equal(updated.profile.public_slug,result.profile.public_slug);
});

test('verification rechecks active membership, player scope and current edit assignment',async()=>{
 assert.equal((await verify(agent)).player.verification_status,'verified');
 await db.query('update public.staff_player_access set can_edit=false where player_id=$1',[player]);
 await assert.rejects(()=>verify(agent),/agency_operator_access_required/);
 await assert.rejects(()=>verify(outsider),/agency_operator_access_required/);
 await assert.rejects(()=>verify(owner,otherPlayer),/player_not_found/);
 await db.query("update platform.tenant_memberships set status='suspended' where user_id=$1",[owner]);
 await assert.rejects(()=>verify(),/agency_operator_access_required/);
 await db.query("update platform.tenant_memberships set status='active' where user_id=$1",[owner]);
 await db.query("update platform.tenants set status='suspended' where id=$1",[tenant]);
 await assert.rejects(()=>verify(),/agency_operator_access_required/);
});

test('publication requires verified data, management, contact details and the approved snapshot shape',async()=>{
 await assert.rejects(()=>publish(),/verified_player_required/);
 await verify();
 await assert.rejects(()=>publish({},agent),/tenant_dossier_publish_access_required/);
 await assert.rejects(()=>publish({current_club:'Invented FC'}),/unsupported_profile_snapshot_field/);
 await assert.rejects(()=>publish({key_stats:{}}),/key_stats_must_be_array/);
 await db.query('update platform.tenant_branding set support_email=null where tenant_id=$1',[tenant]);
 await assert.rejects(()=>publish(),/tenant_support_email_required/);
 assert.equal(await value('count(*)::integer from public.player_public_profiles'),0);
});

test('browser roles cannot call server writers even with a legitimate owner id',async()=>{
 for(const role of ['anon','authenticated']){
  assert.equal(await value('has_function_privilege($1,$2,\'execute\')',[role,verification]),false);
  assert.equal(await value('has_function_privilege($1,$2,\'execute\')',[role,publication]),false);
  await db.exec('set role '+role);
  try{await assert.rejects(()=>verify(),/permission denied/);await assert.rejects(()=>publish(),/permission denied/);}
  finally{await db.exec('reset role');}
 }
 await db.exec('set role service_role');
 try{assert.equal((await verify()).ok,true);assert.equal((await publish()).ok,true);}finally{await db.exec('reset role');}
});

test('the existing guard still invalidates edited facts and rejects unexpected internal writes',async()=>{
 await verify();await publish();
 await value("set_config('request.jwt.claim.sub',$1,false)",[owner]);
 await db.query("update public.players set current_club='Updated FC' where id=$1",[player]);
 assert.equal(await value('verification_status from public.players where id=$1',[player]),'reviewing');
 assert.equal(await value('verified_at from public.players where id=$1',[player]),null);
 await db.exec('begin');
 try{
  await value("set_config('djm.internal_profile_verification','on',true)");
  await assert.rejects(()=>db.query("update public.players set current_club='Unexpected FC' where id=$1",[player]),/unexpected player-field change/);
 }finally{await db.exec('rollback');}
 await db.exec('begin');
 try{
  await value("set_config('djm.internal_tenant_dossier_mode','publish_snapshot',true)");
  await value("set_config('djm.internal_tenant_dossier_tenant',$1,true)",[tenant]);
  await assert.rejects(()=>db.query("update public.player_public_profiles set public_slug='unexpected' where player_id=$1",[player]),/unexpected field change/);
 }finally{await db.exec('rollback');}
});

test('repeat application preserves existing records and newer writer implementations',async()=>{
 await verify();await publish();const before=await records(),audit=await value('count(*)::integer from platform.audit_events');
 await db.exec(migration);assert.deepEqual(await records(),before);assert.equal(await value('count(*)::integer from platform.audit_events'),audit);
 await db.exec(`create or replace function public.platform_server_publish_player_profile_snapshot(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid,p_snapshot jsonb)
 returns jsonb language sql security definer set search_path='' as $$select '{"newer_writer":true}'::jsonb$$;`);
 const newer=await value('pg_get_functiondef($1::regprocedure)',[publication]);
 await db.exec(migration);assert.equal(await value('pg_get_functiondef($1::regprocedure)',[publication]),newer);
});

test('the existing production publisher gains a player lock without rewriting data or privileges',async()=>{
 await db.exec(previousPublisher);await verify();
 const playerLocked=()=>value("exists(select 1 from pg_locks where relation='public.players'::regclass and mode='RowShareLock' and granted)");
 await db.exec('begin');
 try{await publish();assert.equal(await playerLocked(),false,'The previous publisher did not lock verified facts');}finally{await db.exec('rollback');}
 const before=await records();await db.exec(lockMigration);assert.deepEqual(await records(),before);
 const locked=await value('pg_get_functiondef($1::regprocedure)',[publication]);
 await db.exec(lockMigration);assert.equal(await value('pg_get_functiondef($1::regprocedure)',[publication]),locked);
 assert.equal(await value("has_function_privilege('authenticated',$1,'execute')",[publication]),false);
 assert.equal(await value("has_function_privilege('service_role',$1,'execute')",[publication]),true);
 await db.exec('begin');
 try{assert.equal((await publish()).profile.published,true);assert.equal(await playerLocked(),true,'Publication must lock the player until its snapshot transaction finishes');}finally{await db.exec('rollback');}
});

test('publication lock repair accepts the locked writer and refuses unknown implementation drift',async()=>{
 await db.exec(lockMigration);
 await db.exec(`create or replace function public.platform_server_publish_player_profile_snapshot(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid,p_snapshot jsonb)
 returns jsonb language sql security definer set search_path='' as $$select '{"newer_writer":true}'::jsonb$$;`);
 const newer=await value('pg_get_functiondef($1::regprocedure)',[publication]);
 await db.exec('begin');
 try{await assert.rejects(()=>db.exec(lockMigration),/profile_publish_writer_drift/);}finally{await db.exec('rollback');}
 assert.equal(await value('pg_get_functiondef($1::regprocedure)',[publication]),newer);
});

test('unknown guard drift aborts the transaction before any partial reconciliation is committed',async()=>{
 await db.exec(`drop function ${verification};drop function ${publication};`);
 const original=guard('protect_public_profile_admin_fields');
 // Change the function body so the migration must refuse this unreviewed version.
 await db.exec(original.replace('declare','declare\n -- unreviewed guard change'));
 await db.exec('begin');
 try{await assert.rejects(()=>db.exec(migration),/profile_guard_drift/);}finally{await db.exec('rollback');}
 assert.equal(await value('to_regprocedure($1)::text',[verification]),null);
 assert.equal(await value('to_regprocedure($1)::text',[publication]),null);
});
