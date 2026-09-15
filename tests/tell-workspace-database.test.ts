import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

// Real PostgreSQL engine with structure-only repository tables. No network or customer data.
const db = new PGlite({ extensions: { pg_trgm } });
const migration = readFileSync('supabase/migrations/20260915192303_tell_capture_workspace_boundary.sql', 'utf8');
const tenant = readFileSync('supabase/migrations/20260913103355_tenantize_tell_djm_and_agency_workspaces.sql', 'utf8');
const core = readFileSync('supabase/migrations/20260913101801_enforce_core_tenant_isolation.sql', 'utf8');
const schema = readFileSync('supabase/staging/bootstrap/001_application_schema.sql', 'utf8');
const uid = '10000000-0000-4000-8000-000000000001';
const djm = '20000000-0000-4000-8000-000000000001';
const north = '20000000-0000-4000-8000-000000000002';
const foreignOrg = '30000000-0000-4000-8000-000000000001';
const ownOrg = '30000000-0000-4000-8000-000000000002';
let northCapture: string;
let djmCapture: string;
function definition(source: string, name: string) {
  const result = source.match(new RegExp(`create or replace function ${name.replaceAll('.', '\\.')}\\([\\s\\S]*?\\n\\$\\$;`));
  assert.ok(result, name);
  return result[0];
}
async function value(sql: string, args: unknown[] = []) {
  return Object.values((await db.query(`select ${sql}`, args)).rows[0])[0] as any;
}
async function workspace(slug: string | null = 'northstar') {
  await db.query("select set_config('request.headers',$1,false)", [JSON.stringify(slug === null ? {} : { 'x-redream-workspace': slug })]);
}
async function enqueue() {
  return value("public.djm_tell_enqueue_capture(gen_random_uuid(),'text',null,'A synthetic test note')");
}
before(async () => {
  await db.exec(`create schema auth; create schema private; create schema djm_os; create schema platform; create schema extensions; create schema storage;
    create table storage.objects(bucket_id text,name text,created_at timestamptz);
    create role anon; create role authenticated; create role service_role bypassrls;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
    create table platform.tenants(id uuid primary key,slug text unique,status text);
    create table platform.tenant_memberships(tenant_id uuid,user_id uuid,status text,role text,is_primary boolean);
    create extension pg_trgm with schema extensions;`);
  const tables = ['public.players','public.notification_outbox','public.career_entries', ...['captures','people','organisations','employments','relationships','interactions','tasks','claims','club_needs','player_matches','player_market_facts','events','review_items','notifications','scouting_prospects','scouting_reports','tell_djm_permissions','tell_djm_actions','tell_djm_questions','tell_djm_aliases','tell_djm_settings','team_members'].map(t => `djm_os.${t}`)];
  for (const table of tables) {
    const ddl = schema.match(new RegExp(`create table ${table.replace('.', '\\.')} \\([\\s\\S]*?\\n\\);`));
    assert.ok(ddl, table);
    await db.exec(ddl[0]);
    if (!['djm_os.team_members','djm_os.tell_djm_settings'].includes(table)) await db.exec(`alter table ${table} add column tenant_id uuid;`);
    const pk = ['djm_os.tell_djm_permissions','djm_os.team_members'].includes(table) ? 'user_id' : 'id';
    if (table !== 'djm_os.player_market_facts') await db.exec(`alter table ${table} add primary key (${pk});`);
  }
  // Actual unique indexes used by the capture lifecycle.
  await db.exec(`create unique index on djm_os.captures(submitted_by,client_capture_id) where client_capture_id is not null;
    create unique index on djm_os.tell_djm_actions(capture_id,action_hash);
    create unique index on djm_os.review_items(capture_id,review_type);
    create unique index on djm_os.relationships(team_member_id,person_id);
    create unique index on djm_os.player_matches(club_need_id,player_id);
    create unique index on djm_os.tell_djm_aliases(entity_type,entity_id,normalised_alias,owner_user_id);
    create unique index on djm_os.scouting_prospects(canonical_key) where canonical_key is not null;
    create unique index on djm_os.scouting_reports(source_key);
    create unique index on djm_os.notifications(fingerprint) where fingerprint is not null;`);
  for (const name of ['user_has_active_tenant_membership','user_has_staff_tenant_access','primary_active_tenant_id','merge_tenant_candidate','assign_core_operational_tenant']) await db.exec(definition(core, `private.${name}`));
  await db.exec(definition(tenant, 'private.workspace_entity_tenant'));
  await db.exec(definition(tenant, 'private.user_has_tell_djm_full'));
  for (const table of ['captures','people','organisations','relationships','interactions','tasks','club_needs','player_matches']) await db.exec(`create trigger assign_core_operational_tenant before insert or update on djm_os.${table} for each row execute function private.assign_core_operational_tenant()`);
  for (const [file,name] of [
    ['004_djm_os_functions_03_41-60.sql','position_matches_player'],
    ['004_djm_os_functions_02_21-40.sql','has_eu_passport'],
    ['004_djm_os_functions_04_61-80.sql','registration_fit_score'],
    ['004_djm_os_functions_01_01-20.sql','club_need_match_trigger'],
  ]) {
    const source=readFileSync(`supabase/staging/bootstrap/${file}`,'utf8');
    const match=source.match(new RegExp(`CREATE OR REPLACE FUNCTION djm_os.${name}\\([\\s\\S]*?\\$function\\$;`));
    assert.ok(match,name);
    await db.exec(match[0]);
  }
  await db.exec("create table platform.feature_catalog(feature_key text primary key,category text); insert into platform.feature_catalog values ('ai_assistant','ai'),('speech_transcription','speech');");
  const ledger=readFileSync('supabase/migrations/20260904135443_create_usage_and_ai_ledgers.sql','utf8');
  for(const table of ['usage_events','ai_usage_events']) {
    const ddl=ledger.match(new RegExp(`create table platform.${table} \\([\\s\\S]*?\\n\\);`));
    assert.ok(ddl); await db.exec(ddl[0]);
  }
  await db.exec('create unique index on platform.usage_events(tenant_id,feature_key,idempotency_key) where idempotency_key is not null; create unique index on platform.ai_usage_events(tenant_id,external_request_id) where external_request_id is not null;');
  await db.exec(definition(readFileSync('supabase/migrations/20260904135738_create_server_only_platform_api.sql','utf8'),'public.platform_server_record_usage'));
  await db.exec(definition(readFileSync('supabase/migrations/20260904135944_add_metered_authorization_and_ai_recording.sql','utf8'),'public.platform_server_record_ai_usage'));
  for(const [file,name] of [
    ['20260912101815_repair_tell_djm_ai_usage_ledger.sql','djm_tell_worker_store_plan'],
    ['20260912102454_avoid_typed_tell_djm_speech_telemetry.sql','djm_tell_worker_store_transcript'],
  ]) {
    const source=readFileSync('supabase/migrations/'+file,'utf8');
    const ddl=source.match(new RegExp(`create or replace function public.${name}\\([\\s\\S]*?\\n\\$function\\$;`));
    assert.ok(ddl,name); await db.exec(ddl[0]);
  }
  await db.exec(migration);
  await db.exec(readFileSync('supabase/migrations/20260915194224_redream_ai_canonical_api.sql','utf8'));
  await db.exec('create trigger trg_djm_need_match_refresh after insert or update on djm_os.club_needs for each row execute function djm_os.club_need_match_trigger()');
  for (const table of ['tell_djm_permissions','tell_djm_actions','tell_djm_questions','tell_djm_aliases','claims','employments','events','review_items','notifications','scouting_prospects','scouting_reports']) await db.exec(`create trigger assign_workspace_tenant before insert or update on djm_os.${table} for each row execute function private.assign_workspace_tenant()`);
  // Minimal infrastructure helpers outside this slice, with no outbound integrations.
  await db.exec(`create function djm_os.normalise_need_position(text) returns text language sql immutable as $$ select $1 $$;
    create function private.djm_queue_push(uuid,text,text,text,text,jsonb,text) returns void language sql as $$ select $$;
    grant usage on schema djm_os,private,platform,auth to authenticated,service_role;
    grant all on all tables in schema djm_os,public to authenticated,service_role;
    grant execute on function private.user_has_staff_tenant_access(uuid,uuid),private.primary_active_tenant_id(uuid),private.merge_tenant_candidate(uuid,uuid,text) to authenticated,service_role;`);
  await db.query("select set_config('test.user',$1,false)", [uid]);
  await db.query('insert into platform.tenants values ($1,$2,$3),($4,$5,$3)', [djm,'djm-sports-management','active',north,'northstar']);
  await db.query("insert into platform.tenant_memberships values ($1,$3,'active','admin',true),($2,$3,'active','admin',false)",[djm,north,uid]);
  await db.query("insert into djm_os.team_members(user_id,display_name) values ($1,'Synthetic Member')",[uid]);
  await db.query("insert into djm_os.tell_djm_permissions(tenant_id,user_id,permission_scope,is_enabled) values ($1,$3,'full',true),($2,$3,'full',true)",[djm,north,uid]);
  await db.exec('insert into djm_os.tell_djm_settings(id,is_live) values (1,true)');
  await db.query("insert into djm_os.organisations(id,tenant_id,name,organisation_type) values ($1,$2,'Identical Club','club'),($3,$4,'Identical Club','club')",[foreignOrg,djm,ownOrg,north]);
  await workspace();
  northCapture = (await enqueue()).capture_id;
  await workspace(null);
  djmCapture = (await enqueue()).capture_id;
  await workspace();
});
after(async () => { await db.close(); });

