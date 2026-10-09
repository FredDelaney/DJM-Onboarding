'use client';
import type {CalendarEvent} from '@/lib/calendar/events';
import styles from './AgencyCalendarWorkspace.module.css';

export default function AgencyCalendarToday({projection,partial,sources,onSelectToday}:{projection:{overdue:CalendarEvent[];dueToday:CalendarEvent[];nextMeeting:CalendarEvent|null};partial:boolean;sources:Record<string,{value:any;busy:boolean;error:string;ready:boolean}>;onSelectToday:()=>void}){
 const sourceNames=['overdue','todayTasks','todayDates'];
 const incomplete=sourceNames.some(name=>sources[name]?.error);
 const ready=sourceNames.every(name=>sources[name]?.ready);
 const clear=ready&&!partial&&!incomplete&&!projection.overdue.length&&!projection.dueToday.length&&!projection.nextMeeting;
 const display=(name:string,value:number|string)=>sources[name]?.ready?value:sources[name]?.error?'Unavailable':'Loading...';
 return <section className={`${styles.todayPanel} ${clear?styles.todayPanelClear:''}`} aria-label="Today at a glance">
  <button className={styles.todayHeading} onClick={onSelectToday}>
   <strong>Today at a glance</strong>
   <span>{incomplete?'Summary incomplete':partial?'Summary updating':'Open today'}</span>
  </button>
  {clear?<div className={styles.todayClear}><strong>Nothing needs you today.</strong><span>Your calendar is clear. Add a task only if there is something worth tracking.</span></div>:<div className={styles.todayFacts}>
   <div><strong>{display('overdue',projection.overdue.length)}</strong><span>Overdue</span></div>
   <div><strong>{display('todayTasks',projection.dueToday.length)}</strong><span>Due today</span></div>
   <div className={styles.nextMeeting}><span>Next meeting</span><strong>{display('todayDates',projection.nextMeeting?new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(new Date(projection.nextMeeting.dateAt)):'No more today')}</strong>{projection.nextMeeting?<small>{projection.nextMeeting.title}</small>:null}</div>
  </div>}
 </section>;
}
