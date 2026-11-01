'use client';

// Original ReDream implementation informed by the user's authorised Athlivo recording.
// Visual component ONLY: parent must supply tenant-checked, real read-model data.
// Do not wire this to public tables, browser-local mock data or service-role credentials.

import Link from 'next/link';
import type {ReactNode} from 'react';
import {
  CalendarClock,
  ShieldAlert,
  UserRoundPlus,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  FileText,
  History,
  Plus,
  RefreshCcw,
  UsersRound,
  Zap,
} from 'lucide-react';
import styles from './AgencyDashboardReference.module.css';

export type DashboardScope = 'me' | 'agency';
export type DashboardCreateKind = 'player' | 'club_need';
export type DashboardMetric = number | null;
export type DashboardFixture = {
  fixtureId: string;
  kickoffAt: string;
  homeName: string;
  awayName: string;
  relatedPlayerNames: string[];
  status: string;
  // Only authorised tenant-owned links, never external or constructed from raw record IDs.
  href?: string;
};
export type DashboardRequest = {
  id: string;
  clubName: string;
  position: string;
  candidateCount: DashboardMetric;
  shortlistedCount: DashboardMetric;
  pitchedCount: DashboardMetric;
  href: string;
  isPredicted?: boolean;
};
export type DashboardEvent = {
  id: string;
  label: string;
  description: string;
  date: string; // ISO YYYY-MM-DD, day in workspace timezone
  type: 'club-contract' | 'agency-contract' | 'birthday' | 'task' | 'meeting' | 'other';
  href?: string;
};
export type DashboardActivity = {
  id: string;
  title: string;
  happenedAt: string;
  href?: string;
};
export type DashboardSnapshot = {
  scope: DashboardScope;
  localDate: string;
  timeZone: string;
  generatedAt: string;
  activeClients: DashboardMetric;
  fixturesToday: DashboardMetric;
  agencyContractsExpiring90Days: DashboardMetric;
  clubContractsExpiringThisCalendarYear: DashboardMetric;
  fixtures: DashboardFixture[];
  clubRequests: DashboardRequest[];
  upcomingEvents: DashboardEvent[];
  recentActivity: DashboardActivity[];
  errors?: Partial<Record<'fixtures' | 'counts' | 'requests' | 'events' | 'activity', string>>;
};

export type AgencyDashboardReferenceProps = {
  snapshot: DashboardSnapshot;
  firstName: string;
  agencyName: string;
  /** The existing ReDream branding/logo is rendered by the parent shell. */
  agencyMark?: ReactNode;
  basePath: string;
  canViewAgency: boolean;
  onScopeChange: (scope: DashboardScope) => void;
  onDaySelect: (day: string) => void;
  onRefresh: () => void;
  onCreate: (kind: DashboardCreateKind) => void;
  canCreatePlayer: boolean;
  canCreateRequest: boolean;
};

function safeHref(href: string | undefined, basePath: string): string | null {
  if (!href || !href.startsWith('/')) return null;
  // Strictly limit in-product navigation. Do not allow protocol-relative URLs.
  if (href.startsWith('//') || href.includes('\\')) return null;
  return href === basePath || href.startsWith(`${basePath}?`) || href.startsWith(`${basePath}/`)
    ? href
    : null;
}

function readableDate(date: string): string {
  const value = new Date(`${date}T12:00:00`);
  return Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'long'}).format(value)
    : 'Date unavailable';
}

function readableDay(date: string): string {
  const value = new Date(`${date}T12:00:00`);
  return Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat('en-GB', {weekday: 'long'}).format(value)
    : '';
}

function dayInZone(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone,
    }).formatToParts(new Date());
    const field = (name: string) => parts.find(part => part.type === name)?.value || '';
    return `${field('year')}-${field('month')}-${field('day')}`;
  } catch {
    return '';
  }
}

function readableActivityDate(value: string, zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: zone,
    }).format(new Date(value));
  } catch {
    return 'Date unavailable';
  }
}

function readableTime(value: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone,
    }).format(new Date(value));
  } catch {
    return 'Time unavailable';
  }
}

function readableEventDate(value: string): {month:string;day:string} {
  const parsed = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return {month:'',day:'–'};
  return {
    month: new Intl.DateTimeFormat('en-GB',{month:'short'}).format(parsed).toUpperCase(),
    day: new Intl.DateTimeFormat('en-GB',{day:'numeric'}).format(parsed),
  };
}

function SmallLink({href,basePath,children}: {href?:string;basePath:string;children:ReactNode}) {
  const safe=safeHref(href,basePath);
  if (!safe) return <>{children}</>;
  return <Link href={safe} className={styles.itemLink}>{children}</Link>;
}

