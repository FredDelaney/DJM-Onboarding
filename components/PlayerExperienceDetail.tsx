'use client';

import {ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, CircleAlert, ClipboardCheck, ChevronDown, FileText, LoaderCircle, Pencil, RefreshCw, ShieldCheck, Sparkles, Target, Users, X} from 'lucide-react';
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
import ClubPitchHistory from './ClubPitchHistory';
import type {PitchHistoryInvoke} from '@/lib/club-pitch-history';
import {friendlyError,relativeDate} from '@/lib/platform-client';
import {PLAYER_AGENCY_STATUSES,playerAgencyStatus,playerAgencyStatusLabel,type PlayerAgencyStatus} from '@/lib/player-agency-status';
import {invalidatePlayerProfile} from '@/lib/player-profile-cache';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {writeWithDeadline} from '@/lib/write-with-deadline';
import {confirmsEntityAction} from '@/lib/entity-action-result';
import {UUID_PATTERN} from '@/lib/entity-context';
import {workspaceClubHref, workspaceIntelligenceHref} from '@/lib/workspace-record-navigation';
import type {AgencyActionRequest} from '@/components/AgencyActionDrawer';
import styles from './PlayerExperience.module.css';

type Invoke=<T,>(action:string,body?:Record<string,unknown>)=>Promise<T>;
type Rpc=<T,>(name:string,args?:Record<string,unknown>,signal?:AbortSignal)=>Promise<T>;
type Props={playerId:string;summary?:any;cacheScope:string;canManageRecords:boolean;basePath:string;invoke:Invoke;marketInvoke?:PitchHistoryInvoke;rpc:Rpc;onRefresh:()=>Promise<void>;onClose:()=>void;onOpenAction:(request:AgencyActionRequest)=>void};
type Tab='profile'|'tasks'|'updates'|'deals'|'documents'|'career';
type LinkedTask = {id: string; title: string; due_at: string | null};
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

