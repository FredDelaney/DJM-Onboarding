'use client';

import {ArrowDown, ArrowUp, CalendarDays, ChevronDown, ChevronRight, Columns3, Filter, Flag, Globe2, LayoutGrid, List, LoaderCircle, MapPin, Plus, Search, ShieldCheck, Shirt, Target, Users, X} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {publicFile} from '@/lib/supabase';
import ClubIdentityMark,{CountryFlag} from './ClubIdentityMark';
import PlayerTeamAgentsControl,{type PlayerAgent} from './PlayerTeamAgentsControl';
import {friendlyError} from '@/lib/platform-client';
import {PLAYER_AGENCY_STATUSES,playerAgencyStatus,playerAgencyStatusLabel} from '@/lib/player-agency-status';
import styles from './PlayerExperience.module.css';

type Props={
  players:any[]; total:number; hasMore:boolean;
  search:string; onSearch:(value:string)=>void;
  onOpen:(id:string)=>void; onCreate?:()=>void; canCreate:boolean;
  onRecruitment:()=>void; onLoadMore?:()=>Promise<void>; directoryRefreshing?:boolean;
  scope?:string;rpc?:<T,>(name:string,args?:Record<string,unknown>)=>Promise<T>;
  canManageAgents?:boolean;onAgentsChanged?:()=>Promise<void>;
  recruitmentError?:string;onRetryRecruitment?:()=>Promise<void>;recruitmentTruncated?:boolean;
};
type Col='club'|'age'|'nationality'|'position'|'status'|'agent'|'stage';
const allColumns: {id:Col; label:string}[]=[
 {id:'club',label:'Club'}, {id:'age',label:'Age'}, {id:'nationality',label:'Nationality'},
 {id:'position',label:'Position'}, {id:'status',label:'Status'}, {id:'agent',label:'Agent'}, {id:'stage',label:'Stage'},
];
const ageOf=(value:unknown)=>{if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d/.test(value))return null;const born=new Date(value+'T12:00:00Z');if(Number.isNaN(born.getTime()))return null;const today=new Date();let years=today.getUTCFullYear()-born.getUTCFullYear();if(today.getUTCMonth()<born.getUTCMonth()||(today.getUTCMonth()===born.getUTCMonth()&&today.getUTCDate()<born.getUTCDate()))years--;return years>=0&&years<110?years:null;};
const initials=(value:string)=>value.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('');
const text=(value:unknown)=>String(value??'').trim();
const nameOf=(player:any)=>text(player?.identity?.name)||[text(player?.identity?.first_name),text(player?.identity?.last_name)].filter(Boolean).join(' ')||'Unnamed player';
const nationOf=(player:any)=>Array.isArray(player?.identity?.nationalities)?text(player.identity.nationalities[0]):text(player?.identity?.nationality);
const statusOf=(player:any)=>player?.roster_source==='recruitment'?'prospected':playerAgencyStatus(player?.identity?.agency_status);
const agentsOf=(player:any):PlayerAgent[]=>{
 if(player?.access?.restricted)return [];
 const agents=player?.identity?.assigned_agents;
 if(Array.isArray(agents))return agents.filter((person:any)=>typeof person?.user_id==='string'&&typeof person?.name==='string');
 const lead=player?.identity?.primary_agent;
 return typeof lead?.user_id==='string'&&typeof lead?.name==='string'?[{...lead,is_lead:true}]:[];
};
const stageOf=(player:any)=>text(player?.identity?.stage||player?.service?.market_coverage?.state);
type FilterKey='agent'|'position'|'status'|'clubContract'|'agencyContract'|'club'|'clubCountry'|'nationality'|'stage';
const initialFilters:Record<FilterKey,string>={agent:'',position:'',status:'',clubContract:'',agencyContract:'',club:'',clubCountry:'',nationality:'',stage:''};
const filterCategories=[
 {key:'agent',label:'Agents',icon:Users},
 {key:'position',label:'Position',icon:Shirt},
 {key:'status',label:'Status',icon:ShieldCheck},
 {key:'agencyContract',label:'Agency contract',icon:CalendarDays},
 {key:'clubContract',label:'Club contract',icon:CalendarDays},
 {key:'club',label:'Clubs',icon:Target},
 {key:'clubCountry',label:'Club country',icon:MapPin},
 {key:'nationality',label:'Nationality',icon:Flag},
 {key:'stage',label:'Stage',icon:Globe2},
] as const;
const expiryCategory=(value:unknown)=>{
 const raw=text(value).slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return 'missing';
 const date=new Date(raw+'T12:00:00Z');
 if(Number.isNaN(date.getTime()))return 'missing';
 const days=Math.ceil((date.getTime()-Date.now())/86400000);
 return days<0?'expired':days<=90?'soon':'future';
};
const contractOptions=[{value:'expired',label:'Expired'},{value:'soon',label:'Expiring within 90 days'},{value:'future',label:'More than 90 days left'},{value:'missing',label:'Not recorded'}];
function Portrait({player}:{player:any}){const name=nameOf(player);const src=publicFile('player-public',text(player?.identity?.profile_photo_path)||null);return <span className={styles.listPortrait}>{src?<img src={src} alt="" loading="lazy"/>:initials(name)}</span>;}