test('explicit workspace wins over primary; legacy enqueue retains primary', async () => {
  assert.equal(await value('tenant_id from djm_os.captures where id=$1',[northCapture]),north);
  assert.equal(await value('tenant_id from djm_os.captures where id=$1',[djmCapture]),djm);
});
test('permissions are independent and access resolves the requested tenant', async () => {
  await workspace();
  assert.equal((await value('public.djm_tell_current_access()')).tenant_id,north);
  await db.query('update djm_os.tell_djm_permissions set is_enabled=false where tenant_id=$1',[north]);
  assert.equal((await value('public.djm_tell_current_access()')).enabled,false);
  await assert.rejects(enqueue);
  await workspace(null);
  assert.equal((await value('public.djm_tell_current_access()')).enabled,true);
  await db.query('update djm_os.tell_djm_permissions set is_enabled=true where tenant_id=$1',[north]);
  await workspace();
});
test('vocabulary and identical-name resolution stay inside the capture tenant', async () => {
  await db.query("insert into djm_os.organisations(tenant_id,name,organisation_type) values ($1,'DJM secret club','club')",[djm]);
  const vocab = await value('public.djm_tell_capture_vocabulary(120,$1)',[northCapture]);
  assert.ok(!vocab.clubs.includes('DJM secret club'));
  const resolved = await value("public.djm_tell_capture_resolve_entity($1,'club','Identical Club',null)",[northCapture]);
  assert.equal(resolved.resolved_id,ownOrg);
  assert.ok(resolved.candidates.every((c: any) => c.entity_id!==foreignOrg));
});
test('recent captures exclude the other agency', async () => {
  await workspace();
  const recent = await value('public.djm_tell_recent_captures(20)');
  assert.ok(recent.some((c: any) => c.id===northCapture));
  assert.ok(recent.every((c: any) => c.id!==djmCapture));
});
for (const operation of ['receipt','retry_capture','delete_capture']) test(`cross-workspace ${operation} is denied before mutation`,async () => {
  await workspace();
  await assert.rejects(() => value(`public.djm_tell_${operation}($1)`,[djmCapture]),/Capture access denied/);
  assert.equal(await value('status from djm_os.captures where id=$1',[djmCapture]),'queued');
});
test('question answers and undo cannot target another workspace',async () => {
  const question = await value("public.djm_tell_record_question($1,'entity:club:test','Choose','ambiguous','[]')",[djmCapture]);
  await assert.rejects(() => value("public.djm_tell_answer_question($1,'{}')",[question]),/Capture access denied/);
  const action = await db.query<{id:string}>("insert into djm_os.tell_djm_actions(tenant_id,capture_id,action_hash,action_index,action_type,status,undo_supported) values ($1,$2,'undo',0,'create_task','applied',true) returning id",[djm,djmCapture]);
  await assert.rejects(() => value('public.djm_tell_undo_action($1)',[action.rows[0].id]),/Capture access denied/);
});
for (const [type,payload,table] of [
  ['create_task',{title:'Synthetic follow-up'},'tasks'],
  ['log_interaction',{summary:'Synthetic conversation'},'interactions'],
] as const) test(`unlinked ${type} explicitly inherits Northstar`,async () => {
  const result = await value('public.djm_tell_apply_action($1,$2,0,$3,1,$4,$5)',[northCapture,type,type,'synthetic evidence',payload]);
  assert.equal(result.status,'applied',JSON.stringify(result));
  assert.equal(await value(`tenant_id from djm_os.${table} where id=$1`,[result.target_id]),north);
});
test('one-tap club and contact creation preserve tenant through related rows',async () => {
  const club = await value("public.djm_tell_create_confirmed_club($1,'New Synthetic Club',null)",[northCapture]);
  assert.equal(await value('tenant_id from djm_os.organisations where id=$1',[club.entity_id]),north);
  const contact = await value("public.djm_tell_create_confirmed_contact($1,'Synthetic Contact',$2,'Director')",[northCapture,club.entity_id]);
  for (const table of ['people','employments','relationships']) assert.equal(await value(`tenant_id from djm_os.${table} where ${table==='people'?'id':'person_id'}=$1`,[contact.entity_id]),north);
});
test('foreign entity payloads fail without creating a cross-linked task',async () => {
  const result = await value("public.djm_tell_apply_action($1,'foreign',0,'create_task',1,'evidence',$2)",[northCapture,{title:'Forbidden',organisation_id:foreignOrg}]);
  assert.equal(result.status,'failed');
  assert.equal(await value("count(*)::int from djm_os.tasks where title='Forbidden'"),0);
  await assert.rejects(() => value("public.djm_tell_enqueue_capture(gen_random_uuid(),'text',null,'note','voice_debrief',null,$1)",[foreignOrg]),/Capture reference denied/);
});
test('forged UUID, unknown slug and ambiguous legacy membership fail closed',async () => {
  for (const slug of [djm,'unknown-agency','']) {
    await workspace(slug);
    await assert.rejects(enqueue,/Workspace access denied/);
  }
  await db.exec('update platform.tenant_memberships set is_primary=false');
  await workspace(null);
  await assert.rejects(enqueue,/Workspace access denied/);
  await db.query('update platform.tenant_memberships set is_primary=true where tenant_id=$1',[djm]);
  await workspace();
});
test('read-only Tell access permits receipt but prevents mutation',async () => {
  await db.query("update djm_os.tell_djm_permissions set permission_scope='read_only' where tenant_id=$1",[north]);
  assert.ok(await value('public.djm_tell_receipt($1)',[northCapture]));
  await assert.rejects(() => value('public.djm_tell_retry_capture($1)',[northCapture]),/Capture access denied/);
  await db.query("update djm_os.tell_djm_permissions set permission_scope='full' where tenant_id=$1",[north]);
});
test('authenticated direct capture reads cannot cross the requested workspace',async () => {
  await db.exec(`alter table djm_os.captures enable row level security;
    create policy fixture_staff_select on djm_os.captures for select to authenticated using (private.user_has_staff_tenant_access(tenant_id));
    set role authenticated;`);
  try {
    assert.equal(await value('count(*)::int from djm_os.captures where id=$1',[djmCapture]),0);
    assert.equal(await value('count(*)::int from djm_os.captures where id=$1',[northCapture]),1);
  } finally { await db.exec('reset role'); }
});

