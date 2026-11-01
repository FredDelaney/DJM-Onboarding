'use client';

import {ArrowLeft, ArrowUpDown, Building2, ChevronRight, Globe2, Lightbulb, LoaderCircle, Plus, Shield, UsersRound} from 'lucide-react';
import {useCallback,useEffect,useMemo,useState, type ReactNode} from 'react';
import {friendlyError} from '@/lib/platform-client';
import styles from './AgencyClubReferenceDetail.module.css';
import ClubIdentityMark, {CountryFlag} from './ClubIdentityMark';

type Invoke=(action:string,body?:Record<string,unknown>)=>Promise<any>;
type OpenRecord=(id:string,title:string,context?:string|null)=>void;
type Person={id:string;name:string;position?:string;role?:string};
type Detail={players:Person[];contacts:Person[];can_view_contacts:boolean;player_count_basis:string};
type Tab='overview'|'requests'|'deals';

const items=(value:unknown):any[]=>Array.isArray(value)?value:[];
const txt=(value:unknown)=>String(value??'').trim();
const amount=(value:unknown,currency:unknown)=>{
  if(value===null||value===undefined||value==='')return 'Not specified';
  const n=Number(value);
  if(!Number.isFinite(n))return 'Not specified';
  try{return new Intl.NumberFormat('en-GB',{style:'currency',currency:String(currency||'EUR'),maximumFractionDigits:0}).format(n);}
  catch{return String(value)+' '+String(currency||'');}
};

