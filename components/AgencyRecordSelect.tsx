'use client';
import {useEffect,useState} from 'react';
import {readWithDeadline} from '@/lib/read-with-deadline';
import styles from './AgencyRecordSelect.module.css';

export type AgencyLookupKind='club'|'contact'|'organisation';
export type AgencyLookupRecord={id:string;name:string;detail?:string|null;country?:string|null;league_name?:string|null};
export type AgencyRecordLookup=(kind:AgencyLookupKind,query:string,selectedId:string)=>Promise<any>;

// A bounded, native selector. Searching never changes or creates a record.
export default function AgencyRecordSelect({label,kind,value,onChange,lookup,disabled=false}:{label:string;kind:AgencyLookupKind;value:string;onChange:(id:string,record:AgencyLookupRecord|null)=>void;lookup?:AgencyRecordLookup;disabled?:boolean}){
 const [query,setQuery]=useState(''),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const [items,setItems]=useState<AgencyLookupRecord[]>([]),[selected,setSelected]=useState<AgencyLookupRecord|null>(null),[hasMore,setHasMore]=useState(false);
 useEffect(()=>{
  let active=true;setBusy(true);setError('');
  const timer=setTimeout(()=>{
   if(!lookup){setBusy(false);setError('Record search is unavailable.');return;}
   void readWithDeadline(Promise.resolve().then(()=>lookup(kind,query.trim(),value))).then(response=>{
    if(!active)return;
    const result=response?.options;
    if(!Array.isArray(result?.items)||result.items.some((item:any)=>typeof item?.id!=='string'||typeof item?.name!=='string')||(result.selected!=null&&(result.selected.id!==value||typeof result.selected.name!=='string')))throw new Error('Invalid record list');
    setItems(result.items);setSelected(result.selected||null);setHasMore(result.has_more===true);
   }).catch(()=>{if(active)setError('Could not load records. Retry the search.');}).finally(()=>{if(active)setBusy(false);});
  },query?200:0);
  return()=>{active=false;clearTimeout(timer);};
 },[kind,query,value,attempt,lookup]);
 const choices=selected&&!items.some(item=>item.id===selected.id)?[selected,...items]:items;
 return <div className={styles.root}>
  <label><span>{label}</span><input type="search" aria-label={`Find ${label.toLowerCase()}`} placeholder="Search existing records" value={query} maxLength={200} disabled={disabled} onChange={event=>setQuery(event.target.value)}/></label>
  <select aria-label={label} value={value} disabled={disabled||busy||Boolean(error)} onChange={event=>{const id=event.target.value;onChange(id,choices.find(item=>item.id===id)||null);}}>
   <option value="">{busy?'Loading records...':'Not selected'}</option>
   {value&&!choices.some(item=>item.id===value)?<option value={value} disabled>{busy?'Loading selected record...':'Saved record unavailable'}</option>:null}
   {choices.map(item=><option key={item.id} value={item.id}>{item.name}{item.detail?' · '+item.detail:''}</option>)}
  </select>
  {error?<div role="alert"><span>{error}</span><button type="button" disabled={disabled} onClick={()=>setAttempt(current=>current+1)}>Retry search</button></div>:hasMore?<small>More records are available. Narrow your search.</small>:!busy&&!choices.length?<small>No matching records.</small>:null}
 </div>;
}
