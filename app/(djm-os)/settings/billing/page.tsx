'use client';

import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  ReceiptText,
  Sparkles,
  X,
} from 'lucide-react';
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import SettingsWorkspace from '@/components/SettingsWorkspace';
import { useAdmin } from '@/components/AdminShell';
import styles from '@/components/AccountSettings.module.css';
import {
  friendlyError,
  platformInvoke,
} from '@/lib/platform-client';

type BillingForm = {
  billing_email: string;
  company_name: string;
  tax_country: string;
  tax_id: string;
  billing_address: string;
  invoice_currency: string;
};

const EMPTY_FORM: BillingForm = {
  billing_email: '',
  company_name: '',
  tax_country: '',
  tax_id: '',
  billing_address: '',
  invoice_currency: 'EUR',
};

const formatPrice = (plan: any) => {
  const cents = Number(plan?.monthly_price_cents);
  if (!Number.isFinite(cents)) return 'Custom';
  const currency = String(plan?.price_currency || 'EUR');
  const amount = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
  return `${plan?.price_is_from ? 'From ' : ''}${amount}`;
};

const limitLabel = (value: unknown) =>
  value === null || value === undefined ? 'Unlimited' : String(value);

export default function BillingSettingsPage() {
  const auth = useAdmin();
  const tenantId = String(auth.workspace?.tenant_id || '');
  const role = String(auth.workspace?.role || '');
  const isOwner = role === 'owner';
  const [account, setAccount] = useState<any>(null);
  const [form, setForm] = useState<BillingForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(true);
  const [actionBusy, setActionBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!tenantId || !isOwner) {
      setBusy(false);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await platformInvoke<any>('agency-os', {
        action: 'account_overview',
        tenant_id: tenantId,
      });
      const next = result?.account || {};
      const billing = next.billing || {};
      const metadata = billing.metadata || {};
      setAccount(next);
      setForm({
        billing_email: String(billing.billing_email || auth.user?.email || ''),
        company_name: String(metadata.company_name || ''),
        tax_country: String(billing.tax_country || ''),
        tax_id: String(metadata.tax_id || ''),
        billing_address: String(metadata.billing_address || ''),
        invoice_currency: String(billing.invoice_currency || 'EUR'),
      });
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, [tenantId, isOwner, auth.user?.email]);

  useEffect(() => {
    if (!auth.loading) void load();
  }, [auth.loading, load]);

  const currentPlan = useMemo(
    () =>
      account?.plans?.find(
        (plan: any) => plan.plan_key === account?.plan?.plan_key,
      ) || null,
    [account],
  );
  const internalBilling =
    account?.billing?.status === 'internal' ||
    Boolean(account?.billing?.metadata?.billing_exempt);

  const update = (key: keyof BillingForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
    setMessage('');
  };

  const saveBilling = async (event: FormEvent) => {
    event.preventDefault();
    if (!tenantId || !isOwner) return;
    setActionBusy('billing');
    setError('');
    setMessage('');
    try {
      await platformInvoke('agency-os', {
        action: 'account_billing_save',
        tenant_id: tenantId,
        ...form,
      });
      setMessage('Billing details updated.');
      await load();
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setActionBusy('');
    }
  };

  const requestPlan = async (planKey: string) => {
    if (!tenantId) return;
    setActionBusy(`plan:${planKey}`);
    setError('');
    setMessage('');
    try {
      await platformInvoke('agency-os', {
        action: 'account_plan_request',
        tenant_id: tenantId,
        requested_plan_key: planKey,
      });
      setMessage('Plan change requested. ReDream will keep your current plan active until the change is completed.');
      await load();
    } catch (requestError) {
      setError(friendlyError(requestError));
    } finally {
      setActionBusy('');
    }
  };

  const cancelPlanRequest = async () => {
    const requestId = String(account?.pending_plan_change?.id || '');
    if (!requestId) return;
    setActionBusy('cancel-plan');
    setError('');
    try {
      await platformInvoke('agency-os', {
        action: 'account_plan_request_cancel',
        tenant_id: tenantId,
        request_id: requestId,
      });
      setMessage('Plan change request cancelled.');
      await load();
    } catch (cancelError) {
      setError(friendlyError(cancelError));
    } finally {
      setActionBusy('');
    }
  };

  const openPaymentPortal = async () => {
    if (!tenantId) return;
    setActionBusy('portal');
    setError('');
    try {
      const result = await platformInvoke<any>('agency-os', {
        action: 'account_payment_portal',
        tenant_id: tenantId,
        return_url: `${window.location.origin}/settings/billing`,
      });
      if (!result?.url) throw new Error('Payment portal unavailable.');
      window.location.assign(String(result.url));
    } catch (portalError) {
      setError(friendlyError(portalError));
      setActionBusy('');
    }
  };

  if (!auth.loading && !isOwner) {
    return (
      <SettingsWorkspace
        title="Plan & billing"
        description="Plan, usage, invoices and payment for the agency."
      >
        <div className={styles.stack}>
          <div className={styles.notice}>
            <CreditCard size={16} />
            Plan and billing controls are available to the agency owner.
          </div>
        </div>
      </SettingsWorkspace>
    );
  }

  return (
    <SettingsWorkspace
      title="Plan & billing"
      description="Plan, usage, invoices and payment for the agency."
    >
      <div className={styles.stack}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.badge}>
              <Sparkles size={14} />
              {currentPlan?.display_name || 'ReDream'} plan
            </span>
            <h2>{formatPrice(currentPlan)} <small>/ month</small></h2>
            <p>
              Manage the agency plan, seats, billing identity, invoices and the
              secure payment route from one place.
            </p>
          </div>
          <div className={styles.usageGrid}>
            <div className={styles.usageCard}>
              <span>Team</span>
              <strong>
                {account?.usage?.staff || 0} / {limitLabel(currentPlan?.limits?.staff_users)}
              </strong>
            </div>
            <div className={styles.usageCard}>
              <span>Players</span>
              <strong>
                {account?.usage?.players || 0} / {limitLabel(currentPlan?.limits?.active_players)}
              </strong>
            </div>
          </div>
        </section>

        {error ? <div className={styles.error}>{error}</div> : null}
        {message ? (
          <div className={styles.success}>
            <CheckCircle2 size={16} />
            {message}
          </div>
        ) : null}

        {account?.pending_plan_change ? (
          <div className={styles.notice}>
            <div>
              <strong>
                {String(account.pending_plan_change.requested_plan_key || '').toUpperCase()} plan change pending
              </strong>
              <div>Your current plan stays active until the change is completed.</div>
            </div>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void cancelPlanRequest()}
              disabled={actionBusy === 'cancel-plan'}
            >
              <X size={14} />
              Cancel request
            </button>
          </div>
        ) : null}

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Plans</h2>
              <p>Move the agency up or down without losing its workspace or data.</p>
            </div>
          </div>
          <div className={styles.planGrid}>
            {(account?.plans || []).map((plan: any) => {
              const isCurrent = plan.plan_key === account?.plan?.plan_key;
              const currentRank = Number(currentPlan?.rank || 0);
              const nextRank = Number(plan.rank || 0);
              return (
                <article
                  key={plan.plan_key}
                  className={`${styles.planCard} ${isCurrent ? styles.planCardCurrent : ''}`}
                >
                  <span className={styles.badge}>
                    {isCurrent ? 'Current plan' : nextRank > currentRank ? 'Upgrade' : 'Change plan'}
                  </span>
                  <h3>{plan.display_name}</h3>
                  <div className={styles.planPrice}>
                    {formatPrice(plan)}
                    <small>/ month</small>
                  </div>
                  <p>{plan.customer_segment}</p>
                  <div className={styles.planMeta}>
                    <span>{limitLabel(plan.limits?.staff_users)} team users</span>
                    <span>{limitLabel(plan.limits?.active_players)} players</span>
                  </div>
                  {!isCurrent ? (
                    <button
                      type="button"
                      className={nextRank > currentRank ? styles.primary : styles.secondary}
                      disabled={Boolean(account?.pending_plan_change) || busy || actionBusy.startsWith('plan:')}
                      onClick={() => void requestPlan(plan.plan_key)}
                    >
                      {nextRank > currentRank ? 'Request upgrade' : 'Request change'}
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <div className={styles.gridTwo}>
          <form className={styles.panel} onSubmit={saveBilling}>
            <div className={styles.panelHead}>
              <div>
                <h2>Billing details</h2>
                <p>Used for invoices and account administration.</p>
              </div>
              <ReceiptText size={19} />
            </div>
            <div className={styles.formGrid}>
              <label className={`${styles.field} ${styles.full}`}>
                <span>Company or legal name</span>
                <input
                  value={form.company_name}
                  onChange={(event) => update('company_name', event.target.value)}
                  maxLength={160}
                />
              </label>
              <label className={`${styles.field} ${styles.full}`}>
                <span>Billing email</span>
                <input
                  type="email"
                  value={form.billing_email}
                  onChange={(event) => update('billing_email', event.target.value)}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Tax country</span>
                <input
                  value={form.tax_country}
                  onChange={(event) => update('tax_country', event.target.value.toUpperCase())}
                  placeholder="IT"
                  maxLength={2}
                />
              </label>
              <label className={styles.field}>
                <span>VAT / tax ID</span>
                <input
                  value={form.tax_id}
                  onChange={(event) => update('tax_id', event.target.value)}
                  maxLength={80}
                />
              </label>
              <label className={`${styles.field} ${styles.full}`}>
                <span>Billing address</span>
                <textarea
                  value={form.billing_address}
                  onChange={(event) => update('billing_address', event.target.value)}
                  maxLength={500}
                />
              </label>
              <label className={styles.field}>
                <span>Invoice currency</span>
                <select
                  value={form.invoice_currency}
                  onChange={(event) => update('invoice_currency', event.target.value)}
                >
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="USD">USD</option>
                  <option value="AUD">AUD</option>
                  <option value="NZD">NZD</option>
                </select>
              </label>
            </div>
            <div className={styles.actions}>
              <button
                type="submit"
                className={styles.primary}
                disabled={busy || actionBusy === 'billing'}
              >
                Save billing details
              </button>
            </div>
          </form>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2>Payments & invoices</h2>
                <p>Card details stay with the secure payment provider, never in ReDream.</p>
              </div>
              <CreditCard size={19} />
            </div>

            {internalBilling ? (
              <div className={styles.notice}>
                <CheckCircle2 size={16} />
                This is an internal or founding ReDream account. No payment method is required.
              </div>
            ) : (
              <>
                <p className={styles.muted}>
                  Update the payment method, download invoices and manage payment information in the secure billing portal.
                </p>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => void openPaymentPortal()}
                    disabled={actionBusy === 'portal'}
                  >
                    <ExternalLink size={14} />
                    Manage payment & invoices
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </SettingsWorkspace>
  );
}