export default function PlayerDirectory({players,total,hasMore,search,onSearch,onOpen,onCreate,canCreate,onRecruitment,onLoadMore,directoryRefreshing=false,scope='',rpc,canManageAgents=false,onAgentsChanged,recruitmentError='',onRetryRecruitment,recruitmentTruncated=false}:Props){
 const [mode,setMode]=useState<'table'|'cards'>('table');
 useEffect(()=>{
  const media=window.matchMedia('(max-width:680px)');
  const adapt=()=>setMode(media.matches?'cards':'table');
  adapt();
  media.addEventListener('change',adapt);
  return()=>media.removeEventListener('change',adapt);
 },[]);
 const [columns,setColumns]=useState<Col[]>(allColumns.map(item=>item.id));
 const [filters,setFilters]=useState<Record<FilterKey,string>>(initialFilters);
 const [filterCategory,setFilterCategory]=useState<FilterKey>('agent');
 const setFilter=(key:FilterKey,value:string)=>setFilters(current=>({...current,[key]:value}));
 const [sort,setSort]=useState<'name'|'age'|'club'>('name');
 const [ascending,setAscending]=useState(true);
 const [selected,setSelected]=useState<string[]>([]);
 const [loadingMore,setLoadingMore]=useState(false);
 const [moreError,setMoreError]=useState('');
 const options=useMemo(()=>{
  const unique=(list:string[])=>Array.from(new Set(list.filter(Boolean))).sort((a,b)=>a.localeCompare(b)).map(value=>({value,label:value}));
  const agents=new Map<string,string>();
  players.forEach(p=>agentsOf(p).forEach(agent=>agents.set(agent.user_id,agent.name)));
  return {
   agent:Array.from(agents.entries()).sort((a,b)=>a[1].localeCompare(b[1])).map(([value,label])=>({value,label})),
   position:unique(players.map(p=>text(p?.identity?.primary_position))),
   status:[...PLAYER_AGENCY_STATUSES.map(status=>({...status})),
    ...(players.some(p=>p?.roster_source==='recruitment')?[{value:'prospected',label:'Prospected'}]:[])],
   agencyContract:contractOptions,clubContract:contractOptions,
   club:unique(players.map(p=>text(p?.identity?.current_club))),
   clubCountry:unique(players.map(p=>text(p?.identity?.current_country))),
   nationality:unique(players.map(nationOf)),
   stage:unique(players.map(stageOf)),
  };
 },[players]);
 const filterCount=Object.values(filters).filter(Boolean).length;
 const visible=useMemo(()=>players.filter(player=>{
  const identity=player?.identity||{};
  const matches=[nameOf(player),text(identity.current_club),text(identity.current_country),text(identity.primary_position),nationOf(player)].join(' ').toLowerCase().includes(search.trim().toLowerCase());
  if(!matches)return false;
  const assignedAgents=agentsOf(player);
  const actual:Record<FilterKey,string>={
   agent:'',position:text(identity.primary_position),
   status:statusOf(player),clubContract:expiryCategory(identity.contract_expiry),
   agencyContract:expiryCategory(player?.representation?.end_date),
   club:text(identity.current_club),clubCountry:text(identity.current_country),
   nationality:nationOf(player),stage:stageOf(player),
  };
  return (Object.entries(filters) as [FilterKey,string][]).every(([key,wanted])=>!wanted||(key==='agent'?assignedAgents.some(a=>a.user_id===wanted):actual[key]===wanted));
 }).sort((a,b)=>{
  const aval=sort==='age'?ageOf(a?.identity?.date_of_birth)??999:sort==='club'?text(a?.identity?.current_club):nameOf(a);
  const bval=sort==='age'?ageOf(b?.identity?.date_of_birth)??999:sort==='club'?text(b?.identity?.current_club):nameOf(b);
  const cmp=typeof aval==='number'&&typeof bval==='number'?aval-bval:String(aval).localeCompare(String(bval));
  return ascending?cmp:-cmp;
 }),[players,search,filters,sort,ascending]);
 const included=(col:Col)=>columns.includes(col);
 const toggleColumn=(col:Col)=>setColumns(current=>current.includes(col)?current.length===1?current:current.filter(item=>item!==col):[...current,col]);
 const changeSort=(field:'name'|'age'|'club')=>{if(sort===field)setAscending(!ascending);else{setSort(field);setAscending(true);}};
 const toggleSelection=(id:string)=>setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
 const allChecked=visible.length>0&&visible.every(player=>selected.includes(String(player.player_id)));
 const selectedRecord=selected.length===1?players.find(player=>String(player.player_id)===selected[0]):null;
 const loadMore=async()=>{if(!onLoadMore||loadingMore||directoryRefreshing)return;setLoadingMore(true);setMoreError('');try{await onLoadMore();}catch(error){setMoreError(friendlyError(error));}finally{setLoadingMore(false);}};
 const clear=()=>{setFilters(initialFilters);onSearch('');};
 return <section className={styles.directory} aria-label="Players directory">
  <div className={styles.directoryTop}>
   <div className={styles.directoryHeading}><div><span>PLAYER MANAGEMENT</span><h2>Players</h2></div><small>{total} {total===1?'player':'players'}</small></div>
   <div className={styles.directoryActions}>
    <label className={styles.listSearch}><Search size={18}/><span className={styles.srOnly}>Search players</span><input type="search" aria-label="Search players" value={search} onChange={event=>onSearch(event.target.value)} placeholder="Search players..."/></label>
    <div className={styles.viewSwitcher} aria-label="Player view">
     <button type="button" aria-label="Table view" aria-pressed={mode==='table'} onClick={()=>setMode('table')}><List size={17}/> <span>Table</span></button>
     <button type="button" aria-label="Card view" aria-pressed={mode==='cards'} onClick={()=>setMode('cards')}><LayoutGrid size={17}/></button>
    </div>
    {canCreate&&onCreate?<button className={styles.addButton} type="button" onClick={onCreate}><Plus size={17}/> Add Player</button>:null}
   </div>
  </div>
  <div className={styles.listTools}>
   <details className={styles.toolDropdown}><summary><Columns3 size={17}/> Columns <ChevronDown size={13}/></summary><div className={styles.toolPopover}>{allColumns.map(col=><label key={col.id}><input type="checkbox" checked={included(col.id)} onChange={()=>toggleColumn(col.id)}/>{col.label}</label>)}</div></details>
   <details className={styles.toolDropdown}><summary><Filter size={17}/> Filter {filterCount?<strong>{filterCount}</strong>:null}<ChevronDown size={13}/></summary>
    <div className={styles.advancedFilter} aria-label="Player filters">
     <div className={styles.filterCategories}>{filterCategories.map(category=>{
      const Icon=category.icon;
      return <button type="button" key={category.key} aria-pressed={filterCategory===category.key} onClick={()=>setFilterCategory(category.key)}>
       <Icon size={16}/><span>{category.label}</span>{filters[category.key]?<i className={styles.filterDot} aria-label="Active filter"/>:null}<ChevronRight size={15}/>
      </button>;
     })}<small>{filterCategories.length} filter categories</small></div>
     <div className={styles.filterDetail}>
      <strong>{filterCategories.find(category=>category.key===filterCategory)?.label}</strong>
      <label className={styles.filterControl}>Show players
       <select aria-label={filterCategory==='status'?'Agency status filter':'Filter '+filterCategory} value={filters[filterCategory]} onChange={event=>setFilter(filterCategory,event.target.value)}>
        <option value="">All {filterCategories.find(category=>category.key===filterCategory)?.label.toLowerCase()}</option>
        {options[filterCategory].map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
       </select>
      </label>
      <p>{filterCategory==='agent'?'Filter by any agent assigned to this player, including the lead.':filterCategory==='agencyContract'?'Uses the recorded active agency agreement, where available.':'Uses the information recorded for each player.'}</p>
      {filters[filterCategory]?<button type="button" onClick={()=>setFilter(filterCategory,'')}>Remove this filter</button>:null}
     </div>
    </div>
   </details>
   {(filterCount||search)?<button type="button" className={styles.clearFilters} onClick={clear}>Clear all</button>:null}
   <button type="button" className={styles.recruitmentLink} onClick={onRecruitment}>Recruitment <ChevronDown size={13}/></button>
   {selected.length?<div className={styles.selectionActions}><span>{selected.length} selected</span>{selected.length===1?<button type="button" onClick={()=>onOpen(selected[0])}>{selectedRecord?.roster_source==='recruitment'?'Open recruitment':'Open player'}</button>:null}<button type="button" aria-label="Clear selection" onClick={()=>setSelected([])}><X size={15}/></button></div>:null}
  </div>
  <div className={styles.tableScroll} data-roster-table-mode={mode}>
   {mode==='table'?<table className={styles.rosterTable}><thead><tr>
    <th className={styles.nameColumn}><div className={styles.rosterNameContent}><span className={styles.selectPlayer}><button type="button" role="checkbox" aria-label="Select visible players" aria-checked={allChecked} onClick={()=>setSelected(allChecked?selected.filter(id=>!visible.some(player=>String(player.player_id)===id)):[...new Set([...selected,...visible.map(player=>String(player.player_id))])])}/></span><button type="button" onClick={()=>changeSort('name')}>Name {sort==='name'?(ascending?<ArrowUp size={13}/>:<ArrowDown size={13}/>):null}</button></div></th>
    {included('club')?<th><button type="button" onClick={()=>changeSort('club')}>Club {sort==='club'?(ascending?<ArrowUp size={13}/>:<ArrowDown size={13}/>):null}</button></th>:null}
    {included('age')?<th><button type="button" onClick={()=>changeSort('age')}>Age {sort==='age'?(ascending?<ArrowUp size={13}/>:<ArrowDown size={13}/>):null}</button></th>:null}
    {included('nationality')?<th>Nationality</th>:null}
    {included('position')?<th>Position</th>:null}
    {included('status')?<th>Status</th>:null}
    {included('agent')?<th className={styles.agentHeader}>Agents</th>:null}
    {included('stage')?<th>Stage</th>:null}
   </tr></thead><tbody>
   {visible.map(player=>{const id=String(player.player_id),identity=player?.identity||{},status=statusOf(player),agents=agentsOf(player);return <tr key={id}>
    <td className={styles.nameColumn}><div className={styles.rosterNameContent}><span className={styles.selectPlayer}><button type="button" role="checkbox" aria-label={'Select '+nameOf(player)} aria-checked={selected.includes(id)} onClick={()=>toggleSelection(id)}/></span><button type="button" className={styles.playerRowName} aria-label={'Open '+nameOf(player)} onClick={()=>onOpen(id)}><Portrait player={player}/><span>{nameOf(player)}</span></button></div></td>
    {included('club')?<td><span className={styles.clubCell}>{text(identity.current_club)?<ClubIdentityMark name={text(identity.current_club)} country={text(identity.current_country)}/>:<span className={styles.clubMark}>–</span>}<span className={styles.cellClamp}>{text(identity.current_club)||'–'}</span></span></td>:null}
    {included('age')?<td>{ageOf(identity.date_of_birth)??'–'}</td>:null}
    {included('nationality')?<td>{nationOf(player)?<span className={styles.nationalityCell}><CountryFlag country={nationOf(player)}/><span className={styles.cellClamp}>{nationOf(player)}</span></span>:'–'}</td>:null}
    {included('position')?<td>{text(identity.primary_position)||'–'}</td>:null}
    {included('status')?<td><span className={styles.statusChip} data-status={status}>{status==='prospected'?'Prospected':playerAgencyStatusLabel(status)}</span></td>:null}
    {included('agent')?<td className={styles.agentCell}>{player?.roster_source==='recruitment'?'–':rpc?<PlayerTeamAgentsControl playerId={id} playerName={nameOf(player)} initialAgents={agents} scope={scope} rpc={rpc} canManage={canManageAgents&&!player?.access?.restricted} onChanged={onAgentsChanged}/>:agents.length?<span>{agents.map(a=>a.name).join(', ')}</span>:'–'}</td>:null}
    {included('stage')?<td>{stageOf(player)||'–'}</td>:null}
   </tr>;})}
   </tbody></table>:<div className={styles.playerTiles}>{visible.map(player=>{const identity=player?.identity||{};return <button type="button" key={player.player_id} className={styles.playerTile} aria-label={'Open '+nameOf(player)} onClick={()=>onOpen(String(player.player_id))}><Portrait player={player}/><strong>{nameOf(player)}</strong><span>{[identity.primary_position,identity.current_club].filter(Boolean).join(' · ')||'Player details'}</span><span className={styles.statusChip} data-status={statusOf(player)}>{statusOf(player)==='prospected'?'Prospected':playerAgencyStatusLabel(statusOf(player))}</span><small>{nationOf(player)||'Nationality not recorded'}</small></button>;})}</div>}
   {!visible.length?<div className={styles.directoryEmpty}><Users size={25}/><h3>{search||filterCount?'No players found':'No players yet'}</h3><p>{search||filterCount?'Change your search or filters.':'Add your first player to start building your squad.'}</p></div>:null}
  </div>
  <footer className={styles.directoryFooter}><span>{players.length} of {total} players and prospects loaded.{search||filterCount?' ' + visible.length + ' match current filters.':''}{hasMore&&filterCount?' Filters apply to loaded players.':''}</span>{recruitmentError?<p role="alert">Recruitment prospects are temporarily unavailable. <button type="button" onClick={()=>void onRetryRecruitment?.()} disabled={!onRetryRecruitment||directoryRefreshing}>Retry recruitment</button></p>:null}{recruitmentTruncated?<p>Showing the first 500 recruitment prospects. Use Recruitment to review the full pipeline.</p>:null}{hasMore?<button type="button" disabled={loadingMore||directoryRefreshing} onClick={()=>void loadMore()}>{loadingMore||directoryRefreshing?<LoaderCircle size={16}/>:<Plus size={16}/>} {directoryRefreshing?'Refreshing players...':loadingMore?'Loading...':moreError?'Retry loading players':'Load more players'}</button>:null}{moreError?<p role="alert">{moreError}</p>:null}</footer>
 </section>;
}
