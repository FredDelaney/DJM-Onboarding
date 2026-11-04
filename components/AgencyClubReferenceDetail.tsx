'use client';

import {ArrowLeft, Building2, ChevronRight, Lightbulb, LoaderCircle, Plus, Shield, UsersRound} from 'lucide-react';
import {useCallback,useEffect,useMemo,useRef,useState, type ReactNode} from 'react';
import {friendlyError} from '@/lib/platform-client';
import {clubNeedFinancialFacts,formatCommercialAmount} from '@/lib/club-need-brief';
import {readWithDeadline} from '@/lib/read-with-deadline';
import {UUID_PATTERN} from '@/lib/entity-context';
import styles from './AgencyClubReferenceDetail.module.css';
import ClubIdentityMark, {CountryFlag} from './ClubIdentityMark';

type Invoke=(action:string,body?:Record<string,unknown>)=>Promise<any>;
type OpenRecord=(id:string,title:string,context?:string|null)=>void;
type Person={id:string;name:string;position?:string;role?:string;verified_link?:boolean};
type PlayerCandidate={id:string;name:string;current_club?:string|null;current_country?:string|null;linked_club_id?:string|null;can_link:boolean};
type Detail={players:Person[];contacts:Person[];can_view_contacts:boolean;can_link_players?:boolean;player_count_basis:string};
type Tab='overview'|'requests'|'deals';

const items=(value:unknown):any[]=>Array.isArray(value)?value:[];
const txt=(value:unknown)=>String(value??'').trim();
const amount=(value:unknown,currency:unknown)=>formatCommercialAmount(value,currency)||'Not specified';
const dateLabel=(value:unknown,empty:string)=>{
  if(!value)return empty;
  const timestamp=Date.parse(txt(value));
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(timestamp)
    : 'Date needs review';
};
const isActiveRequest=(need:any)=>need.status==='active'&&(!need.expires_at||Date.parse(need.expires_at)>=Date.now());

const wageBudgetLabel=(need:any)=>clubNeedFinancialFacts(need).find(([label])=>label==='Salary budget')?.[1]||'Not specified';
const requestPriorityLabel=(value:unknown)=>({1:'Low',2:'Routine',3:'Normal',4:'High',5:'Urgent'} as Record<string,string>)[String(value??'')]||'Not set';
const transferPreferenceLabel=(value:unknown)=>{
  const raw=String(value||'').trim();
  return raw?raw.replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase()):'Not specified';
};

