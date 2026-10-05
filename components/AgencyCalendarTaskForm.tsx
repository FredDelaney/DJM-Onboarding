'use client';
import { useEffect,useRef,useState } from 'react';
import {createPortal} from 'react-dom';
import { X } from 'lucide-react';
import { taskErrorMessage,taskLocalInstant,type CalendarTask,type TaskInput,type Assignee } from '@/lib/calendar/tasks';
import styles from './AgencyCalendarTaskForm.module.css';
export default function AgencyCalendarTaskForm({task,selectedDate,userId,assignees,onSave,onClose}:{task?:CalendarTask;selectedDate:string;userId:string;assignees:Assignee[];onSave:(input:TaskInput,task?:CalendarTask)=>Promise<void>;onClose:()=>void}){
 const [title,setTitle]=useState(task?.title||''),[notes,setNotes]=useState(task?.notes||''),[visibility,setVisibility]=useState<'personal'|'company'>(task?.visibility||'personal');
 const [owner,setOwner]=useState(task?.owner_user_id||userId),[date,setDate]=useState(task?.due_on??(task?'':selectedDate)),[time,setTime]=useState(task?.due_time?.slice(0,5)||''),[zone,setZone]=useState(task?.time_zone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const dialog=useRef<HTMLDivElement>(null),requestId=useRef<string|null>(null),alive=useRef(true);
 const [mounted,setMounted]=useState(false);const [viewport,setViewport]=useState<{top:number;height:number}|null>(null);const backdrop=useRef<HTMLDivElement>(null);
 const initial=useRef(JSON.stringify([title,notes,visibility,owner,date,time,zone]));const dirty=JSON.stringify([title,notes,visibility,owner,date,time,zone])!==initial.current;
 const close=()=>{if(!busy&&(!dirty||window.confirm('Discard your unsaved task changes?')))onClose();};
 useEffect(()=>{setMounted(true);alive.current=true;const previous=document.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLInputElement>('input')?.focus();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{alive.current=false;document.body.style.overflow=old;queueMicrotask(()=>{if(previous?.isConnected)previous.focus();});};},[]);
 useEffect(()=>{
  if(!mounted)return;
  const siblings=[...document.body.children].filter((el):el is HTMLElement=>el instanceof HTMLElement&&el!==backdrop.current);
  const inert=siblings.map(el=>el.inert);siblings.forEach(el=>{el.inert=true;});
  dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
  const update=()=>{const view=window.visualViewport;if(view)setViewport({top:view.offsetTop,height:view.height});};
  update();window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);
  return()=>{siblings.forEach((el,i)=>{el.inert=inert[i];});window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);};
 },[mounted]);
 async function submit(event:React.FormEvent){event.preventDefault();if(busy)return;setError('');
  if(!title.trim()||title.trim().length>200||notes.length>2000){setError('Add a title of up to 200 characters and notes of up to 2,000 characters.');return;}
  if(time&&date){try{taskLocalInstant(date,time,zone);}catch{setError('This local time is invalid or occurs twice when the clocks change. Choose another time or leave the time blank.');return;}}
  const input:TaskInput={title:title.trim(),notes,due_on:date||null,due_time:date&&time?time:null,time_zone:date&&time?zone:null};
  if(!task){requestId.current??=crypto.randomUUID();input.id=requestId.current;input.visibility=visibility;input.owner_user_id=visibility==='personal'?userId:owner;}else if(owner!==task.owner_user_id)input.owner_user_id=owner;
  setBusy(true);try{await onSave(input,task);if(alive.current)onClose();}catch(err){if(alive.current)setError(taskErrorMessage(err));}finally{if(alive.current)setBusy(false);}
 }
 if(!mounted)return null;
 return createPortal(<div className={styles.backdrop} ref={backdrop} style={viewport?{top:viewport.top,height:viewport.height,bottom:'auto'}:undefined}><div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="calendar-task-title" ref={dialog} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const all=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')||[])];const first=all[0],last=all[all.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}><header><div><small>{task?'Update your work':'One clear next action'}</small><h2 id="calendar-task-title">{task?'Edit task':'Add task'}</h2></div><button type="button" aria-label="Close task form" disabled={busy} onClick={close}><X size={20}/></button></header>
 <form onSubmit={submit}>
 <label>Title<input value={title} maxLength={200} required onChange={e=>setTitle(e.target.value)} placeholder="What needs to happen?"/></label>
 <label>Visibility<select aria-label="Visibility" value={visibility} disabled={!!task||busy} onChange={e=>{setVisibility(e.target.value as any);setOwner(userId);}}><option value="personal">Personal</option><option value="company">Company</option></select></label>
 <p className={styles.hint}>{visibility==='personal'?'Private. Only you can see this task.':'Shared with all internal staff in your company.'}</p>
 {visibility==='company'?<label>Owner<select aria-label="Owner" value={owner} disabled={busy} onChange={e=>setOwner(e.target.value)}>{!assignees.some(a=>a.user_id===owner)?<option value={owner}>Needs reassignment</option>:null}{assignees.map(a=><option key={a.user_id} value={a.user_id}>{a.display_name}</option>)}</select></label>:null}
 <label className={styles.check}><input type="checkbox" checked={!date} disabled={busy} onChange={e=>{setDate(e.target.checked?'':selectedDate);if(e.target.checked)setTime('');}}/>No date</label>
 {date?<div className={styles.dates}><label>Due date<input type="date" value={date} required disabled={busy} onChange={e=>setDate(e.target.value)}/></label><label>Time (optional)<input type="time" value={time} disabled={busy} onChange={e=>setTime(e.target.value)}/></label></div>:null}
 {date&&time?<label>Time zone<input value={zone} disabled={busy} required onChange={e=>setZone(e.target.value)}/></label>:null}
 <label>Notes (optional)<textarea value={notes} maxLength={2000} disabled={busy} rows={3} onChange={e=>setNotes(e.target.value)}/></label>
 {error?<p role="alert" className={styles.error}>{error}</p>:null}
 <footer><button type="button" data-ui-button="secondary" disabled={busy} onClick={close}>Cancel</button><button type="submit" data-ui-button="primary" className={styles.primary} disabled={busy}>{busy?'Saving...':'Save task'}</button></footer>
 </form></div></div>,document.body);
}
