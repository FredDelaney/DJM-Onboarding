'use client';

import {
  ChevronRight,
  ChevronLeft,
  BriefcaseBusiness,
  CakeSlice,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  LoaderCircle,
  MessageCircleMore,
  Target,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { calendarDateKey, monthDays, shiftMonth, calendarPreferences, type BirthdayFilters } from '@/lib/calendar/dates';
import { useSearchParams } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import styles from './AgencyCalendarWorkspace.module.css';

const CalendarMonth = dynamic(() => import('./AgencyCalendarMonth'), { ssr: false, loading: () => <p role="status">Loading month...</p> });

type Horizon = 7 | 30 | 90;

type AgendaItem = {
  key: string;
  kind: 'meeting' | 'follow_up' | 'birthday' | 'deadline';
  dateAt: string;
  dateOnly?: boolean;
  state?: string;
  title: string;
  detail: string;
  category: string;
  playerId?: string;
  clubNeedId?: string;
  entityType?: string;
  entityId?: string;
  personId?: string;
  organisationId?: string;
  meetingId?: string;
  meetingUrl?: string;
  source?: string;
  deadlineType?: string;
  birthdayCategory?: keyof BirthdayFilters;
};

const list = (value: unknown): any[] =>
  Array.isArray(value) ? value : [];

const human = (value: unknown) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const parseDate = (value: unknown, dateOnly = false) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const date = new Date(
    dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T12:00:00`
      : raw,
  );

  return Number.isNaN(date.getTime()) ? null : date;
};

const categoryForDeadline = (value: unknown) => {
  switch (String(value || '')) {
    case 'contract_expiry':
      return 'Playing contract';
    case 'representation_record_end':
      return 'Agency agreement';
    case 'document_expiry':
      return 'Player document';
    case 'player_next_action':
      return 'Player action';
    case 'deal_next_action':
      return 'Deal';
    case 'club_need_expiry':
      return 'Club need';
    case 'player_request_due':
      return 'Player request';
    case 'career_strategy_review':
      return 'Career review';
    case 'target_window_end':
      return 'Move window';
    default:
      return 'Agency date';
  }
};

type Rpc = <T = any>(
  name: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export default function AgencyCalendarWorkspace({
  data,
  basePath,
  rpc,
  onRecordMeetingOutcome,
  preferenceKey,
}: {
  data: any;
  preferenceKey?: string;
  basePath: string;
  rpc: Rpc;
  onRecordMeetingOutcome: (meeting: any) => void;
}) {
  const search = useSearchParams();
  const requestedMeetingId = String(search.get('meeting') || '').trim();
  const [horizon, setHorizon] = useState<Horizon>(30);
  const [view, setView] = useState<'month' | 'agenda'>('month');
  const [selectedDate, setSelectedDate] = useState(() => calendarDateKey(new Date()));
  const [birthdayFilters, setBirthdayFilters] = useState<BirthdayFilters>(() => calendarPreferences(null));
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [calendarData, setCalendarData] = useState<any>(null);
  const [birthdayData, setBirthdayData] = useState<any>(null);
  const [datesBusy, setDatesBusy] = useState(true);
  const [datesError, setDatesError] = useState('');
  const [refreshDates, setRefreshDates] = useState(0);
  const dayStrip = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<{x:number;y:number} | null>(null);
  const month = selectedDate.slice(0,7);
  const today = calendarDateKey(new Date());
  const days = useMemo(() => monthDays(`${month}-01`), [month]);
  const rangeEnd = useMemo(() => {
    if (view === 'month') return shiftMonth(`${month}-01`, 1);
    const end = new Date(`${selectedDate}T12:00:00`);
    end.setDate(end.getDate() + horizon + 1);
    const nextMonth = shiftMonth(`${month}-01`, 1);
    return calendarDateKey(end) > nextMonth ? calendarDateKey(end) : nextMonth;
  }, [month, selectedDate, horizon, view]);
  useEffect(() => {
    setPreferencesReady(false);
    try { setBirthdayFilters(calendarPreferences(preferenceKey ? localStorage.getItem(`redream:calendar:${preferenceKey}`) : null)); }
    catch { setBirthdayFilters(calendarPreferences(null)); }
    setPreferencesReady(true);
  }, [preferenceKey]);
  useEffect(() => {
    if (!preferencesReady || !preferenceKey) return;
    try { localStorage.setItem(`redream:calendar:${preferenceKey}`, JSON.stringify(birthdayFilters)); } catch { /* Storage can be disabled. */ }
  }, [birthdayFilters, preferencesReady, preferenceKey]);
  useEffect(() => {
    dayStrip.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'center',behavior:'auto'});
  }, [selectedDate]);
  useEffect(() => {
    const refresh = () => setRefreshDates(n => n + 1);
    window.addEventListener('redream:birthdays-updated', refresh);
    return () => window.removeEventListener('redream:birthdays-updated', refresh);
  }, []);
  useEffect(() => {
    let active = true;
    setDatesBusy(true); setDatesError('');
    void Promise.allSettled([
      rpc<any>('redream_calendar_range', {p_start:`${month}-01`,p_end:rangeEnd,p_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}),
      rpc<any>('redream_calendar_birthdays', {p_start:`${month}-01`,p_end:rangeEnd,p_include_contacts:birthdayFilters.contacts}),
    ]).then(results => {
      if (!active) return;
      if (results[0].status === 'fulfilled') {
        setCalendarData(results[0].value);
        if (results[0].value?.limited) setDatesError('This range has more events than can be shown. Choose a shorter agenda range.');
      }
      if (results[1].status === 'fulfilled') setBirthdayData(results[1].value);
      if (results.some(result => result.status === 'rejected')) setDatesError('Some calendar dates could not load. Try again to see the complete calendar.');
      setDatesBusy(false);
    });
    return () => { active = false; };
  }, [rpc, month, rangeEnd, birthdayFilters.contacts, refreshDates]);
  const sourceData = calendarData || data;
  const [meetingBrief, setMeetingBrief] = useState<any>(null);
  const [openedMeetingId, setOpenedMeetingId] = useState('');
  const [meetingBriefBusy, setMeetingBriefBusy] = useState(false);
  const [meetingBriefError, setMeetingBriefError] = useState('');
  const meetingRequest = useRef(0);
  useEffect(() => () => { meetingRequest.current += 1; }, []);
  const closeMeetingBrief = () => {
    meetingRequest.current += 1;
    setMeetingBrief(null);
    setMeetingBriefError('');
    setMeetingBriefBusy(false);
  };

  const agenda = useMemo(() => {
    const deadlines = list(sourceData?.operations?.deadlines?.items).map(
      (item: any): AgendaItem => ({
        key: `deadline:${item?.deadline_type || 'date'}:${item?.entity_id || item?.title}`,
        kind: 'deadline',
        dateAt: item?.deadline_at,
        dateOnly: Boolean(item?.date_only),
        state: item?.deadline_state,
        title: item?.title || 'Agency date',
        detail:
          item?.next_action?.instruction ||
          categoryForDeadline(item?.deadline_type),
        category: categoryForDeadline(item?.deadline_type),
        playerId: item?.context?.player_id
          ? String(item.context.player_id)
          : undefined,
        clubNeedId: item?.context?.club_need_id
          ? String(item.context.club_need_id)
          : undefined,
        entityType: item?.entity_type,
        entityId: item?.entity_id
          ? String(item.entity_id)
          : undefined,
        deadlineType: item?.deadline_type,
      }),
    );

    const birthdays = list(
      birthdayData?.items ?? sourceData?.operations?.important_dates?.birthdays?.items,
    ).map(
      (item: any): AgendaItem => ({
        key: `birthday:${item?.item_id || item?.player_id}`,
        kind: 'birthday',
        dateAt: item?.date_at,
        dateOnly: true,
        state: item?.date_state,
        title: item?.title || `${item?.player_name || 'Player'} birthday`,
        detail: item?.turns_age
          ? `Turns ${item.turns_age}`
          : item?.birthday_category === 'staff' ? 'Team birthday' : item?.birthday_category === 'contacts' ? 'Club contact birthday' : 'Player birthday',
        category: 'Birthday',
        birthdayCategory: item?.birthday_category || 'players',
        personId: item?.person_id ? String(item.person_id) : undefined,
        playerId: item?.player_id
          ? String(item.player_id)
          : undefined,
      }),
    );

    const meetings = list(sourceData?.meetings?.items).map(
      (item: any): AgendaItem => ({
        key: `meeting:${item?.meeting_id}`,
        kind: 'meeting',
        dateAt: item?.starts_at,
        title: item?.title || 'Meeting',
        detail:
          [item?.person_name, item?.organisation_name]
            .filter(Boolean)
            .join(' · ') || 'Agency meeting',
        category: 'Meeting',
        meetingId: item?.meeting_id
          ? String(item.meeting_id)
          : undefined,
        personId: item?.person_id
          ? String(item.person_id)
          : undefined,
        organisationId: item?.organisation_id
          ? String(item.organisation_id)
          : undefined,
        meetingUrl: item?.meeting_url || undefined,
      }),
    );

    const followUps = list(sourceData?.follow_ups?.items).map(
      (item: any): AgendaItem => ({
        key: `follow-up:${item?.task_id}`,
        kind: 'follow_up',
        dateAt: item?.due_at,
        title: item?.title || 'Follow-up',
        detail:
          [
            item?.player_name,
            item?.club_name,
            item?.person_name,
            item?.organisation_name,
          ]
            .filter(Boolean)
            .join(' · ') || 'Your follow-up',
        category: 'Follow-up',
        playerId: item?.player_id
          ? String(item.player_id)
          : undefined,
        clubNeedId: item?.club_need_id
          ? String(item.club_need_id)
          : undefined,
        personId: item?.person_id
          ? String(item.person_id)
          : undefined,
        organisationId: item?.organisation_id
          ? String(item.organisation_id)
          : undefined,
        source: item?.source || undefined,
      }),
    );

    const preferred = new Map<string, AgendaItem>();

    [...deadlines, ...birthdays, ...meetings, ...followUps].forEach(
      (item) => {
        let dedupeKey = item.key;

        if (
          item.kind === 'deadline' &&
          item.deadlineType === 'deal_next_action' &&
          item.entityId
        ) {
          dedupeKey = `deal:${item.entityId}`;
        }

        const dealFollowUp = item.source?.match(
          /^redream:deal_followup:(.+)$/,
        )?.[1];

        if (item.kind === 'follow_up' && dealFollowUp) {
          dedupeKey = `deal:${dealFollowUp}`;
        }

        const existing = preferred.get(dedupeKey);
        if (!existing || item.kind === 'follow_up') {
          preferred.set(dedupeKey, item);
        }
      },
    );

    return [...preferred.values()]
      .filter((item) => {
        const date = parseDate(item.dateAt, item.dateOnly);
        if (!date) return false;
        return item.kind !== 'birthday' || birthdayFilters[item.birthdayCategory || 'players'];
      })
      .sort((a, b) => {
        const aDate = parseDate(a.dateAt, a.dateOnly);
        const bDate = parseDate(b.dateAt, b.dateOnly);
        return (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
      });
  }, [sourceData, birthdayData, birthdayFilters]);

  const groups = useMemo(() => {
    const now = new Date();
    const todayKey = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, '0'),
      String(tomorrow.getDate()).padStart(2, '0'),
    ].join('-');

    const grouped = new Map<string, { label: string; items: AgendaItem[] }>();

    const agendaEnd = new Date(`${selectedDate}T12:00:00`);
    agendaEnd.setDate(agendaEnd.getDate() + horizon);
    agenda.forEach((item) => {
      const date = parseDate(item.dateAt, item.dateOnly);
      if (!date) return;

      const dateKey = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-');

      const overdue = item.kind !== 'birthday' && item.kind !== 'meeting' && (item.state === 'overdue' || dateKey < todayKey);
      if (view === 'month' && dateKey !== selectedDate) return;
      if (view === 'agenda' && !(overdue && selectedDate === todayKey) && (dateKey < selectedDate || dateKey > calendarDateKey(agendaEnd))) return;

      const key = overdue && view === 'agenda' ? 'overdue' : dateKey;
      const label = key === 'overdue'
        ? 'Overdue'
        : dateKey === todayKey
          ? 'Today'
          : dateKey === tomorrowKey
            ? 'Tomorrow'
            : new Intl.DateTimeFormat('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              }).format(date);

      const current = grouped.get(key) || { label, items: [] };
      current.items.push(item);
      grouped.set(key, current);
    });

    return [...grouped.entries()].map(([key, value]) => ({
      key,
      ...value,
    }));
  }, [agenda, selectedDate, horizon, view]);

  const formatWhen = (item: AgendaItem) => {
    const date = parseDate(item.dateAt, item.dateOnly);
    if (!date) return 'Date not recorded';

    if (item.dateOnly) {
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
      }).format(date);
    }

    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const iconFor = (item: AgendaItem) => {
    if (item.kind === 'meeting') return <Users size={15} />;
    if (item.kind === 'follow_up') return <Clock3 size={15} />;
    if (item.kind === 'birthday') return <CakeSlice size={15} />;
    if (item.deadlineType === 'contract_expiry') {
      return <BriefcaseBusiness size={15} />;
    }
    if (
      item.deadlineType === 'representation_record_end' ||
      item.deadlineType === 'document_expiry'
    ) {
      return <FileText size={15} />;
    }
    return <CalendarDays size={15} />;
  };

  const openMeetingBrief = async (item: AgendaItem) => {
    if (!item.meetingId) return;

    const request = ++meetingRequest.current;
    setMeetingBriefBusy(true);
    setMeetingBriefError('');
    setMeetingBrief({
      meeting: {
        meeting_id: item.meetingId,
        title: item.title,
        starts_at: item.dateAt,
        meeting_url: item.meetingUrl || null,
      },
    });

    try {
      const result = await rpc<any>(
        'redream_meeting_brief',
        { p_meeting_id: item.meetingId },
      );
      if (request === meetingRequest.current) setMeetingBrief(result);
    } catch (error) {
      if (request !== meetingRequest.current) return;
      setMeetingBriefError(
        error instanceof Error
          ? error.message
          : 'Could not load meeting preparation.',
      );
    } finally {
      if (request === meetingRequest.current) setMeetingBriefBusy(false);
    }
  };

  useEffect(() => {
    if (
      !requestedMeetingId ||
      openedMeetingId === requestedMeetingId
    ) {
      return;
    }

    const item = agenda.find(
      (entry) =>
        entry.kind === 'meeting' &&
        entry.meetingId === requestedMeetingId &&
        Boolean(entry.personId || entry.organisationId),
    );

    if (!item) return;

    setOpenedMeetingId(requestedMeetingId);
    void openMeetingBrief(item);
  }, [
    agenda,
    openedMeetingId,
    requestedMeetingId,
  ]);

  const actionFor = (item: AgendaItem) => {
    if (
      item.kind === 'meeting' &&
      item.meetingId &&
      (item.personId || item.organisationId)
    ) {
      return {
        label: 'Prepare',
        prepareMeeting: true,
      };
    }

    if (item.kind === 'meeting' && item.meetingUrl) {
      return {
        label: 'Meeting link',
        href: item.meetingUrl,
        external: true,
      };
    }

    if (item.playerId) {
      return {
        label: 'Open player',
        href: `${basePath}?view=players&player=${encodeURIComponent(item.playerId)}`,
      };
    }

    if (item.entityType === 'deal') {
      return {
        label: 'Open deal',
        href: `${basePath}?view=opportunities&tab=deals`,
      };
    }

    if (item.entityType === 'player_match') {
      return {
        label: 'Open route',
        href: `${basePath}?view=opportunities&tab=routes`,
      };
    }

    if (item.clubNeedId || item.entityType === 'club_need') {
      return {
        label: 'Open need',
        href: `${basePath}?view=opportunities&tab=needs`,
      };
    }

    if (item.personId) {
      return {
        label: 'Open person',
        href: `${basePath}?view=network&person=${encodeURIComponent(item.personId)}`,
      };
    }

    if (item.birthdayCategory === 'staff') return { label: 'Open team', href: '/settings/team' };

    if (item.organisationId) {
      return {
        label: 'Open club',
        href: `${basePath}?view=network&club=${encodeURIComponent(item.organisationId)}`,
      };
    }

    if (item.kind === 'meeting') {
      return {
        label: 'Open Network',
        href: `${basePath}?view=network`,
      };
    }

    return {
      label: 'Open Home',
      href: `${basePath}?view=home`,
    };
  };

  return (
    <div className={styles.workspace}>
      <section className={styles.calendarControls} aria-label="Calendar controls">
        <div className={styles.calendarHeading}>
          <h2>{new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric'}).format(new Date(`${selectedDate}T12:00:00`))}</h2>
          <div className={styles.dateNavigation}>
            <button type="button" aria-label="Previous month" onClick={()=>setSelectedDate(shiftMonth(selectedDate,-1))}><ChevronLeft size={18}/></button>
            <button type="button" onClick={()=>setSelectedDate(calendarDateKey(new Date()))}>Today</button>
            <button type="button" aria-label="Next month" onClick={()=>setSelectedDate(shiftMonth(selectedDate,1))}><ChevronRight size={18}/></button>
          </div>
        </div>
        <div className={styles.viewSwitch} role="group" aria-label="Calendar view" onKeyDown={event=>{
          if (event.key==='ArrowLeft' || event.key==='ArrowRight') { event.preventDefault(); setView(event.key==='ArrowLeft'?'month':'agenda'); }
        }}>
          <span className={styles.viewIndicator} style={{transform:view==='agenda'?'translateX(100%)':'translateX(0)'}} aria-hidden="true"/>
          <button type="button" aria-pressed={view==='month'} onClick={()=>setView('month')}>Month</button>
          <button type="button" aria-pressed={view==='agenda'} onClick={()=>setView('agenda')}>Agenda</button>
        </div>
        <div className={styles.dateStrip} ref={dayStrip} role="group" aria-label="Choose a day. Swipe to see more dates.">
          {days.map(date=><button key={date} type="button" className={date===selectedDate?styles.stripSelected:styles.stripDay}
            aria-label={new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${date}T12:00:00`)).replaceAll(',', '')}
            aria-current={date===today?'date':undefined} aria-pressed={date===selectedDate} onClick={()=>setSelectedDate(date)}>
            <small>{new Intl.DateTimeFormat('en-GB',{weekday:'short'}).format(new Date(`${date}T12:00:00`))}</small><strong>{Number(date.slice(-2))}</strong>
            <span className={styles.dateDot} data-has-events={agenda.some(item=>calendarDateKey(item.dateAt,Boolean(item.dateOnly))===date)} aria-hidden="true"/>
          </button>)}
        </div>
        <fieldset className={styles.birthdayFilters}><legend><CakeSlice size={16}/>Birthdays</legend>
          {([['players','Signed players'],['contacts','Club contacts'],['staff','Our team']] as const).map(([key,label])=><label key={key}>
            <input type="checkbox" checked={birthdayFilters[key]} onChange={event=>setBirthdayFilters(current=>({...current,[key]:event.target.checked}))}/>{label}
          </label>)}
        </fieldset>
        <p className={styles.birthdayHint}>Add contact birthdays in Network and your birthday in <Link href="/settings/profile">My profile</Link>.</p>
      </section>
      {datesError ? <div className={styles.datesError} role="alert">{datesError}<button type="button" onClick={()=>setRefreshDates(n=>n+1)}>Try again</button></div> : null}
      {datesBusy ? <p className={styles.loadingDates} role="status">Updating dates...</p> : null}
      <div onTouchStart={event=>{
        if ((event.target as HTMLElement).closest('button,a,input')) { swipeStart.current=null; return; }
        swipeStart.current={x:event.touches[0].clientX,y:event.touches[0].clientY};
      }} onTouchEnd={event=>{
        const start=swipeStart.current; swipeStart.current=null; if(!start) return;
        const dx=event.changedTouches[0].clientX-start.x,dy=event.changedTouches[0].clientY-start.y;
        if(Math.abs(dx)>70 && Math.abs(dy)<40) setView(dx<0?'agenda':'month');
      }}>
        {view==='month' ? <CalendarMonth date={selectedDate} items={agenda} onSelect={setSelectedDate}/> : null}
        <section className={styles.controls}>
          {view==='agenda' ? <div className={styles.range} aria-label="Calendar range">{([7, 30, 90] as Horizon[]).map(days=><button key={days} type="button" className={horizon===days?styles.rangeActive:styles.rangeButton} aria-pressed={horizon===days} onClick={()=>setHorizon(days)}>{days} days</button>)}</div> : <h3 className={styles.selectedDayTitle}>{selectedDate===today?'Today':new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'short'}).format(new Date(`${selectedDate}T12:00:00`))}</h3>}
          <span className={styles.count}>{groups.reduce((sum,group)=>sum+group.items.length,0)} events</span>
        </section>
      <section className={view==='month'?`${styles.agenda} ${styles.monthAgenda}`:styles.agenda}>
        {groups.map((group) => (
          <div className={styles.dayGroup} key={group.key}>
            <div
              className={
                group.key === 'overdue'
                  ? styles.dayLabelAttention
                  : styles.dayLabel
              }
            >
              {group.label}
            </div>

            <div className={styles.rows}>
              {group.items.map((item) => {
                const action = actionFor(item);

                return (
                  <article
                    className={
                      group.key === 'overdue'
                        ? styles.rowAttention
                        : styles.row
                    }
                    key={item.key}
                  >
                    <div className={styles.when}>
                      <span>{formatWhen(item)}</span>
                    </div>

                    <div className={styles.icon}>
                      {iconFor(item)}
                    </div>

                    <div className={styles.copy}>
                      <div className={styles.meta}>
                        <span>{item.category}</span>
                        {item.state ? (
                          <small>{human(item.state)}</small>
                        ) : null}
                      </div>

                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </div>

                    {'prepareMeeting' in action &&
                    action.prepareMeeting ? (
                      <button
                        type="button"
                        data-ui-button="nav"
              className={styles.action}
                        onClick={() => void openMeetingBrief(item)}
                      >
                        {action.label}
                        <ChevronRight size={17} />
                      </button>
                    ) : 'external' in action && action.external ? (
                      <a
                        className={styles.action}
                        href={action.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {action.label}
                        <ChevronRight size={17} />
                      </a>
                    ) : (
                      <Link
                        className={styles.action}
                        href={
                          'href' in action && action.href
                            ? action.href
                            : `${basePath}?view=home`
                        }
                      >
                        {action.label}
                        <ChevronRight size={17} />
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        ))}

        {!groups.length ? (
          <div className={styles.empty}>
            <CalendarDays size={20} />
            <strong>{datesBusy ? 'Loading dates' : datesError ? 'Calendar partly unavailable' : view==='month' ? 'Nothing scheduled for this day' : 'Nothing scheduled in this range'}</strong>
            <span>
              Meetings, follow-ups and recorded agency dates will appear here.
            </span>
          </div>
        ) : null}
      </section>

      </div>

      {meetingBrief ? (
        <MeetingBriefDrawer
          brief={meetingBrief}
          busy={meetingBriefBusy}
          error={meetingBriefError}
          onClose={closeMeetingBrief}
          onRecordOutcome={(meeting) => {
            closeMeetingBrief();
            onRecordMeetingOutcome(meeting);
          }}
        />
      ) : null}
    </div>
  );
}

function MeetingBriefDrawer({
  brief,
  busy,
  error,
  onClose,
  onRecordOutcome,
}: {
  brief: any;
  busy: boolean;
  error: string;
  onClose: () => void;
  onRecordOutcome: (meeting: any) => void;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = drawerRef.current;
    drawer?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key !== 'Tab' || !drawer) return;
      const controls = [...drawer.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      )].filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); drawer.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === drawer)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === drawer)) {
        event.preventDefault(); first.focus();
      }
    };
    drawer?.addEventListener('keydown', onKey);
    return () => {
      drawer?.removeEventListener('keydown', onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  const meeting = brief?.meeting || {};
  const memory = brief?.relationship_memory || {};
  const recent = list(memory?.recent_interactions).slice(0, 3);
  const followUps = list(memory?.open_tasks).slice(0, 3);
  const needs = list(brief?.demand?.items).slice(0, 3);
  const deals = list(brief?.commercial?.deals).slice(0, 3);
  const pursuits = list(brief?.pursuits).slice(0, 3);

  const startsAt = parseDate(meeting?.starts_at);
  const when = startsAt
    ? new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(startsAt)
    : 'Time not recorded';
  const meetingStarted = Boolean(
    startsAt &&
      startsAt.getTime() <= Date.now() &&
      meeting?.meeting_id,
  );

  return (
    <div
      className={styles.briefBackdrop}
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        className={styles.briefDrawer}
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Meeting preparation"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.briefHead}>
          <div>
            <span>MEETING PREPARATION</span>
            <h2>{meeting?.title || 'Meeting'}</h2>
            <p>
              {[meeting?.person_name, meeting?.organisation_name, when]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          <button
            type="button"
            data-ui-button="icon"
              className={styles.closeButton}
            onClick={onClose}
            aria-label="Close meeting preparation"
          >
            <X size={16} />
          </button>
        </div>

        {busy ? (
          <div className={styles.briefLoading}>
            <LoaderCircle size={16} />
            Loading what matters for this meeting
          </div>
        ) : null}

        {error ? (
          <div className={styles.briefError}>{error}</div>
        ) : null}

        {!busy ? (
          <div className={styles.briefBody}>
            {(meeting?.meeting_url || meetingStarted) ? (
              <div className={styles.briefActions}>
                {meeting?.meeting_url ? (
                  <a
                    className={styles.joinButton}
                    href={meeting.meeting_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Join meeting
                    <ExternalLink size={14} />
                  </a>
                ) : null}

                {meetingStarted ? (
                  <button
                    type="button"
                    data-ui-button="primary"
              className={styles.outcomeButton}
                    onClick={() => onRecordOutcome(meeting)}
                  >
                    <CheckCircle2 size={14} />
                    Record outcome
                  </button>
                ) : null}
              </div>
            ) : null}

            <BriefSection
              icon={<MessageCircleMore size={14} />}
              eyebrow="RECENT CONVERSATIONS"
              empty="No recorded conversation with this contact yet."
              items={recent.map((item: any) => ({
                key: item?.interaction_id,
                title: item?.summary || 'Interaction recorded',
                meta: [
                  item?.occurred_at
                    ? new Intl.DateTimeFormat('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      }).format(new Date(item.occurred_at))
                    : null,
                  item?.channel ? human(item.channel) : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
              }))}
            />

            <BriefSection
              icon={<Clock3 size={14} />}
              eyebrow="OPEN FOLLOW-UPS"
              empty="No open follow-up with this contact."
              items={followUps.map((item: any) => ({
                key: item?.task_id,
                title: item?.title || 'Follow up',
                meta: item?.due_at
                  ? 'Due ' +
                    new Intl.DateTimeFormat('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    }).format(new Date(item.due_at))
                  : 'No due date',
              }))}
            />
            <BriefSection
              icon={<Target size={14} />}
              eyebrow="CLUB NEEDS"
              empty="No active club need is recorded."
              items={needs.map((item: any) => ({
                key: item?.club_need_id,
                title: item?.title || item?.position || 'Club need',
                meta: [
                  item?.position,
                  item?.need_type ? human(item.need_type) : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
              }))}
            />

            <BriefSection
              icon={<BriefcaseBusiness size={14} />}
              eyebrow="LIVE BUSINESS"
              empty={
                pursuits.length
                  ? 'No active deal room yet. Live pursuits are shown below.'
                  : 'No active deal or pursuit is recorded with this club.'
              }
              items={deals.map((item: any) => ({
                key: item?.deal_room_id,
                title: item?.title || 'Active deal',
                meta: [
                  item?.stage ? human(item.stage) : null,
                  item?.next_action_text || null,
                ]
                  .filter(Boolean)
                  .join(' · '),
              }))}
            />

            {pursuits.length ? (
              <BriefSection
                icon={<Target size={14} />}
                eyebrow="PURSUITS"
                empty=""
                items={pursuits.map((item: any) => ({
                  key:
                    item?.player_match_id ||
                    item?.match_id ||
                    item?.rank,
                  title:
                    item?.player?.name ||
                    item?.player_name ||
                    item?.title ||
                    'Player pursuit',
                  meta:
                    item?.next_action?.instruction ||
                    item?.next_action ||
                    item?.state ||
                    'Recorded pursuit',
                }))}
              />
            ) : null}

            <p className={styles.briefTruth}>
              This is recorded agency context, not a prediction of meeting or deal outcome.
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function BriefSection({
  icon,
  eyebrow,
  empty,
  items,
}: {
  icon: ReactNode;
  eyebrow: string;
  empty: string;
  items: Array<{
    key?: string;
    title: string;
    meta: string;
  }>;
}) {
  return (
    <section className={styles.briefSection}>
      <div className={styles.briefSectionHead}>
        <span>{icon}</span>
        <strong>{eyebrow}</strong>
      </div>

      {items.length ? (
        <div className={styles.briefItems}>
          {items.map((item, index) => (
            <div
              key={item.key || eyebrow + ':' + index}
              className={styles.briefItem}
            >
              <strong>{item.title}</strong>
              {item.meta ? <span>{item.meta}</span> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.briefEmpty}>{empty}</p>
      )}
    </section>
  );
}
