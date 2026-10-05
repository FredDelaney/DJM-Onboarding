'use client';
import {useCallback,useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Link from 'next/link';
import {ArrowRight,LoaderCircle,Plus,Search,X} from 'lucide-react';
import {useTenantRuntime} from '@/components/TenantRuntimeProvider';
import type {AgencyCreateKind} from '@/components/AgencyCreateDrawer';
import {friendlyError,platformInvoke,platformRpc} from '@/lib/platform-client';
import {supabase} from '@/lib/supabase';
import {prefetchPlayerProfile} from '@/lib/player-profile-cache';
import {buildSearchItems,filterArchivedSearchItems,normaliseSearch,searchWorkspaceItems,type SearchItem,type SearchSource} from '@/lib/workspace-search';
import styles from './WorkspaceSearch.module.css';

type Invoke=<T=any>(action:string,body?:Record<string,unknown>)=>Promise<T>;
type Rpc=<T=any>(name:string,args?:Record<string,unknown>)=>Promise<T>;
type Props={cacheScope?:string;basePath?:string;tenantId?:string;userId?:string;invoke?:Invoke;rpc?:Rpc;onCreate?:(kind:AgencyCreateKind)=>void;compact?:boolean;className?:string;seed?:{view:string;data:any}};
type Group={items:SearchItem[];pending:boolean;error:string;at:number};
type Suggestion={key:string;title:string;subtitle:string;kind:string;href?:string;create?:AgencyCreateKind};
const sources:SearchSource[]=['players','recruitment','network','opportunities','deals'];
const group=():Group=>({items:[],pending:false,error:'',at:0});
const empty=():Record<SearchSource,Group>=>({players:group(),recruitment:group(),network:group(),opportunities:group(),deals:group()});
async function bounded<T>(request:Promise<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([request,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('The request took too long. Try again.')),12000);})]);}
 finally{clearTimeout(timer);}
}

export default function WorkspaceSearch(props:Props={}){
 const runtime=useTenantRuntime();
 const [sessionId,setSessionId]=useState(props.userId||'');
 useEffect(()=>{
  if(props.userId!==undefined){setSessionId(props.userId);return;}
  let active=true,sequence=0;
  void supabase.auth.getSession().then(({data})=>{if(active&&!sequence)setSessionId(data.session?.user?.id||'');});
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>{sequence++;if(active)setSessionId(session?.user?.id||'');});
  return()=>{active=false;data.subscription.unsubscribe();};
 },[props.userId]);
 const tenantId=props.tenantId||(runtime.resolved?runtime.tenant_id||'':'');
 const basePath=props.basePath||'/agency';
 const invoke=useCallback<Invoke>((action,body={})=>platformInvoke('agency-os',{...body,action,tenant_id: tenantId}),[tenantId]);
 const rpc=useCallback<Rpc>((name,args={})=>platformRpc(name,args,runtime.slug),[runtime.slug]);
 return <SearchSession key={tenantId+':'+(props.userId??sessionId)+':'+basePath+':'+(props.cacheScope||'')} {...props} basePath={basePath}
  enabled={Boolean(tenantId&&(props.userId??sessionId))} invoke={props.invoke||invoke} rpc={props.rpc||rpc}/>;
}

