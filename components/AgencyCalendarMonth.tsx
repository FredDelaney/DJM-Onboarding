'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import themePlugin from '@fullcalendar/react/themes/classic';
import interactionPlugin from '@fullcalendar/react/interaction';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';
import '@fullcalendar/react/themes/classic/palette.css';
import { useMemo, useRef, useEffect } from 'react';
import type { CalendarRef } from '@fullcalendar/react';
import { calendarDateKey } from '@/lib/calendar/dates';
import styles from './AgencyCalendarWorkspace.module.css';

const plugins = [themePlugin, dayGridPlugin, interactionPlugin];
export default function AgencyCalendarMonth({ date, items, onSelect }: {
  date: string; items: Array<{key:string;title:string;dateAt:string;dateOnly?:boolean;kind:string}>; onSelect:(date:string)=>void;
}) {
  const ref = useRef<CalendarRef>(null);
  useEffect(()=>{ref.current?.getApi().gotoDate(date);},[date]);
  const events = useMemo(()=>items.map(item=>({id:item.key,title:item.title,start:item.dateAt,allDay:item.dateOnly,
    className:item.kind==='birthday'?styles.monthBirthday:styles.monthEvent,
    color:item.kind==='birthday'?'#eaf6ef':'#edf3f9',contrastColor:item.kind==='birthday'?'#286a48':'#214965'})),[items]);
  return <div className={styles.monthGrid} aria-label="Month calendar">
    <FullCalendar ref={ref} plugins={plugins} initialView="dayGridMonth" initialDate={date}
      headerToolbar={false} height="auto" firstDay={1} fixedWeekCount={false} showNonCurrentDates={false}
      events={events} dayMaxEvents={1} eventDisplay="block" editable={false}
      dayRowClass={styles.monthRow}
      dayCellClass={info=>`${styles.monthCell} ${calendarDateKey(info.date)===date?styles.selectedCell:''}`}
      dayCellTopContent={info=>{
        const key=calendarDateKey(info.date);
        return <button type="button" className={info.isToday?styles.todayNumber:styles.dayNumber}
          aria-label={new Intl.DateTimeFormat('en-GB',{dateStyle:'full'}).format(info.date)}
          aria-current={info.isToday?'date':undefined} aria-pressed={key===date} onClick={()=>onSelect(key)}>{info.dayNumberText}</button>;
      }}
      dateClick={info=>onSelect(info.dateStr.slice(0,10))}
      eventClick={info=>onSelect(info.event.start ? calendarDateKey(info.event.start) : info.event.startStr.slice(0,10))}
      moreLinkClick={info=>{onSelect(calendarDateKey(info.date));return 'none';}}
      eventContent={info=><span className={styles.monthEventText} title={info.event.title}><span className={styles.eventDot} aria-hidden="true"/><span className={styles.eventTitle}>{info.event.allDay?'':`${info.timeText} `}{info.event.title}</span></span>}
    />
  </div>;
}
