import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const migration=readFileSync(new URL('../supabase/migrations/20261005202518_restore_server_rpc_permissions.sql',import.meta.url),'utf8');
test('server RPC repair removes client execution, retains server and public-invite access, and replays safely',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`
   create role anon; create role authenticated; create role service_role;
   create function public.platform_server_player_portal_review(uuid,uuid,integer) returns jsonb language sql security definer as $$select '{"available":false}'::jsonb$$;
   create function public.platform_server_save_deal_closeout(uuid,uuid,uuid,jsonb) returns jsonb language sql security definer as $$select '{"saved":true}'::jsonb$$;
   create function public.validate_player_invite_v2(uuid) returns boolean language sql security definer as $$select true$$;
   grant execute on all functions in schema public to anon,authenticated,service_role;
  `);
  for(let replay=0;replay<2;replay++){
   await db.exec(migration);
   for(const fn of ['public.platform_server_player_portal_review(uuid,uuid,integer)','public.platform_server_save_deal_closeout(uuid,uuid,uuid,jsonb)']){
    const result=(await db.query<{anon:boolean;client:boolean;server:boolean}>("select has_function_privilege('anon',$1,'execute') anon,has_function_privilege('authenticated',$1,'execute') client,has_function_privilege('service_role',$1,'execute') server",[fn])).rows[0];
    assert.deepEqual(result,{anon:false,client:false,server:true});
   }
  }
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   try{
    await assert.rejects(db.query("select public.platform_server_player_portal_review('00000000-0000-0000-0000-000000000000',null,30)"),/permission denied/);
    await assert.rejects(db.query("select public.platform_server_save_deal_closeout('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','{}')"),/permission denied/);
   }finally{await db.exec('reset role');}
  }
  await db.exec('set role service_role');
  const server=(await db.query("select public.platform_server_player_portal_review('00000000-0000-0000-0000-000000000000',null,30) result")).rows[0] as {result:{available:boolean}};
  assert.equal(server.result.available,false);
  await db.exec('reset role; set role anon');
  assert.equal((await db.query("select public.validate_player_invite_v2('00000000-0000-0000-0000-000000000000') allowed")).rows[0]?.allowed,true);
 }finally{await db.close();}
});
