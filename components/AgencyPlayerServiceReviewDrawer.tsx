'use client';

import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  History,
  LoaderCircle,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import { friendlyError, relativeDate } from '@/lib/platform-client';
import styles from './AgencyPlayerServiceReviewDrawer.module.css';

export type AgencyPlayerServiceReviewRequest = {
  key: string;
  playerId: string;
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

const list = (value: unknown): any[] =>
  Array.isArray(value) ? value : [];

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.round(parsed)) : '0';
};

const prettyDate = (value: unknown) => {
  if (!value) return 'Not recorded';

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
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

const deltaLabel: Record<string, string> = {
  agency_work_completed: 'Agency work completed',
  player_requests_resolved: 'Player requests resolved',
  career_strategy_versions_created: 'Career-plan versions',
  career_strategy_confirmations: 'Career confirmations',
  career_strategy_approvals: 'Career approvals',
  market_matches_added: 'Market matches added',
  opportunities_opened: 'Opportunities opened',
  club_processes_opened: 'Club processes opened',
  recorded_deal_stage_advances: 'Deal stage advances',
  recorded_deals_won: 'Recorded deals won',
};

export default function AgencyPlayerServiceReviewDrawer({
  request,
  invoke,
  onClose,
  onOpenAction,
  onApplied,
}: {
  request: AgencyPlayerServiceReviewRequest;
  invoke: Invoke;
  onClose: () => void;
  onOpenAction: (request: AgencyActionRequest) => void;
  onApplied: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(true);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [reviewPack, setReviewPack] = useState<any>(null);
  const [statement, setStatement] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [delta, setDelta] = useState<any>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');

    try {
      const [
        packResult,
        statementResult,
        historyResult,
        deltaResult,
      ] = await Promise.all([
        invoke('player_review_pack', {
          player_id: request.playerId,
          proof_window_days: 30,
          deadline_horizon_days: 90,
        }),
        invoke('player_service_statement', {
          player_id: request.playerId,
        }),
        invoke('player_value_proof_history', {
          player_id: request.playerId,
          limit: 12,
        }),
        invoke('player_value_proof_delta', {
          player_id: request.playerId,
        }),
      ]);

      setReviewPack(packResult?.review_pack || null);
      setStatement(statementResult?.statement || null);
      setHistory(historyResult?.history || null);
      setDelta(deltaResult?.delta || null);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, [invoke, request.playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !captureBusy) onClose();
    };

    window.addEventListener('keydown', keydown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', keydown);
    };
  }, [captureBusy, onClose]);

  const proof = reviewPack?.value_proof || {};
  const meeting = reviewPack?.meeting_focus || {};
  const alignment = reviewPack?.career_alignment || {};
  const serviceRelationship =
    reviewPack?.service_and_relationship_control || {};
  const deadlines = list(reviewPack?.upcoming_recorded_deadlines);
  const timeline = list(proof?.timeline);
  const snapshots = list(history?.snapshots);
  const privacyExcluded = list(statement?.privacy_contract?.excluded);

  const serviceDelivery = proof?.service_delivery || {};
  const marketWork = proof?.market_work || {};

  const latestSnapshot = snapshots[0] || null;
  const comparable = delta?.status === 'comparable';
  const deltaRows = useMemo(() => {
    const metrics = delta?.metric_deltas;
    if (!metrics || typeof metrics !== 'object') return [];

    return Object.entries(metrics)
      .map(([key, value]: [string, any]) => ({
        key,
        label: deltaLabel[key] || human(key),
        from: Number(value?.from || 0),
        to: Number(value?.to || 0),
        delta: Number(value?.delta || 0),
      }))
      .filter((item) => item.from !== 0 || item.to !== 0 || item.delta !== 0);
  }, [delta]);

  const captureSnapshot = async () => {
    if (captureBusy) return;

    setCaptureBusy(true);
    setError('');
    setMessage('');

    try {
      await invoke('player_value_proof_capture', {
        player_id: request.playerId,
        window_days: 30,
      });

      setMessage(
        'The current 30-day player-safe proof was captured as a point-in-time snapshot.',
      );

      await onApplied();
      await load();
    } catch (captureError) {
      setError(friendlyError(captureError));
    } finally {
      setCaptureBusy(false);
    }
  };

  const prepareServiceMove = () => {
    const firstBreach =
      serviceRelationship?.service_control?.first_breach;

    onOpenAction({
      key: `player-review-service:${request.playerId}`,
      eyebrow: 'PLAYER SERVICE',
      title: request.title,
      instruction:
        firstBreach?.required_action ||
        meeting?.nearest_deadline?.next_action?.instruction ||
        'Review the player service position and record the next accountable action.',
      label: 'Prepare service move',
      action: 'player_service_move_prepare',
      payload: {
        player_id: request.playerId,
      },
      context: human(
        meeting?.service_control_state ||
          serviceRelationship?.service_control?.state ||
          'recorded',
      ),
      facts: [
        {
          label: 'Service state',
          value: human(
            meeting?.service_control_state ||
              serviceRelationship?.service_control?.state ||
              'recorded',
          ),
        },
        {
          label: 'Nearest deadline',
          value:
            meeting?.nearest_deadline?.title ||
            'No deadline recorded',
          detail: meeting?.nearest_deadline?.deadline_at
            ? prettyDate(meeting.nearest_deadline.deadline_at)
            : null,
        },
        {
          label: 'Recorded proof',
          value: human(proof?.proof_state || 'not recorded'),
          detail: 'Evidence of recorded work, not player satisfaction',
        },
      ],
      successCondition:
        'The player service gap is resolved or the next accountable action is explicitly reset.',
      confirmationLabel: 'Prepare service action',
    });
  };

  const reviewCareerPlan = () => {
    onOpenAction({
      key: `player-review-career:${request.playerId}`,
      eyebrow: 'CAREER CONTROL',
      title: request.title,
      instruction:
        alignment?.next_strategy_action?.instruction ||
        alignment?.strategy?.next_checkpoint ||
        'Review the player-owned career plan with current recorded evidence.',
      label: 'Review career plan',
      action: 'career_strategy_action_prepare',
      payload: {
        player_id: request.playerId,
      },
      context: human(
        alignment?.alignment_state ||
          alignment?.strategy_state ||
          'recorded',
      ),
      facts: [
        {
          label: 'Career state',
          value: human(
            alignment?.alignment_state ||
              alignment?.strategy_state ||
              'recorded',
          ),
        },
        {
          label: 'Player confirmation',
          value: human(
            alignment?.confirmation_state ||
              statement?.career_plan?.player_confirmation ||
              'not recorded',
          ),
        },
        {
          label: 'Review due',
          value: prettyDate(alignment?.review_due_at),
        },
      ],
      successCondition:
        'The player-owned career plan is current, explicitly confirmed where required and usable for market decisions.',
      confirmationLabel: 'Prepare career review',
    });
  };

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget && !captureBusy) {
          onClose();
        }
      }}
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Player Service Review"
      >
        <header className={styles.header}>
          <div className={styles.topline}>
            <span className={styles.live}>
              <i />
              Recorded player-service evidence
            </span>

            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              disabled={captureBusy}
              aria-label="Close Player Service Review"
            >
              <X size={18} />
            </button>
          </div>

          <p className={styles.eyebrow}>PLAYER SERVICE REVIEW</p>
          <h2>{request.title}</h2>
          <p className={styles.subhead}>
            {request.context ||
              'Prepare a factual player review from service delivery, career control, market work and recorded deadlines.'}
          </p>
        </header>

        {busy ? (
          <div className={styles.notice}>
            <LoaderCircle size={18} className={styles.spin} />
            <div>
              <strong>Preparing the player review</strong>
              <span>
                Loading the service statement, review pack and persisted proof history.
              </span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className={`${styles.notice} ${styles.error}`}>
            <CircleAlert size={18} />
            <div>
              <strong>Player review needs attention</strong>
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        {message ? (
          <div className={`${styles.notice} ${styles.success}`}>
            <CheckCircle2 size={18} />
            <div>
              <strong>Recorded</strong>
              <span>{message}</span>
            </div>
          </div>
        ) : null}

        {!busy && !error ? (
          <div className={styles.content}>
            <section className={styles.hero}>
              <div>
                <p>MEETING POSITION</p>
                <h3>
                  {human(
                    meeting?.relationship_control_state ||
                      meeting?.service_control_state ||
                      proof?.proof_state ||
                      'recorded',
                  )}
                </h3>
                <span>
                  {meeting?.nearest_deadline?.title ||
                    statement?.service_plan?.next_action ||
                    'Review the recorded service position with the player.'}
                </span>
              </div>

              <div className={styles.heroSide}>
                <CalendarClock size={18} />
                <strong>
                  {meeting?.nearest_deadline?.deadline_at
                    ? prettyDate(meeting.nearest_deadline.deadline_at)
                    : 'No date'}
                </strong>
                <span>nearest recorded deadline</span>
              </div>
            </section>

            <div className={styles.grid}>
              <Fact
                label="Service control"
                value={human(
                  meeting?.service_control_state ||
                    serviceRelationship?.service_control?.state ||
                    'not recorded',
                )}
                detail={`${num(
                  serviceRelationship?.service_control?.high_breach_count,
                )} high-priority gap(s)`}
              />
              <Fact
                label="Career alignment"
                value={human(
                  meeting?.career_alignment_state ||
                    alignment?.alignment_state ||
                    'not recorded',
                )}
                detail={
                  alignment?.review_due_at
                    ? `Review ${prettyDate(alignment.review_due_at)}`
                    : null
                }
              />
              <Fact
                label="Recorded value"
                value={human(
                  meeting?.value_proof_state ||
                    proof?.proof_state ||
                    'not recorded',
                )}
                detail="Recorded activity, not service quality or satisfaction"
              />
              <Fact
                label="Proof history"
                value={`${snapshots.length} snapshot(s)`}
                detail={
                  latestSnapshot?.snapshot_date
                    ? `Latest ${prettyDate(latestSnapshot.snapshot_date)}`
                    : 'No persisted baseline yet'
                }
              />
            </div>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <CheckCircle2 size={17} />
                <div>
                  <p>WHAT THE AGENCY ACTUALLY DID</p>
                  <h3>Recorded service and market work in the last 30 days</h3>
                </div>
              </div>

              <div className={styles.grid}>
                <Fact
                  label="Agency work completed"
                  value={num(serviceDelivery.agency_work_completed)}
                />
                <Fact
                  label="Player requests resolved"
                  value={num(serviceDelivery.player_requests_resolved)}
                />
                <Fact
                  label="Club processes opened"
                  value={num(marketWork.club_processes_opened)}
                />
                <Fact
                  label="Deal stages advanced"
                  value={num(marketWork.recorded_deal_stage_advances)}
                />
                <Fact
                  label="Market matches added"
                  value={num(marketWork.market_matches_added)}
                />
                <Fact
                  label="Recorded deals won"
                  value={num(marketWork.recorded_deals_won)}
                />
              </div>

              <div className={styles.timeline}>
                {timeline.slice(0, 8).map((item: any, index: number) => (
                  <article
                    key={`${item.at || index}:${item.type || index}`}
                    className={styles.timelineRow}
                  >
                    <div className={styles.timelineMark}>
                      {human(item.type || 'event').slice(0, 1)}
                    </div>
                    <div>
                      <strong>{item.label || human(item.type)}</strong>
                      <span>{relativeDate(item.at)}</span>
                    </div>
                  </article>
                ))}

                {!timeline.length ? (
                  <div className={styles.empty}>
                    <History size={17} />
                    <div>
                      <strong>No material recorded movement in this window.</strong>
                      <span>
                        Offline work that has not been captured cannot appear as proof.
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <p className={styles.truth}>
                Activity volume is evidence that work was recorded. It is not proof of service quality, player satisfaction or transfer success.
              </p>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <History size={17} />
                <div>
                  <p>WHAT CHANGED SINCE THE LAST REVIEW</p>
                  <h3>Compare persisted snapshots instead of reconstructing history</h3>
                </div>
              </div>

              {comparable ? (
                <>
                  <div className={styles.comparisonHead}>
                    <span>
                      {prettyDate(delta?.from_snapshot?.snapshot_date)}
                    </span>
                    <ArrowRight size={14} />
                    <span>
                      {prettyDate(delta?.to_snapshot?.snapshot_date)}
                    </span>
                  </div>

                  <div className={styles.deltaGrid}>
                    {deltaRows.slice(0, 8).map((item) => (
                      <div className={styles.delta} key={item.key}>
                        <span>{item.label}</span>
                        <strong>
                          {item.delta > 0 ? '+' : ''}
                          {item.delta}
                        </strong>
                        <small>
                          {item.from} → {item.to}
                        </small>
                      </div>
                    ))}
                  </div>

                  {!deltaRows.length ? (
                    <div className={styles.empty}>
                      <CheckCircle2 size={17} />
                      <div>
                        <strong>No count changes between the two snapshots.</strong>
                        <span>
                          The evidence state can still be reviewed without inventing movement.
                        </span>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className={styles.empty}>
                  <History size={17} />
                  <div>
                    <strong>No comparison yet.</strong>
                    <span>
                      At least two persisted snapshots are required. The platform does not fabricate a historical baseline.
                    </span>
                  </div>
                </div>
              )}

              <p className={styles.truth}>
                Snapshot deltas compare recorded evidence. Overlapping rolling windows can move counts in either direction, so a negative delta is not automatically deterioration.
              </p>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <Target size={17} />
                <div>
                  <p>PLAYER MEETING AGENDA</p>
                  <h3>What deserves an explicit human conversation next</h3>
                </div>
              </div>

              <div className={styles.rows}>
                {deadlines.slice(0, 6).map((item: any, index: number) => (
                  <article
                    className={styles.row}
                    key={`${item.entity_id || index}:${item.deadline_type || index}`}
                  >
                    <div>
                      <strong>{item.title || human(item.deadline_type)}</strong>
                      <span>
                        {human(item.deadline_state || 'recorded')} ·{' '}
                        {prettyDate(item.deadline_at)}
                      </span>
                      <small>
                        {item.next_action?.instruction ||
                          'Review the recorded deadline with the player.'}
                      </small>
                    </div>
                  </article>
                ))}

                {!deadlines.length ? (
                  <div className={styles.empty}>
                    <CheckCircle2 size={17} />
                    <div>
                      <strong>No upcoming recorded deadline in this review horizon.</strong>
                      <span>
                        The review stays factual rather than manufacturing urgency.
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={prepareServiceMove}
                >
                  <ArrowRight size={15} />
                  Prepare service move
                </button>

                <button
                  type="button"
                  className={styles.secondary}
                  onClick={reviewCareerPlan}
                >
                  <Target size={15} />
                  Review career plan
                </button>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <ShieldCheck size={17} />
                <div>
                  <p>PLAYER-SAFE PREVIEW</p>
                  <h3>What can be used for service transparency without exposing internal deal intelligence</h3>
                </div>
              </div>

              <div className={styles.grid}>
                <Fact
                  label="Next service action"
                  value={
                    statement?.service_plan?.next_action ||
                    'Not recorded'
                  }
                  detail={
                    statement?.service_plan?.next_action_due
                      ? `Due ${prettyDate(statement.service_plan.next_action_due)}`
                      : null
                  }
                />
                <Fact
                  label="Career plan"
                  value={human(statement?.career_plan?.state || 'not recorded')}
                  detail={
                    statement?.career_plan?.objective ||
                    'No player-safe objective recorded'
                  }
                />
                <Fact
                  label="Active market processes"
                  value={num(statement?.market_activity?.active_deals)}
                  detail="Club names remain hidden in this player-safe contract"
                />
                <Fact
                  label="Player requests"
                  value={`${num(statement?.player_requests?.open)} open`}
                  detail={`${num(statement?.player_requests?.overdue)} overdue`}
                />
              </div>

              {privacyExcluded.length ? (
                <div className={styles.exclusions}>
                  <span>EXCLUDED FROM PLAYER-SAFE VIEW</span>
                  <div>
                    {privacyExcluded.map((item: string, index: number) => (
                      <em key={`${index}:${item}`}>{item}</em>
                    ))}
                  </div>
                </div>
              ) : null}

              <p className={styles.truth}>
                This is a preview only. Nothing is sent to the player automatically, and internal negotiation, relationship and commercial intelligence remains separate.
              </p>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <History size={17} />
                <div>
                  <p>PROOF HISTORY</p>
                  <h3>Persist a factual baseline for future player reviews</h3>
                </div>
              </div>

              <div className={styles.snapshotRows}>
                {snapshots.slice(0, 8).map((item: any) => (
                  <div className={styles.snapshot} key={item.snapshot_id}>
                    <div>
                      <strong>{prettyDate(item.snapshot_date)}</strong>
                      <span>{human(item.proof_state || 'recorded')}</span>
                    </div>
                    <small>{num(item.window_days)}-day window</small>
                  </div>
                ))}

                {!snapshots.length ? (
                  <div className={styles.empty}>
                    <History size={17} />
                    <div>
                      <strong>No persisted proof snapshot yet.</strong>
                      <span>
                        Capture one when the agency wants a point-in-time baseline for a future review.
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className={styles.primary}
                onClick={() => void captureSnapshot()}
                disabled={captureBusy}
              >
                {captureBusy ? (
                  <LoaderCircle size={15} className={styles.spin} />
                ) : (
                  <History size={15} />
                )}
                Capture current proof snapshot
              </button>

              <p className={styles.truth}>
                A same-day 30-day capture refreshes that day’s snapshot rather than creating a duplicate baseline.
              </p>
            </section>

            <p className={styles.truth}>
              Player Service Review organises recorded operating evidence for a human conversation. It does not infer player satisfaction, loyalty, agency quality or career outcome.
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
