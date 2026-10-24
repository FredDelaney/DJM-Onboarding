'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Check,ExternalLink,LoaderCircle,RefreshCw} from 'lucide-react';
import {compactDateTime,friendlyError} from '@/lib/platform-client';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {safeSourceUrl} from '@/lib/player-data-workflow';
import {PLAYER_DETAILS,detailText,detailsDecisions,parseDetailsReview,reconcileDetailChoices,type DetailChoices,type DetailsReview} from '@/lib/player-details-review';
import styles from './AgencyPlayerDataPanel.module.css';

type Invoke=(action:string,body?:Record<string,unknown>)=>Promise<any>;
export default function AgencyPlayerDetailsReview({player,invoke,onChanged,blocked=false,statusVersion='',onDraftChange,onContinue}: {
 player:any;invoke:Invoke;onChanged:()=>Promise<boolean|void>;blocked?:boolean;statusVersion?:string;
 onDraftChange?:(dirty:boolean)=>void;onContinue?:()=>void;
}){
 const [review,setReview]=useState<DetailsReview|null>(null),[choices,setChoices]=useState<DetailChoices>({});
 const [ready,setReady]=useState(false),[checking,setChecking]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[refreshFailed,setRefreshFailed]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const current=useRef<DetailsReview|null>(null),alive=useRef(true),generation=useRef(0),mutation=useRef(false),requestId=useRef<string|null>(null),anchored=useRef(false);
 const lastStatusVersion=useRef(statusVersion);
 const panel=useRef<HTMLElement>(null),changed=useRef(onChanged),draftChanged=useRef(onDraftChange);changed.current=onChanged;draftChanged.current=onDraftChange;
 const adopt=useCallback((next:DetailsReview|null)=>{current.current=next;setReview(next);setChoices(previous=>reconcileDetailChoices(next,previous));},[]);
 const reloadPlayer=useCallback(async()=>{
  const success=await changed.current();if(!alive.current)return;
  setRefreshFailed(success===false);if(success===false)throw new Error('Player details could not reload. Check progress to try again.');
 },[]);
 const read=useCallback(async(refreshPlayer=true)=>{
  const run=++generation.current;setChecking(true);
  try{
   const response=await readWithDeadline(invoke('player_context_status',{player_id:player.id}));
   if(!alive.current||run!==generation.current)return;
   const next=parseDetailsReview(response?.review),previous=current.current;
   const resolved=previous?.id===next?.id&&(previous?.fields||[]).some(f=>f.decision==='pending'&&next?.fields.some(n=>n.id===f.id&&n.decision!=='pending'));
   adopt(next);setUncertain(false);setError('');
   if(next&&next.status!=='running')requestId.current=null;
   if(refreshPlayer&&(resolved||(next?.status==='applied'&&!previous&&window.location.hash==='#player-details')))await reloadPlayer();
   if(next&&next.status!=='running'&&next.status!=='needs_review')setNotice(next.status==='failed'?(next.reason||'The source check did not finish. You can try again.'):'These player details have already been reviewed. The recorded profile is shown above.');
   return true;
  }catch(failure){if(alive.current&&run===generation.current){setUncertain(true);setError(friendlyError(failure));}return false;}
  finally{if(alive.current&&run===generation.current){setChecking(false);setReady(true);}}
 // Callback refs keep a normal profile refresh from restarting this read.
 },[invoke,player.id,adopt,reloadPlayer]);
 useEffect(()=>{alive.current=true;setReady(false);void read();return()=>{alive.current=false;++generation.current;draftChanged.current?.(false);};},[read]);
 useEffect(()=>{if(lastStatusVersion.current===statusVersion)return;lastStatusVersion.current=statusVersion;if(statusVersion){anchored.current=false;setReady(false);void read();}},[statusVersion,read]);
 useEffect(()=>{
  if(review?.status!=='running'||uncertain)return;
  let cancelled=false;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{await read();if(!cancelled&&current.current?.status==='running')timer=setTimeout(()=>void poll(),2500);};
  timer=setTimeout(()=>void poll(),2500);return()=>{cancelled=true;clearTimeout(timer);};
 },[review?.status,uncertain,read]);
 useEffect(()=>{
  const focus=()=>{if(ready&&!anchored.current&&window.location.hash==='#player-details'){anchored.current=true;panel.current?.focus({preventScroll:true});panel.current?.scrollIntoView({behavior:'instant',block:'start'});}};
  focus();window.addEventListener('hashchange',focus);return()=>window.removeEventListener('hashchange',focus);
 },[ready]);
 const dirty=Object.values(choices).some(choice=>choice.decision!=='later');
 useEffect(()=>{draftChanged.current?.(dirty);},[dirty]);
 const research=async()=>{
  if(mutation.current||blocked||uncertain||refreshFailed||dirty||current.current?.status==='running'||current.current?.status==='needs_review')return;
  mutation.current=true;setBusy(true);setError('');setNotice('');requestId.current ||= crypto.randomUUID();
  try{
   const response=await readWithDeadline(invoke('player_context_research',{player_id:player.id,request_id:requestId.current}),35000);
   if(!alive.current)return;
   const next=parseDetailsReview(response?.review);adopt(next);
   if(next?.status!=='running')requestId.current=null;
   if(!next||next.status!=='needs_review')setNotice(response?.reason||next?.reason||(next?.status==='running'?'Checking public sources. You can keep using the profile.':'No new details are waiting for review.'));
  }catch(failure){if(alive.current){setUncertain(true);setError(friendlyError(failure));}}
  finally{mutation.current=false;if(alive.current)setBusy(false);}
 };
 const save=async()=>{
  const previous=current.current;if(!previous||mutation.current||blocked||uncertain||refreshFailed)return;
  let decisions;try{decisions=detailsDecisions(previous,choices);if(!decisions.length)return;}catch(failure){setError(friendlyError(failure));return;}
  mutation.current=true;setBusy(true);setError('');setNotice('');
  try{
   const response=await readWithDeadline(invoke('player_context_review',{player_id:player.id,review_id:previous.id,decisions}),35000);
   if(!alive.current)return;
   if(response?.ok!==true||response?.review_id!==previous.id)throw new Error('The review could not be confirmed. Check progress before trying again.');
   adopt(parseDetailsReview(response.review));setUncertain(false);setNotice('Decisions saved. Review the current player data before publishing.');
   await reloadPlayer();
  }catch(failure){if(alive.current){setUncertain(true);setError(friendlyError(failure));}}
  finally{mutation.current=false;if(alive.current)setBusy(false);}
 };
 const checkProgress=async()=>{
  if(mutation.current||checking)return;mutation.current=true;setBusy(true);
  try{if(await read(false))await reloadPlayer();}catch(failure){if(alive.current)setError(friendlyError(failure));}
  finally{mutation.current=false;if(alive.current)setBusy(false);}
 };
 const pending=(review?.fields||[]).filter(f=>f.decision==='pending');
 const locked=busy||blocked||uncertain||refreshFailed;
 const chooseAll=(decision:'accept'|'reject'|'later')=>setChoices(previous=>Object.fromEntries(pending.map(f=>[f.id,{...previous[f.id],value:previous[f.id]?.value??detailText(f.suggested),decision}])));
 return <section id="player-details" ref={panel} tabIndex={-1} className={`${styles.panel} ${styles.detailsPanel}`} aria-label="Player details review" aria-busy={busy||!ready}>
  <header className={styles.header}><div><span className={styles.kicker}>{[player.first_name,player.last_name].filter(Boolean).join(' ')||'Player'} · Player details</span><h3>{pending.length?'Review suggested details':'Club, contract & identity'}</h3><p>{pending.length?'Compare each suggestion with the recorded profile. Nothing changes until you save your decisions.':'Check public sources for changes. You decide what becomes part of the player record.'}</p></div>
   {!pending.length?<button type="button" data-ui-button="secondary" className={styles.update} disabled={!ready||locked||checking||review?.status==='running'} onClick={()=>void research()}>{busy||review?.status==='running'?<LoaderCircle size={15} className={styles.spin}/>:<RefreshCw size={15}/>}Check player details</button>:null}
  </header>
  {!ready?<p className={styles.guidance}>Checking for saved updates...</p>:null}
  {review?.status==='running'?<p className={styles.status} role="status"><LoaderCircle size={15} className={styles.spin}/>Checking public sources. You can leave this page and return to the saved check.</p>:null}
  {pending.length?<>
   <div className={styles.detailsList}>{pending.map(field=>{const meta=PLAYER_DETAILS[field.field],choice=choices[field.id]||{decision:'later',value:detailText(field.suggested)},now=detailText(player[field.field]),before=detailText(field.before);return <article key={field.id} className={styles.detailRow} aria-label={meta.label}>
    <h4>{meta.label}</h4><dl className={styles.detailCompare}><div><dt>Recorded now</dt><dd>{now||'Not recorded'}</dd></div><div><dt>Suggested</dt><dd>{detailText(field.suggested)}</dd></div></dl>
    {now!==before?<p className={styles.guidance}>At the source check: {before||'Not recorded'}. The record has changed since then.</p>:null}
    <div className={styles.reviewSources}>{(field.sources||[]).filter(source=>safeSourceUrl(source.url)).map(source=><a key={source.url} href={safeSourceUrl(source.url)!} target="_blank" rel="noreferrer">{source.title||new URL(source.url).hostname}<ExternalLink size={12}/></a>)}</div>
    <label className={styles.detailChoice}><select aria-label={meta.label+' decision'} value={choice.decision} disabled={locked} onChange={event=>setChoices(previous=>({...previous,[field.id]:{...choice,decision:event.target.value as typeof choice.decision}}))}><option value="later">Review later</option><option value="accept">Use suggestion</option><option value="edit">Correct the suggestion</option><option value="reject">Keep recorded value</option></select></label>
    {choice.decision==='edit'?<label className={styles.detailChoice}><span>Corrected {meta.label.toLowerCase()}</span>{meta.type==='foot'?<select aria-label={'Corrected '+meta.label.toLowerCase()} value={choice.value} disabled={locked} onChange={event=>setChoices(previous=>({...previous,[field.id]:{...choice,value:event.target.value}}))}>{['Left','Right','Both'].map(foot=><option key={foot}>{foot}</option>)}</select>:<input aria-label={'Corrected '+meta.label.toLowerCase()} type={meta.type==='date'?'date':meta.type==='number'?'number':meta.type==='url'?'url':'text'} value={choice.value} disabled={locked} min={meta.type==='number'?140:undefined} max={meta.type==='number'?230:undefined} onChange={event=>setChoices(previous=>({...previous,[field.id]:{...choice,value:event.target.value}}))}/>} {meta.type==='list'?<small>Separate nationalities with commas.</small>:null}</label>:null}
   </article>;})}</div>
   {Object.values(choices).some(choice=>choice.decision==='edit')?<p className={styles.guidance}>Your corrections will be kept alongside the original suggestions and sources.</p>:null}
   {review?.checked_at?<p className={styles.guidance}>Source check {compactDateTime(review.checked_at)}</p>:null}
   <div className={styles.actions}><button type="button" data-ui-button="primary" disabled={locked||!dirty} onClick={()=>void save()}>{busy?<LoaderCircle size={15} className={styles.spin}/>:<Check size={15}/>}Save decisions</button><button type="button" data-ui-button="secondary" disabled={locked} onClick={()=>chooseAll('accept')}>Use all suggestions</button>{dirty?<button type="button" data-ui-button="secondary" disabled={busy} onClick={()=>chooseAll('later')}>Clear choices</button>:null}</div>
  </>:null}
  {review?.fields.some(field=>field.decision!=='pending')?<details className={styles.history}><summary>Reviewed details</summary><div className={styles.historyRows}>{review.fields.filter(field=>field.decision!=='pending').map(field=><article key={field.id}><div><strong>{PLAYER_DETAILS[field.field].label}</strong><span>{field.decision==='rejected'?'Kept the recorded value':`Accepted: ${detailText(field.applied_value??field.suggested)}`}</span><span>At the check: {detailText(field.before)||'Not recorded'} · Suggested: {detailText(field.suggested)}</span></div><div className={styles.reviewSources}>{field.sources.filter(source=>safeSourceUrl(source.url)).map(source=><a key={source.url} href={safeSourceUrl(source.url)!} target="_blank" rel="noreferrer">{source.title||new URL(source.url).hostname}<ExternalLink size={12}/></a>)}</div></article>)}</div></details>:null}
  {notice?<p className={styles.status} role="status">{notice}</p>:null}
  {error?<p className={styles.error} role="alert">{error}</p>:null}
  {uncertain||refreshFailed?<div className={styles.actions}><button type="button" data-ui-button="secondary" disabled={checking||busy} onClick={()=>void checkProgress()}>{checking?'Checking progress...':'Check progress'}</button></div>:null}
  {review&&!pending.length&&review.status!=='running'&&statusVersion===review.id&&onContinue?<div className={styles.actions}><button type="button" data-ui-button="primary" disabled={locked||checking} onClick={onContinue}>Continue profile preparation</button></div>:null}
 </section>;
}