function eventInitials(label: string): string {
  const person = label.split(' · ')[0]?.trim() || '';
  return person.split(/\s+/).slice(0,2).map(part => part[0]?.toUpperCase() || '').join('') || '•';
}

function clubInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0,2).map(part => part[0]?.toUpperCase() || '').join('') || 'C';
}

function count(value: DashboardMetric) {
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0 ? value.toLocaleString('en-GB') : '–';
}

export default function AgencyDashboardReference({
  snapshot, firstName, agencyName, agencyMark, basePath, canViewAgency,
  onScopeChange, onDaySelect, onRefresh, onCreate, canCreatePlayer, canCreateRequest,
}: AgencyDashboardReferenceProps) {
  const requestPage = `${basePath}?view=opportunities&tab=needs`;
  const calendarPage = `${basePath}?view=calendar`;
  const metrics = [
    {key:'clients', label:'Total Clients', value:snapshot.activeClients, hint:'Active represented players', Icon:UsersRound},
    {key:'fixtures', label:"Today's Fixtures", value:snapshot.fixturesToday, hint:'Fixtures scheduled', Icon:CalendarDays},
    {key:'agency', label:'Agency Contracts', value:snapshot.agencyContractsExpiring90Days, hint:'Expiring in 3 months', Icon:FileText},
    {key:'club', label:'Club Contracts', value:snapshot.clubContractsExpiringThisCalendarYear, hint:'Expiring this year', Icon:FileText},
  ];

  return <main className={styles.dashboard} aria-label="Agency dashboard">
    <header className={styles.welcome}>
      <div className={styles.identity}>
        <div className={styles.agencyMark} aria-hidden="true">{agencyMark || 'R'}</div>
        <div>
          <p>{agencyName}</p>
          <h2>Hello, <span>{firstName}</span></h2>
        </div>
      </div>
      {canViewAgency ? <div role="group" aria-label="Dashboard scope" className={styles.scope}>
        <button aria-pressed={snapshot.scope==='me'} onClick={()=>onScopeChange('me')}>Me</button>
        <button aria-pressed={snapshot.scope==='agency'} onClick={()=>onScopeChange('agency')}>Agency</button>
      </div>:null}
    </header>

    <div className={styles.topGrid}>
      <section className={styles.panel} aria-labelledby="dashboard-quick-actions-title">
        <div className={styles.quickHead}>
          <span className={styles.headIcon}><Zap size={17}/></span>
          <div><h3 id="dashboard-quick-actions-title">Quick Actions</h3><p>Jump straight to what you need</p></div>
        </div>
        <div className={styles.actionList}>
          {canCreatePlayer ? <button onClick={()=>onCreate('player')}><Plus size={18}/>Add a player<ChevronRight size={16}/></button> : null}
          {canCreateRequest ? <button onClick={()=>onCreate('club_need')}><Plus size={18}/>Add a club request<ChevronRight size={16}/></button> : null}
          <Link href={`${calendarPage}&create=task`}><Plus size={18}/>Create a task<ChevronRight size={16}/></Link>
        </div>
      </section>
      <section className={styles.panel} aria-labelledby="dashboard-fixtures-title">
        <div className={styles.fixturesHead}>
          <div className={styles.fixtureDate}>
            <p>{readableDay(snapshot.localDate)} · {snapshot.localDate===dayInZone(snapshot.timeZone)
              ? <span>Today</span>
              : <button type="button" onClick={()=>onDaySelect(dayInZone(snapshot.timeZone))}>Back to today</button>}</p>
            <label className={styles.fixtureDatePicker}>
              <h3 id="dashboard-fixtures-title">{readableDate(snapshot.localDate)}</h3>
              <input type="date" aria-label="Choose fixture date" value={snapshot.localDate}
                onChange={event=>onDaySelect(event.currentTarget.value)}/>
            </label>
          </div>
          <div className={styles.dateControls}>
            <button type="button" onClick={onRefresh} aria-label="Refresh fixtures"><RefreshCcw size={16}/></button>
            <Link href={`${calendarPage}&create=task`} aria-label="Create a calendar task"><Plus size={17}/></Link>
            <Link href={calendarPage} aria-label="Open calendar"><ArrowUpRight size={16}/></Link>
          </div>
        </div>
        <div className={styles.fixtureList}>
          {snapshot.errors?.fixtures ? <div className={styles.empty} role="status">Fixtures unavailable. <button onClick={onRefresh}>Retry</button></div> :
           snapshot.fixtures.length===0 ? <div className={styles.empty}>No fixtures recorded for this day. Coverage may be incomplete.</div> :
           snapshot.fixtures.map((fixture)=><SmallLink key={fixture.fixtureId} href={fixture.href} basePath={basePath}>
             <div className={styles.fixture}>
               <time>{readableTime(fixture.kickoffAt,snapshot.timeZone)}</time>
               <i aria-hidden="true"/>
               <div><strong>{fixture.homeName} vs {fixture.awayName}</strong>
                 <span>{fixture.relatedPlayerNames.length?fixture.relatedPlayerNames.join(', '):'No linked players confirmed'}</span>
               </div>
             </div>
           </SmallLink>)}
        </div>
      </section>
    </div>

    <div className={styles.metrics} aria-label="Agency dashboard figures">
      {metrics.map(({key,label,value,hint,Icon})=><section className={styles.metric} data-metric={key} key={key}>
        <p>{label}</p><span className={styles.metricIcon}><Icon size={21}/></span>
        <strong aria-label={`${label}: ${value===null?'Not verified':count(value)}`}>{count(value)}</strong>
        <small>{value===null?'Awaiting verified data':hint}</small>
      </section>)}
    </div>

    <div className={styles.bottomGrid}>
      <section aria-labelledby="dashboard-requests-title">
        <div className={styles.sectionTitle}><h3 id="dashboard-requests-title"><ShieldAlert size={18} aria-hidden="true"/>Club Requests</h3><Link href={requestPage}>View All <ChevronRight size={14}/></Link></div>
        <div className={styles.column}>
          {snapshot.errors?.requests?<div className={styles.empty}>Requests unavailable</div>:
           snapshot.clubRequests.length===0?<div className={styles.empty}>No open requests</div>:
           snapshot.clubRequests.map((request)=><article className={styles.request} key={request.id}>
             <SmallLink href={request.href} basePath={basePath}><div className={styles.requestName}><span className={styles.clubAvatar} aria-hidden="true">{clubInitials(request.clubName)}</span><div><strong>{request.position}</strong><small>{request.clubName}</small></div>{request.isPredicted?<small>Potential</small>:null}</div></SmallLink>
             <div className={styles.requestCounts}>
               <div><strong>{count(request.candidateCount)}</strong><span>Potential</span></div>
               <div><strong>{count(request.shortlistedCount)}</strong><span>Shortlist</span></div>
               <div><strong>{count(request.pitchedCount)}</strong><span>Pitched</span></div>
             </div>
           </article>)}
        </div>
      </section>
      <section aria-labelledby="dashboard-events-title">
        <div className={styles.sectionTitle}><h3 id="dashboard-events-title"><CalendarClock size={18} aria-hidden="true"/>Upcoming Events</h3><Link href={calendarPage}>Calendar <ChevronRight size={14}/></Link></div>
        <div className={styles.column}>
          {snapshot.errors?.events?<div className={styles.empty}>Events unavailable</div>:
           snapshot.upcomingEvents.length===0?<div className={styles.empty}>No upcoming events</div>:
           snapshot.upcomingEvents.map((event)=>{
             const date=readableEventDate(event.date);
             return <SmallLink key={event.id} href={event.href} basePath={basePath}><article className={styles.event}>
               <span className={styles.eventSymbol} data-event-type={event.type} aria-hidden="true">{event.type==='task'||event.type==='meeting'?<Clock3 size={17}/>:eventInitials(event.label)}</span>
               <div><strong>{event.label}</strong><small>{event.description}</small></div>
               <time dateTime={event.date} className={styles.dateBox}><span>{date.month}</span><strong>{date.day}</strong></time>
             </article></SmallLink>;
           })}
        </div>
      </section>
      <section aria-labelledby="dashboard-activity-title">
        <div className={styles.sectionTitle}><h3 id="dashboard-activity-title"><History size={16}/> Recent Activity</h3></div>
        <div className={styles.column}>
          {snapshot.errors?.activity?<div className={styles.empty}>Activity unavailable</div>:
           snapshot.recentActivity.length===0?<div className={styles.empty}>No recent activity</div>:
           snapshot.recentActivity.map((activity)=><SmallLink key={activity.id} href={activity.href} basePath={basePath}><article className={styles.activity}>
             <span className={styles.activityPictograms} aria-hidden="true">
               <span className={styles.activityPerson}><UsersRound size={20}/></span>
               <span className={styles.activitySeparation}/>
               <span className={styles.activityAction}><UserRoundPlus size={19}/></span>
             </span>
             <strong>{activity.title}</strong>
             <time dateTime={activity.happenedAt}>{readableActivityDate(activity.happenedAt,snapshot.timeZone)}</time>
           </article></SmallLink>)}
        </div>
      </section>
    </div>
    <p className={styles.readMeta}>Updated {readableTime(snapshot.generatedAt,snapshot.timeZone)} · {snapshot.scope==='me'?'Your authorised records':'Agency records you may access'}</p>
  </main>;
}
