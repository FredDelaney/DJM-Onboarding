'use client';

import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import AgencyDashboardReference,{type DashboardSnapshot,type DashboardScope,type DashboardCreateKind} from './AgencyDashboardReference';
import {readWithDeadline} from '@/lib/read-with-deadline';
import styles from './AgencyDashboardConnected.module.css';

const isoDay = (value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value);
function todayInZone(timeZone:string):string {
  try {
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch{return new Date().toISOString().slice(0,10);}
}
function verifiedDay(value:string):boolean {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
function validSnapshot(value:unknown,scope:DashboardScope):value is DashboardSnapshot {
  if(!value||typeof value!=='object')return false;
  const data=value as Partial<DashboardSnapshot>;
  return data.scope===scope && isoDay(String(data.localDate||'')) &&
    typeof data.generatedAt==='string' && typeof data.timeZone==='string' &&
    Array.isArray(data.fixtures)&&Array.isArray(data.clubRequests)&&
    Array.isArray(data.upcomingEvents)&&Array.isArray(data.recentActivity);
}
type DashboardRead = {key:string;snapshot:DashboardSnapshot;viewerName:string;expiresAt:number};
type DashboardResponse = {snapshot?:unknown;viewer_first_name?:string};
type DashboardRequest = {key:string;promise:Promise<DashboardResponse>};
export type DashboardReadCache = {latest:DashboardRead|null;pending:DashboardRequest|null};
const CACHE_WINDOW_MS = 30_000;
function recentDashboard(cache:DashboardReadCache,key:string,date:string) {
  const entry=cache.latest;
  return entry?.key===key && entry.expiresAt>Date.now() &&
    (date || todayInZone(entry.snapshot.timeZone))===entry.snapshot.localDate ? entry : null;
}

export default function AgencyDashboardConnected({
  invoke,tenantId,userId,role,refreshKey=0,cache,basePath,agencyName,agencyMark,onCreate,onOpenYourDay,children,
}: {
  invoke:<T=any>(action:string,body?:Record<string,unknown>)=>Promise<T>;
  tenantId:string;
  userId:string;
  role:string;
  refreshKey?:number;
  cache:DashboardReadCache;
  basePath:string;
  agencyName:string;
  agencyMark?:ReactNode;
  onCreate:(kind:DashboardCreateKind)=>void;
  onOpenYourDay?:()=>void;
  children?:ReactNode;
}) {
  const canViewAgency=role==='owner'||role==='admin';
  const initialScope:DashboardScope=canViewAgency?'agency':'me';
  const [scope,setScope]=useState<DashboardScope>(initialScope);
  const effectiveScope:DashboardScope=canViewAgency?scope:'me';
  const [date,setDate]=useState('');
  const [revision,setRevision]=useState(0);
  const cacheKey=JSON.stringify([tenantId,userId,role,effectiveScope,refreshKey,date]);
  const [loaded,setLoaded]=useState(()=>recentDashboard(cache,cacheKey,date));
  const snapshot=loaded?.key===cacheKey?loaded.snapshot:null;
  const viewerName=loaded?.key===cacheKey?loaded.viewerName:'';
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const request=useRef(0);
  // Revisions are explicit, and older tenant/scope/date responses never win the race.
  useEffect(()=>{
    const ticket=++request.current;
    let active=true;
    setLoaded(recentDashboard(cache,cacheKey,date));
    setLoading(true);
    setError('');
    const requestKey=JSON.stringify([cacheKey,revision]);
    let pending=cache.pending;
    if(pending?.key!==requestKey){
      const next={key:requestKey,promise:readWithDeadline(invoke<DashboardResponse>(
        'dashboard_snapshot',{scope:effectiveScope,local_date:date},
      ))};
      const clear=()=>{if(cache.pending===next)cache.pending=null;};
      cache.pending=pending=next;
      void next.promise.then(clear,clear);
    }
    void pending.promise.then(result=>{
      if(!active||ticket!==request.current)return;
      if(!validSnapshot(result?.snapshot,effectiveScope))throw new Error('Dashboard response could not be verified.');
      const entry={
        key:cacheKey,snapshot:result.snapshot,expiresAt:Date.now()+CACHE_WINDOW_MS,
        viewerName:typeof result.viewer_first_name==='string'?result.viewer_first_name.slice(0,80):'',
      };
      cache.latest=entry;
      setLoaded(entry);
    }).catch(()=>{
      if(!active||ticket!==request.current)return;
      if(cache.latest?.key===cacheKey)cache.latest=null;
      setLoaded(null);
      setError('Unable to load this dashboard.');
    }).finally(()=>{if(active&&ticket===request.current)setLoading(false);});
    return ()=>{active=false;};
  },[invoke,cache,cacheKey,effectiveScope,date,revision]);

  const changeScope=useCallback((next:DashboardScope)=>{
    if(next==='agency'&&!canViewAgency)return;
    setScope(next);
  },[canViewAgency]);
  const selectDay=useCallback((day:string)=>{
    if(verifiedDay(day))setDate(day);
    else if(day==='today')setDate(todayInZone(snapshot?.timeZone||'UTC'));
  },[snapshot?.timeZone]);
  return <div className={styles.stack}>
    {snapshot ? <AgencyDashboardReference
      snapshot={snapshot}
      firstName={viewerName||'there'}
      agencyName={agencyName}
      agencyMark={agencyMark}
      basePath={basePath}
      canViewAgency={canViewAgency}
      onScopeChange={changeScope}
      onDaySelect={selectDay}
      onRefresh={()=>setRevision(value=>value+1)}
      onCreate={onCreate}
      canCreatePlayer={role!=='scout'}
      canCreateRequest={canViewAgency}
    /> : <section className={styles.loading} aria-busy={loading} role={error?'alert':'status'}>
      <strong>{error||'Loading your agency dashboard…'}</strong>
      {error?<button type="button" onClick={()=>setRevision(value=>value+1)}>Retry dashboard</button>:null}
    </section>}
    <details className={styles.today} onToggle={event=>{if(event.currentTarget.open)onOpenYourDay?.();}}>
      <summary>Your day <span>ReDream tasks, approvals and follow-ups</span></summary>
      <div className={styles.todayContent}>{children}</div>
    </details>
  </div>;
}