export default function PlayerExperienceDetail({playerId,summary,cacheScope,canManageRecords,basePath,invoke,marketInvoke,rpc,onRefresh,onClose,onOpenAction}:Props){
 const initial=summary?.identity ? {identity:summary.identity} : null;
 const restricted=!canManageRecords||Boolean(summary?.access?.restricted);
 const hasSummary=Boolean(initial);
 const tenantId=cacheScope.split(':',1)[0];
 const [detail,setDetail]=useState<any>(initial);
 const [loading,setLoading]=useState(!restricted||!initial);
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
 const request=useRef<AbortController|null>(null);
 const reload=useCallback(async()=>{
  // The roster already contains the allowed identity for an assigned player.
  if(restricted&&hasSummary)return true;
  request.current?.abort();
  const controller=new AbortController();
  request.current=controller;
  const current=()=>alive.current&&request.current===controller&&!controller.signal.aborted;
  setLoading(true);
  setError('');
  try{
   const action=restricted?'player_profile_core':'player_workspace';
   const response=await readWithDeadline(invoke<any>(action,{player_id:playerId}),12000,controller.signal);
   if(!current())return false;
   if(restricted){
    const player=response?.profile?.player;
    if(player?.id!==playerId||response?.profile?.access?.restricted!==true)throw new Error('The player record could not be confirmed.');
    setDetail({identity:{...player,name:player.preferred_name||[player.first_name,player.last_name].filter(Boolean).join(' ')}});
   }else{
    const player=response?.player;
    if(player?.identity?.id!==playerId||(UUID_PATTERN.test(tenantId)&&player.tenant_id!==tenantId))throw new Error('The player record could not be confirmed.');
    setDetail(player);
    setFullDetailReady(true);
   }
   return true;
  }catch(cause){
   if(current()){
    setFullDetailReady(false);
    setError(friendlyError(cause));
   }
  }finally{
   if(current())setLoading(false);
  }
  return false;
 },[invoke,playerId,tenantId,restricted,hasSummary]);
 useEffect(()=>{alive.current=true;void reload();return()=>{alive.current=false;request.current?.abort();};},[reload]);
 const identity=detail?.identity||{},service=detail?.service||{},career=detail?.career_alignment||{};
 const name=raw(identity.name)||'Player';
 const agreements=Array.isArray(detail?.agreements)?detail.agreements:[];
 const documents=Array.isArray(detail?.documents)?detail.documents:[];
 const opportunities=Array.isArray(detail?.opportunities)?detail.opportunities:[];
 const deals=Array.isArray(detail?.deals)?detail.deals:[];
 const activity=Array.isArray(detail?.activity)?detail.activity:[];
 const representation=agreements.find((a:any)=>a?.status==='active'&&['representation','mandate','placement_authorisation'].includes(raw(a.agreement_type)));
 const canEdit=fullDetailReady&&!restricted;
 const playerProfileUrl=basePath+'?view=players&player='+encodeURIComponent(playerId)+'&profile=1';
 const calendarUrl=basePath+'?view=calendar';
 const clubHref=raw(detail?.current_club_link?.name) ? workspaceClubHref(basePath,detail.current_club_link.organisation_id) : null;
 const taskItems=detail?.open_tasks?.items;
 const linkedTasks:LinkedTask[]|null=Array.isArray(taskItems)&&taskItems.every(task=>
  typeof task?.id==='string'&&UUID_PATTERN.test(task.id)&&typeof task.title==='string'&&
  (task.due_at===null||typeof task.due_at==='string')
 ) ? taskItems : null;
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
  if(agencyStatusDraft!==playerAgencyStatus(identity.agency_status))patch.agency_status=agencyStatusDraft;
  if(displayName.trim()!==name){
   if(!displayName.trim()||displayName.trim().length>120){setSaveError('Enter a player name of no more than 120 characters.');return;}
   patch.preferred_name=displayName.trim();
  }
  if(!Object.keys(patch).length){setEditing(false);return;}
  mutation.current=true;setSaveBusy(true);setSaveError('');setSavedMessage('');
  try{
   const outcome=await writeWithDeadline(async signal=>{try{return {value:await rpc<any>('redream_entity_patch',{p_entity_type:'player',p_entity_id:playerId,p_patch:patch},signal)};}catch(cause){return {error:cause};}},12000);
   if(!alive.current)return;
   if(outcome.status==='unknown'){setSaveError('The save could not be confirmed. It may still complete. Please reload the latest details before trying again.');return;}
   if('error' in outcome.result){setSaveError(friendlyError(outcome.result.error));return;}
   if(!confirmsEntityAction(outcome.result.value,'edit','player',playerId,false)){setSaveError('The save could not be confirmed. Reload before editing again.');return;}
   await Promise.allSettled([reload(),onRefresh()]);
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
 const openEdit=()=>{if(statusUnconfirmed)return;setStatusOpen(false);setDraft(pickDraft(identity));setAgencyStatusDraft(playerAgencyStatus(identity.agency_status));setDisplayName(name);setSaveError('');setSavedMessage('');setEditing(true);};
 return <div className={styles.playerSurface} role="region" aria-label={name+' player workspace'}>
  <div className={styles.playerPageHeader}><button type="button" className={styles.backLink} onClick={onClose} aria-label="Back to Players"><ArrowLeft size={17}/><span>Players</span></button><div className={styles.playerTopActions}>{detail?<Link href={playerProfileUrl}><Sparkles size={16}/> Player Profile</Link>:null}{canEdit?<EntityActionsMenu scope={cacheScope} kind="player" entityId={playerId} label={name} rpc={rpc} onChanged={async()=>{await Promise.allSettled([onRefresh(),reload()]);}} fields={editFields.map(field=>({...field,value:identity[field.key]}))}/>:null}</div></div>
  {loading?<div className={styles.loadState} role="status"><LoaderCircle size={19}/> Loading player details...</div>:null}
  {error?<div className={styles.loadState} role="alert"><CircleAlert size={19}/>{error}<button type="button" onClick={()=>void reload()}>Retry</button></div>:null}
  {detail?<div className={styles.playerDetailGrid}>
   <aside className={styles.identityRail} aria-label="Player identity">
    <div className={styles.identityCover}>
     <PlayerProfilePhoto playerId={playerId} name={name} path={identity.profile_photo_path} canEdit={canEdit} invoke={invoke} className={styles.identityPortrait} onSaved={path=>{invalidatePlayerProfile(playerId,cacheScope);setDetail((current:any)=>current?{...current,identity:{...current.identity,profile_photo_path:path}}:current);void onRefresh();}}/>
     {canEdit?<button type="button" className={styles.identityEdit} aria-label="Edit player" onClick={openEdit} disabled={statusUnconfirmed||statusBusy}><Pencil size={17}/></button>:null}
    </div>
    <h1>{name}</h1>
    {canEdit?<div className={styles.identityContacts}><RecordContactActions kind="player" recordId={playerId} name={name} scope={cacheScope} rpc={rpc}/></div>:null}
    <div className={styles.identityStats}>
     <div>
      <div className={styles.statusPickerAnchor}>
       {canEdit&&!editing?<button type="button" className={styles.statusPickerTrigger} aria-label={'Change status for '+name} aria-expanded={statusOpen} onClick={statusOpen?()=>{if(!statusBusy&&!statusUnconfirmed)setStatusOpen(false);}:openStatusPicker} disabled={statusBusy||saveBusy}>
        <span className={styles.statusChip} data-status={playerAgencyStatus(identity.agency_status)}>{playerAgencyStatusLabel(identity.agency_status)}</span>
        <ChevronDown size={13} aria-hidden="true"/>
       </button>:identity.agency_status?<span className={styles.statusChip} data-status={playerAgencyStatus(identity.agency_status)}>{playerAgencyStatusLabel(identity.agency_status)}</span>:<strong>Not recorded</strong>}
       {canEdit&&!editing&&statusOpen?<div className={styles.statusPickerPopover} role="group" aria-label="Choose agency status">
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
     <div className={styles.editHead}><div><p>PLAYER DETAILS</p><h2>Edit player</h2><span>Changes are saved to this agency's player record.</span></div><button type="button" aria-label="Close editing" onClick={()=>setEditing(false)} disabled={saveBusy}><X size={18}/></button></div>
     <div className={styles.editColumns}>
      <section className={styles.editPanel}><h3>Player Information</h3><label>Player name<input type="text" value={displayName} maxLength={120} onChange={event=>setDisplayName(event.target.value)} disabled={saveBusy} aria-label="Player name" required/></label><p className={styles.editHelp}>Changes the player display name. Full legal-name details remain in Manage.</p>
       <label>Agency status<select aria-label="Agency status" value={agencyStatusDraft} onChange={event=>setAgencyStatusDraft(event.target.value as PlayerAgencyStatus)} disabled={saveBusy}>{PLAYER_AGENCY_STATUSES.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label><p className={styles.editHelp}>Signed: represented by our agency. Mandated: specific mandate. Prospect: someone we are evaluating.</p>
       <label>Position<input value={draft.primary_position} onChange={event=>setDraft({...draft,primary_position:event.target.value})} disabled={saveBusy}/></label>
       <label>Nationality<input value={nationalities.join(', ')} readOnly title="Edit verified football details in Player Profile."/></label>
       <label>Date of birth<input value={raw(identity.date_of_birth)} readOnly title="Edit verified football details in Player Profile."/></label>
       <label>Preferred foot<input value={raw(identity.preferred_foot)} readOnly title="Edit verified football details in Player Profile."/></label>
       <label>Height (cm)<input value={raw(identity.height_cm)} readOnly title="Edit verified football details in Player Profile."/></label>
       <Link className={styles.editExtended} href={playerProfileUrl}>Edit verified football data <ArrowRight size={15}/></Link>
      </section>
      <div className={styles.editRight}>
       <section className={styles.editPanel}><h3>Contact Information</h3>{canEdit?<RecordContactActions kind="player" recordId={playerId} name={name} scope={cacheScope} rpc={rpc}/>:null}</section>
       <section className={styles.editPanel}><h3>Club Information</h3>
        <label>Current club<input value={draft.current_club} onChange={event=>setDraft({...draft,current_club:event.target.value})} disabled={saveBusy}/></label>
        <label>Club country<input value={draft.current_country} onChange={event=>setDraft({...draft,current_country:event.target.value})} disabled={saveBusy}/></label>
        <label>Club contract expiry<input type="date" value={draft.contract_expiry} onChange={event=>setDraft({...draft,contract_expiry:event.target.value})} disabled={saveBusy}/></label>
       </section>
       <section className={styles.editPanel}><h3>Agency Information</h3><p className={styles.editHelp}>Change the lead agent from the player profile. Tagged staff receive reminders and do not automatically gain player access.</p><PlayerStaffControl playerId={playerId} scope={cacheScope} rpc={rpc}/></section>
      </div>
     </div>
     {saveError?<p role="alert" className={styles.editError}>{saveError}<button type="button" onClick={()=>void reload()} disabled={saveBusy}>Reload record</button></p>:null}
     <div className={styles.editFooter}><button type="button" onClick={()=>setEditing(false)} disabled={saveBusy}>Cancel</button><button type="submit" disabled={saveBusy||!canEdit}>{saveBusy?<LoaderCircle size={17}/>:<Check size={17}/>} {saveBusy?'Saving...':'Done'}</button></div>
    </form>:fullDetailReady?<>
     <nav className={styles.detailTabs} aria-label="Player sections">{([['profile','Profile'],['tasks','Tasks'],['updates','Updates'],['deals','Deals']] as const).map(([key,label])=><button key={key} type="button" aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}>{label}</button>)}</nav>
     {savedMessage?<p role="status" className={styles.editSuccess}>{savedMessage}</p>:null}
     {tab==='profile'?<div className={styles.playerSection}>
      <h2>Club Information</h2>
      <div className={styles.profileInfoGrid}>
       <div className={styles.profileInfoColumn}>
        <section className={styles.clubInfoCard}>
         <ClubIdentityMark name={detail.current_club_link?.name||raw(identity.current_club)||'Club'} country={detail.current_club_link?.country||raw(identity.current_country)}/>
         <div>
          {clubHref?<Link className={styles.clubRecord} href={clubHref} prefetch={false}><strong>{detail.current_club_link.name}</strong><ChevronRight size={16} aria-hidden="true"/></Link>:<strong>{identity.current_club||'No current club recorded'}</strong>}
          <span>{identity.current_league||(clubHref?'Verified club link':'Current club')}</span>
         </div>
         {canEdit?<button type="button" onClick={openEdit} aria-label="Edit club"><Pencil size={16}/></button>:null}
        </section>
        <ContractCard title="Club Contract Expiry" expiry={identity.contract_expiry}/>
       </div>
       <section className={styles.nextCard}><div className={styles.cardLabel}><Target size={16}/> Next move</div><strong>{mainNext||'No next action recorded'}</strong><p>{identity.next_action_due?'Due '+relativeDate(identity.next_action_due):'Keep the next player action visible and up to date.'}</p>{mainNext&&!identity.next_action&&(service?.next_control_fix?.instruction||service?.next_service_move?.instruction)?<button type="button" onClick={nextAction}>Review next action <ArrowRight size={15}/></button>:<Link href={basePath+'?view=calendar'}>Open Calendar <ArrowRight size={15}/></Link>}</section>
      </div>
      <h2>Agency Information</h2>
      <div className={styles.profileInfoGrid}>
       <div className={styles.profileInfoColumn}>
        <ContractCard title="Agency Contract Expiry" expiry={representation?.end_date} empty={representation?'No expiry recorded':'No active agreement'}/>
        {canEdit?<PlayerLeadAgentControl playerId={playerId} scope={cacheScope} rpc={rpc} onChanged={async()=>{await Promise.allSettled([reload(),onRefresh()]);}}/>:null}
        <div className={styles.staffCard}>
         <h3>Assigned agents</h3>
         <p className={styles.editHelp}>Add agents who work with this player. The lead remains accountable.</p>
         <PlayerTeamAgentsControl playerId={playerId} playerName={name} scope={cacheScope} rpc={rpc}
          initialAgents={Array.isArray(identity.assigned_agents)?identity.assigned_agents:[]}
          variant="profile" canManage={canEdit} onChanged={async()=>{await Promise.allSettled([reload(),onRefresh()]);}}/>
        </div>
        <div className={styles.staffCard}><PlayerStaffControl playerId={playerId} scope={cacheScope} rpc={rpc}/></div>
       </div>
       <div className={styles.quickLinks}>
        <button type="button" onClick={()=>setTab('documents')}><FileText size={21}/> Documents <span>{documents.length||''}</span><ChevronRight size={17}/></button>
        <button type="button" onClick={()=>setTab('career')}><Target size={20}/> Career & terms <ChevronRight size={17}/></button>
       </div>
      </div>
     </div>:null}
     {tab==='tasks'?<section className={styles.tabPanel}>
      <div className={styles.sectionHeading}><div><h2>Tasks</h2><p>Open follow-ups linked to {name}.</p></div><Link className={styles.recordAction} href={calendarUrl}><CalendarDays size={16}/> Calendar</Link></div>
      {linkedTasks===null?<p className={styles.relatedNotice}>Linked tasks are unavailable here. You can still review them in Calendar.</p>
       :linkedTasks.length?<div className={styles.dealList}>{linkedTasks.map(task=><article key={task.id}>
        <ClipboardCheck size={19} aria-hidden="true"/>
        <div><strong>{task.title}</strong><span>{task.due_at?'Due '+relativeDate(task.due_at):'No due date recorded'}</span></div>
        <Link className={styles.recordAction} prefetch={false} aria-label={'Open task: '+task.title} href={calendarUrl+'&work=task&task='+encodeURIComponent(task.id)}>Open <ChevronRight size={16}/></Link>
       </article>)}</div>:<EmptyPanel icon={ClipboardCheck} title="No open linked tasks" description="Follow-ups linked to this player will appear here."/>}
      {linkedTasks&&detail.open_tasks.total>linkedTasks.length?<p className={styles.relatedNotice}>Showing {linkedTasks.length} of {detail.open_tasks.total} open tasks.</p>:null}
      {mainNext?<div className={styles.taskCard}><span className={styles.taskIcon}><Target size={18}/></span><div><span className={styles.nextLabel}>{identity.next_action?'Recorded next move':'Suggested next move'}</span><strong>{mainNext}</strong><p>{identity.next_action_due?'Due '+relativeDate(identity.next_action_due):'No due date recorded'}</p></div>{identity.next_action&&!identity.next_action_due&&service?.next_control_fix?.instruction?<button type="button" aria-label={'Set due date for '+name} onClick={reviewDueDate}>Set due date <ArrowRight size={15}/></button>:!identity.next_action&&(service?.next_control_fix?.instruction||service?.next_service_move?.instruction)?<button type="button" onClick={nextAction}>Review <ArrowRight size={15}/></button>:null}</div>:null}
     </section>:null}
     {tab==='updates'?<section className={styles.tabPanel}><div className={styles.sectionHeading}><div><h2>Updates</h2><p>Recorded activity and changes for {name}.</p></div><button type="button" title="Reload player activity" aria-label="Refresh activity" onClick={()=>void reload()}><RefreshCw size={17}/></button></div>
      {activity.length?<div className={styles.activityFeed}>{activity.map((item:any,index:number)=><article key={index}><span className={styles.activityDot}/><div><strong>{human(item.event_type||'Agency update')}</strong><p>{item.occurred_at?relativeDate(item.occurred_at):'Date unavailable'}</p></div></article>)}</div>:<EmptyPanel icon={Users} title="No updates yet" description="Activity from saved player actions will appear here automatically."/>}
     </section>:null}
     {tab==='deals'?<section className={styles.tabPanel}><div className={styles.sectionHeading}><div><h2>Deals</h2><p>Deal records linked to {name}.</p></div><Link className={styles.recordAction} href={basePath+'?view=opportunities&tab=deals'}>All deals</Link></div>
      {deals.length?<div className={styles.dealList}>{deals.map((item:any,index:number)=>{
       const href=workspaceIntelligenceHref(basePath,'',{kind:'deal',entityId:raw(item.id)});
       const title=item.title||item.club_name||'Deal';
       return <article key={item.id||index}><ClubIdentityMark name={raw(item.club_name)||'Club'}/>
        <div><strong>{title}</strong><span>{[item.club_name!==title&&item.club_name,human(item.stage||item.status),item.next_action].filter(Boolean).join(' · ')}</span></div>
        {href?<Link className={styles.recordAction} href={href} prefetch={false} aria-label={'Open deal: '+title}>Open <ChevronRight size={16}/></Link>:null}
       </article>;
      })}</div>:<EmptyPanel icon={Target} title="No linked deals" description="Deals recorded for this player will appear here."/>}
      {canManageRecords && marketInvoke ? <ClubPitchHistory scope="player" scopeId={playerId} basePath={basePath} invoke={marketInvoke}/> : null}
      <div className={styles.sectionHeading}><div><h2>Recorded opportunities</h2><p>Other club interest recorded for this player.</p></div></div>
      {opportunities.length?<div className={styles.dealList}>{opportunities.map((item:any,index:number)=><article key={item.id||index}><ClubIdentityMark name={raw(item.club_name)||'Club'} country={item.country}/><div><strong>{item.club_name||'Club opportunity'}</strong><span>{item.summary||item.next_action||'No description'}</span></div><small>{human(item.stage||'Recorded')}</small></article>)}</div>:<EmptyPanel icon={Target} title="No other opportunities recorded" description="Other recorded club interest will appear here."/>}
     </section>:null}
     {tab==='documents'?<section className={styles.tabPanel}><div className={styles.sectionHeading}><div><h2>Documents</h2><p>Player and agency documents.</p></div><button type="button" onClick={()=>setTab('profile')} aria-label="Return to profile"><X size={18}/></button></div>
      {documents.length?<div className={styles.dealList}>{documents.map((item:any,index:number)=><article key={item.id||index}><FileText size={18}/><div><strong>{item.title||'Player document'}</strong><span>{human(item.document_type||'Document')}</span></div><small>{item.expires_at?'Expires '+dateText(item.expires_at):'No expiry'}</small></article>)}</div>:<EmptyPanel icon={FileText} title="No documents yet" description="Player documents will appear here when recorded in the agency."/>}
     </section>:null}
     {tab==='career'?<section className={styles.tabPanel}><div className={styles.sectionHeading}><div><h2>Career & terms</h2><p>Private agency information for {name}.</p></div><button type="button" onClick={()=>setTab('profile')} aria-label="Return to profile"><X size={18}/></button></div>
      <section className={styles.contractCard}><div className={styles.cardLabel}><Target size={16}/> Career objective</div><strong>{career?.strategy?.objective||'No career objective recorded'}</strong><p>{career?.next_strategy_action?.instruction||'No next strategy action recorded.'}</p></section>
      {canEdit?<PlayerSalaryTerms playerId={playerId} scope={cacheScope} rpc={rpc}/>:null}
     </section>:null}
    </>:null}
   </div>
  </div>:null}
 </div>;
}