export default function AgencyClubReferenceDetail({
  account,invoke,onClose,onCreateContact,onOpenMarket,onOpenDeal,onOpenPlayer,editControl,refreshKey=0,
}: {
  account:any;invoke:Invoke;refreshKey?:number;editControl?:ReactNode;onClose:()=>void;onCreateContact:()=>void;
  onOpenMarket:(needId?:string)=>void;onOpenDeal:OpenRecord;onOpenPlayer:(id:string)=>void;
}) {
  const club=account?.club||{};
  const [tab,setTab]=useState<Tab>('overview');
  const [requestsFilter,setRequestsFilter]=useState<'active'|'all'>('active');
  const [detail,setDetail]=useState<Detail|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [insights,setInsights]=useState(false);
  const needRows=items(account?.demand?.items);
  const dealRows=items(account?.commercial?.deals);
  const organisationId=txt(club.organisation_id||club.id);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const response=await invoke('club_reference_people',{organisation_id:organisationId});
      const data=response?.people;
      if(!Array.isArray(data?.players)||!Array.isArray(data?.contacts))throw new Error('Club people could not be verified.');
      setDetail(data);
    } catch(cause){setError(friendlyError(cause));}
    finally{setLoading(false);}
  },[invoke,organisationId]);
  useEffect(()=>{void load();},[load,refreshKey]);
  const requests=useMemo(()=>requestsFilter==='all'?needRows:needRows.filter(x=>x.status==='active'),[needRows,requestsFilter]);
  const name=txt(club.name)||'Club';
  const country=txt(club.country),league=txt(club.league_name);
  const initials=name.split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join('');

  return <section className={styles.page} role="region" aria-label={`Club details for ${name}`}>
    <button type="button" className={styles.return} onClick={onClose}><ArrowLeft size={17}/> Back to Clubs</button>
    <header className={styles.clubHeader}>
      <ClubIdentityMark name={name} large/>
      <div className={styles.headlines}><h1>{name}</h1>
        <p><CountryFlag country={country}/>{country||'Country not recorded'}{league&&<><span className={styles.dot}>·</span><span className={styles.leagueLogo} aria-hidden="true">◈</span>{league}</>}</p>
      </div>
      <div className={styles.headActions}>
        {editControl}
        <button type="button" className={styles.insights} onClick={()=>setInsights(v=>!v)} aria-expanded={insights}><Lightbulb size={17}/> Insights</button>
      </div>
    </header>
    {insights&&<section className={styles.insightPanel}><strong>Recorded relationship insights</strong><p>{account?.top_strategic_play?.recommended_action||'No recommended next step has been recorded for this club.'}</p><small>Based on ReDream agency records, not external predictions.</small></section>}
    <nav className={styles.tabs} aria-label="Club sections">
      {(['overview','requests','deals'] as const).map(id=><button type="button" key={id} className={tab===id?styles.tabActive:styles.tab} onClick={()=>setTab(id)}>{id[0].toUpperCase()+id.slice(1)}</button>)}
    </nav>
    {tab==='overview'&&<div className={styles.panels}>
      <section className={styles.block}>
        <div className={styles.sectionHeader}><h2>Players</h2></div>
        {loading&&<div className={styles.empty}><LoaderCircle className={styles.spin} size={19}/> Loading players…</div>}
        {!loading&&error&&<div className={styles.empty} role="alert">{error}<button type="button" onClick={()=>void load()}>Retry</button></div>}
        {!loading&&!error&&!detail?.players?.length&&<div className={styles.empty}><span className={styles.emptyIcon}><UsersRound size={26}/></span><strong>No players found</strong><p>No players are associated with this club in your agency roster.</p></div>}
        {!loading&&!error&&detail?.players?.length? <div className={styles.rows}>{detail.players.map(person=><button type="button" key={person.id} className={styles.personRow} onClick={()=>onOpenPlayer(person.id)}><span className={styles.avatar}>{person.name.slice(0,1)}</span><span><strong>{person.name}</strong><small>{person.position||'Player'}</small></span><ChevronRight size={16}/></button>)}</div>:null}
      </section>
      <section className={styles.block}>
        <div className={styles.sectionHeader}><h2>Contacts</h2>{detail?.can_view_contacts&&<button className={styles.plus} type="button" onClick={onCreateContact} aria-label="Add club contact"><Plus size={19}/></button>}</div>
        {loading&&<div className={styles.empty}><LoaderCircle className={styles.spin} size={19}/> Loading contacts…</div>}
        {!loading&&error&&<div className={styles.empty} role="alert">{error}</div>}
        {!loading&&!error&&!detail?.can_view_contacts&&<div className={styles.empty}><span className={styles.emptyIcon}><Shield size={25}/></span><strong>Private contacts</strong><p>Club contacts are available to agency administrators.</p></div>}
        {!loading&&!error&&detail?.can_view_contacts&&!detail.contacts.length&&<div className={styles.empty}><span className={styles.emptyIcon}><Building2 size={25}/></span><strong>No contacts found</strong><p>No contacts are associated with this club yet.</p></div>}
        {!loading&&!error&&detail?.can_view_contacts&&detail.contacts.length>0&&<div className={styles.rows}>{detail.contacts.map(person=><div className={styles.personRow} key={person.id}><span className={styles.avatar}>{person.name.slice(0,1)}</span><span><strong>{person.name}</strong><small>{person.role||'Club contact'}</small></span></div>)}</div>}
      </section>
    </div>}
    {tab==='requests'&&<section className={styles.requests}>
      <div className={styles.sectionHeader}><h2>Requests</h2><div className={styles.actions}><label className={styles.srOnly} htmlFor="club-request-state">Request status</label><select id="club-request-state" value={requestsFilter} onChange={e=>setRequestsFilter(e.target.value as 'all'|'active')}><option value="active">Active</option><option value="all">All</option></select><button type="button" className={styles.plus} onClick={()=>onOpenMarket()} aria-label="Add request"><Plus size={20}/></button></div></div>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Position <ArrowUpDown size={12}/></th><th>Window</th><th>Priority</th><th>Players</th><th>Budget</th><th>Wage Budget</th><th>Deal Types</th></tr></thead>
      <tbody>{requests.map(need=><tr key={need.club_need_id} tabIndex={0} onClick={()=>onOpenMarket(need.club_need_id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpenMarket(need.club_need_id);}}} className={styles.clickable}><td>{need.position||need.title||'Not specified'}</td><td>{need.expires_at?new Date(need.expires_at).toLocaleDateString('en-GB',{month:'short',year:'numeric'}):'Not specified'}</td><td>{need.priority??'Not set'}</td><td>View matches</td><td>{amount(need.transfer_budget,need.currency)}</td><td>{amount(need.salary_budget,need.currency)}</td><td>{need.transfer_type||'Not specified'}</td></tr>)}</tbody>
      </table>{!requests.length&&<div className={styles.empty}><span className={styles.emptyIcon}><Shield size={25}/></span><p>No requests found</p></div>}</div>
    </section>}
    {tab==='deals'&&<section className={styles.requests}><div className={styles.sectionHeader}><h2>Deals</h2></div>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Deal</th><th>Stage</th><th>Expected Commission</th><th>Next Action</th><th>Open</th></tr></thead><tbody>
        {dealRows.map(deal=><tr key={deal.deal_room_id}><td>{deal.title||'Deal'}</td><td>{deal.stage||'Not specified'}</td><td>{amount(deal.expected_commission,deal.currency)}</td><td>{deal.next_action_at?new Date(deal.next_action_at).toLocaleDateString('en-GB'):'Not scheduled'}</td><td><button type="button" className={styles.openRecord} aria-label="Open deal" onClick={()=>onOpenDeal(deal.deal_room_id,deal.title||'Deal',name)}>Open deal <ChevronRight size={16}/></button></td></tr>)}
      </tbody></table>{!dealRows.length&&<div className={styles.empty}><span className={styles.emptyIcon}><Building2 size={25}/></span><p>No deals found</p></div>}</div>
    </section>}
    {tab==='overview'&&<p className={styles.footnote}>Player associations are based on an exact current-club name match. This is not a verified contract or registration link.</p>}
  </section>;
}
