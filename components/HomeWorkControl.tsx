'use client';

import { isolateElements, lockPageScroll } from '@/lib/page-scroll-lock';
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Check,CheckCircle2,LoaderCircle,Pencil,X} from 'lucide-react';
import ConfirmActionDialog from './ConfirmActionDialog';
import type {WorkRef} from '@/lib/work-responsibility';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {writeWithDeadline} from '@/lib/write-with-deadline';
import styles from './HomeWorkControl.module.css';

type Work = {work_kind:string;work_id:string;title:string;display_title:string;due_on:string|null;due_at:string|null;note:string;status:'open'|'done';state:Record<string,unknown>};
type Entry = {ref:WorkRef;title:string;payload:any};
type Result = {work:Work;undo_token:string|null};
type Editor = Entry & {work:Work;notice?:string};
type Notice = {id:string;title:string;result:Result;error?:string};
type ControlState = {scope:string;busy:string;errors:Record<string,string>;overrides:Record<string,Work>;editor:Editor|null;notices:Notice[];saved:string};
const keyFor=(ref:WorkRef)=>ref.kind+':'+ref.id;
const fresh=(scope:string):ControlState=>({scope,busy:'',errors:{},overrides:{},editor:null,notices:[],saved:''});

function errorMessage(error:unknown):string {
 const message=error instanceof Error?error.message:String(error);
 if(/home_work_(conflict|undo_conflict)|task_revision_conflict/.test(message))return 'This task changed. Reload it to check the latest details. Your draft is still here.';
 if(/access_denied|edit_denied/.test(message))return 'You no longer have permission to update this task. Refresh Home.';
 if(/home_work_closed/.test(message))return 'This task has already been completed. Refresh Home.';
 if(/input_invalid|task_time/.test(message))return 'Check the action and due date, then try again.';
 return 'Could not confirm the save. Your changes are still here. Please try again.';
}
function confirmed(value:any,ref:WorkRef):Result {
 const work=value?.work;
 if(!work||work.work_kind!==ref.kind||work.work_id!==ref.id||typeof work.title!=='string'||typeof work.display_title!=='string'||typeof work.note!=='string'||!['open','done'].includes(work.status)||!work.state||typeof work.state!=='object'||Array.isArray(work.state))throw new Error('home_work_unconfirmed');
 return {work,undo_token:typeof value.undo_token==='string'?value.undo_token:null};
}
function matches(entry:Entry,work:Work):boolean {
 if(entry.title.trim().toLowerCase()!==work.display_title.trim().toLowerCase())return false;
 const due=entry.payload?.due_at||entry.payload?.deadline_at;
 if(!due)return work.due_on===null;
 if(entry.ref.kind==='player_next_action'||entry.payload?.date_only)return String(due).slice(0,10)===work.due_on;
 return Number.isFinite(new Date(due).getTime())&&new Date(due).getTime()===new Date(work.due_at||'').getTime();
}