test('Northstar answer and alias persist without conflict with primary membership',async () => {
  await workspace();
  const candidate = {entity_type:'club',entity_id:ownOrg,label:'Identical Club',score:1};
  const question = await value("public.djm_tell_record_question($1,'entity:club:alias','Choose club','ambiguous',$2,$3)",[northCapture,[candidate],{spoken_name:'our club'}]);
  assert.equal(await value('tenant_id from djm_os.tell_djm_questions where id=$1',[question]),north);
  const answered = await value('public.djm_tell_answer_question($1,$2)',[question,candidate]);
  assert.equal(answered.capture_id,northCapture);
  assert.equal(await value("tenant_id from djm_os.tell_djm_aliases where normalised_alias='our club'"),north);
  const resolved = await value("public.djm_tell_capture_resolve_entity($1,'club','our club',null)",[northCapture]);
  assert.equal(resolved.resolved_id,ownOrg);
});
test('foreign candidates, parents and client-supplied resolutions are rejected',async () => {
  await assert.rejects(() => value("public.djm_tell_record_question($1,'x','Choose','ambiguous',$2)",[northCapture,[{entity_type:'club',entity_id:foreignOrg}]]),/Capture reference denied/);
  await assert.rejects(() => value("public.djm_tell_enqueue_capture(gen_random_uuid(),'text',null,'note','typed_debrief',null,null,null,'{}',null,$1)",[djmCapture]),/Capture reference denied/);
  await assert.rejects(() => value("public.djm_tell_enqueue_capture(gen_random_uuid(),'text',null,'note','typed_debrief',null,null,null,$1)",[{resolutions:[]}]),/Capture context denied/);
});
test('revoked membership is denied even while Tell permission remains enabled',async () => {
  await db.query("update platform.tenant_memberships set status='inactive' where tenant_id=$1",[north]);
  try {
    await assert.rejects(enqueue,/Workspace access denied/);
    assert.equal(await value('public.djm_tell_user_can_process($1,$2)',[uid,northCapture]),false);
  } finally { await db.query("update platform.tenant_memberships set status='active' where tenant_id=$1",[north]); }
});
test('capture-bound worker stays Northstar after primary membership changes',async () => {
  await workspace(null);
  const resolved = await value("public.djm_tell_capture_resolve_entity($1,'club','Identical Club',null)",[northCapture]);
  assert.equal(resolved.resolved_id,ownOrg);
  await workspace();
});
test('claims, club needs, player matches and review items inherit capture ownership',async () => {
  const player = '40000000-0000-4000-8000-000000000002';
  await db.query("insert into public.players(id,tenant_id,first_name,last_name) values ($1,$2,'Synthetic','Player')",[player,north]);
  for (const [type,payload,table] of [
    ['add_claim',{organisation_id:ownOrg,claim_value:'Synthetic requirement'},'claims'],
    ['upsert_club_need',{organisation_id:ownOrg,position:'CM'},'club_needs'],
    ['suggest_player',{organisation_id:ownOrg,player_id:player,position:'CM'},'player_matches'],
  ] as const) {
    const result=await value('public.djm_tell_apply_action($1,$2,0,$2,1,$3,$4)',[northCapture,type,'synthetic evidence',payload]);
    assert.equal(result.status,'applied',JSON.stringify(result));
    assert.equal(await value(`tenant_id from djm_os.${table} where id=$1`,[result.target_id]),north);
  }
  const review=await value("public.djm_tell_apply_action($1,'review',0,'create_task',0.1,'uncertain',$2)",[northCapture,{title:'Needs review'}]);
  assert.equal(review.status,'needs_review');
  assert.equal(await value('tenant_id from djm_os.review_items where capture_id=$1',[northCapture]),north);
  assert.equal(await value("count(*)::int from djm_os.events where payload->>'capture_id'=$1 and tenant_id<>$2",[northCapture,north]),0);
});
test('audio source cannot reference another tenant; retention understands both layouts',async () => {
  await assert.rejects(() => value("public.djm_tell_enqueue_capture(gen_random_uuid(),'audio',$1)",[`djm-network-captures/${djm}/${uid}/tell/2026-09-15/foreign.webm`]),/Capture recording access denied/);
  await db.query("insert into storage.objects values ('djm-network-captures',$1,now()-interval '9 days'),('djm-network-captures',$2,now()-interval '9 days')",[`${north}/${uid}/tell/2026-09-01/new.webm`,`${uid}/tell-djm/2026-09-01/old.webm`]);
  assert.equal((await value('public.djm_tell_orphan_audio_cleanup_due(50)')).length,2);
});
test('worker resolver and mutation grants are service-only',async () => {
  for (const name of [
    'public.djm_tell_capture_resolve_entity(uuid,text,text,text)',
    'public.djm_tell_capture_vocabulary(integer,uuid)',
    'public.djm_tell_apply_action(uuid,text,integer,text,numeric,text,jsonb)',
    'public.djm_tell_worker_claim(uuid,text)',
  ]) {
    assert.equal(await value("has_function_privilege('authenticated',$1,'execute')",[name]),false,name);
    assert.equal(await value("has_function_privilege('service_role',$1,'execute')",[name]),true,name);
  }
});

