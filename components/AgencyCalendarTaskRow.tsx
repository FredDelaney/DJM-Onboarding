'use client';
import {useState} from 'react';
import {Lock,Building2,Check,RotateCcw,Archive,ArchiveRestore,Pencil} from 'lucide-react';
import {taskErrorMessage,type CalendarTask,type TaskAction} from '@/lib/calendar/tasks';
import styles from './AgencyCalendarWorkspace.module.css';
export default function AgencyCalendarTaskRow({task,onEdit,onAction}:{task:CalendarTask;onEdit:(task:CalendarTask)=>void;onAction:(action:TaskAction,task:CalendarTask)=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function act(action:TaskAction){if(busy)return;setBusy(true);setError('');try{await onAction(action,task);}catch(e){setError(taskErrorMessage(e));}finally{setBusy(false);}}
 return <article className={styles.taskRow} data-task-id={task.id}><div className={styles.taskCopy}><div className={styles.taskMeta}>{task.visibility==='personal'?<><Lock size={13}/>Private</>:<><Building2 size={13}/>Company · {task.owner_name}</>}{task.needs_reassignment?<span>Needs reassignment</span>:null}{task.status==='done'?<span>Completed</span>:null}{task.archived_at?<span>Archived</span>:null}</div><strong>{task.title}</strong>{task.notes?<p>{task.notes}</p>:null}</div>
 {task.can_edit?<div className={styles.taskActions}>{task.archived_at?<button disabled={busy} aria-label={`Restore ${task.title}`} onClick={()=>void act('restore')}><ArchiveRestore size={17}/><span>Restore</span></button>:<>
 <button disabled={busy} aria-label={`${task.status==='done'?'Reopen':'Complete'} ${task.title}`} onClick={()=>void act(task.status==='done'?'reopen':'complete')}>{task.status==='done'?<RotateCcw size={17}/>:<Check size={17}/>}<span>{task.status==='done'?'Reopen':'Complete'}</span></button>
 <button disabled={busy} aria-label={`Edit ${task.title}`} onClick={()=>onEdit(task)}><Pencil size={17}/><span>Edit</span></button><button disabled={busy} aria-label={`Archive ${task.title}`} onClick={()=>void act('archive')}><Archive size={17}/><span>Archive</span></button>
 </>}</div>:null}{error?<p role="alert" className={styles.taskError}>{error}</p>:null}</article>;
}
