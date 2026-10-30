'use client';

import {useMemo, useState} from 'react';
import {ArrowUpRight, BriefcaseBusiness, ChevronRight, CircleAlert, Clock3, Search, Target, Users, X} from 'lucide-react';
import {opportunityOverview, type OpportunityItem} from '@/lib/opportunity-overview';
import type {AgencyPursuitRequest} from '@/components/AgencyPursuitRoom';
import type {AgencyIntelligenceRequest} from '@/components/AgencyEntityIntelligenceDrawer';
import styles from './AgencyOpportunityOverview.module.css';

type Props = {
  needs: any[];
  routes: any[];
  deals: any[];
  connectedNeeds: any[];
  connectedDeals: any[];
  marketReady: boolean;
  dealsReady: boolean;
  marketError: boolean;
  dealsError: boolean;
  onRetry: () => void;
  onOpenNeed: (id: string) => void;
  onOpenPursuit: (request: AgencyPursuitRequest) => void;
  onOpenDeal: (request: AgencyIntelligenceRequest) => void;
};

function category(kind: OpportunityItem['kind']) {
  return kind === 'need' ? 'Club request' : kind === 'route' ? 'Player pursuit' : 'Live deal';
}

export default function AgencyOpportunityOverview({needs,routes,deals,connectedNeeds,connectedDeals,marketReady,dealsReady,marketError,dealsError,onRetry,onOpenNeed,onOpenPursuit,onOpenDeal}: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all'|'attention'>('all');
  const overview = useMemo(() => opportunityOverview({needs,routes,deals,connectedNeeds,connectedDeals}), [needs,routes,deals,connectedNeeds,connectedDeals]);
  const open = (item: OpportunityItem) => {
    if (item.kind === 'need') return onOpenNeed(item.id);
    if (item.kind === 'deal') return onOpenDeal({
      key:`deal-war-room:${item.id}`, kind:'deal', entityId:item.id,
      title:item.source?.title || 'Live deal', context:item.source?.organisation || null,
    });
    const source = item.source;
    return onOpenPursuit({
      key:`pursuit:${item.id}`, playerMatchId:item.id,
      playerId: source?.player?.player_id ? String(source.player.player_id) : null,
      playerName: source?.player?.name || 'Player',
      clubId:source?.club?.organisation_id ? String(source.club.organisation_id) : null,
      clubName:source?.club?.name || 'Club', needTitle:source?.need?.title || null,
      careerGateState:source?.career_strategy_gate?.state || null,
      careerGateReason:source?.career_strategy_gate?.reason || null,
      accessLabel: source?.best_access_route?.person_name || null,
      accessDetail:source?.best_access_route?.why_this_route || null,
    });
  };
  const term = query.trim().toLocaleLowerCase();
  const matches = (item: OpportunityItem) => [item.title,item.detail,item.context,item.nextAction,item.ownerName].some(value => (value || '').toLocaleLowerCase().includes(term));
  const recordedNeedIds = new Set(overview.needs.map(need => need.id));
  const topLevel = [
    ...overview.needs,
    ...overview.routes.filter(route => !route.linkedNeedId || !recordedNeedIds.has(route.linkedNeedId)),
    ...overview.deals,
  ];
  const needsReview = (item: OpportunityItem) => item.attention || (item.kind === 'need' && (overview.byNeed.get(item.id) || []).some(child => child.attention));
  const matchesWithChildren = (item: OpportunityItem) => matches(item) || (item.kind === 'need' && (overview.byNeed.get(item.id) || []).some(matches));
  const attention = topLevel.filter(item => needsReview(item) && matchesWithChildren(item));
  const other = topLevel.filter(item => !needsReview(item) && matchesWithChildren(item));
  const byPriority = (a: OpportunityItem,b: OpportunityItem) => a.attentionRank-b.attentionRank || a.title.localeCompare(b.title);
  attention.sort(byPriority);
  other.sort(byPriority);
  const visible = filter === 'attention' ? attention : [...attention, ...other];
  const loaded = marketReady && dealsReady;

  const row = (item: OpportunityItem) => {
    const Icon = item.kind === 'need' ? Target : item.kind === 'route' ? Users : BriefcaseBusiness;
    // Only show known canonical player/club links; no inferred match or interest.
    const allChildren = item.kind === 'need' ? overview.byNeed.get(item.id) || [] : [];
    // Searching a linked player must reveal that exact player, even when the need has many candidates.
    const children = term && !matches(item) ? allChildren.filter(matches) :
      filter === 'attention' && !item.attention ? allChildren.filter(child => child.attention) : allChildren;
    const hasChildAttention = allChildren.some(child => child.attention);
    const due = item.dueAt ? new Date(item.dueAt) : null;
    const dueText = due && Number.isFinite(due.getTime()) ? new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short'}).format(due) : null;
    return <article className={styles.item} key={item.key}>
      <button type="button" className={styles.record} onClick={() => open(item)} aria-label={`Open ${category(item.kind)}: ${item.title}`}>
        <span className={styles.icon}><Icon size={18} strokeWidth={1.8}/></span>
        <span className={styles.copy}>
          <span className={styles.overline}>{category(item.kind)} <span className={styles.dot}>·</span> {item.context}</span>
          <strong>{item.title}</strong>
          <span className={styles.detail}>{item.detail}</span>
          {(item.ownerName || dueText) ? <span className={styles.accountability}>{item.ownerName ? `Owner: ${item.ownerName}` : 'Opportunity owner not shown'}{dueText ? ` · Follow-up due ${dueText}` : ''}</span> : null}
          {item.nextAction ? <span className={styles.next}><ArrowUpRight size={14}/><span><b>{item.nextActionLabel}:</b> {item.nextAction}</span></span> : null}
          {(item.attentionReason || hasChildAttention) ? <span className={styles.reason}><CircleAlert size={13}/> {item.attentionReason || 'Linked player needs review'}</span> : null}
        </span>
        <ChevronRight className={styles.chevron} size={19}/>
      </button>
      {children.length ? <div className={styles.linked} aria-label={`Recorded player pursuits for ${item.title}`}>
        <span className={styles.linkedTitle}>{term && !matches(item) ? `${children.length} matching player ${children.length === 1 ? 'pursuit' : 'pursuits'}` : `${allChildren.length} recorded player ${allChildren.length === 1 ? 'pursuit' : 'pursuits'}`}</span>
        {children.slice(0,3).map(child => <button type="button" key={child.key} className={styles.linkedRow} onClick={() => open(child)}>
          <span>{child.title}</span><ChevronRight size={15}/>
        </button>)}
        {children.length > 3 ? <span className={styles.linkedMore}>{children.length-3} more available in Club requests</span> : null}
      </div> : null}
    </article>;
  };
  const loading = !loaded && !marketError && !dealsError;
  return <section className={styles.overview} aria-label="All agency opportunities">
    <div className={styles.intro}>
      <div><p className={styles.eyebrow}>AGENCY OPPORTUNITIES</p><h2>Every opportunity, in one place.</h2><p>Club requirements, player pursuits and deals. Move the right conversation forward.</p></div>
      <div className={styles.counts} aria-label="Recorded work by type">
        <div><strong>{marketReady ? overview.needs.length : '–'}</strong><span>Requests</span></div>
        <div><strong>{marketReady ? overview.routes.length : '–'}</strong><span>Pursuits</span></div>
        <div><strong>{dealsReady ? overview.deals.length : '–'}</strong><span>Deals</span></div>
      </div>
    </div>
    <div className={styles.toolbar}>
      <div className={styles.filters} role="group" aria-label="Opportunity filter">
        <button type="button" className={filter==='all' ? styles.selected : styles.filter} aria-pressed={filter==='all'} onClick={() => setFilter('all')}>All work</button>
        <button type="button" className={filter==='attention' ? styles.selected : styles.filter} aria-pressed={filter==='attention'} onClick={() => setFilter('attention')}>Needs attention{attention.length ? <span>{attention.length}</span> : null}</button>
      </div>
      <label className={styles.search}><Search size={17}/><span className={styles.sr}>Search opportunities</span><input aria-label="Search all opportunities" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search players or clubs"/>{query ? <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={15}/></button> : null}</label>
    </div>
    {(marketError || dealsError) ? <div className={styles.notice} role="alert">Some opportunity information could not be refreshed. {marketError ? 'Club requests or pursuits are unavailable. ' : ''}{dealsError ? 'Deals are unavailable. ' : ''}<button type="button" onClick={onRetry}>Try again</button></div> : null}
    {loading ? <div className={styles.loading} role="status"><Clock3 size={16}/> Finishing the opportunity overview…</div> : null}
    {visible.length ? <div className={styles.groups}>
      {attention.length ? <section className={styles.section} aria-label="Opportunities needing attention"><div className={styles.sectionHead}><h3>Needs attention</h3><span>{attention.length} recorded</span></div><div className={styles.cards}>{attention.map(row)}</div></section> : null}
      {filter==='all' && other.length ? <section className={styles.section} aria-label="Other recorded opportunities"><div className={styles.sectionHead}><h3>{attention.length ? 'Other opportunities' : 'Current opportunities'}</h3><span>{other.length} recorded</span></div><div className={styles.cards}>{other.map(row)}</div></section> : null}
    </div> : loaded && !marketError && !dealsError ? <div className={styles.empty}><Target size={23}/><h3>{query ? 'No matches' : filter==='attention' ? 'Nothing flagged for review' : 'No recorded opportunities yet'}</h3><p>{query ? 'Try another player or club name.' : filter==='attention' ? 'Open All work to see existing opportunities.' : 'Create a club request or player pursuit to get started.'}</p></div> : null}
    <p className={styles.footnote}>Only recorded need-linked tasks, due dates and verified workflow blockers trigger attention. Suggestions are not completed or scheduled actions. Contact activity never proves a particular player was discussed.</p>
  </section>;
}
