'use client';

import {
  ChevronRight,
  BriefcaseBusiness,
  MessageCircleMore,
  Search,
  Target,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import type { AgencyIntelligenceRequest } from '@/components/AgencyEntityIntelligenceDrawer';
import type { AgencyPursuitRequest } from '@/components/AgencyPursuitRoom';
import AgencyOwnershipChip from '@/components/AgencyOwnershipChip';
import EntityActionsMenu from '@/components/EntityActionsMenu';
import { opportunityReadState } from '@/lib/opportunity-read-state';
import { relativeDate } from '@/lib/platform-client';

import styles from './AgencyOpportunitiesWorkspace.module.css';

type OpportunityView = 'needs' | 'routes' | 'deals';

const opportunityViewFrom = (value: unknown): OpportunityView =>
  value === 'routes' || value === 'deals' ? value : 'needs';

const list = (value: unknown): any[] =>
  Array.isArray(value) ? value : [];

const human = (value: unknown) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const money = (value: unknown, currency = 'EUR') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Commission not recorded';

  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('en-GB')}`;
  }
};

const careerGateLabel = (value: unknown) => {
  const state = String(value || '').trim().toLowerCase();
  if (!state) return 'Recorded';
  if (state.startsWith('open_')) return 'Open to progress';
  if (state.startsWith('review_')) return 'Review needed';
  if (state.startsWith('hold_')) return 'Player decision needed';
  return human(state);
};

function ConnectedOpportunityContext({
  context,
}: {
  context: any;
}) {
  if (!context) return null;

  const latest = context?.latest_contact || null;
  const followup = context?.open_followup || null;
  const sourceName =
    context?.source_person_name || 'Recorded source';
  const label =
    context?.scope === 'deal_source_contact'
      ? 'DEAL CONTACT'
      : 'NEED SOURCE';

  return (
    <div className={styles.connectedContext}>
      <div className={styles.connectedContextIcon}>
        <MessageCircleMore size={13} />
      </div>

      <div className={styles.connectedContextCopy}>
        <small>{label}</small>

        {latest ? (
          <>
            <strong>
              {latest?.person_name || sourceName}
            </strong>
            <span>
              {latest?.summary ||
                'Connected contact recorded.'}
            </span>
            <div className={styles.connectedContextMeta}>
              <em>
                {human(latest?.channel || 'Connected')}
                {latest?.direction
                  ? ` · ${human(latest.direction)}`
                  : ''}
                {latest?.occurred_at
                  ? ` · ${relativeDate(
                      latest.occurred_at,
                    )}`
                  : ''}
              </em>
              <AgencyOwnershipChip
                label="Contact owner"
                name={latest?.owner_name || null}
                emptyText={
                  latest?.owner_user_id
                    ? 'Needs reassignment'
                    : 'Unassigned'
                }
                attention={
                  latest?.owner_state !== 'active_staff'
                }
              />
            </div>
          </>
        ) : (
          <>
            <strong>{sourceName}</strong>
            <span>
              No connected conversation yet.
            </span>
          </>
        )}

        {followup ? (
          <div className={styles.connectedFollowup}>
            <span>
              Open follow-up: {followup?.title || 'Follow up'}
              {followup?.due_at
                ? ` · ${relativeDate(followup.due_at)}`
                : ''}
            </span>
            <AgencyOwnershipChip
              label="Follow-up owner"
              name={followup?.owner_name || null}
              emptyText={
                followup?.owner_user_id
                  ? 'Needs reassignment'
                  : 'Unassigned'
              }
              attention={
                followup?.owner_state !== 'active_staff'
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AgencyOpportunitiesWorkspace({
  data,
  basePath,
  onRetry,
  onRefresh,
  rpc,
  onOpenAction,
  onOpenPursuit,
  onOpenIntelligence,
}: {
  data: any;
  basePath: string;
  onRetry?: () => void;
  onRefresh: () => Promise<void>;
  rpc: <T,>(name: string, args?: Record<string, unknown>) => Promise<T>;
  onOpenAction: (request: AgencyActionRequest) => void;
  onOpenPursuit: (request: AgencyPursuitRequest) => void;
  onOpenIntelligence: (request: AgencyIntelligenceRequest) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedView = opportunityViewFrom(searchParams.get('tab'));
  const [view, setView] = useState<OpportunityView>(requestedView);
  const [search, setSearch] = useState('');
  const [archiveItems, setArchiveItems] = useState<any[]>([]);
  const requestedRecord=String(searchParams.get('record')||'');
  useEffect(()=>{
    if(!requestedRecord)return;
    const frame=requestAnimationFrame(()=>{
      const row=document.getElementById('opportunity-'+requestedRecord);
      if(row){row.scrollIntoView({block:'center',behavior:'instant'});row.focus({preventScroll:true});}
    });
    return()=>cancelAnimationFrame(frame);
  },[requestedRecord,data,view]);
  const readState = opportunityReadState(data, view);

  const reloadArchives = useCallback(async () => {
    const result = await rpc<any>('redream_entity_archives');
    setArchiveItems(Array.isArray(result?.items) ? result.items : []);
  }, [rpc]);

  const refreshEntities = useCallback(async () => {
    await Promise.all([onRefresh(), reloadArchives()]);
  }, [onRefresh, reloadArchives]);

  useEffect(() => {
    void reloadArchives().catch(() => undefined);
  }, [reloadArchives]);

  const archived = useMemo(
    () => new Set(archiveItems.map((item: any) => `${String(item?.entity_type || '')}:${String(item?.entity_id || '')}`)),
    [archiveItems],
  );

  useEffect(() => {
    setView(requestedView);
  }, [requestedView]);

  const selectView = (nextView: OpportunityView) => {
    setView(nextView);
    setSearch('');
    router.replace(
      `${basePath}?view=opportunities&tab=${nextView}`,
      { scroll: false },
    );
  };

  const needs = list(data?.market?.demand?.items).filter((item: any) =>
    !archived.has(`club_need:${String(item?.club_need_id || '')}`),
  );
  const routes = list(data?.market?.pursuits?.items).filter((item: any) => {
    const needId = String(item?.club_need_id || item?.need?.club_need_id || item?.need?.id || '');
    return !needId || !archived.has(`club_need:${needId}`);
  });
  const deals = list(data?.deals?.portfolio?.deals).filter((deal: any) =>
    !archived.has(`deal_room:${String(deal?.deal_room_id || '')}`),
  );
  const connectedNeeds = list(data?.connected?.needs);
  const connectedRoutes = list(data?.connected?.routes);
  const connectedDeals = list(data?.connected?.deals);

  const needConnected = useMemo(
    () =>
      new Map(
        connectedNeeds.map((item: any) => [
          String(item?.club_need_id || ''),
          item,
        ]),
      ),
    [connectedNeeds],
  );

  const routeConnected = useMemo(
    () =>
      new Map(
        connectedRoutes.map((item: any) => [
          String(item?.player_match_id || ''),
          item,
        ]),
      ),
    [connectedRoutes],
  );

  const dealConnected = useMemo(
    () =>
      new Map(
        connectedDeals.map((item: any) => [
          String(item?.deal_room_id || ''),
          item,
        ]),
      ),
    [connectedDeals],
  );

  const searchValue = search.trim().toLowerCase();

  const filteredNeeds = useMemo(
    () =>
      needs.filter((item: any) =>
        !searchValue ||
        [
          item?.club?.name,
          item?.need?.title,
          item?.need?.position,
          item?.need?.need_type,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(searchValue),
      ),
    [needs, searchValue],
  );

  const filteredRoutes = useMemo(
    () =>
      routes.filter((item: any) =>
        !searchValue ||
        [
          item?.player?.name,
          item?.club?.name,
          item?.need?.title,
          item?.best_access_route?.person_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(searchValue),
      ),
    [routes, searchValue],
  );

  const filteredDeals = useMemo(
    () =>
      deals.filter((deal: any) =>
        !searchValue ||
        [
          deal?.title,
          deal?.organisation,
          deal?.stage,
          deal?.primary_blocker,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(searchValue),
      ),
    [deals, searchValue],
  );

  const activeItems =
    view === 'needs'
      ? filteredNeeds
      : view === 'routes'
        ? filteredRoutes
        : filteredDeals;

  const openNeedRoute = (item: any, candidate: any) => {
    onOpenPursuit({
      key: `pursuit:${candidate.player_match_id}`,
      playerMatchId: String(candidate.player_match_id),
      playerId: candidate.player_id
        ? String(candidate.player_id)
        : null,
      playerName: candidate.player_name || 'Player',
      clubId: item?.club?.organisation_id
        ? String(item.club.organisation_id)
        : null,
      clubName: item?.club?.name || 'Club',
      needTitle: item?.need?.title || null,
      careerGateState:
        candidate.career_gate_state ||
        candidate.match_status ||
        null,
      careerGateReason:
        candidate.career_gate_reason || null,
      accessLabel: null,
      accessDetail: null,
    });
  };

  const prepareSearch = (item: any) => {
    onOpenAction({
      key: `scouting:${item.club_need_id}`,
      eyebrow: 'CLUB NEED',
      title:
        `${item.club?.name || 'Club'} · ${item.need?.title || 'Player need'}`,
      instruction:
        item.next_action?.instruction ||
        'Create controlled scouting work against the recorded club need.',
      label: 'Prepare search',
      action: 'scouting_mandate_prepare',
      payload: {
        club_need_id: item.club_need_id,
      },
      context:
        item.need?.position ||
        'Recorded club need',
      facts: [
        {
          label: 'Need',
          value:
            item.need?.title ||
            'Recorded player need',
          detail:
            `${human(item.need?.need_type || 'recorded')} · ${item.club?.name || 'Club recorded'}`,
        },
        {
          label: 'Profile',
          value:
            [
              item.need?.position,
              item.need?.preferred_foot
                ? `${item.need.preferred_foot} foot`
                : null,
              item.need?.min_height_cm
                ? `${item.need.min_height_cm}cm+`
                : null,
            ]
              .filter(Boolean)
              .join(' · ') ||
            'Profile not fully recorded',
          detail: item.need?.transfer_type
            ? human(item.need.transfer_type)
            : 'Transfer type not recorded',
        },
        {
          label: 'Coverage',
          value:
            `${Number(item.candidate_coverage?.recorded_candidates || 0)} recorded candidate${Number(item.candidate_coverage?.recorded_candidates || 0) === 1 ? '' : 's'}`,
          detail: human(
            item.coverage_state ||
              'coverage not recorded',
          ),
        },
        {
          label: 'Timing',
          value: item.need?.expires_at
            ? relativeDate(item.need.expires_at)
            : 'No expiry recorded',
          detail: 'Recorded club-demand timing',
        },
      ],
      successCondition:
        'At least one credible candidate route is recorded against this club need.',
      confirmationLabel: 'Create search task',
    });
  };

  const openRoute = (item: any) => {
    const accessMode =
      item.access_strategy?.recommended_mode ||
      item.best_access_route?.route_state ||
      'recorded_route';

    onOpenPursuit({
      key: `pursuit:${item.player_match_id}`,
      playerMatchId: String(item.player_match_id),
      playerId: item.player?.player_id
        ? String(item.player.player_id)
        : null,
      playerName: item.player?.name || 'Player',
      clubId: item.club?.organisation_id
        ? String(item.club.organisation_id)
        : null,
      clubName: item.club?.name || 'Club',
      needTitle: item.need?.title || null,
      careerGateState:
        item.career_strategy_gate?.state || null,
      careerGateReason:
        item.career_strategy_gate?.reason || null,
      accessLabel:
        item.best_access_route?.person_name ||
        human(accessMode),
      accessDetail:
        item.best_access_route?.why_this_route || null,
    });
  };

  const handleDeal = (deal: any) => {
    const controlInstruction =
      deal.next_control_fix?.instruction || '';

    if (!controlInstruction) {
      onOpenIntelligence({
        key: `deal-war-room:${deal.deal_room_id}`,
        kind: 'deal',
        entityId: String(deal.deal_room_id),
        title: deal.title || 'Live deal',
        context:
          deal.organisation || human(deal.stage),
      });
      return;
    }

    const hasExpectedCommission =
      deal.expected_commission !== null &&
      deal.expected_commission !== undefined &&
      deal.expected_commission !== '' &&
      Number.isFinite(Number(deal.expected_commission));

    const commissionValue =
      hasExpectedCommission && deal.currency
        ? money(deal.expected_commission, deal.currency)
        : 'Commission not recorded';

    const introductionContext =
      deal.next_best_move?.introduction_context || {};

    const introductionTarget =
      introductionContext?.target_contact?.name || '';

    const introductionRole =
      introductionContext?.target_contact?.role_title || '';

    const introductionVia =
      introductionContext?.intermediary?.name || '';

    const needsOwner =
      /owner|ownership/i.test(controlInstruction);

    onOpenAction({
      key: `deal-control:${deal.deal_room_id}`,
      eyebrow: 'DEAL ACTION',
      title: deal.title || 'Live deal',
      instruction: controlInstruction,
      label: needsOwner ? 'Assign owner' : 'Fix this',
      action: 'deal_control_fix_prepare',
      payload: {
        deal_room_id: deal.deal_room_id,
      },
      context:
        deal.organisation || deal.stage,
      facts: [
        {
          label: 'Stage',
          value: human(deal.stage || 'recorded'),
          detail: human(
            deal.momentum_state ||
              'momentum recorded',
          ),
        },
        {
          label: 'Primary blocker',
          value:
            deal.primary_blocker ||
            'No blocker recorded',
          detail: human(
            deal.control_state ||
              deal.rescue_state ||
              'control recorded',
          ),
        },
        {
          label: 'Commercial value',
          value: commissionValue,
          detail: hasExpectedCommission
            ? 'Expected commission'
            : 'Expected commission not recorded',
        },
        {
          label: 'Access route',
          value:
            introductionTarget ||
            deal.organisation ||
            'No route recorded',
          detail: introductionVia
            ? `Warm introduction via ${introductionVia}`
            : introductionRole ||
              'No warm introduction recorded',
        },
      ],
      successCondition:
        deal.next_control_fix?.success_condition ||
        (needsOwner
          ? 'One accountable owner controls the live deal.'
          : 'The recorded deal-control gap is resolved.'),
      confirmationLabel:
        needsOwner ? 'Assign deal owner' : 'Apply fix',
    });
  };

  return (
    <div className={styles.workspace}>
      <section className={styles.controls}>
        <div className={styles.tabs} aria-label="Opportunity view">
          <button
            type="button"
            className={view === 'needs' ? styles.tabActive : styles.tab}
            aria-pressed={view === 'needs'}
            onClick={() => selectView('needs')}
          >
            <Target size={15} />
            Needs
            {data?.market != null ? <span>{needs.length}</span> : null}
          </button>

          <button
            type="button"
            className={view === 'routes' ? styles.tabActive : styles.tab}
            aria-pressed={view === 'routes'}
            onClick={() => selectView('routes')}
          >
            <Users size={15} />
            Player routes
            {data?.market != null ? <span>{routes.length}</span> : null}
          </button>

          <button
            type="button"
            className={view === 'deals' ? styles.tabActive : styles.tab}
            aria-pressed={view === 'deals'}
            onClick={() => selectView('deals')}
          >
            <BriefcaseBusiness size={15} />
            Live deals
            {data?.deals != null ? <span>{deals.length}</span> : null}
          </button>
        </div>

        <label className={styles.search}>
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              view === 'needs'
                ? 'Search club or need'
                : view === 'routes'
                  ? 'Search player or club'
                  : 'Search live deals'
            }
            aria-label="Search opportunities"
          />
          {search ? (
            <button data-ui-button="tertiary"
              type="button"
              onClick={() => setSearch('')}
            >
              Clear
            </button>
          ) : null}
        </label>
      </section>

      <section className={styles.listCard}>
        {view === 'needs'
          ? filteredNeeds.map((item: any) => {
              const candidates = list(
                item?.candidate_coverage?.candidates,
              );
              const topCandidate = candidates[0] || null;
              const hasRoute = Boolean(
                topCandidate?.player_match_id,
              );

              return (
                <article
                  className={styles.row}
                  key={item.club_need_id}
                  id={`opportunity-${item.club_need_id}`}
                  data-search-match={requestedRecord===String(item.club_need_id)||undefined}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    hasRoute
                      ? openNeedRoute(item, topCandidate)
                      : prepareSearch(item)
                  }
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    hasRoute
                      ? openNeedRoute(item, topCandidate)
                      : prepareSearch(item);
                  }}
                >
                  <div className={styles.icon}>
                    <Target size={16} />
                  </div>

                  <div className={styles.copy}>
                    <span className={styles.rowEyebrow}>Club need</span>
                    <strong>
                      {item.club?.name || 'Club'} ·{' '}
                      {item.need?.title || 'Player need'}
                    </strong>
                    <span>
                      {item.next_action?.instruction ||
                        'Review the recorded need.'}
                    </span>
                    <small>
                      {item.need?.position || 'Position open'}
                      {' · '}
                      {Number(
                        item.candidate_coverage?.recorded_candidates ||
                          0,
                      )}{' '}
                      candidate
                      {Number(
                        item.candidate_coverage?.recorded_candidates ||
                          0,
                      ) === 1
                        ? ''
                        : 's'}
                      {topCandidate?.player_name
                        ? ` · Best route: ${topCandidate.player_name}`
                        : ''}
                    </small>

                    <ConnectedOpportunityContext
                      context={needConnected.get(
                        String(item.club_need_id),
                      )}
                    />
                  </div>

                  <div className={styles.rowActions}>
                    <EntityActionsMenu
                      kind="club_need"
                      entityId={String(item.club_need_id)}
                      label={`${item.club?.name || 'Club'} · ${item.need?.title || 'Player need'}`}
                      rpc={rpc}
                      onChanged={refreshEntities}
                      fields={[
                        { key: 'title', label: 'Need title', value: item.need?.title },
                        { key: 'position', label: 'Position', value: item.need?.position },
                        { key: 'profile_notes', label: 'Profile notes', value: item.need?.profile_notes, type: 'textarea' },
                        { key: 'expires_at', label: 'Expires', value: item.need?.expires_at ? String(item.need.expires_at).slice(0, 10) : '', type: 'date' },
                      ]}
                    />
                    <button
                      type="button"
                      data-ui-button="nav"
                      className={styles.action}
                      onClick={(event) => {
                        event.stopPropagation();
                        hasRoute
                          ? openNeedRoute(item, topCandidate)
                          : prepareSearch(item);
                      }}
                    >
                      {hasRoute ? 'Open route' : 'Start search'}
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </article>
              );
            })
          : null}

        {view === 'routes'
          ? filteredRoutes.map((item: any) => {
              const accessMode =
                item.access_strategy?.recommended_mode ||
                item.best_access_route?.route_state ||
                'recorded_route';

              const nextAction =
                item.career_strategy_gate?.next_action
                  ?.instruction ||
                item.best_access_route?.why_this_route ||
                'Review the pursuit evidence.';

              return (
                <article
                  className={styles.row}
                  key={item.player_match_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openRoute(item)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    openRoute(item);
                  }}
                >
                  <div className={styles.icon}>
                    <Users size={16} />
                  </div>

                  <div className={styles.copy}>
                    <span className={styles.rowEyebrow}>Player route</span>
                    <strong>
                      {item.player?.name || 'Player'} →{' '}
                      {item.club?.name || 'Club'}
                    </strong>
                    <span>{nextAction}</span>
                    <small>
                      {careerGateLabel(
                        item.career_strategy_gate?.state,
                      )}
                      {' · '}
                      {item.best_access_route?.person_name ||
                        human(accessMode)}
                    </small>

                    <ConnectedOpportunityContext
                      context={routeConnected.get(
                        String(item.player_match_id),
                      )}
                    />
                  </div>

                  <button
                    type="button"
                    data-ui-button="nav"
              className={styles.action}
                    onClick={(event) => {
                      event.stopPropagation();
                      openRoute(item);
                    }}
                  >
                    Open pursuit
                    <ChevronRight size={18} />
                  </button>
                </article>
              );
            })
          : null}

        {view === 'deals'
          ? filteredDeals.map((deal: any) => {
              const controlInstruction =
                deal.next_control_fix?.instruction || '';

              const nextMove =
                controlInstruction ||
                deal.next_best_move?.instruction ||
                deal.next_decision ||
                'Review the deal.';

              const hasExpectedCommission =
                deal.expected_commission !== null &&
                deal.expected_commission !== undefined &&
                deal.expected_commission !== '' &&
                Number.isFinite(
                  Number(deal.expected_commission),
                );

              const commissionValue =
                hasExpectedCommission && deal.currency
                  ? money(
                      deal.expected_commission,
                      deal.currency,
                    )
                  : 'Commission not recorded';

              return (
                <article
                  className={styles.row}
                  key={deal.deal_room_id}
                  id={`opportunity-${deal.deal_room_id}`}
                  data-search-match={requestedRecord===String(deal.deal_room_id)||undefined}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleDeal(deal)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    handleDeal(deal);
                  }}
                >
                  <div className={styles.icon}>
                    <BriefcaseBusiness size={16} />
                  </div>

                  <div className={styles.copy}>
                    <span className={styles.rowEyebrow}>Live deal</span>
                    <strong>
                      {deal.title || 'Live deal'}
                    </strong>
                    <span>{nextMove}</span>
                    <small>
                      {human(deal.stage || 'recorded')}
                      {' · '}
                      {deal.organisation || 'Club'}
                      {' · '}
                      {commissionValue}
                    </small>

                    <ConnectedOpportunityContext
                      context={dealConnected.get(
                        String(deal.deal_room_id),
                      )}
                    />
                  </div>

                  <div className={styles.rowActions}>
                    <EntityActionsMenu
                      kind="deal_room"
                      entityId={String(deal.deal_room_id)}
                      label={deal.title || 'Live deal'}
                      rpc={rpc}
                      onChanged={refreshEntities}
                      fields={[
                        { key: 'title', label: 'Deal title', value: deal.title },
                        { key: 'next_action_text', label: 'Next action', value: deal.next_action_text || deal.next_decision || '', type: 'textarea' },
                      ]}
                    />
                    <button
                      type="button"
                      data-ui-button="nav"
                      className={
                        controlInstruction
                          ? styles.actionAttention
                          : styles.action
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeal(deal);
                      }}
                    >
                      {controlInstruction
                        ? /owner|ownership/i.test(
                            controlInstruction,
                          )
                          ? 'Assign owner'
                          : 'Fix now'
                        : 'Open deal'}
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </article>
              );
            })
          : null}

        {readState !== 'ready' ? (
          <div className={styles.empty} role="status">
            <strong>{readState === 'error' ? 'This view could not be updated' : 'Loading opportunities...'}</strong>
            <span>{readState === 'error' ? 'Your recorded work is safe. Try loading it again.' : 'Checking the latest recorded work.'}</span>
            {readState === 'error' && onRetry ? <button type="button" className={styles.tab} onClick={onRetry}>Try again</button> : null}
          </div>
        ) : null}

        {!activeItems.length && readState === 'ready' ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              {view === 'needs' ? (
                <Target size={22} />
              ) : view === 'routes' ? (
                <Users size={22} />
              ) : (
                <BriefcaseBusiness size={22} />
              )}
            </div>
            <strong>
              {search
                ? 'No matches'
                : view === 'needs'
                  ? 'No active club needs'
                  : view === 'routes'
                    ? 'No player routes yet'
                    : 'No live deals'}
            </strong>
            <span>
              {search
                ? 'Try a different search.'
                : view === 'needs'
                  ? 'Add a real club need and the player routes around it can be organised here.'
                  : view === 'routes'
                    ? 'Routes appear when a player is linked to a recorded club need.'
                    : 'Commercial work appears here once a player-club route becomes a live deal.'}
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
