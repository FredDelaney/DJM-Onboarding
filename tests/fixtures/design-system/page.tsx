"use client";
import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import JourneyStatus from '@/components/JourneyStatus';
import EntityActionsMenu from '@/components/EntityActionsMenu';
import {TenantRuntimeProvider} from '@/components/TenantRuntimeProvider';
import {UNRESOLVED_TENANT_RUNTIME} from '@/lib/tenant-runtime';
const runtime={...UNRESOLVED_TENANT_RUNTIME,resolved:true,tenant_id:'00000000-0000-0000-0000-000000000081',slug:'qa-design-system',branding:{...UNRESOLVED_TENANT_RUNTIME.branding,display_name:'Example Agency'}};
export default function Page(){
 const params=useSearchParams(),screen=params.get('screen')||'feedback';
 const [name,setName]=useState('Example Club'),[retry,setRetry]=useState(0);
 const rpc=async<T,>(method:string,args?:Record<string,unknown>):Promise<T>=>{
  const response=await fetch('https://example.supabase.co/rest/v1/rpc/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});
  const result=await response.json();if(!response.ok)throw new Error(result.message||'Request failed');
  if(method==='redream_entity_patch')setName(String((args?.p_patch as any)?.name||name));return result as T;
 };
 return <TenantRuntimeProvider runtime={runtime}><main data-interface="calm" style={{maxWidth:640,margin:'32px auto',padding:'0 16px','--interface-success':'#145a32','--interface-danger':'#b42318'} as any}>
 <h1>Interface checks</h1>
 {screen==='editor'?<><p>Current name: {name}</p><EntityActionsMenu kind="club" entityId="fixture-club" label="Example Club" showEdit fields={[{key:'name',label:'Club name',value:name}]} rpc={rpc} onChanged={async()=>{}}/></>:<div style={{display:'grid',gap:16}}>
 <JourneyStatus kind="loading" compact title="Loading record" description="Your saved information will appear here."/>
 <JourneyStatus kind="error" compact title="Could not load record" description="Your changes are still here." onRetry={()=>setRetry(x=>x+1)}/>
 <JourneyStatus kind="success" compact title="Changes saved" description="The update is confirmed."/>
 <JourneyStatus kind="warning" compact title="Review required" description="Check the source before sharing."/>
 <JourneyStatus kind="info" compact title="No changes yet" description="Add the first update when ready."/>
 <JourneyStatus kind="error" compact title="Retry in progress" description="Keeping your draft." onRetry={()=>setRetry(x=>x+1)} retryBusy retryLabel="Reload record"/>
 <p>Retry attempts: {retry}</p>
 </div>}
 </main></TenantRuntimeProvider>;
}