function SearchSession({basePath='/agency',cacheScope='',enabled,invoke,rpc,onCreate,compact,className,seed}:Props&{enabled:boolean;invoke:Invoke;rpc:Rpc}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
 const [groups,setGroups]=useState(empty);
 const [archives,setArchives]=useState<any[]|null>(null),[archiveError,setArchiveError]=useState(''),[archivePending,setArchivePending]=useState(false);
 const alive=useRef(true),inFlight=useRef(new Set<string>()),generation=useRef(0),archiveAt=useRef(0);
 const adapters=useRef({invoke,rpc});adapters.current={invoke,rpc};
 const overlay=useRef<HTMLDivElement>(null),dialog=useRef<HTMLElement>(null),input=useRef<HTMLInputElement>(null);
 const opener=useRef<HTMLElement|null>(null);
 const id=useId();
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
 const close=useCallback(()=>{setOpen(false);setQuery('');},[]);
 const show=()=>{opener.current=document.activeElement as HTMLElement;setOpen(true);};
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&enabled){
    if(document.querySelector('[aria-modal="true"]')&&!open)return;
    event.preventDefault();if(open)close();else{opener.current=document.activeElement as HTMLElement;setOpen(true);}
   }
  };
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[close,enabled,open]);
 useEffect(()=>{
  if(!open)return;
  const previous=opener.current,overflow=document.body.style.overflow;
  const siblings=[...document.body.children].filter((node):node is HTMLElement=>node instanceof HTMLElement&&node!==overlay.current);
  const inert=siblings.map(node=>node.inert);
  siblings.forEach(node=>{node.inert=true;});document.body.style.overflow='hidden';input.current?.focus();
  return()=>{siblings.forEach((node,index)=>{node.inert=inert[index];});document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[open]);
 const load=useCallback((targets:SearchSource[],reloadArchives=false)=>{
  const version=generation.current;
  const {invoke,rpc}=adapters.current;
  for(const source of targets){
   if(inFlight.current.has(source))continue;inFlight.current.add(source);
   setGroups(current=>({...current,[source]:{...current[source],pending:true,error:''}}));
   const request=source==='players'?invoke<any>('players_workspace',{limit:200}).then(r=>r?.players):
    source==='recruitment'?invoke<any>('recruitment_board',{limit:500}).then(r=>r?.recruitment):
    source==='network'?rpc<any>('redream_autopilot_relationships',{p_limit:100,p_contact_limit:250}):
    source==='opportunities'?rpc<any>('redream_autopilot_market',{p_limit:100}):
    rpc<any>('redream_autopilot_deals',{p_limit:100});
   void bounded(request).then(data=>{
    if(alive.current&&version===generation.current)setGroups(current=>({...current,[source]:{items:buildSearchItems(source,data,basePath),pending:false,error:'',at:Date.now()}}));
   }).catch(error=>{
    if(alive.current&&version===generation.current)setGroups(current=>({...current,[source]:{...current[source],pending:false,error:friendlyError(error)}}));
   }).finally(()=>inFlight.current.delete(source));
  }
  if(reloadArchives&&!inFlight.current.has('archives')){
   inFlight.current.add('archives');setArchivePending(true);setArchiveError('');
   void bounded(rpc<any>('redream_entity_archives')).then(data=>{
    if(alive.current&&version===generation.current){setArchives(Array.isArray(data?.items)?data.items:[]);archiveAt.current=Date.now();}
   }).catch(error=>{if(alive.current&&version===generation.current)setArchiveError(friendlyError(error));})
   .finally(()=>{inFlight.current.delete('archives');if(alive.current&&version===generation.current)setArchivePending(false);});
  }
 },[basePath]);
 useEffect(()=>{
  if(!open||!enabled)return;
  const source=seed?.view as SearchSource,data=seed?.data;
  const payload=source==='players'&&Array.isArray(data?.directory?.items)?data.directory:source==='network'&&data?.accounts?data:source==='opportunities'&&data?.market?data.market:null;
  if(payload&&sources.includes(source))setGroups(current=>({...current,[source]:{...current[source],items:buildSearchItems(source,payload,basePath)}}));
  load(sources.filter(source=>Date.now()-groups[source].at>60000),Date.now()-archiveAt.current>60000);
  // The current scope owns the cache; ordinary parent renders cannot restart reads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[open,enabled,load]);
 const destinations=useMemo<Suggestion[]>(()=>[
  {key:'page:home',title:'Home',subtitle:'Your next actions',kind:'Go to',href:basePath},
  {key:'page:players',title:'Players',subtitle:'Your represented players',kind:'Go to',href:basePath+'?view=players'},
  {key:'page:recruitment',title:'Recruitment',subtitle:'Player targets and follow-ups',kind:'Go to',href:basePath+'?view=players&tab=recruitment'},
  {key:'page:network',title:'Network',subtitle:'Clubs and contacts',kind:'Go to',href:basePath+'?view=network'},
  {key:'page:opportunities',title:'Opportunities',subtitle:'Club needs and live routes',kind:'Go to',href:basePath+'?view=opportunities'},
  {key:'page:calendar',title:'Calendar',subtitle:'Meetings and deadlines',kind:'Go to',href:basePath+'?view=calendar'},
  ...(onCreate?(['player','contact','club','club_need'] as AgencyCreateKind[]).map(kind=>({key:'create:'+kind,title:'Add '+(kind==='club_need'?'opportunity':kind),subtitle:'Open the record form',kind:'Create',create:kind})):[])
 ],[basePath,onCreate]);
 const items=useMemo(()=>archives===null?[]:filterArchivedSearchItems(Object.values(groups).flatMap(group=>group.items),archives),[archives,groups]);
 const results=useMemo<Suggestion[]>(()=>{
  const q=normaliseSearch(query),tokens=q.split(/\s+/).filter(Boolean);
  const commands=destinations.filter(item=>tokens.every(token=>normaliseSearch(item.title+' '+item.subtitle).includes(token)));
  return q?[...searchWorkspaceItems(items,query),...commands].slice(0,30):destinations;
 },[destinations,items,query]);
 const pending=archivePending||Object.values(groups).some(group=>group.pending);
 const failed=sources.filter(source=>groups[source].error);
 useEffect(()=>setActive(0),[query]);
 useEffect(()=>{if(active>=results.length)setActive(0);},[active,results.length]);
 const choose=(event:React.MouseEvent<HTMLAnchorElement>,href:string)=>{
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  if(window.location.pathname===new URL(href,window.location.origin).pathname){event.preventDefault();const player=new URL(href,window.location.origin).searchParams.get('player');
   if(player)void prefetchPlayerProfile(player,adapters.current.invoke,cacheScope).catch(()=>undefined);
   window.history.pushState(null,'',href);window.scrollTo({top:0,behavior:'instant'});}
  close();
 };
 return <>
  <button type="button" className={[styles.trigger,compact?styles.compact:'',className||''].join(' ')} onClick={show} disabled={!enabled} aria-label="Find in this agency" aria-haspopup="dialog" aria-expanded={open}>
   <Search size={17}/><span>{compact?'Find':'Search this agency'}</span>{!compact?<kbd>⌘K</kbd>:null}
  </button>
  {open?createPortal(<div ref={overlay} className={styles.overlay} onPointerDown={event=>{if(event.target===event.currentTarget)close();}}>
   <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={id+'-title'} className={styles.dialog}
    onKeyDown={event=>{
     if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
     if(event.key==='Tab'){
      const controls=[...dialog.current!.querySelectorAll<HTMLElement>('input,button:not([disabled]),a[href]')];const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
     }
     if(event.target===input.current&&(event.key==='ArrowDown'||event.key==='ArrowUp')){
      event.preventDefault();const next=(active+(event.key==='ArrowDown'?1:-1)+results.length)%Math.max(1,results.length);setActive(next);
      document.getElementById(id+'-option-'+next)?.scrollIntoView({block:'nearest'});
     }
     if(event.target===input.current&&event.key==='Enter'){event.preventDefault();document.getElementById(id+'-option-'+active)?.click();}
    }}>
    <h2 id={id+'-title'} className={styles.title}>Find in this agency</h2>
    <div className={styles.inputRow}><Search size={20}/>
     <input ref={input} role="combobox" aria-label="Search players, recruitment, clubs, contacts and opportunities" aria-autocomplete="list" aria-expanded="true" aria-controls={id+'-results'} aria-activedescendant={results.length?id+'-option-'+Math.min(active,results.length-1):undefined}
      value={query} onChange={event=>setQuery(event.target.value)} placeholder="Name, club, role or next destination" autoComplete="off"/>
     {query?<button type="button" onClick={()=>{setQuery('');input.current?.focus();}} aria-label="Clear search">Clear</button>:null}
     <button type="button" onClick={close} aria-label="Close search"><X size={19}/></button>
    </div>
    <div className={styles.status} role="status" aria-live="polite">
     {pending?<><LoaderCircle size={13} className={styles.spin}/>Searching recorded data…</>:query?results.length+' results':'Go straight to a record or start something new'}
    </div>
    {failed.length||archiveError?<div className={styles.error} role="alert"><span>{archiveError?'Record status could not load. Retry to search current records.':'Some records could not refresh. Available results may be incomplete.'}</span><button type="button" onClick={()=>load(failed,Boolean(archiveError))}>Try again</button></div>:null}
    <div className={styles.results} role="listbox" id={id+'-results'} aria-label="Search results">
     {results.map((item,index)=>{
      const body=<><span className={styles.kind}>{item.create?<Plus size={13}/>:null}{item.kind}</span><strong>{item.title}</strong>{item.subtitle?<small>{item.subtitle}</small>:null}<ArrowRight size={16} className={styles.arrow}/></>;
      const common={id:id+'-option-'+index,role:'option', 'aria-selected':active===index,className:styles.result+(active===index?' '+styles.active:''),onPointerMove:()=>setActive(index)};
      return item.href?<Link {...common} key={item.key} href={item.href} prefetch={false} onClick={event=>choose(event,item.href!)}>{body}</Link>:
       <button {...common} type="button" key={item.key} onClick={()=>{close();if(item.create){archiveAt.current=0;setGroups(current=>Object.fromEntries(sources.map(source=>[source,{...current[source],at:0}])) as Record<SearchSource,Group>);onCreate?.(item.create);}}}>{body}</button>;
     })}
     {query&&!results.length&&!pending?<div className={styles.empty}><strong>No matching records</strong><p>Try another name, club or role. Search uses recorded agency data.</p></div>:null}
    </div>
    <footer className={styles.footer}><span>↑ ↓ move · Enter open · Esc close</span><span>Recorded agency data</span></footer>
   </section>
  </div>,document.body):null}
 </>;
}
