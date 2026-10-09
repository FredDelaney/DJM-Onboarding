import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
export const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
export function latestFunction(name:string){
 let definition='';
 for(const file of readdirSync('supabase/migrations').sort()){
  if(file.endsWith('_public_profile_visibility_boundary.sql'))continue;
  const sql=readFileSync('supabase/migrations/'+file,'utf8');
  const pattern=new RegExp('create(?:\\s+or\\s+replace)?\\s+function\\s+'+name.replaceAll('.','\\.')+'\\s*\\(','ig');
  for(const match of sql.matchAll(pattern)){
   const rest=sql.slice(match.index),body=/\bas\s+(\$[a-zA-Z_]*\$)/i.exec(rest);if(!body)continue;
   const end=rest.indexOf(body[1],body.index+body[0].length);if(end<0)continue;
   definition=rest.slice(0,end+body[1].length)+';';
  }
 }
 assert.ok(definition,'Actual function definition required: '+name);return definition;
}
export function visibilityMigration(){
 const files=readdirSync('supabase/migrations').filter(f=>f.endsWith('_public_profile_visibility_boundary.sql'));
 assert.ok(files.length<=1);return files.length?readFileSync('supabase/migrations/'+files[0],'utf8'):'';
}
export async function profileDatabase(){
 const db=new PGlite();
 await db.exec(readFileSync('tests/fixtures/staff-permissions-bootstrap.sql','utf8'));
 const columns=JSON.parse(readFileSync('tests/fixtures/public-profile-tables.json','utf8'));
 for(const c of columns){
  if(c.table_schema==='public'&&c.table_name==='players'&&c.column_name!=='verified_at')continue;
  const table=c.table_schema+'.'+c.table_name;
  const exists=(await db.query('select to_regclass($1) t',[table])).rows[0] as any;
  if(!exists.t)await db.exec('create table '+table+'(qa_fixture boolean)');
  const present=(await db.query('select 1 from information_schema.columns where table_schema=$1 and table_name=$2 and column_name=$3',[c.table_schema,c.table_name,c.column_name])).rows.length;
  const type=c.data_type==='USER-DEFINED'?'text':c.data_type==='ARRAY'?({uuid:'uuid[]',text:'text[]',int4:'integer[]'} as any)[c.udt_name.slice(1)]||'text[]':c.data_type;
  if(!present)await db.exec('alter table '+table+' add column "'+c.column_name+'" '+type);
 }
 for(const name of ['private.user_has_staff_tenant_access','private.user_is_tenant_admin','private.user_is_player_tenant_admin','private.can_staff_view_player','private.can_view_player','private.player_is_currently_verified'])await db.exec(latestFunction(name));
 await db.exec('grant usage on schema public,private,auth to anon,authenticated,service_role;grant select,insert,update,delete on public.player_public_profiles to authenticated,service_role;grant select on public.player_public_profiles to anon;alter table public.player_public_profiles enable row level security;');
 await db.exec('create policy "public profiles published anon" on public.player_public_profiles for select to anon using(published=true and private.player_is_currently_verified(player_id));create policy "public profiles authenticated read" on public.player_public_profiles for select to authenticated using((published=true and private.player_is_currently_verified(player_id)) or private.can_view_player(player_id));');
 for(const op of ['insert','update','delete']){
  await db.exec('create policy "tenant admins '+op+' public profiles" on public.player_public_profiles for '+op+' to authenticated '+(op!=='insert'?'using(private.user_is_player_tenant_admin(player_id)) ':'')+(['insert','update'].includes(op)?'with check(private.user_is_player_tenant_admin(player_id))':''));
 }
 await db.exec("update public.players set verified_at=now(),verification_status='verified';insert into public.player_public_profiles(player_id,published,display_name,hidden_sections,hide_market_value) select id,true,first_name,array[]::text[],true from public.players;");
 await db.query('update public.players set user_id=$1 where id=$2',[id(16),id(21)]);
 await db.exec(latestFunction('public.get_club_share'));await db.exec(latestFunction('public.track_club_share_view'));
 await db.exec('revoke all on function public.get_club_share(uuid),public.track_club_share_view(uuid) from public,anon,authenticated;grant execute on function public.get_club_share(uuid),public.track_club_share_view(uuid) to service_role;');
 if(process.env.PUBLIC_PROFILE_BASELINE!=='1'){const sql=visibilityMigration();if(sql){await db.exec(sql);await db.exec(sql);}}
 return db;
}
export async function identity(db:PGlite,user:string,role='authenticated'){
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role '+role);
}
