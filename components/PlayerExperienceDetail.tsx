'use client';

import {ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, CircleAlert, ClipboardCheck, ChevronDown, FileText, Link2, LoaderCircle, Mail, Pencil, Plus, RefreshCw, ShieldCheck, Sparkles, Target, Users, X} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import ClubIdentityMark,{CountryFlag} from './ClubIdentityMark';
import EntityActionsMenu from './EntityActionsMenu';
import PlayerProfilePhoto from './PlayerProfilePhoto';
import PlayerStaffControl from './PlayerStaffControl';
import PlayerLeadAgentControl from './PlayerLeadAgentControl';
import PlayerTeamAgentsControl from './PlayerTeamAgentsControl';
import PlayerSalaryTerms from './PlayerSalaryTerms';
import RecordContactActions from './RecordContactActions';
import {friendlyError,relativeDate} from '@/lib/platform-client';
import {PLAYER_AGENCY_STATUSES,playerAgencyStatus,playerAgencyStatusLabel,type PlayerAgencyStatus} from '@/lib/player-agency-status';
import {prefetchPlayerProfile,invalidatePlayerProfile} from '@/lib/player-profile-cache';
import {writeWithDeadline} from '@/lib/write-with-deadline';
import {confirmsEntityAction} from '@/lib/entity-action-result';
import {recruitmentToPlayerProfile} from '@/lib/recruitment-player-profile';
import type {AgencyActionRequest} from '@/components/AgencyActionDrawer';
import styles from './PlayerExperience.module.css';

