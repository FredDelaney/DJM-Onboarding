'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { readWithDeadline } from '@/lib/read-with-deadline';
import type { Assignee, CalendarRpc } from '@/lib/calendar/tasks';
import ResponsiblePeoplePicker from './ResponsiblePeoplePicker';
import styles from './PlayerStaffControl.module.css';

type Tags = { player_id:string; all_staff:boolean; user_ids:string[]; people:Assignee[]; revision:number; can_edit:boolean };
function confirmed(value:any, playerId:string):value is Tags {
 return value?.player_id===playerId && typeof value.all_staff==='boolean' && Array.isArray(value.user_ids)
  && Array.isArray(value.people) && Number.isInteger(value.revision) && typeof value.can_edit==='boolean';
}
export default function PlayerStaffControl({playerId,scope,rpc}:{playerId:string;scope:string;rpc:CalendarRpc}) {
 const key=scope+':'+playerId;
 const current=useRef(key);current.current=key;
 const sequence=useRef(0);
 const [saved,setSaved]=useState<{key:string;value:Tags}|null>(null);
 const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [members,setMembers]=useState<Assignee[]>([]),[ids,setIds]=useState<string[]>([]),[all,setAll]=useState(false),[teamReady,setTeamReady]=useState(false);
 const value=saved?.key===key?saved.value:null;
 const load=useCallback(async()=>{
  const request=++sequence.current;setError('');
  try {
   const result=await readWithDeadline(rpc<Tags>('redream_player_staff_tags_v1',{p_player_id:playerId}));
   if(current.current!==key||request!==sequence.current)return;
   if(!confirmed(result,playerId))throw new Error('unconfirmed');
   setSaved({key,value:result});setIds(result.user_ids);setAll(result.all_staff);
  }catch{if(current.current===key&&request===sequence.current)setError('Could not load the player team.');}
 },[key,playerId,rpc]);
 useEffect(()=>{setSaved(null);setEditing(false);setBusy(false);setNotice('');setTeamReady(false);void load();return()=>{sequence.current++;};},[load]);
 async function edit(){
  if(!value||busy)return;
  const request=++sequence.current;setEditing(true);setError('');setNotice('');setTeamReady(false);setIds(value.user_ids);setAll(value.all_staff);
  try {
   const result=await readWithDeadline(rpc<any>('redream_calendar_task_assignees_v1'));
   if(current.current!==key||request!==sequence.current)return;
   if(!Array.isArray(result?.items))throw new Error('unconfirmed');
   setMembers(result.items);setTeamReady(true);
  }catch{if(current.current===key&&request===sequence.current)setError('Could not load agency staff. Try again.');}
 }
 async function save(){
  if(!value||busy||!teamReady)return;
  const request=++sequence.current;setBusy(true);setError('');
  try {
   const result=await readWithDeadline(rpc<Tags>('redream_player_staff_tags_v1',{p_player_id:playerId,p_input:{all_staff:all,user_ids:all?[]:ids},p_expected_revision:value.revision}));
   if(current.current!==key||request!==sequence.current)return;
   if(!confirmed(result,playerId))throw new Error('unconfirmed');
   setSaved({key,value:result});setEditing(false);setNotice('Player team saved.');
   window.dispatchEvent(new Event('redream:responsibilities-updated'));
  }catch(err){if(current.current===key&&request===sequence.current){
   const message=String((err as any)?.message||err);
   setError(message.includes('player_tags_conflict')?'The player team changed. Reload it before saving again.':message.includes('task_owner_inactive')?'Choose active agency staff.':message.includes('denied')?'You no longer have permission to change this team.':'Could not confirm the save. Reload the team to check.');
  }}finally{if(current.current===key&&request===sequence.current)setBusy(false);}
 }
 return <section className={styles.team} aria-label="Player team">
  <div className={styles.header}><div><h3><Users size={15} aria-hidden="true"/>Player team</h3>
   <p>Tagged staff receive this player’s updates and reminders on Home. Player access stays the same.</p></div>
   {value?.can_edit&&!editing?<button type="button" onClick={()=>void edit()}>Tag staff</button>:null}</div>
  {!value&&!error?<p role="status">Loading player team...</p>:null}
  {value&&!editing?<div className={styles.people}>{value.all_staff?<span>All staff</span>:value.people.length?value.people.map(person=><span key={person.user_id}>{person.display_name}{person.active===false?' (inactive)':''}</span>):<p>No staff tagged. Agency admins can review unassigned players.</p>}</div>:null}
  {editing?<div className={styles.editor}>
   <label className={styles.all}><input type="checkbox" checked={all} disabled={busy||!teamReady} onChange={event=>setAll(event.target.checked)}/><span>All staff<small>Includes staff who join the agency later.</small></span></label>
   {!all&&teamReady?<ResponsiblePeoplePicker label="Tagged staff" members={members} selected={ids} knownPeople={value?.people} onChange={setIds} disabled={busy}/>:null}
   {!teamReady&&!error?<p role="status">Loading agency staff...</p>:null}
   <p>Tasks keep their own responsible people.</p>
   <div className={styles.actions}><button type="button" disabled={busy} onClick={()=>{sequence.current++;setEditing(false);setError('');}}>Cancel</button><button type="button" data-ui-button="primary" disabled={busy||!teamReady} onClick={()=>void save()}>{busy?'Saving...':'Save team'}</button></div>
  </div>:null}
  {error?<div className={styles.error} role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={()=>{setEditing(false);void load();}}>Reload team</button>{editing&&!teamReady?<button type="button" onClick={()=>void edit()}>Retry staff</button>:null}</div>:null}
  {notice?<p role="status">{notice}</p>:null}
 </section>;
}
