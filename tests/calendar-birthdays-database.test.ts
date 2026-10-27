import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const tenant = '20000000-0000-4000-8000-000000000001';
const otherTenant = '20000000-0000-4000-8000-000000000002';
const user = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const contact = '30000000-0000-4000-8000-000000000001';
async function value(sql: string, params: any[] = []): Promise<any> {
  return Object.values((await db.query(`select ${sql}`, params)).rows[0])[0];
}
before(async () => {
  await db.exec(`create schema auth; create schema private; create schema platform; create schema djm_os;
    create role anon; create role authenticated; create role service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
    create table platform.tenants(id uuid primary key,status text);
    create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text);
    create table public.profiles(id uuid,display_name text);
    create table public.players(id uuid,tenant_id uuid,preferred_name text,first_name text,last_name text,date_of_birth date,football_status text,archived_at timestamptz);
    create table djm_os.people(id uuid,tenant_id uuid,full_name text,preferred_name text,archived_at timestamptz);
    create table djm_os.team_members(user_id uuid,is_active boolean);
    create table djm_os.organisations(id uuid,tenant_id uuid,name text);
    create table djm_os.club_needs(id uuid,tenant_id uuid,organisation_id uuid);
    create table djm_os.meetings(id uuid,tenant_id uuid,owner_user_id uuid,title text,starts_at timestamptz,ends_at timestamptz,timezone text,provider text,meeting_url text,status text,person_id uuid,organisation_id uuid);
    create table djm_os.tasks(id uuid,tenant_id uuid,owner_user_id uuid,title text,due_at timestamptz,task_type text,priority text,source text,player_id uuid,club_need_id uuid,person_id uuid,organisation_id uuid,status text);
    create function public.redream_autopilot_operations(integer,integer) returns jsonb language sql as $$ select '{"deadlines":{"items":[]}}'::jsonb $$;
    insert into djm_os.team_members values ('${user}',true),('${other}',true);
    insert into djm_os.meetings(id,tenant_id,owner_user_id,title,starts_at,status) values
      (gen_random_uuid(),'${tenant}','${user}','Midnight meeting','2026-10-03 22:30:00+00','scheduled'),
      (gen_random_uuid(),'${tenant}','${other}','Private colleague meeting','2026-10-03 22:30:00+00','scheduled'),
      (gen_random_uuid(),'${otherTenant}','${user}','Other tenant meeting','2026-10-03 22:30:00+00','scheduled');
    create table platform.audit_events(tenant_id uuid,actor_user_id uuid,actor_kind text,action text,entity_type text,entity_id text,before_state jsonb,after_state jsonb,metadata jsonb);
    create function private.user_has_staff_tenant_access(t uuid,u uuid) returns boolean language sql stable as $$ select exists(select 1 from platform.tenant_memberships where tenant_id=t and user_id=u and status='active' and role in ('owner','admin','agent','scout','operations')) $$;
    create function private.user_is_tenant_admin(t uuid,u uuid) returns boolean language sql stable as $$ select exists(select 1 from platform.tenant_memberships where tenant_id=t and user_id=u and status='active' and role in ('owner','admin')) $$;
    create function private.redream_request_tenant() returns uuid language sql stable as $$ select '${tenant}'::uuid $$;
    insert into platform.tenants values ('${tenant}','active'),('${otherTenant}','active');
    insert into platform.tenant_memberships values ('${tenant}','${user}','active','owner'),('${tenant}','${other}','active','agent');
    insert into public.profiles values ('${user}','Jesse'),('${other}','Staff member');
    insert into djm_os.people values ('${contact}','${tenant}','Club contact',null,null);
    insert into public.players values ('40000000-0000-4000-8000-000000000001','${tenant}',null,'Signed','Player','2004-02-29','active',null),
    ('40000000-0000-4000-8000-000000000002','${otherTenant}',null,'Foreign','Player','2004-02-29','active',null),
    ('40000000-0000-4000-8000-000000000003','${tenant}',null,'Archived','Player','2004-02-29','active',now());
  `);
  await value("set_config('test.user',$1,false)", [user]);
  await db.exec(readFileSync('supabase/migrations/20261004095924_calendar_birthdays_v3.sql','utf8'));
  // Reconstruct the installed October staff projection without replaying unrelated functions.
  const original = await value("pg_get_functiondef('public.redream_calendar_range(date,date,text)'::regprocedure)");
  const patch = readFileSync('supabase/migrations/20261006120100_staff_workspace_projections.sql','utf8');
  const boundary = patch.slice(patch.indexOf("select pg_temp.patch_staff_boundary('public.redream_calendar_range"));
  const parts = [...boundary.matchAll(/\$boundary\$([\s\S]*?)\$boundary\$/g)];
  assert.ok(original.includes(parts[0][1]));
  await db.exec(original.replace(parts[0][1],parts[1][1]));
  assert.equal(await value("md5(prosrc) from pg_proc where oid='public.redream_calendar_range(date,date,text)'::regprocedure"),'8df71af6543a18b6adb65c29ae5affba');
  await db.exec(readFileSync('supabase/migrations/20261025124547_preserve_calendar_active_followups.sql','utf8'));

});
after(() => db.close());
test('recorded birthdays recur with leap-day handling and no foreign or archived players', async () => {
  const result = await value("public.redream_calendar_birthdays('2027-02-01','2027-03-01',false,null)");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].date_at, '2027-02-28');
  assert.equal(result.items[0].turns_age, 23);
  const leap = await value("public.redream_calendar_birthdays('2028-02-01','2028-03-01',false,null)");
  assert.equal(leap.items[0].date_at, '2028-02-29');
});
test('club contacts are optional and may have no birth year', async () => {
  await value('public.redream_birthday_save($1,$2,12,31,null,true,null)', ['contact',contact]);
  const hidden = await value("public.redream_calendar_birthdays('2026-12-01','2027-01-01',false,null)");
  assert.equal(hidden.items.length, 0);
  const shown = await value("public.redream_calendar_birthdays('2026-12-01','2027-01-01',true,null)");
  assert.equal(shown.items[0].title, "Club contact's birthday");
  assert.equal(shown.items[0].turns_age, null);
});
test('only staff themselves can edit their birthday and unshared staff birthdays stay private', async () => {
  await assert.rejects(() => value('public.redream_birthday_save($1,$2,10,4,null,true,null)', ['staff',other]), /birthday_edit_denied/);
  await value('public.redream_birthday_save($1,$2,10,4,1995,false,null)', ['staff',user]);
  assert.equal((await value("public.redream_calendar_birthdays('2026-10-01','2026-11-01',true,null)")).items.length, 0);
  await value('public.redream_birthday_save($1,$2,10,4,1995,true,null)', ['staff',user]);
  const result = await value("public.redream_calendar_birthdays('2026-10-01','2026-11-01',true,null)");
  assert.equal(result.items[0].title, "Jesse's birthday");
  assert.equal(result.items[0].turns_age, null); // Never disclose staff ages to the team.
});
test('month reads respect local midnight and personal meeting ownership', async () => {
  const result = await value("public.redream_calendar_range('2026-10-04','2026-10-05','Europe/Rome')");
  assert.deepEqual(result.meetings.items.map((item: any)=>item.title), ['Midnight meeting']);
  const next = await value("public.redream_calendar_range('2026-10-05','2026-10-06','Europe/Rome')");
  assert.equal(next.meetings.items.length, 0);
  await assert.rejects(()=>value("public.redream_calendar_range('2026-10-04','2026-10-05','Made/Up')"), /timezone_invalid/);
});
test('Calendar keeps owned open and in-progress follow-ups while excluding terminal, undated, future, colleague and foreign tasks', async()=>{
 await db.exec('begin');
 try {
  const expected:string[]=[];
  for(const status of ['open','in_progress','completed','done','cancelled']){
   const id=await value("gen_random_uuid()");
   await db.query("insert into djm_os.tasks(id,tenant_id,owner_user_id,title,due_at,status) values($1,$2,$3,$4,now()-interval '2 days',$5)",[id,tenant,user,'Same title',status]);
   if(['open','in_progress'].includes(status))expected.push(id);
  }
  for(const [t,u,due] of [[otherTenant,user,'now()'],[tenant,other,'now()'],[tenant,user,'null'],[tenant,user,"now()+interval '2 days'"]]){
   await db.query("insert into djm_os.tasks(id,tenant_id,owner_user_id,title,due_at,status) values(gen_random_uuid(),$1,$2,'Excluded follow-up',"+due+",'in_progress')",[t,u]);
  }
  const before=(await db.query('select * from djm_os.tasks order by id')).rows;
  for(const zone of ['UTC','Europe/Rome','America/Los_Angeles']){
   const result=await value('public.redream_calendar_range(current_date,current_date+1,$1)',[zone]);
   assert.deepEqual(result.follow_ups.items.map((x:any)=>x.task_id).sort(),expected.sort());
   assert.ok(result.follow_ups.items.every((x:any)=>x.title==='Same title'));
  }
  assert.deepEqual((await db.query('select * from djm_os.tasks order by id')).rows,before);
  await db.query("update platform.tenant_memberships set status='ended' where user_id=$1",[user]);
  await assert.rejects(()=>value("public.redream_calendar_range(current_date,current_date+1,'UTC')"),/active_tenant_staff_required/);
 }finally{await db.exec('rollback');}
});
test('the active-follow-up repair preserves function identity/grants/data, replays safely and refuses unknown readers', async()=>{
 const target='public.redream_calendar_range(date,date,text)';
 const metadata=()=>value('jsonb_build_object(\'oid\',oid,\'owner\',proowner,\'acl\',proacl,\'config\',proconfig,\'definer\',prosecdef) from pg_proc where oid=$1::regprocedure',[target]);
 const before=await metadata();const data=(await db.query('select * from djm_os.tasks order by id')).rows;
 const repair=readFileSync('supabase/migrations/20261025124547_preserve_calendar_active_followups.sql','utf8');
 const original=await value('pg_get_functiondef($1::regprocedure)',[target]);
 await db.exec(repair);await db.exec(repair);
 assert.deepEqual(await metadata(),before);assert.deepEqual((await db.query('select * from djm_os.tasks order by id')).rows,data);
 for(const role of ['anon','authenticated','service_role'])assert.equal(await value("has_function_privilege($1,$2,'execute')",[role,target]),role!=='anon');
 try{
  await db.exec(original.replace('begin','begin\n -- unknown future reader'));
  await assert.rejects(()=>db.exec(repair),/differs from the reviewed active-work baseline/);
 }finally{await db.exec(original);}
});
test('foreign workspaces, player actors, invalid dates and direct table access are denied', async () => {
  await assert.rejects(() => value('public.redream_calendar_birthdays($1,$2,true,$3)', ['2026-10-01','2026-11-01',otherTenant]), /Workspace access denied/);
  await assert.rejects(() => value('public.redream_birthday_save($1,$2,2,30,null,true,null)', ['contact',contact]), /date|birthday/i);
  await db.exec(`set role authenticated`);
  await assert.rejects(() => db.query('select * from platform.agency_birthdays'), /permission denied/);
  await db.exec('reset role');
  await db.exec(`update platform.tenant_memberships set role='player' where user_id='${user}'`);
  await assert.rejects(() => value("public.redream_calendar_birthdays('2026-10-01','2026-11-01',true,null)"), /Workspace access denied/);
});
