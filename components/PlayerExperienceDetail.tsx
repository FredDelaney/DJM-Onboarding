'use client';

import {ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, CircleAlert, ClipboardCheck, FileText, Link2, LoaderCircle, Mail, Pencil, Plus, RefreshCw, ShieldCheck, Sparkles, Target, Users, X} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import ClubIdentityMark,{CountryFlag} from './ClubIdentityMark';
import EntityActionsMenu from './EntityActionsMenu';
import PlayerProfilePhoto from './PlayerProfilePhoto';
import PlayerStaffControl from './PlayerStaffControl';
import PlayerSalaryTerms from './PlayerSalaryTerms';
import RecordContactActions from './RecordContactActions';
import {friendlyError,relativeDate} from '@/lib/platform-client';
import {prefetchPlayerProfile,invalidatePlayerProfile} from '@/lib/player-profile-cache';
import {writeWithDeadline} from '@/lib/write-with-deadline';
import {confirmsEntityAction} from '@/lib/entity-action-result';
import type {AgencyActionRequest} from '@/components/AgencyActionDrawer';
import styles from './PlayerExperience.module.css';

type Invoke=<T,>(action:string,body?:Record<string,unknown>)=>Promise<T>;
type Rpc=<T,>(name:string,args?:Record<string,unknown>,signal?:AbortSignal)=>Promise<T>;
type Props={playerId:string;summary?:any;cacheScope:string;canManageRecords:boolean;basePath:string;invoke:Invoke;rpc:Rpc;onRefresh:()=>Promise<void>;onClose:()=>void;onOpenAction:(request:AgencyActionRequest)=>void};
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