test('triggered club-need matching never scores or inserts another tenant player',async () => {
  await db.query("insert into public.players(tenant_id,first_name,last_name,primary_position) values ($1,'Foreign','Midfielder','CM'),($2,'Own','Midfielder','CM')",[djm,north]);
  const need=await value('id from djm_os.club_needs where tenant_id=$1 limit 1',[north]);
  await value('djm_os.refresh_need_matches($1)',[need]);
  assert.equal(await value('count(*)::int from djm_os.player_matches m join public.players p on p.id=m.player_id where m.club_need_id=$1 and p.tenant_id<>$2',[need,north]),0);
  assert.ok(await value('count(*)::int from djm_os.player_matches where club_need_id=$1',[need])>0);
});

test('scout observation writes prospect, report and action inside Northstar',async () => {
  const result=await value("public.djm_tell_apply_scout_observation($1,'scout-safe',0,1,'synthetic observation',$2)",[northCapture,{player_name:'Synthetic New Prospect',position:'CM'}]);
  assert.equal(result.status,'applied',JSON.stringify(result));
  assert.equal(await value('tenant_id from djm_os.scouting_prospects where id=$1',[result.prospect_id]),north);
  assert.equal(await value('tenant_id from djm_os.scouting_reports where id=$1',[result.target_id]),north);
});
test('worker claim returns capture tenant and tenant-specific permissions under service role',async () => {
  await db.query("update djm_os.captures set status='queued',next_attempt_at=now() where id=$1",[northCapture]);
  await workspace(null);
  await db.exec('set role service_role');
  try {
    const claimed=await value("public.djm_tell_worker_claim($1,'synthetic-test')",[northCapture]);
    assert.equal(claimed.tenant_id,north);
    assert.equal(claimed.permission_scope,'full');
  } finally { await db.exec('reset role'); await workspace(); }
});

