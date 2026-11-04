'use client';

import {Check, ChevronDown, LoaderCircle, Pencil, Search, ShieldCheck, UserRound, X} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {friendlyError} from '@/lib/platform-client';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {writeWithDeadline} from '@/lib/write-with-deadline';
import styles from './PlayerLeadAgentControl.module.css';

type Member={user_id:string;display_name:string};
type Lead={user_id:string;name:string}|null;
type Response={player_id:string;primary_agent:Lead;members:Member[];can_edit:boolean;saved:boolean};
type Rpc=<T,>(name:string,args?:Record<string,unknown>,signal?:AbortSignal)=>Promise<T>;
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word.charAt(0).toUpperCase()).join('');
function valid(result:any,id:string):result is Response{
 return result?.player_id===id && (result.primary_agent===null||(
  typeof result.primary_agent?.user_id==='string'&&typeof result.primary_agent?.name==='string'
 )) && Array.isArray(result.members)&&typeof result.can_edit==='boolean';
}
export default function PlayerLeadAgentControl({playerId,scope,rpc,onChanged}:{
 playerId:string;scope:string;rpc:Rpc;onChanged?:()=>Promise<void>;
}){
 const key=scope+':'+playerId;
 const current=useRef(key);current.current=key;
 const sequence=useRef(0);
 const mounted=useRef(true);
 const [record,setRecord]=useState<{key:string;value:Response}|null>(null);
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const [draft,setDraft]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [unconfirmed,setUnconfirmed]=useState(false);
 const trigger=useRef<HTMLButtonElement>(null);
 const input=useRef<HTMLInputElement>(null);
 const value=record?.key===key?record.value:null;
 const currentId=value?.primary_agent?.user_id||null;
 const changed=value&&draft!==currentId;
 const load=useCallback(async()=>{
  const request=++sequence.current;setError('');
  try{
   const response=await readWithDeadline(rpc<Response>('redream_player_lead_agent_v1',{p_player_id:playerId}));
   if(!mounted.current||current.current!==key||request!==sequence.current)return false;
   if(!valid(response,playerId))throw new Error('Unconfirmed player ownership read.');
   setRecord({key,value:response});
   setDraft(response.primary_agent?.user_id||null);
   setUnconfirmed(false);
   return true;
  }catch(cause){
   if(mounted.current&&current.current===key&&request===sequence.current)setError(friendlyError(cause));
   return false;
  }
 },[key,playerId,rpc]);
 useEffect(()=>{
  mounted.current=true;setRecord(null);setOpen(false);setNotice('');setUnconfirmed(false);
  void load();
  return()=>{mounted.current=false;sequence.current++;};
 },[load]);
 useEffect(()=>{if(open)input.current?.focus();},[open]);
 const close=()=>{if(busy||unconfirmed)return;setOpen(false);setQuery('');setError('');trigger.current?.focus();};
 const save=async()=>{
  if(!value?.can_edit||!changed||busy||unconfirmed)return;
  const request=++sequence.current;setBusy(true);setError('');setNotice('');
  try{
   const pending=await writeWithDeadline(async signal=>{
    try{return {value:await rpc<Response>('redream_player_lead_agent_v1',{
     p_player_id:playerId,p_new_agent_id:draft,p_save:true,p_expected_agent_id:currentId,
    },signal)};}catch(cause){return {error:cause};}
   },12000);
   if(!mounted.current||current.current!==key||request!==sequence.current)return;
   if(pending.status==='unknown'){
    setUnconfirmed(true);setError('The save could not be confirmed. Reload the agent assignment before another change.');
    return;
   }
   if('error' in pending.result){setError(friendlyError(pending.result.error));return;}
   const response=pending.result.value;
   if(!valid(response,playerId)||!response.saved||(response.primary_agent?.user_id||null)!==draft){
    setUnconfirmed(true);setError('The saved agent could not be verified. Reload the assignment.');
    return;
   }
   setRecord({key,value:response});setDraft(response.primary_agent?.user_id||null);
   setOpen(false);setQuery('');setNotice('Lead agent saved.');
   void onChanged?.().catch(()=>undefined);
  }catch(cause){
   if(mounted.current&&current.current===key&&request===sequence.current)setError(friendlyError(cause));
  }finally{
   if(mounted.current&&current.current===key&&request===sequence.current)setBusy(false);
  }
 };
 const filtered=(value?.members||[]).filter(member=>member.display_name.toLowerCase().includes(query.trim().toLowerCase()));
 const selectedName=value?.primary_agent?.name||'No lead assigned';
 return <section className={styles.root} aria-label="Lead agent">
  <div className={styles.title}><span><UserRound size={17}/> Lead agent</span>{value?.can_edit?<button type="button" ref={trigger} aria-label="Manage lead agent" aria-expanded={open} onClick={()=>{if(open){close();return;}setDraft(currentId);setNotice('');setError('');setQuery('');setOpen(true);}} disabled={busy||unconfirmed}><Pencil size={17}/></button>:null}</div>
  {value?<div className={styles.person}><span className={styles.avatar}>{initials(selectedName)||'?'}</span><strong>{selectedName}</strong>{value.primary_agent?<span className={styles.active}>Accountable owner</span>:null}</div>:<div className={styles.loading}>{error?'Lead agent unavailable':'Loading lead agent...'}</div>}
  {!value&&error?<button type="button" className={styles.retry} onClick={()=>void load()}>Try again</button>:null}
  {notice?<p className={styles.notice} role="status">{notice}</p>:null}
  {open&&value?<div className={styles.popover} role="group" aria-label="Manage lead agent">
   <div className={styles.popoverHeading}><strong>MANAGE LEAD AGENT</strong><button type="button" aria-label="Close agent picker" disabled={busy||unconfirmed} onClick={close}><X size={17}/></button></div>
   <label className={styles.search}><Search size={15}/><input ref={input} aria-label="Search agents" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search agents..."/></label>
   <div className={styles.options} role="listbox" aria-label="Available agents">
    <button type="button" role="option" aria-selected={draft===null} className={styles.option} disabled={busy||unconfirmed} onClick={()=>setDraft(null)}><span className={styles.avatar}><UserRound size={15}/></span><span>Unassigned</span>{draft===null?<Check size={17}/>:null}</button>
    {filtered.map(member=><button type="button" role="option" aria-selected={draft===member.user_id} key={member.user_id} className={styles.option} disabled={busy||unconfirmed} onClick={()=>setDraft(member.user_id)}><span className={styles.avatar}>{initials(member.display_name)}</span><span>{member.display_name}</span>{draft===member.user_id?<Check size={17}/>:null}</button>)}
    {!filtered.length?<p className={styles.empty}>No matching agents.</p>:null}
   </div>
   {error?<p role="alert" className={styles.error}>{error}</p>:null}
   <p className={styles.explain}><ShieldCheck size={13}/> A newly assigned lead receives player access. Existing access remains unchanged.</p>
   <div className={styles.footer}>{unconfirmed?<button type="button" onClick={async()=>{if(await load()){setOpen(false);setNotice('Agent details reloaded.');}}} disabled={busy}>Reload assignment</button>:<><button type="button" onClick={close} disabled={busy}>Cancel</button><button type="button" className={styles.primary} onClick={()=>void save()} disabled={busy||!changed}>{busy?<LoaderCircle size={15}/>:<Check size={15}/>} {busy?'Saving...':'Save agent'}</button></>}</div>
  </div>:null}
 </section>;
}