type Invoke=<T,>(action:string,body?:Record<string,unknown>)=>Promise<T>;
type Rpc=<T,>(name:string,args?:Record<string,unknown>,signal?:AbortSignal)=>Promise<T>;
type RecruitmentProfile = {
 target:any;interactions:any[];loading?:boolean;error?:string;notice?:string;
 writeError?:string;uncertain?:boolean;refreshFailed?:boolean;
 canWork:boolean;canPromote:boolean;locked:boolean;saving:string;
 nextStage:readonly [string,string]|null;
 onMoveStage:()=>void;onConfirmStage:()=>void;onConfirmPromotion:()=>void;
 onRefresh:()=>Promise<void>;onRecover:()=>Promise<void>;onRetry:()=>void;
 followupDraft:string;onFollowupDraft:(value:string)=>void;onSaveFollowup:()=>void;
 interaction:string;onInteraction:(value:string)=>void;
 channel:string;onChannel:(value:string)=>void;
 direction:string;onDirection:(value:string)=>void;onLogInteraction:()=>void;
};
type Props={playerId:string;summary?:any;cacheScope:string;canManageRecords:boolean;basePath:string;invoke:Invoke;rpc:Rpc;onRefresh:()=>Promise<void>;onClose:()=>void;backLabel?:'Players'|'Recruitment';onOpenAction:(request:AgencyActionRequest)=>void;recruitment?:RecruitmentProfile};
type Tab='profile'|'tasks'|'updates'|'deals'|'documents'|'career';
type EditKey='primary_position'|'current_club'|'current_country'|'contract_expiry';
const editFields:{key:EditKey;label:string;type:'text'|'date'}[]=[
 {key:'primary_position',label:'Position',type:'text'},{key:'current_club',label:'Current club',type:'text'},
 {key:'current_country',label:'Club country',type:'text'},{key:'contract_expiry',label:'Club contract expiry',type:'date'},
];
const raw=(value:unknown)=>String(value??'').trim();
const human=(value:unknown)=>raw(value).replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
const dateText=(value:unknown)=>{const v=raw(value);if(!v)return 'Not recorded';const d=new Date(v.slice(0,10)+'T12:00:00Z');return Number.isNaN(d.getTime())?v:new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(d);};
const ageFrom=(value:unknown)=>{const v=raw(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;const d=new Date(v+'T12:00:00Z');if(Number.isNaN(d.getTime()))return null;const today=new Date();let age=today.getUTCFullYear()-d.getUTCFullYear();if(today.getUTCMonth()<d.getUTCMonth()||(today.getUTCMonth()===d.getUTCMonth()&&today.getUTCDate()<d.getUTCDate()))age--;return age>=0&&age<110?age:null;};
const daysUntil=(value:unknown)=>{const v=raw(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;const d=new Date(v+'T12:00:00Z');return Number.isNaN(d.getTime())?null:Math.ceil((d.getTime()-Date.now())/86400000);};
const pickDraft=(identity:any):Record<EditKey,string>=>({primary_position:raw(identity?.primary_position),current_club:raw(identity?.current_club),current_country:raw(identity?.current_country),contract_expiry:raw(identity?.contract_expiry)});
const plural=(n:number,label:string)=>n+' '+label+(n===1?'':'s');
function ContractCard({title,expiry,empty='No expiry recorded'}:{title:string;expiry?:unknown;empty?:string}){
 const days=daysUntil(expiry);
 return <section className={styles.contractCard}>
  <div className={styles.cardLabel}><CalendarDays size={16}/>{title}</div>
  <strong>{expiry?dateText(expiry):empty}</strong>
  {days!==null?<><div className={styles.contractMeter} role="meter" aria-label={title+' time remaining over a two-year planning horizon'} aria-valuemin={0} aria-valuemax={730} aria-valuenow={Math.min(730,Math.max(0,days))}><span style={{width:Math.min(100,Math.max(0,days/730*100))+'%',background:days<90?'#f5b741':days<365?'#e3b338':'#20b879'}}/></div><small>{days<0?plural(Math.abs(days),'day')+' overdue':days===0?'Expires today':plural(days,'day')+' remaining'}</small></>:<small>Update the player record when the date is confirmed.</small>}
 </section>;
}
function EmptyPanel({icon:Icon,title,description}:{icon:typeof Users;title:string;description:string}){return <div className={styles.workEmpty}><span><Icon size={22}/></span><h3>{title}</h3><p>{description}</p></div>;}

export default function PlayerExperienceDetail({playerId,summary,cacheScope,canManageRecords,basePath,invoke,rpc,onRefresh,onClose,onOpenAction,recruitment,backLabel='Players'}:Props){
 const initial=summary?{identity:summary.identity||{},service:summary.service||{},profile:summary.profile||{},agreements:[],documents:[],opportunities:[],deals:[],activity:[],career_alignment:{}}:null;
 const [detail,setDetail]=useState<any>(initial);
 const [loading,setLoading]=useState(!initial);
 const [fullDetailReady,setFullDetailReady]=useState(false);
 const [error,setError]=useState('');
 const [tab,setTab]=useState<Tab>('profile');
 const [editing,setEditing]=useState(false);
 const [draft,setDraft]=useState<Record<EditKey,string>>(()=>pickDraft(initial?.identity));
 const [displayName,setDisplayName]=useState(raw(initial?.identity?.name));
 const [agencyStatusDraft,setAgencyStatusDraft]=useState<PlayerAgencyStatus>(()=>playerAgencyStatus(initial?.identity?.agency_status));
 const [statusOpen,setStatusOpen]=useState(false);
 const [statusDraft,setStatusDraft]=useState<PlayerAgencyStatus>(()=>playerAgencyStatus(initial?.identity?.agency_status));
 const [statusBusy,setStatusBusy]=useState(false);
 const [statusError,setStatusError]=useState('');
 const [statusUnconfirmed,setStatusUnconfirmed]=useState(false);
 const [saveBusy,setSaveBusy]=useState(false);
 const [saveError,setSaveError]=useState('');
 const [savedMessage,setSavedMessage]=useState('');
 const mutation=useRef(false);
 const alive=useRef(true);
 const request=useRef(0);
 const recruitmentHeading=useRef<HTMLHeadingElement>(null),recruitmentFeedback=useRef<HTMLDivElement>(null),recruitmentNotice=useRef<HTMLParagraphElement>(null);
 const reload=useCallback(async()=>{
  const sequence=++request.current;setError('');
  try{const response=await invoke<any>('player_workspace',{player_id:playerId});if(alive.current&&sequence===request.current){
    if(!response?.player?.identity){
     setFullDetailReady(false);
     if(!summary?.identity)throw new Error('The player record could not be confirmed.');
     setError('Full details are unavailable. Showing the latest roster summary. Retry before editing.');
    }else{
     setDetail({...response.player,identity:{...(summary?.identity||{}),...response.player.identity},service:{...(summary?.service||{}),...(response.player.service||{})}});
     setFullDetailReady(true);
     return true;
    }
   }}
  catch(cause){if(alive.current&&sequence===request.current)setError(friendlyError(cause));}
  finally{if(alive.current&&sequence===request.current)setLoading(false);}
  return false;
 },[invoke,playerId,summary]);
 useEffect(()=>{alive.current=true;if(!recruitment){void prefetchPlayerProfile(playerId,invoke,cacheScope).catch(()=>undefined);void reload();}return()=>{alive.current=false;request.current++;};},[playerId,invoke,cacheScope,reload,Boolean(recruitment)]);
 const isRecruitment=Boolean(recruitment);
 const viewDetail=isRecruitment?recruitmentToPlayerProfile(recruitment?.target,recruitment?.interactions):detail;
 useEffect(()=>{
  if(recruitment?.target?.id&&!recruitment.loading)recruitmentHeading.current?.focus();
 },[recruitment?.target?.id,recruitment?.loading]);
 useEffect(()=>{
  if(recruitment?.writeError||recruitment?.uncertain||recruitment?.refreshFailed)recruitmentFeedback.current?.focus();
  else if(recruitment?.notice)recruitmentNotice.current?.focus();
 },[recruitment?.writeError,recruitment?.uncertain,recruitment?.refreshFailed,recruitment?.notice]);
 const identity=viewDetail?.identity||{},service=viewDetail?.service||{},career=viewDetail?.career_alignment||{};
 const name=raw(identity.name)||'Player';
 const agreements=Array.isArray(viewDetail?.agreements)?viewDetail.agreements:[];
 const documents=Array.isArray(viewDetail?.documents)?viewDetail.documents:[];
 const opportunities=Array.isArray(viewDetail?.opportunities)?viewDetail.opportunities:[];
 const deals=Array.isArray(viewDetail?.deals)?viewDetail.deals:[];
 const activity=Array.isArray(viewDetail?.activity)?viewDetail.activity:[];
 const representation=agreements.find((a:any)=>a?.status==='active'&&['representation','mandate','placement_authorisation'].includes(raw(a.agreement_type)));
 const restricted=Boolean(summary?.access?.restricted||viewDetail?.access?.restricted);
 const canEdit=(isRecruitment?Boolean(recruitment?.target?.id&&recruitment?.canWork&&!recruitment?.locked):fullDetailReady)&&canManageRecords&&!restricted;
 const reloadView=()=>isRecruitment?recruitment!.onRefresh():reload();
 const playerProfileUrl=basePath+'?view=players&player='+encodeURIComponent(playerId)+'&profile=1';
 const mainNext=identity.next_action||service?.next_service_move?.instruction||service?.next_control_fix?.instruction;
 const nationalities=Array.isArray(identity.nationalities)?identity.nationalities.filter(Boolean):[];
 const age=ageFrom(identity.date_of_birth);
 const nextAction=()=>{
  const control=service?.next_control_fix,move=service?.next_service_move;
  const selected=move?.instruction?move:control;
  if(!selected?.instruction)return;
  onOpenAction({key:'player:'+playerId,eyebrow:'PLAYER',title:name,instruction:selected.instruction,label:move?.instruction?'Prepare next move':'Review next step',action:move?.instruction?'player_service_move_prepare':'player_control_fix_prepare',payload:{player_id:playerId},facts:[{label:'Contract timing',value:identity.contract_expiry?relativeDate(identity.contract_expiry):'Not recorded'},{label:'Current club',value:identity.current_club||'Not recorded'}],successCondition:selected.success_condition||'Next step reviewed.'});
 };
 const reviewDueDate=()=>{
  const control=service?.next_control_fix;
  if(!identity.next_action||identity.next_action_due||!control?.instruction)return;
  onOpenAction({key:'player:'+playerId+':due',eyebrow:'PLAYER',title:name,instruction:control.instruction,label:'Review due date',action:'player_control_fix_prepare',payload:{player_id:playerId},facts:[{label:'Recorded next action',value:identity.next_action},{label:'Due date',value:'Not recorded'}],successCondition:control.success_condition||'Due date reviewed.'});
 };
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();if(!canEdit||mutation.current)return;
  const patch=Object.fromEntries(editFields.filter(field=>draft[field.key]!==raw(identity[field.key])).map(field=>[field.key,draft[field.key]]));
  if(!isRecruitment&&agencyStatusDraft!==playerAgencyStatus(identity.agency_status))patch.agency_status=agencyStatusDraft;
  if(displayName.trim()!==name){
   if(!displayName.trim()||displayName.trim().length>120){setSaveError('Enter a player name of no more than 120 characters.');return;}
   patch[isRecruitment?'full_name':'preferred_name']=displayName.trim();
  }
  if(!Object.keys(patch).length){setEditing(false);return;}
  mutation.current=true;setSaveBusy(true);setSaveError('');setSavedMessage('');
  try{
   const kind=isRecruitment?'recruitment_target':'player';
   const outcome=await writeWithDeadline(async signal=>{try{return {value:await rpc<any>('redream_entity_patch',{p_entity_type:kind,p_entity_id:playerId,p_patch:patch},signal)};}catch(cause){return {error:cause};}},12000);
   if(!alive.current)return;
   if(outcome.status==='unknown'){setSaveError('The save could not be confirmed. It may still complete. Please reload the latest details before trying again.');return;}
   if('error' in outcome.result){setSaveError(friendlyError(outcome.result.error));return;}
   if(!confirmsEntityAction(outcome.result.value,'edit',isRecruitment?'recruitment_target':'player',playerId,false)){setSaveError('The save could not be confirmed. Reload before editing again.');return;}
   await Promise.all([reloadView(),onRefresh()]);
   if(!alive.current)return;
   setEditing(false);setSavedMessage('Player details saved.');
  }catch(cause){if(alive.current)setSaveError(friendlyError(cause));}
  finally{mutation.current=false;if(alive.current)setSaveBusy(false);}
 };
 const openStatusPicker=()=>{
  if(!canEdit||mutation.current||editing||statusUnconfirmed)return;
  setStatusDraft(playerAgencyStatus(identity.agency_status));
  setStatusError('');
  setStatusUnconfirmed(false);
  setSavedMessage('');
  setStatusOpen(true);
 };
 const saveStatus=async()=>{
  if(!canEdit||mutation.current||statusUnconfirmed)return;
  const currentStatus=playerAgencyStatus(identity.agency_status);
  if(statusDraft===currentStatus){setStatusOpen(false);return;}
  mutation.current=true;setStatusBusy(true);setStatusError('');setSavedMessage('');
  try{
   const outcome=await writeWithDeadline(async signal=>{
    try{return {value:await rpc<any>('redream_entity_patch',{
     p_entity_type:'player',p_entity_id:playerId,p_patch:{agency_status:statusDraft},
    },signal)};}catch(cause){return {error:cause};}
   },12000);
   if(!alive.current)return;
   if(outcome.status==='unknown'){
    setStatusUnconfirmed(true);
    setStatusError('The save could not be confirmed. Reload the player before making another change.');
    return;
   }
   if('error' in outcome.result){setStatusError(friendlyError(outcome.result.error));return;}
   if(!confirmsEntityAction(outcome.result.value,'edit','player',playerId,false)){
    setStatusUnconfirmed(true);
    setStatusError('The save could not be confirmed. Reload the player before making another change.');
    return;
   }
   const recorded=statusDraft;
   setDetail((current:any)=>current?{...current,identity:{...current.identity,agency_status:recorded}}:current);
   setStatusOpen(false);
   setSavedMessage('Agency status updated to '+playerAgencyStatusLabel(recorded)+'.');
   // A confirmed write is not undone just because a background refresh fails.
   await Promise.allSettled([reload(),onRefresh()]);
  }catch(cause){if(alive.current)setStatusError(friendlyError(cause));}
  finally{mutation.current=false;if(alive.current)setStatusBusy(false);}
 };
 const refreshUnconfirmedStatus=async()=>{
  if(statusBusy||mutation.current)return;
  setStatusBusy(true);
  try{
   if(await reload()){
    setStatusUnconfirmed(false);
    setStatusError('');
    setStatusOpen(false);
    await Promise.allSettled([onRefresh()]);
   }
  }finally{if(alive.current)setStatusBusy(false);}
 };
 const openEdit=()=>{if(statusUnconfirmed&&!isRecruitment)return;setStatusOpen(false);setDraft(pickDraft(identity));setAgencyStatusDraft(playerAgencyStatus(identity.agency_status));setDisplayName(name);setSaveError('');setSavedMessage('');setEditing(true);};
 const editableFields=editFields.map(field=>({...field,value:identity[field.key]}));
 const rosterStatus=isRecruitment?'prospected':playerAgencyStatus(identity.agency_status);
 return <div className={styles.playerSurface} role="region" aria-label={name+' player workspace'}>
  <div className={styles.playerPageHeader}><button type="button" className={styles.backLink} onClick={onClose} aria-label={'Back to '+backLabel}><ArrowLeft size={17}/><span>{backLabel}</span></button><div className={styles.playerTopActions}>{isRecruitment?<button type="button" onClick={()=>setTab('profile')}><Sparkles size={16}/> Player Profile</button>:<Link href={playerProfileUrl}><Sparkles size={16}/> Player Profile</Link>}{canEdit?<EntityActionsMenu scope={cacheScope} kind={isRecruitment?'recruitment_target':'player'} entityId={playerId} label={name} rpc={rpc} onChanged={async(change)=>{await onRefresh();if(isRecruitment){if(change==='edit')await recruitment!.onRefresh();else onClose();}else await reload();}} fields={isRecruitment?[{key:'full_name',label:'Player name',value:name},...editableFields,{key:'transfermarkt_url',label:'Transfermarkt URL',type:'url',value:recruitment?.target?.transfermarkt_url}]:editableFields}/>:null}</div></div>
  {(isRecruitment?recruitment?.loading:loading)?<div className={styles.loadState}><LoaderCircle size={22}/> Loading player...</div>:null}
  {(isRecruitment?recruitment?.error:error)?<div className={styles.loadState} role="alert"><CircleAlert size={19}/>{isRecruitment?<strong>Recruitment target unavailable</strong>:null}{isRecruitment?recruitment?.error:error}<button type="button" onClick={()=>isRecruitment?recruitment?.onRetry():void reload()}>{isRecruitment?'Try again':'Retry'}</button></div>:null}
  {recruitment?.notice?<p ref={recruitmentNotice} tabIndex={-1} role="status" className={styles.editSuccess}>{recruitment.notice}</p>:null}
  {recruitment?.writeError||recruitment?.uncertain||recruitment?.refreshFailed?<div ref={recruitmentFeedback} tabIndex={-1} role="alert" className={styles.editError}>{recruitment?.writeError||(recruitment?.uncertain?'Could not confirm the save. Your draft is kept. Check the latest details before trying again; the original request may still finish.':'The change is saved, but the latest details could not refresh.')}<button type="button" onClick={()=>void recruitment?.onRecover()}>{recruitment?.uncertain?'Check latest details':recruitment?.refreshFailed?'Refresh details':'Reload details'}</button></div>:null}
  {viewDetail?<div className={styles.playerDetailGrid}>
   <aside className={styles.identityRail} aria-label="Player identity">
    <div className={styles.identityCover}>
     {isRecruitment?<div className={styles.recruitmentPortrait} role="img" aria-label={name+' portrait placeholder'}>{name.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()}</div>:<PlayerProfilePhoto playerId={playerId} name={name} path={identity.profile_photo_path} canEdit={canEdit} invoke={invoke} className={styles.identityPortrait} onSaved={path=>{invalidatePlayerProfile(playerId,cacheScope);setDetail((current:any)=>current?{...current,identity:{...current.identity,profile_photo_path:path}}:current);void onRefresh();}}/>}
     {canEdit?<button type="button" className={styles.identityEdit} aria-label="Edit player" onClick={openEdit} disabled={statusUnconfirmed||statusBusy}><Pencil size={17}/></button>:null}
    </div>
    <h1 ref={recruitmentHeading} tabIndex={isRecruitment?-1:undefined}>{name}</h1>
    {isRecruitment?<button type="button" className={styles.insightsLink} onClick={()=>setTab('profile')}><Sparkles size={15}/> Player Profile</button>:<Link className={styles.insightsLink} href={playerProfileUrl}><Sparkles size={15}/> Player Profile</Link>}
    <div className={styles.identityContacts}>{canEdit?<RecordContactActions kind={isRecruitment?'recruitment_target':'player'} recordId={playerId} name={name} scope={cacheScope} rpc={rpc}/>:null}</div>
    <div className={styles.identityStats}>
     <div>
      <div className={styles.statusPickerAnchor}>
       {canEdit&&!editing&&!isRecruitment?<button type="button" className={styles.statusPickerTrigger} aria-label={'Change status for '+name} aria-expanded={statusOpen} onClick={statusOpen?()=>{if(!statusBusy&&!statusUnconfirmed)setStatusOpen(false);}:openStatusPicker} disabled={statusBusy||saveBusy}>
        <span className={styles.statusChip} data-status={rosterStatus}>{isRecruitment?'Prospected':playerAgencyStatusLabel(identity.agency_status)}</span>
        <ChevronDown size={13} aria-hidden="true"/>
       </button>:<span className={styles.statusChip} data-status={rosterStatus}>{isRecruitment?'Prospected':playerAgencyStatusLabel(identity.agency_status)}</span>}
       {canEdit&&!editing&&!isRecruitment&&statusOpen?<div className={styles.statusPickerPopover} role="group" aria-label="Choose agency status">
        <p className={styles.statusPickerTitle}>Change agency status</p>
        <div className={styles.statusPickerChoices}>{PLAYER_AGENCY_STATUSES.map(option=><button type="button" key={option.value} className={styles.statusPickerChoice} aria-pressed={statusDraft===option.value} disabled={statusBusy||statusUnconfirmed} onClick={()=>setStatusDraft(option.value)}>
         <span className={styles.statusChip} data-status={option.value}>{option.label}</span>
         {statusDraft===option.value?<Check size={15} aria-hidden="true"/>:null}
        </button>)}</div>
        {statusError?<p role="alert" className={styles.statusPickerError}>{statusError}</p>:null}
        <div className={styles.statusPickerFooter}>
         <button type="button" onClick={()=>setStatusOpen(false)} disabled={statusBusy||statusUnconfirmed}>Cancel</button>
         {statusUnconfirmed?<button type="button" onClick={()=>void refreshUnconfirmedStatus()} disabled={statusBusy}>Reload record</button>
         :<button type="button" onClick={()=>void saveStatus()} disabled={statusBusy||statusDraft===playerAgencyStatus(identity.agency_status)}>{statusBusy?'Saving...':'Save status'}</button>}
        </div>
       </div>:null}
      </div>
      <span>Status</span>
     </div>
     <div><strong>{age??'–'}</strong><span>Age</span></div>
     <div><strong>{raw(identity.primary_position)||'–'}</strong><span>Position</span></div>
    </div>
    <dl className={styles.identityFacts}>
     <div><dt>Nationality</dt><dd>{nationalities.length?<><CountryFlag country={nationalities[0]}/>{nationalities.join(', ')}</>:'Not recorded'}</dd></div>
     <div><dt>Date of birth</dt><dd>{dateText(identity.date_of_birth)}</dd></div>
     <div><dt>Preferred foot</dt><dd>{raw(identity.preferred_foot)||'Not recorded'}</dd></div>
     <div><dt>Height</dt><dd>{identity.height_cm?String(identity.height_cm)+' cm':'Not recorded'}</dd></div>
     {identity.current_country?<div><dt>Current country</dt><dd><CountryFlag country={identity.current_country}/>{identity.current_country}</dd></div>:null}
    </dl>
   </aside>
   <div className={styles.playerContent}>
    {restricted?<section className={styles.restrictedPanel} role="note">
     <ShieldCheck size={22}/>
     <h2>Assigned player</h2>
     <p>This player is visible to you, but contract, deal, task and other private agency information requires administrator access.</p>
    </section>:editing?<form className={styles.playerEdit} onSubmit={event=>void save(event)}>
     <div className={styles.editHead}><div><p>PLAYER DETAILS</p><h2>Edit player</h2><span>Changes are saved to this agency's {isRecruitment?'recruitment':'player'} record.</span></div><button type="button" aria-label="Close editing" onClick={()=>setEditing(false)} disabled={saveBusy}><X size={18}/></button></div>
     <div className={styles.editColumns}>
      <section className={styles.editPanel}><h3>Player Information</h3><label>Player name<input type="text" value={displayName} maxLength={120} onChange={event=>setDisplayName(event.target.value)} disabled={saveBusy} aria-label="Player name" required/></label><p className={styles.editHelp}>Changes the player display name. Full legal-name details remain in Manage.</p>
       {isRecruitment?<label>Agency status<input value="Prospected" readOnly title="The player remains in recruitment until explicitly promoted."/></label>:<><label>Agency status<select aria-label="Agency status" value={agencyStatusDraft} onChange={event=>setAgencyStatusDraft(event.target.value as PlayerAgencyStatus)} disabled={saveBusy}>{PLAYER_AGENCY_STATUSES.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label><p className={styles.editHelp}>Signed: represented by our agency. Mandated: specific mandate. Prospect: someone we are evaluating.</p></>}
       <label>Position<input value={draft.primary_position} onChange={event=>setDraft({...draft,primary_position:event.target.value})} disabled={saveBusy}/></label>
       <label>Nationality<input value={nationalities.join(', ')} readOnly title="Verified football details"/></label>
       <label>Date of birth<input value={raw(identity.date_of_birth)} readOnly title="Edit verified football details in Player Profile."/></label>
       <label>Preferred foot<input value={raw(identity.preferred_foot)} readOnly title="Edit verified football details in Player Profile."/></label>
       <label>Height (cm)<input value={raw(identity.height_cm)} readOnly title="Edit verified football details in Player Profile."/></label>
       {!isRecruitment?<Link className={styles.editExtended} href={playerProfileUrl}>Edit verified football data <ArrowRight size={15}/></Link>:null}
      </section>
      <div className={styles.editRight}>
       <section className={styles.editPanel}><h3>Contact Information</h3>{canEdit?<RecordContactActions kind={isRecruitment?'recruitment_target':'player'} recordId={playerId} name={name} scope={cacheScope} rpc={rpc}/>:null}</section>
       <section className={styles.editPanel}><h3>Club Information</h3>
        <label>Current club<input value={draft.current_club} onChange={event=>setDraft({...draft,current_club:event.target.value})} disabled={saveBusy}/></label>
        <label>Club country<input value={draft.current_country} onChange={event=>setDraft({...draft,current_country:event.target.value})} disabled={saveBusy}/></label>
        <label>Club contract expiry<input type="date" value={draft.contract_expiry} onChange={event=>setDraft({...draft,contract_expiry:event.target.value})} disabled={saveBusy}/></label>
       </section>
       <section className={styles.editPanel}><h3>Agency Information</h3>{isRecruitment?<p className={styles.editHelp}>Recruitment stage: {identity.recruitment_stage}. Representation is not recorded until the player is formally promoted.</p>:<><p className={styles.editHelp}>Change the lead agent from the player profile. Tagged staff receive reminders and do not automatically gain player access.</p><PlayerStaffControl playerId={playerId} scope={cacheScope} rpc={rpc}/></>}</section>
      </div>
     </div>
     {saveError?<p role="alert" className={styles.editError}>{saveError}<button type="button" onClick={()=>void reloadView()} disabled={saveBusy}>Reload record</button></p>:null}
     <div className={styles.editFooter}><button type="button" onClick={()=>setEditing(false)} disabled={saveBusy}>Cancel</button><button type="submit" disabled={saveBusy}>{saveBusy?<LoaderCircle size={17}/>:<Check size={17}/>} {saveBusy?'Saving...':'Done'}</button></div>
    </form>:<>
     <nav className={styles.detailTabs} aria-label="Player sections">{([['profile','Profile'],['tasks','Tasks'],['updates','Updates'],['deals','Deals']] as const).map(([key,label])=><button key={key} type="button" aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}>{label}</button>)}</nav>
     {savedMessage?<p role="status" className={styles.editSuccess}>{savedMessage}</p>:null}
     {tab==='profile'?<div className={styles.playerSection}>
      <h2>Club Information</h2>
      <div className={styles.profileInfoGrid}>
       <div className={styles.profileInfoColumn}>
        <section className={styles.clubInfoCard}><ClubIdentityMark name={raw(identity.current_club)||'Club'} country={raw(identity.current_country)}/><div><strong>{identity.current_club||'No current club recorded'}</strong><span>{identity.current_league||'Current club'}</span></div>{canEdit?<button type="button" onClick={openEdit} aria-label="Edit club"><Pencil size={16}/></button>:null}</section>
        <ContractCard title="Club Contract Expiry" expiry={identity.contract_expiry}/>
       </div>
       <section className={styles.nextCard}><div className={styles.cardLabel}><Target size={16}/> Next move</div><strong>{mainNext||'No next action recorded'}</strong><p>{identity.next_action_due?'Due '+relativeDate(identity.next_action_due):'Keep the next player action visible and up to date.'}</p>{isRecruitment?<button type="button" onClick={()=>setTab('tasks')}>Manage follow-up <ArrowRight size={15}/></button>:mainNext&&!identity.next_action&&(service?.next_control_fix?.instruction||service?.next_service_move?.instruction)?<button type="button" onClick={nextAction}>Review next action <ArrowRight size={15}/></button>:<Link href={basePath+'?view=calendar'}>Open Calendar <ArrowRight size={15}/></Link>}</section>
      </div>
      <h2>Agency Information</h2>
      <div className={styles.profileInfoGrid}>
       <div className={styles.profileInfoColumn}>
        <ContractCard title="Agency Contract Expiry" expiry={representation?.end_date} empty={representation?'No expiry recorded':'No active agreement'}/>
        {!isRecruitment&&canEdit?<PlayerLeadAgentControl playerId={playerId} scope={cacheScope} rpc={rpc} onChanged={async()=>{await Promise.allSettled([reload(),onRefresh()]);}}/>:null}
        <div className={styles.staffCard}>
         <h3>Assigned agents</h3>
         <p className={styles.editHelp}>Add agents who work with this player. The lead remains accountable.</p>
         {isRecruitment?<p className={styles.editHelp}>Agency agents can be assigned when the recruitment target is promoted to a player. Recruitment interactions stay attached to this target.</p>:<PlayerTeamAgentsControl playerId={playerId} playerName={name} scope={cacheScope} rpc={rpc}
          initialAgents={Array.isArray(identity.assigned_agents)?identity.assigned_agents:[]}
          variant="profile" canManage={canEdit} onChanged={async()=>{await Promise.allSettled([reload(),onRefresh()]);}}/>}
        </div>
        {!isRecruitment?<div className={styles.staffCard}><PlayerStaffControl playerId={playerId} scope={cacheScope} rpc={rpc}/></div>:null}
        {isRecruitment?<section className={styles.nextCard}><div className={styles.cardLabel}><Target size={16}/> Recruitment stage</div><h3>{identity.recruitment_stage||'Identified'}</h3><p>Progress through recruitment independently of agency representation status.</p>
         {recruitment?.nextStage&&recruitment.canWork?<button type="button" disabled={recruitment.locked} onClick={recruitment.nextStage[0]==='signed'?recruitment.onConfirmStage:recruitment.onMoveStage}>Move to {recruitment.nextStage[1]} <ArrowRight size={15}/></button>:null}
         {recruitment?.target?.raw_stage==='signed'&&recruitment.canPromote?<button type="button" disabled={recruitment.locked} onClick={recruitment.onConfirmPromotion}>Add to Our Players <ArrowRight size={15}/></button>:null}
        </section>:null}
       </div>
       <div className={styles.quickLinks}>
        <button type="button" onClick={()=>setTab('documents')}><FileText size={21}/> Documents <span>{documents.length||''}</span><ChevronRight size={17}/></button>
        {isRecruitment?<button type="button" onClick={()=>setTab('updates')}><Link2 size={20}/> Recruitment history <ChevronRight size={17}/></button>:<Link href={playerProfileUrl}><Link2 size={20}/> Player Profile <ChevronRight size={17}/></Link>}
        <button type="button" onClick={()=>setTab('career')}><Target size={20}/> Career & terms <ChevronRight size={17}/></button>
       </div>
      </div>
     </div>:null}
     {tab==='tasks'?<section className={styles.tabPanel}><div className={styles.sectionHeading}><div><h2>Tasks</h2><p>Actions and deadlines connected to {name}.</p></div><Link aria-label="Open calendar to add a task" href={basePath+'?view=calendar'} className={styles.roundAdd}><Plus size={19}/></Link></div>
      {mainNext?<div className={styles.taskCard}><span className={styles.taskIcon}><ClipboardCheck size={18}/></span><div><strong>{mainNext}</strong><p>{identity.next_action_due?'Due '+relativeDate(identity.next_action_due):'No due date recorded'}</p></div>{!isRecruitment&&identity.next_action&&!identity.next_action_due&&service?.next_control_fix?.instruction?<button type="button" aria-label={'Set due date for '+name} onClick={reviewDueDate}>Set due date <ArrowRight size={15}/></button>:!isRecruitment&&!identity.next_action&&(service?.next_control_fix?.instruction||service?.next_service_move?.instruction)?<button type="button" onClick={nextAction}>Review <ArrowRight size={15}/></button>:null}</div>:<EmptyPanel icon={ClipboardCheck} title="No next action recorded" description={isRecruitment?'Set the next recruitment follow-up below.':'Open Calendar to manage tasks and deadlines for your players.'}/>}
      {isRecruitment&&recruitment?.canWork?<div className={styles.recruitmentForm}><label>Follow-up date and time<input type="datetime-local" aria-label="Follow-up date and time" value={recruitment.followupDraft} onChange={event=>recruitment.onFollowupDraft(event.target.value)} disabled={recruitment.locked}/></label><button type="button" disabled={recruitment.locked||!recruitment.followupDraft} onClick={recruitment.onSaveFollowup}>{recruitment.saving==='recruitment_set_next_action'?'Saving...':'Save follow-up'}</button></div>:null}
     </section>:null}
     {tab==='updates'?<section className={styles.tabPanel}><div className={styles.sectionHeading}><div><h2>Updates</h2><p>Recorded activity and changes for {name}.</p></div><button type="button" title="Reload player activity" aria-label="Refresh activity" onClick={()=>void reload()}><RefreshCw size={17}/></button></div>
      {isRecruitment&&recruitment?.canWork?<div className={styles.recruitmentForm}><h3>Log an interaction</h3><div className={styles.recruitmentSelectors}><select aria-label="Interaction channel" value={recruitment.channel} onChange={event=>recruitment.onChannel(event.target.value)} disabled={recruitment.locked}><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="email">Email</option><option value="phone">Phone</option><option value="meeting">Meeting</option><option value="other">Other</option></select><select aria-label="Contact direction" value={recruitment.direction} onChange={event=>recruitment.onDirection(event.target.value)} disabled={recruitment.locked}><option value="outbound">Agency to player</option><option value="inbound">Player to agency</option><option value="mutual">Two-way conversation</option></select></div><textarea aria-label="Interaction note" rows={3} value={recruitment.interaction} onChange={event=>recruitment.onInteraction(event.target.value)} placeholder="Short factual note" disabled={recruitment.locked}/><button type="button" disabled={recruitment.locked||!recruitment.interaction.trim()} onClick={recruitment.onLogInteraction}>{recruitment.saving==='recruitment_log_interaction'?'Saving...':'Save interaction'}</button></div>:null}
      {activity.length?<div className={styles.activityFeed}>{activity.map((item:any,index:number)=><article key={item.id||index}><span className={styles.activityDot}/><div><strong>{human(item.event_type||'Agency update')}</strong>{item.summary?<p>{item.summary}</p>:null}<p>{item.occurred_at?relativeDate(item.occurred_at):'Date unavailable'}</p></div></article>)}</div>:<EmptyPanel icon={Users} title="No updates yet" description={isRecruitment?'Recruitment interactions will appear here when saved.':'Activity from saved player actions will appear here automatically.'}/>}
     </section>:null}
     {tab==='deals'?<section className={styles.tabPanel}><div className={styles.sectionHeading}><div><h2>Shortlisted & Pitched</h2><p>Clubs and opportunities linked to {name}.</p></div><Link aria-label="Open deals" href={basePath+'?view=opportunities&tab=deals'} className={styles.roundAdd}><Plus size={19}/></Link></div>
      {deals.length?<div className={styles.dealList}>{deals.map((item:any,index:number)=><article key={item.id||index}><ClubIdentityMark name={raw(item.club_name)||'Club'}/><div><strong>{item.club_name||item.title||'Deal'}</strong><span>{item.next_action||'No next action recorded'}</span></div><small>{human(item.status||item.stage||'Recorded')}</small></article>)}</div>:<EmptyPanel icon={Target} title="No active deals recorded" description="Linked deal rooms will appear here when they are created."/>}
      <div className={styles.sectionHeading}><div><h2>Potential</h2><p>Other club opportunities for this player.</p></div></div>
      {opportunities.length?<div className={styles.dealList}>{opportunities.map((item:any,index:number)=><article key={item.id||index}><ClubIdentityMark name={raw(item.club_name)||'Club'} country={item.country}/><div><strong>{item.club_name||'Club opportunity'}</strong><span>{item.summary||item.next_action||'No description'}</span></div><small>{human(item.stage||'Recorded')}</small></article>)}</div>:<EmptyPanel icon={Target} title="No potential opportunities" description="Potential club matches and proposals will appear here."/>}
     </section>:null}
     {tab==='documents'?<section className={styles.tabPanel}><div className={styles.sectionHeading}><div><h2>Documents</h2><p>Player and agency documents.</p></div><button type="button" onClick={()=>setTab('profile')} aria-label="Return to profile"><X size={18}/></button></div>
      {documents.length?<div className={styles.dealList}>{documents.map((item:any,index:number)=><article key={item.id||index}><FileText size={18}/><div><strong>{item.title||'Player document'}</strong><span>{human(item.document_type||'Document')}</span></div><small>{item.expires_at?'Expires '+dateText(item.expires_at):'No expiry'}</small></article>)}</div>:<EmptyPanel icon={FileText} title="No documents yet" description={isRecruitment?'Documents are available when this recruitment target becomes an agency player.':'Player documents will appear here when recorded in the agency.'}/>}
     </section>:null}
     {tab==='career'?<section className={styles.tabPanel}><div className={styles.sectionHeading}><div><h2>Career & terms</h2><p>Private agency information for {name}.</p></div><button type="button" onClick={()=>setTab('profile')} aria-label="Return to profile"><X size={18}/></button></div>
      <section className={styles.contractCard}><div className={styles.cardLabel}><Target size={16}/> Career objective</div><strong>{career?.strategy?.objective||'No career objective recorded'}</strong><p>{career?.next_strategy_action?.instruction||'No next strategy action recorded.'}</p></section>
      {!isRecruitment&&canEdit?<PlayerSalaryTerms playerId={playerId} scope={cacheScope} rpc={rpc}/>:null}
      {isRecruitment?<ContractCard title="Club Contract Expiry" expiry={identity.contract_expiry}/>:null}
     </section>:null}
    </>}
   </div>
  </div>:null}
 </div>;
}
