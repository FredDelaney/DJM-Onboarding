import {useState} from 'react';
import EntityActionsMenu from '@/components/EntityActionsMenu';
import WorkspaceListSearch from '@/components/WorkspaceListSearch';
export default function Page(){
 const [query,setQuery]=useState(''),[name,setName]=useState('Example Club');
 const rpc=async<T,>(method:string,args?:Record<string,unknown>):Promise<T>=>{
  const response=await fetch('https://example.supabase.co/rest/v1/rpc/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});
  const data=await response.json();if(!response.ok)throw new Error(data.message||'Could not save');return data as T;
 };
 return <main data-interface="calm" style={{maxWidth:620,padding:20,margin:'0 auto'}}>
  <h1>Usability checks</h1><WorkspaceListSearch label="Search players" placeholder="Search players" value={query} onChange={setQuery}/>
  <p role="status">{['Dylan Gardiner','James Mitchell'].filter(value=>value.toLowerCase().includes(query.toLowerCase())).length} matching players</p>
  <p>Current name: {name}</p>
  <EntityActionsMenu kind="club" entityId="fixture-club" label="Example Club" showEdit rpc={rpc} fields={[{key:'name',label:'Club name',value:name},{key:'country',label:'Country',value:'NZ'},...Array.from({length:10},(_,index)=>({key:'note_'+index,label:'Detail '+(index+1),value:''}))]} onChanged={async()=>{await rpc('fixture_refresh');setName('Updated Club');}}/>
 </main>;
}
