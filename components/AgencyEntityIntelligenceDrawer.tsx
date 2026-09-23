'use client';

import {
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
}: {
  request: AgencyIntelligenceRequest;
  invoke: Invoke;
  onClose: () => void;
  onOpenAction: (request: AgencyActionRequest) => void;
}) {
  const [busy, setBusy] = useState(true);
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

          const [service, alignment, proof] =
            await Promise.all([
              invoke('player_service_card', payload),
              invoke('career_alignment', payload),
              invoke('player_value_proof', payload),
            ]);

          if (active) {
            setData({
              service: unwrap(service),
              alignment: unwrap(alignment),
              proof: unwrap(proof),
            });
          }
        } else {
          const response = await invoke('deal_war_room', {
            deal_room_id: request.entityId,
          });

          if (active) {
            setData({ warRoom: unwrap(response) });
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
  }, [invoke, request.entityId, request.kind]);

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

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className={styles.drawer} role="dialog" aria-modal="true">
        <header className={styles.header}>
          <div className={styles.topline}>
            <span className={styles.live}><i />Live agency evidence</span>
            <button type="button" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className={styles.title}>
            <div className={styles.mark}>
              {request.kind === 'player'
                ? <Search size={18} />
                : <BriefcaseBusiness size={18} />}
            </div>
            <div>
              <p>{request.kind === 'player' ? 'PLAYER 360' : 'DEAL WAR ROOM'}</p>
              <h2>{request.title}</h2>
              {request.context ? <span>{request.context}</span> : null}
            </div>
          </div>
        </header>

        {busy ? (
          <div className={styles.state}>
            <LoaderCircle size={20} className={styles.spin} />
            <div>
              <strong>Building the current operating picture</strong>
              <span>Pulling the latest recorded agency evidence.</span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className={styles.state}>
            <CircleAlert size={19} />
            <div>
              <strong>Intelligence unavailable</strong>
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        {!busy && !error && request.kind === 'player' ? (
          <div className={styles.content}>
            <section className={styles.hero}>
              <div>
                <p>SERVICE POSITION</p>
                <h3>{human(serviceControl.state || 'recorded')}</h3>
                <span>
                  {service.next_service_move?.instruction ||
                    player.next_action ||
                    'No next service move recorded.'}
                </span>
              </div>
              <div className={styles.score}>
                <strong>{numeric(serviceControl.score)}</strong>
                <span>service control</span>
              </div>
            </section>

            <div className={styles.grid}>
              <Fact
                label="Market coverage"
                value={human(service.market_coverage?.state || 'not recorded')}
                detail={`${numeric(service.market_coverage?.active_deals, '0')} active deal(s)`}
              />
              <Fact
                label="Career control"
                value={human(alignment.alignment_state || 'not recorded')}
                detail={
                  alignment.attention_score !== undefined
                    ? `${numeric(alignment.attention_score)} attention score`
                    : null
                }
              />
              <Fact
                label="Contract"
                value={human(player.contract_status || 'not recorded')}
                detail={
                  player.contract_expiry
                    ? relativeDate(player.contract_expiry)
                    : 'No expiry recorded'
                }
              />
              <Fact
                label="Recorded value"
                value={human(proof.proof_state || 'not recorded')}
                detail={`${numeric(proof.market_work?.club_processes_opened, '0')} club process(es) opened`}
              />
            </div>

            <section className={styles.panel}>
              <p>CAREER PLAN</p>
              <h3>{alignment.strategy?.objective || 'No recorded objective'}</h3>
              <div className={styles.grid}>
                <Fact
                  label="Next checkpoint"
                  value={alignment.strategy?.next_checkpoint || 'Not recorded'}
                />
                <Fact
                  label="Target markets"
                  value={compact(alignment.strategy?.target_markets)}
                />
                <Fact
                  label="Alignment"
                  value={human(alignment.alignment_state || 'not recorded')}
                />
                <Fact
                  label="Market state"
                  value={human(alignment.market_coverage?.state || 'not recorded')}
                />
              </div>
            </section>

            <div className={styles.actions}>
              {service.next_control_fix?.instruction ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenAction({
                      key: `player-360-control:${request.entityId}`,
                      eyebrow: 'PLAYER CONTROL',
                      title: request.title,
                      instruction: service.next_control_fix.instruction,
                      label: 'Fix player control',
                      action: 'player_control_fix_prepare',
                      payload: { player_id: request.entityId },
                      context: human(serviceControl.state),
                      successCondition:
                        'The recorded player-control gap is resolved.',
                    })
                  }
                >
                  <CheckCircle2 size={15} />
                  Fix player control
                </button>
              ) : null}

              {service.next_service_move?.instruction ? (
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

              {alignment.next_strategy_action?.instruction ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenAction({
                      key: `player-360-career:${request.entityId}`,
                      eyebrow: 'CAREER CONTROL',
                      title: request.title,
                      instruction: alignment.next_strategy_action.instruction,
                      label: 'Review career plan',
                      action: 'career_strategy_action_prepare',
                      payload: { player_id: request.entityId },
                      context: human(alignment.alignment_state),
                      successCondition:
                        'The player-owned career plan is current and usable for market decisions.',
                    })
                  }
                >
                  <Target size={15} />
                  Review career plan
                </button>
              ) : null}
            </div>

            <p className={styles.truth}>
              Player 360 shows recorded agency evidence. It does not infer player intent, satisfaction or transfer outcomes.
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
                value={human(deal.stage || 'not recorded')}
                detail={deal.primary_blocker || 'No blocker recorded'}
              />
              <Fact
                label="Momentum"
                value={human(momentum.state || 'not recorded')}
                detail={
                  momentum.score !== undefined
                    ? `${numeric(momentum.score)} momentum score`
                    : null
                }
              />
              <Fact
                label="Decision pressure"
                value={human(pressure.state || 'not recorded')}
                detail={
                  pressure.observed_days_in_stage !== undefined
                    ? `${numeric(pressure.observed_days_in_stage)} observed days in stage`
                    : null
                }
              />
              <Fact
                label="Negotiation"
                value={human(negotiation.state || 'not recorded')}
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
                      : 'Not recorded'
                  }
                />
                <Fact
                  label="Introduction"
                  value={
                    access.introduction_score !== undefined
                      ? `${numeric(access.introduction_score)}/100`
                      : 'Not recorded'
                  }
                />
                <Fact
                  label="Operating advantage"
                  value={human(advantage.state || 'not recorded')}
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
                        'The recorded deal-control gap is resolved.',
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
              Deal War Room supports judgement from recorded evidence. Scores describe control, preparation and observed movement, not transfer probability or predicted outcome.
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
