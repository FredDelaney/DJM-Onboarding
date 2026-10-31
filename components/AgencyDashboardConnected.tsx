'use client';

import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import AgencyDashboardReference,{type DashboardSnapshot,type DashboardScope,type DashboardCreateKind} from './AgencyDashboardReference';
import styles from './AgencyDashboardConnected.module.css';

const isoDay = (value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value);
function todayInZone(timeZone:string):string {
  try {
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch{return new Date().toISOString().slice(0,10);}
}
function shiftDay(value:string,days:number):string {
  const base=new Date(`${value}T12:00:00Z`);
  if(!Number.isFinite(base.getTime()))return value;
  base.setUTCDate(base.getUTCDate()+days);
  return base.toISOString().slice(0,10);
}
function validSnapshot(value:unknown,scope:DashboardScope):value is DashboardSnapshot {
  if(!value||typeof value!=='object')return false;
  const data=value as Partial<DashboardSnapshot>;
  return data.scope===scope && isoDay(String(data.localDate||'')) &&
    typeof data.generatedAt==='string' && typeof data.timeZone==='string' &&
    Array.isArray(data.fixtures)&&Array.isArray(data.clubRequests)&&
    Array.isArray(data.upcomingEvents)&&Array.isArray(data.recentActivity);
}
export default function AgencyDashboardConnected({
  invoke,tenantId,userId,role,basePath,agencyName,agencyMark,onCreate,children,
}: {
  invoke:<T=any>(action:string,body?:Record<string,unknown>)=>Promise<T>;
  tenantId:string;
  userId:string;
  role:string;
  basePath:string;
  agencyName:string;
  agencyMark?:ReactNode;
  onCreate:(kind:DashboardCreateKind)=>void;
  children?:ReactNode;
}) {
  const canViewAgency=role==='owner'||role==='admin';
  const initialScope:DashboardScope=canViewAgency?'agency':'me';
  const [scope,setScope]=useState<DashboardScope>(initialScope);
  const effectiveScope:DashboardScope=canViewAgency?scope:'me';
  const [viewerName,setViewerName]=useState('');
  const [date,setDate]=useState('');
  const [revision,setRevision]=useState(0);
  const [snapshot,setSnapshot]=useState<DashboardSnapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const request=useRef(0);
  // Revisions are explicit, and older tenant/scope/date responses never win the race.
  useEffect(()=>{
    const ticket=++request.current;
    let active=true;
    setSnapshot(null);
    setLoading(true);
    setError('');
    void invoke<{snapshot?:unknown;viewer_first_name?:string}>('dashboard_snapshot',{scope:effectiveScope,local_date:date}).then(result=>{
      if(!active||ticket!==request.current)return;
      if(!validSnapshot(result?.snapshot,effectiveScope))throw new Error('Dashboard response could not be verified.');
      setViewerName(typeof result.viewer_first_name==='string'?result.viewer_first_name.slice(0,80):'');
      setSnapshot(result.snapshot);
    }).catch(()=>{
      if(active&&ticket===request.current)setError('Unable to load this dashboard. Your other ReDream data is unchanged.');
    }).finally(()=>{if(active&&ticket===request.current)setLoading(false);});
    return ()=>{active=false;};
  },[invoke,tenantId,userId,role,effectiveScope,date,revision]);

  const changeScope=useCallback((next:DashboardScope)=>{
    if(next==='agency'&&!canViewAgency)return;
    setScope(next);
  },[canViewAgency]);
  const changeDay=useCallback((days:number)=>{
    setDate(current=>shiftDay(current||snapshot?.localDate||todayInZone(snapshot?.timeZone||'Europe/Rome'),days));
  },[snapshot?.localDate]);
  return <div className={styles.stack}>
    {snapshot ? <AgencyDashboardReference
      snapshot={snapshot}
      firstName={viewerName||'there'}
      agencyName={agencyName}
      agencyMark={agencyMark}
      basePath={basePath}
      canViewAgency={canViewAgency}
      onScopeChange={changeScope}
      onDayChange={changeDay}
      onRefresh={()=>setRevision(value=>value+1)}
      onCreate={onCreate}
      canCreatePlayer={role!=='scout'}
      canCreateRequest={canViewAgency}
    /> : <section className={styles.loading} aria-busy={loading} role={error?'alert':'status'}>
      <strong>{error||'Loading your agency dashboard…'}</strong>
      {error?<button type="button" onClick={()=>setRevision(value=>value+1)}>Retry dashboard</button>:null}
    </section>}
    <details className={styles.today}>
      <summary>Your day <span>ReDream tasks, approvals and follow-ups</span></summary>
      <div className={styles.todayContent}>{children}</div>
    </details>
  </div>;
}
