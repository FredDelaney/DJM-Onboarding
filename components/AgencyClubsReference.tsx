'use client';

import {
  ArrowLeft, ArrowUpDown, Building2, Check, CheckCircle2, ChevronLeft,
  ChevronRight, Columns3, Globe2, LoaderCircle, Pencil, Plus, Search,
  Shield, SlidersHorizontal, UsersRound, X,
} from 'lucide-react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {AgencyClubAccountRequest} from './AgencyClubAccountDrawer';
import {friendlyError} from '@/lib/platform-client';
import styles from './AgencyClubsReference.module.css';
import ClubIdentityMark, {CountryFlag} from './ClubIdentityMark';

type ClubRow = {
  organisation_id: string;
  name: string;
  country: string | null;
  city: string | null;
  league_name: string | null;
  player_count: number;
  request_count: number | null;
  deal_count: number | null;
  contact_count: number | null;
  source_id: string | null;
};
type CatalogueClub = {
  id: string;
  name: string;
  country: string;
  league: string | null;
  aliases: string[];
};
type DirectoryPage = {items: ClubRow[]; total: number; has_more: boolean};
type Invoke = (action: string, body?: Record<string, unknown>) => Promise<any>;
type Stage = 'choose' | 'search' | 'success' | null;
const PAGE_SIZE = 8;

function ClubMark({name,country,size = 'small'}: {name: string;country?:string|null; size?: 'small'|'large'}) {
  return <ClubIdentityMark name={name} country={country} large={size==='large'}/>;
}

