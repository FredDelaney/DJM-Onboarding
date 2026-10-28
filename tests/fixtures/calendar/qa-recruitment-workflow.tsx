import {useCallback,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import AgencyPlayersWorkspace from '@/components/AgencyPlayersWorkspace';
import {tenantBrandCssVariables} from '@/lib/tenant-brand-style';
import styles from '@/components/AgencyOperatingWorkspace.module.css';
const second='30000000-0000-4000-8000-000000000002';
const basePath='/qa-recruitment-workflow';
const theme=tenantBrandCssVariables({primary:'#155e59',accent:'#a58a52'});
export function getServerSideProps({query}:{query:Record<string,string>}){return {props:{readonly:query.readonly==='1',role:query.role||'owner'}};}
export default function Page({readonly,role}:{readonly:boolean;role:string}){
 const router=useRouter();
 const [data,setData]=useState<any>({directory:{},recruitment:{items:[]}});
 const call=useCallback(async<T,>(action:string,body:Record<string,unknown>={}):Promise<T>=>{
  const response=await fetch('https://example.supabase.co/functions/v1/recruitment-fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,body})});
  const value=await response.json();if(!response.ok)throw new Error(value.error||'Request failed');return value;
 },[]);
 const refresh=useCallback(async()=>{await call('fixture_refresh');setData(await call('recruitment_board'));},[call]);
 useEffect(()=>{void refresh();},[refresh]);
 return <main className={styles.root} data-interface="calm" style={{...theme,display:'block',padding:16}}>
  <AgencyPlayersWorkspace theme={theme} stateScope="qa-agency:qa-user" canManageRecords={!readonly&&role==='owner'} canWorkRecruitment={!readonly} canPromoteRecruitment={!readonly&&role!=='operations'} canCreateRecords={!readonly} data={data} basePath={basePath} invoke={call} rpc={call} onRefresh={refresh} onOpenAction={()=>{}}/>
  <button type="button" onClick={()=>router.push(basePath+'?view=players&tab=recruitment&target='+second)}>Open another prospect</button>
 </main>;
}
