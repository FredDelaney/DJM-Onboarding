'use client';

import {ArrowDown, ArrowUp, ChevronDown, Columns3, Filter, LayoutGrid, List, LoaderCircle, Plus, Search, Users, X} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {publicFile} from '@/lib/supabase';
import {friendlyError} from '@/lib/platform-client';
import styles from './PlayerExperience.module.css';

type Props={
  players:any[]; total:number; hasMore:boolean;
  search:string; onSearch:(value:string)=>void;
  onOpen:(id:string)=>void; onCreate?:()=>void; canCreate:boolean;
  onRecruitment:()=>void; onLoadMore?:()=>Promise<void>; directoryRefreshing?:boolean;
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
const statusOf=(player:any)=>player?.access?.restricted?'Assigned':text(player?.service?.state||player?.identity?.representation_status)||'Recorded';
const agentOf=(player:any)=>player?.access?.restricted?'':text(player?.agent_name||player?.identity?.agent_name||player?.assigned_agent_name);
function Portrait({player}:{player:any}){const name=nameOf(player);const src=publicFile('player-public',text(player?.identity?.profile_photo_path)||null);return <span className={styles.listPortrait}>{src?<img src={src} alt="" loading="lazy"/>:initials(name)}</span>;}

export default function PlayerDirectory({players,total,hasMore,search,onSearch,onOpen,onCreate,canCreate,onRecruitment,onLoadMore,directoryRefreshing=false}:Props){
 const [mode,setMode]=useState<'table'|'cards'>('table');
 useEffect(()=>{
  const media=window.matchMedia('(max-width:680px)');
  const adapt=()=>setMode(media.matches?'cards':'table');
  adapt();
  media.addEventListener('change',adapt);
  return()=>media.removeEventListener('change',adapt);
 },[]);
 const [columns,setColumns]=useState<Col[]>(allColumns.map(item=>item.id));
 const [filterPosition,setFilterPosition]=useState('');
 const [filterCountry,setFilterCountry]=useState('');
 const [sort,setSort]=useState<'name'|'age'|'club'>('name');
 const [ascending,setAscending]=useState(true);
 const [selected,setSelected]=useState<string[]>([]);
 const [loadingMore,setLoadingMore]=useState(false);
 const [moreError,setMoreError]=useState('');
 const positions=useMemo(()=>Array.from(new Set(players.map(p=>text(p?.identity?.primary_position)).filter(Boolean))).sort(),[players]);
 const countries=useMemo(()=>Array.from(new Set(players.map(nationOf).filter(Boolean))).sort(),[players]);
 const filterCount=Number(Boolean(filterPosition))+Number(Boolean(filterCountry));
 const visible=useMemo(()=>players.filter(player=>{
  const identity=player?.identity||{};
  const matches=[nameOf(player),text(identity.current_club),text(identity.current_country),text(identity.primary_position),nationOf(player)].join(' ').toLowerCase().includes(search.trim().toLowerCase());
  return matches&&(!filterPosition||text(identity.primary_position)===filterPosition)&&(!filterCountry||nationOf(player)===filterCountry);
 }).sort((a,b)=>{
  const aval=sort==='age'?ageOf(a?.identity?.date_of_birth)??999:sort==='club'?text(a?.identity?.current_club):nameOf(a);
  const bval=sort==='age'?ageOf(b?.identity?.date_of_birth)??999:sort==='club'?text(b?.identity?.current_club):nameOf(b);
  const cmp=typeof aval==='number'&&typeof bval==='number'?aval-bval:String(aval).localeCompare(String(bval));
  return ascending?cmp:-cmp;
 }),[players,search,filterPosition,filterCountry,sort,ascending]);
 const included=(col:Col)=>columns.includes(col);
 const toggleColumn=(col:Col)=>setColumns(current=>current.includes(col)?current.length===1?current:current.filter(item=>item!==col):[...current,col]);
 const changeSort=(field:'name'|'age'|'club')=>{if(sort===field)setAscending(!ascending);else{setSort(field);setAscending(true);}};
 const toggleSelection=(id:string)=>setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
 const allChecked=visible.length>0&&visible.every(player=>selected.includes(String(player.player_id)));
 const loadMore=async()=>{if(!onLoadMore||loadingMore||directoryRefreshing)return;setLoadingMore(true);setMoreError('');try{await onLoadMore();}catch(error){setMoreError(friendlyError(error));}finally{setLoadingMore(false);}};
 const clear=()=>{setFilterPosition('');setFilterCountry('');onSearch('');};
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
   <details className={styles.toolDropdown}><summary><Filter size={17}/> Filter {filterCount?<strong>{filterCount}</strong>:null}<ChevronDown size={13}/></summary><div className={styles.toolPopover}>
    <label>Position<select value={filterPosition} onChange={event=>setFilterPosition(event.target.value)}><option value="">All positions</option>{positions.map(option=><option key={option}>{option}</option>)}</select></label>
    <label>Nationality<select value={filterCountry} onChange={event=>setFilterCountry(event.target.value)}><option value="">All nationalities</option>{countries.map(option=><option key={option}>{option}</option>)}</select></label>
   </div></details>
   {(filterCount||search)?<button type="button" className={styles.clearFilters} onClick={clear}>Clear all</button>:null}
   <button type="button" className={styles.recruitmentLink} onClick={onRecruitment}>Recruitment <ChevronDown size={13}/></button>
   {selected.length?<div className={styles.selectionActions}><span>{selected.length} selected</span>{selected.length===1?<button type="button" onClick={()=>onOpen(selected[0])}>Open player</button>:null}<button type="button" aria-label="Clear selection" onClick={()=>setSelected([])}><X size={15}/></button></div>:null}
  </div>
  <div className={styles.tableScroll} data-roster-table-mode={mode}>
   {mode==='table'?<table className={styles.rosterTable}><thead><tr>
    <th className={styles.nameColumn}><span className={styles.selectPlayer}><button type="button" role="checkbox" aria-label="Select visible players" aria-checked={allChecked} onClick={()=>setSelected(allChecked?selected.filter(id=>!visible.some(player=>String(player.player_id)===id)):[...new Set([...selected,...visible.map(player=>String(player.player_id))])])}/></span><button type="button" onClick={()=>changeSort('name')}>Name {sort==='name'?(ascending?<ArrowUp size={13}/>:<ArrowDown size={13}/>):null}</button></th>
    {included('club')?<th><button type="button" onClick={()=>changeSort('club')}>Club {sort==='club'?(ascending?<ArrowUp size={13}/>:<ArrowDown size={13}/>):null}</button></th>:null}
    {included('age')?<th><button type="button" onClick={()=>changeSort('age')}>Age {sort==='age'?(ascending?<ArrowUp size={13}/>:<ArrowDown size={13}/>):null}</button></th>:null}
    {included('nationality')?<th>Nationality</th>:null}
    {included('position')?<th>Position</th>:null}
    {included('status')?<th>Status</th>:null}
    {included('agent')?<th>Agent</th>:null}
    {included('stage')?<th>Stage</th>:null}
   </tr></thead><tbody>
   {visible.map(player=>{const id=String(player.player_id),identity=player?.identity||{},status=statusOf(player),agent=agentOf(player);return <tr key={id}>
    <td className={styles.nameColumn}><span className={styles.selectPlayer}><button type="button" role="checkbox" aria-label={'Select '+nameOf(player)} aria-checked={selected.includes(id)} onClick={()=>toggleSelection(id)}/></span><button type="button" className={styles.playerRowName} aria-label={'Open '+nameOf(player)} onClick={()=>onOpen(id)}><Portrait player={player}/><span>{nameOf(player)}</span></button></td>
    {included('club')?<td><span className={styles.clubMark}>{text(identity.current_club)?initials(text(identity.current_club)):'–'}</span><span className={styles.cellClamp}>{text(identity.current_club)||'–'}</span></td>:null}
    {included('age')?<td>{ageOf(identity.date_of_birth)??'–'}</td>:null}
    {included('nationality')?<td><span className={styles.cellClamp}>{nationOf(player)||'–'}</span></td>:null}
    {included('position')?<td>{text(identity.primary_position)||'–'}</td>:null}
    {included('status')?<td><span className={styles.statusChip} data-active={/active|represented|verified|ready/i.test(status)}>{status}</span></td>:null}
    {included('agent')?<td>{agent?<span className={styles.agentName}><span>{initials(agent)}</span>{agent}</span>:'–'}</td>:null}
    {included('stage')?<td>{text(player?.service?.market_coverage?.state||identity.stage)||'–'}</td>:null}
   </tr>;})}
   </tbody></table>:<div className={styles.playerTiles}>{visible.map(player=>{const identity=player?.identity||{};return <button type="button" key={player.player_id} className={styles.playerTile} aria-label={'Open '+nameOf(player)} onClick={()=>onOpen(String(player.player_id))}><Portrait player={player}/><strong>{nameOf(player)}</strong><span>{[identity.primary_position,identity.current_club].filter(Boolean).join(' · ')||'Player details'}</span><small>{nationOf(player)||'Nationality not recorded'}</small></button>;})}</div>}
   {!visible.length?<div className={styles.directoryEmpty}><Users size={25}/><h3>{search||filterCount?'No players found':'No players yet'}</h3><p>{search||filterCount?'Change your search or filters.':'Add your first player to start building your squad.'}</p></div>:null}
  </div>
  <footer className={styles.directoryFooter}><span>{players.length} of {total} players loaded.{search||filterCount?' ' + visible.length + ' match current filters.':''}</span>{hasMore?<button type="button" disabled={loadingMore||directoryRefreshing} onClick={()=>void loadMore()}>{loadingMore||directoryRefreshing?<LoaderCircle size={16}/>:<Plus size={16}/>} {directoryRefreshing?'Refreshing players...':loadingMore?'Loading...':moreError?'Retry loading players':'Load more players'}</button>:null}{moreError?<p role="alert">{moreError}</p>:null}</footer>
 </section>;
}
