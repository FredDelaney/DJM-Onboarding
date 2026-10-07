'use client';
import {CircleAlert,LoaderCircle,RefreshCw} from 'lucide-react';
import styles from './JourneyStatus.module.css';

type Props = {
 title: string;
 description: string;
 kind?: 'loading' | 'error' | 'info';
 onRetry?: () => void;
};

export default function JourneyStatus({title,description,kind='info',onRetry}:Props){
 return <section className={styles.panel} role={kind==='error'?'alert':'status'} aria-busy={kind==='loading'||undefined}>
  <div className={styles.icon} aria-hidden="true">{kind==='loading'?<LoaderCircle className={styles.spin} size={20}/>:<CircleAlert size={20}/>}</div>
  <div className={styles.content}><h3>{title}</h3><p>{description}</p>{onRetry?<button type="button" data-ui-button="secondary" className={styles.retry} onClick={onRetry}><RefreshCw size={16} aria-hidden="true"/>Try again</button>:null}</div>
 </section>;
}
