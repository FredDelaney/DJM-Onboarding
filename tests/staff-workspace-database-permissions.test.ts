import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {before,after,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const tenant=id(1),foreign=id(2),owner=id(11),scout=id(12),agent=id(13),reader=id(14);
const player=id(21),unassigned=id(22),foreignPlayer=id(23),task=id(31),club=id(41),person=id(51),meeting=id(61);
const migrations=['20261006120000_staff_workspace_authorization.sql','20261006120100_staff_workspace_projections.sql'];
// Execute real guarded function bodies, loaded from the latest prior migrations.
function latestFunction(name:string){
 if(name==='public.platform_server_action_history')return readFileSync('tests/fixtures/staff-permissions-action-history.sql','utf8');
 let definition='';
 for(const file of readdirSync('supabase/migrations').sort()){
  if(migrations.includes(file))continue;
  const sql=readFileSync('supabase/migrations/'+file,'utf8');
  const pattern=new RegExp('create(?:\\s+or\\s+replace)?\\s+function\\s+'+name.replaceAll('.','\\.')+'\\s*\\(','ig');
  for(const match of sql.matchAll(pattern)){
   const rest=sql.slice(match.index);
   const body=/\bas\s+(\$[a-zA-Z_]*\$)/i.exec(rest);if(!body)continue;
   const end=rest.indexOf(body[1],body.index+body[0].length);if(end<0)continue;
   definition=rest.slice(0,end+body[1].length)+';';
  }
 }
 assert.ok(definition,'Real definition required: '+name);return definition;
}
async function identity(user:string,role='authenticated'){
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.headers',$2,false)",[user,JSON.stringify({'x-redream-workspace':'agency'})]);
 await db.exec('set role '+role);
}
async function row(sql:string,args:any[]=[]){return (await db.query(sql,args)).rows[0] as any;}
async function denied(work:()=>Promise<any>,pattern=/agency_admin_access_required|proposal_access_denied|row-level security/){await assert.rejects(work,pattern);}
before(async()=>{
 await db.exec(readFileSync('tests/fixtures/staff-permissions-bootstrap.sql','utf8'));
 for(const name of ['private.user_has_staff_tenant_access','private.user_is_tenant_admin','private.user_is_player_tenant_admin','private.can_staff_view_player','private.can_staff_edit_player','private.redream_request_tenant','private.platform_server_assert_agency_operator'])await db.exec(latestFunction(name));
 for(const table of ['deal_rooms','club_needs','player_market_facts','player_evidence','player_performance_snapshots']){
  await db.exec('alter table djm_os.'+table+' enable row level security');
  for(const op of table==='player_market_facts'?['select']:['select','insert','update','delete']){
   const prefix=['deal_rooms','club_needs'].includes(table)?'tenant_staff':'djm_team';
   await db.exec('create policy '+prefix+'_'+op+' on djm_os.'+table+' for '+op+' to authenticated '+(op!=='insert'?'using(true) ':'')+(['insert','update'].includes(op)?'with check(true)':''));
  }
 }
 const targets=new Set<string>();
 for(const file of migrations)for(const match of readFileSync('supabase/migrations/'+file,'utf8').matchAll(/patch_staff_boundary\('public\.([a-z0-9_]+)\(/g))targets.add('public.'+match[1]);
 for(const name of targets)await db.exec(latestFunction(name));
 await db.exec(latestFunction('public.redream_entity_delete'));
 await db.exec(readFileSync('tests/fixtures/staff-permissions-dependencies.sql','utf8'));
 for(const name of targets){
  const sig=(await row("select oid::regprocedure::text sig from pg_proc where proname=$1",[name.split('.')[1]])).sig;
  if(name.includes('platform_server_'))await db.exec('revoke all on function '+sig+' from public,anon,authenticated;grant execute on function '+sig+' to service_role;');
  else await db.exec('revoke all on function '+sig+' from public,anon;grant execute on function '+sig+' to authenticated;');
 }
 if(process.env.STAFF_PREREQUISITE_STAGE==='1'){
  await db.exec('alter table djm_os.messaging_threads drop column bound_player_id');
  for(const sig of ['redream_opportunity_connected_context(integer)','djm_entity_archive_v1(text,uuid,boolean)','djm_entity_patch_v1(text,uuid,jsonb)','redream_messaging_player_candidates()','redream_messaging_thread_bind_player(text,text,uuid)','redream_entity_action_preview(text,uuid)','redream_entity_archives()'])await db.exec('drop function public.'+sig);
  await db.exec(readFileSync('tests/fixtures/staff-permissions-legacy-deletes.sql','utf8'));
 }
 const modernBefore=(await row("select pg_get_functiondef('public.redream_autopilot_home(integer)'::regprocedure) d")).d;
 await db.exec(readFileSync('supabase/migrations/20261006115900_staff_boundary_prerequisites.sql','utf8'));
 assert.equal((await row("select pg_get_functiondef('public.redream_autopilot_home(integer)'::regprocedure) d")).d,modernBefore,'Prerequisites overwrote unrelated modern work');
 if(process.env.STAFF_BOUNDARY_BASELINE!=='1')for(const file of migrations)await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
});
after(()=>db.close());

test('private mirrors and commercial tables deny every restricted staff role across tenants',async()=>{
 for(const user of [scout,agent,reader]){
  await identity(user);
  for(const table of ['player_market_facts','deal_rooms','club_needs'])assert.equal((await row('select count(*)::int n from djm_os.'+table)).n,0,table);
  assert.equal((await db.query('update djm_os.deal_rooms set expected_commission=900 returning id')).rows.length,0);
  assert.equal((await db.query('delete from djm_os.club_needs returning id')).rows.length,0);
  await denied(()=>db.query('insert into djm_os.deal_rooms(id,tenant_id,expected_commission) values($1,$2,999)',[id(99),tenant]));
 }
});
test('administrator scope follows the actual tenant, including admin-primary/scout-secondary',async()=>{
 await identity(owner);
 assert.equal((await row('select count(*)::int n from djm_os.player_market_facts')).n,1);
 assert.equal((await row('select count(*)::int n from djm_os.deal_rooms')).n,1);
 assert.equal((await db.query('update djm_os.deal_rooms set expected_commission=110 where tenant_id=$1 returning id',[tenant])).rows.length,1);
 assert.equal((await db.query('update djm_os.deal_rooms set expected_commission=999 where tenant_id=$1 returning id',[foreign])).rows.length,0);
});
test('assigned football evidence remains readable and only assigned editors can write',async()=>{
 for(const table of ['player_evidence','player_performance_snapshots']){
  await identity(reader);
  assert.equal((await row('select count(*)::int n from djm_os.'+table)).n,1);
  assert.equal((await db.query('update djm_os.'+table+' set value_json=$1 returning id',[{apps:15}])).rows.length,0);
  await denied(()=>db.query('insert into djm_os.'+table+'(player_id,value_json) values($1,$2)',[unassigned,{}]));
  await identity(agent);
  assert.equal((await db.query('update djm_os.'+table+' set value_json=$1 where player_id=$2 returning id',[{apps:15},player])).rows.length,1);
  await denied(()=>db.query('insert into djm_os.'+table+'(player_id,value_json) values($1,$2)',[foreignPlayer,{}]));
 }
});
test('public commercial wrappers deny before loading privileged context',async()=>{
 await identity(scout);
 for(const sql of [
  'select redream_autopilot_players(20)','select redream_autopilot_market(20)','select redream_autopilot_deals(20)',
  'select redream_autopilot_clubs(20)','select redream_autopilot_operations(90,20)',
  "select redream_player_service('"+player+"')","select redream_deal_war_room('"+id(71)+"')",
  'select redream_opportunity_connected_context(20)',"select redream_market_create_dossier_draft('"+player+"')"
 ])await denied(()=>db.query(sql),/agency_admin_access_required/);
});
test('direct lifecycle, deletion and assignment RPCs deny wrong-role mutations and preserve admin assignment',async()=>{
 await identity(scout);
 await denied(()=>db.query('select djm_entity_archive_v1($1,$2,true)',['player',unassigned]),/permission denied/);
 await denied(()=>db.query('select djm_entity_patch_v1($1,$2,$3)',['player',unassigned,{first_name:'Overwrite'}]),/permission denied/);
 await denied(()=>db.query('select djm_assign_player($1,$2)',[unassigned,scout]));
 for(const call of ['select redream_entity_archives()','select redream_entity_action_preview($1,$2)']){
  await denied(()=>db.query(call,call.includes('$1')?['player',unassigned]:[]));
 }
 await identity(scout,'service_role');
 await denied(()=>db.query('select djm_entity_archive_v1($1,$2,true)',['player',unassigned]));
 await denied(()=>db.query('select djm_entity_patch_v1($1,$2,$3)',['player',unassigned,{first_name:'Overwrite'}]));
 await identity(owner,'service_role');
 await denied(()=>db.query('select djm_delete_preview($1,$2)',['player',foreignPlayer]));
 await denied(()=>db.query('select djm_delete_entity($1,$2,true)',['club',id(42)]));
 await identity(owner);
 await denied(()=>db.query('select djm_delete_preview($1,$2)',['player',foreignPlayer]),/permission denied/);
 await denied(()=>db.query('select redream_entity_action_preview($1,$2)',['player',foreignPlayer]));
 await denied(()=>db.query('select redream_entity_delete($1,$2,true)',['club',id(42)]));
 await db.query('select djm_assign_player($1,$2)',[unassigned,agent]);
 assert.equal((await row('select primary_staff_user_id from public.players where id=$1',[unassigned])).primary_staff_user_id,agent);
});
test('own task prepare/execute/undo is permitted; wrong actor, commercial type and reassignment are denied',async()=>{
 await identity(agent,'service_role');
 const p=(await row('select platform_server_prepare_command_action($1,$2,$3) p',[tenant,'task:'+task,agent])).p;
 assert.equal(p.action_type,'complete_task');
 await db.query('select platform_server_execute_agency_action($1,$2)',[p.proposal_id,agent]);
 await denied(()=>db.query('select platform_server_undo_agency_action($1,$2)',[p.proposal_id,scout]),/proposal_access_denied/);
 await db.query('select platform_server_undo_agency_action($1,$2)',[p.proposal_id,agent]);
 await db.query('insert into platform.agency_action_proposals(id,tenant_id,action_type,target_type,target_id,requested_by,proposed_payload) values($1,$2,$3,$4,$5,$6,$7)',[id(101),tenant,'assign_deal_owner','deal_room',id(71),owner,{}]);
 await identity(scout,'service_role');
 await denied(()=>db.query('select platform_server_undo_agency_action($1,$2)',[id(101),scout]),/proposal_access_denied/);
 await identity(owner);
 await db.query('update djm_os.tasks set owner_user_id=$1 where id=$2',[owner,task]);
 await identity(agent,'service_role');
 await denied(()=>db.query('select platform_server_execute_agency_action($1,$2)',[p.proposal_id,agent]),/proposal_access_denied/);
 assert.equal((await row('select platform_server_action_history($1,$2,20) h',[tenant,agent])).h.length,0);
 await identity(owner);
 await db.query('update djm_os.tasks set owner_user_id=$1 where id=$2',[agent,task]);
});
test('restricted Home, Network, contact, club and owned meeting/calendar skip private DTO retrieval',async()=>{
 await identity(agent);
 const home=(await row('select redream_autopilot_home(8) value')).value;
 assert.equal(home.access.restricted,true);assert.doesNotMatch(JSON.stringify(home),/SECRET_/);
 const network=(await row('select redream_autopilot_relationships(100,250) value')).value;
 assert.equal(network.accounts.clubs[0].name,'Recorded Club');assert.doesNotMatch(JSON.stringify(network),/SECRET_|FOREIGN_/);
 const contact=(await row('select redream_relationship_person($1) value',[person])).value;
 assert.equal(contact.reach.email.value,'contact@example.test');
 assert.equal(contact.employment.employment_id,id(91));
 assert.equal(contact.employment.verification_state,'not_verified');
 assert.equal(contact.external_profiles.transfermarkt.url,'https://www.transfermarkt.com/contact');
 assert.equal(contact.person.full_name,'Recorded Contact');assert.doesNotMatch(JSON.stringify(contact),/SECRET_/);
 const clubRead=(await row('select redream_club_account($1) value',[club])).value;
 assert.equal(clubRead.club.name,'Recorded Club');assert.equal(clubRead.access.restricted,true);
 await identity(agent,'service_role');
 const brief=(await row('select platform_server_meeting_brief($1,$2,$3) value',[tenant,agent,meeting])).value;
 assert.equal(brief.meeting.title,'Own meeting');assert.equal(brief.access.restricted,true);assert.doesNotMatch(JSON.stringify(brief),/SECRET_/);
 await identity(agent);
 const calendar=(await row('select redream_autopilot_calendar(90,100) value')).value;
 assert.doesNotMatch(JSON.stringify(calendar),/SECRET_/);assert.ok(JSON.stringify(calendar).includes('Own meeting'));
 const range=(await row("select redream_calendar_range(current_date,current_date+30,'UTC') value")).value;
 assert.ok(JSON.stringify(range).includes('Own meeting'));assert.doesNotMatch(JSON.stringify(range),/SECRET_/);
});
test('permitted contact writes return only shared identity and actor-owned activity',async()=>{
 await identity(agent,'service_role');
 for(const sql of [
  "select platform_server_relationship_update_route($1,$2,$3,40::smallint,50::smallint,60::smallint,'Own route') value",
  "select platform_server_relationship_record_interaction($1,$2,$3,'email','Own conversation',now()) value",
  "select platform_server_relationship_add_work($1,$2,$3,'followup','Own new follow-up',now()) value"
 ]){
  const value=(await row(sql,[tenant,agent,person])).value;
  assert.equal(value.access.restricted,true);
  assert.equal(value.relationship_memory.best_route.notes,'Own route');
  assert.doesNotMatch(JSON.stringify(value),/SECRET_|SHADOW_PLAYER/);
 }
 await identity(agent);
 await denied(()=>db.query('select redream_relationship_person($1)',[id(53)]),/contact_not_found/);
 assert.doesNotMatch(JSON.stringify((await row('select redream_autopilot_relationships(100,250) value')).value),/SHADOW_PLAYER/);
});
test('messaging candidates and thread binding enforce assigned active players',async()=>{
 await identity(agent);
 const candidates=(await row('select redream_messaging_player_candidates() value')).value;
 assert.deepEqual(candidates.players.map((x:any)=>x.player_id),[player]);
 await denied(()=>db.query('select redream_messaging_thread_bind_player($1,$2,$3)',['instagram','own-thread',unassigned]),/player_not_found/);
 const bound=(await row('select redream_messaging_thread_bind_player($1,$2,$3) value',['instagram','own-thread',player])).value;
 assert.equal(bound.bound_player_id,player);
});
test('creating and promoting new players assigns their creator without granting access to existing duplicates',async()=>{
 await identity(agent,'service_role');
 const created=(await row('select platform_server_agency_create_player($1,$2,$3,null,$4,$5) value',[tenant,agent,'BrandNew','CM','New FC'])).value;
 assert.equal((await row('select can_edit from public.staff_player_access where staff_user_id=$1 and player_id=$2',[agent,created.player_id])).can_edit,true);
 await denied(()=>db.query('select platform_server_agency_create_player($1,$2,$3,$4,$5,$6)',[tenant,agent,'Unassigned','Football','CM','Other FC']),/workspace_access_denied/);
 const promoted=(await row('select platform_server_recruitment_promote_player($1,$2,$3) value',[tenant,agent,id(93)])).value;
 assert.equal((await row('select can_edit from public.staff_player_access where staff_user_id=$1 and player_id=$2',[agent,promoted.player_id])).can_edit,true);
});
test('new projections and existing action server RPCs remain uncallable by browser roles',async()=>{
 await identity(owner);
 for(const sig of ['public.platform_server_staff_network(uuid,uuid,integer,integer)','public.platform_server_staff_club_identity(uuid,uuid,uuid)','public.platform_server_staff_contact(uuid,uuid,uuid)','public.platform_server_execute_agency_action(uuid,uuid)']){
  const p=await row("select has_function_privilege('authenticated',$1,'execute') a,has_function_privilege('anon',$1,'execute') b,has_function_privilege('service_role',$1,'execute') s",[sig]);
  assert.deepEqual(p,{a:false,b:false,s:true});
 }
});
