import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const migration=readFileSync('supabase/migrations/20261026053423_materialize_deal_portfolio_context.sql','utf8');
const definitions=[
 ['20260913131302_agency_os_momentum_aware_war_room.sql','platform_server_deal_portfolio'],
 ['20260913132053_agency_os_deal_war_room_v2_pressure_ageing.sql','platform_server_deal_portfolio_v2'],
].map(([file,name])=>{
 const text=readFileSync('supabase/migrations/'+file,'utf8');
 const start=text.indexOf('create or replace function public.'+name+'(');
 assert.ok(start>=0,'Existing portfolio baseline is required');
 return {name,sql:text.slice(start,text.indexOf('$$;',start)+3)};
});
const tenant='00000000-0000-0000-0000-000000000001';
test('existing deal portfolios evaluate each scoped war room once without changing output or access',async t=>{
 const db=new PGlite();
 const value=async(sql:string,args:any[]=[])=>Object.values((await db.query('select '+sql,args)).rows[0])[0] as any;
 const metadata=()=>db.query(`select oid,proname,proowner,proacl,proconfig,prosecdef,provolatile,proargnames,
  pg_get_function_arguments(oid) as arguments,pg_get_function_result(oid) as result,
  obj_description(oid,'pg_proc') as comment from pg_proc where proname in
  ('platform_server_deal_portfolio','platform_server_deal_portfolio_v2') order by proname`);
 const read=async(name:string,limit:number|null=1,scope=tenant)=>{
  await value("set_config('test.war_calls','0',false)");
  const result=await value('public.'+name+'($1,$2)',[scope,limit]);
  delete result.generated_at;
  return {result,calls:await value("current_setting('test.war_calls')::int")};
 };
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema djm_os;
   create table djm_os.deal_rooms(id uuid,tenant_id uuid,status text);
   insert into djm_os.deal_rooms values
    ('00000000-0000-0000-0000-000000000011','${tenant}','active'),
    ('00000000-0000-0000-0000-000000000012','${tenant}','active'),
    ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000002','active'),
    ('00000000-0000-0000-0000-000000000014','${tenant}','closed');
   create function public.platform_server_deal_war_room(uuid,uuid) returns jsonb language plpgsql stable as $$
   begin
    perform set_config('test.war_calls',(coalesce(nullif(current_setting('test.war_calls',true),''),'0')::int+1)::text,false);
    return jsonb_build_object(
     'deal',jsonb_build_object('deal_room_id',$2,'title',$2::text,'stage','interest','currency','EUR','probability',25,'expected_commission',100,'weighted_commission',25,'primary_blocker','Recorded context'),
     'control_health',jsonb_build_object('score',75,'state','controlled','gaps','[]'::jsonb),
     'attention',jsonb_build_object('score',50),
     'evidence_health',jsonb_build_object('score',80),
     'momentum',jsonb_build_object('momentum_score',50,'momentum_state','progressing'),
     'rescue',jsonb_build_object('state','none'));
   end;$$;
   create function public.platform_server_deal_war_room_v2(uuid,uuid) returns jsonb language sql stable as $$select public.platform_server_deal_war_room($1,$2)$$;
   create function public.platform_server_deal_operating_policy(uuid) returns jsonb language sql stable as $$select '{}'::jsonb$$;`);
  for(const d of definitions){
   await db.exec(d.sql);
   await db.exec(`revoke all on function public.${d.name}(uuid,integer) from public,anon,authenticated;
    grant execute on function public.${d.name}(uuid,integer) to service_role;
    comment on function public.${d.name}(uuid,integer) is 'Existing reviewed reader';`);
  }
  const before=await metadata();
  const baseline=new Map<string,any>();
  for(const d of definitions)baseline.set(d.name,await read(d.name));
  await t.test('reproduces repeated evaluation and fixes it using the actual existing SQL',async()=>{
   await db.exec(migration);
   for(const d of definitions){
    const old=baseline.get(d.name),fresh=await read(d.name);
    assert.ok(old.calls>2,'The old query repeats war-room evaluation');
    assert.equal(fresh.calls,2,'Exactly one evaluation for each active tenant deal');
    assert.deepEqual(fresh.result,old.result);
    assert.equal(fresh.result.deals.length,1);assert.equal(fresh.result.summary.active_deals,2);
    assert.equal(fresh.result.summary.hidden_by_limit,1);
   }
  });
  await t.test('preserves catalog identity, comments, defaults, service-only ACL and safe replay',async()=>{
   assert.deepEqual(await metadata(),before);
   await db.exec(migration);assert.deepEqual(await metadata(),before);
   for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);
    for(const d of definitions)await assert.rejects(()=>read(d.name),/permission denied for function/);
    await db.exec('reset role');
   }
   await db.exec('set role service_role');
   assert.equal((await read(definitions[0].name)).result.summary.active_deals,2);
   await db.exec('reset role');
  });
  await t.test('retains ranking, tenant/status exclusions, default/clamped limits and empty results',async()=>{
   await db.exec(`insert into djm_os.deal_rooms
    select ('00000000-0000-0000-0000-'||lpad((100+g)::text,12,'0'))::uuid,'${tenant}','active' from generate_series(1,65) g`);
   for(const d of definitions){
    const expected=new Map<number|null,any>();
    await db.exec(d.sql);
    for(const limit of [-1,1,20,100,null])expected.set(limit,(await read(d.name,limit)).result);
    // Restore the other reviewed baseline too before applying the guarded pair.
    for(const other of definitions)await db.exec(other.sql);
    await db.exec(migration);
    for(const limit of [-1,1,20,100,null]){
     const actual=await read(d.name,limit);
     assert.deepEqual(actual.result,expected.get(limit));assert.equal(actual.calls,67);
    }
    assert.equal((await read(d.name,100)).result.deals.length,50);
    const empty=await read(d.name,20,'00000000-0000-0000-0000-000000000099');
    assert.equal(empty.calls,0);assert.equal(empty.result.summary.active_deals,0);assert.deepEqual(empty.result.deals,[]);
   }
  });
  await t.test('rejects an unknown second source atomically and refuses a missing reader',async()=>{
   for(const d of definitions)await db.exec(d.sql);
   const second=definitions[1];await db.exec(second.sql.replace('begin\n','begin\n -- Unreviewed body\n'));
   const original=await value("md5(prosrc) from pg_proc where proname='platform_server_deal_portfolio'");
   await assert.rejects(()=>db.exec(migration),/differs from the reviewed baseline/);
   assert.equal(await value("md5(prosrc) from pg_proc where proname='platform_server_deal_portfolio'"),original,'No partial first-function patch');
   await db.exec('drop function public.platform_server_deal_portfolio_v2(uuid,integer)');
   await assert.rejects(()=>db.exec(migration),/Reviewed portfolio reader is missing/);
   assert.equal(await value("md5(prosrc) from pg_proc where proname='platform_server_deal_portfolio'"),original);
  });
 }finally{await db.close();}
});