type HomeRpc=<T=any>(name:string,args?:Record<string,unknown>,signal?:AbortSignal)=>Promise<T>;
export function useHomeWork(rpc:HomeRpc,tenantId:string,userId:string) {
 const scope=tenantId+':'+userId;
 const [state,setState]=useState<ControlState>(()=>fresh(scope));
 const active=useRef(scope),alive=useRef(true),lock=useRef(false);active.current=scope;
 useEffect(()=>{alive.current=true;lock.current=false;setState(fresh(scope));return()=>{alive.current=false;};},[scope]);
 const view=state.scope===scope?state:fresh(scope);
 const current=()=>alive.current&&active.current===scope;
 const patch=(value:Partial<ControlState>)=>{if(current())setState(old=>({...old,...value}));};
 const zone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 const read=async(ref:WorkRef)=>confirmed(await readWithDeadline(rpc('redream_home_work_v1',{p_tenant_id:tenantId,p_work_kind:ref.kind,p_work_id:ref.id,p_action:'read',p_input:{time_zone:zone()}})),ref);
 const write=async(ref:WorkRef,action:string,work:Work,input:Record<string,unknown>)=>{
  const outcome=await writeWithDeadline(async signal=>{
   try{return {data:await rpc('redream_home_work_v1',{p_tenant_id:tenantId,p_work_kind:ref.kind,p_work_id:ref.id,p_action:action,p_expected_state:work.state,p_input:{...input,time_zone:zone()}},signal),error:null};}
   catch(error){return {data:null,error};}
  });
  if(outcome.status==='unknown')throw new Error('home_work_unconfirmed');
  if(outcome.result.error)throw outcome.result.error;
  const result=confirmed(outcome.result.data,ref);
  if(action==='complete'&&(!result.undo_token||result.work.status!==(input.next_title?'open':'done')))throw new Error('home_work_unconfirmed');
  return result;
 };
 const changed=(entry:Entry,result:Result,completed:boolean)=>{
  if(!current())return;
  setState(old=>({...old,editor:null,errors:{...old.errors,[keyFor(entry.ref)]:''},overrides:{...old.overrides,[keyFor(entry.ref)]:result.work},saved:completed?'':'Changes saved.',notices:completed&&result.undo_token?[...old.notices,{id:keyFor(entry.ref)+':'+result.undo_token,title:entry.title,result}].slice(-5):old.notices}));
  window.dispatchEvent(new Event('redream:responsibilities-updated'));
 };
 async function open(entry:Entry) {
  if(lock.current)return;lock.current=true;patch({busy:keyFor(entry.ref)});
  try{const result=await read(entry.ref);if(current())patch({editor:{...entry,work:result.work},errors:{...view.errors,[keyFor(entry.ref)]:''}});}
  catch(error){patch({errors:{...view.errors,[keyFor(entry.ref)]:errorMessage(error)}});}
  finally{if(current()){lock.current=false;patch({busy:''});}}
 }
 async function complete(entry:Entry) {
  if(lock.current)return;lock.current=true;patch({busy:keyFor(entry.ref),saved:''});
  try{
   const result=await read(entry.ref);if(!current())return;
   if(!matches(entry,result.work)){patch({editor:{...entry,work:result.work,notice:'The saved task has changed. Check these details before completing it.'}});return;}
   changed(entry,await write(entry.ref,'complete',result.work,{}),true);
  }catch(error){patch({errors:{...view.errors,[keyFor(entry.ref)]:errorMessage(error)}});}
  finally{if(current()){lock.current=false;patch({busy:''});}}
 }
 async function save(editor:Editor,action:'update'|'complete',input:Record<string,unknown>) {
  if(lock.current)return;lock.current=true;patch({busy:keyFor(editor.ref)});
  try{const result=await write(editor.ref,action,editor.work,input);if(current())changed(editor,result,action==='complete');}
  finally{if(current()){lock.current=false;patch({busy:''});}}
 }
 async function reload(editor:Editor) {
  if(lock.current)return;lock.current=true;patch({busy:keyFor(editor.ref)});
  try{const result=await read(editor.ref);if(current())patch({editor:{...editor,work:result.work,notice:'Latest saved action: '+result.work.title+'. Your draft is kept below.'}});}
  finally{if(current()){lock.current=false;patch({busy:''});}}
 }
 async function undo(notice:Notice) {
  if(lock.current)return;lock.current=true;patch({busy:'undo:'+notice.id});
  const ref={kind:notice.result.work.work_kind,id:notice.result.work.work_id};
  try{
   const result=await write(ref,'undo',notice.result.work,{undo_token:notice.result.undo_token});
   if(!current())return;
   setState(old=>({...old,overrides:{...old.overrides,[keyFor(ref)]:result.work},notices:old.notices.filter(item=>item.id!==notice.id),saved:'Task restored.'}));
   window.dispatchEvent(new Event('redream:responsibilities-updated'));
  }catch(error){if(current())setState(old=>({...old,notices:old.notices.map(item=>item.id===notice.id?{...item,error:errorMessage(error)}:item)}));}
  finally{if(current()){lock.current=false;patch({busy:''});}}
 }
 const reconcile=(confirmedOverrides:Record<string,Work>)=>{
  if(current())setState(old=>({...old,overrides:Object.fromEntries(Object.entries(old.overrides).filter(([key,value])=>confirmedOverrides[key]!==value))}));
 };
 return {...view,open,complete,save,reload,undo,reconcile,close:()=>patch({editor:null}),dismiss:(id:string)=>patch({notices:view.notices.filter(item=>item.id!==id)}),clearSaved:()=>patch({saved:''})};
}
type Controller=ReturnType<typeof useHomeWork>;

