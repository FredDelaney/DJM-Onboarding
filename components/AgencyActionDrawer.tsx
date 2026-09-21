'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CircleAlert,
  LoaderCircle,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { friendlyError } from '@/lib/platform-client';

import styles from './AgencyActionDrawer.module.css';

export type AgencyActionRequest = {
  key: string;
  eyebrow: string;
  title: string;
  instruction: string;
  label: string;
  action: string;
  payload: Record<string, unknown>;
  context?: string | null;
  fallbackHref?: string | null;
  fallbackLabel?: string | null;
};

type Invoke = (
  action: string,
  body?: Record<string, unknown>,
) => Promise<any>;

const list = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    : [];

const commaList = (value: string) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const normaliseInputs = (
  values: Record<string, string>,
): Record<string, string> => {
  const output = { ...values };

  for (const key of ['next_action_at', 'due_at']) {
    const value = output[key];

    if (!value) continue;

    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      output[key] = parsed.toISOString();
    }
  }

  return output;
};

const field = (key: string) => {
  if (key === 'owner_user_id') {
    return {
      label: 'Responsible staff member',
      type: 'select',
    };
  }

  if (key === 'next_action_text') {
    return {
      label: 'Next action',
      type: 'text',
    };
  }

  if (key === 'next_action') {
    return {
      label: 'Next action',
      type: 'text',
    };
  }

  if (key === 'next_action_at') {
    return {
      label: 'When',
      type: 'datetime-local',
    };
  }

  if (key === 'next_action_due') {
    return {
      label: 'Due date',
      type: 'date',
    };
  }

  if (key === 'due_at') {
    return {
      label: 'Due date',
      type: 'datetime-local',
    };
  }

  if (key === 'title') {
    return {
      label: 'Task title',
      type: 'text',
    };
  }

  return {
    label: key
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    type: 'text',
  };
};

