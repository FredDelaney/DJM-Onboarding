'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import JourneyStatus from './JourneyStatus';
import PlayerSalaryTerms from './PlayerSalaryTerms';
import {formatCommercialAmount} from '@/lib/club-need-brief';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {writeWithDeadline} from '@/lib/write-with-deadline';
import {isDefinitiveEntityDenial} from '@/lib/entity-action-result';
import styles from './PursuitSalaryReview.module.css';

type Invoke=(action:string,body?:Record<string,unknown>,signal?:AbortSignal)=>Promise<any>;
type Rpc=<T,>(name:string,args?:Record<string,unknown>,signal?:AbortSignal)=>Promise<T>;
export type PursuitSalaryState={version:1;player_match_id:string;player_id:string;club_id?:string;can_proceed:boolean;state:string;message:string;comparison:Record<string,any>;review?:Record<string,any>|null;confirmed_command_id?:string|null};
type Command={command_id:string;fingerprint:string;decision:string;reason:string;expires_on:string|null};
type Props={matchId:string;playerId?:string|null;clubId?:string|null;refreshKey?:number;invoke:Invoke;rpc?:Rpc;onState:(state:PursuitSalaryState|null)=>void;onDirty:(dirty:boolean)=>void;onChanged?:()=>void|Promise<void>};
function checked(value:any,matchId:string,playerId?:string|null,clubId?:string|null):PursuitSalaryState{
 const state=value?.review;
 if(state?.version!==1||state.player_match_id!==matchId||typeof state.player_id!=='string'||typeof state.can_proceed!=='boolean'||typeof state.message!=='string'||state.comparison?.version!==1||!/^[0-9a-f]{32}$/.test(state.comparison.fingerprint))throw new Error('The salary review could not be confirmed. Check its current status.');
 if(playerId&&state.player_id!==playerId||clubId&&state.club_id!==clubId)throw new Error('This opportunity now refers to a different player or club. Close it and reopen the current record.');
 return state;
}
export default function PursuitSalaryReview(props:Props){return <SalaryReview key={`${props.matchId}:${props.playerId||''}:${props.clubId||''}`} {...props}/>;}
function SalaryReview({matchId,playerId,clubId,refreshKey=0,invoke,rpc,onState,onDirty,onChanged}:Props){
 const [state,setState]=useState<PursuitSalaryState|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState(false);
 const [decision,setDecision]=useState(''),[reason,setReason]=useState(''),[expiry,setExpiry]=useState(''),[formOpen,setFormOpen]=useState(false);
 const command=useRef<Command|null>(null),mutation=useRef(false),generation=useRef(0),alive=useRef(true),lifetime=useRef<AbortController|null>(null),readAbort=useRef<AbortController|null>(null);
 const callbacks=useRef({onState,onDirty,onChanged});callbacks.current={onState,onDirty,onChanged};
 const accept=useCallback((next:PursuitSalaryState)=>{
  setState(next);
  if(command.current&&next.confirmed_command_id===command.current.command_id){command.current=null;setPending(false);callbacks.current.onDirty(false);setNotice('Salary review saved. The recorded evidence and career controls are unchanged.');setDecision('');setReason('');setExpiry('');setFormOpen(false);requestAnimationFrame(()=>{const panel=document.getElementById('pursuit-salary-review'),focused=document.activeElement;if(alive.current&&panel?.isConnected&&(!focused||focused===document.body||panel.contains(focused)))panel.focus({preventScroll:true});});}
  callbacks.current.onState(command.current?null:next);
 },[]);
 const read=useCallback(async()=>{
  const request=++generation.current;readAbort.current?.abort();const controller=new AbortController();readAbort.current=controller;
  setLoading(true);setError('');callbacks.current.onState(null);
  try{
   const next=checked(await readWithDeadline(invoke('pursuit_salary_review',{player_match_id:matchId,command_id:command.current?.command_id},controller.signal),12000,controller.signal),matchId,playerId,clubId);
   if(alive.current&&request===generation.current)accept(next);
  }catch(cause){if(alive.current&&request===generation.current&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:'The salary check could not load. Try again.');}
  finally{controller.abort();if(alive.current&&request===generation.current)setLoading(false);}
 },[invoke,matchId,playerId,clubId,accept]);
 useEffect(()=>{alive.current=true;lifetime.current=new AbortController();void read();return()=>{alive.current=false;lifetime.current?.abort();readAbort.current?.abort();generation.current++;};},[read,refreshKey]);
 useEffect(()=>{callbacks.current.onDirty(Boolean(reason.trim()||decision||pending));},[reason,decision,pending]);
 const save=async(retry=false)=>{
  if(mutation.current||!state)return;
  const current=retry?command.current:{command_id:crypto.randomUUID(),fingerprint:state.comparison.fingerprint,decision,reason:reason.trim(),expires_on:decision==='explore'?expiry||null:null};
  if(!current||!current.decision||!current.reason||current.reason.length>2000||current.decision==='explore'&&!current.expires_on){setError('Choose a decision, add a reason and set an expiry for exploration.');return;}
  command.current=current;mutation.current=true;++generation.current;readAbort.current?.abort();setLoading(false);setBusy(true);setError('');setNotice('');callbacks.current.onState(null);
  try{
   const result=await writeWithDeadline(async signal=>{
    try{return {value:await invoke('pursuit_salary_review_save',{player_match_id:matchId,...current},signal)};}
    catch(cause){if(isDefinitiveEntityDenial(cause))return {denial:cause};throw cause;}
   },12000,lifetime.current?.signal);
   if(!alive.current||command.current?.command_id!==current.command_id)return;
   if(result.status==='unknown'){setPending(true);setError('This review has not been confirmed. Check its status, or retry the same review safely.');return;}
   if('denial' in result.result){command.current=null;setPending(false);throw result.result.denial;}
   const next=checked(result.result.value,matchId,playerId,clubId);
   if(next.confirmed_command_id!==current.command_id)throw new Error('This review has not been confirmed. Check its current status.');
   accept(next);
   await read();
   try{await readWithDeadline(Promise.resolve(callbacks.current.onChanged?.()),12000,lifetime.current?.signal);}catch{if(alive.current)setNotice('Salary review saved. Refresh this opportunity to update its other controls.');}
  }catch(cause){if(alive.current){if(command.current)setPending(true);setError(cause instanceof Error?cause.message:'The review could not complete. Load the current check before trying again.');}}
  finally{mutation.current=false;if(alive.current)setBusy(false);}
 };
 const comparison=state?.comparison;
 const heading=!state?loading?'Checking base salary':'Base-salary review':state.state==='hold_request_unavailable'?'Request needs review':state.state==='hold_recorded_review'?'Salary check on hold':state.review?.active?'Exploration permitted':state.can_proceed?'Recorded base salary fits':comparison?.state==='minimum_above_budget'?'Minimum exceeds club budget':comparison?.state==='target_above_budget'?'Target exceeds club budget':'Salary evidence needs review';
 const figure=(value:unknown,currency:unknown)=>formatCommercialAmount(value,currency)||'Not recorded';
 return <section id="pursuit-salary-review" className={styles.root} aria-label="Base-salary review" tabIndex={-1}>
  <header><p>BASE SALARY</p><h3>{heading}</h3></header>
  {loading?<JourneyStatus compact kind="loading" description="Checking current salary evidence"/>:null}
  {busy&&pending?<JourneyStatus compact kind="loading" description="Confirming the saved salary review"/>:null}
  {error?<JourneyStatus compact kind="error" description={error} onRetry={()=>void read()} retryLabel={pending?'Check saved review':'Load current check'} retryBusy={loading||busy}/>:null}
  {notice?<JourneyStatus compact kind="success" description={notice}/>:null}
  {comparison?<>
   <p className={styles.explanation}>{state?.state==='hold_request_unavailable'||state?.state==='hold_recorded_review'?state.message:comparison.message}</p>
   <dl><div><dt>Player minimum</dt><dd>{figure(comparison.player_minimum,comparison.player_currency)}</dd></div><div><dt>Player target</dt><dd>{figure(comparison.player_target,comparison.player_currency)}</dd></div><div><dt>Player basis</dt><dd>{comparison.player_period||'Period unknown'} · {comparison.player_tax_basis||'Tax basis unknown'}</dd></div><div><dt>Club budget</dt><dd>{figure(comparison.club_budget,comparison.club_currency)}</dd></div><div><dt>Club basis</dt><dd>{comparison.club_period||'Period unknown'} · {comparison.club_tax_basis||'Tax basis unknown'}</dd></div><div><dt>Evidence</dt><dd>{comparison.source_status||'Player source unconfirmed'} · club {comparison.club_source_status||'unconfirmed'}{comparison.checked_on?` · Checked ${comparison.checked_on}`:''}</dd></div></dl>
   {Array.isArray(comparison.missing)&&comparison.missing.length?<p className={styles.explanation}>Record: {comparison.missing.join('; ')}.</p>:null}
   {state?.review?<p className={styles.explanation}><strong>{state.review.same_context===false?'Previous review for a different player or request':state.review.decision==='hold'&&!state.review.current?'Recorded hold; review the updated evidence before resuming':state.review.current?'Recorded review':'Previous review (evidence changed)'}</strong><br/>{state.review.reason}{state.review.expires_on?` · Exploration until ${state.review.expires_on} (UTC)`:''}</p>:null}
   <p className={styles.explanation}>Base salary only. Exploration keeps the figures and career controls unchanged; it does not agree or send an offer.</p>
   {rpc&&state?<PlayerSalaryTerms playerId={state.player_id} scope={matchId} rpc={rpc} onRefreshComparison={read}/>:null}
   {pending?<div className={styles.actions}><button type="button" onClick={()=>void read()} disabled={busy||loading}>Check saved review</button><button type="button" onClick={()=>void save(true)} disabled={busy||loading}>Retry same review</button></div>:<details className={styles.reviewForm} open={formOpen} onToggle={event=>setFormOpen(event.currentTarget.open)}><summary>Record a decision</summary><form onSubmit={event=>{event.preventDefault();void save();}}>
    <label>Decision<select value={decision} onChange={e=>setDecision(e.target.value)} disabled={busy||loading}><option value="">Choose a decision</option><option value="explore">Explore with unresolved terms</option><option value="hold">Keep on hold</option><option value="use_recorded_terms">Use confirmed compatible terms</option></select></label>
    <label>Reason<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={2000} disabled={busy||loading} placeholder="Why is this the right next step, and what still needs confirmation?"/></label>
    {decision==='explore'?<label>Exploration until (UTC)<input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)} disabled={busy||loading}/></label>:null}
    <div className={styles.actions}><button type="button" disabled={busy} onClick={()=>{setDecision('');setReason('');setExpiry('');setError('');}}>Cancel</button><button type="submit" disabled={busy||loading||!decision||!reason.trim()||decision==='explore'&&!expiry}>{busy?'Saving review…':'Save review'}</button></div>
   </form></details>}
  </>:null}
 </section>;
}