export function HomeWorkRow({entry,deadline,waiting,controller,children,relatedAction}:{entry:Entry;deadline:string;waiting:boolean;controller:Controller;children:ReactNode;relatedAction?:ReactNode}) {
 const key=keyFor(entry.ref),busy=controller.busy===key,error=controller.errors[key];
 const dueLabel=deadline.replace(/^Overdue\s+(.*overdue)$/i,'$1');
 return <article className={styles.row}>
  <button type="button" className={styles.tick} aria-label={'Complete '+entry.title} disabled={Boolean(controller.busy)} onClick={()=>void controller.complete(entry)}>
   {busy?<LoaderCircle size={22} className={styles.spin}/>:<span className={styles.circle}><Check size={16}/></span>}
  </button>
  <div className={styles.copy}>
   <div className={styles.meta}>{waiting&&dueLabel.toLowerCase()!=='waiting'?<span>Waiting</span>:null}<span>{dueLabel}</span></div>
   <strong>{entry.title}</strong>
   <div className={styles.actions}>{children}<button type="button" className={styles.update} disabled={Boolean(controller.busy)} onClick={()=>void controller.open(entry)}><Pencil size={15}/>Update</button></div>
   {relatedAction?<div className={styles.related}>{relatedAction}</div>:null}
   {error?<p className={styles.error} role="alert">{error}</p>:null}
  </div>
 </article>;
}

export function HomeWorkFeedback({controller}:{controller:Controller}) {
 return <>
  {controller.saved?<div className={styles.notice} role="status"><CheckCircle2 size={18}/><span>{controller.saved}</span><button type="button" aria-label="Dismiss task update" onClick={controller.clearSaved}><X size={16}/></button></div>:null}
  {controller.notices.map(notice=><div className={styles.notice} key={notice.id}>
   <CheckCircle2 size={18}/><div><p role="status">Completed: {notice.title}</p>{notice.error?<p className={styles.error} role="alert">{notice.error}</p>:null}</div>
   <button type="button" disabled={Boolean(controller.busy)} aria-label={'Undo completion of '+notice.title} onClick={()=>void controller.undo(notice)}>{controller.busy==='undo:'+notice.id?'Restoring...':'Undo'}</button>
   <button type="button" aria-label={'Dismiss completion of '+notice.title} onClick={()=>controller.dismiss(notice.id)}><X size={16}/></button>
  </div>)}
 </>;
}

