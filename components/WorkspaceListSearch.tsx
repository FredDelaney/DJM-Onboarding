'use client';
import {useRef} from 'react';
import {Search,X} from 'lucide-react';
import styles from './WorkspaceListSearch.module.css';

export default function WorkspaceListSearch({label,placeholder,value,onChange,className=''}:{label:string;placeholder:string;value:string;onChange:(value:string)=>void;className?:string}) {
 const input=useRef<HTMLInputElement>(null);
 const clear=()=>{onChange('');input.current?.focus();};
 return <div className={styles.field+' '+className}>
  <Search size={17} aria-hidden="true"/>
  <input ref={input} type="search" className={styles.input} aria-label={label} placeholder={placeholder} value={value} onChange={event=>onChange(event.target.value)} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="search" onKeyDown={event=>{if(event.key==='Escape'&&value){event.preventDefault();event.stopPropagation();clear();}}}/>
  {value?<button className={styles.clear} type="button" aria-label="Clear search" title="Clear search" onClick={clear}><X size={17} aria-hidden="true"/></button>:null}
 </div>;
}
