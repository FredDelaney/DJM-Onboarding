'use client';

import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Network,
  ShieldCheck,
  Target,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import { friendlyError, relativeDate } from '@/lib/platform-client';
import styles from './AgencyNegotiationCommandRoom.module.css';

export type AgencyNegotiationRequest = {
  key: string;
  dealRoomId: string;
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

const numeric = (value: unknown, fallback = '-') => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? String(Math.round(parsed))
    : fallback;
};

const money = (
  value: unknown,
  currency = 'EUR',
) => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 'Not recorded';
  }

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

const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const joinLines = (value: unknown) =>
  list(value)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n');

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

export default function AgencyNegotiationCommandRoom({
  request,
  role,
  invoke,
  onClose,
  onOpenAction,
  onApplied,
}: {
  request: AgencyNegotiationRequest;
  role: string;
  invoke: Invoke;
  onClose: () => void;
  onOpenAction: (
    request: AgencyActionRequest,
  ) => void;
  onApplied: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(true);
  const [actionBusy, setActionBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [brief, setBrief] = useState<any>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [sequence, setSequence] = useState<any>(null);
  const [decisionMap, setDecisionMap] = useState<any>(null);
  const [pressure, setPressure] = useState<any>(null);
  const [guardrails, setGuardrails] = useState<any>(null);
  const [origin, setOrigin] = useState<any>(null);

  const [targetOutcome, setTargetOutcome] = useState('');
  const [acceptableFallback, setAcceptableFallback] = useState('');
  const [targetFee, setTargetFee] = useState('');
  const [minimumFee, setMinimumFee] = useState('');
  const [salaryTarget, setSalaryTarget] = useState('');
  const [salaryMinimum, setSalaryMinimum] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [salaryPeriod, setSalaryPeriod] = useState('');
  const [salaryTaxBasis, setSalaryTaxBasis] = useState('');
  const [preferredStructure, setPreferredStructure] = useState('');
  const [concessionOrder, setConcessionOrder] = useState('');
  const [nonNegotiables, setNonNegotiables] = useState('');
  const [walkAway, setWalkAway] = useState('');
  const [openDecisions, setOpenDecisions] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmApprove, setConfirmApprove] = useState(false);

  const canEdit = ['owner', 'admin', 'agent'].includes(role);
  const canApprove = ['owner', 'admin'].includes(role);

  const applyGuardrailFields = useCallback((response: any) => {
    const record = response?.guardrails || {};

    setTargetOutcome(String(record.target_outcome || ''));
    setAcceptableFallback(String(record.acceptable_fallback || ''));
    setTargetFee(
      record.target_transfer_fee === null ||
      record.target_transfer_fee === undefined
        ? ''
        : String(record.target_transfer_fee),
    );
    setMinimumFee(
      record.minimum_transfer_fee === null ||
      record.minimum_transfer_fee === undefined
        ? ''
        : String(record.minimum_transfer_fee),
    );
    setSalaryTarget(
      record.player_salary_target === null ||
      record.player_salary_target === undefined
        ? ''
        : String(record.player_salary_target),
    );
    setSalaryMinimum(
      record.player_salary_minimum === null ||
      record.player_salary_minimum === undefined
        ? ''
        : String(record.player_salary_minimum),
    );
    setCurrency(String(record.currency || 'EUR').toUpperCase());
    setSalaryPeriod(String(record.salary_period || ''));
    setSalaryTaxBasis(String(record.salary_tax_basis || ''));
    setPreferredStructure(String(record.preferred_structure || ''));
    setConcessionOrder(joinLines(record.concession_order));
    setNonNegotiables(joinLines(record.non_negotiables));
    setWalkAway(joinLines(record.walk_away_conditions));
    setOpenDecisions(joinLines(record.open_decisions));
    setNotes(String(record.notes || ''));
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');

    try {
      const [
        briefResult,
        readinessResult,
        sequenceResult,
        mapResult,
        pressureResult,
        guardrailResult,
        originResult,
      ] = await Promise.all([
        invoke('negotiation_brief', {
          deal_room_id: request.dealRoomId,
        }),
        invoke('negotiation_readiness', {
          deal_room_id: request.dealRoomId,
        }),
        invoke('negotiation_sequence', {
          deal_room_id: request.dealRoomId,
        }),
        invoke('deal_decision_map', {
          deal_room_id: request.dealRoomId,
        }),
        invoke('deal_decision_pressure', {
          deal_room_id: request.dealRoomId,
        }),
        invoke('deal_guardrails', {
          deal_room_id: request.dealRoomId,
        }),
        invoke('deal_origin', {
          deal_room_id: request.dealRoomId,
        }),
      ]);

      const nextGuardrails =
        guardrailResult?.guardrails || null;

      setBrief(briefResult?.brief || null);
      setReadiness(readinessResult?.negotiation || null);
      setSequence(sequenceResult?.sequence || null);
      setDecisionMap(mapResult?.decision_map || null);
      setPressure(pressureResult?.pressure || null);
      setGuardrails(nextGuardrails);
      setOrigin(originResult?.origin || null);

      applyGuardrailFields(nextGuardrails);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, [
    applyGuardrailFields,
    invoke,
    request.dealRoomId,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const previous =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    const keydown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === 'Escape' &&
        !actionBusy
      ) {
        if (confirmApprove) {
          setConfirmApprove(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener(
      'keydown',
      keydown,
    );

    return () => {
      document.body.style.overflow =
        previous;

      window.removeEventListener(
        'keydown',
        keydown,
      );
    };
  }, [
    actionBusy,
    confirmApprove,
    onClose,
  ]);

  const deal =
    brief?.known_recorded_facts?.deal || {};

  const terms =
    brief?.known_recorded_facts?.recorded_terms || {};

  const nextStep =
    sequence?.next_step || null;

  const people =
    list(decisionMap?.people);

  const humanDecisions =
    list(brief?.human_decisions_required);

  const unknowns =
    list(brief?.unresolved_or_unrecorded);

  const guardrailRecord =
    guardrails?.guardrails || {};

  const guardrailState =
    guardrails?.state || 'not recorded';

  const originRecord =
    origin?.origin || {};

  const readinessGaps =
    list(readiness?.gaps);

  const validateNumericPair = (
    target: string,
    minimum: string,
    label: string,
  ) => {
    const targetNumber =
      target.trim() === ''
        ? null
        : Number(target);

    const minimumNumber =
      minimum.trim() === ''
        ? null
        : Number(minimum);

    if (
      targetNumber !== null &&
      (!Number.isFinite(targetNumber) ||
        targetNumber < 0)
    ) {
      throw new Error(
        `${label} target must be a non-negative number.`,
      );
    }

    if (
      minimumNumber !== null &&
      (!Number.isFinite(minimumNumber) ||
        minimumNumber < 0)
    ) {
      throw new Error(
        `${label} minimum must be a non-negative number.`,
      );
    }

    if (
      targetNumber !== null &&
      minimumNumber !== null &&
      targetNumber < minimumNumber
    ) {
      throw new Error(
        `${label} target must be at least the minimum.`,
      );
    }

    return {
      targetNumber,
      minimumNumber,
    };
  };

  const saveGuardrails = async () => {
    if (!canEdit || actionBusy) return;

    setActionBusy('save-guardrails');
    setError('');
    setMessage('');

    try {
      const fees = validateNumericPair(
        targetFee,
        minimumFee,
        'Transfer fee',
      );

      const salary = validateNumericPair(
        salaryTarget,
        salaryMinimum,
        'Salary',
      );

      const hasNumeric =
        fees.targetNumber !== null ||
        fees.minimumNumber !== null ||
        salary.targetNumber !== null ||
        salary.minimumNumber !== null;

      if (
        hasNumeric &&
        currency.trim().length !== 3
      ) {
        throw new Error(
          'Use a three-letter currency code for numeric guardrails.',
        );
      }

      const existingCommission =
        guardrailRecord?.commission_guardrail &&
        typeof guardrailRecord.commission_guardrail === 'object'
          ? guardrailRecord.commission_guardrail
          : {};

      await invoke(
        'deal_guardrails_save',
        {
          deal_room_id:
            request.dealRoomId,
          guardrails: {
            target_outcome:
              targetOutcome.trim() || null,
            acceptable_fallback:
              acceptableFallback.trim() || null,
            target_transfer_fee:
              fees.targetNumber,
            minimum_transfer_fee:
              fees.minimumNumber,
            player_salary_target:
              salary.targetNumber,
            player_salary_minimum:
              salary.minimumNumber,
            currency:
              hasNumeric
                ? currency
                    .trim()
                    .toUpperCase()
                : currency.trim()
                  ? currency
                      .trim()
                      .toUpperCase()
                  : null,
            salary_period:
              salaryPeriod.trim() || null,
            salary_tax_basis:
              salaryTaxBasis.trim() || null,
            commission_guardrail:
              existingCommission,
            preferred_structure:
              preferredStructure.trim() ||
              null,
            concession_order:
              splitLines(
                concessionOrder,
              ),
            non_negotiables:
              splitLines(
                nonNegotiables,
              ),
            walk_away_conditions:
              splitLines(walkAway),
            open_decisions:
              splitLines(
                openDecisions,
              ),
            notes:
              notes.trim() || null,
          },
        },
      );

      setMessage(
        'Private negotiation guardrails saved as a draft. No term was sent or accepted.',
      );

      await onApplied();
      await load();
    } catch (actionError) {
      setError(
        friendlyError(actionError),
      );
    } finally {
      setActionBusy('');
    }
  };

  const approveGuardrails = async () => {
    if (
      !canApprove ||
      actionBusy
    ) {
      return;
    }

    setActionBusy(
      'approve-guardrails',
    );
    setError('');
    setMessage('');

    try {
      await invoke(
        'deal_guardrails_approve',
        {
          deal_room_id:
            request.dealRoomId,
        },
      );

      setConfirmApprove(false);

      setMessage(
        'Negotiation guardrails approved as the current internal operating limits.',
      );

      await onApplied();
      await load();
    } catch (actionError) {
      setError(
        friendlyError(actionError),
      );
    } finally {
      setActionBusy('');
    }
  };

  const prepareNextStep = () => {
    if (!nextStep) return;

    if (
      nextStep.step_type ===
      'set_negotiation_guardrails'
    ) {
      setMessage(
        'Record the private negotiation guardrails below before advancing.',
      );
      return;
    }

    if (
      nextStep.step_type ===
      'prepare_negotiation_brief'
    ) {
      setMessage(
        'The negotiation brief is ready for human review in this room. ReDream will not invent positions that are not recorded.',
      );
      return;
    }

    onOpenAction({
      key:
        `negotiation-step:${request.dealRoomId}:${nextStep.step_type}`,
      eyebrow:
        'NEGOTIATION PREPARATION',
      title: request.title,
      instruction:
        nextStep.instruction ||
        'Close the highest-priority recorded negotiation-preparation gap.',
      label:
        'Prepare negotiation step',
      action:
        'negotiation_next_step_prepare',
      payload: {
        deal_room_id:
          request.dealRoomId,
      },
      context: human(
        readiness?.state ||
          'preparation',
      ),
      facts: [
        {
          label: 'Readiness',
          value:
            `${numeric(readiness?.score)} / 100`,
          detail:
            'Internal preparation completeness, not signing probability',
        },
        {
          label: 'Step',
          value: human(
            nextStep.step_type ||
              'preparation',
          ),
          detail:
            nextStep.target_gap ||
            null,
        },
        {
          label: 'Deal stage',
          value: human(
            deal.stage ||
              request.context ||
              'recorded',
          ),
        },
      ],
      successCondition:
        nextStep.success_condition ||
        'The recorded preparation gap is resolved or explicitly documented.',
      confirmationLabel:
        'Create preparation task',
    });
  };

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          !actionBusy
        ) {
          onClose();
        }
      }}
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Negotiation Command Room"
      >
        <header className={styles.header}>
          <div className={styles.topline}>
            <span className={styles.live}>
              <i />
              Private negotiation control
            </span>

            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              disabled={Boolean(
                actionBusy,
              )}
              aria-label="Close Negotiation Command Room"
            >
              <X size={18} />
            </button>
          </div>

          <p className={styles.eyebrow}>
            NEGOTIATION COMMAND ROOM
          </p>

          <h2>{request.title}</h2>

          <p className={styles.subhead}>
            {request.context ||
              'Prepare the negotiation from recorded facts, private human-set limits and the real decision route.'}
          </p>
        </header>

        {busy ? (
          <div className={styles.notice}>
            <LoaderCircle
              size={18}
              className={styles.spin}
            />
            <div>
              <strong>
                Building the negotiation picture
              </strong>
              <span>
                Readiness, guardrails, decision-makers, pressure and provenance are being refreshed.
              </span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div
            className={`${styles.notice} ${styles.error}`}
          >
            <CircleAlert size={18} />
            <div>
              <strong>
                Negotiation control needs attention
              </strong>
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        {message ? (
          <div
            className={`${styles.notice} ${styles.success}`}
          >
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
                <p>NEGOTIATION READINESS</p>
                <h3>
                  {human(
                    readiness?.state ||
                      'not assessed',
                  )}
                </h3>
                <span>
                  {nextStep?.instruction ||
                    brief?.readiness_statement ||
                    'Review the recorded facts before advancing.'}
                </span>
              </div>

              <div className={styles.heroScore}>
                <ShieldCheck size={18} />
                <strong>
                  {numeric(
                    readiness?.score,
                  )}
                </strong>
                <span>
                  preparation completeness
                </span>
              </div>
            </section>

            <div className={styles.grid}>
              <Fact
                label="Deal stage"
                value={human(
                  deal.stage ||
                    request.context ||
                    'recorded',
                )}
                detail={
                  deal.primary_blocker ||
                  null
                }
              />
              <Fact
                label="Decision pressure"
                value={human(
                  pressure?.state ||
                    'not recorded',
                )}
                detail={
                  pressure
                    ?.recommended_action ||
                  null
                }
              />
              <Fact
                label="Guardrails"
                value={human(
                  guardrailState,
                )}
                detail={
                  guardrails
                    ?.required_for_stage
                    ? 'Required for the current deal stage'
                    : 'Private internal control'
                }
              />
              <Fact
                label="Deal origin"
                value={human(
                  originRecord.route_type ||
                    origin?.state ||
                    'not recorded',
                )}
                detail={
                  originRecord
                    .intermediary_person_name ||
                  originRecord
                    .source_person_name ||
                  null
                }
              />
            </div>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <Target size={17} />
                <div>
                  <p>PREPARATION SEQUENCE</p>
                  <h3>
                    Close uncertainty in dependency order
                  </h3>
                </div>
              </div>

              <div className={styles.steps}>
                {list(sequence?.steps)
                  .slice(0, 8)
                  .map((step: any) => (
                    <article
                      key={`${step.step}:${step.step_type}`}
                      className={styles.step}
                    >
                      <span>
                        {step.step}
                      </span>
                      <div>
                        <strong>
                          {human(
                            step.step_type,
                          )}
                        </strong>
                        <p>
                          {step.instruction}
                        </p>
                        <small>
                          {human(
                            step.priority ||
                              'recorded',
                          )}
                          {step.target_gap
                            ? ` · ${human(step.target_gap)}`
                            : ''}
                        </small>
                      </div>
                    </article>
                  ))}
              </div>

              {nextStep ? (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={prepareNextStep}
                >
                  <ArrowRight size={15} />
                  {nextStep.step_type ===
                  'set_negotiation_guardrails'
                    ? 'Record guardrails below'
                    : nextStep.step_type ===
                        'prepare_negotiation_brief'
                      ? 'Review negotiation brief'
                      : 'Prepare next step'}
                </button>
              ) : null}

              <p className={styles.truth}>
                Completing a task does not prove the underlying negotiation gap is resolved. The sequence stays tied to recorded evidence.
              </p>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <Users size={17} />
                <div>
                  <p>DECISION ROUTE</p>
                  <h3>
                    Who can move this deal and how the agency can reach them
                  </h3>
                </div>
              </div>

              <div className={styles.rows}>
                {people
                  .slice(0, 5)
                  .map((person: any) => (
                    <article
                      key={person.person_id}
                      className={styles.row}
                    >
                      <div>
                        <strong>
                          {person.name}
                        </strong>
                        <span>
                          {person.role_title ||
                            'Role not recorded'}
                          {' '}·{' '}
                          {human(
                            person.route_mode ||
                              'recorded route',
                          )}
                        </span>
                        <small>
                          {person
                            .recommended_access_action ||
                            person
                              .direct_route
                              ?.why_this_route ||
                            'No route instruction recorded'}
                        </small>
                      </div>

                      <div
                        className={
                          styles.routeScore
                        }
                      >
                        <strong>
                          {numeric(
                            person.best_route_score,
                          )}
                        </strong>
                        <span>
                          route rank
                        </span>
                      </div>
                    </article>
                  ))}

                {!people.length ? (
                  <div className={styles.empty}>
                    <Network size={17} />
                    <div>
                      <strong>
                        No decision-maker route is recorded.
                      </strong>
                      <span>
                        ReDream will not invent signing authority or club hierarchy.
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <p className={styles.truth}>
                Role proximity comes from recorded job titles. It does not prove formal signing authority or final decision ownership.
              </p>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <ShieldCheck size={17} />
                <div>
                  <p>PRIVATE GUARDRAILS</p>
                  <h3>
                    Human-set objectives, limits and concession order
                  </h3>
                </div>
              </div>

              <div className={styles.formGrid}>
                <label className={styles.full}>
                  <span>Target outcome</span>
                  <textarea
                    value={targetOutcome}
                    onChange={(event) =>
                      setTargetOutcome(
                        event.target.value,
                      )
                    }
                    disabled={!canEdit}
                    placeholder="What outcome are we trying to achieve?"
                  />
                </label>

                <label className={styles.full}>
                  <span>Acceptable fallback</span>
                  <textarea
                    value={acceptableFallback}
                    onChange={(event) =>
                      setAcceptableFallback(
                        event.target.value,
                      )
                    }
                    disabled={!canEdit}
                    placeholder="What fallback would still be acceptable?"
                  />
                </label>

                <label>
                  <span>Currency</span>
                  <input
                    value={currency}
                    maxLength={3}
                    onChange={(event) =>
                      setCurrency(
                        event.target.value.toUpperCase(),
                      )
                    }
                    disabled={!canEdit}
                  />
                </label>

                <label>
                  <span>Preferred structure</span>
                  <input
                    value={preferredStructure}
                    onChange={(event) =>
                      setPreferredStructure(
                        event.target.value,
                      )
                    }
                    disabled={!canEdit}
                    placeholder="Optional"
                  />
                </label>

                <label>
                  <span>Target transfer fee</span>
                  <input
                    type="number"
                    min="0"
                    value={targetFee}
                    onChange={(event) =>
                      setTargetFee(
                        event.target.value,
                      )
                    }
                    disabled={!canEdit}
                  />
                </label>

                <label>
                  <span>Minimum transfer fee</span>
                  <input
                    type="number"
                    min="0"
                    value={minimumFee}
                    onChange={(event) =>
                      setMinimumFee(
                        event.target.value,
                      )
                    }
                    disabled={!canEdit}
                  />
                </label>

                <label>
                  <span>Salary target</span>
                  <input
                    type="number"
                    min="0"
                    value={salaryTarget}
                    onChange={(event) =>
                      setSalaryTarget(
                        event.target.value,
                      )
                    }
                    disabled={!canEdit}
                  />
                </label>

                <label>
                  <span>Salary minimum</span>
                  <input
                    type="number"
                    min="0"
                    value={salaryMinimum}
                    onChange={(event) =>
                      setSalaryMinimum(
                        event.target.value,
                      )
                    }
                    disabled={!canEdit}
                  />
                </label>

                <label>
                  <span>Salary period</span>
                  <input
                    value={salaryPeriod}
                    onChange={(event) =>
                      setSalaryPeriod(
                        event.target.value,
                      )
                    }
                    disabled={!canEdit}
                    placeholder="Monthly, weekly, annual..."
                  />
                </label>

                <label>
                  <span>Salary tax basis</span>
                  <input
                    value={salaryTaxBasis}
                    onChange={(event) =>
                      setSalaryTaxBasis(
                        event.target.value,
                      )
                    }
                    disabled={!canEdit}
                    placeholder="Gross, net, unknown..."
                  />
                </label>

                <label className={styles.full}>
                  <span>Non-negotiables · one per line</span>
                  <textarea
                    value={nonNegotiables}
                    onChange={(event) =>
                      setNonNegotiables(
                        event.target.value,
                      )
                    }
                    disabled={!canEdit}
                  />
                </label>

                <label className={styles.full}>
                  <span>Walk-away conditions · one per line</span>
                  <textarea
                    value={walkAway}
                    onChange={(event) =>
                      setWalkAway(
                        event.target.value,
                      )
                    }
                    disabled={!canEdit}
                  />
                </label>

                <label className={styles.full}>
                  <span>Concession order · one per line</span>
                  <textarea
                    value={concessionOrder}
                    onChange={(event) =>
                      setConcessionOrder(
                        event.target.value,
                      )
                    }
                    disabled={!canEdit}
                  />
                </label>

                <label className={styles.full}>
                  <span>Open decisions · one per line</span>
                  <textarea
                    value={openDecisions}
                    onChange={(event) =>
                      setOpenDecisions(
                        event.target.value,
                      )
                    }
                    disabled={!canEdit}
                  />
                </label>

                <label className={styles.full}>
                  <span>Internal notes</span>
                  <textarea
                    value={notes}
                    onChange={(event) =>
                      setNotes(
                        event.target.value,
                      )
                    }
                    disabled={!canEdit}
                  />
                </label>
              </div>

              <div className={styles.actions}>
                {canEdit ? (
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() =>
                      void saveGuardrails()
                    }
                    disabled={Boolean(
                      actionBusy,
                    )}
                  >
                    {actionBusy ===
                    'save-guardrails' ? (
                      <LoaderCircle
                        size={15}
                        className={
                          styles.spin
                        }
                      />
                    ) : (
                      <ShieldCheck
                        size={15}
                      />
                    )}
                    {guardrailRecord.status ===
                    'approved'
                      ? 'Edit & save as draft'
                      : 'Save guardrail draft'}
                  </button>
                ) : null}

                {canApprove &&
                guardrailRecord.status ===
                  'draft' ? (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() =>
                      setConfirmApprove(
                        true,
                      )
                    }
                  >
                    <CheckCircle2
                      size={15}
                    />
                    Review approval
                  </button>
                ) : null}
              </div>

              {!canEdit ? (
                <p className={styles.truth}>
                  This role can review negotiation control but cannot edit private deal guardrails.
                </p>
              ) : null}

              <p className={styles.truth}>
                The platform never invents negotiation floors, targets, concessions or walk-away terms. These fields are private human-set operating limits and are not proof of client consent, legal authority or enforceability.
              </p>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <Target size={17} />
                <div>
                  <p>KNOWN FACTS & OPEN QUESTIONS</p>
                  <h3>
                    Keep negotiation positions separate from what is actually recorded
                  </h3>
                </div>
              </div>

              <div className={styles.grid}>
                <Fact
                  label="Recorded fee"
                  value={money(
                    terms.transfer_fee,
                    terms.currency ||
                      'EUR',
                  )}
                />
                <Fact
                  label="Recorded salary"
                  value={money(
                    terms.player_salary,
                    terms.currency ||
                      'EUR',
                  )}
                  detail={
                    terms.salary_period ||
                    'Period not recorded'
                  }
                />
                <Fact
                  label="Expected commission"
                  value={money(
                    terms.expected_commission,
                    terms.currency ||
                      'EUR',
                  )}
                  detail="Forecast, not agreed entitlement"
                />
                <Fact
                  label="Blocking gaps"
                  value={numeric(
                    readinessGaps.length,
                    '0',
                  )}
                  detail={
                    readinessGaps[0]
                      ? human(
                          readinessGaps[0],
                        )
                      : 'None recorded'
                  }
                />
              </div>

              <div className={styles.questionGrid}>
                <div>
                  <span>HUMAN DECISIONS REQUIRED</span>
                  {humanDecisions
                    .slice(0, 6)
                    .map(
                      (
                        item: string,
                        index: number,
                      ) => (
                        <p
                          key={`${index}:${item}`}
                        >
                          {item}
                        </p>
                      ),
                    )}
                </div>

                <div>
                  <span>UNKNOWN OR UNRECORDED</span>
                  {unknowns
                    .slice(0, 8)
                    .map(
                      (
                        item: string,
                        index: number,
                      ) => (
                        <p
                          key={`${index}:${item}`}
                        >
                          {human(item)}
                        </p>
                      ),
                    )}
                </div>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <Network size={17} />
                <div>
                  <p>PROVENANCE</p>
                  <h3>
                    Where this opportunity actually came from
                  </h3>
                </div>
              </div>

              <div className={styles.grid}>
                <Fact
                  label="Origin"
                  value={human(
                    originRecord.route_type ||
                      origin?.state ||
                      'not recorded',
                  )}
                  detail={
                    originRecord
                      .origin_note ||
                    null
                  }
                />
                <Fact
                  label="Introduced by"
                  value={
                    originRecord
                      .intermediary_person_name ||
                    'Not recorded'
                  }
                  detail={
                    originRecord
                      .source_person_name
                      ? `Source contact: ${originRecord.source_person_name}`
                      : null
                  }
                />
              </div>

              <p className={styles.truth}>
                Deal origin is explicit agency provenance. It is not inferred from whichever contact is currently attached to the deal, and it does not explain why a deal succeeds or fails.
              </p>
            </section>

            <p className={styles.truth}>
              Negotiation Command Room is internal preparation support. It is not legal advice, regulatory clearance, authority confirmation, bargaining-power analysis or a prediction of signing outcome.
            </p>
          </div>
        ) : null}

        {confirmApprove ? (
          <div className={styles.confirmBar}>
            <div>
              <p>CONFIRM INTERNAL GUARDRAILS</p>
              <strong>
                Approve these private negotiation limits?
              </strong>
              <span>
                Approval marks the current draft as the agency’s internal operating limits for this deal. It does not send, accept or legally bind any term.
              </span>
            </div>

            <div
              className={
                styles.confirmActions
              }
            >
              <button
                type="button"
                className={styles.secondary}
                onClick={() =>
                  setConfirmApprove(
                    false,
                  )
                }
                disabled={Boolean(
                  actionBusy,
                )}
              >
                Cancel
              </button>

              <button
                type="button"
                className={styles.primary}
                onClick={() =>
                  void approveGuardrails()
                }
                disabled={Boolean(
                  actionBusy,
                )}
              >
                {actionBusy ===
                'approve-guardrails' ? (
                  <LoaderCircle
                    size={15}
                    className={
                      styles.spin
                    }
                  />
                ) : (
                  <CheckCircle2
                    size={15}
                  />
                )}
                Approve guardrails
              </button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
