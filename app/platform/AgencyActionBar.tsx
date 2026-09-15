'use client';

import {
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { djmInvoke, friendlyError } from '@/lib/djm-os';

import styles from './AgencyActionBar.module.css';

export type CustomerActionDescriptor = {
  key?: string | null;
  label?: string | null;
  mode?: 'focus' | 'execute' | null;
  target?: string | null;
  action?: string | null;
  can_execute?: boolean | null;
  requires_confirmation?: boolean | null;
  blocked_reason?: string | null;
};

export type CustomerActionSurface = {
  attention?: {
    requires_action?: boolean | null;
    state?: string | null;
    label?: string | null;
    why_now?: string | null;
    source?: string | null;
  } | null;
  attention_action?: CustomerActionDescriptor | null;
  evidence_action?: CustomerActionDescriptor | null;
  go_live_guard?: {
    allowed?: boolean | null;
    blocked_reason?: string | null;
    launch_ready?: boolean | null;
    first_value_ready?: boolean | null;
    contracted_monthly_cents?: number | null;
    plan_status?: string | null;
    serious_incidents?: number | null;
  } | null;
};

const sameAction = (
  left?: CustomerActionDescriptor | null,
  right?: CustomerActionDescriptor | null,
) =>
  Boolean(
    left?.key &&
      right?.key &&
      left.key === right.key &&
      left.target === right.target,
  );

export default function AgencyActionBar({
  tenantId,
  agencyName,
  surface,
  onFocus,
  onRefresh,
  onNotice,
  onError,
}: {
  tenantId: string;
  agencyName: string;
  surface?: CustomerActionSurface | null;
  onFocus: (target: string) => void;
  onRefresh: () => Promise<void>;
  onNotice: (value: string) => void;
  onError: (value: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const primary = useMemo(
    () =>
      surface?.attention?.requires_action
        ? surface?.attention_action || surface?.evidence_action || null
        : surface?.evidence_action || null,
    [surface],
  );

  const secondary =
    surface?.attention?.requires_action &&
    surface?.evidence_action &&
    !sameAction(primary, surface.evidence_action)
      ? surface.evidence_action
      : null;

  if (!primary) return null;

  const run = async (action: CustomerActionDescriptor) => {
    if (busy) return;

    if (action.mode === 'focus') {
      if (action.target) onFocus(action.target);
      return;
    }

    if (action.mode !== 'execute' || !action.action) return;

    if (action.requires_confirmation && !confirming) {
      setConfirming(true);
      return;
    }

    setBusy(true);
    onError('');

    try {
      if (action.action === 'go_live_customer') {
        await djmInvoke('platform-ops', {
          action: 'go_live_customer',
          tenant_id: tenantId,
        });
        onNotice(`${agencyName} is now live.`);
      } else {
        throw new Error('This operator action is not supported yet.');
      }

      setConfirming(false);
      await onRefresh();
    } catch (error) {
      onError(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-label="Operator action">
      <div className={styles.copy}>
        <span className={styles.kicker}>
          {surface?.attention?.requires_action ? 'ACTION DUE' : 'BEST NEXT ACTION'}
        </span>
        <strong>
          {surface?.attention?.requires_action
            ? surface.attention.label || primary.label
            : primary.label}
        </strong>
        <p>
          {surface?.attention?.why_now ||
            'Take the shortest action that can change the underlying customer evidence.'}
        </p>
      </div>

      {!confirming ? (
        <div className={styles.actions}>
          {secondary ? (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void run(secondary)}
              disabled={busy}
            >
              {secondary.label || 'Open control'}
            </button>
          ) : null}

          <button
            type="button"
            className={styles.primary}
            onClick={() => void run(primary)}
            disabled={busy}
          >
            {busy ? (
              <LoaderCircle size={14} className={styles.spin} />
            ) : primary.mode === 'execute' ? (
              <ShieldCheck size={14} />
            ) : (
              <ArrowRight size={14} />
            )}
            {primary.label || 'Take action'}
          </button>
        </div>
      ) : (
        <div className={styles.confirm}>
          <div>
            <CheckCircle2 size={15} />
            <p>
              Move {agencyName} live? The server will re-check launch readiness,
              first value, the commercial contract, active plan and serious
              incidents before changing the lifecycle.
            </p>
          </div>
          <span>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={() => void run(primary)}
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle size={14} className={styles.spin} />
              ) : (
                <ShieldCheck size={14} />
              )}
              Confirm go live
            </button>
          </span>
        </div>
      )}

      <small className={styles.truth}>
        Actions can change customer evidence. They never mark a blocker complete
        by themselves.
      </small>
    </section>
  );
}
