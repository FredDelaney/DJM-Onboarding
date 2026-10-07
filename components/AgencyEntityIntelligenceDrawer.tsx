'use client';

import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Search,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import { friendlyError, relativeDate } from '@/lib/platform-client';
import { readWithDeadline } from '@/lib/read-with-deadline';
import styles from './AgencyEntityIntelligenceDrawer.module.css';

export type AgencyIntelligenceRequest = {
  key: string;
  kind: 'player' | 'deal';
  entityId: string;
  title: string;
  context?: string | null;
};

type Invoke = (
  action: string,
  body?: Record<string, unknown>,
) => Promise<any>;

const human = (value: unknown) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const numeric = (value: unknown, fallback = '-') => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? String(Math.round(parsed))
    : fallback;
};

const compact = (value: unknown) =>
  Array.isArray(value) && value.length
    ? value
        .slice(0, 4)
        .map((item) => human(item))
        .join(' · ')
    : 'None recorded';

const unwrap = (response: any) => {
  for (const key of [
    'player_service',
    'career_alignment',
    'value_proof',
    'war_room',
  ]) {
    if (response?.[key] !== undefined) {
      return response[key];
    }
  }
  return response?.result ?? response;
};

function Fact({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className={styles.fact}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export default function AgencyEntityIntelligenceDrawer({
  request,
  invoke,
  onClose,
  onOpenAction,
  onOpenCloseout,
  onOpenNegotiation,
  onOpenPlayerReview,
  presentation = 'drawer',
}: {
  request: AgencyIntelligenceRequest;
  invoke: Invoke;
  onClose: () => void;
  onOpenAction: (request: AgencyActionRequest) => void;
  onOpenCloseout: (
    dealRoomId: string,
    title: string,
    context?: string | null,
  ) => void;
  onOpenNegotiation: (
    dealRoomId: string,
    title: string,
    context?: string | null,
  ) => void;
  onOpenPlayerReview: (
    playerId: string,
    title: string,
    context?: string | null,
  ) => void;
  presentation?: 'drawer' | 'page';
}) {
  const [busy, setBusy] = useState(true);
  const [retry,setRetry]=useState(0);
  const [error, setError] = useState('');
  const [data, setData] = useState<Record<string, any>>({});

  useEffect(() => {
    let active = true;

    const load = async () => {
      setBusy(true);
      setError('');

      try {
        if (request.kind === 'player') {
          const payload = { player_id: request.entityId };
          let intelligence: any = null;

          try {
            const response = await invoke('player_intelligence', payload);
            intelligence = response?.intelligence || null;
          } catch {
            const [service, alignment, proof] = await Promise.all([
              invoke('player_service_card', payload),
              invoke('career_alignment', payload),
              invoke('player_value_proof', payload),
            ]);
            intelligence = {
              service: unwrap(service),
              alignment: unwrap(alignment),
              proof: unwrap(proof),
            };
          }

          if (active) {
            setData({
              service: intelligence?.service || {},
              alignment: intelligence?.alignment || {},
              proof: intelligence?.proof || {},
            });
          }
        } else {
          const response = await readWithDeadline(invoke('deal_war_room', {
            deal_room_id: request.entityId,
          }));
          const warRoom = unwrap(response);
          if (active && (!warRoom?.deal || warRoom?.available === false)) throw new Error('This deal is no longer available in your agency.');
          if (active) {
            setData({ warRoom });
          }
        }
      } catch (loadError) {
        if (active) setError(friendlyError(loadError));
      } finally {
        if (active) setBusy(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [invoke, request.entityId, request.kind, retry]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', keydown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', keydown);
    };
  }, [onClose]);

  const service = data.service || {};
  const player = service.player || {};
  const serviceControl = service.service_control || {};
  const alignment = data.alignment || {};
  const proof = data.proof || {};
  const serviceGaps = Array.isArray(serviceControl.gaps)
    ? serviceControl.gaps
    : [];
  const strategyMissing =
    alignment.strategy_state === 'missing' || !alignment.strategy;
  const serviceNeedsAction = Boolean(service.next_control_fix?.instruction);
  const serviceHeadline = serviceNeedsAction
    ? 'Needs action'
    : strategyMissing
      ? 'Career plan missing'
      : human(serviceControl.state || 'current');
  const serviceInstruction =
    service.next_control_fix?.instruction ||
    alignment.next_strategy_action?.instruction ||
    service.next_service_move?.instruction ||
    player.next_action ||
    'No immediate player-service action is recorded.';
  const marketDeals = Number(service.market_coverage?.active_deals || 0);
  const marketOpportunities = Number(
    service.market_coverage?.active_player_opportunities || 0,
  );
  const marketMatches = Number(
    service.market_coverage?.recorded_market_matches || 0,
  );
  const marketActivity = marketDeals + marketOpportunities + marketMatches;
  const serviceDelivery = proof.service_delivery || {};
  const recordedServiceActions = [
    serviceDelivery.agency_work_completed,
    serviceDelivery.player_requests_resolved,
    serviceDelivery.career_strategy_approvals,
    serviceDelivery.career_strategy_confirmations,
    serviceDelivery.career_strategy_versions_created,
  ].reduce((total, value) => total + Number(value || 0), 0);
  const recordedMarketProcesses = Number(
    proof.market_work?.club_processes_opened || 0,
  );

  const warRoom = data.warRoom || {};
  const deal = warRoom.deal || {};
  const control = warRoom.control || {};
  const momentum = warRoom.momentum || {};
  const access = warRoom.access || {};
  const negotiation = warRoom.negotiation || {};
  const advantage = warRoom.deal_advantage || {};
  const pressure = warRoom.decision_pressure || {};
  const bestIntro = access.best_introduction_route || {};
  const nextMove = warRoom.next_best_move || {};
  const controlFix = warRoom.next_control_fix || {};

  const pageMode = presentation === 'page';

  return (
    <div
      className={pageMode ? styles.pageShell : styles.backdrop}
      onClick={pageMode ? undefined : (event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className={`${styles.drawer} ${pageMode ? styles.pagePanel : ''}`} role={pageMode ? 'region' : 'dialog'} aria-modal={pageMode ? undefined : true}>
        <header className={styles.header}>
          <div className={styles.topline}>
            <span className={styles.live}><i />Live agency evidence</span>
            <button type="button" onClick={onClose} aria-label={pageMode ? 'Back' : 'Close'}>
              {pageMode ? <ArrowLeft size={18} /> : <X size={18} />}
            </button>
          </div>

          <div className={styles.title}>
            <div className={styles.mark}>
              {request.kind === 'player'
                ? <Search size={18} />
                : <BriefcaseBusiness size={18} />}
            </div>
            <div>
              <p>{request.kind === 'player' ? 'PLAYER INTELLIGENCE' : 'DEAL WAR ROOM'}</p>
              <h2>{request.kind==='deal' ? deal.title || request.title : request.title}</h2>
              {request.context ? <span>{request.context}</span> : null}
            </div>
          </div>
        </header>

        {busy ? (
          <div className={styles.state}>
            <LoaderCircle size={20} className={styles.spin} />
            <div>
              <strong>Building the current operating picture</strong>
              <span>Pulling the latest agency information.</span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className={styles.state} role="alert">
            <CircleAlert size={19} />
            <div>
              <strong>Intelligence unavailable</strong>
              <span>{error}</span>
              <button type="button" className="btn" onClick={()=>setRetry(value=>value+1)}>Try again</button>
            </div>
          </div>
        ) : null}

        {!busy && !error && request.kind === 'player' ? (
          <div className={styles.content}>
            <section className={styles.hero}>
              <div>
                <p>NEXT PLAYER CONTROL</p>
                <h3>{serviceHeadline}</h3>
                <span>{serviceInstruction}</span>
              </div>
              <div className={styles.score}>
                <strong>{serviceGaps.length}</strong>
                <span>{serviceGaps.length === 1 ? 'control gap' : 'control gaps'}</span>
              </div>
            </section>

            <div className={styles.grid}>
              <Fact
                label="Market activity"
                value={marketActivity ? `${marketActivity} active record${marketActivity === 1 ? '' : 's'}` : 'No active market process'}
                detail={marketActivity
                  ? `${marketDeals} deal${marketDeals === 1 ? '' : 's'} · ${marketOpportunities} opportunit${marketOpportunities === 1 ? 'y' : 'ies'} · ${marketMatches} match${marketMatches === 1 ? '' : 'es'}`
                  : 'No recorded active deals, opportunities or market matches.'}
              />
              <Fact
                label="Career plan"
                value={strategyMissing ? 'Not set' : human(alignment.alignment_state || 'current')}
                detail={strategyMissing
                  ? 'Objective, target markets and next checkpoint still need to be agreed.'
                  : alignment.review_due_at
                    ? `Review ${relativeDate(alignment.review_due_at)}`
                    : 'Career strategy is recorded.'}
              />
              <Fact
                label="Contract"
                value={human(player.contract_status || 'Not set')}
                detail={
                  player.contract_expiry
                    ? `Expires ${relativeDate(player.contract_expiry)}`
                    : 'No expiry recorded'
                }
              />
              <Fact
                label="Recorded service"
                value={recordedServiceActions
                  ? `${recordedServiceActions} action${recordedServiceActions === 1 ? '' : 's'} recorded`
                  : 'No service activity recorded'}
                detail={recordedMarketProcesses
                  ? `${recordedMarketProcesses} club process${recordedMarketProcesses === 1 ? '' : 'es'} opened in this window.`
                  : 'No club process opened in the current proof window.'}
              />
            </div>

            <section className={styles.panel}>
              <p>CAREER PLAN</p>
              <h3>{alignment.strategy?.objective || 'Career plan not set'}</h3>
              {alignment.strategy ? (
                <div className={styles.grid}>
                  <Fact
                    label="Next checkpoint"
                    value={alignment.strategy?.next_checkpoint || 'Not set'}
                  />
                  <Fact
                    label="Target markets"
                    value={compact(alignment.strategy?.target_markets)}
                  />
                  <Fact
                    label="Alignment"
                    value={human(alignment.alignment_state || 'not set')}
                  />
                  <Fact
                    label="Market state"
                    value={human(alignment.market_coverage?.state || 'not set')}
                  />
                </div>
              ) : (
                <div className={styles.planEmpty}>
                  <strong>Define this with the player.</strong>
                  <span>Record the objective, target markets and next checkpoint once they are agreed.</span>
                </div>
              )}
            </section>

            <div className={styles.actions}>
              {service.next_control_fix?.instruction ? (
                <button
                  type="button"
                  onClick={() => {
                    const label = service.next_control_fix?.fix_type === 'set_player_next_action'
                      ? 'Set next action'
                      : 'Fix player control';
                    onOpenAction({
                      key: `player-360-control:${request.entityId}`,
                      eyebrow: 'PLAYER CONTROL',
                      title: request.title,
                      instruction: service.next_control_fix.instruction,
                      label,
                      action: 'player_control_fix_prepare',
                      payload: { player_id: request.entityId },
                      context: human(serviceControl.state),
                      successCondition:
                        'The player issue is resolved.',
                    });
                  }}
                >
                  <CheckCircle2 size={15} />
                  {service.next_control_fix?.fix_type === 'set_player_next_action'
                    ? 'Set next action'
                    : 'Fix player control'}
                </button>
              ) : null}

              {alignment.next_strategy_action?.instruction ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenAction({
                      key: `player-360-career:${request.entityId}`,
                      eyebrow: 'CAREER CONTROL',
                      title: request.title,
                      instruction: alignment.next_strategy_action.instruction,
                      label: strategyMissing ? 'Build career plan' : 'Review career plan',
                      action: 'career_strategy_action_prepare',
                      payload: { player_id: request.entityId },
                      context: human(alignment.alignment_state),
                      successCondition:
                        'The player-owned career plan is current and usable for market decisions.',
                    })
                  }
                >
                  <Target size={15} />
                  {strategyMissing ? 'Build career plan' : 'Review career plan'}
                </button>
              ) : null}

              {!service.next_control_fix?.instruction &&
              !alignment.next_strategy_action?.instruction &&
              service.next_service_move?.instruction ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenAction({
                      key: `player-360-service:${request.entityId}`,
                      eyebrow: 'PLAYER SERVICE',
                      title: request.title,
                      instruction: service.next_service_move.instruction,
                      label: 'Prepare service move',
                      action: 'player_service_move_prepare',
                      payload: { player_id: request.entityId },
                      context: human(serviceControl.state),
                      successCondition:
                        service.next_service_move.success_condition ||
                        'The player action is completed and the next step is recorded.',
                    })
                  }
                >
                  <ArrowRight size={15} />
                  Prepare service move
                </button>
              ) : null}

              <button
                type="button"
                onClick={() =>
                  onOpenPlayerReview(
                    request.entityId,
                    request.title,
                    request.context,
                  )
                }
              >
                <ShieldCheck size={15} />
                Service review
              </button>
            </div>

            <p className={styles.truth}>
              Player Intelligence shows known agency information and the next issue to resolve. It does not guess player intent, satisfaction or transfer outcomes.
            </p>
          </div>
        ) : null}

        {!busy && !error && request.kind === 'deal' ? (
          <div className={styles.content}>
            <section className={styles.hero}>
              <div>
                <p>CURRENT CONTROL POSITION</p>
                <h3>{human(control.state || momentum.state || 'recorded')}</h3>
                <span>
                  {nextMove.instruction ||
                    deal.next_decision ||
                    'Review the live deal and define the next decision.'}
                </span>
              </div>
              <div className={styles.score}>
                <strong>{numeric(control.score)}</strong>
                <span>deal control</span>
              </div>
            </section>

            <div className={styles.grid}>
              <Fact
                label="Stage"
                value={human(deal.stage || 'not set')}
                detail={deal.primary_blocker || 'No blocker'}
              />
              <Fact
                label="Momentum"
                value={human(momentum.state || 'not set')}
                detail={
                  momentum.score !== undefined
                    ? `${numeric(momentum.score)} momentum score`
                    : null
                }
              />
              <Fact
                label="Decision pressure"
                value={human(pressure.state || 'not set')}
                detail={
                  pressure.observed_days_in_stage !== undefined
                    ? `${numeric(pressure.observed_days_in_stage)} observed days in stage`
                    : null
                }
              />
              <Fact
                label="Negotiation"
                value={human(negotiation.state || 'not set')}
                detail={
                  negotiation.score !== undefined
                    ? `${numeric(negotiation.score)} preparation score`
                    : null
                }
              />
            </div>

            <section className={styles.panel}>
              <p>ACCESS + ADVANTAGE</p>
              <h3>
                {bestIntro.recommended_action ||
                  'No stronger recorded access move is available.'}
              </h3>
              <div className={styles.grid}>
                <Fact
                  label="Direct access"
                  value={
                    access.direct_score !== undefined
                      ? `${numeric(access.direct_score)}/100`
                      : 'Not set'
                  }
                />
                <Fact
                  label="Introduction"
                  value={
                    access.introduction_score !== undefined
                      ? `${numeric(access.introduction_score)}/100`
                      : 'Not set'
                  }
                />
                <Fact
                  label="Operating advantage"
                  value={human(advantage.state || 'not set')}
                  detail={
                    advantage.score !== undefined
                      ? `${numeric(advantage.score)} operating score`
                      : null
                  }
                />
                <Fact
                  label="Exposures"
                  value={compact(advantage.exposures)}
                />
              </div>
            </section>

            <div className={styles.actions}>
              {controlFix.instruction ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenAction({
                      key: `war-room-control:${request.entityId}`,
                      eyebrow: 'DEAL CONTROL',
                      title: request.title,
                      instruction: controlFix.instruction,
                      label: 'Fix deal control',
                      action: 'deal_control_fix_prepare',
                      payload: { deal_room_id: request.entityId },
                      context: human(control.state),
                      successCondition:
                        'No deal issue needs attention.',
                    })
                  }
                >
                  <CheckCircle2 size={15} />
                  Fix deal control
                </button>
              ) : null}

              {nextMove.instruction ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenAction({
                      key: `war-room-next:${request.entityId}`,
                      eyebrow: 'DEAL NEXT MOVE',
                      title: request.title,
                      instruction: nextMove.instruction,
                      label: 'Prepare next move',
                      action: 'deal_next_move_prepare',
                      payload: { deal_room_id: request.entityId },
                      context: human(deal.stage),
                      successCondition:
                        'A decision-producing next move is recorded against the live deal.',
                    })
                  }
                >
                  <ArrowRight size={15} />
                  Prepare next move
                </button>
              ) : null}

              <button
                type="button"
                onClick={() =>
                  onOpenNegotiation(
                    request.entityId,
                    request.title,
                    request.context,
                  )
                }
              >
                <ShieldCheck size={15} />
                Negotiation room
              </button>

              <button
                type="button"
                onClick={() =>
                  onOpenCloseout(
                    request.entityId,
                    request.title,
                    request.context,
                  )
                }
              >
                <BriefcaseBusiness size={15} />
                Closeout & commission
              </button>

              {negotiation.next_step?.instruction ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenAction({
                      key: `war-room-negotiation:${request.entityId}`,
                      eyebrow: 'NEGOTIATION PREPARATION',
                      title: request.title,
                      instruction: negotiation.next_step.instruction,
                      label: 'Prepare negotiation step',
                      action: 'negotiation_next_step_prepare',
                      payload: { deal_room_id: request.entityId },
                      context: human(negotiation.state),
                      successCondition:
                        negotiation.next_step.success_condition ||
                        'The blocking preparation gap is resolved or explicitly recorded.',
                    })
                  }
                >
                  <ShieldCheck size={15} />
                  Prepare negotiation step
                </button>
              ) : null}
            </div>

            <p className={styles.truth}>
              Deal War Room supports judgement from known information. Scores describe control, preparation and observed movement, not transfer probability or predicted outcome.
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
