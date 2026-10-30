'use client';

import { isolateElements, lockPageScroll } from '@/lib/page-scroll-lock';
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Check,CheckCircle2,LoaderCircle,Pencil,X} from 'lucide-react';
import ConfirmActionDialog from './ConfirmActionDialog';
import type {WorkRef,ConfirmedHomeWork} from '@/lib/work-responsibility';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {writeWithDeadline} from '@/lib/write-with-deadline';
import styles from './HomeWorkControl.module.css';

type Work = ConfirmedHomeWork;
type Entry = {ref:WorkRef;title:string;payload:any};
type Result = {work:Work;undo_token:string|null};
type Editor = Entry & {work:Work;notice?:string;returnFocus:()=>void};
type Notice = {id:string;title:string;result:Result;error?:string};
type ControlState = {scope:string;busy:string;errors:Record<string,string>;overrides:Record<string,Work>;editor:Editor|null;notices:Notice[];saved:string};
const keyFor=(ref:WorkRef)=>ref.kind+':'+ref.id;
const fresh=(scope:string):ControlState=>({scope,busy:'',errors:{},overrides:{},editor:null,notices:[],saved:''});

function errorMessage(error:unknown,phase:'read'|'save'='save'):string {
 const message=error instanceof Error?error.message:String(error);
 if(/home_work_(conflict|undo_conflict)|task_revision_conflict/.test(message))return 'This task changed. Reload it to check the latest details. Your draft is still here.';
 if(/access_denied|edit_denied/.test(message))return 'This task is unavailable or you no longer have permission to update it.';
 if(/home_work_closed/.test(message))return 'This task has already been completed. Reload it to check the latest details.';
 if(/input_invalid|task_time/.test(message))return 'Check the action and due date, then try again.';
 if(phase==='read')return 'This task could not load. Try again.';
 return 'Could not confirm the save. Your changes are still here. Please try again.';
}
function confirmed(value:any,ref:WorkRef):Result {
 const work=value?.work;
 if(!work||work.work_kind!==ref.kind||work.work_id!==ref.id||typeof work.title!=='string'||typeof work.display_title!=='string'||typeof work.note!=='string'||!['open','done'].includes(work.status)||!work.state||typeof work.state!=='object'||Array.isArray(work.state))throw new Error('home_work_unconfirmed');
 return {work,undo_token:typeof value.undo_token==='string'?value.undo_token:null};
}
function matches(entry:Entry,work:Work,checkVersion=true):boolean {
 let title=entry.title;
 if(entry.ref.kind==='task'&&entry.payload?.source_type==='task'&&entry.payload?.source_id===entry.ref.id){
  const evidence=entry.payload.evidence;
  if(evidence?.task_count>1)return false;
  if(typeof entry.payload.task_title==='string'&&evidence?.task_count===1&&Array.isArray(evidence.tasks)&&evidence.tasks.length===1&&evidence.tasks[0]?.task_id===entry.ref.id){
   const task=evidence.tasks[0];
   if(checkVersion&&task.updated_at!=null&&task.updated_at!==work.state.version)return false;
   if(['player_id','person_id','organisation_id','club_need_id'].some(key=>(task[key]??null)!==(work.context?.[key]??null)))return false;
   title=entry.payload.task_title;
  }
 }
 if(title.trim().toLowerCase()!==work.display_title.trim().toLowerCase())return false;
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
 // Capture before the read disables its button; restore after modal cleanup.
 const captureReturnFocus=(ref:WorkRef,action:'update'|'complete',opener?:HTMLElement)=>{
  const heading=document.getElementById('workspace-view-heading'),label=heading?.textContent,path=location.pathname;
  const workKey=keyFor(ref),fromRow=opener?.closest('[data-home-work]')?.getAttribute('data-home-work')===workKey&&opener?.getAttribute('data-home-work-action')===action;
  return ()=>requestAnimationFrame(()=>{
   if(!current()||location.pathname!==path||(heading&&(document.getElementById('workspace-view-heading')!==heading||heading.textContent!==label)))return;
   const focused=document.activeElement;
   if(document.querySelector('[aria-modal="true"]')||(focused instanceof HTMLElement&&focused!==document.body&&focused!==document.documentElement&&focused.isConnected))return;
   const usable=(node:HTMLElement|null|undefined):node is HTMLElement=>Boolean(node?.isConnected&&!node.matches(':disabled,[aria-disabled="true"]')&&!node.closest('[inert],[aria-hidden="true"]')&&node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden');
   const row=fromRow?[...document.querySelectorAll<HTMLElement>('[data-home-work]')].find(node=>node.getAttribute('data-home-work')===workKey&&usable(node)):null;
   const target=[row?.contains(opener||null)?opener:null,row?.querySelector<HTMLElement>(`[data-home-work-action="${action}"]`),heading].find(usable);
   if(!target)return;
   target.focus({preventScroll:true});
   const bounds=target.getBoundingClientRect();
   if(bounds.top<0||bounds.bottom>innerHeight)target.scrollIntoView({block:'nearest'});
  });
 };
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
  setState(old=>({...old,editor:null,errors:{...old.errors,[keyFor(entry.ref)]:''},overrides:{...old.overrides,[keyFor(entry.ref)]:result.work},saved:completed?'':'Changes saved.',notices:completed&&result.undo_token?[...old.notices,{id:keyFor(entry.ref)+':'+result.undo_token,title:result.work.status==='done'&&!matches(entry,result.work,false)?result.work.display_title:entry.title,result}].slice(-5):old.notices}));
  window.dispatchEvent(new Event('redream:responsibilities-updated'));
 };
 async function open(entry:Entry,opener?:HTMLElement) {
  if(lock.current)return;const returnFocus=captureReturnFocus(entry.ref,'update',opener);let opened=false;lock.current=true;patch({busy:keyFor(entry.ref)});
  try{const result=await read(entry.ref);if(current()){opened=true;patch({editor:{...entry,title:result.work.display_title,work:result.work,returnFocus},errors:{...view.errors,[keyFor(entry.ref)]:''}});}}
  catch(error){patch({errors:{...view.errors,[keyFor(entry.ref)]:errorMessage(error,'read')}});}
  finally{if(current()){lock.current=false;patch({busy:''});if(!opened)returnFocus();}}
 }
 async function complete(entry:Entry,opener?:HTMLElement) {
  if(lock.current)return;const returnFocus=captureReturnFocus(entry.ref,'complete',opener);let opened=false;let phase:'read'|'save'='read';lock.current=true;patch({busy:keyFor(entry.ref),saved:''});
  try{
   const result=await read(entry.ref);if(!current())return;
   if(!matches(entry,result.work)){opened=true;patch({editor:{...entry,work:result.work,notice:'The saved task has changed. Check these details before completing it.',returnFocus}});return;}
   phase='save';changed(entry,await write(entry.ref,'complete',result.work,{}),true);
  }catch(error){patch({errors:{...view.errors,[keyFor(entry.ref)]:errorMessage(error,phase)}});}
  finally{if(current()){lock.current=false;patch({busy:''});if(!opened)returnFocus();}}
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

export function HomeWorkRow({entry,deadline,waiting,controller,children,relatedAction,description}:{entry:Entry;deadline:string;waiting:boolean;controller:Controller;children:ReactNode;relatedAction?:ReactNode;description?:string}) {
 const key=keyFor(entry.ref),busy=controller.busy===key,error=controller.errors[key];
 const dueLabel=deadline.replace(/^Overdue\s+(.*overdue)$/i,'$1');
 return <article className={styles.row} data-home-work={key}>
  <button type="button" className={styles.tick} data-home-work-action="complete" aria-label={'Complete '+entry.title} disabled={Boolean(controller.busy)} onClick={event=>void controller.complete(entry,event.currentTarget)}>
   {busy?<LoaderCircle size={22} className={styles.spin}/>:<span className={styles.circle}><Check size={16}/></span>}
  </button>
  <div className={styles.copy}>
   <div className={styles.meta}>{waiting&&dueLabel.toLowerCase()!=='waiting'?<span>Waiting</span>:null}<span>{dueLabel}</span></div>
   <strong>{entry.title}</strong>
   {description?<p className={styles.description}>{description}</p>:null}
   <div className={styles.actions}>{children}<button type="button" className={styles.update} data-home-work-action="update" disabled={Boolean(controller.busy)} onClick={event=>void controller.open(entry,event.currentTarget)}><Pencil size={15}/>Update</button></div>
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
 const dirty=JSON.stringify([title,date,note,next,nextTitle,nextDate])!==initial.current,busy=Boolean(controller.busy),closed=work.status==='done',cancelled=work.work_kind==='task'&&work.state.original_status==='cancelled';
 const close=()=>{if(busy)return;if(dirty)setDiscard(true);else controller.close();};
 useEffect(()=>{setMounted(true);alive.current=true;const returnFocus=editor.returnFocus,releaseScroll = lockPageScroll();return()=>{alive.current=false;releaseScroll();returnFocus();};},[]);
 useEffect(()=>{
  if(!mounted)return;
  const siblings=[...document.body.children].filter((node):node is HTMLElement=>node instanceof HTMLElement&&node!==backdrop.current),releaseBackground = isolateElements(siblings);
  (dialog.current?.querySelector<HTMLElement>('input:not(:disabled)')||dialog.current?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();
  const resize=()=>{const view=window.visualViewport;if(view)setViewport({top:view.offsetTop,height:view.height});};
  resize();window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);
  return()=>{releaseBackground();window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);};
 },[mounted]);
 useEffect(()=>{if(mounted&&closed)dialog.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus({preventScroll:true});},[mounted,closed]);
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
  if(event.key==='Tab'){const controls=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')||[])];const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
 }}>
  <header><div><h2 id={id}>{closed?cancelled?'Cancelled task':'Completed task':'Update task'}</h2><p>{work.display_title}</p></div><button type="button" aria-label="Close task editor" onClick={close} disabled={busy}><X size={20}/></button></header>
  <form onSubmit={event=>{event.preventDefault();void submit(next?'complete':'update');}}>
   {closed?<p className={styles.hint} role="status">{cancelled?'This task was cancelled.':'This task is complete.'} The details below are the current saved record.</p>:null}
   {closed&&dirty?<details className={styles.unsavedDraft}><summary>Your unsaved draft</summary><p>These edits were not saved. Copy anything you still need before closing.</p><p>{title}</p>{date?<p>{date}</p>:null}{note?<p>{note}</p>:null}</details>:null}
   <fieldset className={styles.fields} aria-label="Task details" disabled={busy||closed}>
   {editor.notice?<p className={styles.hint} role="status">{editor.notice}</p>:null}
   <label>Action<input value={closed?work.title:title} maxLength={200} required disabled={busy} onChange={event=>setTitle(event.target.value)} placeholder="What needs to happen?"/></label>
   <label>Due date<input type="date" value={closed?work.due_on||'':date} disabled={busy} onChange={event=>setDate(event.target.value)}/></label>
   <div className={styles.dateShortcuts}><button type="button" disabled={busy} onClick={()=>setDate(localDate(0))}>Today</button><button type="button" disabled={busy} onClick={()=>setDate(localDate(1))}>Tomorrow</button><button type="button" disabled={busy} onClick={()=>setDate('')}>No date</button></div>
   <label>Note (optional)<textarea aria-label="Note (optional)" value={closed?work.note:note} maxLength={2000} rows={3} disabled={busy} onChange={event=>setNote(event.target.value)} placeholder="What happened or what should happen next?"/></label>
   {work.work_kind==='player_next_action'?<div className={styles.followUp}>
    <label className={styles.check}><input type="checkbox" checked={next} disabled={busy} onChange={event=>setNext(event.target.checked)}/>Add a follow-up when completing</label>
    {next?<><label>Next action<input value={nextTitle} maxLength={200} disabled={busy} onChange={event=>setNextTitle(event.target.value)}/></label><label>Next due date<input type="date" value={nextDate} disabled={busy} onChange={event=>setNextDate(event.target.value)}/></label></>:null}
   </div>:null}
   </fieldset>
   {error?<div className={styles.error} role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={()=>{void controller.reload(editor).then(()=>{if(alive.current)setError('');},value=>{if(alive.current)setError(errorMessage(value,'read'));});}}>Reload task</button></div>:null}
   {!closed?<footer><button type="submit" className={styles.primary} disabled={busy}>{busy?'Saving...':next?'Complete & save follow-up':'Save changes'}</button>{!next?<button type="button" className={styles.complete} disabled={busy} onClick={()=>void submit('complete')}><CheckCircle2 size={18}/>Mark complete</button>:null}</footer>:null}
  </form>
  <ConfirmActionDialog open={discard} title="Discard these task changes?" description="Your unsaved changes will be lost." confirmLabel="Discard changes" tone="warning" onClose={()=>setDiscard(false)} onConfirm={controller.close}/>
 </div></div>,document.body);
}
function localDate(offset:number):string {
 const date=new Date();date.setDate(date.getDate()+offset);
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
