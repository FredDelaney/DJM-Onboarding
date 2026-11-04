'use client';

import {Search, X} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import {FIFA_TRANSFER_WINDOWS, windowCategories, type TransferAssociation, type WindowCategory} from '@/lib/fifa-transfer-windows';
import styles from './TransferWindowsDialog.module.css';

const dayMs = 86400000;
const shortDate = new Intl.DateTimeFormat('en-GB', {day:'numeric', month:'short', timeZone:'UTC'});
const monthName = new Intl.DateTimeFormat('en-GB', {month:'short', year:'2-digit', timeZone:'UTC'});
const categories = ["Men's pro", "Women's pro", 'Amateur'];
type Status = 'All' | 'Open now' | 'Opening soon';
const statuses: Status[] = ['All', 'Open now', 'Opening soon'];

export default function TransferWindowsDialog({onClose}: {onClose: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<TransferAssociation[]|null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<WindowCategory>(windowCategories[0]);
  const [status, setStatus] = useState<Status>('All');
  const [today] = useState(() => new Date().toISOString().slice(0,10));
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    void fetch('/api/transfer-windows', {signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)])})
      .then(async response => {
        if (!response.ok) throw new Error('Transfer window data unavailable');
        const data = await response.json();
        if (!Array.isArray(data.associations) || !data.associations.length) throw new Error('No transfer window data');
        if (!controller.signal.aborted) setRows(data.associations);
      }).catch(() => {if (!controller.signal.aborted) setError(true);});
    return () => controller.abort();
  }, [attempt]);

  const [year, month] = today.split('-').map(Number);
  const months = Array.from({length: 13}, (_, index) => Date.UTC(year, month - 2 + index, 1));
  const from = months[0];
  const until = months[12];
  const offset = (date: string | number) => ((typeof date === 'number' ? date : Date.parse(date)) - from) / (until - from) * 100;
  const filtered = (rows ?? []).filter(row => (row.name + ' ' + row.code).toLowerCase().includes(query.trim().toLowerCase()))
    .map(row => {
      const periods = row.windows[category] ?? [];
      const open = periods.find(period => period.start <= today && period.end >= today);
      const next = periods.find(period => period.start > today);
      return {...row, open, next, periods:periods.filter(period => Date.parse(period.end) >= from && Date.parse(period.start) < until)};
    });
  const open = filtered.filter(row => row.open).sort((a,b) => a.open!.end.localeCompare(b.open!.end));
  const upcoming = filtered.filter(row => !row.open && row.next && Date.parse(row.next.start) < until)
    .sort((a,b) => a.next!.start.localeCompare(b.next!.start));
  const upcomingCodes = new Set(upcoming.map(row => row.code));
  const others = filtered.filter(row => !row.open && !upcomingCodes.has(row.code));
  const counts = [filtered.length, open.length, upcoming.length];
  const groups = status === 'Open now' ? [['Open now',open] as const] : status === 'Opening soon' ? [['Opening next',upcoming] as const]
    : [['Open now',open], ['Opening next',upcoming], ['Other associations',others]] as const;

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="transfer-window-title"
    onKeyDownCapture={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}}}
    onCancel={event => {event.preventDefault(); onClose();}} onClick={event => {if(event.target===event.currentTarget) onClose();}}>
    <section className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.title}><div><h2 id="transfer-window-title">Transfer windows</h2><p>Registration periods published by FIFA member associations.</p></div>
          <button type="button" aria-label="Close transfer windows" onClick={onClose}><X size={21}/></button></div>
        <div className={styles.controls}>
          <label className={styles.search}><Search size={17}/><input type="search" aria-label="Search associations" placeholder="Search all countries..." value={query} onChange={event=>setQuery(event.target.value)}/></label>
          <div className={styles.segment} role="group" aria-label="Window status">{statuses.map((value,index)=><button type="button" key={value} aria-pressed={value===status} onClick={()=>setStatus(value)}>{value} {rows?<span>{counts[index]}</span>:null}</button>)}</div>
          <div className={styles.segment} role="group" aria-label="Registration category">{windowCategories.map((value,index)=><button type="button" key={value} aria-pressed={value===category} onClick={()=>setCategory(value)}><i data-category={index}/>{categories[index]}</button>)}</div>
        </div>
      </header>
      {error ? <div className={styles.message} role="alert"><p>Transfer windows could not load from FIFA.</p><button type="button" onClick={()=>setAttempt(value=>value+1)}>Try again</button></div>
       : !rows ? <p className={styles.message} role="status">Loading transfer windows...</p>
       : !groups.some(([,items])=>items.length) ? <p className={styles.message}>No associations match these filters.</p>
       : <div className={styles.scroll} tabIndex={0} aria-label="Registration timeline">
        <div className={styles.timeline} data-category={windowCategories.indexOf(category)}>
          <div className={styles.monthRow}><span className={styles.country}>Association</span><div className={styles.track}>
            {months.slice(0,12).map((date,index)=><span className={styles.month} key={date} style={{left:offset(date)+'%',width:(offset(months[index+1])-offset(date))+'%'}}>{monthName.format(date)}</span>)}
            <span className={styles.today} style={{left:offset(today)+'%'}}>Today</span>
          </div></div>
          {groups.map(([label,items])=>items.length?<div key={label}>
            <div className={styles.group}><strong className={styles.country}>{label} <span>{items.length}</span></strong><div className={styles.track}/></div>
            {items.map(row=><div className={styles.row} key={row.code}>
              <div className={styles.country}><img loading="lazy" src={row.flag} alt=""/><div><strong title={row.name}>{row.name}</strong>
                <small>{row.open?`Open now · closes ${shortDate.format(Date.parse(row.open.end))}`:row.next?`Opens ${shortDate.format(Date.parse(row.next.start))}`:row.periods.length?'No upcoming period published':'No updated dates in this timeline'}</small></div></div>
              <div className={styles.track}>
                <span className={styles.marker} style={{left:offset(today)+'%'}} aria-hidden="true"/>
                {row.periods.map(period=>{
                  const left=Math.max(0,offset(period.start));
                  const right=Math.min(100,offset(Date.parse(period.end)+dayMs));
                  const dates=`${shortDate.format(Date.parse(period.start))} to ${shortDate.format(Date.parse(period.end))}`;
                  return <span className={styles.period} key={period.start+period.end} data-open={row.open===period||undefined}
                    title={row.name+': '+dates} aria-label={dates} style={{left:left+'%',width:(right-left)+'%'}}>{dates}</span>;
                })}
              </div>
            </div>)}
          </div>:null)}
        </div>
      </div>}
      <footer><a href={FIFA_TRANSFER_WINDOWS} target="_blank" rel="noreferrer">Dates from FIFA's transfer windows</a></footer>
    </section>
  </dialog>;
}
