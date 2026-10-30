import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {before,beforeEach,after,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const t='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
const owner='10000000-0000-4000-8000-000000000001',agent='10000000-0000-4000-8000-000000000002',scout='10000000-0000-4000-8000-000000000003';
const p='30000000-0000-4000-8000-000000000001',foreign='30000000-0000-4000-8000-000000000002';
const file=(s:string)=>readFileSync('supabase/migrations/'+s,'utf8');
const definition=(s:string,name:string)=>{const match=s.match(new RegExp('create (?:or replace )?function '+name.replaceAll('.','\\.')+'\\([\\s\\S]*?\\bas (\\$\\w*\\$)[\\s\\S]*?\\1;','i'));assert.ok(match,name);return match[0];};
const value=async(sql:string,args:any[]=[])=>Object.values((await db.query('select '+sql,args)).rows[0])[0] as any;
const row=()=>value('to_jsonb(p) from public.players p where id=$1',[p]);
const sources=[{url:'https://league.example/player',title:'Official league'},{url:'https://club.example/player',title:'Club profile'}];
const status=(actor=owner,tenant=t,id=p)=>value('public.platform_server_player_details_review_status($1,$2,$3)',[tenant,id,actor]);
async function stage(fields:any={current_club:'New FC',contract_expiry:'2028-06-30',primary_position:'CM'},actor=owner,expected?:any){return value('public.platform_server_stage_player_details_review($1,$2,$3,$4,$5,$6,$7,$8)',[t,p,actor,expected||await row(),fields,Object.fromEntries(Object.keys(fields).map(key=>[key,sources])),'Current club and federation evidence.',0.95]);}
const decide=(id:string,decisions:any[],actor=owner,tenant=t,idPlayer=p)=>value('public.platform_server_review_player_details($1,$2,$3,$4,$5)',[tenant,idPlayer,actor,id,decisions]);
before(async()=>{
 await db.exec(`create schema platform;create schema private;create schema djm_os;create schema auth;
 create role anon;create role authenticated;create role service_role bypassrls;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table platform.tenants(id uuid primary key,status text);
 create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text);
 create table djm_os.team_members(user_id uuid,is_active boolean);
 create table public.staff_player_access(player_id uuid,staff_user_id uuid,can_edit boolean);
 create table public.players(id uuid primary key,tenant_id uuid,user_id uuid,first_name text,last_name text,preferred_name text,date_of_birth date,nationalities text[],height_cm integer check(height_cm between 140 and 230),preferred_foot text check(preferred_foot in ('Left','Right','Both')),primary_position text,secondary_positions text[],current_club text,current_league text,current_country text,current_season_label text,current_season_start date,contract_status text,contract_expiry date,football_status text default 'active',archived_at timestamptz,transfermarkt_url text,wyscout_url text,stats_url text,instagram_url text,profile_photo_path text,verification_status text,verified_at timestamptz,review_required_at timestamptz,review_reason text,agency_priority text,next_action text,next_action_due date,onboarding_status text,verification_notes text,created_at timestamptz default now(),updated_at timestamptz default now());
 create table public.player_public_profiles(player_id uuid primary key,published boolean,updated_at timestamptz,public_slug text,published_at timestamptz,contact_email text,market_value_display text,market_value_source_url text,hidden_sections text[],hide_market_value boolean,verified_at timestamptz);
 create table public.player_source_refreshes(id uuid primary key default gen_random_uuid(),player_id uuid references public.players(id),source text check(source in ('wyscout','sportmonks','transfermarkt_reference','manual','other','sofascore_reference')),source_url text,provider text,mode text check(mode in ('preview','apply_reviewed','manual_import')),capability text check(capability in ('licensed_api','manual_import','reference_only','disabled')),status text check(status in ('queued','running','fetched','needs_review','reviewed','accepted','rejected','applied','failed','cancelled')),requested_by uuid,requested_at timestamptz default now(),started_at timestamptz,completed_at timestamptz,raw_snapshot jsonb,summary jsonb,facts_discovered integer,review_required integer,accepted_count integer default 0,rejected_count integer default 0,payload_hash text,updated_at timestamptz default now());
 create table public.player_source_suggestions(id uuid primary key default gen_random_uuid(),refresh_id uuid references public.player_source_refreshes(id),player_id uuid references public.players(id),field_name text,current_value jsonb,suggested_value jsonb,confidence numeric,source_evidence jsonb,decision text default 'pending' check(decision in ('pending','accepted','rejected','kept_current','review_later')),reviewed_by uuid,reviewed_at timestamptz,applied_at timestamptz,observed_at timestamptz,truth_state text);
 create table platform.audit_events(tenant_id uuid,actor_user_id uuid,actor_kind text,action text,entity_type text,entity_id text,before_state jsonb,after_state jsonb,metadata jsonb);
 create table djm_os.tasks(id uuid,player_id uuid,status text);
 create function private.user_is_tenant_admin(uuid) returns boolean language sql as $$select false$$;
 create function private.user_is_player_tenant_admin(uuid) returns boolean language sql as $$select false$$;
 alter table public.player_source_refreshes enable row level security;alter table public.player_source_suggestions enable row level security;
 grant usage on schema public,auth to authenticated;grant all on public.player_source_refreshes,public.player_source_suggestions to authenticated,service_role;
 create policy legacy_manage on public.player_source_refreshes for all to authenticated using(true) with check(true);
 create policy legacy_manage on public.player_source_suggestions for all to authenticated using(true) with check(true);`);
 // Actual protection/invalidation bodies, not a mocked verification update.
 await db.exec(definition(file('20261002104000_player_profile_verification_writer_v1.sql'),'private.protect_player_admin_fields'));
 await db.exec(definition(file('20261002105500_player_profile_publish_snapshot_writer_v1.sql'),'private.protect_public_profile_admin_fields'));
 await db.exec(definition(file('20260825161711_unpublish_dossier_when_verification_is_lost_v1.sql'),'private.unpublish_dossier_when_verification_is_lost'));
 await db.exec(`create trigger player_guard before update on public.players for each row execute function private.protect_player_admin_fields();create trigger profile_guard before update on public.player_public_profiles for each row execute function private.protect_public_profile_admin_fields();create trigger unpublish after update on public.players for each row execute function private.unpublish_dossier_when_verification_is_lost();`);
 await db.exec(file('20261024142123_approval_first_player_details_review_v1.sql'));
 await db.query('insert into platform.tenants values($1,$3),($2,$3)',[t,other,'active']);
 for(const [u,role] of [[owner,'owner'],[agent,'agent'],[scout,'scout']]){await db.query('insert into platform.tenant_memberships values($1,$2,$3,$4)',[t,u,'active',role]);await db.query('insert into djm_os.team_members values($1,true)',[u]);}
});
beforeEach(async()=>{
 await db.exec("reset role;select set_config('redream.player_details_review','on',false);select set_config('djm.internal_career_change','',false);delete from public.player_source_suggestions;delete from public.player_source_refreshes;delete from public.player_public_profiles;delete from public.players;delete from public.staff_player_access;delete from platform.audit_events;delete from djm_os.tasks;update platform.tenant_memberships set status='active';update platform.tenants set status='active';update djm_os.team_members set is_active=true;");
 await db.query("insert into public.players(id,tenant_id,first_name,last_name,date_of_birth,current_club,current_season_label,primary_position,contract_expiry,verification_status,verified_at,next_action) values($1,$2,'Alex','Example','2000-01-01','Old FC','2026/27','CB','2027-06-30','verified',now(),'Call the club')",[p,t]);
 await db.query("insert into public.players(id,tenant_id,first_name,last_name) values($1,$2,'Other','Player')",[foreign,other]);
 await db.query('insert into public.staff_player_access values($1,$2,true),($1,$3,true)',[p,agent,scout]);
 await db.query('insert into public.player_public_profiles(player_id,published,updated_at) values($1,true,now())',[p]);
 await db.query("insert into djm_os.tasks values(gen_random_uuid(),$1,'open')",[p]);
 await value("set_config('redream.player_details_review','',false)");
});
after(()=>db.close());
test('research persists field suggestions without changing the canonical row, tasks or public snapshot',async()=>{
 const before=await row(),s=await stage();assert.equal(s.status,'needs_review');assert.deepEqual(await row(),before);assert.equal(await value('published from public.player_public_profiles'),true);
 const dto=await status(agent);assert.equal(dto.fields.length,3);assert.ok(dto.fields.every((f:any)=>f.id&&f.before&&f.suggested&&f.decision==='pending'));
 assert.doesNotMatch(JSON.stringify(dto),/raw_snapshot|requested_by|actor|verification_notes/);
});
test('accept, correct and reject preserve original evidence and separate verification/publication/task work',async()=>{
 const s=await stage(),dto=await status();const field=(name:string)=>dto.fields.find((f:any)=>f.field===name).id;
 const result=await decide(s.review_id,[{id:field('current_club'),decision:'accept'},{id:field('primary_position'),decision:'edit',value:'DM'},{id:field('contract_expiry'),decision:'reject'}],agent);
 assert.equal(result.remaining,0);const current=await row();assert.equal(current.current_club,'New FC');assert.equal(current.primary_position,'DM');assert.equal(current.contract_expiry,'2027-06-30');assert.equal(current.verification_status,'reviewing');assert.ok(current.review_required_at);assert.equal(current.verified_at,null);assert.equal(current.next_action,'Call the club');
 assert.equal(await value('published from public.player_public_profiles'),false);assert.equal(await value('status from djm_os.tasks'),'open');
 const position=(await status()).fields.find((f:any)=>f.field==='primary_position');assert.equal(position.suggested,'CM');assert.equal(position.applied_value,'DM');
 assert.equal(await value("actor_user_id from platform.audit_events where action='player_details.reviewed'"),agent);
 assert.equal(await value("current_setting('redream.player_details_review')"),'');assert.equal(await value("current_setting('djm.internal_career_change')"),'');
});
test('individual decisions retain remaining work and exact retries create no duplicate decision audit',async()=>{
 const s=await stage(),dto=await status();const decisions=[{id:dto.fields[0].id,decision:'reject'}];
 const first=await decide(s.review_id,decisions);assert.equal(first.remaining,2);assert.equal(first.review.status,'needs_review');await decide(s.review_id,decisions);
 assert.equal(await value("count(*) from platform.audit_events where action='player_details.reviewed'"),1);
 await assert.rejects(()=>decide(s.review_id,[{id:dto.fields[0].id,decision:'accept'}]),/already reviewed/);
});
test('stale facts roll back the entire decision batch and preserve all suggestions',async()=>{
 const s=await stage();await db.query("update public.players set current_club='Colleague FC' where id=$1",[p]);const dto=await status();
 await assert.rejects(()=>decide(s.review_id,dto.fields.map((f:any)=>({id:f.id,decision:'accept'}))),/details changed/);
 assert.ok((await status()).fields.every((f:any)=>f.decision==='pending'));assert.equal(await value("count(*) from platform.audit_events where action='player_details.reviewed'"),0);
 assert.equal((await row()).contract_expiry,'2027-06-30');
});
test('research rejects changes during its baseline read and decisions reject a retargeted identity',async()=>{
 const baseline=await row();await db.query("update public.players set current_club='Changed FC' where id=$1",[p]);await assert.rejects(()=>stage(undefined,owner,baseline),/details changed/);
 const s=await stage();await db.query("update public.players set last_name='Different player' where id=$1",[p]);const dto=await status();await assert.rejects(()=>decide(s.review_id,[{id:dto.fields[0].id,decision:'accept'}]),/identity changed/);
});
test('active tenant/role/edit access is enforced again on research, read and decision',async()=>{
 const s=await stage(),dto=await status();for(const actor of [scout]){await assert.rejects(()=>stage(undefined,actor),/edit access/);await assert.rejects(()=>status(actor),/edit access/);await assert.rejects(()=>decide(s.review_id,[{id:dto.fields[0].id,decision:'accept'}],actor),/edit access/);}
 await db.query('update public.staff_player_access set can_edit=false where staff_user_id=$1',[agent]);await assert.rejects(()=>status(agent),/edit access/);
 await assert.rejects(()=>status(owner,other),/edit access/);await assert.rejects(()=>status(owner,t,foreign),/edit access/);
 await db.query("update platform.tenant_memberships set status='ended' where user_id=$1",[owner]);await assert.rejects(()=>status(),/edit access/);
});
test('inactive memberships, archived players and suspended tenants cannot review',async()=>{
 await db.query("update platform.tenant_memberships set status='suspended' where user_id=$1",[agent]);await assert.rejects(()=>status(agent),/edit access/);
 await db.query('update public.players set archived_at=now() where id=$1',[p]);await assert.rejects(()=>stage(),/edit access/);
 await db.query("update platform.tenants set status='suspended' where id=$1",[t]);await assert.rejects(()=>status(),/edit access/);
});
test('rejected evidence is not reopened or relabelled as canonical',async()=>{
 const s=await stage(),dto=await status();await decide(s.review_id,dto.fields.map((f:any)=>({id:f.id,decision:'reject'})));assert.equal((await status()).status,'rejected');
 const repeated=await stage();assert.equal(repeated.review_id,s.review_id);assert.equal(repeated.status,'rejected');assert.equal((await row()).current_club,'Old FC');assert.equal(await value('published from public.player_public_profiles'),true);
});
test('a season-only accepted change still requests verification and unpublishes through real guards',async()=>{
 const s=await stage({current_season_label:'2027/28'}),dto=await status();await decide(s.review_id,[{id:dto.fields[0].id,decision:'accept'}]);assert.equal((await row()).verification_status,'reviewing');assert.equal(await value('published from public.player_public_profiles'),false);
});
test('browser sessions cannot read or mutate this ledger, even with a forged transaction flag',async()=>{
 const s=await stage(),dto=await status();await db.exec("set role authenticated;select set_config('redream.player_details_review','on',false)");
 assert.equal(await value('count(*) from public.player_source_refreshes'),0);assert.equal(await value('count(*) from public.player_source_suggestions'),0);
 await assert.rejects(()=>value('public.platform_server_player_details_review_status($1,$2,$3)',[t,p,owner]),/permission denied/);
 await assert.rejects(()=>db.query("insert into public.player_source_suggestions(refresh_id,player_id,field_name,source_evidence) values($1,$2,'current_club','{}')",[s.review_id,p]),/server-only|row-level/);
 await db.exec("reset role;select set_config('redream.player_details_review','',false);set role service_role");await assert.rejects(()=>db.query("update public.player_source_suggestions set decision='accepted' where id=$1",[dto.fields[0].id]),/server-only|permission/);
});
test('field allowlists, types, sources and dates prevent unsafe or fabricated writes',async()=>{
 for(const fields of [{next_action:'Injected task'},{date_of_birth:'2026'},{date_of_birth:'2000-02-30'},{contract_expiry:'2028-13-01'},{nationalities:['']},{height_cm:0},{height_cm:135},{preferred_foot:'Unknown'},{stats_url:'javascript:alert(1)'},{current_club:null}])await assert.rejects(()=>stage(fields));
 assert.equal(await value('count(*) from public.player_source_refreshes'),0);assert.equal((await row()).next_action,'Call the club');
 await assert.rejects(async()=>value('public.platform_server_stage_player_details_review($1,$2,$3,$4,$5,$6,$7,$8)',[t,p,owner,await row(),{current_club:'New FC'},{current_club:[{url:'https://user:password@example.com'}]},'Invalid',0.95]));
});
test('service-only public entrypoints and owner-only helpers add no browser schema grants',async()=>{
 const rows=(await db.query("select p.proname,p.prosecdef,has_function_privilege('authenticated',p.oid,'execute') as browser,has_function_privilege('service_role',p.oid,'execute') as server from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('platform_server_stage_player_details_review','platform_server_request_player_details_review','platform_server_player_details_review_status','platform_server_review_player_details','player_details_access','player_detail_value')")).rows as any[];
 assert.equal(rows.length,6);assert.ok(rows.every(r=>r.browser===false));assert.ok(rows.filter(r=>r.proname.startsWith('platform_server')).every(r=>r.server&&r.prosecdef));assert.ok(rows.filter(r=>!r.proname.startsWith('platform_server')).every(r=>!r.server));assert.equal(await value("has_schema_privilege('authenticated','platform','usage')"),false);
});

test('the actual service role can call the bounded writer without browser platform grants',async()=>{
 const expected=await row();await db.exec('set role service_role');const s=await stage({current_club:'Service FC'},agent,expected);const dto=await status(agent);await decide(s.review_id,[{id:dto.fields[0].id,decision:'accept'}],agent);await db.exec('reset role');assert.equal((await row()).current_club,'Service FC');
});

const claim=(id:string,actor=owner)=>value('public.platform_server_request_player_details_review($1,$2,$3,$4)',[t,p,actor,id]);
const finish=(id:string,fields:any,confidence=0.95)=>value('public.platform_server_stage_player_details_review($1,$2,$3,$4,$5,$6,$7,$8,$9)',[t,p,owner,{},fields,{},'Research did not confirm a change',confidence,id]);
test('concurrent and repeated research requests share one bounded claim',async()=>{
 const id='40000000-0000-4000-8000-000000000001',next='40000000-0000-4000-8000-000000000002';
 assert.equal((await claim(id)).dispatch,true);assert.equal((await claim(id)).dispatch,false);assert.equal((await claim(next,agent)).dispatch,false);assert.equal(await value('count(*) from public.player_source_refreshes'),1);assert.equal((await status()).status,'running');
 await finish(id,{},0);assert.equal((await status()).status,'failed');assert.equal((await row()).verification_status,'verified');assert.equal(await value('published from public.player_public_profiles'),true);
 assert.equal((await claim(id)).dispatch,false);assert.equal((await claim(next)).dispatch,true);
});
test('stale research reads become recoverable and a late result cannot create a proposal',async()=>{
 const id='40000000-0000-4000-8000-000000000001';await claim(id);await value("set_config('redream.player_details_review','on',false)");await db.query("update public.player_source_refreshes set started_at=now()-interval '61 seconds' where id=$1",[id]);await value("set_config('redream.player_details_review','',false)");
 assert.equal((await status()).status,'failed');const result=await finish(id,{current_club:'Late FC'});assert.equal(result.status,'failed');assert.equal(await value('count(*) from public.player_source_suggestions'),0);assert.equal((await row()).current_club,'Old FC');
});
test('the claimed request is the review ledger and does not create a second refresh',async()=>{
 const id='40000000-0000-4000-8000-000000000001';await claim(id);const expected=await row();const fields={contract_expiry:'2028-06-30'};
 const result=await value('public.platform_server_stage_player_details_review($1,$2,$3,$4,$5,$6,$7,$8,$9)',[t,p,owner,expected,fields,{contract_expiry:sources},'Contract explicitly recorded',0.95,id]);assert.equal(result.review_id,id);assert.equal(await value('count(*) from public.player_source_refreshes'),1);assert.equal((await status()).fields.length,1);
});
test('identity dates cannot change during research or overwrite later identity corrections',async()=>{
 const before=await row();await db.query("update public.players set date_of_birth='2001-01-01' where id=$1",[p]);await assert.rejects(()=>stage({current_club:'New FC'},owner,before),/identity changed/);
 const s=await stage({date_of_birth:'2002-01-01',current_club:'New FC'}),dto=await status();await decide(s.review_id,[{id:dto.fields.find((f:any)=>f.field==='date_of_birth').id,decision:'accept'}]);
 await decide(s.review_id,[{id:dto.fields.find((f:any)=>f.field==='current_club').id,decision:'accept'}]);assert.equal((await row()).current_club,'New FC');
});

test('a canonical agency operator does not need a legacy global DJM team row',async()=>{
 await db.query('delete from djm_os.team_members where user_id=$1',[agent]);const result=await stage({current_club:'Independent FC'},agent);assert.equal(result.status,'needs_review');const dto=await status(agent);await decide(result.review_id,[{id:dto.fields[0].id,decision:'accept'}],agent);assert.equal((await row()).current_club,'Independent FC');
});
