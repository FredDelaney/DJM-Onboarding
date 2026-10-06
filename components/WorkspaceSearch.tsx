'use client';
import {useCallback,useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Link from 'next/link';
import {ArrowRight,LoaderCircle,Plus,Search,X} from 'lucide-react';
import {useTenantRuntime} from '@/components/TenantRuntimeProvider';
import type {AgencyCreateKind} from '@/components/AgencyCreateDrawer';
import {friendlyError,platformInvoke} from '@/lib/platform-client';
import {supabase} from '@/lib/supabase';
import {prefetchPlayerProfile} from '@/lib/player-profile-cache';
import {buildServerSearchItems,normaliseSearch,type SearchItem} from '@/lib/workspace-search';
import styles from './WorkspaceSearch.module.css';

type Invoke=<T=any>(action:string,body?:Record<string,unknown>)=>Promise<T>;
type Rpc=<T=any>(name:string,args?:Record<string,unknown>)=>Promise<T>;
type Props={cacheScope?:string;basePath?:string;tenantId?:string;userId?:string;invoke?:Invoke;rpc?:Rpc;onCreate?:(kind:AgencyCreateKind)=>void;compact?:boolean;className?:string;seed?:{view:string;data:any}};
type SearchState={query:string;items:SearchItem[];total:number;hasMore:boolean;pending:boolean;error:string};
const emptySearch=():SearchState=>({query:'',items:[],total:0,hasMore:false,pending:false,error:''});
type Suggestion={key:string;title:string;subtitle:string;kind:string;href?:string;create?:AgencyCreateKind};
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
 return <SearchSession key={tenantId+':'+(props.userId??sessionId)+':'+basePath+':'+(props.cacheScope||'')} {...props} basePath={basePath}
  enabled={Boolean(tenantId&&(props.userId??sessionId))} invoke={props.invoke||invoke}/>;
}

function SearchSession({basePath='/agency',cacheScope='',enabled,invoke,onCreate,compact,className}:Props&{enabled:boolean;invoke:Invoke}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
 const [search,setSearch]=useState(emptySearch),[attempt,setAttempt]=useState(0);
 const alive=useRef(true),generation=useRef(0);
 const adapters=useRef({invoke});adapters.current={invoke};
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
 useEffect(()=>{
  const version=++generation.current;
  const cleanQuery=query.trim();
  if(!open||!enabled||!cleanQuery){setSearch(emptySearch());return;}
  setSearch({...emptySearch(),query:cleanQuery,pending:true});
  const timer=setTimeout(()=>{
   void bounded(adapters.current.invoke<any>('workspace_search',{query:cleanQuery,limit:30})).then(response=>{
    if(!alive.current||version!==generation.current)return;
    const data=response?.search||{};
    setSearch({query:cleanQuery,items:buildServerSearchItems(data,basePath),total:Number(data.total)||0,hasMore:data.has_more===true,pending:false,error:''});
   }).catch(error=>{
    if(alive.current&&version===generation.current)setSearch({...emptySearch(),query:cleanQuery,error:friendlyError(error)});
   });
  },180);
  return()=>{clearTimeout(timer);generation.current++;};
 },[open,enabled,query,attempt,basePath]);
 const destinations=useMemo<Suggestion[]>(()=>[
  {key:'page:home',title:'Home',subtitle:'Your next actions',kind:'Go to',href:basePath},
  {key:'page:players',title:'Players',subtitle:'Your represented players',kind:'Go to',href:basePath+'?view=players'},
  {key:'page:recruitment',title:'Recruitment',subtitle:'Player targets and follow-ups',kind:'Go to',href:basePath+'?view=players&tab=recruitment'},
  {key:'page:network',title:'Network',subtitle:'Clubs and contacts',kind:'Go to',href:basePath+'?view=network'},
  {key:'page:opportunities',title:'Opportunities',subtitle:'Club needs and live routes',kind:'Go to',href:basePath+'?view=opportunities'},
  {key:'page:calendar',title:'Calendar',subtitle:'Meetings and deadlines',kind:'Go to',href:basePath+'?view=calendar'},
  ...(onCreate?(['player','contact','club','club_need'] as AgencyCreateKind[]).map(kind=>({key:'create:'+kind,title:'Add '+(kind==='club_need'?'opportunity':kind),subtitle:'Open the record form',kind:'Create',create:kind})):[])
 ],[basePath,onCreate]);
 const current=normaliseSearch(search.query)===normaliseSearch(query);
 const results=useMemo<Suggestion[]>(()=>{
  const q=normaliseSearch(query),tokens=q.split(/\s+/).filter(Boolean);
  const commands=destinations.filter(item=>tokens.every(token=>normaliseSearch(item.title+' '+item.subtitle).includes(token)));
  return q?[...(current?search.items:[]),...commands].slice(0,40):destinations;
 },[destinations,search.items,current,query]);
 const pending=Boolean(query.trim())&&(!current||search.pending);
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
      value={query} maxLength={200} onChange={event=>setQuery(event.target.value)} placeholder="Name, club, role or next destination" autoComplete="off"/>
     {query?<button type="button" onClick={()=>{setQuery('');input.current?.focus();}} aria-label="Clear search">Clear</button>:null}
     <button type="button" onClick={close} aria-label="Close search"><X size={19}/></button>
    </div>
    <div className={styles.status} role="status" aria-live="polite">
     {pending?<><LoaderCircle size={13} className={styles.spin}/>Searching recorded data…</>:query?(search.hasMore?'Showing '+search.items.length+' of '+search.total+' matching records':search.total+' matching records'):'Go straight to a record or start something new'}
    </div>
    {current&&search.error?<div className={styles.error} role="alert"><span>Agency records could not be searched. {search.error}</span><button type="button" onClick={()=>{setAttempt(value=>value+1);input.current?.focus();}}>Try again</button></div>:null}
    <div className={styles.results} role="listbox" id={id+'-results'} aria-label="Search results">
     {results.map((item,index)=>{
      const body=<><span className={styles.kind}>{item.create?<Plus size={13}/>:null}{item.kind}</span><strong>{item.title}</strong>{item.subtitle?<small>{item.subtitle}</small>:null}<ArrowRight size={16} className={styles.arrow}/></>;
      const common={id:id+'-option-'+index,role:'option', 'aria-selected':active===index,className:styles.result+(active===index?' '+styles.active:''),onPointerMove:()=>setActive(index)};
      return item.href?<Link {...common} key={item.key} href={item.href} prefetch={false} onClick={event=>choose(event,item.href!)}>{body}</Link>:
       <button {...common} type="button" key={item.key} onClick={()=>{close();if(item.create)onCreate?.(item.create);}}>{body}</button>;
     })}
     {query&&!results.length&&!pending&&!search.error?<div className={styles.empty}><strong>No matching records</strong><p>Try another name, club or role. Search uses recorded agency data.</p></div>:null}
    </div>
    <footer className={styles.footer}><span>↑ ↓ move · Enter open · Esc close</span><span>Recorded agency data</span></footer>
   </section>
  </div>,document.body):null}
 </>;
}
