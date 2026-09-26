'use client';

import {
  ArrowRight,
  BriefcaseBusiness,
  Search,
  Target,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import type { AgencyIntelligenceRequest } from '@/components/AgencyEntityIntelligenceDrawer';
import type { AgencyPursuitRequest } from '@/components/AgencyPursuitRoom';
import { relativeDate } from '@/lib/platform-client';

import styles from './AgencyOpportunitiesWorkspace.module.css';

type OpportunityView = 'needs' | 'routes' | 'deals';

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

export default function AgencyOpportunitiesWorkspace({
  data,
  onOpenAction,
  onOpenPursuit,
  onOpenIntelligence,
}: {
  data: any;
  onOpenAction: (request: AgencyActionRequest) => void;
  onOpenPursuit: (request: AgencyPursuitRequest) => void;
  onOpenIntelligence: (request: AgencyIntelligenceRequest) => void;
}) {
  const [view, setView] = useState<OpportunityView>('needs');
  const [search, setSearch] = useState('');

  const needs = list(data?.market?.demand?.items);
  const routes = list(data?.market?.pursuits?.items);
  const deals = list(data?.deals?.portfolio?.deals);

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
            onClick={() => {
              setView('needs');
              setSearch('');
            }}
          >
            <Target size={15} />
            Needs
            <span>{needs.length}</span>
          </button>

          <button
            type="button"
            className={view === 'routes' ? styles.tabActive : styles.tab}
            onClick={() => {
              setView('routes');
              setSearch('');
            }}
          >
            <Users size={15} />
            Player routes
            <span>{routes.length}</span>
          </button>

          <button
            type="button"
            className={view === 'deals' ? styles.tabActive : styles.tab}
            onClick={() => {
              setView('deals');
              setSearch('');
            }}
          >
            <BriefcaseBusiness size={15} />
            Live deals
            <span>{deals.length}</span>
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
            <button
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
                >
                  <div className={styles.icon}>
                    <Target size={16} />
                  </div>

                  <div className={styles.copy}>
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
                  </div>

                  <button
                    type="button"
                    className={styles.action}
                    onClick={() =>
                      hasRoute
                        ? openNeedRoute(item, topCandidate)
                        : prepareSearch(item)
                    }
                  >
                    {hasRoute ? 'Open route' : 'Start search'}
                    <ArrowRight size={14} />
                  </button>
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
                >
                  <div className={styles.icon}>
                    <Users size={16} />
                  </div>

                  <div className={styles.copy}>
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
                  </div>

                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => openRoute(item)}
                  >
                    Open pursuit
                    <ArrowRight size={14} />
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
                >
                  <div className={styles.icon}>
                    <BriefcaseBusiness size={16} />
                  </div>

                  <div className={styles.copy}>
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
                  </div>

                  <button
                    type="button"
                    className={
                      controlInstruction
                        ? styles.actionAttention
                        : styles.action
                    }
                    onClick={() => handleDeal(deal)}
                  >
                    {controlInstruction
                      ? /owner|ownership/i.test(
                          controlInstruction,
                        )
                        ? 'Assign owner'
                        : 'Fix now'
                      : 'Open deal'}
                    <ArrowRight size={14} />
                  </button>
                </article>
              );
            })
          : null}

        {!activeItems.length ? (
          <div className={styles.empty}>
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
                : 'New opportunity work will appear here when it is recorded.'}
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
