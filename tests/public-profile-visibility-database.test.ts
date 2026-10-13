import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {profileDatabase,identity,id} from './helpers/public-profile-fixtures.ts';
let db:any;
before(async()=>{db=await profileDatabase();});after(async()=>{await db?.close();});
const rows=async()=> (await db.query('select player_id from public.player_public_profiles order by player_id')).rows.map((r:any)=>r.player_id);
test('anonymous callers cannot select raw published profile content',async()=>{
 await identity(db,'','anon');await assert.rejects(rows(),/permission denied/);
});
for(const [name,user,want] of [
 ['own player',16,[21]],['assigned scout',12,[21]],['same-tenant owner',11,[21,22]],['foreign-tenant owner',15,[23]],['unrelated signed-in user',17,[]]
] as const)test(name+' reads only authorised raw profiles',async()=>{await identity(db,id(user));assert.deepEqual(await rows(),want.map(id));});
test('revoked assignment and suspended membership remove scout reads immediately',async()=>{
 await identity(db,id(12));assert.deepEqual(await rows(),[id(21)]);
 await db.exec('reset role');await db.query('delete from public.staff_player_access where staff_user_id=$1',[id(12)]);await identity(db,id(12));assert.deepEqual(await rows(),[]);
 await db.exec('reset role');await db.query('insert into public.staff_player_access values($1,$2,false)',[id(12),id(21)]);
 await db.query("update platform.tenant_memberships set status='inactive' where user_id=$1",[id(12)]);await identity(db,id(12));assert.deepEqual(await rows(),[]);
 await db.exec('reset role');await db.query("update platform.tenant_memberships set status='active' where user_id=$1",[id(12)]);
});
test('tenant admin edits remain allowed while own-player and scout writes stay denied',async()=>{
 await identity(db,id(11));assert.equal((await db.query("update public.player_public_profiles set headline='Approved edit' where player_id=$1 returning player_id",[id(21)])).rows.length,1);
 for(const user of [12,16,17,15]){await identity(db,id(user));assert.equal((await db.query("update public.player_public_profiles set headline='Unapproved' where player_id=$1 returning player_id",[id(21)])).rows.length,0);}
 await identity(db,id(16));const value=(await db.query('select headline from public.player_public_profiles where player_id=$1',[id(21)])).rows[0];assert.equal(value.headline,'Approved edit');
});
test('unpublished own-player drafts remain readable without public raw access',async()=>{
 await db.exec('reset role');await db.query('update public.player_public_profiles set published=false where player_id=$1',[id(21)]);
 await identity(db,id(16));assert.deepEqual(await rows(),[id(21)]);await identity(db,id(17));assert.deepEqual(await rows(),[]);
});
