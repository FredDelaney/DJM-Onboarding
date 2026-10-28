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
 create function public.platform_server_career_pursuit_gate(t uuid,m uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
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
