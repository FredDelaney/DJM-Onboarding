'use client';
import JourneyStatus from './JourneyStatus';
import {useCallback,useEffect,useId,useMemo,useRef,useState} from 'react';
import {Clock3,ExternalLink,LoaderCircle,Pencil,RefreshCw,ShieldCheck} from 'lucide-react';
import {friendlyError,compactDateTime} from '@/lib/platform-client';
import {PLAYER_STAT_FIELDS,selectCurrentSeasonEvidence,seasonDraft,validateSeasonDraft,safeSourceUrl,matchesCurrentSeasonContext,type SeasonDraft} from '@/lib/player-data-workflow';
import styles from './AgencyPlayerDataPanel.module.css';

type Invoke=<T=any>(action:string,body?:Record<string,unknown>)=>Promise<T>;
type Job={id:string;status:string;requested_at?:string;context?:{season_label:string;club_name:string;league:string};summary?:{message?:string;checked_at?:string|null;changed_fields?:string[]}};
const labels={appearances:'Apps',starts:'Starts',minutes:'Minutes',goals:'Goals',assists:'Assists'};
const pending=(job:Job|null)=>Boolean(job&&['queued','running'].includes(job.status));
const number=(value:unknown)=>value==null||value===''||!Number.isFinite(Number(value))?'-':Number(value).toLocaleString('en-GB');
async function bounded<T>(promise:Promise<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('The request is taking longer than expected. Check progress to recover.')),12000);})]);}
 finally{clearTimeout(timer);}
}
export default function AgencyPlayerDataPanel({player,career,canEdit,invoke,onChanged,onReview,hasCustomStats=false,onUseRecordedStats,blocked=false,statusVersion=0,managedRefresh=false}:{
 player:any;career:any[];canEdit:boolean;invoke:Invoke;onChanged:()=>Promise<boolean|void>;onReview:()=>void;
 hasCustomStats?:boolean;onUseRecordedStats?:()=>Promise<void>;blocked?:boolean;statusVersion?:number;managedRefresh?:boolean;
}){
 const playerId=String(player.id);
 const managedRefreshRef=useRef(managedRefresh);managedRefreshRef.current=managedRefresh;
 const row=useMemo(()=>selectCurrentSeasonEvidence(career,player),[career,player]);
 const [job,setJob]=useState<Job|null>(null),[starting,setStarting]=useState(false),[checking,setChecking]=useState(false);
 const [editing,setEditing]=useState(false),[saving,setSaving]=useState(false),[draft,setDraft]=useState<SeasonDraft>(()=>seasonDraft(player,row));
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false);
 const alive=useRef(true),jobRef=useRef<Job|null>(null),requestId=useRef<string|null>(null),mutation=useRef(false),statusGeneration=useRef(0);
 const formRef=useRef<HTMLFormElement>(null);
 const setCurrentJob=(value:Job|null)=>{jobRef.current=value;setJob(value);};
 const readStatus=useCallback(async()=>{
  const generation=++statusGeneration.current;
  setChecking(true);
  try{
   const response=await bounded(invoke<any>('player_data_status',{player_id:playerId}));
   if(!alive.current||generation!==statusGeneration.current)return;
   const next=response?.job||null;
   const finished=pending(jobRef.current)&&next&&!pending(next);
   setCurrentJob(next);setUncertain(false);setError('');
   if(finished){requestId.current=null;if(!managedRefreshRef.current){const reloaded=await onChanged();if(alive.current&&generation===statusGeneration.current&&reloaded===false)setError('Update finished, but player data could not reload. Try again.');}}
  }catch(failure){if(alive.current&&generation===statusGeneration.current){setUncertain(true);setError(friendlyError(failure));}}
  finally{if(alive.current&&generation===statusGeneration.current)setChecking(false);}
 },[invoke,onChanged,playerId]);
 useEffect(()=>{
  alive.current=true;void readStatus();
  return()=>{alive.current=false;++statusGeneration.current;};
 },[readStatus,statusVersion]);
 useEffect(()=>{
  if(!pending(job)||uncertain)return;
  const timer=setTimeout(()=>void readStatus(),2500);
  return()=>clearTimeout(timer);
 },[job,uncertain,readStatus]);
 useEffect(()=>{if(editing)formRef.current?.querySelector<HTMLInputElement>('input')?.focus();},[editing]);
 const startRefresh=async()=>{
  if(mutation.current||pending(jobRef.current)||blocked||editing)return;
  ++statusGeneration.current;setChecking(false);
  mutation.current=true;setStarting(true);setError('');setNotice('');
  requestId.current ||= crypto.randomUUID();
  try{
   const response=await bounded(invoke<any>('player_data_refresh',{player_id:playerId,request_id:requestId.current}));
   if(!alive.current)return;
   setCurrentJob(response?.job||null);setUncertain(false);
   if(!response?.job)throw new Error('The update could not be confirmed. Check progress before trying again.');
   if(!pending(response.job)){requestId.current=null;if(await onChanged()===false)throw new Error('Update finished, but player data could not reload. Try again.');}
  }catch(failure){if(alive.current){setUncertain(true);setError(friendlyError(failure));}}
  finally{mutation.current=false;if(alive.current)setStarting(false);}
 };
 const openEditor=()=>{setDraft(seasonDraft(player,row));setEditing(true);setError('');setNotice('');};
 const save=async()=>{
  if(mutation.current||pending(jobRef.current)||blocked)return;
  const invalid=validateSeasonDraft(draft);if(invalid){setError(invalid);return;}
  mutation.current=true;setSaving(true);setError('');setNotice('');
  try{
   await bounded(invoke('player_data_save',{player_id:playerId,row_id:draft.row_id||null,expected_updated_at:draft.expected_updated_at||null,values:draft}));
   if(!alive.current)return;
   setEditing(false);setNotice('Corrections saved. Review before verifying.');
   const reloaded=await onChanged();
   if(alive.current&&reloaded===false)setError('Corrections saved, but the data could not reload. Try again.');
  }catch(failure){if(alive.current)setError(friendlyError(failure));}
  finally{mutation.current=false;if(alive.current)setSaving(false);}
 };
 const reload=async()=>{setChecking(true);try{if(await onChanged()===false)throw new Error('Player data could not reload. Try again when the connection recovers.');await readStatus();}catch(failure){if(alive.current)setError(friendlyError(failure));}finally{if(alive.current)setChecking(false);}};
 const sourceUrl=safeSourceUrl(row?.source_url);
 const sourceDate=row?.source_reviewed_at||row?.source_synced_at;
 const missing=PLAYER_STAT_FIELDS.filter(key=>row?.[key]==null||row?.[key]==='').map(key=>labels[key].toLowerCase());
 const missingContext=[!player.current_season_label?'current season':null,!player.current_club?'club':null,!player.current_league?'competition':null].filter(Boolean);
 const contextReady=missingContext.length===0;
 const contextHintId=useId();
 const busy=starting||saving||pending(job);
 const currentJobContext=!job?.context||matchesCurrentSeasonContext(job.context,player);
 const field=(key:keyof SeasonDraft,value:string|boolean)=>setDraft(current=>({...current,[key]:value}));
 return <section className={styles.panel} aria-label="Player data">
  <header className={styles.header}>
   <div><span className={styles.kicker}>PLAYER DATA</span><h3>Current-season statistics</h3><p>{[player.current_season_label,player.current_club,player.current_league].filter(Boolean).join(' · ')||'Add the season, club and competition to start.'}</p></div>
   {canEdit?<button type="button" data-ui-button="secondary" className={styles.update} onClick={()=>void startRefresh()} disabled={busy||editing||blocked||!contextReady||uncertain} aria-describedby={!contextReady?contextHintId:undefined}>
    {busy?<LoaderCircle size={15} className={styles.spin}/>:<RefreshCw size={15}/>}
    {starting?'Starting update...':pending(job)?'Updating statistics...':'Update statistics'}
   </button>:null}
  </header>
  {canEdit&&!contextReady?<p id={contextHintId} className={styles.guidance}>Add the {missingContext.join(', ')} to update statistics. Use Add season statistics below.</p>:null}
  <div className={styles.stats} aria-label="Season statistics">{PLAYER_STAT_FIELDS.map(key=><div key={key}><span>{labels[key]}</span><strong aria-label={row?.[key]==null||row?.[key]===''?labels[key]+' not available':undefined} className={row?.[key]==null||row?.[key]===''?styles.unknown:undefined}>{number(row?.[key])}</strong></div>)}</div>
  {pending(job)?<JourneyStatus compact kind="loading" title="Checking current-season sources" description="You can keep using the profile while this finishes."/>:job?.summary?.message&&(job.status==='failed'||!currentJobContext)?<JourneyStatus compact kind="warning" title={!currentJobContext?'Season details changed':'Update needs attention'} description={currentJobContext?job.summary.message:'Update the statistics to check the current season and club.'}/>:null}
  <details className={styles.history}>
   <summary>Sources and history</summary>
  <div className={styles.provenance}>
   <span><ShieldCheck size={14}/>{row?.source_name||'Source not set'}</span>
   {sourceDate?<span><Clock3 size={14}/>{row?.source_reviewed_at?'Source reviewed':'Source updated'} {compactDateTime(sourceDate)}</span>:<span>Source date not set</span>}
   {sourceUrl?<a href={sourceUrl} target="_blank" rel="noreferrer">Open source <ExternalLink size={12}/></a>:null}
  </div>
  {contextReady&&!row?<p className={styles.guidance}>No statistics match this selection.</p>:row&&missing.length?<p className={styles.guidance}>Not set: {missing.join(', ')}. Unknown figures stay blank when you edit.</p>:null}
  {!pending(job)&&currentJobContext&&job?.status!=='failed'&&job?.summary?.message?<JourneyStatus compact kind="success" title="Source check finished" description={job.summary.message}>{job.summary.checked_at?<small>Checked {compactDateTime(job.summary.checked_at)}</small>:null}</JourneyStatus>:null}
  {career.length?<div className={styles.historyRows}>{career.map(entry=><article key={entry.id}>
   <div><strong>{entry.season_label||'Season not set'} · {entry.club_name||'Club not set'}</strong><span>{entry.league||'Competition not set'}</span></div>
   <p>{PLAYER_STAT_FIELDS.filter(key=>entry[key]!=null).map(key=>number(entry[key])+' '+labels[key].toLowerCase()).join(' · ')||'No figures recorded'}</p>
   <small>{entry.source_name||'Source not set'}{safeSourceUrl(entry.source_url)?<a href={safeSourceUrl(entry.source_url)!} target="_blank" rel="noreferrer">Open source <ExternalLink size={11}/></a>:null}</small>
  </article>)}</div>:null}
  </details>
  {error?<JourneyStatus compact kind="error" description={error} onRetry={()=>void reload()} retryBusy={checking} retryDisabled={saving} retryLabel="Reload player data"/>:null}
  {notice?<JourneyStatus compact kind="success" description={notice}/>:null}
  {hasCustomStats?<div className={styles.customStats}><span>The club profile uses custom headline statistics.</span>{canEdit&&onUseRecordedStats?<button type="button" data-ui-button="secondary" disabled={busy||blocked||editing} onClick={()=>void onUseRecordedStats().catch(failure=>setError(friendlyError(failure)))}>Use current statistics</button>:null}</div>:null}
  {!editing?<div className={styles.actions}>
   {canEdit?<button type="button" data-ui-button="secondary" onClick={openEditor} disabled={busy||blocked||uncertain}><Pencil size={14}/>{row?'Edit current statistics':'Add season statistics'}</button>:null}
   {pending(job)||uncertain?<button type="button" data-ui-button="secondary" onClick={()=>void readStatus()} disabled={checking}>{checking?'Checking...':'Check progress'}</button>:null}
   {canEdit&&(player.review_required_at||player.review_reason)?<button type="button" data-ui-button="secondary" onClick={onReview} disabled={busy||blocked}>Review current player data</button>:null}
  </div>:<form ref={formRef} className={styles.form} onSubmit={event=>{event.preventDefault();void save();}} aria-label="Edit current-season statistics">
   <div className={styles.formHeading}><h4>{row?'Correct the current statistics':'Add season statistics'}</h4><p>Set the current season. Keep league and cup figures separate.</p></div>
   <div className={styles.fields}>{(['season_label','club_name','league','country'] as const).map(key=><label key={key}>{({season_label:'Season',club_name:'Club',league:'Competition',country:'Country'})[key]}<input value={draft[key]} onChange={event=>field(key,event.target.value)} required={key!=='country'} maxLength={key==='season_label'?40:key==='country'?100:180}/></label>)}</div>
   <div className={styles.statFields}>{PLAYER_STAT_FIELDS.map(key=><label key={key}>{labels[key]}<input inputMode="numeric" value={draft[key]} onChange={event=>field(key,event.target.value)} placeholder="Unknown" aria-label={labels[key]}/></label>)}</div>
   <div className={styles.fields}><label>Source name<input value={draft.source_name} onChange={event=>field('source_name',event.target.value)} required maxLength={180} placeholder="Official competition website"/></label><label>Source link<input type="url" value={draft.source_url} onChange={event=>field('source_url',event.target.value)} required maxLength={2000} placeholder="https://..." /></label></div>
   <label className={styles.confirm}><input type="checkbox" checked={draft.source_confirmed} onChange={event=>field('source_confirmed',event.target.checked)}/>I checked these figures against the linked source.</label>
   <div className={styles.actions}><button type="submit" data-ui-button="primary" disabled={saving||pending(job)}>{saving?'Saving...':'Save reviewed statistics'}</button><button type="button" data-ui-button="secondary" onClick={()=>{setEditing(false);setError('');}} disabled={saving}>Cancel editing</button></div>
  </form>}
 </section>;
}
