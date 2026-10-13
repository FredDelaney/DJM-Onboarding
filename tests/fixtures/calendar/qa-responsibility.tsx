import {useState} from 'react';
import WorkResponsibilityControl from '@/components/WorkResponsibilityControl';
const jesse='10000000-0000-4000-8000-000000000001',dapo='10000000-0000-4000-8000-000000000002';
const people=[{user_id:jesse,display_name:'Jesse'},{user_id:dapo,display_name:'Dapo'}];
let ids=[jesse],revision=0,fail=false,readCount=0;
const rpc=async<T,>(name:string,args:any={}):Promise<T>=>{
 if(typeof window!=='undefined'){const saved=sessionStorage.getItem('qa-responsibility');if(saved){const value=JSON.parse(saved);ids=value.ids;revision=value.revision;}}
 if(name==='redream_calendar_task_assignees_v1')return {items:people} as T;
 if(name!=='redream_work_responsibility_v1'||args.p_tenant_id!=='qa-tenant'||args.p_work_kind!=='task'||args.p_work_id!=='60000000-0000-4000-8000-000000000001')throw new Error('work_access_denied');
 if(args.p_user_ids){if(fail)throw new Error('task_revision_conflict');if(args.p_expected_revision!==revision)throw new Error('task_revision_conflict');ids=[...args.p_user_ids];revision++;sessionStorage.setItem('qa-responsibility',JSON.stringify({ids,revision}));}
 const result={user_ids:[...ids],people:people.filter(person=>ids.includes(person.user_id)),revision};
 if(!args.p_user_ids&&++readCount===1&&new URLSearchParams(window.location.search).has('race'))await new Promise(resolve=>setTimeout(resolve,1800));
 return result as T;
};
export default function Page(){const [saved,setSaved]=useState(0);return <main style={{margin:16,maxWidth:290,fontFamily:'Arial',padding:16,border:'1px solid #eee'}}>
 <h1>Shared reminder</h1><WorkResponsibilityControl tenantId="qa-tenant" work={{kind:'task',id:'60000000-0000-4000-8000-000000000001'}} rpc={rpc} onSaved={()=>setSaved(value=>value+1)}/>
 <p role="status">Confirmed saves: {saved}</p><button onClick={()=>{fail=!fail;}}>Toggle conflict</button>
 </main>;}