export default function AgencyClubReferenceDetail({
  account,invoke,onClose,onCreateContact,onCreateNeed,onCreateDeal,onCreatePlayer,onOpenMarket,onOpenDeal,onOpenPlayer,onOpenContact,onLinkSaved,editControl,refreshKey=0,canCreateRecords=true,
}: {
  account:any;invoke:Invoke;refreshKey?:number;editControl?:ReactNode;onClose:()=>void;onCreateContact:()=>void;
  onCreateNeed:()=>void;onCreateDeal:()=>void;onCreatePlayer:()=>void;canCreateRecords?:boolean;
  onOpenMarket:(needId?:string)=>void;onOpenDeal:OpenRecord;onOpenPlayer:(id:string)=>void;onOpenContact:(id:string)=>void;
  onLinkSaved?:()=>Promise<void>;
}) {
  const club=account?.club||{};
  const [tab,setTab]=useState<Tab>('overview');
  const [requestsFilter,setRequestsFilter]=useState<'active'|'all'>('active');
  const [detail,setDetail]=useState<Detail|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const peopleRead=useRef<AbortController|null>(null);
  const [insights,setInsights]=useState(false);
  const [actionsOpen,setActionsOpen]=useState(false);
  const linkConfirmRef=useRef<HTMLDivElement|null>(null);
  const [linkOpen,setLinkOpen]=useState(false);
  const [linkSearch,setLinkSearch]=useState('');
  const [linkLoading,setLinkLoading]=useState(false);
  const [linkError,setLinkError]=useState('');
  const [linkCandidates,setLinkCandidates]=useState<PlayerCandidate[]>([]);
  const [linkSelected,setLinkSelected]=useState<PlayerCandidate|null>(null);
  const [linkSaving,setLinkSaving]=useState(false);
  const [linkNotice,setLinkNotice]=useState('');
  const needRows=items(account?.demand?.items);
  const dealRows=items(account?.commercial?.deals);
  const organisationId=txt(club.organisation_id||club.id);

  const load=useCallback(async()=>{
    peopleRead.current?.abort();
    const controller=new AbortController();
    peopleRead.current=controller;
    setLoading(true);setError('');
    try {
      const response=await readWithDeadline(invoke('club_reference_people',{organisation_id:organisationId}),12000,controller.signal);
      const data=response?.people;
      if(!Array.isArray(data?.players)||!Array.isArray(data?.contacts))throw new Error('Club people could not be verified.');
      if(!controller.signal.aborted)setDetail(data);
    } catch(cause){if(!controller.signal.aborted){setDetail(null);setError(friendlyError(cause));}}
    finally{if(!controller.signal.aborted)setLoading(false);}
  },[invoke,organisationId]);
  useEffect(()=>{void load();return()=>peopleRead.current?.abort();},[load,refreshKey]);
  useEffect(()=>{if(linkSelected)linkConfirmRef.current?.scrollIntoView({block:'nearest',behavior:'smooth'});},[linkSelected]);
  useEffect(()=>{
    if(!linkOpen||!detail?.can_link_players)return;
    let active=true;
    setLinkLoading(true);setLinkError('');
    const timer=setTimeout(()=>{
      void readWithDeadline(invoke('club_link_candidates',{organisation_id:organisationId,search:linkSearch.trim()}))
        .then(result=>{
          if(!active)return;
          const records=result?.candidates?.items;
          if(!Array.isArray(records)||records.some((item:any)=>typeof item?.id!=='string'||typeof item?.name!=='string'||typeof item?.can_link!=='boolean'))
            throw new Error('The roster list could not be verified.');
          setLinkCandidates(records);
        })
        .catch(cause=>{if(active)setLinkError(friendlyError(cause));})
        .finally(()=>{if(active)setLinkLoading(false);});
    },linkSearch?250:0);
    return()=>{active=false;clearTimeout(timer);};
  },[linkOpen,linkSearch,organisationId,invoke,detail?.can_link_players]);

  const confirmLink=async()=>{
    if(!linkSelected||linkSaving)return;
    const selected=linkSelected;
    setLinkSaving(true);setLinkError('');
    try{
      const response=await invoke('club_link_player',{organisation_id:organisationId,player_id:selected.id});
      if(response?.linked?.linked!==true||response.linked.player_id!==selected.id||response.linked.organisation_id!==organisationId)
        throw new Error('The club link was not confirmed. Check the roster before retrying.');
      setLinkNotice(selected.name+' linked to '+(txt(club.name)||'club')+'.');
      setLinkSelected(null);setLinkOpen(false);setLinkSearch('');
      await load();
      void onLinkSaved?.().catch(()=>undefined);
    }catch(cause){setLinkError(friendlyError(cause));}
    finally{setLinkSaving(false);}
  };
  const requests=useMemo(()=>requestsFilter==='all'?needRows:needRows.filter(isActiveRequest),[needRows,requestsFilter]);
  const name=txt(club.name)||'Club';
  const country=txt(club.country),league=txt(club.league_name);

  return <section className={styles.page} role="region" aria-label={`Club details for ${name}`}>
    <button type="button" className={styles.return} onClick={onClose}><ArrowLeft size={17}/> Back to Clubs</button>
    <header className={styles.clubHeader}>
      <ClubIdentityMark name={name} country={country} large/>
      <div className={styles.headlines}><h1>{name}</h1>
        <p><CountryFlag country={country}/>{country||'Country not recorded'}{league&&<><span className={styles.dot}>·</span><span className={styles.leagueLogo} aria-hidden="true">◈</span>{league}</>}</p>
      </div>
      <div className={styles.headActions}>
        {editControl}
        {canCreateRecords&&<div className={styles.addActionWrap}>
          <button type="button" className={styles.addActionButton} aria-expanded={actionsOpen} aria-label="Add to club" onClick={()=>setActionsOpen(v=>!v)}>
            <Plus size={18}/> Add <ChevronRight className={actionsOpen?styles.rotateDown:styles.rotateRight} size={15}/>
          </button>
          {actionsOpen&&<div className={styles.addActionMenu} role="group" aria-label="Add to this club">
            {([
              ...(detail?.can_view_contacts?[['Add contact',onCreateContact] as const]:[]),
              ['Add request',onCreateNeed],
              ['Add deal',onCreateDeal],
              ['Add player',onCreatePlayer]
            ] as const).map(([label,action])=><button type="button" key={label} onClick={()=>{setActionsOpen(false);action();}}>{label}</button>)}
          </div>}
        </div>}
        <button type="button" className={styles.insights} onClick={()=>setInsights(v=>!v)} aria-expanded={insights}><Lightbulb size={17}/> Insights</button>
      </div>
    </header>
    {insights&&<section className={styles.insightPanel}><strong>Recorded relationship insights</strong><p>{account?.top_strategic_play?.recommended_action||'No recommended next step has been recorded for this club.'}</p><small>Based on ReDream agency records, not external predictions.</small></section>}
    <nav className={styles.tabs} aria-label="Club sections">
      {(['overview','requests','deals'] as const).map(id=><button type="button" key={id} aria-current={tab===id?'page':undefined} className={tab===id?styles.tabActive:styles.tab} onClick={()=>setTab(id)}>{id[0].toUpperCase()+id.slice(1)}</button>)}
    </nav>
    {tab==='overview'&&<div className={styles.panels}>
      <section className={styles.block}>
        <div className={styles.sectionHeader}><h2>Players</h2><div className={styles.actions}>
          {canCreateRecords&&detail?.can_link_players&&<button type="button" className={styles.linkExisting} onClick={()=>{setLinkOpen(value=>!value);setLinkLoading(true);setLinkSelected(null);setLinkError('');}} aria-expanded={linkOpen}>Link existing player</button>}
          {canCreateRecords&&<button className={styles.plus} type="button" onClick={onCreatePlayer} aria-label="Add club player"><Plus size={19}/></button>}
        </div></div>
        {linkNotice&&<p role="status" className={styles.linkNotice}>{linkNotice}</p>}
        {linkOpen&&detail?.can_link_players&&<div className={styles.linkPanel} role="region" aria-label="Link an existing roster player">
          <strong>Choose a player already in your agency</strong>
          <p>Links are confirmed manually. Similar club names are never merged automatically.</p>
          <input type="search" aria-label="Search roster players" placeholder="Search players by name or current club" maxLength={100} value={linkSearch} onChange={event=>{setLinkLoading(true);setLinkSearch(event.target.value);setLinkSelected(null);}} />
          {linkError&&<p role="alert" className={styles.linkError}>{linkError}</p>}
          {linkLoading&&<p role="status">Searching roster…</p>}
          {!linkLoading&&!linkSelected&&<div className={styles.linkCandidateList}>
            {linkCandidates.map(candidate=><button type="button" className={styles.linkCandidate} key={candidate.id} disabled={!candidate.can_link} onClick={()=>setLinkSelected(candidate)}>
              <span><strong>{candidate.name}</strong><small>Current club: {candidate.current_club||'Not recorded'}</small></span>
              <span className={styles.linkCandidateAction}>{candidate.can_link?'Review link':'Linked elsewhere'}</span>
            </button>)}
            {!linkCandidates.length&&!linkError&&<p>No players found. Adjust the search or add the player to your roster.</p>}
          </div>}
          {linkSelected&&<div ref={linkConfirmRef} className={styles.linkConfirm}>
            <strong>Confirm {linkSelected.name} at {name}?</strong>
            <p>Current club: {linkSelected.current_club||'Not recorded'}. This will update the player's current-club name and create a verified internal club link. It does not verify an external contract or registration.</p>
            <div className={styles.linkConfirmActions}>
              <button type="button" disabled={linkSaving} onClick={()=>setLinkSelected(null)}>Back</button>
              <button type="button" disabled={linkSaving} className={styles.linkPrimary} onClick={()=>void confirmLink()}>{linkSaving?'Saving…':'Confirm club link'}</button>
            </div>
          </div>}
        </div>}
        {loading&&<div className={styles.empty}><LoaderCircle className={styles.spin} size={19}/> Loading players…</div>}
        {!loading&&error&&<div className={styles.empty} role="alert">{error}<button type="button" onClick={()=>void load()}>Retry</button></div>}
        {!loading&&!error&&!detail?.players?.length&&<div className={styles.empty}><span className={styles.emptyIcon}><UsersRound size={26}/></span><strong>No players found</strong><p>No players are associated with this club in your agency roster.</p></div>}
        {!loading&&!error&&detail?.players?.length? <div className={styles.rows}>{detail.players.map(person=><button type="button" key={person.id} className={styles.personRow} onClick={()=>onOpenPlayer(person.id)}><span className={styles.avatar}>{person.name.slice(0,1)}</span><span><strong>{person.name}</strong><small>{person.position||'Player'}</small><small className={person.verified_link?styles.linkVerified:styles.linkUnverified}>{person.verified_link?'Club link confirmed':'Name match, not verified'}</small></span><ChevronRight size={16}/></button>)}</div>:null}
      </section>
      <section className={styles.block}>
        <div className={styles.sectionHeader}><h2>Contacts</h2>{canCreateRecords&&detail?.can_view_contacts&&<button className={styles.plus} type="button" onClick={onCreateContact} aria-label="Add club contact"><Plus size={19}/></button>}</div>
        {loading&&<div className={styles.empty}><LoaderCircle className={styles.spin} size={19}/> Loading contacts…</div>}
        {!loading&&error&&<div className={styles.empty} role="alert">{error}</div>}
        {!loading&&!error&&!detail?.can_view_contacts&&<div className={styles.empty}><span className={styles.emptyIcon}><Shield size={25}/></span><strong>Private contacts</strong><p>Club contacts are available to agency administrators.</p></div>}
        {!loading&&!error&&detail?.can_view_contacts&&!detail.contacts.length&&<div className={styles.empty}><span className={styles.emptyIcon}><Building2 size={25}/></span><strong>No contacts found</strong><p>No contacts are associated with this club yet.</p></div>}
        {!loading&&!error&&detail?.can_view_contacts&&detail.contacts.length>0&&<div className={styles.rows}>{detail.contacts.map(person=><button type="button" className={styles.personRow} key={person.id} onClick={()=>onOpenContact(person.id)}><span className={styles.avatar}>{person.name.slice(0,1)}</span><span><strong>{person.name}</strong><small>{person.role||'Club contact'}</small></span><ChevronRight size={16}/></button>)}</div>}
      </section>
    </div>}
    {tab==='requests'&&<section className={styles.requests}>
      <div className={styles.sectionHeader}><h2>Requests</h2><div className={styles.actions}><label className={styles.srOnly} htmlFor="club-request-state">Request status</label><select id="club-request-state" value={requestsFilter} onChange={e=>setRequestsFilter(e.target.value as 'all'|'active')}><option value="active">Active</option><option value="all">All</option></select>{canCreateRecords&&<button type="button" className={styles.plus} onClick={onCreateNeed} aria-label="Add request"><Plus size={20}/></button>}</div></div>
      <div className={`${styles.tableWrap} ${styles.requestCardWrap}`}><table className={`${styles.table} ${styles.requestTable}`}><thead><tr><th>Request</th><th>Valid until</th><th>Priority</th><th>Transfer budget</th><th>Wage budget</th><th>Deal preference</th></tr></thead>
      <tbody>{requests.map(need=>{
        const title=need.title||need.position||'Club request';
        return <tr key={need.club_need_id} className={styles.recordRow}>
          <td data-label="Request">{UUID_PATTERN.test(txt(need.club_need_id))?<button type="button" className={styles.openRecord} aria-label={'Open request: '+title} onClick={()=>onOpenMarket(need.club_need_id)}>{title}<ChevronRight size={16}/></button>:title}</td>
          <td data-label="Valid until">{dateLabel(need.expires_at,'Not specified')}</td>
          <td data-label="Priority">{requestPriorityLabel(need.priority)}</td>
          <td data-label="Transfer budget">{amount(need.transfer_budget,need.currency)}</td>
          <td data-label="Wage budget">{wageBudgetLabel(need)}</td>
          <td data-label="Deal preference">{transferPreferenceLabel(need.transfer_type)}</td>
        </tr>;
      })}</tbody>
      </table>{!requests.length&&<div className={styles.empty}><span className={styles.emptyIcon}><Shield size={25}/></span><p>{requestsFilter==='active'?'No active requests':'No requests recorded'}</p></div>}</div>
    </section>}
    {tab==='deals'&&<section className={styles.requests}><div className={styles.sectionHeader}><h2>Deals</h2>{canCreateRecords&&<button type="button" className={styles.plus} aria-label="Add deal" onClick={onCreateDeal}><Plus size={20}/></button>}</div>
      <div className={`${styles.tableWrap} ${styles.requestCardWrap}`}><table className={`${styles.table} ${styles.requestTable}`}><thead><tr><th>Deal</th><th>Stage</th><th>Expected commission</th><th>Next action</th></tr></thead><tbody>
        {dealRows.map(deal=><tr key={deal.deal_room_id} className={styles.recordRow}><td data-label="Deal">{UUID_PATTERN.test(txt(deal.deal_room_id))?<button type="button" className={styles.openRecord} aria-label={'Open deal: '+(deal.title||'Deal')} onClick={()=>onOpenDeal(deal.deal_room_id,deal.title||'Deal',name)}>{deal.title||'Deal'} <ChevronRight size={16}/></button>:deal.title||'Deal'}</td><td data-label="Stage">{transferPreferenceLabel(deal.stage)}</td><td data-label="Expected commission">{amount(deal.expected_commission,deal.currency)}</td><td data-label="Next action">{dateLabel(deal.next_action_at,'Not scheduled')}</td></tr>)}
      </tbody></table>{!dealRows.length&&<div className={styles.empty}><span className={styles.emptyIcon}><Building2 size={25}/></span><p>No deals found</p></div>}</div>
    </section>}
    {tab==='overview'&&<p className={styles.footnote}>Confirmed player links are distinguished from provisional name matches. A link does not establish contract or registration status.</p>}
  </section>;
}
