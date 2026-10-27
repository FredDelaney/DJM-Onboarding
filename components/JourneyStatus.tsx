"use client";
import type {ReactNode} from 'react';
import {CircleAlert,CheckCircle2,Info,LoaderCircle,RefreshCw} from 'lucide-react';

import styles from './JourneyStatus.module.css';
type Props={
 title?:string;
 description?:string;
 kind?:'loading'|'error'|'info'|'success'|'warning';
 compact?:boolean;
 onRetry?:()=>void;
 retryLabel?:string;
 retryBusy?:boolean;
 retryDisabled?:boolean;
 children?:ReactNode;
};
export default function JourneyStatus({title,description,kind='info',compact=false,onRetry,retryLabel='Try again',retryBusy=false,retryDisabled=false,children}:Props){
 const Icon=kind==='loading'?LoaderCircle:kind==='success'?CheckCircle2:kind==='info'?Info:CircleAlert;
 return <section className={[styles.panel,styles[kind],compact?styles.compact:''].filter(Boolean).join(' ')} role={kind==='error'?'alert':'status'} aria-busy={kind==='loading'||retryBusy||undefined} aria-atomic="true">
  <div className={styles.icon} aria-hidden="true"><Icon className={kind==='loading'?styles.spin:undefined} size={compact?18:20}/></div>
  <div className={styles.content}>
   {title?<h3>{title}</h3>:null}
   {description?<p>{description}</p>:null}
   {children?<div className={styles.actions}>{children}</div>:null}
   {onRetry?<button type="button" data-ui-button="secondary" className={styles.retry} onClick={onRetry} disabled={retryBusy||retryDisabled}><RefreshCw size={16} className={retryBusy?styles.spin:undefined} aria-hidden="true"/>{retryLabel}</button>:null}
  </div>
 </section>;
}