export default function AgencyClubsReference({
  invoke,
  onRefresh,
  onCreate,
  onOpenClubAccount,
  canCreateRecords,
}: {
  invoke: Invoke;
  onRefresh: () => Promise<void>;
  onCreate: (kind:'club'|'contact')=>void;
  onOpenClubAccount:(request:AgencyClubAccountRequest)=>void;
  canCreateRecords:boolean;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ClubRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<'name'|'country'|'league'|'players'|'requests'>('name');
  const [descending, setDescending] = useState(false);
  const [country, setCountry] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [showLeague, setShowLeague] = useState(true);
  const [showPlayers, setShowPlayers] = useState(true);
  const [showRequests, setShowRequests] = useState(true);
  const [stage, setStage] = useState<Stage>(null);
  const [catalogueQuery, setCatalogueQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CatalogueClub[]>([]);
  const [catalogueTotal, setCatalogueTotal] = useState(0);
  const [catalogueBusy, setCatalogueBusy] = useState(false);
  const [catalogueError, setCatalogueError] = useState('');
  const [importing, setImporting] = useState<string|null>(null);
  const [importError, setImportError] = useState('');
  const [success, setSuccess] = useState<{club:CatalogueClub; id:string; existing:boolean; refreshFailed:boolean}|null>(null);
  const [recent, setRecent] = useState<CatalogueClub[]>([]);
  const requestSerial = useRef(0);
  const [revision, setRevision] = useState(0);

  const load = useCallback(async () => {
    const ticket=++requestSerial.current;
    setLoading(true);
    setError('');
    try {
      const response = await invoke('clubs_directory',{search:query.trim(),limit:PAGE_SIZE,offset:page*PAGE_SIZE});
      const directory = response?.directory as DirectoryPage | undefined;
      if (!Array.isArray(directory?.items) || !Number.isFinite(directory?.total)) {
        throw new Error('The club directory returned an invalid response.');
      }
      if(ticket!==requestSerial.current) return;
      setRows(directory.items);
      setTotal(directory.total);
    } catch (cause) {
      if(ticket===requestSerial.current) setError(friendlyError(cause));
    } finally {
      if(ticket===requestSerial.current) setLoading(false);
    }
  }, [invoke, query, page]);

  useEffect(() => {
    const id=window.setTimeout(()=>{void load();},query?220:0);
    return ()=>{window.clearTimeout(id);requestSerial.current++;};
  },[load,revision]);

  useEffect(()=>{
    try {
      const saved=JSON.parse(window.localStorage.getItem('redream-recent-club-searches-v1')||'[]');
      if(Array.isArray(saved))setRecent(saved.slice(0,5).filter((item:any)=>typeof item?.id==='string'));
    } catch {/* Recent searches are optional. */}
  },[]);

  useEffect(()=>{
    if(stage!=='search')return;
    const controller=new AbortController();
    const value=catalogueQuery.trim();
    if(value.length<2){setSuggestions([]);setCatalogueTotal(0);setCatalogueBusy(false);setCatalogueError('');return;}
    const id=window.setTimeout(async()=>{
      setCatalogueBusy(true);setCatalogueError('');
      try {
        const response=await fetch('/api/club-catalogue?q='+encodeURIComponent(value),{signal:controller.signal});
        if(!response.ok)throw new Error('Club search is temporarily unavailable.');
        const result=await response.json();
        if(!Array.isArray(result.items))throw new Error('Could not read club search results.');
        setSuggestions(result.items);
        setCatalogueTotal(Number(result.total)||0);
      } catch(cause) {
        if(!controller.signal.aborted)setCatalogueError(friendlyError(cause));
      } finally {if(!controller.signal.aborted)setCatalogueBusy(false);}
    },200);
    return ()=>{controller.abort();window.clearTimeout(id);};
  },[catalogueQuery,stage]);

  useEffect(()=>{
    if(!stage)return;
    const close=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!importing)setStage(null);
    };
    window.addEventListener('keydown',close);
    return ()=>window.removeEventListener('keydown',close);
  },[stage,importing]);

  const countries=useMemo(()=>[...new Set(rows.map(row=>row.country).filter((item):item is string=>Boolean(item)))].sort(),[rows]);
  const shown=useMemo(()=>{
    const filtered=country?rows.filter(r=>r.country===country):[...rows];
    return filtered.sort((a,b)=>{
      const n=sort==='players'?'player_count':sort==='requests'?'request_count':sort==='country'?'country':sort==='league'?'league_name':'name';
      const x=a[n],y=b[n];
      const comparison=(typeof x==='number'&&typeof y==='number')?x-y:String(x||'').localeCompare(String(y||''));
      return descending?-comparison:comparison;
    });
  },[rows,country,sort,descending]);

  const changeSort=(next:typeof sort)=>{if(sort===next)setDescending(v=>!v);else{setSort(next);setDescending(false);}};
  const openClub=(club:Pick<ClubRow,'organisation_id'|'name'|'country'|'city'|'league_name'>)=>{
    if(!club.organisation_id)return;
    onOpenClubAccount({key:'club-account:'+club.organisation_id,organisationId:club.organisation_id,
      title:club.name,country:club.country,context:[club.city,club.country,club.league_name].filter(Boolean).join(' · ')});
  };
  const resetFlow=()=>{if(importing)return;setStage(null);setImportError('');setCatalogueQuery('');};
  const saveRecent=(club:CatalogueClub)=>{
    const next=[club,...recent.filter(item=>item.id!==club.id)].slice(0,5);
    setRecent(next);
    try{window.localStorage.setItem('redream-recent-club-searches-v1',JSON.stringify(next));}catch{}
  };
  const importClub=async (club:CatalogueClub)=>{
    if(importing)return;
    setImporting(club.id);setImportError('');
    try {
      const response=await invoke('import_club',{club_name:club.name,country:club.country,
        league_name:club.league,source_id:club.id});
      const result=response?.created;
      const id=String(result?.organisation_id||'');
      if(!/^[\da-f-]{36}$/i.test(id))throw new Error('The club was not confirmed as saved.');
      saveRecent(club);
      let refreshFailed=false;
      try {await onRefresh();setRevision(n=>n+1);} catch {refreshFailed=true;}
      setSuccess({club,id,existing:Boolean(result.already_imported||!result.created),refreshFailed});
      setStage('success');
    } catch(cause){setImportError(friendlyError(cause));}
    finally{setImporting(null);}
  };
  const buttonHeader=(field:typeof sort,title:string)=>(
    <button type="button" className={styles.sortButton} onClick={()=>changeSort(field)}>
      {title}<ArrowUpDown size={13} aria-hidden="true"/>
    </button>
  );

  return <section className={styles.shell} aria-label="Clubs">
    <div className={styles.tools}>
      <label className={styles.searchField}>
        <Search size={20} aria-hidden="true"/>
        <span className={styles.srOnly}>Search clubs</span>
        <input type="search" aria-label="Search Network" value={query} placeholder="Search clubs..." onChange={event=>{setQuery(event.target.value);setPage(0);}} />
        {query&&<button type="button" onClick={()=>{setQuery('');setPage(0);}} aria-label="Clear search"><X size={15}/></button>}
      </label>
      {canCreateRecords&&<button type="button" data-ui-button="primary" className={styles.primary} onClick={()=>{setStage('choose');setImportError('');}}>
        <Plus size={18}/> Add Club
      </button>}
    </div>
    <div className={styles.secondaryTools}>
      <div className={styles.controlWrap}>
        <button type="button" className={styles.subtleButton} onClick={()=>{setColumnsOpen(v=>!v);setFilterOpen(false);}} aria-expanded={columnsOpen}><Columns3 size={16}/> Columns</button>
        {columnsOpen&&<div className={styles.popover} role="group" aria-label="Visible columns">
          <label><input type="checkbox" checked={showLeague} onChange={e=>setShowLeague(e.target.checked)}/> League</label>
          <label><input type="checkbox" checked={showPlayers} onChange={e=>setShowPlayers(e.target.checked)}/> Players</label>
          <label><input type="checkbox" checked={showRequests} onChange={e=>setShowRequests(e.target.checked)}/> Requests</label>
        </div>}
      </div>
      <div className={styles.controlWrap}>
        <button type="button" className={styles.subtleButton} onClick={()=>{setFilterOpen(v=>!v);setColumnsOpen(false);}} aria-expanded={filterOpen}><SlidersHorizontal size={16}/> Filter{country?' · '+country:''}</button>
        {filterOpen&&<div className={styles.popover} role="group" aria-label="Country filter">
          <button type="button" onClick={()=>{setCountry('');setFilterOpen(false);}}>All countries</button>
          {countries.map(item=><button type="button" key={item} onClick={()=>{setCountry(item);setFilterOpen(false);}}>{item}</button>)}
          <small>Filtering this page. Search above to find clubs across your agency.</small>
        </div>}
      </div>
      <span className={styles.recordCount}>{total.toLocaleString('en-GB')} {total===1?'club':'clubs'}</span>
    </div>
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead><tr>
          <th>{buttonHeader('name','Club')}</th>
          <th>{buttonHeader('country','Country')}</th>
          {showLeague&&<th>{buttonHeader('league','League')}</th>}
          {showPlayers&&<th className={styles.numberCell}>{buttonHeader('players','Players')}</th>}
          {showRequests&&<th className={styles.numberCell}>{buttonHeader('requests','Requests')}</th>}
        </tr></thead>
        <tbody>
          {!loading&&!error&&shown.map(club=><tr key={club.organisation_id}>
            <td><button type="button" className={styles.clubCell} onClick={()=>openClub(club)}><ClubMark name={club.name} country={club.country}/><span>{club.name}</span><ChevronRight className={styles.clubArrow} size={16}/></button></td>
            <td><span className={styles.countryCell}><CountryFlag country={club.country}/>{club.country||'Not recorded'}</span></td>
            {showLeague&&<td className={styles.muted}><span className={styles.leagueCell}><span aria-hidden="true" className={styles.leagueIcon}>◈</span>{club.league_name||'Not recorded'}</span></td>}
            {showPlayers&&<td className={styles.numberCell} title="Players with an exact current-club name match">{club.player_count??'Not set'}</td>}
            {showRequests&&<td className={styles.numberCell}>{club.request_count??'Not set'}</td>}
          </tr>)}
        </tbody>
      </table>
      {loading&&<div className={styles.empty} role="status"><LoaderCircle className={styles.spin} size={22}/> Loading your clubs…</div>}
      {!loading&&error&&<div className={styles.empty} role="alert"><p>{error}</p><button type="button" onClick={()=>void load()}>Retry</button></div>}
      {!loading&&!error&&!shown.length&&<div className={styles.empty}><Building2 size={26}/><strong>{query?'No matching clubs':'Your club directory is empty'}</strong><p>{query?'Try another name or country.':'Add your first club to get started.'}</p></div>}
    </div>
    <div className={styles.pagination}>
      <button type="button" onClick={()=>setPage(n=>Math.max(0,n-1))} disabled={page===0||loading}><ChevronLeft size={17}/> Previous</button>
      <span>Page {page+1} of {Math.max(1,Math.ceil(total/PAGE_SIZE))}</span>
      <button type="button" onClick={()=>setPage(n=>n+1)} disabled={loading||(page+1)*PAGE_SIZE>=total}>Next <ChevronRight size={17}/></button>
    </div>
    <p className={styles.sourceNote}>Players are matched to clubs by the exact name saved in their profiles. Club data is private to your agency.</p>

    {stage&&<div className={styles.overlay} onMouseDown={event=>{if(event.target===event.currentTarget)resetFlow();}}>
      <section className={stage==='success'?styles.successDialog:styles.dialog} role="dialog" aria-modal="true" aria-label={stage==='choose'?'Add Club':stage==='search'?'Search Club':'Club saved'}>
        {stage!=='success'&&<header className={styles.dialogHeader}>
          {stage==='search'?<button type="button" data-ui-button="tertiary" className={styles.back} onClick={()=>setStage('choose')}><ArrowLeft size={17}/> Back</button>:<span/>}
          <strong>{stage==='choose'?'Add Club':'Search Club'}</strong>
          <button type="button" aria-label="Close" onClick={resetFlow} disabled={Boolean(importing)}><X size={21}/></button>
        </header>}
        {stage==='choose'&&<div className={styles.choices}>
          <button type="button" className={styles.choice} onClick={()=>setStage('search')}>
            <span className={styles.choiceIcon}><Search size={24}/></span>
            <span><strong>Search Club</strong><small>Find and import an existing club</small></span><span className={styles.recommended}>Recommended</span><ChevronRight size={17}/>
          </button>
          <button type="button" className={styles.choice} onClick={()=>{setStage(null);onCreate('club');}}>
            <span className={styles.choiceIcon}><Pencil size={23}/></span>
            <span><strong>Manual Entry</strong><small>Create a club from scratch</small></span><ChevronRight size={17}/>
          </button>
        </div>}
        {stage==='search'&&<>
          <div className={styles.searchModalBody}>
            <label className={styles.modalSearch}><Search size={19}/><input value={catalogueQuery} onChange={event=>setCatalogueQuery(event.target.value)} placeholder="Search clubs by name" autoFocus maxLength={90}/>{catalogueQuery&&<button type="button" onClick={()=>setCatalogueQuery('')} aria-label="Clear"><X size={18}/></button>}</label>
            {!catalogueQuery.trim()&&recent.length>0&&<div className={styles.recent}><div><strong>Recent Searches</strong><button type="button" onClick={()=>{setRecent([]);try{localStorage.removeItem('redream-recent-club-searches-v1');}catch{}}}>Clear</button></div>
              {recent.map(club=><button type="button" key={club.id} onClick={()=>setCatalogueQuery(club.name)}><ClubMark name={club.name} country={club.country}/><span><strong>{club.name}</strong><small><CountryFlag country={club.country}/>{club.country}</small></span></button>)}
            </div>}
            {catalogueQuery.trim().length===1&&<p className={styles.helper}>Enter at least two characters to search.</p>}
            {catalogueBusy&&<p className={styles.helper}><LoaderCircle className={styles.spin} size={16}/> Searching clubs…</p>}
            {catalogueError&&<p className={styles.error} role="alert">{catalogueError}</p>}
            {importError&&<p className={styles.error} role="alert">{importError}</p>}
            {catalogueQuery.trim().length>1&&!catalogueBusy&&!catalogueError&&<>
              <div className={styles.suggestionCount}>{catalogueTotal} {catalogueTotal===1?'match':'matches'} <span>Select a club to add it to your agency</span></div>
              <div className={styles.results}>
                {suggestions.map(club=><button type="button" className={styles.result} key={club.id} onClick={()=>void importClub(club)} disabled={Boolean(importing)}>
                  <ClubMark name={club.name} country={club.country}/><span><strong>{club.name}</strong><small><CountryFlag country={club.country}/>{club.country}{club.league?' · '+club.league:''}</small></span>
                  {importing===club.id?<LoaderCircle className={styles.spin} size={19}/>:<Plus size={17}/>}
                </button>)}
                {!suggestions.length&&<p className={styles.helper}>No matches. You can go back and add this club manually.</p>}
              </div>
            </>}
          </div>
        </>}
        {stage==='success'&&success&&<div className={styles.saved}>
          <button type="button" className={styles.savedClose} aria-label="Close" onClick={resetFlow}><X size={19}/></button>
          <div className={styles.successIcon}><CheckCircle2 size={39}/></div>
          <h2>{success.existing?'Club Already Added':'Club Added Successfully'}</h2>
          <p><strong>{success.club.name}</strong> is in your club directory.</p>
          {success.refreshFailed&&<p className={styles.error}>Saved successfully, but the club list could not refresh.</p>}
          <div className={styles.savedActions}>
            <button type="button" data-ui-button="primary" className={styles.primary} onClick={()=>{resetFlow();openClub({organisation_id:success.id,name:success.club.name,country:success.club.country,city:null,league_name:success.club.league});}}>View Club</button>
            <button type="button" onClick={()=>{setStage('search');setCatalogueQuery('');setSuccess(null);setImportError('');}}>Add Another Club</button>
          </div>
        </div>}
        {stage!=='success'&&<footer className={styles.dialogFooter}>Can’t find a club? <button type="button" onClick={()=>{setStage(null);onCreate('club');}}>Add manually</button><small>Club names from OpenFootball (CC0). Badges and leagues are shown only when verified.</small></footer>}
      </section>
    </div>}
  </section>;
}
