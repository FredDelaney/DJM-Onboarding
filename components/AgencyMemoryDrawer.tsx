'use client';

import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Network,
  RefreshCw,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { friendlyError, relativeDate } from '@/lib/platform-client';
import styles from './AgencyMemoryDrawer.module.css';

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

const ledgerStatus = (item: any) => {
  if (item?.undone_at) return 'Undone';
  if (item?.status === 'applied') return 'Applied';
  if (item?.status === 'failed') return 'Failed';
  if (item?.status === 'needs_input') return 'Needs input';
  if (item?.status === 'proposed') return 'Prepared';
  return human(item?.status || 'recorded');
};

export default function AgencyMemoryDrawer({
  invoke,
  onClose,
  onApplied,
}: {
  invoke: Invoke;
  onClose: () => void;
  onApplied: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(true);
  const [undoBusy, setUndoBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [brief, setBrief] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [learning, setLearning] = useState<any>(null);
  const [undoTarget, setUndoTarget] = useState<any>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');

    try {
      const [briefResult, historyResult, learningResult] =
        await Promise.all([
          invoke('brief', {
            window_hours: 168,
            decision_limit: 12,
          }),
          invoke('action_history', { limit: 30 }),
          invoke('learning_center'),
        ]);

      setBrief(briefResult?.brief || null);
      setHistory(list(historyResult?.actions));
      setLearning(learningResult?.learning || null);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, [invoke]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || undoBusy) return;
      if (undoTarget) setUndoTarget(null);
      else onClose();
    };

    window.addEventListener('keydown', keydown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', keydown);
    };
  }, [onClose, undoBusy, undoTarget]);

  const movement = list(brief?.movement?.events);
  const autonomy = brief?.autonomy || {};
  const flywheel = learning?.data_flywheel || {};
  const nextLearning = learning?.next_learning_action || null;

  const usablePatterns = useMemo(() => {
    const markets = list(learning?.market_learning?.markets)
      .filter((item: any) => item?.policy_change_allowed)
      .map((item: any) => ({
        type: 'Market',
        label: item.market,
        recommendation: item.recommendation,
      }));

    const routes = list(learning?.origin_route_learning?.routes)
      .filter((item: any) => item?.policy_change_allowed)
      .map((item: any) => ({
        type: 'Route',
        label: human(item.route_type),
        recommendation: item.recommendation,
      }));

    return [...markets, ...routes];
  }, [learning]);

  const confirmUndo = async () => {
    if (!undoTarget?.proposal_id || undoBusy) return;

    setUndoBusy(true);
    setError('');
    setMessage('');

    try {
      await invoke('action_undo', {
        proposal_id: undoTarget.proposal_id,
      });

      setUndoTarget(null);
      setMessage(
        'The reversible action was undone and the operating picture was refreshed.',
      );

      await onApplied();
      await load();
    } catch (undoError) {
      setError(friendlyError(undoError));
    } finally {
      setUndoBusy(false);
    }
  };

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget && !undoBusy) {
          onClose();
        }
      }}
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Agency Memory"
      >
        <header className={styles.header}>
          <div className={styles.topline}>
            <span className={styles.live}>
              <i />
              Provenance-backed memory
            </span>

            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              disabled={undoBusy}
              aria-label="Close Agency Memory"
            >
              <X size={18} />
            </button>
          </div>

          <p className={styles.eyebrow}>AGENCY MEMORY</p>
          <h2>
            What changed. What was decided. What ReDream has actually learned.
          </h2>
          <p className={styles.subhead}>
            A traceable operating memory built from recorded evidence,
            explicit actions and bounded learning.
          </p>
        </header>

        {busy ? (
          <div className={styles.notice}>
            <LoaderCircle size={18} className={styles.spin} />
            <div>
              <strong>Loading agency memory</strong>
              <span>
                Recent movement, your action ledger and learning evidence.
              </span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className={`${styles.notice} ${styles.error}`}>
            <CircleAlert size={18} />
            <div>
              <strong>Agency Memory needs attention</strong>
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

        {!busy ? (
          <div className={styles.content}>
            <section className={styles.hero}>
              <div>
                <p>OPERATING MEMORY</p>
                <h3>
                  {brief?.headline || 'Agency movement is recorded.'}
                </h3>
                <span>
                  {brief?.subheadline ||
                    'ReDream records material operating change without turning it into a prediction.'}
                </span>
              </div>

              <div className={styles.heroSide}>
                <Network size={18} />
                <strong>{human(autonomy.mode || 'guarded')}</strong>
                <span>autonomy mode</span>
              </div>
            </section>

            <div className={styles.grid}>
              <Fact
                label="Movement window"
                value="7 days"
                detail={`${movement.length} material event(s) visible`}
              />
              <Fact
                label="Your action records"
                value={num(history.length)}
                detail="Prepared, applied, failed or undone actions"
              />
              <Fact
                label="Learning maturity"
                value={human(
                  learning?.maturity_state || 'collecting foundations',
                )}
                detail="Evidence maturity, not a confidence score"
              />
              <Fact
                label="Automation"
                value={
                  autonomy.auto_execute_enabled
                    ? 'Enabled by policy'
                    : 'Human confirmation'
                }
                detail={
                  autonomy.require_reversible
                    ? 'Reversibility required where supported'
                    : 'Current tenant policy'
                }
              />
            </div>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <RefreshCw size={17} />
                <div>
                  <p>WHAT CHANGED</p>
                  <h3>Material movement in the operating picture</h3>
                </div>
              </div>

              <div className={styles.rows}>
                {movement.slice(0, 10).map((item: any, index: number) => (
                  <article
                    className={styles.movementRow}
                    key={`${item.command_id || index}:${item.occurred_at || index}`}
                  >
                    <div className={styles.eventMark}>
                      {human(item.movement_type || 'change').slice(0, 1)}
                    </div>
                    <div>
                      <strong>{item.title || 'Agency decision'}</strong>
                      <span>
                        {human(item.movement_type || 'changed')} ·{' '}
                        {human(item.command_type || 'operating change')}
                      </span>
                      <small>{relativeDate(item.occurred_at)}</small>
                    </div>
                  </article>
                ))}

                {!movement.length ? (
                  <div className={styles.empty}>
                    <CheckCircle2 size={17} />
                    <div>
                      <strong>No material movement in this window.</strong>
                      <span>
                        ReDream records movement only when the underlying
                        agency evidence changes.
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <Network size={17} />
                <div>
                  <p>YOUR ACTION LEDGER</p>
                  <h3>
                    What ReDream prepared, what you approved and what can
                    still be reversed
                  </h3>
                </div>
              </div>

              <div className={styles.rows}>
                {history.slice(0, 15).map((item: any) => {
                  const undoable =
                    item.status === 'applied' &&
                    Boolean(item.undo_supported) &&
                    !item.undone_at;

                  return (
                    <article
                      className={styles.actionRow}
                      key={item.proposal_id || item.created_at}
                    >
                      <div>
                        <div className={styles.actionTitle}>
                          <strong>
                            {item.title || human(item.action_type)}
                          </strong>
                          <span className={styles.status}>
                            {ledgerStatus(item)}
                          </span>
                        </div>

                        <p>{item.rationale || 'Recorded agency action.'}</p>

                        <small>
                          {human(item.action_type || 'agency action')} ·{' '}
                          {human(item.risk_level || 'recorded')} risk ·{' '}
                          {relativeDate(
                            item.undone_at ||
                              item.applied_at ||
                              item.created_at,
                          )}
                        </small>
                      </div>

                      {undoable ? (
                        <button
                          type="button"
                          onClick={() => setUndoTarget(item)}
                        >
                          <RefreshCw size={14} />
                          Undo
                        </button>
                      ) : null}
                    </article>
                  );
                })}

                {!history.length ? (
                  <div className={styles.empty}>
                    <Network size={17} />
                    <div>
                      <strong>
                        You have no recorded Autopilot action history yet.
                      </strong>
                      <span>
                        This ledger is user-scoped. Agency-wide movement
                        remains visible above.
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <p className={styles.truth}>
                The action ledger is scoped to the signed-in user. It does not
                imply that one user performed every agency action.
              </p>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <Network size={17} />
                <div>
                  <p>LEARNING CENTRE</p>
                  <h3>Learn only when the evidence earns it</h3>
                </div>
              </div>

              <div className={styles.grid}>
                <Fact label="Active deals" value={num(flywheel.active_deals)} />
                <Fact label="Resolved deals" value={num(flywheel.closed_deals)} />
                <Fact label="Sent pitches" value={num(flywheel.sent_pitches)} />
                <Fact
                  label="Explicit responses"
                  value={num(flywheel.explicit_pitch_responses)}
                />
                <Fact
                  label="Resolved action outcomes"
                  value={num(flywheel.resolved_action_outcomes)}
                />
                <Fact
                  label="Confirmed career strategies"
                  value={num(
                    flywheel.player_confirmed_career_strategies,
                  )}
                />
              </div>

              {nextLearning ? (
                <div className={styles.learningNext}>
                  <CheckCircle2 size={15} />
                  <div>
                    <strong>Next evidence-building move</strong>
                    <span>
                      {nextLearning.reason ||
                        human(nextLearning.action)}
                      {Number.isFinite(Number(nextLearning.missing_count))
                        ? ` · ${num(nextLearning.missing_count)} remaining`
                        : ''}
                    </span>
                  </div>
                </div>
              ) : null}

              {usablePatterns.length ? (
                <div className={styles.patterns}>
                  {usablePatterns.slice(0, 6).map((item: any, index) => (
                    <div key={`${item.type}:${item.label}:${index}`}>
                      <span>{item.type}</span>
                      <strong>{item.label}</strong>
                      <small>{human(item.recommendation || 'usable')}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>
                  <CircleAlert size={17} />
                  <div>
                    <strong>
                      No decision-grade operating pattern is available yet.
                    </strong>
                    <span>
                      ReDream prefers no recommendation to a confident-looking
                      conclusion from weak or synthetic evidence.
                    </span>
                  </div>
                </div>
              )}

              <p className={styles.truth}>
                Learning remains observational. It can support human judgement,
                but it cannot automatically change market strategy, pitch policy
                or agency operating policy.
              </p>
            </section>
          </div>
        ) : null}

        {undoTarget ? (
          <div className={styles.confirmBar}>
            <div>
              <p>CONFIRM REVERSAL</p>
              <strong>
                Undo “{undoTarget.title || human(undoTarget.action_type)}”?
              </strong>
              <span>
                ReDream will run the existing guarded undo contract and re-check
                whether reversal is still safe. Nothing is reversed until you
                confirm.
              </span>
            </div>

            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setUndoTarget(null)}
                disabled={undoBusy}
              >
                Cancel
              </button>

              <button
                type="button"
                className={styles.primary}
                onClick={() => void confirmUndo()}
                disabled={undoBusy}
              >
                {undoBusy ? (
                  <LoaderCircle size={15} className={styles.spin} />
                ) : (
                  <RefreshCw size={15} />
                )}
                Confirm undo
              </button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
