import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
// @ts-expect-error A Node CLI deliberately shares no browser dependency graph.
import {releaseDatabasePreflight} from '../scripts/release-database-preflight.mjs';
const db=new PGlite();after(()=>db.close());
test('read-only preflight reports missing calls, required columns and unsafe server grants',async()=>{
 await db.exec(`create role anon;create role authenticated;
 create function public.platform_server_present() returns void language sql as $$select$$;
 create function public.platform_server_private() returns void language sql as $$select$$;
 revoke all on function public.platform_server_private() from public;
 create schema djm_os;create table djm_os.tasks(owner_user_id uuid,completed_at timestamptz);`);
 const sql=releaseDatabasePreflight([['example.ts',`client.rpc('platform_server_present');rpc('platform_server_private');rpc('platform_server_missing');client.rpc<Result>('redream_missing');rpc(variable);rpc('dynamic_'+variable);const route={fn:'platform_server_route_missing'};`]]);
 assert.doesNotMatch(sql,/\b(?:insert|update|delete|alter|drop|create)\s+(?:table|function|into)\b/i);
 const rows=(await db.query<any>(sql)).rows;
 assert.deepEqual(rows.filter(x=>x.problem==='missing_rpc').map(x=>x.contract),['platform_server_missing','platform_server_route_missing','redream_missing']);
 assert.deepEqual(rows.filter(x=>x.problem==='exposed_server_rpc').map(x=>x.contract),['platform_server_present']);
 assert.ok(rows.some(x=>x.contract==='djm_os.interactions.player_id'));
 assert.ok(!rows.some(x=>x.contract==='dynamic_'));
 assert.ok(!rows.some(x=>x.contract==='djm_os.tasks.completed_at'));
 await db.exec('revoke all on function public.platform_server_present() from public');
 assert.equal((await db.query<any>(sql)).rows.filter(x=>x.problem==='exposed_server_rpc').length,0);
});
test('empty contract inventory cannot silently pass and caller strings are SQL escaped',()=>{
 assert.throws(()=>releaseDatabasePreflight([]),/empty release check/);
 const sql=releaseDatabasePreflight([["agent's.ts","rpc('redream_present');"]]);
 assert.ok(sql.includes("agent''s.ts"));
});