test('canonical API and compatibility aliases share one implementation and identical grants', async () => {
  await workspace();
  assert.deepEqual(await value('public.redream_ai_current_access()'),await value('public.djm_tell_current_access()'));
  const aliases=await db.query<{proname:string;prosrc:string}>("select proname,prosrc from pg_proc where pronamespace='public'::regnamespace and proname like 'djm_tell_%' and prolang=(select oid from pg_language where lanname='sql')");
  assert.ok(aliases.rows.length>20);
  for(const row of aliases.rows) assert.match(row.prosrc,/^select public\.redream_ai_\w+\(/,row.proname);
  for(const role of ['anon','authenticated','service_role']) for(const suffix of ['current_access()','worker_claim(uuid,text)']) {
    assert.equal(await value(`has_function_privilege('${role}','public.djm_tell_${suffix}','execute')`),await value(`has_function_privilege('${role}','public.redream_ai_${suffix}','execute')`));
  }
  await assert.rejects(()=>value('public.redream_ai_receipt($1)',[djmCapture]),/Capture access denied/);
});
test('legacy link recovery resolves stored tenant but rejects a conflicting workspace or revoked member',async()=>{
  await workspace(null);
  assert.equal(await value('public.redream_ai_capture_workspace($1)',[northCapture]),'northstar');
  await workspace('djm-sports-management');
  await assert.rejects(()=>value('public.redream_ai_capture_workspace($1)',[northCapture]),/Capture access denied/);
  await workspace();
  await db.query("update platform.tenant_memberships set status='inactive' where tenant_id=$1",[north]);
  try { await assert.rejects(()=>value('public.redream_ai_capture_workspace($1)',[northCapture]),/Capture access denied/); }
  finally {await db.query("update platform.tenant_memberships set status='active' where tenant_id=$1",[north]);}
});
test('activation evidence excludes transcripts and undone actions and stays tenant-scoped',async()=>{
  const activation=readFileSync('supabase/migrations/20260915194621_redream_ai_activation_evidence.sql','utf8');
  await db.exec(definition(activation,'private.ai_first_value'));
  await workspace();
  const capture=(await enqueue()).capture_id;
  await db.query('update djm_os.captures set completed_at=now() where id=$1',[capture]);
  const before=await value('capture_count from private.ai_first_value($1)',[north]);
  const foreignBefore=await value('capture_count from private.ai_first_value($1)',[djm]);
  const action=await value("public.redream_ai_apply_action($1,'activation-proof',0,'create_task',1,'A sourced instruction',$2)",[capture,{title:'Call synthetic player'}]);
  assert.equal(action.status,'applied');
  assert.equal(await value('capture_count from private.ai_first_value($1)',[north]),before+1);
  assert.equal(await value('capture_count from private.ai_first_value($1)',[djm]),foreignBefore);
  await db.query("update djm_os.tell_djm_actions set status='undone' where capture_id=$1",[capture]);
  assert.equal(await value('capture_count from private.ai_first_value($1)',[north]),before);
});
test('new notification function emits workspace capture deep links',async()=>{
  const source=await value("pg_get_functiondef('public.redream_ai_notify_attention(uuid)'::regprocedure)");
  assert.match(source,/\/workspace\/.*\/capture\?capture=/);
  assert.doesNotMatch(source,/\/tell\?workspace=/);
});

test('worker plan writes successful AI spend to the central ledger using stored capture tenant',async()=>{
  await workspace('djm-sports-management');
  const usage={interpretation_model:'synthetic-model',interpretation_cost_usd:0.0123,interpretation_ms:125,input_tokens:45,output_tokens:12};
  await value('public.redream_ai_worker_store_plan($1,$2,$3,$4)',[northCapture,'Synthetic sourced note',{},usage]);
  await value('public.djm_tell_worker_store_plan($1,$2,$3,$4)',[northCapture,'Synthetic sourced note',{},usage]);
  const rows=await db.query<any>('select * from platform.ai_usage_events where source_fingerprint=$1',[northCapture]);
  assert.equal(rows.rows.length,1,'legacy/canonical retries must not duplicate cost');
  assert.equal(rows.rows[0].tenant_id,north);
  assert.equal(rows.rows[0].model,'synthetic-model');
  assert.equal(rows.rows[0].latency_ms,125);
  assert.equal(Number(rows.rows[0].input_tokens),45);
  assert.equal(Number(rows.rows[0].estimated_cost_micros),12300);
  assert.equal(rows.rows[0].status,'succeeded');
  await workspace();
});