export function HomeWorkEditor({controller}:{controller:Controller}) {
 return controller.editor?<EditorPanel key={keyFor(controller.editor.ref)} editor={controller.editor} controller={controller}/>:null;
}
function EditorPanel({editor,controller}:{editor:Editor;controller:Controller}) {
 const {work}=editor,id=useId(),dialog=useRef<HTMLDivElement>(null),backdrop=useRef<HTMLDivElement>(null),alive=useRef(true);
 const [title,setTitle]=useState(work.title),[date,setDate]=useState(work.due_on||''),[note,setNote]=useState(work.note);
 const [next,setNext]=useState(false),[nextTitle,setNextTitle]=useState(''),[nextDate,setNextDate]=useState('');
 const [error,setError]=useState(''),[discard,setDiscard]=useState(false),[mounted,setMounted]=useState(false),[viewport,setViewport]=useState<{top:number;height:number}|null>(null);
 const initial=useRef(JSON.stringify([title,date,note,next,nextTitle,nextDate]));
 const dirty=JSON.stringify([title,date,note,next,nextTitle,nextDate])!==initial.current,busy=Boolean(controller.busy);
 const close=()=>{if(busy)return;if(dirty)setDiscard(true);else controller.close();};
 useEffect(()=>{setMounted(true);alive.current=true;const previous=document.activeElement as HTMLElement|null,releaseScroll = lockPageScroll();return()=>{alive.current=false;releaseScroll();queueMicrotask(()=>{if(previous?.isConnected)previous.focus();});};},[]);
 useEffect(()=>{
  if(!mounted)return;
  const siblings=[...document.body.children].filter((node):node is HTMLElement=>node instanceof HTMLElement&&node!==backdrop.current),releaseBackground = isolateElements(siblings);
  dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
  const resize=()=>{const view=window.visualViewport;if(view)setViewport({top:view.offsetTop,height:view.height});};
  resize();window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);
  return()=>{releaseBackground();window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);};
 },[mounted]);
 async function submit(action:'update'|'complete') {
  if(busy)return;setError('');
  if(!title.trim()){setError('Fill in the action first.');return;}
  if(action==='complete'&&next&&(!nextTitle.trim()||!nextDate)){setError('Add the next action and its due date.');return;}
  try{await controller.save(editor,action,{title:title.trim(),due_on:date||null,note,...(action==='complete'&&next?{next_title:nextTitle.trim(),next_due_on:nextDate}:{})});}
  catch(value){if(alive.current)setError(errorMessage(value));}
 }
 if(!mounted)return null;
 return createPortal(<div className={styles.backdrop} ref={backdrop} style={viewport?{top:viewport.top,height:viewport.height,bottom:'auto'}:undefined}><div className={styles.editor} ref={dialog} role="dialog" aria-modal="true" aria-labelledby={id} onKeyDown={event=>{
  if((event.target as HTMLElement).closest('[role="alertdialog"]'))return;
  if(event.key==='Escape'){event.preventDefault();close();}
  if(event.key==='Tab'){const controls=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')||[])];const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
 }}>
  <header><div><h2 id={id}>Update task</h2><p>{work.display_title}</p></div><button type="button" aria-label="Close task editor" onClick={close} disabled={busy}><X size={20}/></button></header>
  <form onSubmit={event=>{event.preventDefault();void submit(next?'complete':'update');}}>
   {editor.notice?<p className={styles.hint} role="status">{editor.notice}</p>:null}
   <label>Action<input value={title} maxLength={200} required disabled={busy} onChange={event=>setTitle(event.target.value)} placeholder="What needs to happen?"/></label>
   <label>Due date<input type="date" value={date} disabled={busy} onChange={event=>setDate(event.target.value)}/></label>
   <div className={styles.dateShortcuts}><button type="button" disabled={busy} onClick={()=>setDate(localDate(0))}>Today</button><button type="button" disabled={busy} onClick={()=>setDate(localDate(1))}>Tomorrow</button><button type="button" disabled={busy} onClick={()=>setDate('')}>No date</button></div>
   <label>Note (optional)<textarea aria-label="Note (optional)" value={note} maxLength={2000} rows={3} disabled={busy} onChange={event=>setNote(event.target.value)} placeholder="What happened or what should happen next?"/></label>
   {work.work_kind==='player_next_action'?<div className={styles.followUp}>
    <label className={styles.check}><input type="checkbox" checked={next} disabled={busy} onChange={event=>setNext(event.target.checked)}/>Add a follow-up when completing</label>
    {next?<><label>Next action<input value={nextTitle} maxLength={200} disabled={busy} onChange={event=>setNextTitle(event.target.value)}/></label><label>Next due date<input type="date" value={nextDate} disabled={busy} onChange={event=>setNextDate(event.target.value)}/></label></>:null}
   </div>:null}
   {error?<div className={styles.error} role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={()=>{void controller.reload(editor).then(()=>{if(alive.current)setError('');},value=>{if(alive.current)setError(errorMessage(value));});}}>Reload task</button></div>:null}
   <footer><button type="submit" className={styles.primary} disabled={busy||work.status!=='open'}>{busy?'Saving...':next?'Complete & save follow-up':'Save changes'}</button>{!next?<button type="button" className={styles.complete} disabled={busy||work.status!=='open'} onClick={()=>void submit('complete')}><CheckCircle2 size={18}/>Mark complete</button>:null}</footer>
  </form>
  <ConfirmActionDialog open={discard} title="Discard these task changes?" description="Your unsaved changes will be lost." confirmLabel="Discard changes" tone="warning" onClose={()=>setDiscard(false)} onConfirm={controller.close}/>
 </div></div>,document.body);
}
function localDate(offset:number):string {
 const date=new Date();date.setDate(date.getDate()+offset);
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
