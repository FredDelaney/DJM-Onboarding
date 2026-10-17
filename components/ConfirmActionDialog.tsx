'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './ConfirmActionDialog.module.css';

export default function ConfirmActionDialog({open,title,description,confirmLabel,busy=false,tone='danger',onConfirm,onClose}:{open:boolean;title:string;description:string;confirmLabel:string;busy?:boolean;tone?:'danger'|'warning';onConfirm:()=>void|Promise<void>;onClose:()=>void}) {
  const id=useId(), dialog=useRef<HTMLDivElement>(null), cancel=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null;
    queueMicrotask(()=>busy?dialog.current?.focus():cancel.current?.focus());
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();
        if(!busy)onClose();
        return;
      }
      if(event.key!=='Tab')return;
      // Capture before an enclosing portal's keyboard trap can handle this dialog.
      event.stopPropagation();
      const all=[...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[])];
      const first=all[0],last=all[all.length-1];
      if(!first){event.preventDefault();dialog.current?.focus();}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('keydown',key,true);queueMicrotask(()=>{if(previous?.isConnected)previous.focus();});};
  },[busy,onClose,open]);
  if(!open||typeof document==='undefined')return null;
  return createPortal(<div className={styles.backdrop} onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}><div ref={dialog} tabIndex={-1} className={tone==='warning'?styles.dialog+' '+styles.warning:styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby={id+'-title'} aria-describedby={id+'-description'}><div className={styles.icon}><AlertTriangle size={23}/></div><p className={styles.kicker}>{tone==='danger'?'Please confirm':'Unsaved changes'}</p><h2 id={id+'-title'}>{title}</h2><p id={id+'-description'}>{description}</p><div className={styles.actions}><button ref={cancel} type="button" className={styles.cancel} disabled={busy} onClick={onClose}>Cancel</button><button type="button" className={styles.confirm} disabled={busy} onClick={()=>void onConfirm()}>{busy?'Working...':confirmLabel}</button></div></div></div>,document.body);
}
