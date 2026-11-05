'use client';
import {readAssignedWorkPages} from '../work-responsibility';
import {useEffect,useState,useRef} from 'react';
import {reconcileTaskRows} from './task-state';
import {readTaskPages,type CalendarRpc,type CalendarTask,type Assignee} from './tasks';
type Source={scope:string;value:any;busy:boolean;error:string;ready:boolean;refresh:number};
const TODAY_RANGE_WAIT_MS=4_000;
const EMPTY_ROWS:any[]=[];
const EMPTY_RANGE={};
const EMPTY_BIRTHDAYS={items:EMPTY_ROWS};
async function waitForSharedDates(read:Promise<any>,signal:AbortSignal) {
 if(signal.aborted)return null;
 let timer:ReturnType<typeof setTimeout>|undefined;
 let cancel=()=>{};
 try{
  return await Promise.race([read.catch(()=>null),new Promise<null>(resolve=>{
   cancel=()=>resolve(null);
   timer=setTimeout(cancel,TODAY_RANGE_WAIT_MS);
   signal.addEventListener('abort',cancel,{once:true});
  })]);
 }finally{
  clearTimeout(timer);
  signal.removeEventListener('abort',cancel);
 }
}
export function useCalendarSources(rpc:CalendarRpc,tenantId:string,userId:string,start:string,end:string,today:string,contacts:boolean,done:boolean,archived:boolean,refresh:number){
 const scope=`${tenantId}:${userId}`;const [sources,setSources]=useState<Record<string,Source>>({});const retryRef=useRef<(name:string)=>void>(()=>{});
 const requests=useRef<Record<string,{key:string;cancel:()=>void}>>({});
 const previousRpc=useRef(rpc);
 useEffect(()=>()=>{for(const request of Object.values(requests.current))request.cancel();requests.current={};retryRef.current=()=>{};},[]);
 useEffect(()=>{
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';const next=new Date(`${today}T12:00:00`);next.setDate(next.getDate()+1);const tomorrow=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
  const args={p_start:start,p_end:end,p_timezone:zone,p_include_done:done,p_include_archived:archived,p_tenant_id:tenantId};
  let sharedDates:Promise<any>|null=null;
  const readRange=(from:string,to:string,signal:AbortSignal)=>rpc('redream_calendar_range',{p_start:from,p_end:to,p_timezone:zone},signal);
  const jobs:Record<string,{key:unknown[];load:(signal:AbortSignal)=>Promise<any>}>= {
   dates:{key:[start,end,zone],load:signal=>{
    const read=readRange(start,end,signal);
    if(start<=today&&tomorrow<=end)sharedDates=read;
    return read;
   }},
   clubFixtures:{key:[start,end,zone],load:signal=>rpc('redream_calendar_club_fixtures',{p_start:start,p_end:end,p_timezone:zone},signal)},
   birthdays:{key:[start,end,contacts],load:signal=>rpc('redream_calendar_birthdays',{p_start:start,p_end:end,p_include_contacts:contacts,p_tenant_id:tenantId},signal)},
   tasks:{key:[start,end,zone,done,archived],load:signal=>readTaskPages(rpc,args,signal)},
   undated:{key:[done,archived],load:signal=>readTaskPages(rpc,{...args,p_mode:'undated'},signal)},
   overdue:{key:[today,zone],load:signal=>readTaskPages(rpc,{...args,p_mode:'overdue',p_include_done:false,p_include_archived:false},signal)},
   todayDates:{key:[today,zone],load:async signal=>{
    // A complete visible range already covers today. Keep the direct read for
    // a different month, explicit retries, and slow or truncated range reads.
    const pending=sharedDates;
    sharedDates=null;
    const range=pending?await waitForSharedDates(pending,signal):null;
    if(range&&!range.limited&&Array.isArray(range.meetings?.items)&&
      (range.operations?.deadlines?.items?.length??0)<500)return range;
    signal.throwIfAborted();
    return readRange(today,tomorrow,signal);
   }},
   todayTasks:{key:[today,zone],load:signal=>readTaskPages(rpc,{...args,p_start:today,p_end:tomorrow,p_include_done:false,p_include_archived:false},signal)},
   sharedWork:{key:[],load:async signal=>({items:await readAssignedWorkPages(rpc,tenantId,signal)})},
   assignees:{key:[],load:signal=>rpc('redream_calendar_task_assignees_v1',{p_tenant_id:tenantId},signal)}
  };
  const rpcChanged=previousRpc.current!==rpc;previousRpc.current=rpc;
  const run=(name:string,job:{key:unknown[];load:(signal:AbortSignal)=>Promise<any>})=>{
   requests.current[name]?.cancel();
   let active=true;const controller=new AbortController();
   const key=JSON.stringify([scope,refresh,...job.key]);
   setSources(old=>({...old,[name]:{scope,value:old[name]?.scope===scope?old[name].value:null,busy:true,error:'',refresh,ready:old[name]?.scope===scope&&old[name].ready}}));
   const finish=(value:any,error:string)=>{if(!active)return;active=false;clearTimeout(timer);setSources(old=>({...old,[name]:{scope,value:value!=null?value:(old[name]?.scope===scope?old[name].value:null),busy:false,error,refresh,ready:value!=null||(old[name]?.scope===scope&&old[name].ready)}}));};
   // A dropped network/auth request must not leave the calendar spinning indefinitely.
   const timer=setTimeout(()=>{controller.abort();finish(null,`Could not load ${sourceLabels[name]}. The request took too long. Please retry.`);},12000);
   requests.current[name]={key,cancel:()=>{active=false;clearTimeout(timer);controller.abort();}};
   void Promise.resolve().then(()=>job.load(controller.signal)).then(value=>finish(value,value?.limited?'More dates exist in this range. Choose a shorter range.':''),()=>finish(null,`Could not load ${sourceLabels[name]}.`));
  };
  retryRef.current=name=>{if(jobs[name])run(name,jobs[name]);};
  for(const [name,job]of Object.entries(jobs))if(rpcChanged||requests.current[name]?.key!==JSON.stringify([scope,refresh,...job.key]))run(name,job);
 },[rpc,scope,tenantId,start,end,today,contacts,done,archived,refresh]);
 const confirmTask=(task:CalendarTask)=>{
  if(task.tenant_id!==tenantId)return;
  // Only pending task reads are invalidated; meetings and birthdays must still settle.
  for(const name of ['tasks','undated','overdue','todayTasks'])requests.current[name]?.cancel();
  const now=new Date();const tomorrow=new Date(`${today}T12:00:00`);tomorrow.setDate(tomorrow.getDate()+1);const nextDay=`${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
  setSources(old=>{const next={...old};for(const name of ['tasks','undated','overdue','todayTasks']){const current=old[name];const rows=current?.scope===scope&&Array.isArray(current.value)?current.value:[];next[name]={scope,busy:false,refresh:current?.refresh??-1,ready:Boolean(current?.scope===scope&&current.ready),error:current?.scope===scope?current.error:'',value:reconcileTaskRows(rows,task,{mode:name==='undated'?'undated':name==='overdue'?'overdue':'range',start:name==='todayTasks'?today:start,end:name==='todayTasks'?nextDay:end,today,now,done:name==='tasks'||name==='undated'?done:false,archived:name==='tasks'||name==='undated'?archived:false})};}return next;});
 };
 const visible=Object.fromEntries(Object.entries(sources).filter(([,s])=>s.scope===scope));
 return {confirmTask,retry:(name:string)=>retryRef.current(name),scope,sources:visible,sharedWork:visible.sharedWork?.value?.items||EMPTY_ROWS,dates:visible.dates?.value||EMPTY_RANGE,clubFixtures:visible.clubFixtures?.value||EMPTY_RANGE,birthdays:visible.birthdays?.value||EMPTY_BIRTHDAYS,tasks:(visible.tasks?.value||EMPTY_ROWS)as CalendarTask[],undated:(visible.undated?.value||[])as CalendarTask[],overdue:(visible.overdue?.value||EMPTY_ROWS)as CalendarTask[],todayDates:visible.todayDates?.value||{},todayTasks:(visible.todayTasks?.value||[])as CalendarTask[],assignees:(visible.assignees?.value?.items||[])as Assignee[],busy:['dates','birthdays','tasks'].some(name=>!visible[name]||visible[name].busy),errors:Object.entries(visible).filter(([,s])=>s.error).map(([name,s])=>({name,message:s.error})),partial:!visible.todayDates||!visible.todayTasks||!visible.overdue||['todayDates','todayTasks','overdue','sharedWork'].some(name=>visible[name]?.busy||visible[name]?.error)};
}
export const sourceLabels:Record<string,string>={dates:'meetings and agency dates',clubFixtures:'club fixtures',birthdays:'birthdays',tasks:'tasks',undated:'undated tasks',overdue:'overdue tasks',todayDates:'today\'s meetings',todayTasks:'today\'s tasks',assignees:'company members',sharedWork:'assigned work'};
