'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { readWithDeadline } from '@/lib/read-with-deadline';
import { taskErrorMessage, type Assignee, type CalendarRpc } from '@/lib/calendar/tasks';
import type { WorkRef } from '@/lib/work-responsibility';
import ResponsiblePeoplePicker from './ResponsiblePeoplePicker';
import styles from './WorkResponsibilityControl.module.css';

export default function WorkResponsibilityControl({work,tenantId,rpc,onSaved}:{work:WorkRef;tenantId:string;rpc:CalendarRpc;onSaved?:()=>void}) {
 const scope=tenantId+':'+work.kind+':'+work.id;
 const [state,setState]=useState<{scope:string;people:Assignee[];ids:string[];revision:number}|null>(null);
 const [draft,setDraft]=useState<string[]>([]),[members,setMembers]=useState<Assignee[]>([]);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 const current=useRef(scope);current.current=scope;
 const requestSequence=useRef(0);
 const details=useRef<HTMLDetailsElement>(null);
 const visible=state?.scope===scope?state:null;
 const load=async()=>{
  const captured=scope,request=++requestSequence.current;setReady(false);setError('');
  try {
   const [value,team]=await Promise.all([readWithDeadline(rpc<any>('redream_work_responsibility_v1',{p_work_kind:work.kind,p_work_id:work.id,p_tenant_id:tenantId})),readWithDeadline(rpc<any>('redream_calendar_task_assignees_v1',{p_tenant_id:tenantId}))]);
   if(current.current!==captured||request!==requestSequence.current)return;
   if(!Array.isArray(value?.user_ids)||!Array.isArray(value?.people)||!Number.isInteger(value?.revision))throw new Error('Unconfirmed responsibility');
   setState({scope:captured,people:value.people,ids:value.user_ids,revision:value.revision});setDraft(value.user_ids);setMembers(team?.items||[]);setReady(true);
  } catch {if(current.current===captured&&request===requestSequence.current)setError('Could not load the responsible people.');}
 };
 useEffect(()=>{
  let alive=true;const request=++requestSequence.current;setReady(false);setBusy(false);setError('');setState(null);if(details.current)details.current.open=false;
  void readWithDeadline(rpc<any>('redream_work_responsibility_v1',{p_work_kind:work.kind,p_work_id:work.id,p_tenant_id:tenantId})).then(value=>{
   if(alive&&request===requestSequence.current&&Array.isArray(value?.people)&&Array.isArray(value?.user_ids)&&Number.isInteger(value?.revision))setState({scope,people:value.people,ids:value.user_ids,revision:value.revision});
  },()=>{});
  return()=>{alive=false;requestSequence.current++;};
 },[scope,rpc,work.kind,work.id,tenantId]);
 async function save(){
  if(!visible||busy||!ready)return;const captured=scope,request=++requestSequence.current;setBusy(true);setError('');
  try {
   const result=await readWithDeadline(rpc<any>('redream_work_responsibility_v1',{p_work_kind:work.kind,p_work_id:work.id,p_user_ids:draft,p_expected_revision:visible.revision,p_tenant_id:tenantId}));
   if(current.current!==captured||request!==requestSequence.current)return;
   if(!Array.isArray(result?.people)||!Array.isArray(result?.user_ids)||!Number.isInteger(result?.revision))throw new Error('Unconfirmed responsibility');
   setState({scope:captured,people:result.people,ids:result.user_ids,revision:result.revision});
   if(details.current)details.current.open=false;
   window.dispatchEvent(new Event('redream:responsibilities-updated'));onSaved?.();
  } catch(err){if(current.current===captured&&request===requestSequence.current)setError(/task_revision_conflict|task_owner_inactive|denied|task_archived/.test(String((err as any)?.message||err))?taskErrorMessage(err):'Could not confirm the save. Reopen this reminder to check.');}
  finally{if(current.current===captured&&request===requestSequence.current)setBusy(false);}
 }
 return <details className={styles.control} ref={details} onToggle={event=>{if(event.target===event.currentTarget&&event.currentTarget.open)void load();}}
  onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.preventDefault();event.stopPropagation();if(details.current){details.current.open=false;details.current.querySelector<HTMLElement>('summary')?.focus();}}}}>
  <summary aria-label="Change responsible people" aria-description={visible?.people.length ? 'Responsible: '+visible.people.map(person=>person.display_name).join(', ') : visible ? 'Unassigned' : undefined}>
   {visible?.people.length ? <span className={styles.summaryAvatar} aria-hidden="true">{visible.people[0].display_name.split(' ').map(part=>part[0]).slice(0,2).join('')}</span> : null}
   <span className={styles.summaryText}>{visible?.people.length ? (visible.people.length === 1 ? visible.people[0].display_name : visible.people[0].display_name.split(' ')[0] + ' +' + (visible.people.length - 1)) : visible ? 'Unassigned' : 'Assign'}</span>
   <ChevronDown size={13}/>
  </summary>
  <div className={styles.panel}>
   {!ready&&!error?<p role="status">Loading people...</p>:null}
   {ready?<ResponsiblePeoplePicker members={members} selected={draft} onChange={setDraft} knownPeople={visible?.people} disabled={busy}/>:null}
   {error?<p role="alert">{error}</p>:null}
   <div className={styles.actions}>
    {error&&!ready?<button type="button" onClick={()=>void load()}>Retry</button>:null}
    <button type="button" disabled={busy} onClick={()=>{if(details.current)details.current.open=false;}}>Cancel</button>
    {ready?<button type="button" disabled={busy} onClick={()=>void save()}>{busy?'Saving...':'Save people'}</button>:null}
   </div>
  </div>
 </details>;
}
