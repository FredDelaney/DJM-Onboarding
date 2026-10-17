import type {ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import styles from './RecordDetails.module.css';

export default function RecordDetails({title, count, open, children}: {
  title: string; count?: number; open?: boolean; children: ReactNode;
}) {
  return <details className={styles.root} open={open || undefined}>
    <summary><span>{title}</span>{count !== undefined ? <small>{count}</small> : null}<ChevronDown size={16} aria-hidden="true"/></summary>
    <div className={styles.content}>{children}</div>
  </details>;
}
