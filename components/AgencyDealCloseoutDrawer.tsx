'use client';

import {
  CheckCircle2,
  CircleAlert,
  Coins,
  FileCheck2,
  LoaderCircle,
  ReceiptText,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { friendlyError, relativeDate } from '@/lib/platform-client';
import styles from './AgencyDealCloseoutDrawer.module.css';

export type AgencyDealCloseoutRequest = {
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

const money = (
  value: unknown,
  currency = 'EUR',
) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Not recorded';

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

export default function AgencyDealCloseoutDrawer({
  request,
  role,
  invoke,
  onClose,
  onApplied,
}: {
  request: AgencyDealCloseoutRequest;
  role: string;
  invoke: Invoke;
  onClose: () => void;
  onApplied: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(true);
  const [actionBusy, setActionBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [closeout, setCloseout] = useState<any>(null);
  const [receivables, setReceivables] = useState<any[]>([]);

  const [summary, setSummary] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [transferFee, setTransferFee] = useState('');
  const [agencyCommission, setAgencyCommission] = useState('');
  const [contractEnd, setContractEnd] = useState('');
  const [signedAgreement, setSignedAgreement] = useState(false);
  const [completionConfirmed, setCompletionConfirmed] = useState(false);
  const [playerAcknowledged, setPlayerAcknowledged] = useState(false);
  const [completionNote, setCompletionNote] = useState('');

  const [receivableAmount, setReceivableAmount] = useState('');
  const [receivableCurrency, setReceivableCurrency] = useState('EUR');
  const [receivableDue, setReceivableDue] = useState('');
  const [payerLabel, setPayerLabel] = useState('');
  const [invoiceReference, setInvoiceReference] = useState('');
  const [receivableNotes, setReceivableNotes] = useState('');
  const [receivableStatus, setReceivableStatus] = useState('scheduled');

  const [paymentTarget, setPaymentTarget] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');

  const canCollect = ['owner', 'admin', 'operations'].includes(role);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');

    try {
      const [closeoutResponse, receivableResponse] =
        await Promise.all([
          invoke('deal_closeout', {
            deal_room_id: request.dealRoomId,
          }),
          invoke('deal_receivables', {
            deal_room_id: request.dealRoomId,
            limit: 100,
          }),
        ]);

      const nextCloseout = closeoutResponse?.closeout || {};
      const nextReceivables =
        receivableResponse?.receivables || {};

      setCloseout(nextCloseout);
      setReceivables(list(nextReceivables?.items));

      const record = nextCloseout?.closeout_record || {};
      const terms =
        record?.final_terms && typeof record.final_terms === 'object'
          ? record.final_terms
          : {};

      setSummary(String(terms.summary || terms.term_summary || ''));
      setCurrency(
        String(
          terms.currency ||
            nextCloseout?.deal?.currency ||
            'EUR',
        ).toUpperCase(),
      );
      setTransferFee(
        terms.transfer_fee === null ||
        terms.transfer_fee === undefined
          ? ''
          : String(terms.transfer_fee),
      );
      setAgencyCommission(
        terms.agency_commission === null ||
        terms.agency_commission === undefined
          ? ''
          : String(terms.agency_commission),
      );
      setContractEnd(String(terms.contract_end || ''));
      setSignedAgreement(Boolean(record?.signed_agreement_recorded));
      setCompletionConfirmed(Boolean(record?.completion_confirmed));
      setPlayerAcknowledged(
        Boolean(record?.player_acknowledgement_recorded),
      );
      setCompletionNote(String(record?.completion_note || ''));

      setReceivableCurrency(
        String(nextCloseout?.deal?.currency || 'EUR').toUpperCase(),
      );
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, [invoke, request.dealRoomId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !actionBusy) {
        if (paymentTarget) setPaymentTarget(null);
        else onClose();
      }
    };

    window.addEventListener('keydown', keydown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', keydown);
    };
  }, [actionBusy, onClose, paymentTarget]);

  const deal = closeout?.deal || {};
  const checks = list(closeout?.checks);
  const record = closeout?.closeout_record || {};
  const closeoutStage =
    deal?.status === 'won' ||
    ['contracting', 'won'].includes(String(deal?.stage || ''));

  const buildTerms = () => {
    const previous =
      record?.final_terms &&
      typeof record.final_terms === 'object'
        ? record.final_terms
        : {};

    const next: Record<string, unknown> = {
      ...previous,
      summary: summary.trim(),
      currency: currency.trim().toUpperCase(),
    };

    if (transferFee.trim()) {
      next.transfer_fee = Number(transferFee);
    } else {
      delete next.transfer_fee;
    }

    if (agencyCommission.trim()) {
      next.agency_commission = Number(agencyCommission);
    } else {
      delete next.agency_commission;
    }

    if (contractEnd.trim()) {
      next.contract_end = contractEnd.trim();
    } else {
      delete next.contract_end;
    }

    return next;
  };

  const saveCloseout = async (
    status: 'draft' | 'confirmed',
  ) => {
    if (actionBusy) return;

    if (status === 'confirmed') {
      if (!closeoutStage) {
        setError(
          'A confirmed closeout is only available once the deal is recorded at contracting or won.',
        );
        return;
      }

      if (!summary.trim()) {
        setError('Record a final terms summary before confirmation.');
        return;
      }

      if (!completionConfirmed) {
        setError('Confirm factual completion before closing the deal.');
        return;
      }
    }

    setActionBusy(`closeout-${status}`);
    setError('');
    setMessage('');

    try {
      await invoke('deal_closeout_save', {
        deal_room_id: request.dealRoomId,
        input: {
          status,
          final_terms: buildTerms(),
          signed_agreement_recorded: signedAgreement,
          completion_confirmed: completionConfirmed,
          player_acknowledgement_recorded: playerAcknowledged,
          completion_note: completionNote.trim() || null,
        },
      });

      setMessage(
        status === 'confirmed'
          ? 'Deal closeout confirmed from the facts you recorded.'
          : 'Closeout draft saved. The deal has not been marked complete.',
      );

      await onApplied();
      await load();
    } catch (actionError) {
      setError(friendlyError(actionError));
    } finally {
      setActionBusy('');
    }
  };

  const createReceivable = async () => {
    if (!canCollect || actionBusy) return;

    const amount = Number(receivableAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a positive receivable amount.');
      return;
    }

    if (!receivableDue) {
      setError('A receivable due date is required.');
      return;
    }

    if (receivableCurrency.trim().length !== 3) {
      setError('Use a three-letter currency code.');
      return;
    }

    setActionBusy('receivable-create');
    setError('');
    setMessage('');

    try {
      await invoke('deal_receivable_save', {
        input: {
          deal_room_id: request.dealRoomId,
          amount,
          currency: receivableCurrency.trim().toUpperCase(),
          due_date: receivableDue,
          status: receivableStatus,
          payer_label: payerLabel.trim() || null,
          invoice_reference: invoiceReference.trim() || null,
          notes: receivableNotes.trim() || null,
        },
      });

      setReceivableAmount('');
      setReceivableDue('');
      setPayerLabel('');
      setInvoiceReference('');
      setReceivableNotes('');
      setReceivableStatus('scheduled');

      setMessage(
        'Receivable recorded from the amount and due date you entered.',
      );

      await onApplied();
      await load();
    } catch (actionError) {
      setError(friendlyError(actionError));
    } finally {
      setActionBusy('');
    }
  };

  const recordPayment = async () => {
    if (!paymentTarget || !canCollect || actionBusy) return;

    const amount = Number(paymentAmount);
    const balance = Number(paymentTarget.balance);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a positive payment amount.');
      return;
    }

    if (Number.isFinite(balance) && amount > balance) {
      setError('Payment cannot exceed the recorded receivable balance.');
      return;
    }

    setActionBusy('payment-record');
    setError('');
    setMessage('');

    try {
      await invoke('receivable_payment_record', {
        receivable_id: paymentTarget.receivable_id,
        amount,
        reference: paymentReference.trim() || null,
      });

      setPaymentTarget(null);
      setPaymentAmount('');
      setPaymentReference('');

      setMessage(
        'Payment recorded against the selected receivable.',
      );

      await onApplied();
      await load();
    } catch (actionError) {
      setError(friendlyError(actionError));
    } finally {
      setActionBusy('');
    }
  };

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget && !actionBusy) {
          onClose();
        }
      }}
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Deal closeout and commission collection"
      >
        <header className={styles.header}>
          <div className={styles.topline}>
            <span className={styles.live}>
              <i />
              Human-recorded commercial truth
            </span>

            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              disabled={Boolean(actionBusy)}
              aria-label="Close deal closeout"
            >
              <X size={18} />
            </button>
          </div>

          <p className={styles.eyebrow}>DEAL CLOSEOUT + COLLECTION</p>
          <h2>{request.title}</h2>
          <p className={styles.subhead}>
            {request.context ||
              'Record final terms, commission entitlement and actual collection without turning forecasts into facts.'}
          </p>
        </header>

        {busy ? (
          <div className={styles.notice}>
            <LoaderCircle size={18} className={styles.spin} />
            <div>
              <strong>Loading closeout control</strong>
              <span>
                Checking deal stage, completion evidence and recorded receivables.
              </span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className={`${styles.notice} ${styles.error}`}>
            <CircleAlert size={18} />
            <div>
              <strong>This record needs attention</strong>
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
                <p>CLOSEOUT POSITION</p>
                <h3>{human(closeout?.state || 'not recorded')}</h3>
                <span>
                  {closeout?.next_action?.instruction ||
                    'Review the factual closeout record and collection position.'}
                </span>
              </div>

              <div className={styles.heroSide}>
                <Coins size={18} />
                <strong>
                  {money(
                    deal.expected_commission,
                    deal.currency || 'EUR',
                  )}
                </strong>
                <span>forecast commission</span>
              </div>
            </section>

            <div className={styles.grid}>
              <Fact
                label="Deal stage"
                value={human(deal.stage || 'not recorded')}
                detail={human(deal.status || 'not recorded')}
              />
              <Fact
                label="Closeout record"
                value={human(record.status || 'not created')}
                detail={
                  record.confirmed_at
                    ? `Confirmed ${relativeDate(record.confirmed_at)}`
                    : 'No confirmed closeout'
                }
              />
              <Fact
                label="Receivables"
                value={String(receivables.length)}
                detail="Only human-recorded amounts are counted"
              />
              <Fact
                label="Open balance"
                value={money(
                  receivables.reduce(
                    (sum, item) => sum + Number(item.balance || 0),
                    0,
                  ),
                  receivables[0]?.currency || deal.currency || 'EUR',
                )}
                detail={
                  receivables.length > 1
                    ? 'Displayed in the first recorded currency; review rows below if currencies differ'
                    : 'Recorded collection balance'
                }
              />
            </div>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <FileCheck2 size={17} />
                <div>
                  <p>CLOSEOUT CHECKS</p>
                  <h3>What must be factual before the deal is closed</h3>
                </div>
              </div>

              <div className={styles.checks}>
                {checks.map((item: any) => (
                  <div
                    key={item.key}
                    className={`${styles.check} ${
                      item.state === 'ready'
                        ? styles.ready
                        : styles.gap
                    }`}
                  >
                    {item.state === 'ready' ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <CircleAlert size={15} />
                    )}

                    <div>
                      <strong>{human(item.key)}</strong>
                      <span>{item.fact}</span>
                      {item.required_action ? (
                        <small>{item.required_action}</small>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <FileCheck2 size={17} />
                <div>
                  <p>FINAL TERMS</p>
                  <h3>Record the actual agreement, not negotiation guardrails</h3>
                </div>
              </div>

              <div className={styles.formGrid}>
                <label className={styles.full}>
                  <span>Final terms summary</span>
                  <textarea
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    placeholder="What was actually agreed?"
                  />
                </label>

                <label>
                  <span>Currency</span>
                  <input
                    value={currency}
                    maxLength={3}
                    onChange={(event) =>
                      setCurrency(event.target.value.toUpperCase())
                    }
                  />
                </label>

                <label>
                  <span>Transfer / deal fee</span>
                  <input
                    type="number"
                    min="0"
                    value={transferFee}
                    onChange={(event) => setTransferFee(event.target.value)}
                    placeholder="Optional"
                  />
                </label>

                <label>
                  <span>Agency commission</span>
                  <input
                    type="number"
                    min="0"
                    value={agencyCommission}
                    onChange={(event) =>
                      setAgencyCommission(event.target.value)
                    }
                    placeholder="Optional agreed amount"
                  />
                </label>

                <label>
                  <span>Contract end</span>
                  <input
                    type="date"
                    value={contractEnd}
                    onChange={(event) => setContractEnd(event.target.value)}
                  />
                </label>

                <label className={styles.full}>
                  <span>Completion note</span>
                  <textarea
                    value={completionNote}
                    onChange={(event) =>
                      setCompletionNote(event.target.value)
                    }
                    placeholder="Optional factual completion note"
                  />
                </label>
              </div>

              <div className={styles.flags}>
                <label>
                  <input
                    type="checkbox"
                    checked={signedAgreement}
                    onChange={(event) =>
                      setSignedAgreement(event.target.checked)
                    }
                  />
                  Signed agreement is recorded in agency files
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={playerAcknowledged}
                    onChange={(event) =>
                      setPlayerAcknowledged(event.target.checked)
                    }
                  />
                  Player acknowledgement is recorded
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={completionConfirmed}
                    onChange={(event) =>
                      setCompletionConfirmed(event.target.checked)
                    }
                  />
                  Operational completion is factually confirmed
                </label>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => void saveCloseout('draft')}
                  disabled={Boolean(actionBusy)}
                >
                  Save closeout draft
                </button>

                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => void saveCloseout('confirmed')}
                  disabled={
                    Boolean(actionBusy) ||
                    !closeoutStage ||
                    !summary.trim() ||
                    !completionConfirmed
                  }
                >
                  <CheckCircle2 size={15} />
                  Confirm closeout
                </button>
              </div>

              {!closeoutStage ? (
                <p className={styles.truth}>
                  Confirmation stays locked until the live deal itself is recorded at contracting or won.
                </p>
              ) : null}

              <p className={styles.truth}>
                Operational closeout is an agency record. It is not legal certification of registration, transfer validity or contract enforceability.
              </p>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <ReceiptText size={17} />
                <div>
                  <p>COMMISSION COLLECTION</p>
                  <h3>Turn an agreed entitlement into a receivable only when a human records it</h3>
                </div>
              </div>

              {receivables.length ? (
                <div className={styles.receivableRows}>
                  {receivables.map((item: any) => {
                    const paymentOpen =
                      canCollect &&
                      !['paid', 'waived', 'cancelled'].includes(
                        String(item.status || ''),
                      ) &&
                      Number(item.balance || 0) > 0;

                    return (
                      <article
                        className={styles.receivable}
                        key={item.receivable_id}
                      >
                        <div>
                          <div className={styles.receivableTitle}>
                            <strong>
                              {money(item.amount, item.currency)}
                            </strong>
                            <span>{human(item.status)}</span>
                          </div>

                          <p>
                            {item.payer || 'Payer not labelled'} · due{' '}
                            {item.due_date || 'not recorded'}
                          </p>

                          <small>
                            {money(item.amount_paid, item.currency)} paid ·{' '}
                            {money(item.balance, item.currency)} outstanding
                            {item.invoice_reference
                              ? ` · ${item.invoice_reference}`
                              : ''}
                          </small>
                        </div>

                        {paymentOpen ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentTarget(item);
                              setPaymentAmount(String(item.balance || ''));
                              setPaymentReference('');
                            }}
                          >
                            Record payment
                          </button>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.empty}>
                  <ReceiptText size={17} />
                  <div>
                    <strong>No receivable is recorded for this deal.</strong>
                    <span>
                      Forecast commission remains separate until an authorised user records the actual entitlement and due date.
                    </span>
                  </div>
                </div>
              )}

              {canCollect ? (
                <>
                  <div className={styles.formGrid}>
                    <label>
                      <span>Receivable amount</span>
                      <input
                        type="number"
                        min="0"
                        value={receivableAmount}
                        onChange={(event) =>
                          setReceivableAmount(event.target.value)
                        }
                      />
                    </label>

                    <label>
                      <span>Currency</span>
                      <input
                        value={receivableCurrency}
                        maxLength={3}
                        onChange={(event) =>
                          setReceivableCurrency(
                            event.target.value.toUpperCase(),
                          )
                        }
                      />
                    </label>

                    <label>
                      <span>Due date</span>
                      <input
                        type="date"
                        value={receivableDue}
                        onChange={(event) =>
                          setReceivableDue(event.target.value)
                        }
                      />
                    </label>

                    <label>
                      <span>Status</span>
                      <select
                        value={receivableStatus}
                        onChange={(event) =>
                          setReceivableStatus(event.target.value)
                        }
                      >
                        <option value="draft">Draft</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="invoiced">Invoiced</option>
                      </select>
                    </label>

                    <label>
                      <span>Payer label</span>
                      <input
                        value={payerLabel}
                        onChange={(event) =>
                          setPayerLabel(event.target.value)
                        }
                        placeholder="Club, player, intermediary, other"
                      />
                    </label>

                    <label>
                      <span>Invoice reference</span>
                      <input
                        value={invoiceReference}
                        onChange={(event) =>
                          setInvoiceReference(event.target.value)
                        }
                        placeholder="Optional"
                      />
                    </label>

                    <label className={styles.full}>
                      <span>Collection note</span>
                      <textarea
                        value={receivableNotes}
                        onChange={(event) =>
                          setReceivableNotes(event.target.value)
                        }
                        placeholder="Optional operating note"
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => void createReceivable()}
                    disabled={Boolean(actionBusy)}
                  >
                    <Coins size={15} />
                    Record receivable
                  </button>
                </>
              ) : (
                <p className={styles.truth}>
                  Owner, admin or operations access is required to create receivables or record payments.
                </p>
              )}

              <p className={styles.truth}>
                Expected commission is a forecast only. Receivables are human-recorded collection controls, not tax invoices or accounting ledger entries.
              </p>
            </section>
          </div>
        ) : null}

        {paymentTarget ? (
          <div className={styles.confirmBar}>
            <div>
              <p>RECORD PAYMENT</p>
              <strong>
                {money(paymentTarget.balance, paymentTarget.currency)} currently outstanding
              </strong>
              <span>
                Enter only money actually received. The backend blocks payments above the remaining receivable balance.
              </span>
            </div>

            <div className={styles.paymentFields}>
              <input
                type="number"
                min="0"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                aria-label="Payment amount"
              />
              <input
                value={paymentReference}
                onChange={(event) =>
                  setPaymentReference(event.target.value)
                }
                placeholder="Reference"
                aria-label="Payment reference"
              />
            </div>

            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setPaymentTarget(null)}
                disabled={Boolean(actionBusy)}
              >
                Cancel
              </button>

              <button
                type="button"
                className={styles.primary}
                onClick={() => void recordPayment()}
                disabled={Boolean(actionBusy)}
              >
                {actionBusy === 'payment-record' ? (
                  <LoaderCircle size={15} className={styles.spin} />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                Confirm payment
              </button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
