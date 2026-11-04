'use client';

import {Check, LoaderCircle, Pencil, Plus, Search, Users, X} from 'lucide-react';
import {createPortal} from 'react-dom';
import {useCallback,useEffect,useRef,useState} from 'react';
import {publicFile} from '@/lib/supabase';
import {friendlyError} from '@/lib/platform-client';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {writeWithDeadline} from '@/lib/write-with-deadline';
import styles from './PlayerTeamAgentsControl.module.css';

export type PlayerAgent={user_id:string;name:string;avatar_path?:string|null;is_lead?:boolean};
type TeamResponse={
 player_id:string;assigned_agents:PlayerAgent[];
 available_agents:PlayerAgent[];user_ids:string[];lead_agent_id:string|null;
 revision:number;can_edit:boolean;saved:boolean;
};
type Rpc=<T,>(name:string,args?:Record<string,unknown>,signal?:AbortSignal)=>Promise<T>;
const initials=(value:string)=>value.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('');
function valid(value:any,id:string):value is TeamResponse {
 return value?.player_id===id&&Array.isArray(value.assigned_agents)&&Array.isArray(value.available_agents)
  &&Array.isArray(value.user_ids)&&Number.isInteger(value.revision)
  &&typeof value.can_edit==='boolean'
  &&value.assigned_agents.every((person:any)=>typeof person?.user_id==='string'&&typeof person?.name==='string');
}
function Avatar({person}:{person:PlayerAgent}) {
 const src=publicFile('player-public',person.avatar_path||null);
 return <span className={styles.avatar} title={person.name}>{src?<img src={src} loading="lazy" alt=""/>:initials(person.name)||'?'}</span>;
}
export default function PlayerTeamAgentsControl({
 playerId,playerName,scope,rpc,initialAgents=[],canManage,variant='table',onChanged,
}:{
 playerId:string;playerName:string;scope:string;rpc:Rpc;
 initialAgents?:PlayerAgent[];canManage:boolean;variant?:'table'|'profile';
 onChanged?:()=>Promise<void>;
}){
 const key=scope+':'+playerId;
 const current=useRef(key);current.current=key;
 const sequence=useRef(0),alive=useRef(true);
 const button=useRef<HTMLButtonElement>(null),popover=useRef<HTMLDivElement>(null),searchRef=useRef<HTMLInputElement>(null);
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const [record,setRecord]=useState<{key:string;data:TeamResponse}|null>(null);
 const [savedAgents,setSavedAgents]=useState<{key:string;agents:PlayerAgent[]}|null>(null);
 const [selected,setSelected]=useState<string[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [uncertain,setUncertain]=useState(false);
 const [position,setPosition]=useState({top:0,left:0});
 const data=record?.key===key?record.data:null;
 const agents=savedAgents?.key===key?savedAgents.agents:initialAgents;
 const effectiveIds=data?.assigned_agents.map(item=>item.user_id)||[];
 const changed=!!data&&(selected.length!==effectiveIds.length||selected.some(id=>!effectiveIds.includes(id)));
 const place=useCallback(()=>{
  if(typeof window==='undefined'||!button.current)return;
  const rect=button.current.getBoundingClientRect();
  const width=Math.min(325,window.innerWidth-24);
  const height=popover.current?.getBoundingClientRect().height||425;
  const below=rect.bottom+9;
  // Keep the editor close to the selected row, even when it must overlap the
  // row slightly to fit inside the viewport.
  const top=Math.max(12,Math.min(below,window.innerHeight-height-12));
  setPosition({top,left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12))});
 },[]);
 const load=useCallback(async()=>{
  const request=++sequence.current;
  setError('');
  try{
   const outcome=await readWithDeadline(rpc<TeamResponse>('redream_player_agents_v1',{p_player_id:playerId}));
   if(!alive.current||current.current!==key||request!==sequence.current)return false;
   if(!valid(outcome,playerId))throw new Error('Agent list could not be confirmed.');
   setRecord({key,data:outcome});
   setSavedAgents({key,agents:outcome.assigned_agents});
   setSelected(outcome.assigned_agents.map(person=>person.user_id));
   setUncertain(false);
   return true;
  }catch(cause){
   if(alive.current&&current.current===key&&request===sequence.current)setError(friendlyError(cause));
   return false;
  }
 },[key,playerId,rpc]);
 useEffect(()=>{
  alive.current=true;setOpen(false);setQuery('');setRecord(null);setSavedAgents(null);setNotice('');setUncertain(false);
  return()=>{alive.current=false;sequence.current++;};
 },[key]);
 useEffect(()=>{
  if(!open)return;
  place();
  const reposition=()=>place();
  const outside=(event:PointerEvent)=>{
   if(busy||uncertain||popover.current?.contains(event.target as Node)||button.current?.contains(event.target as Node))return;
   setOpen(false);button.current?.focus();
  };
  const escape=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!busy&&!uncertain){event.preventDefault();setOpen(false);button.current?.focus();}
  };
  window.addEventListener('resize',reposition);
  window.addEventListener('scroll',reposition,true);
  document.addEventListener('pointerdown',outside);
  document.addEventListener('keydown',escape);
  searchRef.current?.focus();
  return()=>{window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true);
   document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open,busy,uncertain,place]);
 useEffect(()=>{if(open){const frame=requestAnimationFrame(place);return()=>cancelAnimationFrame(frame);}},[open,data?.revision,data?.available_agents?.length,query,place]);
 const close=()=>{if(busy||uncertain)return;setOpen(false);setError('');setQuery('');button.current?.focus();};
 const start=()=>{
  if(!canManage)return;
  if(open){close();return;}
  setOpen(true);setNotice('');setError('');setQuery('');setUncertain(false);
  void load();
 };
 const toggle=(id:string)=>{
  if(busy||uncertain||id===data?.lead_agent_id)return;
  setSelected(ids=>ids.includes(id)?ids.filter(v=>v!==id):[...ids,id]);
 };
 const save=async()=>{
  if(!data?.can_edit||!changed||busy||uncertain)return;
  const requested=[...selected],req=++sequence.current;
  setBusy(true);setError('');setNotice('');
  try{
   const outcome=await writeWithDeadline(async signal=>{
    try{return {value:await rpc<TeamResponse>('redream_player_agents_v1',{
     p_player_id:playerId,p_input:{user_ids:requested},p_expected_revision:data.revision,
    },signal)};}catch(cause){return {error:cause};}
   },12000);
   if(!alive.current||current.current!==key||req!==sequence.current)return;
   if(outcome.status==='unknown'){
    setUncertain(true);
    setError('The save could not be confirmed. Reload this player before changing agents again.');
    return;
   }
   if('error' in outcome.result){setError(friendlyError(outcome.result.error));return;}
   const result=outcome.result.value;
   if(!valid(result,playerId)||!result.saved||
      result.assigned_agents.map(p=>p.user_id).sort().join(',')!==requested.slice().sort().join(',')){
    setUncertain(true);setError('The saved team could not be verified. Reload before changing it again.');return;
   }
   setRecord({key,data:result});setSavedAgents({key,agents:result.assigned_agents});
   setSelected(result.assigned_agents.map(p=>p.user_id));setOpen(false);setQuery('');
   setNotice('Agents updated.');
   try{await onChanged?.();}catch{setNotice('Agents saved. Refresh the roster to see the latest list.');}
  }catch(cause){if(alive.current&&current.current===key)setError(friendlyError(cause));}
  finally{if(alive.current&&current.current===key&&req===sequence.current)setBusy(false);}
 };
 const shown=(data?.available_agents||[]).filter(person=>person.name.toLowerCase().includes(query.trim().toLowerCase()));
 const selectedNames=agents.map(a=>a.name).join(', ');
 const visibleAvatars=variant==='table'?2:3;
 const label=variant==='table'?(agents.length===1?agents[0].name:agents.length?agents.length+' agents':'Add agents'):
  (agents.length?agents.length+' assigned':'No agents assigned');
 const profile = variant==='profile';
 return <span className={styles.root} data-variant={variant}>
  {profile?<span className={styles.profileHeading}><Users size={17}/> Agent Management</span>:null}
  {canManage?<button ref={button} className={styles.trigger} type="button"
   onClick={event=>{event.stopPropagation();start();}}
   aria-label={'Manage agents for '+playerName} aria-expanded={open}
   title={selectedNames||'Assign agents'} disabled={busy||uncertain}>
    {profile?<Pencil size={16}/>:<><span className={styles.stack}>{agents.slice(0,visibleAvatars).map(person=><Avatar key={person.user_id} person={person}/>)}
     {!agents.length?<span className={styles.addAvatar}><Plus size={15}/></span>:null}
     {agents.length>visibleAvatars?<span className={styles.more}>+{agents.length-visibleAvatars}</span>:null}</span>
    <span className={styles.triggerText}>{label}</span>
    <Plus size={14} className={styles.plus} aria-hidden="true"/></>}
   </button>:profile?null:<span className={styles.readOnly} aria-label={selectedNames||'No agents assigned'}>
    <span className={styles.stack}>{agents.slice(0,visibleAvatars).map(person=><Avatar key={person.user_id} person={person}/>)}
     {agents.length>visibleAvatars?<span className={styles.more}>+{agents.length-visibleAvatars}</span>:null}</span>
    <span>{label}</span>
   </span>}
  {profile?<span className={styles.profileAgents}>{agents.length?agents.map(agent=><span key={agent.user_id}><Avatar person={agent}/><span>{agent.name}{agent.is_lead?<small>Lead agent</small>:null}</span></span>):<small>No agents assigned</small>}</span>:null}
  {notice?<span className={styles.notice} role="status">{notice}</span>:null}
  {open&&typeof document!=='undefined'?createPortal(
   <div ref={popover} className={styles.popover} role="dialog" aria-label={'Manage agents for '+playerName}
    style={{top:position.top,left:position.left}} onClick={event=>event.stopPropagation()}>
    <div className={styles.heading}><strong>Manage agents</strong><button type="button" aria-label="Close agent selector" onClick={close} disabled={busy||uncertain}><X size={18}/></button></div>
    <p className={styles.subtitle}>Add teammates to {playerName}. The lead stays assigned until changed separately.</p>
    <label className={styles.search}><Search size={15}/><input ref={searchRef} type="search" aria-label="Search agents" value={query}
     onChange={event=>setQuery(event.target.value)} placeholder="Search your team..."/></label>
    <div className={styles.members} role="group" aria-label="Choose assigned agents">
     {!data&&!error?<p className={styles.loading}><LoaderCircle size={15}/> Loading agency team...</p>:null}
     {shown.map(person=><label key={person.user_id} className={styles.member} data-checked={selected.includes(person.user_id)}>
      <Avatar person={person}/><span className={styles.memberName}>{person.name}{person.user_id===data?.lead_agent_id?<small>Lead agent</small>:null}</span>
      <input type="checkbox" aria-label={person.name} checked={selected.includes(person.user_id)}
       disabled={busy||uncertain||person.user_id===data?.lead_agent_id} onChange={()=>toggle(person.user_id)}/>
     </label>)}
     {data&&!shown.length?<p className={styles.empty}>No matching active teammates. Invite them to the agency before assigning them.</p>:null}
    </div>
    {error?<p role="alert" className={styles.error}>{error}</p>:null}
    <p className={styles.note}><Users size={13}/> Team assignments give new teammates restricted player visibility. Reminder tags and edit permissions remain separate.</p>
    <div className={styles.footer}>{uncertain?<button type="button" onClick={()=>void load()} disabled={busy}>Reload team</button>:
     <><button type="button" onClick={close} disabled={busy}>Cancel</button>
      <button type="button" className={styles.save} onClick={()=>void save()} disabled={!changed||busy||!data?.can_edit}>
       {busy?'Saving...':'Save agents'}</button></>}</div>
   </div>,document.body):null}
 </span>;
}
