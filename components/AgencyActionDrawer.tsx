'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
} from 'react';

import { friendlyError } from '@/lib/platform-client';

import styles from './AgencyActionDrawer.module.css';

export type AgencyActionFact = {
  label: string;
  value: string;
  detail?: string | null;
};

export type AgencyActionRequest = {
  key: string;
  eyebrow: string;
  title: string;
  instruction: string;
  label: string;
  action: string;
  payload: Record<string, unknown>;
  context?: string | null;
  facts?: AgencyActionFact[];
  successCondition?: string | null;
  confirmationLabel?: string | null;
  fallbackHref?: string | null;
  fallbackLabel?: string | null;
};

type Invoke = (
  action: string,
  body?: Record<string, unknown>,
) => Promise<any>;

type Mode =
  | 'preparing'
  | 'review'
  | 'done'
  | 'undone';

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

const human = (value: unknown) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );

const normaliseInputs = (
  values: Record<string, string>,
): Record<string, string> => {
  const output = { ...values };

  for (const key of [
    'next_action_at',
    'due_at',
  ]) {
    const value = output[key];

    if (!value) continue;

    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      output[key] = parsed.toISOString();
    }
  }

  return output;
};

const formatWhen = (value: unknown) => {
  const text = String(value || '').trim();

  if (!text) return '';

  const parsed = new Date(text);

  if (Number.isNaN(parsed.getTime())) {
    return text;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
};

const actionLabel = (
  actionType: unknown,
  fallback = 'Confirm action',
) => {
  switch (String(actionType || '')) {
    case 'assign_player_staff':
      return 'Assign owner';
    case 'set_player_next_action':
      return 'Set next action';
    case 'create_player_service_task':
      return 'Create player action';
    case 'create_search_task':
      return 'Create search task';
    case 'create_career_strategy_task':
      return 'Create strategy review';
    case 'create_deal_decision_task':
      return 'Create deal checkpoint';
    case 'create_introduction_task':
      return 'Create introduction task';
    case 'create_relationship_task':
      return 'Create relationship task';
    case 'create_verification_task':
      return 'Create verification task';
    default:
      return fallback;
  }
};

const field = (key: string) => {
  if (key === 'owner_user_id') {
    return {
      label: 'Responsible staff member',
      type: 'select',
    };
  }

  if (
    key === 'next_action_text' ||
    key === 'next_action'
  ) {
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
    label: human(key),
    type: 'text',
  };
};

export default function AgencyActionDrawer({
  request,
  invoke,
  onClose,
  onApplied,
}: {
  request: AgencyActionRequest;
  invoke: Invoke;
  onClose: () => void;
  onApplied: () => Promise<void> | void;
}) {
  const preparedRef = useRef(false);

  const [mode, setMode] =
    useState<Mode>('preparing');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] =
    useState<any>(null);
  const [proposal, setProposal] =
    useState<any>(null);
  const [appliedResult, setAppliedResult] =
    useState<any>(null);

  const [inputs, setInputs] = useState<
    Record<string, string>
  >({});

  const rawRequiredInputs = list(
    result?.required_inputs,
  );

  const allowedNextSteps = list(
    result?.allowed_next_steps,
  );

  const playerId = String(
    request.payload?.player_id || '',
  );

  const rawCandidates =
    result?.owner_candidates;

  const ownerCandidates = Array.isArray(
    rawCandidates,
  )
    ? rawCandidates
    : Array.isArray(rawCandidates?.candidates)
      ? rawCandidates.candidates
      : [];

  const strategyActionType = String(
    result?.strategy_action_type || '',
  );

  const showCareerStrategyForm =
    strategyActionType ===
      'define_career_strategy' ||
    allowedNextSteps.includes(
      'save_career_strategy',
    );

  const showCareerConfirmation =
    strategyActionType ===
    'confirm_strategy_with_player';

  const showCareerApproval =
    strategyActionType ===
      'complete_strategy_approval' ||
    (!showCareerConfirmation &&
      allowedNextSteps.includes(
        'approve_career_strategy',
      ));

  const reviewOnly =
    result?.approval_mode === 'review_only' ||
    result?.executable === false;

  const noAction = [
    'no_action_required',
    'no_control_fix_required',
    'no_mandate_required',
    'no_strategy_action_available',
  ].includes(String(result?.status || ''));

  const proposalId = String(
    proposal?.proposal_id ||
      result?.proposal_id ||
      '',
  );

  const actionType =
    proposal?.action_type ||
    result?.action_type ||
    '';

  const reminderOwnerName = String(
    result?.reminder_owner_name || '',
  ).trim();

  const requiredInputs =
    rawRequiredInputs.length
      ? rawRequiredInputs
      : actionType ===
            'set_deal_next_action' &&
          result?.status === 'needs_input'
        ? [
            'next_action_text',
            'next_action_at',
          ]
        : actionType ===
              'assign_deal_owner' &&
            result?.status === 'needs_input'
          ? ['owner_user_id']
          : [];

  const proposalPayload =
    proposal?.payload ||
    result?.payload ||
    {};

  const successCondition =
    request.successCondition ||
    proposalPayload?.success_condition ||
    result?.success_condition ||
    '';

  const undoSupported = Boolean(
    proposal?.undo_supported ||
      result?.undo_supported,
  );

  const internalOnly =
    proposal?.external_side_effect === false ||
    result?.external_side_effect === false ||
    proposal?.external_message_sent === false ||
    result?.external_message_sent === false;

  const readyToApply =
    Boolean(proposalId) &&
    !reviewOnly &&
    !requiredInputs.length &&
    !showCareerStrategyForm &&
    !showCareerConfirmation &&
    !showCareerApproval &&
    mode === 'review';

  const currentStep =
    mode === 'preparing'
      ? 1
      : mode === 'done' ||
          mode === 'undone'
        ? 3
        : readyToApply
          ? 3
          : 2;

  const showFallback = Boolean(
    (result || error) &&
      request.fallbackHref &&
      !readyToApply,
  );

  function consumePrepared(prepared: any) {
    const suggested =
      prepared?.suggested_input &&
      typeof prepared.suggested_input ===
        'object'
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

    setResult(prepared);

    if (prepared?.proposal_id) {
      setProposal(prepared);
    }

    if (prepared?.status === 'applied') {
      setAppliedResult(prepared);
      setMode('done');
      return;
    }

    setMode('review');
  }

  async function prepare() {
    if (busy) return;

    setBusy(true);
    setError('');
    setMode('preparing');

    try {
      const response = await invoke(
        request.action,
        {
          ...request.payload,
          ...(Object.keys(inputs).length
            ? {
                input:
                  normaliseInputs(inputs),
              }
            : {}),
        },
      );

      consumePrepared(
        response?.proposal ||
          response?.result ||
          response,
      );
    } catch (actionError) {
      setError(
        friendlyError(actionError),
      );
      setMode('review');
    } finally {
      setBusy(false);
    }
  }

  async function refreshCareerAction() {
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
  }

  async function saveCareerStrategy() {
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
      await invoke(
        'career_strategy_save',
        {
          player_id: playerId,
          review_due_at: reviewDueAt,
          strategy: {
            objective,
            next_checkpoint:
              nextCheckpoint,
            target_markets: commaList(
              inputs.career_target_markets ||
                '',
            ),
            avoid_markets: commaList(
              inputs.career_avoid_markets ||
                '',
            ),
            notes:
              String(
                inputs.career_notes || '',
              ).trim() || null,
          },
        },
      );

      await onApplied();
      await refreshCareerAction();
    } catch (actionError) {
      setError(
        friendlyError(actionError),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmCareerStrategy() {
    if (!playerId || busy) return;

    setBusy(true);
    setError('');

    try {
      await invoke(
        'career_strategy_confirm',
        {
          player_id: playerId,
          confirmation_method:
            String(
              inputs.confirmation_method ||
                'conversation',
            ).trim() || 'conversation',
        },
      );

      await onApplied();
      await refreshCareerAction();
    } catch (actionError) {
      setError(
        friendlyError(actionError),
      );
    } finally {
      setBusy(false);
    }
  }

  async function approveCareerStrategy() {
    if (!playerId || busy) return;

    setBusy(true);
    setError('');

    try {
      await invoke(
        'career_strategy_approve',
        {
          player_id: playerId,
        },
      );

      await onApplied();
      await refreshCareerAction();
    } catch (actionError) {
      setError(
        friendlyError(actionError),
      );
    } finally {
      setBusy(false);
    }
  }

  async function executeProposal() {
    if (!proposalId || busy) return;

    setBusy(true);
    setError('');

    try {
      const response = await invoke(
        'action_execute',
        {
          proposal_id: proposalId,
        },
      );

      setAppliedResult(
        response?.result || response,
      );

      setMode('done');

      await onApplied();
    } catch (actionError) {
      setError(
        friendlyError(actionError),
      );
    } finally {
      setBusy(false);
    }
  }

  async function undoProposal() {
    if (
      !proposalId ||
      !undoSupported ||
      busy
    ) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      await invoke('action_undo', {
        proposal_id: proposalId,
      });

      setMode('undone');

      await onApplied();
    } catch (actionError) {
      setError(
        friendlyError(actionError),
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (preparedRef.current) return;

    preparedRef.current = true;
    void prepare();
  }, [request.key]);

  useEffect(() => {
    const previous =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    return () => {
      document.body.style.overflow =
        previous;
    };
  }, []);

  useEffect(() => {
    const handleKey = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === 'Escape' &&
        !busy
      ) {
        onClose();
      }
    };

    window.addEventListener(
      'keydown',
      handleKey,
    );

    return () =>
      window.removeEventListener(
        'keydown',
        handleKey,
      );
  }, [busy, onClose]);

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (
          event.target ===
            event.currentTarget &&
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
          <div className={styles.headerTop}>
            <div
              className={styles.liveEvidence}
            >
              <Sparkles size={13} />
              Current context
            </div>

            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              disabled={busy}
              aria-label="Close action workspace"
            >
              <X size={17} />
            </button>
          </div>

          <p className={styles.eyebrow}>
            {request.eyebrow}
          </p>

          <h2>{request.title}</h2>

          {request.context ? (
            <p className={styles.context}>
              {request.context}
            </p>
          ) : null}
        </header>

        <div
          className={styles.progress}
          aria-label="Decision progress"
        >
          {[
            ['1', 'Context'],
            ['2', 'Decision'],
            ['3', 'Confirm'],
          ].map(([number, label], index) => {
            const step = index + 1;

            return (
              <div
                key={label}
                className={
                  step < currentStep
                    ? styles.progressDone
                    : step === currentStep
                      ? styles.progressActive
                      : ''
                }
              >
                <i>{number}</i>
                <span>{label}</span>
              </div>
            );
          })}
        </div>

        <section className={styles.why}>
          <span>WHY NOW</span>
          <p>{request.instruction}</p>
        </section>

        {request.facts?.length ? (
          <section
            className={styles.evidence}
          >
            {request.facts
              .slice(0, 4)
              .map((fact) => (
                <div
                  key={`${fact.label}:${fact.value}`}
                  className={
                    styles.evidenceFact
                  }
                >
                  <span>{fact.label}</span>
                  <strong>
                    {fact.value}
                  </strong>
                  {fact.detail ? (
                    <small>
                      {fact.detail}
                    </small>
                  ) : null}
                </div>
              ))}
          </section>
        ) : null}

        {mode === 'preparing' ? (
          <section
            className={styles.preparing}
            aria-live="polite"
          >
            <LoaderCircle
              size={19}
              className={styles.spin}
            />
            <div>
              <strong>
                Checking the latest context
              </strong>
              <span>
                Reviewing current evidence and
                confirming what can be done safely.
              </span>
            </div>
          </section>
        ) : null}

        {requiredInputs.length &&
        mode === 'review' ? (
          <section className={styles.panel}>
            <div
              className={styles.panelHead}
            >
              <div
                className={
                  styles.panelIcon
                }
              >
                <CircleAlert size={16} />
              </div>

              <div>
                <p className={styles.eyebrow}>
                  YOUR DECISION
                </p>
                <h3>
                  One detail is needed to continue.
                </h3>
              </div>
            </div>

            {actionType ===
                'set_deal_next_action' &&
            reminderOwnerName ? (
              <p
                className={
                  styles.panelExplanation
                }
              >
                This follow-up reminder will belong to {reminderOwnerName}.
              </p>
            ) : null}

            <div
              className={styles.inputs}
            >
              {requiredInputs.map(
                (key) => {
                  const meta =
                    field(key);

                  return (
                    <label key={key}>
                      <span>
                        {meta.label}
                      </span>

                      {meta.type ===
                        'select' &&
                      ownerCandidates.length ? (
                        <select
                          value={
                            inputs[key] ||
                            ''
                          }
                          onChange={(
                            event,
                          ) =>
                            setInputs(
                              (current) => ({
                                ...current,
                                [key]:
                                  event
                                    .target
                                    .value,
                              }),
                            )
                          }
                        >
                          <option value="">
                            Choose staff member
                          </option>

                          {ownerCandidates.map(
                            (
                              candidate: any,
                            ) => (
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
                          value={
                            inputs[key] ||
                            ''
                          }
                          onChange={(
                            event,
                          ) =>
                            setInputs(
                              (current) => ({
                                ...current,
                                [key]:
                                  event
                                    .target
                                    .value,
                              }),
                            )
                          }
                        />
                      )}
                    </label>
                  );
                },
              )}
            </div>

            <button
              type="button"
              className={styles.primary}
              onClick={() =>
                void prepare()
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
              Continue to confirmation
            </button>
          </section>
        ) : null}

        {showCareerStrategyForm &&
        mode === 'review' ? (
          <section className={styles.panel}>
            <CareerProgress stage={1} />

            <div
              className={styles.panelHead}
            >
              <div
                className={
                  styles.panelIcon
                }
              >
                <ShieldCheck size={16} />
              </div>

              <div>
                <p className={styles.eyebrow}>
                  PLAYER-OWNED STRATEGY
                </p>
                <h3>
                  Define the direction with
                  the player.
                </h3>
              </div>
            </div>

            <p
              className={
                styles.panelExplanation
              }
            >
              Career objectives and target
              markets stay human-owned. Record
              the strategy here, then confirm it
              with the player.
            </p>

            <div
              className={styles.inputs}
            >
              <label>
                <span>
                  Career objective
                </span>
                <input
                  type="text"
                  value={
                    inputs.career_objective ||
                    ''
                  }
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
                <span>
                  Next checkpoint
                </span>
                <input
                  type="text"
                  value={
                    inputs.career_next_checkpoint ||
                    ''
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
                    inputs.career_review_due_at ||
                    ''
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

              <div
                className={
                  styles.inputPair
                }
              >
                <label>
                  <span>
                    Target markets
                  </span>
                  <input
                    type="text"
                    value={
                      inputs.career_target_markets ||
                      ''
                    }
                    onChange={(event) =>
                      setInputs(
                        (current) => ({
                          ...current,
                          career_target_markets:
                            event.target
                              .value,
                        }),
                      )
                    }
                    placeholder="Netherlands, Belgium"
                  />
                </label>

                <label>
                  <span>
                    Avoid markets
                  </span>
                  <input
                    type="text"
                    value={
                      inputs.career_avoid_markets ||
                      ''
                    }
                    onChange={(event) =>
                      setInputs(
                        (current) => ({
                          ...current,
                          career_avoid_markets:
                            event.target
                              .value,
                        }),
                      )
                    }
                    placeholder="Comma-separated"
                  />
                </label>
              </div>

              <label>
                <span>Notes</span>
                <textarea
                  value={
                    inputs.career_notes || ''
                  }
                  onChange={(event) =>
                    setInputs((current) => ({
                      ...current,
                      career_notes:
                        event.target.value,
                    }))
                  }
                  placeholder="Only the context the agency actually needs."
                />
              </label>
            </div>

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
              Save strategy and continue
            </button>
          </section>
        ) : null}

        {showCareerConfirmation &&
        mode === 'review' ? (
          <section className={styles.panel}>
            <CareerProgress stage={2} />

            <div
              className={styles.panelHead}
            >
              <div
                className={
                  styles.panelIcon
                }
              >
                <CheckCircle2 size={16} />
              </div>

              <div>
                <p className={styles.eyebrow}>
                  PLAYER CONFIRMATION
                </p>
                <h3>
                  Has the player confirmed
                  this direction?
                </h3>
              </div>
            </div>

            <p
              className={
                styles.panelExplanation
              }
            >
              This records confirmation. It
              does not contact the player or
              send anything externally.
            </p>

            <div
              className={styles.inputs}
            >
              <label>
                <span>
                  Confirmation method
                </span>

                <select
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
                >
                  <option value="conversation">
                    Conversation
                  </option>
                  <option value="meeting">
                    Meeting
                  </option>
                  <option value="call">
                    Call
                  </option>
                  <option value="message">
                    Message
                  </option>
                </select>
              </label>
            </div>

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
                <CheckCircle2 size={15} />
              )}
              Record player confirmation
            </button>
          </section>
        ) : null}

        {showCareerApproval &&
        mode === 'review' ? (
          <section className={styles.panel}>
            <CareerProgress stage={3} />

            <div
              className={styles.panelHead}
            >
              <div
                className={
                  styles.panelIcon
                }
              >
                <ShieldCheck size={16} />
              </div>

              <div>
                <p className={styles.eyebrow}>
                  AGENCY APPROVAL
                </p>
                <h3>
                  Player confirmation is
                  recorded.
                </h3>
              </div>
            </div>

            <p
              className={
                styles.panelExplanation
              }
            >
              Approving makes this the current
              strategy for future market activity.
            </p>

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
                <CheckCircle2 size={15} />
              )}
              Approve career strategy
            </button>
          </section>
        ) : null}

        {readyToApply ? (
          <section
            className={styles.readyCard}
          >
            <div
              className={styles.readyHead}
            >
              <div
                className={
                  styles.readyIcon
                }
              >
                <CheckCircle2 size={18} />
              </div>

              <div>
                <p className={styles.eyebrow}>
                  READY
                </p>
                <h3>
                  {proposal?.title ||
                    proposalPayload?.title ||
                    request.title}
                </h3>
              </div>
            </div>

            <div
              className={
                styles.changePreview
              }
            >
              <div>
                <span>Next step</span>
                <strong>
                  {actionLabel(
                    actionType,
                    request.label,
                  )}
                </strong>
              </div>

              {proposalPayload?.due_at ||
              proposalPayload?.next_action_at ? (
                <div>
                  <span>Due</span>
                  <strong>
                    {formatWhen(
                      proposalPayload?.due_at ||
                        proposalPayload
                          ?.next_action_at,
                    )}
                  </strong>
                </div>
              ) : null}

              {actionType ===
                  'set_deal_next_action' &&
              reminderOwnerName ? (
                <div>
                  <span>Responsible</span>
                  <strong>
                    {reminderOwnerName}
                  </strong>
                </div>
              ) : null}
            </div>

            {successCondition ? (
              <div
                className={
                  styles.successCondition
                }
              >
                <CheckCircle2 size={15} />
                <div>
                  <strong>
                    Done when
                  </strong>
                  <span>
                    {successCondition}
                  </span>
                </div>
              </div>
            ) : null}

            <div
              className={styles.guardrail}
            >
              <ShieldCheck size={16} />

              <div>
                <strong>
                  You stay in control
                </strong>
                <span>
                  {internalOnly
                    ? 'Internal only. No player, club or intermediary is contacted.'
                    : 'Nothing changes until you confirm.'}
                </span>
              </div>
            </div>

            <div
              className={styles.actions}
            >
              <button
                type="button"
                className={styles.secondary}
                onClick={onClose}
                disabled={busy}
              >
                Not now
              </button>

              <button
                type="button"
                className={styles.primary}
                onClick={() =>
                  void executeProposal()
                }
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle
                    size={15}
                    className={styles.spin}
                  />
                ) : (
                  <CheckCircle2 size={15} />
                )}

                {request.confirmationLabel ||
                  actionLabel(
                    actionType,
                    'Confirm action',
                  )}
              </button>
            </div>
          </section>
        ) : null}

        {reviewOnly &&
        mode === 'review' ? (
          <section
            className={styles.reviewOnly}
          >
            <ShieldCheck size={18} />

            <div>
              <p className={styles.eyebrow}>
                NEEDS YOU
              </p>
              <h3>
                This needs your judgement.
              </h3>
              <p>
                {result?.reason ||
                  result?.rationale ||
                  'This step needs your judgement or an action outside the workspace.'}
              </p>
            </div>
          </section>
        ) : null}

        {noAction &&
        mode === 'review' ? (
          <section
            className={styles.resolved}
          >
            <CheckCircle2 size={19} />

            <div>
              <p className={styles.eyebrow}>
                NO ACTION NEEDED
              </p>
              <h3>
                Nothing else is needed right
                now.
              </h3>
              <p>
                {result?.reason ||
                  'The latest evidence no longer calls for this action.'}
              </p>
            </div>
          </section>
        ) : null}

        {mode === 'done' ? (
          <section className={styles.done}>
            <div className={styles.doneIcon}>
              <CheckCircle2 size={23} />
            </div>

            <p className={styles.eyebrow}>
              DONE
            </p>

            <h3>
              Done. The latest view is up to
              date.
            </h3>

            <p>
              The change is saved and the
              latest view is ready.
            </p>

            <div
              className={styles.actions}
            >
              {undoSupported &&
              proposalId ? (
                <button
                  type="button"
                  className={
                    styles.secondary
                  }
                  onClick={() =>
                    void undoProposal()
                  }
                  disabled={busy}
                >
                  {busy ? (
                    <LoaderCircle
                      size={14}
                      className={
                        styles.spin
                      }
                    />
                  ) : (
                    <RotateCcw
                      size={14}
                    />
                  )}
                  Undo
                </button>
              ) : null}

              <button
                type="button"
                className={styles.primary}
                onClick={onClose}
                disabled={busy}
              >
                Done
              </button>
            </div>

            {appliedResult?.status ? (
              <small>
                {human(
                  appliedResult.status,
                )}
              </small>
            ) : null}
          </section>
        ) : null}

        {mode === 'undone' ? (
          <section
            className={styles.resolved}
          >
            <RotateCcw size={19} />

            <div>
              <p className={styles.eyebrow}>
                UNDONE
              </p>
              <h3>
                The change has been undone.
              </h3>
              <p>
                The latest view is up to date.
              </p>
            </div>
          </section>
        ) : null}

        {error ? (
          <section className={styles.error}>
            <CircleAlert size={16} />

            <div>
              <strong>
                Couldn't continue.
              </strong>
              <span>{error}</span>
            </div>

            <button
              type="button"
              className={styles.retry}
              onClick={() =>
                void prepare()
              }
              disabled={busy}
            >
              Retry
            </button>
          </section>
        ) : null}

        {showFallback ? (
          <Link
            href={
              request.fallbackHref || '#'
            }
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
      </aside>
    </div>
  );
}

function CareerProgress({
  stage,
}: {
  stage: 1 | 2 | 3;
}) {
  return (
    <div
      className={styles.careerProgress}
      aria-label="Career strategy progress"
    >
      {[
        'Strategy',
        'Player confirms',
        'Agency approves',
      ].map((label, index) => {
        const current = index + 1;

        return (
          <div
            key={label}
            className={
              current < stage
                ? styles.careerDone
                : current === stage
                  ? styles.careerActive
                  : ''
            }
          >
            <i>
              {current < stage ? (
                <CheckCircle2 size={12} />
              ) : (
                current
              )}
            </i>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
