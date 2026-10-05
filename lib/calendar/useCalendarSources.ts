'use client';
import {useEffect,useState,useRef} from 'react';
import {reconcileTaskRows} from './task-state';
import {readTaskPages,type CalendarRpc,type CalendarTask,type Assignee} from './tasks';
type Source={scope:string;value:any;busy:boolean;error:string;ready:boolean};
export function useCalendarSources(rpc:CalendarRpc,tenantId:string,userId:string,start:string,end:string,today:string,contacts:boolean,done:boolean,archived:boolean,refresh:number){
 const scope=`${tenantId}:${userId}`;const [sources,setSources]=useState<Record<string,Source>>({});const mutationVersion=useRef(0);const retryRef=useRef<(name:string)=>void>(()=>{});
 const requests=useRef<Record<string,{key:string;cancel:()=>void}>>({});
 const previousRpc=useRef(rpc);
 useEffect(()=>()=>{for(const request of Object.values(requests.current))request.cancel();requests.current={};retryRef.current=()=>{};},[]);
 useEffect(()=>{
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';const next=new Date(`${today}T12:00:00`);next.setDate(next.getDate()+1);const tomorrow=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
  const args={p_start:start,p_end:end,p_timezone:zone,p_include_done:done,p_include_archived:archived,p_tenant_id:tenantId};
  const jobs:Record<string,{key:unknown[];load:()=>Promise<any>}>= {
   dates:{key:[start,end,zone],load:()=>rpc('redream_calendar_range',{p_start:start,p_end:end,p_timezone:zone})},
   birthdays:{key:[start,end,contacts],load:()=>rpc('redream_calendar_birthdays',{p_start:start,p_end:end,p_include_contacts:contacts,p_tenant_id:tenantId})},
   tasks:{key:[start,end,zone,done,archived],load:()=>readTaskPages(rpc,args)},
   undated:{key:[done,archived],load:()=>readTaskPages(rpc,{...args,p_mode:'undated'})},
   overdue:{key:[today,zone],load:()=>readTaskPages(rpc,{...args,p_mode:'overdue',p_include_done:false,p_include_archived:false})},
   todayDates:{key:[today,zone],load:()=>rpc('redream_calendar_range',{p_start:today,p_end:tomorrow,p_timezone:zone})},
   todayTasks:{key:[today,zone],load:()=>readTaskPages(rpc,{...args,p_start:today,p_end:tomorrow,p_include_done:false,p_include_archived:false})},
   assignees:{key:[],load:()=>rpc('redream_calendar_task_assignees_v1',{p_tenant_id:tenantId})}
  };
  const rpcChanged=previousRpc.current!==rpc;previousRpc.current=rpc;
  const run=(name:string,job:{key:unknown[];load:()=>Promise<any>})=>{
   requests.current[name]?.cancel();
   let active=true;const version=mutationVersion.current;
   const key=JSON.stringify([scope,refresh,...job.key]);
   setSources(old=>({...old,[name]:{scope,value:old[name]?.scope===scope?old[name].value:null,busy:true,error:'',ready:old[name]?.scope===scope&&old[name].ready}}));
   const finish=(value:any,error:string)=>{if(!active)return;active=false;clearTimeout(timer);if(version===mutationVersion.current)setSources(old=>({...old,[name]:{scope,value:value!=null?value:(old[name]?.scope===scope?old[name].value:null),busy:false,error,ready:value!=null||(old[name]?.scope===scope&&old[name].ready)}}));};
   // A dropped network/auth request must not leave the calendar spinning indefinitely.
   const timer=setTimeout(()=>finish(null,`Could not load ${sourceLabels[name]}. The request took too long. Please retry.`),12000);
   requests.current[name]={key,cancel:()=>{active=false;clearTimeout(timer);}};
   void Promise.resolve().then(job.load).then(value=>finish(value,value?.limited?'More dates exist in this range. Choose a shorter range.':''),()=>finish(null,`Could not load ${sourceLabels[name]}.`));
  };
  retryRef.current=name=>{if(jobs[name])run(name,jobs[name]);};
  for(const [name,job]of Object.entries(jobs))if(rpcChanged||requests.current[name]?.key!==JSON.stringify([scope,refresh,...job.key]))run(name,job);
 },[rpc,scope,tenantId,start,end,today,contacts,done,archived,refresh]);
 const confirmTask=(task:CalendarTask)=>{
  if(task.tenant_id!==tenantId)return;
  mutationVersion.current++;
  const now=new Date();const tomorrow=new Date(`${today}T12:00:00`);tomorrow.setDate(tomorrow.getDate()+1);const nextDay=`${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
  setSources(old=>{const next={...old};for(const name of ['tasks','undated','overdue','todayTasks']){const current=old[name];const rows=current?.scope===scope&&Array.isArray(current.value)?current.value:[];next[name]={scope,busy:false,ready:Boolean(current?.scope===scope&&current.ready),error:current?.scope===scope?current.error:'',value:reconcileTaskRows(rows,task,{mode:name==='undated'?'undated':name==='overdue'?'overdue':'range',start:name==='todayTasks'?today:start,end:name==='todayTasks'?nextDay:end,today,now,done:name==='tasks'||name==='undated'?done:false,archived:name==='tasks'||name==='undated'?archived:false})};}return next;});
 };
 const visible=Object.fromEntries(Object.entries(sources).filter(([,s])=>s.scope===scope));
 return {confirmTask,retry:(name:string)=>retryRef.current(name),scope,sources:visible,dates:visible.dates?.value||{},birthdays:visible.birthdays?.value||{items:[]},tasks:(visible.tasks?.value||[])as CalendarTask[],undated:(visible.undated?.value||[])as CalendarTask[],overdue:(visible.overdue?.value||[])as CalendarTask[],todayDates:visible.todayDates?.value||{},todayTasks:(visible.todayTasks?.value||[])as CalendarTask[],assignees:(visible.assignees?.value?.items||[])as Assignee[],busy:['dates','birthdays','tasks'].some(name=>!visible[name]||visible[name].busy),errors:Object.entries(visible).filter(([,s])=>s.error).map(([name,s])=>({name,message:s.error})),partial:!visible.todayDates||!visible.todayTasks||!visible.overdue||['todayDates','todayTasks','overdue'].some(name=>visible[name]?.busy||visible[name]?.error)};
}
export const sourceLabels:Record<string,string>={dates:'meetings and agency dates',birthdays:'birthdays',tasks:'tasks',undated:'undated tasks',overdue:'overdue tasks',todayDates:'today\'s meetings',todayTasks:'today\'s tasks',assignees:'company members'};
