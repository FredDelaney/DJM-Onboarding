import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {before,after,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const read=(path:string)=>readFileSync(path,'utf8');
const migration=read('supabase/migrations/20261028165458_club_request_commercial_brief.sql');
const intakeMigration=read('supabase/migrations/20261028172707_club_request_football_and_sources.sql');
const tenant='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',user='10000000-0000-4000-8000-000000000001';
const scalar=async(sql:string,args:unknown[]=[])=>Object.values((await db.query<any>('select '+sql,args)).rows[0])[0] as any;
const actor=async(t=tenant)=>db.query("select set_config('test.user',$1,false),set_config('test.tenant',$2,false)",[user,t]);
const create=(brief:Record<string,unknown>={})=>scalar('public.platform_server_agency_create_club_need_brief($1,$2,$3)',[tenant,user,{club_name:'Example FC',position:'Striker',notes:'Original request: €5,000 per month; 12 months plus option.',brief}]);
const record=(id:string)=>scalar('to_jsonb(n) from djm_os.club_needs n where id=$1',[id]);
let contracts:any[]=[];
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema platform;create schema private;create schema djm_os;
 create table auth.users(id uuid primary key);
 create table platform.tenants(id uuid primary key,status text);
 create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text);
 create table djm_os.team_members(user_id uuid primary key references auth.users);
 create table djm_os.organisations(id uuid primary key default gen_random_uuid(),tenant_id uuid,name text,organisation_type text,country text,city text,league_name text,canonical_key text,created_at timestamptz default now(),updated_at timestamptz,archived_at timestamptz);
 create table public.players(id uuid primary key,tenant_id uuid,archived_at timestamptz,football_status text,preferred_name text,first_name text,last_name text);
 create table djm_os.player_matches(id uuid,tenant_id uuid,club_need_id uuid,player_id uuid,status text,overall_score numeric,football_score numeric,commercial_score numeric,registration_score numeric,career_score numeric,access_score numeric,reasoning jsonb,updated_at timestamptz);
 create table djm_os.people(id uuid primary key,tenant_id uuid,full_name text);
 create table djm_os.employments(tenant_id uuid,organisation_id uuid,person_id uuid,is_current boolean,role_title text);
 create table djm_os.relationships(tenant_id uuid,person_id uuid,access_score integer,strength_score integer,trust_score integer,last_meaningful_at timestamptz,team_member_id uuid);
 create function public.platform_server_career_pursuit_gate(p_tenant_id uuid,p_player_match_id uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function public.platform_server_introduction_routes(t uuid,o uuid,l integer) returns jsonb language sql as $$select '{}'::jsonb$$;
 create table djm_os.events(id uuid primary key default gen_random_uuid(),tenant_id uuid,event_type text,actor_user_id uuid,organisation_id uuid,payload jsonb,source text,confidence numeric,occurred_at timestamptz);
 create table platform.audit_events(tenant_id uuid,actor_user_id uuid,actor_kind text,action text,entity_type text,entity_id text,after_state jsonb,metadata jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create function private.redream_request_tenant() returns uuid language sql stable as $$select nullif(current_setting('test.tenant',true),'')::uuid$$;
 create function private.user_is_tenant_admin(t uuid,u uuid) returns boolean language sql stable as $$select exists(select 1 from platform.tenant_memberships m join platform.tenants a on a.id=m.tenant_id and a.status='active' where m.tenant_id=t and m.user_id=u and m.status='active' and m.role in ('owner','admin'))$$;
 create function private.platform_server_ensure_team_member(u uuid) returns void language plpgsql as $$begin if not exists(select 1 from djm_os.team_members where user_id=u) then raise exception 'legacy staff prerequisite';end if;end$$;
 `);
 await db.exec(read('tests/fixtures/club-request/club-needs.sql'));
 const currency=read('supabase/migrations/20261027071355_invoice_currency_precision_v1.sql').match(/create function private\.invoice_currency_minor_unit_v1[\s\S]*?\$currency\$;/);assert.ok(currency);
 await db.exec(currency[0]);
 await db.exec(read('tests/fixtures/club-request/before.sql'));
 await db.exec(`revoke all on function public.djm_entity_patch_v1(text,uuid,jsonb),public.platform_server_agency_create_club_need(uuid,uuid,text,text,text,text,text,date),public.platform_server_workspace_need_record(uuid,uuid,uuid),public.platform_server_demand_control_fast(uuid,integer) from public,anon,authenticated;
 grant execute on function public.djm_entity_patch_v1(text,uuid,jsonb),public.platform_server_agency_create_club_need(uuid,uuid,text,text,text,text,text,date),public.platform_server_workspace_need_record(uuid,uuid,uuid),public.platform_server_demand_control_fast(uuid,integer) to service_role;`);
 await db.query("insert into auth.users values($1)",[user]);
 await db.query("insert into platform.tenants values($1,'active'),($2,'active')",[tenant,other]);
 await db.query("insert into platform.tenant_memberships values($1,$2,'active','owner')",[tenant,user]);
 contracts=(await db.query("select oid,proowner,proacl,prosecdef,proconfig,provolatile from pg_proc where oid in ('public.djm_entity_patch_v1(text,uuid,jsonb)'::regprocedure,'public.platform_server_agency_create_club_need(uuid,uuid,text,text,text,text,text,date)'::regprocedure,'public.platform_server_workspace_need_record(uuid,uuid,uuid)'::regprocedure,'public.platform_server_demand_control_fast(uuid,integer)'::regprocedure) order by oid")).rows;
 await db.exec(migration);await actor();
});
after(()=>db.close());

test('fresh agency membership can create the complete brief without legacy staff or duplicate clubs',async()=>{
 const result=await create({salary_budget:'5000',currency:'EUR',salary_period:'monthly',salary_tax_basis:'net',contract_months:'12',contract_guaranteed:'true',option_months:'12',transfer_type:'free_agent',availability_notes:'Join within two weeks',source_status:'reported'});
 assert.equal(result.brief_version,1);assert.equal(result.created,true);
 const n=await record(result.club_need_id);
 assert.equal(n.salary_budget,5000);assert.equal(n.contract_months,12);assert.equal(n.contract_guaranteed,true);assert.equal(n.option_months,12);assert.equal(n.salary_tax_basis,'net');assert.equal(n.transfer_type,'free_agent');assert.equal(n.source_status,'reported');assert.equal(n.confirmed_at,null);assert.equal(n.availability_notes,'Join within two weeks');assert.equal(n.owner_user_id,user);
 await create();assert.equal(await scalar('count(*) from djm_os.organisations'),1);assert.equal(await scalar('count(*) from djm_os.team_members'),0);
});
test('edits use the canonical record, preserve original wording and untouched conditions, and allow explicit clearing',async()=>{
 const created=await create({salary_budget:'5000',currency:'EUR',salary_period:'monthly',contract_months:12,option_months:12});
 await scalar("public.djm_entity_patch_v1('club_need',$1,$2)",[created.club_need_id,{salary_budget:'5500',profile_notes:'Updated brief',source_status:'confirmed'}]);
 const n=await record(created.club_need_id);assert.equal(n.salary_budget,5500);assert.equal(n.option_months,12);assert.equal(n.contract_months,12);assert.equal(n.profile_notes,'Updated brief');assert.match(n.raw_request,/Original request/);assert.ok(n.confirmed_at);
 await scalar("public.djm_entity_patch_v1('club_need',$1,$2)",[created.club_need_id,{salary_budget:'',option_months:'',source_status:'unverified'}]);
 const cleared=await record(created.club_need_id);assert.equal(cleared.salary_budget,null);assert.equal(cleared.option_months,null);assert.equal(cleared.confirmed_at,null);assert.equal(cleared.contract_months,12);
});
test('invalid and unsupported briefs roll back the whole creation and its events',async()=>{
 const count=await scalar('count(*) from djm_os.club_needs'),events=await scalar('count(*) from djm_os.events');
 for(const brief of [{salary_budget:'-1'},{salary_budget:'1e3'},{salary_budget:'1.5',currency:'JPY'},{currency:'XXX'},{salary_period:'daily'},{contract_months:'121'},{option_months:'1.5'},{contract_guaranteed:true},{source_status:'predicted'},{unexpected:'must not disappear'}])await assert.rejects(()=>create(brief));
 assert.equal(await scalar('count(*) from djm_os.club_needs'),count);assert.equal(await scalar('count(*) from djm_os.events'),events);
});
test('unknowns remain null and true zero is preserved without currency or period assumptions',async()=>{
 const empty=await record((await create()).club_need_id);for(const key of ['salary_budget','salary_period','currency','salary_tax_basis','contract_months','contract_guaranteed','option_months'])assert.equal(empty[key],null,key);assert.equal(empty.source_status,'unverified');assert.equal(empty.confirmed_at,null);
 const zero=await record((await create({salary_budget:'0'})).club_need_id);assert.equal(zero.salary_budget,0);assert.equal(zero.currency,null);
});
test('both real request read models reopen the canonical facts with decimal strings',async()=>{
 const id=(await create({salary_budget:'1234.567',currency:'KWD',salary_period:'monthly',salary_tax_basis:'gross',contract_months:12,option_months:12,availability_notes:'Quick joining',source_status:'reported'})).club_need_id;
 const exact=await scalar('public.platform_server_workspace_need_record($1,$2,$3)',[tenant,user,id]);
 const list=await scalar('public.platform_server_demand_control_fast($1,100)',[tenant]);
 for(const need of [exact.item.need,list.items.find((item:any)=>item.club_need_id===id).need]){
  assert.equal(need.salary_budget,'1234.567');assert.equal(need.salary_tax_basis,'gross');assert.equal(need.option_months,12);assert.equal(need.contract_months,12);assert.equal(need.source_status,'reported');assert.equal(need.availability_notes,'Quick joining');assert.match(need.raw_request,/Original request/);
 }
 await scalar("public.djm_entity_patch_v1('club_need',$1,$2)",[id,{salary_budget:'1300',option_months:'6'}]);
 const reopened=await scalar('public.platform_server_workspace_need_record($1,$2,$3)',[tenant,user,id]);assert.equal(reopened.item.need.salary_budget,'1300');assert.equal(reopened.item.need.option_months,6);
});
test('the browser entrypoint retains tenant/admin checks, rejects stale edits and preserves the valid-until day',async()=>{
 const id=(await create({salary_budget:'5000',contract_months:12,option_months:12})).club_need_id;
 const version=await scalar('updated_at::text from djm_os.club_needs where id=$1',[id]);
 await db.exec('set role authenticated');
 try{
  const result=await scalar('public.redream_club_need_patch($1,$2,$3)',[id,version,{salary_budget:'5500',expires_at:'2099-06-30'}]);assert.equal(result.brief_version,1);assert.equal(result.ok,true);
  await assert.rejects(()=>scalar('public.redream_club_need_patch($1,$2,$3)',[id,version,{salary_budget:'1'}]),/has changed/);
 }finally{await db.exec('reset role');}
 const n=await record(id);assert.equal(n.salary_budget,5500);assert.equal(n.option_months,12);assert.match(n.expires_at,/2099-06-30T23:59:59/);
 const current=await scalar('updated_at::text from djm_os.club_needs where id=$1',[id]);
 await actor(other);await assert.rejects(()=>scalar('public.redream_club_need_patch($1,$2,$3)',[id,current,{salary_budget:'1'}]),/unavailable/);await actor();
 await assert.rejects(()=>scalar('public.redream_club_need_patch($1,$2,$3)',[id,null,{salary_budget:'1'}]),/has changed/);
 await assert.rejects(()=>scalar('public.redream_club_need_patch($1,$2,$3)',[id,current,{raw_request:'rewrite evidence'}]),/Refresh/);
});
test('existing create/read/edit OIDs, grants, security modes and search paths are preserved',async()=>{
 const afterRows=(await db.query('select oid,proowner,proacl,prosecdef,proconfig,provolatile from pg_proc where oid=any($1::oid[]) order by oid',[contracts.map(c=>c.oid)])).rows;assert.deepEqual(afterRows,contracts);
 assert.equal(await scalar("has_function_privilege('anon','public.platform_server_agency_create_club_need_brief(uuid,uuid,jsonb)','execute')"),false);
 assert.equal(await scalar("has_function_privilege('authenticated','public.platform_server_agency_create_club_need_brief(uuid,uuid,jsonb)','execute')"),false);
 assert.equal(await scalar("has_function_privilege('service_role','public.platform_server_agency_create_club_need_brief(uuid,uuid,jsonb)','execute')"),true);
 assert.equal(await scalar("has_function_privilege('service_role','private.platform_club_need_brief_patch(uuid,uuid,jsonb)','execute')"),false);
 for(const name of ['platform_server_workspace_need_record','platform_server_demand_control_fast']){const body=await scalar('prosrc from pg_proc where proname=$1',[name]);assert.match(body,/'salary_budget',salary_budget::text/);for(const key of ['raw_request','salary_tax_basis','source_status','contract_months','option_months'])assert.ok(body.includes("'"+key+"'"));}
});
test('wrong tenant, inactive membership, wrong role and disabled agency cannot create or edit',async()=>{
 const id=(await create({salary_budget:'5000'})).club_need_id;
 await actor(other);await assert.rejects(()=>scalar("public.djm_entity_patch_v1('club_need',$1,$2)",[id,{salary_budget:'1'}]),/access_required/);await actor();
 await assert.rejects(()=>scalar('public.platform_server_agency_create_club_need_brief($1,$2,$3)',[other,user,{club_name:'Foreign FC',position:'Striker'}]),/access_required/);
 for(const role of ['scout','player']){await db.query('update platform.tenant_memberships set role=$1',[role]);await assert.rejects(()=>create(),/access_required/);await assert.rejects(()=>scalar("public.djm_entity_patch_v1('club_need',$1,$2)",[id,{salary_budget:'1'}]),/access_required/);}
 await db.exec("update platform.tenant_memberships set role='owner',status='suspended'");await assert.rejects(()=>create(),/access_required/);
 await db.exec("update platform.tenant_memberships set status='active';update platform.tenants set status='disabled'");await assert.rejects(()=>create(),/access_required/);
 await db.exec("update platform.tenants set status='active'");assert.equal((await record(id)).salary_budget,5000);
});

test('football/source migration persists full requirements and selected records without changing club identities',async()=>{
 await db.exec('alter table djm_os.people add column archived_at timestamptz,add column person_type text,add column country text');
 const beforeContracts=(await db.query("select oid,proname,proowner,proacl,proconfig,provolatile,prosecdef from pg_proc where proname in ('platform_server_agency_create_club_need','platform_club_need_brief_patch','platform_server_agency_create_club_need_brief','redream_club_need_patch','platform_server_workspace_need_record','platform_server_demand_control_fast','platform_server_agency_ensure_club') order by oid")).rows;
 await db.exec(intakeMigration);
 await db.exec(read('supabase/migrations/20261028173149_reuse_club_name_unique_constraint.sql'));
 const afterContracts=(await db.query('select oid,proname,proowner,proacl,proconfig,provolatile,prosecdef from pg_proc where oid=any($1::oid[]) order by oid',[beforeContracts.map((row:any)=>row.oid)])).rows;assert.deepEqual(afterContracts,beforeContracts);
 const selected='30000000-0000-4000-8000-000000000001',ambiguous='30000000-0000-4000-8000-000000000002',person='40000000-0000-4000-8000-000000000001',agency='30000000-0000-4000-8000-000000000003';
 await db.query("insert into djm_os.organisations(id,tenant_id,name,organisation_type,country,league_name) values($1,$4,'Same Name FC','club','Portugal','League A'),($2,$4,'Selected Record FC','club','Australia','League B'),($3,$4,'Source Agency','agency','Italy',null)",[selected,ambiguous,agency,tenant]);
 await db.query("insert into djm_os.people(id,tenant_id,full_name,person_type) values($1,$2,'Source Director','contact')",[person,tenant]);
 await db.query("insert into djm_os.employments values($1,$2,$3,true,'Director')",[tenant,agency,person]);
 const reused=await scalar('public.platform_server_agency_create_club_need_brief($1,$2,$3)',[tenant,user,{club_name:' same name fc ',position:'Striker'}]);assert.equal(reused.organisation_id,selected);
 await assert.rejects(()=>db.query("insert into djm_os.organisations(tenant_id,name,organisation_type) values($1,' SAME NAME FC ','club')",[tenant]),/unique constraint/);
 const brief={secondary_position:'Winger',min_age:18,max_age:26,preferred_foot:'left',min_height_cm:180,level_requirements:'Senior first-team experience',nationality_preferences:'Portugal\nNew Zealand',passport_requirements:'EU passport',registration_notes:'Register before 30 June',foreign_player_notes:'One foreign place available',playing_style:'Pressing forward',source_person_id:person,source_organisation_id:agency,received_on:'2026-10-20',priority:4,source_context:'Request passed on by the sporting director',salary_budget:'5000',currency:'EUR',salary_period:'monthly'};
 const result=await scalar('public.platform_server_agency_create_club_need_brief($1,$2,$3)',[tenant,user,{organisation_id:ambiguous,club_name:'Stale label',country:'Incorrect cached country',position:'Striker',notes:'Untouched original request',brief}]);
 const id=result.club_need_id;assert.equal(result.organisation_id,ambiguous);
 const audit=await scalar("after_state from platform.audit_events where entity_id=$1 and action='platform.agency.club_need_brief_recorded'",[id]);assert.equal(audit.source_person_id,person);assert.equal(audit.min_age,18);
 const record=await scalar('public.platform_server_workspace_need_record($1,$2,$3)',[tenant,user,id]);
 const n=record.item.need;assert.equal(record.item.club.country,'Australia');assert.equal(n.source_person_name,'Source Director');assert.equal(n.source_organisation_name,'Source Agency');assert.equal(n.received_on,'2026-10-20');assert.equal(n.level_requirements,brief.level_requirements);assert.deepEqual(n.nationality_preferences,['Portugal','New Zealand']);assert.equal(n.priority,4);assert.equal(n.min_age,18);assert.equal(n.max_age,26);assert.equal(n.registration_notes,brief.registration_notes);assert.equal(n.salary_budget,'5000');
 const list=await scalar('public.platform_server_demand_control_fast($1,100)',[tenant]);assert.equal(list.items.find((x:any)=>x.club_need_id===id).need.source_person_name,'Source Director');
 const result2=await scalar('public.redream_club_need_patch($1,$2,$3)',[id,n.updated_at,{nationality_preferences:'',min_age:'20',source_person_id:'',received_on:'',source_context:'Corrected source note'}]);assert.equal(result2.ok,true);
 const reopened=(await scalar('public.platform_server_workspace_need_record($1,$2,$3)',[tenant,user,id])).item.need;assert.deepEqual(reopened.nationality_preferences,[]);assert.equal(reopened.min_age,20);assert.equal(reopened.max_age,26);assert.equal(reopened.source_person_id,null);assert.equal(reopened.source_organisation_id,agency);assert.equal(reopened.received_on,null);assert.equal(reopened.raw_request,'Untouched original request');
});
test('source searches and writes reject foreign, archived and player identities and preserve original rows on failure',async()=>{
 const otherPerson='40000000-0000-4000-8000-000000000002',player='40000000-0000-4000-8000-000000000003',old='40000000-0000-4000-8000-000000000004',foreignOrg='30000000-0000-4000-8000-000000000004';
 await db.query("insert into djm_os.people(id,tenant_id,full_name,person_type,archived_at) values($1,$4,'Foreign Director','contact',null),($2,$5,'Player Person','player',null),($3,$5,'Archived Contact','contact',now())",[otherPerson,player,old,other,tenant]);
 await db.query("insert into djm_os.organisations(id,tenant_id,name,organisation_type) values($1,$2,'Foreign Agency','agency')",[foreignOrg,other]);
 await assert.rejects(()=>scalar('public.platform_server_agency_create_club_need_brief($1,$2,$3)',[tenant,user,{organisation_id:foreignOrg,position:'Striker'}]),/available club/);
 const lookup=await scalar('public.platform_server_club_request_options($1,$2,$3,$4,$5)',[tenant,user,'contact','',otherPerson]);assert.equal(lookup.selected,null);assert.equal(lookup.items.some((p:any)=>[otherPerson,player,old].includes(p.id)),false);
 const organisations=await scalar('public.platform_server_club_request_options($1,$2,$3,$4,$5)',[tenant,user,'organisation','Source',null]);assert.equal(organisations.items[0].name,'Source Agency');
 const before=await scalar('count(*) from djm_os.club_needs');
 for(const brief of [{source_person_id:otherPerson},{source_person_id:player},{source_person_id:old},{source_organisation_id:foreignOrg},{min_age:28,max_age:20},{min_height_cm:100},{received_on:'2026-02-30'},{priority:6},{nationality_preferences:[true]}])await assert.rejects(()=>create(brief));
 assert.equal(await scalar('count(*) from djm_os.club_needs'),before);
 for(const kind of ['club','contact','organisation'])await assert.rejects(()=>scalar('public.platform_server_club_request_options($1,$2,$3,$4,$5)',[other,user,kind,'',null]),/access required/);
});
test('source search is bounded, can retain an out-of-page selection and treats search text literally',async()=>{
 await db.query("insert into djm_os.organisations(tenant_id,name,organisation_type) select $1,'Pagination Club '||lpad(i::text,3,'0'),'club' from generate_series(1,35) i",[tenant]);
 const selected=await scalar("id::text from djm_os.organisations where name='Pagination Club 035'");
 const result=await scalar('public.platform_server_club_request_options($1,$2,$3,$4,$5)',[tenant,user,'club','Pagination',selected]);
 assert.equal(result.items.length,30);assert.equal(result.has_more,true);assert.equal(result.selected.id,selected);assert.equal(result.selected.name,'Pagination Club 035');
 const literal=await scalar('public.platform_server_club_request_options($1,$2,$3,$4,$5)',[tenant,user,'club','%',null]);assert.deepEqual(literal.items,[]);
 await assert.rejects(()=>scalar('public.platform_server_club_request_options($1,$2,$3,$4,$5)',[tenant,user,'secrets','',null]),/Check the record search/);
});
test('native tenant references reject the reproduced direct-write bypass while preserving valid writes and delete behaviour',async()=>{
 const id=(await create()).club_need_id,foreignOrg='30000000-0000-4000-8000-000000000004',foreignPerson='40000000-0000-4000-8000-000000000002';
 // Match the actual authenticated table grants/RLS. RPC-only tests would miss this path.
 await db.exec(`alter function private.user_is_tenant_admin(uuid,uuid) security definer;alter function private.user_is_tenant_admin(uuid,uuid) set search_path='';
 grant usage on schema djm_os,private,auth to authenticated;
 grant select,insert,update on djm_os.club_needs to authenticated;
 alter table djm_os.club_needs enable row level security;
 create policy tenant_staff_select on djm_os.club_needs for select to authenticated using(private.user_is_tenant_admin(tenant_id,auth.uid()));
 create policy tenant_staff_update on djm_os.club_needs for update to authenticated using(private.user_is_tenant_admin(tenant_id,auth.uid())) with check(private.user_is_tenant_admin(tenant_id,auth.uid()));`);
 await db.exec('set role authenticated');
 await db.query('update djm_os.club_needs set source_organisation_id=$1 where id=$2',[foreignOrg,id]);
 await db.exec('reset role');assert.equal((await record(id)).source_organisation_id,foreignOrg,'The old single-column FK admits a foreign source');
 await db.query('update djm_os.club_needs set source_organisation_id=null where id=$1',[id]);
 await db.exec(read('supabase/migrations/20261028180511_scope_club_request_references_to_tenant.sql'));
 await db.exec(read('supabase/migrations/20261028181306_align_club_request_reference_indexes.sql'));
 for(const [name,column] of [['club_needs_tenant_club_reference_idx','organisation_id'],['club_needs_tenant_person_reference_idx','source_person_id'],['club_needs_source_organisation_idx','source_organisation_id']])assert.ok((await scalar('pg_get_indexdef(to_regclass($1))',['djm_os.'+name])).endsWith('(tenant_id, '+column+')'));
 await db.exec('set role authenticated');
 try{
  for(const [column,value] of [['source_organisation_id',foreignOrg],['source_person_id',foreignPerson],['organisation_id',foreignOrg]])await assert.rejects(()=>db.query('update djm_os.club_needs set '+column+'=$1 where id=$2',[value,id]),/foreign key/);
 }finally{await db.exec('reset role');}
 const sourceOrg='30000000-0000-4000-8000-000000000099',sourcePerson='40000000-0000-4000-8000-000000000099';
 await db.query("insert into djm_os.organisations(id,tenant_id,name,organisation_type) values($1,$2,'Nullable Source Agency','agency')",[sourceOrg,tenant]);
 await db.query("insert into djm_os.people(id,tenant_id,full_name) values($1,$2,'Nullable Source Contact')",[sourcePerson,tenant]);
 await db.exec('set role authenticated');await db.query('update djm_os.club_needs set source_organisation_id=$1,source_person_id=$2 where id=$3',[sourceOrg,sourcePerson,id]);await db.exec('reset role');
 await assert.rejects(()=>db.query('update djm_os.organisations set tenant_id=$1 where id=$2',[other,sourceOrg]),/foreign key/);
 await db.query('delete from djm_os.organisations where id=$1',[sourceOrg]);await db.query('delete from djm_os.people where id=$1',[sourcePerson]);
 const n=await record(id);assert.equal(n.tenant_id,tenant);assert.equal(n.source_person_id,null);assert.equal(n.source_organisation_id,null);
 const target=n.organisation_id;await db.query('delete from djm_os.organisations where id=$1',[target]);assert.equal(await scalar('count(*) from djm_os.club_needs where id=$1',[id]),0);
});

const salaryPlayer='50000000-0000-4000-8000-000000000091',foreignSalaryPlayer='50000000-0000-4000-8000-000000000092';
const salaryRead=()=>scalar('public.redream_player_salary_terms($1)',[salaryPlayer]);
const salaryWrite=async(patch:Record<string,unknown>,expected?:string|null)=>scalar('public.redream_player_salary_terms_patch($1,$2,$3)',[salaryPlayer,expected===undefined?(await salaryRead()).terms.updated_at:expected,patch]);
const salaryCompare=(need:string)=>scalar('private.player_need_salary_check($1,$2,$3)',[tenant,need,salaryPlayer]);
const validSalary={salary_minimum:'5000',salary_target:'5500',salary_currency:'EUR',salary_period:'monthly',salary_tax_basis:'net',salary_source_status:'confirmed',salary_source_context:'QA player confirmation, base salary only',salary_checked_on:'2026-10-28'};

test('salary terms extend private facts and both reviewed admin read models without changing their contracts',async()=>{
 await db.exec(`alter table platform.tenant_memberships add check(role in('owner','admin','agent','scout','operations','player')),add check(status in('invited','active','suspended','ended'));`);
 await db.exec(`create table djm_os.player_market_facts(player_id uuid primary key references public.players(id) on delete cascade,salary_expectation text,market_preferences text,relocation_preferences text,travel_availability text,passports_held text[] not null default '{}',work_rights text,preferred_move_timing text,last_synced_at timestamptz not null default now());
 alter table djm_os.player_market_facts enable row level security;
 create function private.user_is_player_tenant_admin(p_player uuid) returns boolean language sql stable security definer set search_path='' as $$select private.user_is_tenant_admin((select p.tenant_id from public.players p where p.id=p_player),auth.uid())$$;
 create policy djm_team_select on djm_os.player_market_facts for select to authenticated using(private.user_is_player_tenant_admin(player_id));
 grant select,insert,update,delete on djm_os.player_market_facts to authenticated;`);
 const adminHelper=read('supabase/migrations/20261006120000_staff_workspace_authorization.sql').match(/create or replace function private\.redream_admin_tenant[\s\S]*?\$\$;/);assert.ok(adminHelper);await db.exec(adminHelper[0]);
 const before=(await db.query("select oid,proowner,proacl,prosecdef,proconfig,provolatile from pg_proc where oid in ('public.platform_server_workspace_need_record(uuid,uuid,uuid)'::regprocedure,'public.platform_server_demand_control_fast(uuid,integer)'::regprocedure) order by oid")).rows;
 await db.exec(read('supabase/migrations/20261028224735_player_salary_terms_and_comparison.sql'));
 assert.deepEqual((await db.query("select oid,proowner,proacl,prosecdef,proconfig,provolatile from pg_proc where oid in ('public.platform_server_workspace_need_record(uuid,uuid,uuid)'::regprocedure,'public.platform_server_demand_control_fast(uuid,integer)'::regprocedure) order by oid")).rows,before);
 await db.query("insert into public.players(id,tenant_id,first_name,last_name) values($1,$2,'Salary','Player'),($3,$4,'Foreign','Player')",[salaryPlayer,tenant,foreignSalaryPlayer,other]);
 await db.query("insert into djm_os.player_market_facts(player_id,salary_expectation,market_preferences,last_synced_at) values($1,'Approx 5k plus benefits, basis unclear','Australia','2026-01-01')",[salaryPlayer]);
 const empty=await salaryRead();assert.equal(empty.salary_terms_version,1);assert.equal(empty.terms.salary_minimum,null);assert.equal(empty.terms.updated_at,null);assert.match(empty.terms.legacy_salary_expectation,/Approx/);
 await assert.rejects(()=>db.exec(read('supabase/migrations/20261028224735_player_salary_terms_and_comparison.sql')));await db.exec('rollback');
});
test('structured salary saves are exact, sourced, audited and leave player notes and synchronisation intact',async()=>{
 const result=await salaryWrite(validSalary);assert.equal(result.ok,true);assert.equal(result.id,salaryPlayer);assert.equal(result.entity_type,'player');assert.equal(result.terms.salary_minimum,'5000');assert.equal(result.terms.updated_by,user);assert.ok(result.terms.updated_at);
 const original=await scalar('to_jsonb(f) from djm_os.player_market_facts f where player_id=$1',[salaryPlayer]);assert.equal(original.salary_expectation,'Approx 5k plus benefits, basis unclear');assert.equal(original.market_preferences,'Australia');assert.match(original.last_synced_at,/2026-01-01/);
 const audit=await scalar("to_jsonb(a) from platform.audit_events a where action='agency.player_salary_terms_updated' order by ctid desc limit 1");assert.equal(audit.actor_user_id,user);assert.equal(audit.actor_kind,'user');assert.equal(audit.tenant_id,tenant);assert.equal(audit.after_state.salary_target,'5500');
 const count=await scalar('count(*) from platform.audit_events');const noop=await salaryWrite({salary_currency:'eur'});assert.equal(noop.terms.updated_at,result.terms.updated_at);assert.equal(await scalar('count(*) from platform.audit_events'),count);
 await assert.rejects(()=>salaryWrite({salary_minimum:'4000'},null),(e:any)=>e.code==='40001');assert.equal((await salaryRead()).terms.salary_minimum,'5000');
});
test('salary validation rejects invalid values and source claims atomically, preserving unknown versus zero',async()=>{
 const previous=await salaryRead(),count=await scalar('count(*) from platform.audit_events');
 for(const patch of [{salary_minimum:'-1'},{salary_minimum:'NaN'},{salary_target:'Infinity'},{salary_minimum:'1e4'},{salary_minimum:'9999999999999'},{salary_minimum:'1.12345'},{salary_minimum:5000},{salary_currency:'XXX'},{salary_period:'daily'},{salary_tax_basis:'unknown'},{salary_source_status:'verified'},{salary_source_context:''},{salary_checked_on:''},{salary_checked_on:'2026-02-30'},{salary_checked_on:'2999-01-01'},{salary_checked_on:'2026-10-28T00:00:00Z'},{salary_target:'1'},{salary_source_context:'x'.repeat(2001)},{salary_expectation:'overwrite'},{tenant_id:other}])await assert.rejects(()=>salaryWrite(patch));
 for(const invalid of [null,[],'invalid'])await assert.rejects(()=>scalar('public.redream_player_salary_terms_patch($1,$2,$3)',[salaryPlayer,previous.terms.updated_at,JSON.stringify(invalid)]),(e:any)=>e.code==='22023');
 assert.deepEqual(await salaryRead(),previous);assert.equal(await scalar('count(*) from platform.audit_events'),count);
 await salaryWrite({salary_minimum:'0',salary_target:'',salary_source_status:'reported',salary_source_context:'',salary_checked_on:''});const zero=await salaryRead();assert.equal(zero.terms.salary_minimum,'0');assert.equal(zero.terms.salary_target,null);assert.equal(zero.terms.salary_checked_on,null);
 for(const [currency,valid,invalid] of [['JPY','5','5.1'],['EUR','5.12','5.123'],['KWD','5.123','5.1234'],['CLF','5.1234','5.12345']]){
  await salaryWrite({salary_currency:currency,salary_minimum:valid});assert.equal((await salaryRead()).terms.salary_minimum,valid);await assert.rejects(()=>salaryWrite({salary_minimum:invalid}));
 }
 await salaryWrite({...validSalary});
});
test('salary comparisons use actual numeric amounts and explicit compatible units, with no legacy-text or FX/tax assumptions',async()=>{
 const need=(await create({salary_budget:'5000',currency:'EUR',salary_period:'monthly',salary_tax_basis:'net',source_status:'confirmed'})).club_need_id;
 assert.equal((await salaryCompare(need)).state,'target_above_budget');
 await salaryWrite({salary_minimum:'5000.01',salary_target:'5500'});let comparison=await salaryCompare(need);assert.equal(comparison.state,'minimum_above_budget');assert.equal(comparison.hard_conflict,true);assert.equal(comparison.club_budget,'5000');assert.equal(comparison.player_minimum,'5000.01');const fingerprint=comparison.fingerprint;
 await db.query("update djm_os.club_needs set source_status='reported' where id=$1",[need]);assert.equal((await salaryCompare(need)).hard_conflict,false);assert.equal((await salaryCompare(need)).needs_source_confirmation,true);await db.query("update djm_os.club_needs set source_status='confirmed' where id=$1",[need]);
 await salaryWrite({salary_source_status:'reported'});comparison=await salaryCompare(need);assert.equal(comparison.state,'minimum_above_budget');assert.equal(comparison.hard_conflict,false);assert.equal(comparison.needs_source_confirmation,true);assert.notEqual(comparison.fingerprint,fingerprint);
 for(const [patch,state] of [[{salary_currency:'USD'},'different_currencies'],[{salary_currency:'EUR',salary_tax_basis:'gross'},'different_tax_basis'],[{salary_tax_basis:'net',salary_period:'annual'},'different_periods'],[{salary_period:''},'missing_information']] as const){await salaryWrite(patch);assert.equal((await salaryCompare(need)).state,state);}
 await salaryWrite({salary_minimum:'',salary_target:'',salary_period:'monthly'});assert.equal((await salaryCompare(need)).state,'missing_information');
 await salaryWrite({salary_minimum:'0',salary_target:'',salary_source_status:''});comparison=await salaryCompare(need);assert.equal(comparison.state,'minimum_within_budget');assert.equal(comparison.hard_conflict,false);assert.equal(comparison.needs_source_confirmation,true);
 await salaryWrite({salary_minimum:'',salary_target:'5000'});assert.equal((await salaryCompare(need)).state,'target_within_budget');
 await db.query("update djm_os.club_needs set salary_tax_basis='unknown' where id=$1",[need]);assert.equal((await salaryCompare(need)).state,'missing_information');
 await db.query("update djm_os.club_needs set salary_tax_basis='net',salary_budget='NaN' where id=$1",[need]);assert.equal((await salaryCompare(need)).state,'missing_information');
});
test('both canonical need readers carry fresh salary evidence without modifying match status or source reasoning',async()=>{
 await salaryWrite(validSalary);const need=(await create({salary_budget:'4900',currency:'EUR',salary_period:'monthly',salary_tax_basis:'net',source_status:'confirmed'})).club_need_id,match='60000000-0000-4000-8000-000000000091';
 await db.query("insert into djm_os.player_matches(id,tenant_id,club_need_id,player_id,status,overall_score,reasoning) values($1,$2,$3,$4,'shortlisted',99,'{\"manual\":true}')",[match,tenant,need,salaryPlayer]);
 const candidate=async()=>{const result=await scalar('public.platform_server_workspace_need_record($1,$2,$3)',[tenant,user,need]);return result.item.candidate_coverage.candidates[0];};
 assert.equal((await candidate()).salary_check.state,'minimum_above_budget');const list=await scalar('public.platform_server_demand_control_fast($1,100,$2)',[tenant,user]);assert.equal(list.items.find((n:any)=>n.club_need_id===need).candidate_coverage.candidates[0].salary_check.hard_conflict,true);
 const ordinary=await scalar('public.platform_server_demand_control_fast($1,100)',[tenant]);assert.equal(ordinary.items.find((n:any)=>n.club_need_id===need).candidate_coverage.candidates[0].salary_check,undefined,'The broader staff reader never gains private salary fields');
 await salaryWrite({salary_minimum:'4800',salary_target:'4900'});assert.equal((await candidate()).salary_check.state,'minimum_within_budget');
 const unchanged=await scalar('to_jsonb(m) from djm_os.player_matches m where id=$1',[match]);assert.equal(unchanged.status,'shortlisted');assert.deepEqual(unchanged.reasoning,{manual:true});assert.equal(unchanged.overall_score,99);
});
test('salary RPCs deny non-admin, anonymous, foreign, revoked and suspended access without table grants',async()=>{
 const readSql='public.redream_player_salary_terms($1)',writeSql='public.redream_player_salary_terms_patch($1,null,\'{\"salary_minimum\":\"1\"}\')';
 await actor();await db.exec('set role authenticated');try{assert.equal((await salaryRead()).terms.player_id,salaryPlayer);for(const sql of [readSql,writeSql])await assert.rejects(()=>scalar(sql,[foreignSalaryPlayer]));await assert.rejects(()=>scalar('private.player_need_salary_check($1,$2,$3)',[tenant,tenant,salaryPlayer]));assert.equal((await db.query('update djm_os.player_market_facts set salary_minimum=1 where player_id=$1',[salaryPlayer])).affectedRows,0);await assert.rejects(()=>db.query('insert into djm_os.player_market_facts(player_id,salary_minimum) values($1,1)',[foreignSalaryPlayer]));}finally{await db.exec('reset role');}
 for(const role of ['agent','scout','operations','player']){await db.query('update platform.tenant_memberships set role=$1 where tenant_id=$2 and user_id=$3',[role,tenant,user]);for(const sql of [readSql,writeSql])await assert.rejects(()=>scalar(sql,[salaryPlayer]));await assert.rejects(()=>scalar('public.platform_server_demand_control_fast($1,100,$2)',[tenant,user]));}
 await db.query("update platform.tenant_memberships set role='owner',status='ended' where tenant_id=$1 and user_id=$2",[tenant,user]);await assert.rejects(()=>salaryRead());await db.query("update platform.tenant_memberships set status='active' where tenant_id=$1 and user_id=$2",[tenant,user]);
 await db.query("update platform.tenants set status='suspended' where id=$1",[tenant]);await assert.rejects(()=>salaryRead());await db.query("update platform.tenants set status='active' where id=$1",[tenant]);
 await db.exec('set role anon');try{await assert.rejects(()=>salaryRead());}finally{await db.exec('reset role');}
 await db.query("select set_config('test.user','',false)");await assert.rejects(()=>salaryRead());await actor();
});

let salaryMatch='',salaryNeed='';
const pursuitRead=(match=salaryMatch,command:string|null=null)=>scalar('public.platform_server_pursuit_salary_review($1,$2,$3,$4)',[tenant,user,match,command]);
const reviewWrite=async(decision:string,reason='QA deliberate exploration with salary confirmation pending',expires:string|null=null,id?:string,fingerprint?:string)=>{
 const gate=await pursuitRead();return scalar('public.platform_server_record_pursuit_salary_review($1,$2,$3,$4,$5,$6,$7,$8)',[tenant,user,salaryMatch,id??await scalar('gen_random_uuid()::text'),fingerprint??gate.comparison.fingerprint,decision,reason,expires]);
};
test('financial constraints preserve canonical contracts and keep approval in the private audit domain',async()=>{
 await db.exec(`alter table public.players add primary_position text,add secondary_positions text[] default '{}',add preferred_foot text,add date_of_birth date,add height_cm integer,add verification_status text,add verified_at timestamptz;
 create table public.career_entries(player_id uuid,minutes integer,appearances integer);
 alter table platform.audit_events add id uuid default gen_random_uuid() primary key,add occurred_at timestamptz default now();
 alter table platform.audit_events enable row level security;
 alter table djm_os.player_matches alter column id set default gen_random_uuid(),alter column updated_at set default now(),add unique(club_need_id,player_id);
 create table public.club_share_links(id uuid primary key default gen_random_uuid(),player_id uuid,label text,active boolean,expires_at timestamptz,created_by uuid,opportunity_id uuid,organisation_id uuid,pitch_message text,pitch_status text,selected_sections jsonb,revoked_at timestamptz,created_at timestamptz default now(),sent_at timestamptz);
 create table public.player_public_profiles(player_id uuid primary key,published boolean,verified_at timestamptz);
 create table platform.club_pitch_contexts(share_id uuid,tenant_id uuid,player_match_id uuid,club_need_id uuid,created_by uuid);
 create table djm_os.deal_rooms(id uuid primary key default gen_random_uuid(),tenant_id uuid,player_id uuid,organisation_id uuid,club_need_id uuid,owner_user_id uuid,title text,stage text,status text,expected_commission numeric,currency text,probability numeric,manual_probability numeric,model_probability numeric,probability_source text,probability_basis jsonb,primary_blocker text,next_decision text,next_action_at timestamptz,next_action_text text,last_meaningful_at timestamptz,source text,created_at timestamptz default now());
 create function djm_os.position_matches_player(p_position text,primary_position text,secondary_positions text[]) returns boolean language sql immutable as $$select lower(p_position)=lower(primary_position) or exists(select 1 from unnest(secondary_positions) p where lower(p)=lower(p_position))$$;
 create function djm_os.registration_fit_score(requirement text,rights text,passports text[],country text) returns numeric language sql as $$select null::numeric$$;
 create function public.platform_server_pitch_execution_command(t uuid,n integer) returns jsonb language sql as $$select '{"items":[]}'::jsonb$$;
 create table platform.player_career_strategies(id uuid,tenant_id uuid,player_id uuid,status text,version integer,confirmation_status text,review_due_at date,strategy jsonb);
 create table platform.player_career_exceptions(id uuid,tenant_id uuid,player_match_id uuid,status text,confirmation_status text,expires_at date,created_at timestamptz,approved_at timestamptz,reason text);`);
 await db.exec(read('tests/fixtures/club-request/pursuit-writers-before.sql'));
 const signatures=[ 'djm_os.refresh_need_matches(uuid)','public.platform_server_create_pitch_draft(uuid,uuid,uuid,jsonb)','public.platform_server_publish_pitch_link(uuid,uuid,uuid,timestamptz)','public.platform_server_convert_pursuit_to_deal(uuid,uuid,uuid,jsonb)'];
 for(const signature of signatures)await db.exec('revoke all on function '+signature+' from public,anon,authenticated;grant execute on function '+signature+' to service_role;');
 const before=(await db.query('select oid,proowner,proacl,prosecdef,proconfig,provolatile from pg_proc where oid=any($1::regprocedure[]) order by oid',[signatures])).rows;
 const originalCareerHelper=read('tests/fixtures/club-request/career-gate-before.sql');await db.exec(originalCareerHelper);
 await db.exec(read('supabase/migrations/20261028230249_pursuit_salary_constraints.sql'));
 // Only the unchanged dependency source is guarded here. Exercise each salary
 // writer with deliberate career states rather than inventing a strategy.
 await db.exec(`create or replace function public.platform_server_career_pursuit_gate(p_tenant_id uuid,p_player_match_id uuid) returns jsonb language sql as $$select jsonb_build_object('state',coalesce(nullif(current_setting('test.career_gate',true),''),'open_aligned'))$$`);
 assert.deepEqual((await db.query('select oid,proowner,proacl,prosecdef,proconfig,provolatile from pg_proc where oid=any($1::regprocedure[]) order by oid',[signatures])).rows,before);
 await db.query("update public.players set primary_position='Striker' where id=$1",[salaryPlayer]);
 await salaryWrite({...validSalary,salary_minimum:'6000',salary_target:'6500'});
 salaryNeed=(await create({salary_budget:'5000',currency:'EUR',salary_period:'monthly',salary_tax_basis:'net',source_status:'confirmed'})).club_need_id;
 await db.query('select djm_os.refresh_need_matches($1)',[salaryNeed]);salaryMatch=await scalar('id::text from djm_os.player_matches where club_need_id=$1 and player_id=$2',[salaryNeed,salaryPlayer]);assert.ok(salaryMatch);
});
test('canonical automatic matching removes fabricated commercial/aggregate precision and surfaces hard financial constraints',async()=>{
 const match=await scalar('to_jsonb(m) from djm_os.player_matches m where id=$1',[salaryMatch]);assert.equal(match.overall_score,null);assert.equal(match.commercial_score,null);assert.equal(match.reasoning.source,'redream_recorded_match_checks_v1');assert.equal(match.reasoning.hard_blockers.length,1);assert.ok(match.reasoning.missing_information.includes('Authorised current base-salary review'));assert.doesNotMatch(JSON.stringify(match.reasoning),/6000|6500|QA player confirmation/);
 await db.query("update djm_os.player_matches set status='shortlisted',overall_score=99,commercial_score=98,reasoning='{\"manual\":true,\"source\":\"human\"}' where id=$1",[salaryMatch]);
 await db.query('select djm_os.refresh_need_matches($1)',[salaryNeed]);const manual=await scalar('to_jsonb(m) from djm_os.player_matches m where id=$1',[salaryMatch]);assert.equal(manual.overall_score,99);assert.equal(manual.commercial_score,98);assert.deepEqual(manual.reasoning,{manual:true,source:'human'});
 assert.equal((await pursuitRead()).can_proceed,false);assert.equal((await pursuitRead()).state,'hold_salary_conflict','Manual ranking cannot open the financial gate');
});
test('a deliberate private review is current, expiring, idempotent and cannot change salary or career facts',async()=>{
 const original=await salaryRead(),career=await scalar('public.platform_server_career_pursuit_gate($1,$2)',[tenant,salaryMatch]),before=await scalar('count(*) from platform.audit_events');
 const id=await scalar('gen_random_uuid()::text'),fingerprint=(await pursuitRead()).comparison.fingerprint,expires=await scalar("(current_date+1)::text");
 const first=await reviewWrite('explore','QA check willingness before pricing any offer',expires,id,fingerprint);assert.equal(first.can_proceed,true);assert.equal(first.confirmed_command_id,id);assert.equal(first.state,'open_exploration_review');assert.equal(first.review.active,true);
 await reviewWrite('explore','QA check willingness before pricing any offer',expires,id,fingerprint);assert.equal(await scalar('count(*) from platform.audit_events'),before+1);
 await assert.rejects(()=>reviewWrite('explore','A different reason',expires,id,fingerprint),(e:any)=>e.code==='22023');
 assert.deepEqual(await salaryRead(),original);assert.deepEqual(await scalar('public.platform_server_career_pursuit_gate($1,$2)',[tenant,salaryMatch]),career);
 await salaryWrite({salary_minimum:'6001'});let current=await pursuitRead();assert.equal(current.can_proceed,false);assert.equal(current.review.current,false);
 await assert.rejects(()=>reviewWrite('explore','Stale decision',expires,undefined,fingerprint),(e:any)=>e.code==='40001');
 const replay=await reviewWrite('explore','QA check willingness before pricing any offer',expires,id,fingerprint);assert.equal(replay.confirmed_command_id,id);assert.equal(replay.can_proceed,false,'Receipt proves the old write, never approval against changed evidence');
});
test('salary review validates explicit decisions and preserves a hold until compatible terms are deliberately used',async()=>{
 for(const args of [['explore','',null],['explore','QA missing expiry',null],['explore','QA invalid expiry','2000-01-01'],['other','QA unsupported',null],['hold','x'.repeat(2001),null],['use_recorded_terms','QA cannot skip incompatible terms',null]] as const)await assert.rejects(()=>reviewWrite(...args));
 await salaryWrite({salary_minimum:'4900',salary_target:'5000'});assert.equal((await pursuitRead()).can_proceed,true);
 await reviewWrite('hold','QA need to confirm the requested base salary again');assert.equal((await pursuitRead()).can_proceed,false);assert.equal((await pursuitRead()).state,'hold_recorded_review');
 await salaryWrite({salary_minimum:'4899'});assert.equal((await pursuitRead()).can_proceed,false,'A source correction does not silently remove a human hold');
 await reviewWrite('use_recorded_terms','QA confirmed comparable base salary with both parties');assert.equal((await pursuitRead()).can_proceed,true);
 await salaryWrite({salary_target:'6000'});assert.equal((await pursuitRead()).can_proceed,false,'A target outside budget needs an explicit review');
});
test('canonical pitch/deal writers enforce the financial gate independently of career approval and retain existing verification checks',async()=>{
 const shares=await scalar('count(*) from public.club_share_links'),deals=await scalar('count(*) from djm_os.deal_rooms');
 await assert.rejects(()=>scalar('public.platform_server_create_pitch_draft($1,$2,$3,$4)',[tenant,salaryMatch,user,{}]),(e:any)=>e.code==='22023');
 await assert.rejects(()=>scalar('public.platform_server_convert_pursuit_to_deal($1,$2,$3,$4)',[tenant,salaryMatch,user,{}]),(e:any)=>e.code==='22023');assert.equal(await scalar('count(*) from public.club_share_links'),shares);assert.equal(await scalar('count(*) from djm_os.deal_rooms'),deals);
 await reviewWrite('explore','QA explore only; career and external approval remain separate',await scalar('(current_date+1)::text'));
 await db.query("select set_config('test.career_gate','hold_strategy_missing',false)");await assert.rejects(()=>scalar('public.platform_server_create_pitch_draft($1,$2,$3,$4)',[tenant,salaryMatch,user,{}]),/career_control_gate_not_open/);
 await db.query("select set_config('test.career_gate','open_aligned',false)");const draft=await scalar('public.platform_server_create_pitch_draft($1,$2,$3,$4)',[tenant,salaryMatch,user,{}]);assert.equal(draft.created,true);
 await assert.rejects(()=>scalar('public.platform_server_publish_pitch_link($1,$2,$3,null)',[tenant,draft.share_id,user]),/player_not_verified_for_external_share/);
 await db.query("update public.players set verification_status='verified',verified_at=now() where id=$1",[salaryPlayer]);await db.query('insert into public.player_public_profiles values($1,true,now())',[salaryPlayer]);
 assert.equal((await scalar('public.platform_server_publish_pitch_link($1,$2,$3,null)',[tenant,draft.share_id,user])).published,true);
 await salaryWrite({salary_minimum:'4901'});await assert.rejects(()=>scalar('public.platform_server_publish_pitch_link($1,$2,$3,null)',[tenant,draft.share_id,user]),(e:any)=>e.code==='22023');
});

test('native linked writes reject direct publication/deal/context bypass without obstructing general shares or view history',async()=>{
 const share=await scalar('id::text from public.club_share_links where player_id=$1 limit 1',[salaryPlayer]);
 await assert.rejects(()=>db.query("update public.club_share_links set pitch_message='Bypass financial review' where id=$1",[share]),(e:any)=>e.code==='22023');
 await db.exec('alter table public.club_share_links add view_count integer default 0,add last_viewed_at timestamptz');
 await db.query('update public.club_share_links set view_count=view_count+1,last_viewed_at=now(),sent_at=now() where id=$1',[share]);assert.equal(await scalar('view_count from public.club_share_links where id=$1',[share]),1);
 await db.query('update public.club_share_links set active=false where id=$1',[share]);await assert.rejects(()=>db.query('update public.club_share_links set active=true where id=$1',[share]),(e:any)=>e.code==='22023');
 const org=await scalar('organisation_id from djm_os.club_needs where id=$1',[salaryNeed]);
 await assert.rejects(()=>db.query('insert into djm_os.deal_rooms(tenant_id,player_id,organisation_id,club_need_id) values($1,$2,$3,$4)',[tenant,salaryPlayer,org,salaryNeed]),(e:any)=>e.code==='22023');
 const general=(await db.query<any>('insert into public.club_share_links(player_id,organisation_id,active) values($1,$2,true) returning id',[salaryPlayer,org])).rows[0].id;
 await assert.rejects(()=>db.query('insert into platform.club_pitch_contexts(share_id,tenant_id,player_match_id,club_need_id,created_by) values($1,$2,$3,$4,$5)',[general,tenant,salaryMatch,salaryNeed,user]),(e:any)=>e.code==='22023');
 await db.query("insert into djm_os.deal_rooms(tenant_id,player_id,organisation_id,title) values($1,$2,$3,'Unlinked general deal')",[tenant,salaryPlayer,org]);
});
test('current need readers prioritise salary-ready candidates and never label a financially held route ready',async()=>{
 const record=await scalar('public.platform_server_workspace_need_record($1,$2,$3)',[tenant,user,salaryNeed]);const item=record.item;
 assert.equal(item.candidate_coverage.candidates[0].salary_gate.can_proceed,false);assert.equal(item.candidate_coverage.progress_ready,0);assert.equal(item.coverage_state,'salary_review_required');
 const broad=await scalar('public.platform_server_demand_control_fast($1,100)',[tenant]);assert.equal(broad.items.find((i:any)=>i.club_need_id===salaryNeed).candidate_coverage.candidates[0].salary_gate,undefined);
 const listed=await scalar('public.platform_server_demand_control_fast($1,100,$2)',[tenant,user]);assert.equal(listed.items.find((i:any)=>i.club_need_id===salaryNeed).candidate_coverage.candidates[0].salary_gate.can_proceed,false);
});

test('service-only reviews reject foreign and non-admin authority, while ordinary staff cannot forge private approvals',async()=>{
 const before=await scalar('count(*) from platform.audit_events');
 await assert.rejects(()=>scalar('public.platform_server_pursuit_salary_review($1,$2,$3,null)',[other,user,salaryMatch]),(e:any)=>e.code==='42501');
 await assert.rejects(()=>scalar('public.platform_server_pursuit_salary_review($1,$2,$3,null)',[tenant,foreignSalaryPlayer,salaryMatch]),(e:any)=>e.code==='42501');
 await db.exec('set role authenticated');try{await assert.rejects(()=>pursuitRead(),(e:any)=>e.code==='42501');await assert.rejects(()=>db.query("insert into platform.audit_events(tenant_id,action,entity_type,entity_id,after_state) values($1,'agency.pursuit_salary_review','player_match',$2,'{\"decision\":\"explore\"}')",[tenant,salaryMatch]),(e:any)=>e.code==='42501');}finally{await db.exec('reset role');}
 assert.equal(await scalar('count(*) from platform.audit_events'),before);
 for(const role of ['agent','operations','scout','player']){await db.query('update platform.tenant_memberships set role=$1 where tenant_id=$2 and user_id=$3',[role,tenant,user]);await assert.rejects(()=>pursuitRead(),(e:any)=>e.code==='42501');}
 await db.query("update platform.tenant_memberships set role='owner' where tenant_id=$1 and user_id=$2",[tenant,user]);
 await reviewWrite('explore','QA temporary exploration, current admin authority required',await scalar('(current_date+1)::text'));assert.equal((await pursuitRead()).can_proceed,true);
 await db.query("update platform.tenant_memberships set status='ended' where tenant_id=$1 and user_id=$2",[tenant,user]);assert.equal((await scalar('private.pursuit_salary_gate($1,$2)',[tenant,salaryMatch])).can_proceed,false);await db.query("update platform.tenant_memberships set status='active' where tenant_id=$1 and user_id=$2",[tenant,user]);
});

test('the native publication guard also runs for the authenticated role allowed by the existing table policy',async()=>{
 await reviewWrite('hold','QA retain the financial hold before new publication');
 await db.exec(`grant select,insert,update on public.club_share_links to authenticated;alter table public.club_share_links enable row level security;create policy staff_edit_share on public.club_share_links for all to authenticated using(private.user_is_player_tenant_admin(player_id)) with check(private.user_is_player_tenant_admin(player_id));`);
 const share=await scalar('id::text from public.club_share_links where player_id=$1 and active=false limit 1',[salaryPlayer]);
 await db.exec('set role authenticated');try{await assert.rejects(()=>db.query('update public.club_share_links set active=true where id=$1',[share]),(e:any)=>e.code==='22023');await assert.rejects(()=>scalar('private.assert_pursuit_salary_progress($1,$2)',[tenant,salaryMatch]),(e:any)=>e.code==='42501');}finally{await db.exec('reset role');}
 assert.equal(await scalar('active from public.club_share_links where id=$1',[share]),false);
});

test('exploration expiry uses UTC, expired receipts stay truthful and decisions never transfer to another request',async()=>{
 await salaryWrite({...validSalary,salary_minimum:'6000',salary_target:'6500'});
 const today=await scalar("((now() at time zone 'UTC')::date)::text"),yesterday=await scalar("((now() at time zone 'UTC')::date-1)::text");
 await db.exec("set timezone='Etc/GMT+12'");
 try{
  await assert.rejects(()=>reviewWrite('explore','QA expiry must use the UTC day',yesterday),(e:any)=>e.code==='22023');
  const saved=await reviewWrite('explore','QA same-day UTC exploration',today);assert.equal(saved.can_proceed,true);assert.equal(saved.expiry_basis,'end_of_utc_date');
 }finally{await db.exec("set timezone='UTC'");}
 const gate=await pursuitRead(),expiredId=await scalar('gen_random_uuid()::text'),savedFingerprint=await scalar("after_state->>'fingerprint' from platform.audit_events where id=$1",[gate.review.id]);
 // An already-committed historical command remains a valid receipt after expiry.
 await db.query("insert into platform.audit_events(id,tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,occurred_at) select $1,tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,jsonb_set(after_state,'{expires_on}',to_jsonb($2::text)),clock_timestamp() from platform.audit_events where id=$3",[expiredId,yesterday,gate.review.id]);
 const expired=await reviewWrite('explore','QA same-day UTC exploration',yesterday,expiredId,savedFingerprint);assert.equal(expired.confirmed_command_id,expiredId);assert.equal(expired.can_proceed,false);assert.equal(expired.review.active,false);
 const context=expired.review.context,nextNeed=(await create({salary_budget:'5000',currency:'EUR',salary_period:'monthly',salary_tax_basis:'net',source_status:'confirmed'})).club_need_id;
 await db.query('update djm_os.player_matches set club_need_id=$1 where id=$2',[nextNeed,salaryMatch]);
 const moved=await pursuitRead();assert.equal(moved.review.same_context,false);assert.equal(moved.can_proceed,false);assert.deepEqual(moved.review.context,context);
});

test('new pursuit deals require explicit currency and human inputs, preserve exact optional commission and never copy salary into revenue',async()=>{
 const signature='public.platform_server_convert_pursuit_to_deal(uuid,uuid,uuid,jsonb)';
 const before=await scalar('jsonb_build_object(\'oid\',oid,\'owner\',proowner,\'acl\',proacl,\'mode\',prosecdef,\'path\',proconfig,\'volatility\',provolatile) from pg_proc where oid=$1::regprocedure',[signature]);
 await db.exec(read('supabase/migrations/20261029070637_require_explicit_pursuit_deal_money.sql'));
 assert.deepEqual(await scalar('jsonb_build_object(\'oid\',oid,\'owner\',proowner,\'acl\',proacl,\'mode\',prosecdef,\'path\',proconfig,\'volatility\',provolatile) from pg_proc where oid=$1::regprocedure',[signature]),before);
 await salaryWrite({...validSalary,salary_minimum:'4000',salary_target:'4500'});
 const need=(await scalar('public.platform_server_agency_create_club_need_brief($1,$2,$3)',[tenant,user,{club_name:'Pursuit money QA',position:'Striker',brief:{salary_budget:'5000',currency:'EUR',salary_period:'monthly',salary_tax_basis:'net',source_status:'confirmed'}}])).club_need_id;
 const match=await scalar("gen_random_uuid()::text");await db.query("insert into djm_os.player_matches(id,tenant_id,club_need_id,player_id,status,reasoning) values($1,$2,$3,$4,'shortlisted','{\"manual\":true}')",[match,tenant,need,salaryPlayer]);
 const convert=(input:Record<string,unknown>)=>scalar('public.platform_server_convert_pursuit_to_deal($1,$2,$3,$4)',[tenant,match,user,input]);
 const base={stage:'qualifying',probability:0,currency:'USD'};
 const count=await scalar('count(*) from djm_os.deal_rooms');
 for(const invalid of [{currency:''},{currency:null},{currency:'XXX'},{stage:''},{stage:null},{probability:''},{probability:null},{probability:1.5},{probability:101},{probability:true},{expected_commission:'NaN'},{expected_commission:'-1'},{expected_commission:'1e3'},{expected_commission:'1.005'},{expected_commission:'1000000000000'},{currency:'JPY',expected_commission:'1.1'}]){
  await assert.rejects(()=>convert({...base,...invalid}),(e:any)=>e.code==='22023');assert.equal(await scalar('count(*) from djm_os.deal_rooms'),count);
 }
 for(const [currency,commission] of [['USD','1234.56'],['JPY','100'],['KWD','1.234'],['CLF','1.2345'],['CLF','999999999999.1234'],['EUR',null],['EUR','0']] as const){
  await db.exec('begin');try{
   const result=await convert({...base,currency,expected_commission:commission});assert.equal(result.created,true);assert.equal(result.deal.currency,currency);assert.equal(result.deal.probability,0);assert.equal(result.deal.expected_commission,commission,'The acknowledgement keeps exact decimal strings and null');
   assert.equal(await scalar('expected_commission::text from djm_os.deal_rooms where id=$1',[result.deal_room_id]),commission);
   const reused=await convert({});assert.equal(reused.existing,true);assert.equal(reused.deal_room_id,result.deal_room_id);assert.equal(reused.deal.currency,currency,'Reopening an existing deal does not replace its actual currency');
  }finally{await db.exec('rollback');}
 }
 assert.equal((await salaryRead()).terms.salary_minimum,'4000');
});
