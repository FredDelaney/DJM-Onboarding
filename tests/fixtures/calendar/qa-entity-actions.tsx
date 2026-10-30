import {useEffect,useRef,useState} from 'react';
import EntityActionsMenu from '@/components/EntityActionsMenu';

// Local-only route, copied into pages by the existing browser fixture runner.
export default function Page(){
 const [ready,setReady]=useState(false),[scope,setScope]=useState('agency-a:actor-a'),[id,setId]=useState('record-a'),[visible,setVisible]=useState(true),[published,setPublished]=useState('Example FC');
 const state=useRef<any>({scenario:'',calls:[],refreshes:[],aborts:0,records:{'record-a':'Example FC','record-b':'Another FC'}});
 useEffect(()=>{state.current.scenario=new URLSearchParams(location.search).get('scenario')||'';(window as any).entityQa=state.current;setReady(true);return()=>{delete (window as any).entityQa;};},[]);
 const rpc=async<T,>(name:string,args:Record<string,unknown>={},signal?:AbortSignal):Promise<T>=>{
  const qa=state.current;qa.calls.push({name,args,scope});signal?.addEventListener('abort',()=>qa.aborts++,{once:true});
  if(name==='redream_entity_action_preview'){
   const result={entity_type:args.p_entity_type,entity_id:args.p_entity_id,can_delete:qa.scenario!=='protected',impact:{},delete_requires_confirmation:true};
   if(qa.scenario==='preview-hung')return await new Promise(resolve=>{qa.releasePreview=()=>resolve(result as T);});
   if(qa.scenario==='preview-failed'&&!qa.previewRetried){qa.previewRetried=true;throw new Error('Read failed');}
   return (qa.scenario==='preview-wrong-id'?{...result,entity_id:'another-record'}:result) as T;
  }
  if(qa.scenario==='denied')throw Object.assign(new Error('You do not have access to change this record.'),{code:'42501'});
  if(qa.scenario==='network')throw new Error('Failed to fetch');
  const change=name==='redream_entity_patch'?'edit':name==='redream_entity_archive'?'archive':'delete';
  const result=change==='delete'?{deleted:true,id:args.p_entity_id,entity_type:args.p_entity_type}:{ok:true,id:args.p_entity_id,entity_type:args.p_entity_type,...(change==='archive'?{archived:true}:{})};
  const complete=()=>{if(change==='edit')qa.records[String(args.p_entity_id)]=(args.p_patch as any).name;return result as T;};
  if(qa.scenario==='write-hung')return await new Promise(resolve=>{qa.releaseWrite=()=>resolve(complete());});
  complete();
  return (qa.scenario==='empty-ack'?{}:qa.scenario==='wrong-id'?{...result,id:'other-record'}:qa.scenario==='wrong-kind'?{...result,entity_type:'player'}:result) as T;
 };
 const refresh=async(change:string,signal?:AbortSignal)=>{
  const qa=state.current;qa.refreshes.push({change,scope,id});
  if(qa.scenario==='refresh-failed'&&!qa.refreshRetried){qa.refreshRetried=true;throw new Error('Refresh failed');}
  if(qa.scenario==='refresh-hung')await new Promise(resolve=>{qa.releaseRefresh=()=>resolve(undefined);});
  if(!signal?.aborted)setPublished(qa.records[id]);
 };
 return <main data-qa-ready={ready?'true':'false'} style={{fontFamily:'Arial,sans-serif',padding:20,background:'#f5f7f9',minHeight:'100vh','--agency-primary':'#16415c'} as any}>
  <h1 tabIndex={-1} id="workspace-view-heading">Record management</h1><p>Current record: {published}</p>
  {ready&&visible?<EntityActionsMenu scope={scope} kind="club" entityId={id} label={id==='record-a'?'Example FC':'Another FC'} rpc={rpc} fields={[{key:'name',label:'Club name',value:id==='record-a'?'Example FC':'Another FC'}]} onChanged={refresh}/>:null}
  <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:20}}>
   <button onClick={()=>setId(id==='record-a'?'record-b':'record-a')}>Open another record</button>
   <button onClick={()=>{setScope(scope==='agency-a:actor-a'?'agency-a:actor-b':'agency-a:actor-a');setPublished('Another account record');}}>Switch account</button>
   <button onClick={()=>setVisible(value=>!value)}>{visible?'Unmount controls':'Reopen controls'}</button>
   <button onClick={()=>state.current.releaseWrite?.()}>Release write</button>
   <button onClick={()=>state.current.releaseRefresh?.()}>Release refresh</button>
   <button onClick={()=>state.current.releasePreview?.()}>Release preview</button>
   <button onClick={()=>{state.current.scenario='';}}>Restore service</button>
  </div>
 </main>;
}