export default function PlayerExperienceDetail({playerId,summary,cacheScope,canManageRecords,basePath,invoke,rpc,onRefresh,onClose,onOpenAction}:Props){
 const initial=summary?{identity:summary.identity||{},service:summary.service||{},profile:summary.profile||{},agreements:[],documents:[],opportunities:[],deals:[],activity:[],career_alignment:{}}:null;
 const [detail,setDetail]=useState<any>(initial);
 const [loading,setLoading]=useState(!initial);
 const [fullDetailReady,setFullDetailReady]=useState(false);
 const [error,setError]=useState('');
 const [tab,setTab]=useState<Tab>('profile');
 const [editing,setEditing]=useState(false);
 const [draft,setDraft]=useState<Record<EditKey,string>>(()=>pickDraft(initial?.identity));
 const [displayName,setDisplayName]=useState(raw(initial?.identity?.name));
 const [saveBusy,setSaveBusy]=useState(false);
 const [saveError,setSaveError]=useState('');
 const [savedMessage,setSavedMessage]=useState('');
 const mutation=useRef(false);
 const alive=useRef(true);
 const request=useRef(0);
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
    }
   }}
  catch(cause){if(alive.current&&sequence===request.current)setError(friendlyError(cause));}
  finally{if(alive.current&&sequence===request.current)setLoading(false);}
 },[invoke,playerId,summary]);
 useEffect(()=>{alive.current=true;void prefetchPlayerProfile(playerId,invoke,cacheScope).catch(()=>undefined);void reload();return()=>{alive.current=false;request.current++;};},[playerId,invoke,cacheScope,reload]);
 const identity=detail?.identity||{},service=detail?.service||{},career=detail?.career_alignment||{};
 const name=raw(identity.name)||'Player';
 const agreements=Array.isArray(detail?.agreements)?detail.agreements:[];
 const documents=Array.isArray(detail?.documents)?detail.documents:[];
 const opportunities=Array.isArray(detail?.opportunities)?detail.opportunities:[];
 const deals=Array.isArray(detail?.deals)?detail.deals:[];
 const activity=Array.isArray(detail?.activity)?detail.activity:[];
 const representation=agreements.find((a:any)=>a?.status==='active'&&['representation','mandate','placement_authorisation'].includes(raw(a.agreement_type)));
 const restricted=Boolean(summary?.access?.restricted||detail?.access?.restricted);
 const canEdit=fullDetailReady&&canManageRecords&&!restricted;
 const playerProfileUrl=basePath+'?view=players&player='+encodeURIComponent(playerId)+'&profile=1';
 const mainNext=identity.next_action||service?.next_service_move?.instruction||service?.next_control_fix?.instruction;
 const nationalities=Array.isArray(identity.nationalities)?identity.nationalities.filter(Boolean):[];
 const age=ageFrom(identity.date_of_birth);
 const nextAction=()=>{
  const control=service?.next_control_fix,move=service?.next_service_move;
  if(!control?.instruction&&!move?.instruction)return;
  onOpenAction({key:'player:'+playerId,eyebrow:'PLAYER',title:name,instruction:control?.instruction||move?.instruction,label:control?.instruction?'Review next step':'Prepare next move',action:control?.instruction?'player_control_fix_prepare':'player_service_move_prepare',payload:{player_id:playerId},facts:[{label:'Contract timing',value:identity.contract_expiry?relativeDate(identity.contract_expiry):'Not recorded'},{label:'Current club',value:identity.current_club||'Not recorded'}],successCondition:control?.success_condition||move?.success_condition||'Next step reviewed.'});
 };
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();if(!canEdit||mutation.current)return;
  const patch=Object.fromEntries(editFields.filter(field=>draft[field.key]!==raw(identity[field.key])).map(field=>[field.key,draft[field.key]]));
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
   await Promise.all([reload(),onRefresh()]);
   if(!alive.current)return;
   setEditing(false);setSavedMessage('Player details saved.');
  }catch(cause){if(alive.current)setSaveError(friendlyError(cause));}
  finally{mutation.current=false;if(alive.current)setSaveBusy(false);}
 };
 const openEdit=()=>{setDraft(pickDraft(identity));setDisplayName(name);setSaveError('');setSavedMessage('');setEditing(true);};
 return <div className={styles.playerSurface} role="region" aria-label={name+' player workspace'}>
  <div className={styles.playerPageHeader}><button type="button" className={styles.backLink} onClick={onClose} aria-label="Back to Players"><ArrowLeft size={17}/><span>Players</span></button><div className={styles.playerTopActions}><Link href={playerProfileUrl}><Sparkles size={16}/> Player Profile</Link>{canEdit?<EntityActionsMenu scope={cacheScope} kind="player" entityId={playerId} label={name} rpc={rpc} onChanged={async()=>{await onRefresh();await reload();}} fields={editFields.map(field=>({...field,value:identity[field.key]}))}/>:null}</div></div>
  {loading?<div className={styles.loadState}><LoaderCircle size={22}/> Loading player...</div>:null}
  {error?<div className={styles.loadState} role="alert"><CircleAlert size={19}/>{error}<button type="button" onClick={()=>void reload()}>Retry</button></div>:null}
  {detail?<div className={styles.playerDetailGrid}>
   <aside className={styles.identityRail} aria-label="Player identity">
    <div className={styles.identityCover}>
     <PlayerProfilePhoto playerId={playerId} name={name} path={identity.profile_photo_path} canEdit={canEdit} invoke={invoke} className={styles.identityPortrait} onSaved={path=>{invalidatePlayerProfile(playerId,cacheScope);setDetail((current:any)=>current?{...current,identity:{...current.identity,profile_photo_path:path}}:current);void onRefresh();}}/>
     {canEdit?<button type="button" className={styles.identityEdit} aria-label="Edit player" onClick={openEdit}><Pencil size={17}/></button>:null}
    </div>
    <h1>{name}</h1>
    <Link className={styles.insightsLink} href={playerProfileUrl}><Sparkles size={15}/> Player Profile</Link>
    <div className={styles.identityContacts}>{canEdit?<RecordContactActions kind="player" recordId={playerId} name={name} scope={cacheScope} rpc={rpc}/>:null}</div>
    <div className={styles.identityStats}>
     <div><strong>{raw(identity.football_status)||'Recorded'}</strong><span>Status</span></div>
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
       <section className={styles.editPanel}><h3>Agency Information</h3><p className={styles.editHelp}>Agent assignments and representation agreements are managed separately to keep their permissions and history intact.</p><PlayerStaffControl playerId={playerId} scope={cacheScope} rpc={rpc}/></section>
      </div>
     </div>
     {saveError?<p role="alert" className={styles.editError}>{saveError}<button type="button" onClick={()=>void reload()} disabled={saveBusy}>Reload record</button></p>:null}
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
       <section className={styles.nextCard}><div className={styles.cardLabel}><Target size={16}/> Next move</div><strong>{mainNext||'No next action recorded'}</strong><p>{identity.next_action_due?'Due '+relativeDate(identity.next_action_due):'Keep the next player action visible and up to date.'}</p>{mainNext&&!identity.next_action&&(service?.next_control_fix?.instruction||service?.next_service_move?.instruction)?<button type="button" onClick={nextAction}>Review next action <ArrowRight size={15}/></button>:<Link href={basePath+'?view=calendar'}>Open Calendar <ArrowRight size={15}/></Link>}</section>
      </div>
      <h2>Agency Information</h2>
      <div className={styles.profileInfoGrid}>
       <div className={styles.profileInfoColumn}>
        <ContractCard title="Agency Contract Expiry" expiry={representation?.end_date} empty={representation?'No expiry recorded':'No active agreement'}/>
        <div className={styles.staffCard}><PlayerStaffControl playerId={playerId} scope={cacheScope} rpc={rpc}/></div>
       </div>
       <div className={styles.quickLinks}>
        <button type="button" onClick={()=>setTab('documents')}><FileText size={21}/> Documents <span>{documents.length||''}</span><ChevronRight size={17}/></button>
        <Link href={playerProfileUrl}><Link2 size={20}/> Player Profile <ChevronRight size={17}/></Link>
        <button type="button" onClick={()=>setTab('career')}><Target size={20}/> Career & terms <ChevronRight size={17}/></button>
       </div>
      </div>
     </div>:null}
     {tab==='tasks'?<section className={styles.tabPanel}><div className={styles.sectionHeading}><div><h2>Tasks</h2><p>Actions and deadlines connected to {name}.</p></div><Link aria-label="Open calendar to add a task" href={basePath+'?view=calendar'} className={styles.roundAdd}><Plus size={19}/></Link></div>
      {mainNext?<div className={styles.taskCard}><span className={styles.taskIcon}><ClipboardCheck size={18}/></span><div><strong>{mainNext}</strong><p>{identity.next_action_due?'Due '+relativeDate(identity.next_action_due):'No due date recorded'}</p></div>{!identity.next_action&&(service?.next_control_fix?.instruction||service?.next_service_move?.instruction)?<button type="button" onClick={nextAction}>Review <ArrowRight size={15}/></button>:null}</div>:<EmptyPanel icon={ClipboardCheck} title="No next action recorded" description="Open Calendar to manage tasks and deadlines for your players."/>}
     </section>:null}
     {tab==='updates'?<section className={styles.tabPanel}><div className={styles.sectionHeading}><div><h2>Updates</h2><p>Recorded activity and changes for {name}.</p></div><button type="button" title="Reload player activity" aria-label="Refresh activity" onClick={()=>void reload()}><RefreshCw size={17}/></button></div>
      {activity.length?<div className={styles.activityFeed}>{activity.map((item:any,index:number)=><article key={index}><span className={styles.activityDot}/><div><strong>{human(item.event_type||'Agency update')}</strong><p>{item.occurred_at?relativeDate(item.occurred_at):'Date unavailable'}</p></div></article>)}</div>:<EmptyPanel icon={Users} title="No updates yet" description="Activity from saved player actions will appear here automatically."/>}
     </section>:null}
     {tab==='deals'?<section className={styles.tabPanel}><div className={styles.sectionHeading}><div><h2>Shortlisted & Pitched</h2><p>Clubs and opportunities linked to {name}.</p></div><Link aria-label="Open deals" href={basePath+'?view=opportunities&tab=deals'} className={styles.roundAdd}><Plus size={19}/></Link></div>
      {deals.length?<div className={styles.dealList}>{deals.map((item:any,index:number)=><article key={item.id||index}><ClubIdentityMark name={raw(item.club_name)||'Club'}/><div><strong>{item.club_name||item.title||'Deal'}</strong><span>{item.next_action||'No next action recorded'}</span></div><small>{human(item.status||item.stage||'Recorded')}</small></article>)}</div>:<EmptyPanel icon={Target} title="No active deals recorded" description="Linked deal rooms will appear here when they are created."/>}
      <div className={styles.sectionHeading}><div><h2>Potential</h2><p>Other club opportunities for this player.</p></div></div>
      {opportunities.length?<div className={styles.dealList}>{opportunities.map((item:any,index:number)=><article key={item.id||index}><ClubIdentityMark name={raw(item.club_name)||'Club'} country={item.country}/><div><strong>{item.club_name||'Club opportunity'}</strong><span>{item.summary||item.next_action||'No description'}</span></div><small>{human(item.stage||'Recorded')}</small></article>)}</div>:<EmptyPanel icon={Target} title="No potential opportunities" description="Potential club matches and proposals will appear here."/>}
     </section>:null}
     {tab==='documents'?<section className={styles.tabPanel}><div className={styles.sectionHeading}><div><h2>Documents</h2><p>Player and agency documents.</p></div><button type="button" onClick={()=>setTab('profile')} aria-label="Return to profile"><X size={18}/></button></div>
      {documents.length?<div className={styles.dealList}>{documents.map((item:any,index:number)=><article key={item.id||index}><FileText size={18}/><div><strong>{item.title||'Player document'}</strong><span>{human(item.document_type||'Document')}</span></div><small>{item.expires_at?'Expires '+dateText(item.expires_at):'No expiry'}</small></article>)}</div>:<EmptyPanel icon={FileText} title="No documents yet" description="Player documents will appear here when recorded in the agency."/>}
     </section>:null}
     {tab==='career'?<section className={styles.tabPanel}><div className={styles.sectionHeading}><div><h2>Career & terms</h2><p>Private agency information for {name}.</p></div><button type="button" onClick={()=>setTab('profile')} aria-label="Return to profile"><X size={18}/></button></div>
      <section className={styles.contractCard}><div className={styles.cardLabel}><Target size={16}/> Career objective</div><strong>{career?.strategy?.objective||'No career objective recorded'}</strong><p>{career?.next_strategy_action?.instruction||'No next strategy action recorded.'}</p></section>
      {canEdit?<PlayerSalaryTerms playerId={playerId} scope={cacheScope} rpc={rpc}/>:null}
     </section>:null}
    </>}
   </div>
  </div>:null}
 </div>;
}
