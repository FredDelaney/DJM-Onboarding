'use client';
import type {CalendarEvent} from '@/lib/calendar/events';
import styles from './AgencyCalendarWorkspace.module.css';
export default function AgencyCalendarToday({projection,partial,onSelectToday}:{projection:{overdue:CalendarEvent[];dueToday:CalendarEvent[];nextMeeting:CalendarEvent|null};partial:boolean;onSelectToday:()=>void}){
 return <section className={styles.todayPanel} aria-label="Today at a glance"><button className={styles.todayHeading} onClick={onSelectToday}><strong>Today at a glance</strong><span>{partial?'Updating summary':'Open today'}</span></button><div className={styles.todayFacts}><div><strong>{projection.overdue.length}</strong><span>Overdue</span></div><div><strong>{projection.dueToday.length}</strong><span>Due today</span></div><div className={styles.nextMeeting}><span>Next meeting</span><strong>{projection.nextMeeting?new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(new Date(projection.nextMeeting.dateAt)):'No more today'}</strong>{projection.nextMeeting?<small>{projection.nextMeeting.title}</small>:null}</div></div></section>;
}
