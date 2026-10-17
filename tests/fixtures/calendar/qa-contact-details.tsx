import {useCallback,useState} from 'react';
import RecordContactActions from '@/components/RecordContactActions';
import AgencyPlayersWorkspace from '@/components/AgencyPlayersWorkspace';
import operatingStyles from '@/components/AgencyOperatingWorkspace.module.css';
export default function Page(){
 const [scope,setScope]=useState('first');
 const rpc=useCallback(async(name:string,args?:Record<string,unknown>)=>{
  const response=await fetch('https://example.supabase.co/functions/v1/contact-fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args,scope})});
  const result=await response.json();if(!response.ok)throw new Error(result.error);return result;
 },[scope]);
 return <main className={operatingStyles.root} data-interface="calm" style={{display:'block',padding:16}}>
  <button type="button" onClick={()=>setScope(scope==='first'?'second':'first')}>Switch account</button>
  {(['player','recruitment_target','contact'] as const).map(kind=><RecordContactActions key={kind} kind={kind} recordId={kind+'-fixture'} name={kind} scope={scope} rpc={rpc} />)}
 </main>;
}
