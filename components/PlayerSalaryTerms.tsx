'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import EntityActionsMenu,{type EntityEditField} from './EntityActionsMenu';
import JourneyStatus from './JourneyStatus';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {formatCommercialAmount} from '@/lib/club-need-brief';
import styles from './PlayerSalaryTerms.module.css';

type Rpc=<T,>(name:string,args?:Record<string,unknown>,signal?:AbortSignal)=>Promise<T>;
type Terms=Record<string,string|null>;
const fields:EntityEditField[]=[
 {key:'salary_minimum',label:'Minimum base salary',placeholder:'Leave blank if unknown'},
 {key:'salary_target',label:'Target base salary',placeholder:'Leave blank if unknown'},
 {key:'salary_currency',label:'Currency',placeholder:'EUR, GBP, USD…'},
 {key:'salary_period',label:'Salary period',type:'select',options:[['','Unknown'],['weekly','Weekly'],['monthly','Monthly'],['annual','Annual']]},
 {key:'salary_tax_basis',label:'Tax basis',type:'select',options:[['','Unknown'],['gross','Gross'],['net','Net']]},
 {key:'salary_source_status',label:'Source status',type:'select',options:[['','Unknown'],['unverified','Unverified'],['reported','Reported'],['confirmed','Confirmed']]},
 {key:'salary_source_context',label:'Source / confirmation',type:'textarea',placeholder:'Who gave these terms, and what did they confirm?'},
 {key:'salary_checked_on',label:'Checked on',type:'date'},
];
function checkedTerms(value:unknown,id:string):Terms{
 const v=value as {salary_terms_version?:number;terms?:Terms}|null;
 if(v?.salary_terms_version!==1||v.terms?.player_id!==id||fields.some(f=>v.terms?.[f.key]!==null&&typeof v.terms?.[f.key]!=='string')||v.terms.updated_at!==null&&typeof v.terms.updated_at!=='string')throw new Error('Salary details could not be confirmed. Load them again.');
 return v.terms;
}
export default function PlayerSalaryTerms(props:{playerId:string;scope:string;rpc:Rpc}){
 return <SalaryTerms key={`${props.scope}:${props.playerId}`} {...props}/>;
}
function SalaryTerms({playerId,rpc}: {playerId:string;rpc:Rpc}){
 const [opened,setOpened]=useState(false),[terms,setTerms]=useState<Terms|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),alive=useRef(true),pending=useRef<AbortController|null>(null);
 const read=useCallback(async(signal?:AbortSignal)=>{
  pending.current?.abort();const controller=new AbortController(),current=++generation.current;pending.current=controller;
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  setLoading(true);setError('');
  try{
   const next=checkedTerms(await readWithDeadline(rpc('redream_player_salary_terms',{p_player_id:playerId},controller.signal),12000,controller.signal),playerId);
   if(alive.current&&current===generation.current&&!controller.signal.aborted)setTerms(next);
  }catch(cause){if(alive.current&&current===generation.current&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Salary details could not load. Try again.');throw cause;}
  finally{signal?.removeEventListener('abort',cancel);controller.abort();if(alive.current&&current===generation.current)setLoading(false);}
 },[playerId,rpc]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;pending.current?.abort();generation.current++;};},[]);
 useEffect(()=>{if(opened&&!terms&&!loading&&!error)void read().catch(()=>{});},[opened,terms,loading,error,read]);
 const money=(amount:string|null)=>formatCommercialAmount(amount,terms?.salary_currency)||'Not recorded';
 return <details className={styles.root} onToggle={event=>setOpened(event.currentTarget.open)}>
  <summary>Salary expectations <span>Private agency terms</span></summary>
  {opened?<div className={styles.body}>
   <p>Record the player’s base-salary expectations for club-request review. These details stay private and are separate from agreed deal terms.</p>
   {loading?<JourneyStatus compact kind="loading" description="Loading salary details"/>:null}
   {error?<JourneyStatus compact kind="error" description={error} onRetry={()=>void read().catch(()=>{})} retryLabel="Load latest terms" retryBusy={loading}/>:null}
   {terms?<>
    <dl><div><dt>Minimum</dt><dd>{money(terms.salary_minimum)}</dd></div><div><dt>Target</dt><dd>{money(terms.salary_target)}</dd></div><div><dt>Basis</dt><dd>{terms.salary_period||'Period unknown'} · {terms.salary_tax_basis||'Tax basis unknown'}</dd></div><div><dt>Evidence</dt><dd>{terms.salary_source_status||'Unconfirmed'}{terms.salary_checked_on?` · Checked ${terms.salary_checked_on}`:''}</dd></div></dl>
    {terms.salary_source_context?<p className={styles.source}>{terms.salary_source_context}</p>:null}
    {terms.legacy_salary_expectation?<details><summary>Existing salary note</summary><p className={styles.source}>{terms.legacy_salary_expectation}</p><p>This note has not been converted into a numeric salary.</p></details>:null}
    <div className={styles.actions}><EntityActionsMenu editOnly kind="player" entityId={playerId} label="salary expectations" fields={fields.map(field=>({...field,value:terms[field.key]}))}
     rpc={async<T,>(name:string,args?:Record<string,unknown>,signal?:AbortSignal):Promise<T>=>{
      if(name!=='redream_entity_patch')throw new Error('This action is unavailable.');
      try{
       const value=await rpc<T>('redream_player_salary_terms_patch',{p_player_id:playerId,p_expected_updated_at:terms.updated_at,p_patch:args?.p_patch},signal);
       checkedTerms(value,playerId);return value;
      }catch(cause){if(cause&&typeof cause==='object'&&'code' in cause){if(cause.code==='40001')throw Object.assign(new Error('These salary terms changed. Cancel this edit, then load the latest terms before saving.'),{code:'40001'});if('message' in cause&&typeof cause.message==='string')throw Object.assign(new Error(cause.message),{code:cause.code});}throw cause;}
     }} onChanged={async(_change,signal)=>{await read(signal);}}/>
     <button type="button" disabled={loading} onClick={()=>void read().catch(()=>{})}>Load latest terms</button></div>
   </>:null}
  </div>:null}
 </details>;
}
