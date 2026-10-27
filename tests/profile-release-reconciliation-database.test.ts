import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {after,before,beforeEach,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const migration=readFileSync('supabase/migrations/20261023075343_restore_profile_release_writers_v1.sql','utf8');
const lockMigration=readFileSync('supabase/migrations/20261023092411_lock_profile_publication_player_v1.sql','utf8');
const statMigration=readFileSync('supabase/migrations/20261023191512_preserve_approved_profile_stat_snapshots_v1.sql','utf8');
const settingsStatMigration=readFileSync('supabase/migrations/20261023193512_preserve_profile_stat_editor_choices_v1.sql','utf8');
const reviewedCareerSource=readFileSync('supabase/migrations/20260825155856_harden_reviewed_career_dossier_stats_v1.sql','utf8');
const seasonSource=readFileSync('supabase/migrations/20260902113027_djm_dossier_season_totals_v1.sql','utf8');
const timelineSource=readFileSync('supabase/migrations/20260825162448_sanitize_public_dossier_placeholder_content_v1.sql','utf8');
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
 create table public.career_entries(
  id uuid primary key default gen_random_uuid(),player_id uuid references public.players(id) on delete cascade,
  club_name text,country text,league text,season_label text,stats_year smallint,start_date date,end_date date,
  appearances integer,starts integer,minutes integer,goals integer,assists integer,is_international boolean default false,
  source_name text,source_url text,source_reviewed_at timestamptz,source_synced_at timestamptz,source_provider text,
  notes text,sort_order integer default 0,created_at timestamptz default now()
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

function sqlFunction(source:string,name:string){
 const escaped=name.replaceAll('.','\\.');
 const definition=source.match(new RegExp('create or replace function '+escaped+'\\([\\s\\S]*?\\bas (\\$\\w*\\$)[\\s\\S]*?\\1;','i'))?.[0];
 assert.ok(definition,name);return definition;
}
async function withStatTrigger(check:()=>Promise<void>){
 for(const name of ['djm_normalize_season_label','player_career_timeline','player_authoritative_key_stats','djm_refresh_public_profile_from_career'])
  await db.exec(sqlFunction(seasonSource,'private.'+name));
 await db.exec(sqlFunction(timelineSource,'private.set_public_profile_career_timeline'));
 await db.exec(`create trigger trg_public_profile_career_timeline before insert or update on public.player_public_profiles
  for each row execute function private.set_public_profile_career_timeline();
  create trigger trg_refresh_public_profile_from_career after insert or update or delete on public.career_entries
  for each row execute function private.djm_refresh_public_profile_from_career();`);
 try{
  await db.query("update public.players set current_season_label='2026/27',stats_url='https://youtube.com/not-a-stats-source' where id=$1",[player]);
  await db.query(`insert into public.career_entries(player_id,club_name,league,season_label,appearances,goals,source_name,source_reviewed_at,notes)
   values($1,'Reserve FC','Reserve League','2026/27',24,0,'Reviewed reserve report','2026-10-20T12:00:00Z','PRIVATE'),
   ($1,'Senior FC','Senior League','2026/27',31,5,'Reviewed senior report','2026-10-21T12:00:00Z','PRIVATE'),
   ($1,'Unreviewed FC','Unreviewed League','2026/27',999,999,'Unreviewed report',null,'PRIVATE')`,[player]);
  await verify();await check();
 }finally{
  await db.exec('reset role; drop trigger trg_public_profile_career_timeline on public.player_public_profiles; drop trigger trg_refresh_public_profile_from_career on public.career_entries;');
 }
}
const approvedStats=[{label:'Apps',value:'24',season_label:'2026/27',club_name:'Reserve FC',league:'Reserve League',source_name:'Reviewed reserve report',checked_at:'2026-10-20T12:00:00Z'}];

test('real publication trigger reproduces combined totals then preserves approved automatic, historical, custom and empty snapshots',async()=>withStatTrigger(async()=>{
 const old=await publish({key_stats:approvedStats});
 assert.equal(old.profile.key_stats.find((s:any)=>s.label==='Apps').value,'55','Reproduce the actual hosted trigger mismatch before repairing it');
 assert.equal(old.profile.key_stats[0].source_name,undefined);
 const before=await value('to_jsonb(p) from public.player_public_profiles p where player_id=$1',[player]);
 await db.exec(statMigration);
 assert.deepEqual(await value('to_jsonb(p) from public.player_public_profiles p where player_id=$1',[player]),before,'Installing the repair does not rewrite a saved profile');
 for(const stats of [approvedStats,[{label:'Goals',value:'0',season_label:'2025',source_name:'Historical report',source_reviewed_at:'2026-01-20T12:00:00Z'}],[{label:'Apps',value:'7'}],[]]){
  const result=await publish({key_stats:stats,career_timeline:[{club_name:'Unreviewed injected row',notes:'PRIVATE'}]});
  assert.deepEqual(result.profile.key_stats,stats);
  assert.deepEqual(await value('key_stats from public.player_public_profiles where player_id=$1',[player]),stats);
  assert.equal(result.profile.career_timeline.length,2,'The actual reviewed-career projection is still enforced');
  assert.equal(JSON.stringify(result.profile).includes('PRIVATE'),false);
  assert.equal(JSON.stringify(result.profile).includes('Unreviewed'),false);
  assert.equal(result.profile.stats_url,null,'Existing source-link sanitization remains enforced');
 }
}));

test('metadata and career-refresh writes retain the approved figures while raw legacy stat edits keep authoritative filtering',async()=>withStatTrigger(async()=>{
 await db.exec(statMigration);await publish({key_stats:approvedStats});
 await db.query('update public.player_public_profiles set updated_at=clock_timestamp() where player_id=$1',[player]);
 assert.deepEqual(await value('key_stats from public.player_public_profiles where player_id=$1',[player]),approvedStats);
 await db.query('update public.career_entries set appearances=25 where player_id=$1 and club_name=$2',[player,'Reserve FC']);
 assert.deepEqual(await value('key_stats from public.player_public_profiles where player_id=$1',[player]),approvedStats,'A background refresh is not approval to change a snapshot');
 await db.query(`update public.player_public_profiles set key_stats='[{"label":"Apps","value":"99999"}]' where player_id=$1`,[player]);
 assert.equal((await value('key_stats from public.player_public_profiles where player_id=$1',[player])).find((s:any)=>s.label==='Apps').value,'56','Unscoped raw writes cannot invent football totals');
}));

test('snapshot stat preservation rejects wrong-tenant or browser-forged context and preserves server-only publisher grants',async()=>withStatTrigger(async()=>{
 await db.exec(statMigration);await publish({key_stats:approvedStats});
 assert.equal(await value("has_function_privilege('authenticated',$1,'execute')",[publication]),false);
 assert.equal(await value("has_function_privilege('service_role',$1,'execute')",[publication]),true);
 for(const browser of [false,true]){
  await db.exec('begin');
  try{
   await value("set_config('djm.internal_tenant_dossier_mode','publish_snapshot',true)");
   await value("set_config('djm.internal_tenant_dossier_tenant',$1,true)",[browser?tenant:foreign]);
   if(browser){await db.exec('grant select,update on public.player_public_profiles to authenticated; set local role authenticated;');}
   await assert.rejects(db.query(`update public.player_public_profiles set key_stats='[{"label":"Apps","value":"99999"}]' where player_id=$1`,[player]),/context|mismatch/);
  }finally{await db.exec('rollback');}
 }
 await db.exec('set role service_role');
 try{assert.deepEqual((await publish({key_stats:approvedStats})).profile.key_stats,approvedStats);}
 finally{await db.exec('reset role');}
}));

test('stat repair preserves trigger ownership/grants and refuses unexpected definition, configuration or ACL drift',async()=>withStatTrigger(async()=>{
 const signature='private.set_public_profile_career_timeline()';
 const before=await value('jsonb_build_object(\'owner\',proowner,\'acl\',proacl,\'config\',proconfig) from pg_proc where oid=$1::regprocedure',[signature]);
 for(const change of [
  sqlFunction(timelineSource,'private.set_public_profile_career_timeline').replace('declare','declare\n -- unknown change'),
  "alter function "+signature+" set search_path='public'",
  'grant execute on function '+signature+' to authenticated',
 ]){
  await db.exec('begin');
  try{await db.exec(change);await assert.rejects(db.exec(statMigration),/profile_stat_trigger_drift/);}
  finally{await db.exec('rollback');}
 }
 await db.exec(statMigration);
 assert.deepEqual(await value('jsonb_build_object(\'owner\',proowner,\'acl\',proacl,\'config\',proconfig) from pg_proc where oid=$1::regprocedure',[signature]),before);
}));

async function withSettingsStatTrigger(check:()=>Promise<void>){
 await db.exec(`create table public.player_cv_settings(player_id uuid primary key references public.players(id),key_stats jsonb,
  selected_stat_refs jsonb default '[]',intro_line text);
  grant select,insert,update on public.player_cv_settings to service_role,authenticated;`);
 await db.exec(sqlFunction(reviewedCareerSource,'private.normalize_cv_key_stats'));
 await db.exec(`revoke all on function private.normalize_cv_key_stats() from public,anon,authenticated;
  create trigger normalize_cv_key_stats before insert or update of key_stats on public.player_cv_settings
  for each row execute function private.normalize_cv_key_stats();`);
 try{await check();}finally{await db.exec('reset role;drop table public.player_cv_settings;');}
}
async function saveStatChoices(stats:unknown,refs:string[]=[]){
 await db.exec('set role service_role');
 try{return (await db.query<any>(`insert into public.player_cv_settings(player_id,key_stats,selected_stat_refs) values($1,$2,$3)
  on conflict(player_id) do update set key_stats=excluded.key_stats,selected_stat_refs=excluded.selected_stat_refs returning *`,
  [player,JSON.stringify(stats),JSON.stringify(refs)])).rows[0];}
 finally{await db.exec('reset role');}
}

test('actual settings save reproduces automatic totals becoming custom then retains automatic, selected and custom choices through publication',async()=>withStatTrigger(()=>withSettingsStatTrigger(async()=>{
 const broken=await saveStatChoices([]);
 assert.equal(broken.key_stats.find((s:any)=>s.label==='Apps').value,'55','Reproduce the separate settings-trigger failure on the real upsert');
 const before=await value('to_jsonb(s) from public.player_cv_settings s where player_id=$1',[player]);
 await db.exec(settingsStatMigration);await db.exec(statMigration);
 assert.deepEqual(await value('to_jsonb(s) from public.player_cv_settings s where player_id=$1',[player]),before,'Migration installation never reinterprets existing choices');
 const historical=[{label:'Goals',value:'0',season_label:'2025',source_name:'Historical report',source_reviewed_at:'2026-01-20T12:00:00Z'}];
 for(const {stats,refs,expected} of [
  {stats:[],refs:[],expected:approvedStats},
  {stats:[],refs:['40000000-0000-4000-8000-000000000001:goals'],expected:historical},
  {stats:[{label:'Apps',value:'7'}],refs:[],expected:[{label:'Apps',value:'7'}]},
 ]){
  const saved=await saveStatChoices(stats,refs);
  assert.deepEqual(saved.key_stats,stats);assert.deepEqual(saved.selected_stat_refs,refs);
  assert.deepEqual((await publish({key_stats:expected})).profile.key_stats,expected);
 }
 assert.deepEqual((await saveStatChoices([])).key_stats,[],'Returning to automatic mode stays automatic after reload');
})));

test('settings preserve only bounded editorial pairs and deny a browser-spoofed service claim',async()=>withStatTrigger(()=>withSettingsStatTrigger(async()=>{
 await db.exec(settingsStatMigration);
 assert.deepEqual((await saveStatChoices([{label:' Goals ',value:' 0 ',source_name:'Invented evidence',notes:'PRIVATE'}])).key_stats,[{label:'Goals',value:'0'}]);
 for(const invalid of [null,{},[null],[{label:'Apps',value:7}],[{label:' ',value:'1'}],[{label:'Apps',value:'x'.repeat(51)}],Array.from({length:7},()=>({label:'Apps',value:'7'}))])
  await assert.rejects(()=>saveStatChoices(invalid),/array|six named/);
 await db.exec('begin');
 try{
  await value("set_config('request.jwt.claim.role','service_role',true)");
  await db.exec('set local role authenticated');
  await db.query(`update public.player_cv_settings set key_stats='[{"label":"Apps","value":"99999"}]' where player_id=$1`,[player]);
  assert.equal((await value('key_stats from public.player_cv_settings where player_id=$1',[player])).find((s:any)=>s.label==='Apps').value,'55','The actual database role, not a spoofed claim, controls the server-only path');
 }finally{await db.exec('rollback');}
})));

test('settings repair retains ownership and grants and refuses unknown body, configuration and access drift',async()=>withSettingsStatTrigger(async()=>{
 const signature='private.normalize_cv_key_stats()';
 const before=await value("jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig) from pg_proc where oid=$1::regprocedure",[signature]);
 for(const change of [
  sqlFunction(reviewedCareerSource,'private.normalize_cv_key_stats').replace('begin','begin\n -- unknown change'),
  "alter function "+signature+" set search_path='public'",
  'grant execute on function '+signature+' to authenticated',
  'grant execute on function '+signature+' to public',
 ]){
  await db.exec('begin');
  try{await db.exec(change);await assert.rejects(db.exec(settingsStatMigration),/profile_stat_settings_trigger_drift/);}
  finally{await db.exec('rollback');}
 }
 await db.exec(settingsStatMigration);
 assert.deepEqual(await value("jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig) from pg_proc where oid=$1::regprocedure",[signature]),before);
}));

const contractMigration=readFileSync('supabase/migrations/20261025133959_include_approved_profile_contract_expiry.sql','utf8');
const versionSource=readFileSync('supabase/migrations/20261013200134_player_profile_versions_and_source_refs_v1.sql','utf8');
const visibilitySource=readFileSync('supabase/migrations/20261009061051_public_profile_visibility_boundary.sql','utf8');
async function withContractSnapshot(check:()=>Promise<void>){
 await db.exec('begin');
 try{
  await db.exec(lockMigration);await db.exec(statMigration);
  await db.exec('create schema djm_os;create table djm_os.people(id uuid,tenant_id uuid);');
  const columns=JSON.parse(readFileSync('tests/fixtures/public-profile-tables.json','utf8'));
  for(const c of columns){
   if(c.table_schema==='public'&&c.table_name==='players')continue;
   const table=c.table_schema+'.'+c.table_name;
   if(!await value('to_regclass($1)::text',[table]))await db.exec('create table '+table+'(qa_fixture boolean)');
   if(await value('exists(select 1 from information_schema.columns where table_schema=$1 and table_name=$2 and column_name=$3)',[c.table_schema,c.table_name,c.column_name]))continue;
   const type=c.data_type==='USER-DEFINED'?'text':c.data_type==='ARRAY'?({uuid:'uuid[]',text:'text[]',int4:'integer[]'} as any)[c.udt_name.slice(1)]||'text[]':c.data_type;
   await db.exec('alter table '+table+' add column "'+c.column_name+'" '+type);
  }
  await db.exec('create table auth.users(id uuid primary key)');
  const versionTable=versionSource.match(/create table public\.player_profile_versions \([\s\S]*?\n\);/)?.[0];assert.ok(versionTable);
  await db.exec(versionTable);
  await db.exec('alter table public.club_share_links add column profile_version_id uuid');
  for(const [source,name]of [[visibilitySource,'private.visible_public_player_profile'],[versionSource,'private.protect_player_profile_version'],[versionSource,'public.get_club_share'],[readFileSync('supabase/migrations/20260823212918_enforce_verified_club_profiles_v1.sql','utf8'),'private.enforce_public_profile_publish_rules']])await db.exec(sqlFunction(source,name));
  await db.exec(`create trigger approved_version_guard before insert or update or delete on public.player_profile_versions for each row execute function private.protect_player_profile_version();
   create trigger public_publish_rules before insert or update on public.player_public_profiles for each row execute function private.enforce_public_profile_publish_rules();
   revoke all on function public.get_club_share(uuid) from public;grant execute on function public.get_club_share(uuid) to service_role;`);
  await verify();await publish({});
  await db.query("update public.players set contract_expiry='2027-06-30',contract_status='under_contract' where id=$1",[player]);await verify();
  const before=await value('to_jsonb(pp) from public.player_public_profiles pp where player_id=$1',[player]);
  await db.exec(contractMigration);await db.exec(contractMigration);
  assert.deepEqual(await value("to_jsonb(pp)-'contract_expiry' from public.player_public_profiles pp where player_id=$1",[player]),before,'No previous public facts are rewritten');
  assert.equal(await value('contract_expiry from public.player_public_profiles where player_id=$1',[player]),null,'Installing cannot disclose a private date');
  await check();
 }finally{await db.exec('rollback');}
}
async function contractRejects(run:()=>Promise<unknown>,pattern:RegExp){
 await db.exec('savepoint expected_denial');
 try{await assert.rejects(run,pattern);}finally{await db.exec('rollback to expected_denial;release expected_denial');}
}
const contractClub='40000000-0000-4000-8000-000000000001';
const contractVersion='50000000-0000-4000-8000-000000000001';
async function saveContractVersion(presentation:any,version=contractVersion,versionTenant=tenant){
 return db.query(`insert into public.player_profile_versions(id,tenant_id,player_id,profile_kind,organisation_id,status,presentation,master_player_updated_at,master_data_fingerprint,created_by,approved_by,approved_at)
 values($1,$2,$3,'club',$4,'approved',$5,now(),'reviewed-fingerprint',$6,$6,now())`,[version,versionTenant,player,contractClub,JSON.stringify(presentation),owner]);
}
async function contractRecipients(){
 await db.query('insert into auth.users values($1)',[owner]);
 await db.query('insert into djm_os.organisations(id,tenant_id,name) values($1,$2,$3)',[contractClub,tenant,'Example Recipient FC']);
 await db.query(`insert into public.club_share_links(id,token,player_id,organisation_id,active,expires_at) values($1,$1,$2,$3,true,now()+interval '1 day')`,[contractClub,player,contractClub]);
}

test('contract expiry needs explicit publication and comes only from verified canonical facts',async()=>withContractSnapshot(async()=>{
 await contractRejects(()=>publish({contract_expiry:'2099-01-01'}),/unsupported_profile_snapshot_field/);
 const result=await publish({headline:'Approved profile'});
 assert.equal(result.profile.contract_expiry,'2027-06-30');assert.equal(result.profile.current_status,'under_contract');
 await db.query("update public.players set contract_expiry='2028-06-30' where id=$1",[player]);await verify();
 assert.equal(await value('contract_expiry::text from public.player_public_profiles where player_id=$1',[player]),'2027-06-30','Private changes cannot rewrite the approved date');
 await contractRejects(()=>db.query("update public.player_public_profiles set contract_expiry='2099-01-01' where player_id=$1",[player]),/verified player record|profile field/i);
 await contractRejects(()=>publish({},agent),/tenant_admin|required|denied/i);
 await contractRejects(()=>publish({},outsider),/tenant_admin|required|denied/i);
 await db.query("update public.players set contract_expiry=null where id=$1",[player]);await verify();
 assert.equal((await publish({})).profile.contract_expiry,null,'Deliberate republication can clear a removed date');
}));

test('general and immutable club recipients retain exactly the approved contract date',async()=>withContractSnapshot(async()=>{
 await contractRecipients();
 let general=await value('public.get_club_share($1)',[contractClub]);
 assert.equal(general.profile.contract_expiry,null,'Legacy published snapshots remain undisclosed');
 await publish({});
 general=await value('public.get_club_share($1)',[contractClub]);assert.equal(general.profile.contract_expiry,'2027-06-30');
 await saveContractVersion(general.profile);
 await db.query('update public.club_share_links set profile_version_id=$1 where token=$2',[contractVersion,contractClub]);
 await db.query("update public.players set contract_expiry='2028-06-30' where id=$1",[player]);await verify();await publish({});
 const fixed=await value('public.get_club_share($1)',[contractClub]);assert.equal(fixed.profile.contract_expiry,'2027-06-30','Club versions never borrow a newer private or general date');
 assert.ok(!JSON.stringify(fixed).includes('verification_notes'));
 await contractRejects(()=>db.query("update public.player_profile_versions set presentation=presentation||'{\"contract_expiry\":\"2028-06-30\"}' where id=$1",[contractVersion]),/immutable/);
 await db.query('update public.club_share_links set active=false where token=$1',[contractClub]);assert.equal(await value('public.get_club_share($1)',[contractClub]),null);
 await db.query("update public.club_share_links set active=true,expires_at=now()-interval '1 second' where token=$1",[contractClub]);assert.equal(await value('public.get_club_share($1)',[contractClub]),null);
 await db.query("update public.club_share_links set expires_at=now()+interval '1 day' where token=$1",[contractClub]);
 await db.query("select set_config('djm.public_profile_action','safety_unpublish',true)");await db.query('update public.player_public_profiles set published=false where player_id=$1',[player]);assert.equal(await value('public.get_club_share($1)',[contractClub]),null);
}));

test('version date must match the published snapshot, while legacy versions keep no date',async()=>withContractSnapshot(async()=>{
 await contractRecipients();await publish({});
 await contractRejects(()=>saveContractVersion({contract_expiry:'2099-01-01'}),/must match the published/);
 await contractRejects(()=>saveContractVersion({contract_expiry:2027}),/invalid_player_profile_presentation_text/);
 await contractRejects(()=>saveContractVersion({contract_expiry:'2027-06-30'},contractVersion,foreign),/tenant_mismatch/);
 await saveContractVersion({display_name:'Legacy approved profile',primary_position:'Centre back'});
 await db.query('update public.club_share_links set profile_version_id=$1 where token=$2',[contractVersion,contractClub]);
 assert.equal((await value('public.get_club_share($1)',[contractClub])).profile.contract_expiry,null,'Old versions are not silently enriched');
}));


test('contract migration preserves function metadata and refuses unknown drift atomically',async()=>withContractSnapshot(async()=>{
 const metadata=()=>db.query("select oid,proname,proowner,proacl::text,proconfig,prosecdef,md5(prosrc) as hash from pg_proc where oid=any(array['public.get_club_share(uuid)'::regprocedure,'public.platform_server_publish_player_profile_snapshot(uuid,uuid,uuid,jsonb)'::regprocedure,'private.protect_public_profile_admin_fields()'::regprocedure]) order by oid");
 const before=(await metadata()).rows;await db.exec(contractMigration);assert.deepEqual((await metadata()).rows,before);
 const original=await value("pg_get_functiondef('private.protect_player_profile_version()'::regprocedure)");
 await db.exec(original.replace('declare','declare\n -- unreviewed drift'));
 const published=await value('to_jsonb(pp) from public.player_public_profiles pp where player_id=$1',[player]);
 await contractRejects(()=>db.exec(contractMigration),/differs from reviewed function/);
 assert.deepEqual((await metadata()).rows,before,'No earlier function was partially replaced');
 assert.deepEqual(await value('to_jsonb(pp) from public.player_public_profiles pp where player_id=$1',[player]),published);
}));
