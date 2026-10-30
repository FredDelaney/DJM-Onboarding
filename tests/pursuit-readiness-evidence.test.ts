import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {before,after,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const read=(path:string)=>readFileSync(path,'utf8');
const beforeSource=read('tests/fixtures/club-request/pursuit-readiness-before.sql');
const migration=read('supabase/migrations/20261029165931_preserve_unknown_pursuit_assessments.sql');
const tenant='20000000-0000-4000-8000-000000000001',foreign='20000000-0000-4000-8000-000000000002';
const player='50000000-0000-4000-8000-000000000001',second='50000000-0000-4000-8000-000000000002';
const need='60000000-0000-4000-8000-000000000001',club='70000000-0000-4000-8000-000000000001';
const names=['platform_server_pursuit_readiness_core','platform_server_pursuit_readiness','platform_server_pursuit_board','platform_server_career_aligned_pursuit_board','platform_server_pitch_readiness_command','platform_server_agency_playbook_core','platform_server_agency_playbook','platform_server_deal_advantage','platform_server_deal_advantage_fast','platform_server_club_accounts'];
const signatures=names.map(name=>'public.'+name+(name==='platform_server_pursuit_readiness_core'||name==='platform_server_pursuit_readiness'?'(uuid,uuid,uuid)':name.includes('deal_advantage')?'(uuid,uuid)':'(uuid,integer)'));
const scalar=async(sql:string,args:unknown[]=[])=>Object.values((await db.query<any>('select '+sql,args)).rows[0])[0] as any;
const core=()=>scalar('public.platform_server_pursuit_readiness_core($1,$2,$3)',[tenant,need,player]);
const contracts=()=>db.query("select oid,proowner,proacl,prosecdef,provolatile,proconfig,pg_get_function_arguments(oid) as arguments,pg_get_function_result(oid) as result from pg_proc where oid=any($1::regprocedure[]) order by oid",[signatures]);
const rows=()=>scalar("jsonb_build_object('players',(select jsonb_agg(to_jsonb(p) order by id) from public.players p),'matches',(select jsonb_agg(to_jsonb(m) order by id) from djm_os.player_matches m),'needs',(select jsonb_agg(to_jsonb(n) order by id) from djm_os.club_needs n),'profiles',(select jsonb_agg(to_jsonb(p) order by player_id) from public.player_public_profiles p))");
let baselineContracts:unknown[]=[];
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema djm_os;create schema platform;
 create table public.players(id uuid primary key,tenant_id uuid,first_name text,last_name text,primary_position text,current_club text,football_status text,verification_status text,verified_at timestamptz);
 create table djm_os.organisations(id uuid primary key,tenant_id uuid,name text,country text,league_name text,city text);
 create table djm_os.club_needs(id uuid primary key,tenant_id uuid,organisation_id uuid,title text,position text,need_type text,priority smallint,expires_at timestamptz,status text);
 create table djm_os.player_matches(id uuid primary key default gen_random_uuid(),tenant_id uuid,club_need_id uuid,player_id uuid,status text,overall_score numeric,football_score numeric,commercial_score numeric,registration_score numeric,career_score numeric,access_score numeric,reasoning jsonb);
 create table public.player_public_profiles(player_id uuid primary key,published boolean,verified_at timestamptz);
 create table public.club_share_links(id uuid,player_id uuid,organisation_id uuid,active boolean,revoked_at timestamptz,expires_at timestamptz);
 create table platform.tenants(id uuid primary key,status text);
 create table djm_os.deal_rooms(id uuid primary key default gen_random_uuid(),tenant_id uuid,player_id uuid,club_need_id uuid,organisation_id uuid,status text,title text,stage text,expected_commission numeric,currency text,probability numeric,manual_probability numeric,model_probability numeric,next_action_at timestamptz,primary_blocker text,next_action_text text);
 create table djm_os.employments(tenant_id uuid,organisation_id uuid,person_id uuid,is_current boolean);
 create table djm_os.relationships(tenant_id uuid,person_id uuid);
 create table djm_os.interactions(tenant_id uuid,organisation_id uuid,occurred_at timestamptz);
 create function public.platform_server_access_routes(t uuid,o uuid,l integer) returns jsonb language sql stable as $$select case when current_setting('test.access',true)='none' then '{"route_count":0,"best_route":null}'::jsonb else '{"route_count":1,"best_route":{"route_score":90,"route_state":"warm","person_name":"Fixture club contact"}}'::jsonb end$$;
 create function public.platform_server_introduction_routes(t uuid,o uuid,l integer) returns jsonb language sql stable as $$select '{"routes":[],"route_count":0,"best_route":null}'::jsonb$$;
 create function platform.command_evidence_health_v2(t uuid,context jsonb) returns jsonb language sql stable as $$select '{"score":90}'::jsonb$$;
 create function platform.strategic_play_evidence_health(t uuid,play jsonb) returns jsonb language sql stable as $$select '{"score":90}'::jsonb$$;
 create function public.platform_server_negotiation_readiness(t uuid,d uuid) returns jsonb language sql stable as $$select '{"score":90,"state":"recorded","factors":{"commercial_terms_clarity":{"score":90,"budget_alignment":{"salary":"within_recorded_budget"}}}}'::jsonb$$;
 create function public.platform_server_deal_momentum(t uuid,d uuid,n integer) returns jsonb language sql stable as $$select '{"momentum_score":90,"state":"active"}'::jsonb$$;
 create function public.platform_server_club_account(t uuid,o uuid) returns jsonb language sql stable as $$select jsonb_build_object('access',jsonb_build_object('direct',public.platform_server_access_routes(t,o,3),'introductions',public.platform_server_introduction_routes(t,o,3)))$$;
 create function public.platform_server_career_pursuit_gate(t uuid,m uuid) returns jsonb language sql stable as $$select jsonb_build_object('state',coalesce(nullif(current_setting('test.career',true),''),'open_aligned'))$$;`);
 await db.exec(beforeSource);
 for(const signature of signatures)await db.exec('revoke all on function '+signature+' from public,anon,authenticated;grant execute on function '+signature+' to service_role;');
 await db.query("insert into public.players values($1,$2,'A','Player','ST','Fixture club','active','verified',now()),($3,$2,'Z','Player','ST','Fixture club','active','verified',now())",[player,tenant,second]);
 await db.query("insert into djm_os.organisations(id,tenant_id,name,country,league_name) values($1,$2,'Fixture club','Portugal','Fixture league')",[club,tenant]);
 await db.query("insert into platform.tenants values($1,'active')",[tenant]);
 await db.query("insert into djm_os.club_needs values($1,$2,$3,'Recorded striker request','ST','confirmed',3,null,'active')",[need,tenant,club]);
 await db.query("insert into djm_os.player_matches(tenant_id,club_need_id,player_id,status,overall_score,football_score,commercial_score,registration_score,career_score,access_score,reasoning) values($1,$2,$3,'shortlisted',99,90,null,90,90,90,'{\"manual\":true,\"source\":\"retained assessment\"}')",[tenant,need,player]);
 await db.query('insert into public.player_public_profiles values($1,true,now())',[player]);
 baselineContracts=(await contracts()).rows;
});
after(()=>db.close());

test('missing assessments no longer become neutral 50 or a credible numeric pursuit',async()=>{
 const old=await core();assert.equal(old.factors.commercial_fit.score,50);assert.equal(old.readiness_score,84);assert.equal(old.readiness_state,'credible_pursuit');
 const before=await rows();await db.exec(migration);
 const current=await core();assert.equal(current.readiness_score,null);assert.equal(current.readiness_state,'assessment_incomplete');assert.equal(current.factors.commercial_fit.score,null);assert.equal(current.factors.commercial_fit.source,'not_recorded');assert.deepEqual(current.missing_factors,['commercial_fit']);
 assert.deepEqual(await rows(),before,'The migration and read model do not rewrite manual selections, scores, reasoning, needs or profiles');assert.deepEqual((await contracts()).rows,baselineContracts);
});

test('each unknown factor stays unknown, including legacy aggregate-only football and absent access',async()=>{
 for(const [column,factor] of [['football_score','football_fit'],['registration_score','registration'],['commercial_score','commercial_fit'],['career_score','career_fit']] as const){
  await db.query('update djm_os.player_matches set football_score=90,registration_score=90,commercial_score=90,career_score=90,access_score=90');
  await db.exec('update djm_os.player_matches set '+column+'=null');const result=await core();assert.equal(result.readiness_score,null);assert.equal(result.factors[factor].score,null);assert.ok(result.missing_factors.includes(factor));assert.equal(result.bottleneck.score,null);
 }
 await db.exec('update djm_os.player_matches set football_score=90,registration_score=90,commercial_score=90,career_score=90,access_score=null');await db.exec("select set_config('test.access','none',false)");
 assert.equal((await core()).readiness_score,null);assert.ok((await core()).missing_factors.includes('club_access'));
 await db.exec("select set_config('test.access','recorded',false);update djm_os.club_needs set need_type=null");const unknownDemand=await core();assert.equal(unknownDemand.factors.demand_certainty.score,null);assert.ok(unknownDemand.missing_factors.includes('demand_certainty'));assert.equal(unknownDemand.readiness_score,null);
 await db.exec("update djm_os.club_needs set need_type='confirmed'");
});

test('deliberate zero and complete recorded assessments retain the established calculation',async()=>{
 await db.exec('update djm_os.player_matches set football_score=0,registration_score=0,commercial_score=0,career_score=0,access_score=0');await db.exec("select set_config('test.access','none',false)");
 const zero=await core();assert.equal(zero.readiness_score,9);assert.equal(zero.readiness_state,'weak_or_blocked');assert.equal(zero.factors.football_fit.score,0);assert.deepEqual(zero.missing_factors,[]);
 await db.exec('update djm_os.player_matches set football_score=90,registration_score=90,commercial_score=90,career_score=90,access_score=90');await db.exec("select set_config('test.access','recorded',false)");const complete=await core();assert.equal(complete.readiness_score,90);assert.equal(complete.readiness_state,'strong_pursuit');assert.deepEqual(complete.missing_factors,[]);
});

test('the actual board ranks known assessments ahead of unknowns and reports their distinct count',async()=>{
 await db.exec('update djm_os.player_matches set commercial_score=null');
 await db.query("insert into djm_os.player_matches(tenant_id,club_need_id,player_id,status,football_score,registration_score,commercial_score,career_score,access_score) values($1,$2,$3,'suggested',90,90,90,90,90)",[tenant,need,second]);
 const board=await scalar('public.platform_server_pursuit_board($1,20)',[tenant]);assert.equal(board.items[0].player.player_id,second);assert.equal(board.items[1].player.player_id,player);assert.equal(board.items[1].readiness_score,null);assert.equal(board.summary.incomplete_assessment_count,1);assert.equal(board.summary.strong_count,1);assert.equal(board.summary.pursuit_count,2);
});

test('readiness, career and pitch entrypoints retain unknowns without confusing them with evidence confidence or permissions',async()=>{
 const wrapped=await scalar('public.platform_server_pursuit_readiness($1,$2,$3)',[tenant,need,player]);assert.equal(wrapped.readiness_score,null);assert.equal(wrapped.pursuit_operating_mode,'review_recorded_assessments');assert.equal(wrapped.evidence_health.score_floor,90);assert.equal(wrapped.access_strategy.recommended_mode,'use_direct_route');
 const pitch=async()=>{const value=await scalar('public.platform_server_pitch_readiness_command($1,50)',[tenant]);return value.items.find((i:any)=>i.player.player_id===player);};
 const current=await pitch();assert.equal(current.pursuit_readiness.score,null);assert.equal(current.pursuit_readiness.state,'assessment_incomplete');assert.deepEqual(current.pursuit_readiness.missing_factors,['commercial_fit']);
 await db.exec("select set_config('test.career','hold_strategy_missing',false)");assert.equal((await pitch()).pitch_readiness_state,'career_control_hold');await db.exec("select set_config('test.career','open_aligned',false)");
 await db.query("update public.players set verification_status='unverified',verified_at=null where id=$1",[player]);assert.equal((await pitch()).pitch_readiness_state,'player_not_verified_for_external_share');
});

test('missing pursuit ratings never become priority 100 or unsupported credible-fit advice',async()=>{
 const result=await scalar('public.platform_server_agency_playbook($1,20)',[tenant]);
 const unknown=result.plays.find((p:any)=>p.evidence.player_id===player),known=result.plays.find((p:any)=>p.evidence.player_id===second);
 assert.equal(unknown.play_score,null);assert.equal(unknown.play_type,'review_pursuit');assert.match(unknown.rationale,/not recorded/);assert.doesNotMatch(unknown.rationale,/credible|all strong/);assert.equal(known.play_score,98);assert.ok(known.rank<unknown.rank);assert.equal(unknown.evidence.pursuit.readiness_state,'assessment_incomplete');
 const clubs=await scalar('public.platform_server_club_accounts($1,50)',[tenant]);assert.equal(clubs.clubs[0].top_play.play_id,known.play_id,'The account also sorts unknown priority after known values');assert.equal(clubs.clubs[0].pursuits.best_readiness_score,90);
});

test('deep and fast deal readers retain unknown fit without inventing operating advantage or weak-player claims',async()=>{
 await db.exec('begin');try{
  const id=await scalar("gen_random_uuid()::text");await db.query("insert into djm_os.deal_rooms(id,tenant_id,player_id,club_need_id,organisation_id,status,title,stage) values($1,$2,$3,$4,$5,'active','Fixture private negotiation','qualifying')",[id,tenant,player,need,club]);
  for(const name of ['platform_server_deal_advantage','platform_server_deal_advantage_fast']){
   const value=await scalar('public.'+name+'($1,$2)',[tenant,id]);assert.equal(value.factors.player_club_fit.score,null);assert.equal(value.operating_advantage_score,null);assert.equal(value.state,'assessment_incomplete');assert.ok(value.unknowns.includes('pursuit_assessment_incomplete'));assert.ok(!value.edges.includes('strong_recorded_player_club_fit'));
   await db.query('update djm_os.deal_rooms set club_need_id=null where id=$1',[id]);const unlinked=await scalar('public.'+name+'($1,$2)',[tenant,id]);assert.equal(unlinked.operating_advantage_score,null);assert.ok(unlinked.unknowns.includes('no_linked_pursuit_readiness_case'));await db.query('update djm_os.deal_rooms set club_need_id=$1 where id=$2',[need,id]);
  }
  await db.exec('update djm_os.player_matches set commercial_score=90');
  for(const name of ['platform_server_deal_advantage','platform_server_deal_advantage_fast']){const value=await scalar('public.'+name+'($1,$2)',[tenant,id]);assert.equal(value.factors.player_club_fit.score,90);assert.equal(value.operating_advantage_score,85);assert.ok(value.edges.includes('strong_recorded_player_club_fit'));}
 }finally{await db.exec('rollback');}
});

test('tenant identities and service-only execution contracts remain enforced without new grants',async()=>{
 await assert.rejects(()=>scalar('public.platform_server_pursuit_readiness_core($1,$2,$3)',[foreign,need,player]),/not_found_for_tenant/);
 const before=await rows();for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(core,(e:any)=>e.code==='42501');await assert.rejects(()=>scalar('public.platform_server_pitch_readiness_command($1,50)',[tenant]),(e:any)=>e.code==='42501');}finally{await db.exec('reset role');}}
 assert.deepEqual((await contracts()).rows,baselineContracts);assert.deepEqual(await rows(),before);
});

test('unknown source drift aborts atomically and already-applied SQL cannot be replayed',async()=>{
 await assert.rejects(()=>db.exec(migration),/Unreviewed pursuit assessment/);
 await db.exec('begin');try{
  await db.exec(beforeSource);const body=await scalar("pg_get_functiondef('public.platform_server_pursuit_readiness(uuid,uuid,uuid)'::regprocedure)");await db.exec(body.replace('verify_player_evidence_first','unreviewed_source'));
  const oldHash=await scalar("md5(prosrc) from pg_proc where oid='public.platform_server_pursuit_readiness_core(uuid,uuid,uuid)'::regprocedure");await db.exec('savepoint failed_change');await assert.rejects(()=>db.exec(migration),/Unreviewed pursuit assessment/);await db.exec('rollback to savepoint failed_change');
  assert.equal(await scalar("md5(prosrc) from pg_proc where oid='public.platform_server_pursuit_readiness_core(uuid,uuid,uuid)'::regprocedure"),oldHash);
 }finally{await db.exec('rollback');}
});

test('unexpected execution grants are preserved and reject the whole candidate instead of widening access',async()=>{
 await db.exec('begin');try{
  await db.exec(beforeSource);await db.exec('grant execute on function public.platform_server_pursuit_board(uuid,integer) to authenticated');
  const oldHash=await scalar("md5(prosrc) from pg_proc where oid='public.platform_server_pursuit_readiness_core(uuid,uuid,uuid)'::regprocedure");
  await db.exec('savepoint rejected_permissions');await assert.rejects(()=>db.exec(migration),/execution contract/);await db.exec('rollback to savepoint rejected_permissions');
  assert.equal(await scalar("md5(prosrc) from pg_proc where oid='public.platform_server_pursuit_readiness_core(uuid,uuid,uuid)'::regprocedure"),oldHash);
  assert.equal(await scalar("has_function_privilege('authenticated','public.platform_server_pursuit_board(uuid,integer)','execute')"),true,'Unknown permissions are not silently edited by this repair');
 }finally{await db.exec('rollback');}
});
