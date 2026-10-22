// Read-only release check. Run the emitted SQL against each intended database.
// Check actual callable contracts: older staging bootstrap timestamps differ.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function releaseDatabasePreflight(files){
 const callers=new Map();
 for(const [path,source] of files){
  // Direct calls and the existing declarative route table are both contracts.
  const patterns=[/\b(?:rpc|platformRpc)(?:<[^>]*>)?\(\s*["']([a-z][a-z0-9_]+)["']\s*(?=[,)])/g,/\bfn\s*:\s*["']([a-z][a-z0-9_]+)["']\s*(?=[,}])/g];
  for(const pattern of patterns)for(const match of source.matchAll(pattern)){
   const paths=callers.get(match[1])||new Set();paths.add(path);callers.set(match[1],paths);
  }
 }
 const quote=value=>"'"+value.replaceAll("'","''")+"'";
 const rows=[...callers].sort(([a],[b])=>a.localeCompare(b)).map(([name,paths])=>`(${quote(name)},${quote([...paths].sort().join(', '))})`);
 if(!rows.length)throw new Error('No RPC contracts found; refusing an empty release check');
 return `-- READ ONLY. Zero rows means these static contracts are present, not that every workflow was exercised.
-- Treat each result as a release review item. Retired workers must be removed deliberately, not ignored.
with expected(name,callers) as (values\n${rows.join(',\n')}),
missing as (
 select 'missing_rpc'::text as problem,e.name as contract,e.callers as detail
 from expected e where not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=e.name)
), server_grants as (
 select 'exposed_server_rpc',e.name,e.callers
 from expected e join pg_catalog.pg_proc p on p.proname=e.name join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and e.name like 'platform_server_%'
 and (pg_catalog.has_function_privilege('anon',p.oid,'execute') or pg_catalog.has_function_privilege('authenticated',p.oid,'execute'))
), columns_expected(schema_name,table_name,column_name) as (values
 ('djm_os','captures','prospect_id'),('djm_os','interactions','player_id'),('djm_os','interactions','prospect_id'),
 ('djm_os','tasks','owner_user_id'),('djm_os','tasks','completed_at'),('public','players','profile_photo_path'),
 ('platform','calendar_tasks','responsible_user_ids'),('platform','work_responsibilities','responsible_user_ids')),
missing_columns as (
 select 'missing_column',schema_name||'.'||table_name||'.'||column_name,'Required by linked work, communication or player workflows'
 from columns_expected e where not exists(select 1 from information_schema.columns c where c.table_schema=e.schema_name and c.table_name=e.table_name and c.column_name=e.column_name)
)
select * from missing union all select * from server_grants union all select * from missing_columns order by problem,contract;\n`;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const paths=execFileSync('rg',['--files','app','components','lib','supabase/functions'],{encoding:'utf8'}).trim().split('\n').filter(path=>/\.(ts|tsx)$/.test(path));
 process.stdout.write(releaseDatabasePreflight(paths.map(path=>[path,readFileSync(path,'utf8')])));
}