export default function AgencyActionDrawer({
  request,
  invoke,
  onClose,
  onProposal,
}: {
  request: AgencyActionRequest;
  invoke: Invoke;
  onClose: () => void;
  onProposal: (proposal: any) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [inputs, setInputs] = useState<
    Record<string, string>
  >({});

  const requiredInputs = list(result?.required_inputs);

  const allowedNextSteps = list(
    result?.allowed_next_steps,
  );

  const playerId = String(
    request.payload?.player_id || '',
  );

  const rawCandidates = result?.owner_candidates;

  const ownerCandidates = Array.isArray(rawCandidates)
    ? rawCandidates
    : Array.isArray(rawCandidates?.candidates)
      ? rawCandidates.candidates
      : [];

  const consumePrepared = (prepared: any) => {
    const suggested =
      prepared?.suggested_input &&
      typeof prepared.suggested_input === 'object'
        ? prepared.suggested_input
        : null;

    if (suggested) {
      setInputs((current) => ({
        ...Object.fromEntries(
          Object.entries(suggested).map(
            ([key, value]) => [
              key,
              String(value || ''),
            ],
          ),
        ),
        ...current,
      }));
    }

    const needsInput =
      prepared?.status === 'needs_input' ||
      prepared?.status === 'needs_human_input' ||
      list(prepared?.required_inputs).length > 0 ||
      list(prepared?.allowed_next_steps).length > 0;

    const reviewOnly =
      prepared?.approval_mode === 'review_only' ||
      prepared?.executable === false;

    if (
      prepared?.proposal_id &&
      !needsInput &&
      !reviewOnly &&
      prepared?.status !== 'applied'
    ) {
      onProposal({
        ...prepared,
        title:
          prepared?.title ||
          request.title,
        rationale:
          prepared?.rationale ||
          request.instruction,
      });

      return;
    }

    setResult(prepared);
  };

  const prepare = async () => {
    if (busy) return;

    setBusy(true);
    setError('');

    try {
      const response = await invoke(request.action, {
        ...request.payload,
        ...(Object.keys(inputs).length
          ? {
              input: normaliseInputs(inputs),
            }
          : {}),
      });

      consumePrepared(
        response?.proposal ||
          response?.result ||
          response,
      );
    } catch (actionError) {
      setError(friendlyError(actionError));
    } finally {
      setBusy(false);
    }
  };

  const refreshCareerAction = async () => {
    if (!playerId) return;

    const response = await invoke(
      'career_strategy_action_prepare',
      {
        player_id: playerId,
      },
    );

    consumePrepared(
      response?.proposal ||
        response?.result ||
        response,
    );
  };

  const saveCareerStrategy = async () => {
    if (!playerId || busy) return;

    const objective = String(
      inputs.career_objective || '',
    ).trim();

    const nextCheckpoint = String(
      inputs.career_next_checkpoint || '',
    ).trim();

    const reviewDueAt = String(
      inputs.career_review_due_at || '',
    ).trim();

    if (
      !objective ||
      !nextCheckpoint ||
      !reviewDueAt
    ) {
      setError(
        'Career objective, next checkpoint and review date are required.',
      );
      return;
    }

    setBusy(true);
    setError('');

    try {
      await invoke('career_strategy_save', {
        player_id: playerId,
        review_due_at: reviewDueAt,
        strategy: {
          objective,
          next_checkpoint: nextCheckpoint,
          target_markets: commaList(
            inputs.career_target_markets || '',
          ),
          avoid_markets: commaList(
            inputs.career_avoid_markets || '',
          ),
          notes:
            String(
              inputs.career_notes || '',
            ).trim() || null,
        },
      });

      await refreshCareerAction();
    } catch (actionError) {
      setError(friendlyError(actionError));
    } finally {
      setBusy(false);
    }
  };

  const confirmCareerStrategy = async () => {
    if (!playerId || busy) return;

    setBusy(true);
    setError('');

    try {
      await invoke('career_strategy_confirm', {
        player_id: playerId,
        confirmation_method:
          String(
            inputs.confirmation_method ||
              'conversation',
          ).trim() || 'conversation',
      });

      await refreshCareerAction();
    } catch (actionError) {
      setError(friendlyError(actionError));
    } finally {
      setBusy(false);
    }
  };

  const approveCareerStrategy = async () => {
    if (!playerId || busy) return;

    setBusy(true);
    setError('');

    try {
      await invoke('career_strategy_approve', {
        player_id: playerId,
      });

      await refreshCareerAction();
    } catch (actionError) {
      setError(friendlyError(actionError));
    } finally {
      setBusy(false);
    }
  };

  const showCareerStrategyForm =
    allowedNextSteps.includes(
      'save_career_strategy',
    );

  const showCareerConfirmation =
    allowedNextSteps.includes(
      'record_player_confirmation',
    );

  const showCareerApproval =
    allowedNextSteps.includes(
      'approve_career_strategy',
    ) && !showCareerConfirmation;


  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (
          event.target === event.currentTarget &&
          !busy
        ) {
          onClose();
        }
      }}
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>
              {request.eyebrow}
            </p>

            <h2>{request.title}</h2>

            {request.context ? (
              <small>{request.context}</small>
            ) : null}
          </div>

          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            disabled={busy}
            aria-label="Close action"
          >
            <X size={16} />
          </button>
        </header>

        <section className={styles.instruction}>
          <strong>What needs to happen</strong>
          <p>{request.instruction}</p>
        </section>

        {!result ? (
          <button
            type="button"
            className={styles.primary}
            onClick={() => void prepare()}
            disabled={busy}
          >
            {busy ? (
              <LoaderCircle
                size={15}
                className={styles.spin}
              />
            ) : (
              <ArrowRight size={15} />
            )}

            {request.label}
          </button>
        ) : null}

        {result ? (
          <section className={styles.status}>
            <span>
              {String(
                result?.status ||
                  result?.approval_mode ||
                  'review',
              )
                .replaceAll('_', ' ')
                .toUpperCase()}
            </span>

            <p>
              {result?.instruction ||
                result?.rationale ||
                result?.reason ||
                (result?.status === 'applied'
                  ? 'This action has already been applied.'
                  : 'Review the current evidence before continuing.')}
            </p>
          </section>
        ) : null}

        {requiredInputs.length ? (
          <section className={styles.inputs}>
            <p className={styles.eyebrow}>
              ACTION DETAIL
            </p>

            {requiredInputs.map((key) => {
              const meta = field(key);

              return (
                <label key={key}>
                  <span>{meta.label}</span>

                  {meta.type === 'select' &&
                  ownerCandidates.length ? (
                    <select
                      value={inputs[key] || ''}
                      onChange={(event) =>
                        setInputs((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    >
                      <option value="">
                        Choose staff member
                      </option>

                      {ownerCandidates.map(
                        (candidate: any) => (
                          <option
                            key={
                              candidate.user_id ||
                              candidate.owner_user_id
                            }
                            value={
                              candidate.user_id ||
                              candidate.owner_user_id ||
                              ''
                            }
                          >
                            {candidate.name ||
                              candidate.display_name ||
                              'Agency staff'}
                          </option>
                        ),
                      )}
                    </select>
                  ) : (
                    <input
                      type={meta.type}
                      value={inputs[key] || ''}
                      onChange={(event) =>
                        setInputs((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  )}
                </label>
              );
            })}

            <button
              type="button"
              className={styles.primary}
              onClick={() => void prepare()}
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle
                  size={15}
                  className={styles.spin}
                />
              ) : (
                <ArrowRight size={15} />
              )}
              Continue to confirmation
            </button>
          </section>
        ) : null}

        {showCareerStrategyForm ? (
          <section className={styles.inputs}>
            <p className={styles.eyebrow}>
              PLAYER-OWNED CAREER STRATEGY
            </p>

            <label>
              <span>Career objective</span>
              <input
                type="text"
                value={inputs.career_objective || ''}
                onChange={(event) =>
                  setInputs((current) => ({
                    ...current,
                    career_objective:
                      event.target.value,
                  }))
                }
                placeholder="What is the player trying to achieve?"
              />
            </label>

            <label>
              <span>Next checkpoint</span>
              <input
                type="text"
                value={
                  inputs.career_next_checkpoint || ''
                }
                onChange={(event) =>
                  setInputs((current) => ({
                    ...current,
                    career_next_checkpoint:
                      event.target.value,
                  }))
                }
                placeholder="What should be reviewed next?"
              />
            </label>

            <label>
              <span>Review date</span>
              <input
                type="date"
                value={
                  inputs.career_review_due_at || ''
                }
                onChange={(event) =>
                  setInputs((current) => ({
                    ...current,
                    career_review_due_at:
                      event.target.value,
                  }))
                }
              />
            </label>

            <label>
              <span>Target markets</span>
              <input
                type="text"
                value={
                  inputs.career_target_markets || ''
                }
                onChange={(event) =>
                  setInputs((current) => ({
                    ...current,
                    career_target_markets:
                      event.target.value,
                  }))
                }
                placeholder="Netherlands, Belgium, Austria"
              />
            </label>

            <label>
              <span>Avoid markets</span>
              <input
                type="text"
                value={
                  inputs.career_avoid_markets || ''
                }
                onChange={(event) =>
                  setInputs((current) => ({
                    ...current,
                    career_avoid_markets:
                      event.target.value,
                  }))
                }
                placeholder="Comma-separated"
              />
            </label>

            <label>
              <span>Notes</span>
              <textarea
                value={inputs.career_notes || ''}
                onChange={(event) =>
                  setInputs((current) => ({
                    ...current,
                    career_notes:
                      event.target.value,
                  }))
                }
              />
            </label>

            <button
              type="button"
              className={styles.primary}
              onClick={() =>
                void saveCareerStrategy()
              }
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle
                  size={15}
                  className={styles.spin}
                />
              ) : (
                <ArrowRight size={15} />
              )}
              Save strategy draft
            </button>
          </section>
        ) : null}

        {showCareerConfirmation ? (
          <section className={styles.inputs}>
            <p className={styles.eyebrow}>
              PLAYER CONFIRMATION
            </p>

            <label>
              <span>Confirmation method</span>
              <input
                type="text"
                value={
                  inputs.confirmation_method ||
                  'conversation'
                }
                onChange={(event) =>
                  setInputs((current) => ({
                    ...current,
                    confirmation_method:
                      event.target.value,
                  }))
                }
              />
            </label>

            <button
              type="button"
              className={styles.primary}
              onClick={() =>
                void confirmCareerStrategy()
              }
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle
                  size={15}
                  className={styles.spin}
                />
              ) : (
                <ArrowRight size={15} />
              )}
              Record player confirmation
            </button>
          </section>
        ) : null}

        {showCareerApproval ? (
          <button
            type="button"
            className={styles.primary}
            onClick={() =>
              void approveCareerStrategy()
            }
            disabled={busy}
          >
            {busy ? (
              <LoaderCircle
                size={15}
                className={styles.spin}
              />
            ) : (
              <ArrowRight size={15} />
            )}
            Approve career strategy
          </button>
        ) : null}

        {(result || error) && request.fallbackHref ? (
          <Link
            href={request.fallbackHref}
            className={styles.fallback}
            onClick={onClose}
          >
            <span>
              {request.fallbackLabel ||
                'Open working area'}
            </span>
            <ArrowRight size={14} />
          </Link>
        ) : null}

        {error ? (
          <div className={styles.error}>
            <CircleAlert size={15} />
            <span>{error}</span>
          </div>
        ) : null}

        <p className={styles.safety}>
          Internal work can be prepared here. External,
          commercial and sensitive actions still require
          explicit human confirmation.
        </p>
      </aside>
    </div>
  );
}
