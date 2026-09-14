'use client';

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Gauge,
  Globe2,
  Layers3,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UsersRound,
  X,
  Zap,
} from 'lucide-react';
import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { djmInvoke, friendlyError } from '@/lib/djm-os';
import { supabase } from '@/lib/supabase';

import styles from './platform.module.css';

type Plan = {
  plan_key: string;
  display_name: string;
  rank: number;
  customer_segment?: string | null;
  limits?: {
    staff_users?: number | null;
    active_players?: number | null;
  } | null;
  monthly_price_cents?: number | null;
  price_currency?: string | null;
  price_is_from?: boolean | null;
  metadata?: Record<string, unknown> | null;
};

type Customer = {
  tenant_id: string;
  slug: string;
  display_name: string;
  stage: string;
  tenant_status: string;
  plan_key?: string | null;
  plan_name?: string | null;
  health_score?: number | null;
  health_band?: string | null;
  action_priority?: number | null;
  next_action?: string | null;
  trial_days_left?: number | null;
  risk_flags?: string[];
  expansion_signals?: string[];
  onboarding?: {
    status?: string | null;
    progress_pct?: number | null;
    required_total?: number | null;
    required_complete?: number | null;
    blocked_required?: number | null;
  } | null;
  activation?: {
    staff?: number | null;
    owners?: number | null;
    players?: number | null;
    ai_events_7d?: number | null;
    ai_events_30d?: number | null;
  } | null;
  capacity?: {
    staff_pct?: number | null;
    player_pct?: number | null;
    next_plan_key?: string | null;
    next_plan_name?: string | null;
  } | null;
  commercial?: {
    annual_commitment?: boolean | null;
    contract_currency?: string | null;
    contracted_monthly_cents?: number | null;
    list_price_currency?: string | null;
    list_monthly_price_cents?: number | null;
    ai_cost_micros_30d?: number | null;
  } | null;
  operations?: {
    open_incidents?: number | null;
    serious_incidents?: number | null;
  } | null;
};

type Portfolio = {
  summary: {
    total_tenants?: number;
    external_customers?: number;
    active_trials?: number;
    trials_expiring_7d?: number;
    onboarding_customers?: number;
    live_customers?: number;
    at_risk_customers?: number;
    expansion_candidates?: number;
    contracted_mrr_cents?: number;
    ai_cost_micros_30d?: number;
    customers_needing_action?: number;
  };
  agenda: Customer[];
  customers: Customer[];
};

type CustomerDetail = {
  tenant?: Record<string, any> | null;
  branding?: Record<string, any> | null;
  lifecycle?: Record<string, any> | null;
  plan?: Record<string, any> | null;
  domains?: Array<Record<string, any>>;
  onboarding_tasks?: Array<Record<string, any>>;
  memberships?: Array<Record<string, any>>;
  feature_overrides?: Array<Record<string, any>>;
  audit?: Array<Record<string, any>>;
};

type NewAgencyState = {
  displayName: string;
  slug: string;
  legalName: string;
  ownerEmail: string;
  planKey: string;
  trialDays: number;
  hostname: string;
  websiteUrl: string;
  supportEmail: string;
  primaryColor: string;
  accentColor: string;
};

const EMPTY_AGENCY: NewAgencyState = {
  displayName: '',
  slug: '',
  legalName: '',
  ownerEmail: '',
  planKey: 'pro',
  trialDays: 14,
  hostname: '',
  websiteUrl: '',
  supportEmail: '',
  primaryColor: '#061F3A',
  accentColor: '#F5E900',
};

const ACTION_LABELS: Record<string, string> = {
  attach_owner: 'Attach agency owner',
  unblock_onboarding: 'Unblock onboarding',
  convert_trial: 'Convert trial',
  upgrade_plan: 'Upgrade plan',
  activate_custom_domain: 'Activate custom domain',
  drive_ai_adoption: 'Drive AI adoption',
  offer_annual_commitment: 'Offer annual commitment',
  monitor_internal: 'Monitor internal tenant',
  monitor_customer: 'Monitor customer',
};

const STAGE_LABELS: Record<string, string> = {
  internal: 'Internal',
  trial: 'Trial',
  onboarding: 'Onboarding',
  live: 'Live',
  at_risk: 'At risk',
  paused: 'Paused',
  churned: 'Churned',
};

const money = (cents = 0, currency = 'EUR') =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);

const compactMoney = (cents = 0, currency = 'EUR') =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100);

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

const titleCase = (value?: string | null) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const actionLabel = (value?: string | null) =>
  value ? ACTION_LABELS[value] || titleCase(value) : 'Monitor customer';

const healthTone = (band?: string | null) => {
  if (band === 'critical') return styles.critical;
  if (band === 'risk') return styles.risk;
  if (band === 'watch') return styles.watch;
  return styles.strong;
};

const planPrice = (plan: Plan) => {
  const amount = money(plan.monthly_price_cents || 0, plan.price_currency || 'EUR');
  return `${plan.price_is_from ? 'From ' : ''}${amount}/mo`;
};

export default function PlatformPage() {
  const router = useRouter();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'attention' | 'trials' | 'risk' | 'expansion'>('all');

  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPlan, setDetailPlan] = useState('');
  const [detailOwnerEmail, setDetailOwnerEmail] = useState('');
  const [detailBusy, setDetailBusy] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [agency, setAgency] = useState<NewAgencyState>({ ...EMPTY_AGENCY });

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    setAccessDenied(false);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace('/sign-in');
        return;
      }

      const [portfolioResult, plansResult] = await Promise.all([
        djmInvoke<any>('platform-ops', { action: 'portfolio' }),
        djmInvoke<any>('platform-ops', { action: 'plans' }),
      ]);

      setPortfolio(portfolioResult?.portfolio || null);
      setPlans(plansResult?.plans || []);
    } catch (loadError) {
      const message = friendlyError(loadError);
      if (message.toLowerCase().includes('platform operator access required')) {
        setAccessDenied(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCustomer = useCallback(async (tenantId: string) => {
    setSelectedTenantId(tenantId);
    setDetail(null);
    setDetailLoading(true);
    setDetailBusy('');
    setDetailOwnerEmail('');
    try {
      const result = await djmInvoke<any>('platform-ops', {
        action: 'customer_detail',
        tenant_id: tenantId,
      });
      const next = (result?.customer || null) as CustomerDetail | null;
      setDetail(next);
      setDetailPlan(String(next?.plan?.plan_key || ''));
      setDetailOwnerEmail(String(next?.lifecycle?.owner_contact_email || ''));
    } catch (detailError) {
      setError(friendlyError(detailError));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = () => {
    setSelectedTenantId(null);
    setDetail(null);
    setDetailBusy('');
  };

  const customers = useMemo(() => {
    const rows = portfolio?.customers || [];
    const q = query.trim().toLowerCase();

    return rows.filter((customer) => {
      const matchesSearch =
        !q ||
        [
          customer.display_name,
          customer.slug,
          customer.plan_name,
          customer.stage,
          customer.next_action,
          ...(customer.risk_flags || []),
          ...(customer.expansion_signals || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);

      if (!matchesSearch) return false;
      if (filter === 'attention') return Number(customer.action_priority ?? 999) < 80 && customer.stage !== 'internal';
      if (filter === 'trials') return customer.stage === 'trial';
      if (filter === 'risk') return ['risk', 'critical'].includes(String(customer.health_band));
      if (filter === 'expansion') return Boolean(customer.expansion_signals?.length);
      return true;
    });
  }, [filter, portfolio?.customers, query]);

  const summary = portfolio?.summary || {};
  const currency =
    portfolio?.customers?.find((customer) => customer.stage !== 'internal')?.commercial?.contract_currency ||
    'EUR';

  const createAgency = async (event: FormEvent) => {
    event.preventDefault();
    if (creating || !agency.displayName.trim() || !agency.planKey) return;

    setCreating(true);
    setError('');
    setNotice('');

    const finalSlug = agency.slug.trim() || slugify(agency.displayName);
    const shortName = agency.displayName.trim().split(/\s+/).slice(0, 3).join(' ');

    try {
      const result = await djmInvoke<any>('platform-ops', {
        action: 'create_customer',
        display_name: agency.displayName.trim(),
        slug: finalSlug,
        legal_name: agency.legalName.trim() || agency.displayName.trim(),
        plan_key: agency.planKey,
        owner_email: agency.ownerEmail.trim().toLowerCase() || null,
        trial_days: agency.trialDays,
        stage: 'onboarding',
        billing_mode: 'manual',
        hostname: agency.hostname.trim().toLowerCase() || null,
        branding: {
          display_name: agency.displayName.trim(),
          short_name: shortName,
          legal_name: agency.legalName.trim() || agency.displayName.trim(),
          portal_name: `${shortName} Player`,
          primary_color: agency.primaryColor,
          secondary_color: '#FFFFFF',
          accent_color: agency.accentColor,
          support_email:
            agency.supportEmail.trim().toLowerCase() ||
            agency.ownerEmail.trim().toLowerCase() ||
            null,
          website_url: agency.websiteUrl.trim() || null,
        },
        metadata: {
          source: 'platform_cockpit',
        },
      });

      const tenantId = String(result?.customer?.tenant_id || '');
      setNotice(
        result?.owner?.invite_required
          ? `${agency.displayName} is provisioned. The owner account still needs to be invited and attached.`
          : `${agency.displayName} is provisioned and ready for onboarding.`,
      );
      setAgency({ ...EMPTY_AGENCY });
      setCreateOpen(false);
      await load(true);
      if (tenantId) await openCustomer(tenantId);
    } catch (createError) {
      setError(friendlyError(createError));
    } finally {
      setCreating(false);
    }
  };

  const updateCustomerPlan = async () => {
    if (!selectedTenantId || !detailPlan || detailBusy) return;
    setDetailBusy('plan');
    setError('');
    try {
      await djmInvoke('platform-ops', {
        action: 'update_customer',
        tenant_id: selectedTenantId,
        plan_key: detailPlan,
      });
      await Promise.all([openCustomer(selectedTenantId), load(true)]);
      setNotice('Plan updated.');
    } catch (updateError) {
      setError(friendlyError(updateError));
    } finally {
      setDetailBusy('');
    }
  };

  const attachOwner = async () => {
    if (!selectedTenantId || !detailOwnerEmail.trim() || detailBusy) return;
    setDetailBusy('owner');
    setError('');
    try {
      await djmInvoke('platform-ops', {
        action: 'attach_owner_by_email',
        tenant_id: selectedTenantId,
        email: detailOwnerEmail.trim().toLowerCase(),
      });
      await Promise.all([openCustomer(selectedTenantId), load(true)]);
      setNotice('Owner attached.');
    } catch (ownerError) {
      setError(friendlyError(ownerError));
    } finally {
      setDetailBusy('');
    }
  };

  const updateOnboardingTask = async (taskKey: string, nextStatus: string) => {
    if (!selectedTenantId || detailBusy) return;
    setDetailBusy(`task:${taskKey}`);
    setError('');
    try {
      await djmInvoke('platform-ops', {
        action: 'set_onboarding_task',
        tenant_id: selectedTenantId,
        task_key: taskKey,
        status: nextStatus,
      });
      await Promise.all([openCustomer(selectedTenantId), load(true)]);
    } catch (taskError) {
      setError(friendlyError(taskError));
    } finally {
      setDetailBusy('');
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/sign-in');
  };

  if (loading) {
    return (
      <main className={styles.loadingPage}>
        <div className={styles.loadingMark}>
          <Sparkles size={18} />
        </div>
        <div>
          <strong>Opening platform</strong>
          <span>Loading the operator cockpit</span>
        </div>
      </main>
    );
  }

  if (accessDenied) {
    return (
      <main className={styles.deniedPage}>
        <div className={styles.deniedCard}>
          <ShieldCheck size={26} />
          <p className={styles.eyebrow}>PRIVATE CONTROL PLANE</p>
          <h1>Platform operator access required</h1>
          <p>This workspace is separate from agency administration and is only available to authorised platform operators.</p>
          <button type="button" onClick={() => router.replace('/home')}>
            Return to workspace
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brandBlock}>
          <div className={styles.brandMark}>DJM</div>
          <div>
            <strong>Platform</strong>
            <span>Operator cockpit</span>
          </div>
        </div>

        <div className={styles.topbarActions}>
          <div className={styles.liveStatus}>
            <span />
            Production
          </div>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Refresh platform"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            <RefreshCw size={17} className={refreshing ? styles.spin : ''} />
          </button>
          <button type="button" className={styles.workspaceButton} onClick={() => router.push('/djm')}>
            DJM workspace
            <ArrowUpRight size={15} />
          </button>
          <button type="button" className={styles.iconButton} aria-label="Sign out" onClick={() => void signOut()}>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className={styles.canvas}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>COMMERCIAL OPERATING SYSTEM</p>
            <h1>Know what needs you before a customer asks.</h1>
            <p className={styles.heroCopy}>
              Trials, onboarding, risk, usage, capacity and expansion in one ranked operating view.
            </p>
          </div>

          <button type="button" className={styles.primaryButton} onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            New agency
          </button>
        </section>

        {error ? (
          <div className={styles.alert}>
            <AlertTriangle size={17} />
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} aria-label="Dismiss error">
              <X size={15} />
            </button>
          </div>
        ) : null}

        {notice ? (
          <div className={styles.notice}>
            <Check size={16} />
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">
              <X size={15} />
            </button>
          </div>
        ) : null}

        <section className={styles.metricsGrid}>
          <Metric
            icon={<CircleDollarSign size={17} />}
            label="Contracted MRR"
            value={compactMoney(summary.contracted_mrr_cents || 0, currency)}
            note={`${summary.live_customers || 0} live customer${summary.live_customers === 1 ? '' : 's'}`}
          />
          <Metric
            icon={<Clock3 size={17} />}
            label="Active trials"
            value={String(summary.active_trials || 0)}
            note={`${summary.trials_expiring_7d || 0} expiring within 7 days`}
            attention={Boolean(summary.trials_expiring_7d)}
          />
          <Metric
            icon={<AlertTriangle size={17} />}
            label="At risk"
            value={String(summary.at_risk_customers || 0)}
            note={`${summary.customers_needing_action || 0} customer${summary.customers_needing_action === 1 ? '' : 's'} need action`}
            attention={Boolean(summary.at_risk_customers)}
          />
          <Metric
            icon={<TrendingUp size={17} />}
            label="Expansion"
            value={String(summary.expansion_candidates || 0)}
            note={`${summary.onboarding_customers || 0} onboarding now`}
          />
          <Metric
            icon={<Zap size={17} />}
            label="AI cost, 30d"
            value={money(Math.round((summary.ai_cost_micros_30d || 0) / 10000), 'USD')}
            note={`${summary.external_customers || 0} external tenant${summary.external_customers === 1 ? '' : 's'}`}
          />
        </section>

        <section className={styles.operatingGrid}>
          <article className={styles.agendaPanel}>
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.eyebrow}>WHAT NEEDS YOU NOW</p>
                <h2>Operator agenda</h2>
              </div>
              <span className={styles.countBadge}>{portfolio?.agenda?.length || 0}</span>
            </div>

            <div className={styles.agendaList}>
              {(portfolio?.agenda || []).map((customer, index) => (
                <button
                  type="button"
                  className={styles.agendaRow}
                  key={customer.tenant_id}
                  onClick={() => void openCustomer(customer.tenant_id)}
                >
                  <span className={styles.agendaRank}>{String(index + 1).padStart(2, '0')}</span>
                  <div className={styles.agendaIdentity}>
                    <strong>{customer.display_name}</strong>
                    <span>{actionLabel(customer.next_action)}</span>
                  </div>
                  <div className={styles.agendaSignal}>
                    <span className={`${styles.healthDot} ${healthTone(customer.health_band)}`} />
                    {customer.health_score ?? '-'}
                  </div>
                  <ChevronRight size={16} />
                </button>
              ))}

              {!portfolio?.agenda?.length ? (
                <div className={styles.clearState}>
                  <ShieldCheck size={21} />
                  <strong>No urgent customer action</strong>
                  <span>The portfolio has no external customer currently below the action threshold.</span>
                </div>
              ) : null}
            </div>
          </article>

          <article className={styles.signalPanel}>
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.eyebrow}>PORTFOLIO SIGNAL</p>
                <h2>Customer base</h2>
              </div>
              <Gauge size={18} />
            </div>

            <div className={styles.signalStack}>
              <Signal
                label="External customers"
                value={summary.external_customers || 0}
                max={Math.max(summary.total_tenants || 1, 1)}
              />
              <Signal
                label="Live"
                value={summary.live_customers || 0}
                max={Math.max(summary.external_customers || 1, 1)}
              />
              <Signal
                label="Onboarding"
                value={summary.onboarding_customers || 0}
                max={Math.max(summary.external_customers || 1, 1)}
              />
              <Signal
                label="Expansion-ready"
                value={summary.expansion_candidates || 0}
                max={Math.max(summary.external_customers || 1, 1)}
              />
            </div>

            <div className={styles.signalFooter}>
              <Activity size={16} />
              <div>
                <strong>{summary.customers_needing_action || 0} requiring operator attention</strong>
                <span>Ranked automatically from health, urgency, adoption, onboarding and commercial signals.</span>
              </div>
            </div>
          </article>
        </section>

        <section className={styles.customersSection}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>CUSTOMERS</p>
              <h2>Agency portfolio</h2>
            </div>

            <div className={styles.customerTools}>
              <label className={styles.searchBox}>
                <Search size={15} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search agencies"
                />
              </label>

              <div className={styles.filters} role="tablist" aria-label="Customer filters">
                {[
                  ['all', 'All'],
                  ['attention', 'Needs action'],
                  ['trials', 'Trials'],
                  ['risk', 'Risk'],
                  ['expansion', 'Expansion'],
                ].map(([key, label]) => (
                  <button
                    type="button"
                    key={key}
                    className={filter === key ? styles.activeFilter : ''}
                    onClick={() => setFilter(key as typeof filter)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.customerList}>
            {customers.map((customer) => (
              <button
                type="button"
                className={styles.customerCard}
                key={customer.tenant_id}
                onClick={() => void openCustomer(customer.tenant_id)}
              >
                <div className={styles.customerIdentity}>
                  <div className={styles.customerAvatar}>
                    {customer.display_name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div>
                    <strong>{customer.display_name}</strong>
                    <span>
                      {customer.plan_name || 'No plan'} · {STAGE_LABELS[customer.stage] || titleCase(customer.stage)}
                    </span>
                  </div>
                </div>

                <div className={styles.customerProgress}>
                  <span>Onboarding</span>
                  <div>
                    <i style={{ width: `${Math.max(0, Math.min(100, customer.onboarding?.progress_pct || 0))}%` }} />
                  </div>
                  <strong>{customer.onboarding?.progress_pct ?? 0}%</strong>
                </div>

                <div className={styles.activationMini}>
                  <span><UsersRound size={13} />{customer.activation?.staff || 0} staff</span>
                  <span><Layers3 size={13} />{customer.activation?.players || 0} players</span>
                  <span><Sparkles size={13} />{customer.activation?.ai_events_30d || 0} AI</span>
                </div>

                <div className={styles.nextAction}>
                  <span>Next move</span>
                  <strong>{actionLabel(customer.next_action)}</strong>
                </div>

                <ScoreRing score={customer.health_score || 0} band={customer.health_band} />
                <ChevronRight size={17} className={styles.cardChevron} />
              </button>
            ))}

            {!customers.length ? (
              <div className={styles.emptyCustomers}>
                <Building2 size={23} />
                <strong>No agencies match this view</strong>
                <span>Change the filter or create a new customer.</span>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {createOpen ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => !creating && setCreateOpen(false)}>
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label="Create new agency"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>NEW CUSTOMER</p>
                <h2>Launch an agency</h2>
                <p>Provision the workspace, commercial plan and brand in one operation.</p>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Close"
                onClick={() => !creating && setCreateOpen(false)}
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={createAgency} className={styles.form}>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Agency name</span>
                  <input
                    required
                    autoFocus
                    value={agency.displayName}
                    onChange={(event) =>
                      setAgency((current) => ({
                        ...current,
                        displayName: event.target.value,
                        slug: current.slug || slugify(event.target.value),
                      }))
                    }
                    placeholder="Northstar Football"
                  />
                </label>

                <label className={styles.field}>
                  <span>Workspace slug</span>
                  <input
                    required
                    value={agency.slug}
                    onChange={(event) => setAgency((current) => ({ ...current, slug: slugify(event.target.value) }))}
                    placeholder="northstar-football"
                  />
                </label>

                <label className={styles.field}>
                  <span>Legal name</span>
                  <input
                    value={agency.legalName}
                    onChange={(event) => setAgency((current) => ({ ...current, legalName: event.target.value }))}
                    placeholder="Optional"
                  />
                </label>

                <label className={styles.field}>
                  <span>Owner email</span>
                  <input
                    type="email"
                    value={agency.ownerEmail}
                    onChange={(event) => setAgency((current) => ({ ...current, ownerEmail: event.target.value }))}
                    placeholder="owner@agency.com"
                  />
                </label>
              </div>

              <div className={styles.planPicker}>
                {plans.map((plan) => (
                  <label
                    key={plan.plan_key}
                    className={`${styles.planOption} ${agency.planKey === plan.plan_key ? styles.selectedPlan : ''}`}
                  >
                    <input
                      type="radio"
                      name="plan"
                      value={plan.plan_key}
                      checked={agency.planKey === plan.plan_key}
                      onChange={() => setAgency((current) => ({ ...current, planKey: plan.plan_key }))}
                    />
                    <div>
                      <strong>{plan.display_name}</strong>
                      <span>{planPrice(plan)}</span>
                    </div>
                    <p>{String(plan.metadata?.commercial_promise || plan.customer_segment || '')}</p>
                    <small>
                      {plan.limits?.active_players ? `${plan.limits.active_players} players` : 'Unlimited players'}
                      {' · '}
                      {plan.limits?.staff_users ? `${plan.limits.staff_users} staff` : 'Unlimited staff'}
                    </small>
                  </label>
                ))}
              </div>

              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Trial days</span>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={agency.trialDays}
                    onChange={(event) =>
                      setAgency((current) => ({
                        ...current,
                        trialDays: Math.max(1, Math.min(90, Number(event.target.value) || 14)),
                      }))
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span>Custom domain</span>
                  <input
                    value={agency.hostname}
                    onChange={(event) => setAgency((current) => ({ ...current, hostname: event.target.value }))}
                    placeholder="app.agency.com"
                  />
                </label>

                <label className={styles.field}>
                  <span>Website</span>
                  <input
                    value={agency.websiteUrl}
                    onChange={(event) => setAgency((current) => ({ ...current, websiteUrl: event.target.value }))}
                    placeholder="https://agency.com"
                  />
                </label>

                <label className={styles.field}>
                  <span>Support email</span>
                  <input
                    type="email"
                    value={agency.supportEmail}
                    onChange={(event) => setAgency((current) => ({ ...current, supportEmail: event.target.value }))}
                    placeholder="support@agency.com"
                  />
                </label>
              </div>

              <div className={styles.brandRow}>
                <label className={styles.colourField}>
                  <span>Primary</span>
                  <input
                    type="color"
                    value={agency.primaryColor}
                    onChange={(event) => setAgency((current) => ({ ...current, primaryColor: event.target.value }))}
                  />
                  <code>{agency.primaryColor.toUpperCase()}</code>
                </label>
                <label className={styles.colourField}>
                  <span>Accent</span>
                  <input
                    type="color"
                    value={agency.accentColor}
                    onChange={(event) => setAgency((current) => ({ ...current, accentColor: event.target.value }))}
                  />
                  <code>{agency.accentColor.toUpperCase()}</code>
                </label>

                <div className={styles.brandPreview}>
                  <i style={{ background: agency.primaryColor }} />
                  <div>
                    <strong>{agency.displayName || 'Agency brand'}</strong>
                    <span style={{ color: agency.primaryColor }}>Player workspace</span>
                  </div>
                  <b style={{ background: agency.accentColor }} />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.secondaryButton} onClick={() => setCreateOpen(false)} disabled={creating}>
                  Cancel
                </button>
                <button type="submit" className={styles.primaryButton} disabled={creating}>
                  {creating ? <LoaderCircle size={16} className={styles.spin} /> : <Zap size={16} />}
                  {creating ? 'Provisioning...' : 'Provision agency'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {selectedTenantId ? (
        <div className={styles.drawerBackdrop} role="presentation" onMouseDown={closeDetail}>
          <aside className={styles.drawer} onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div>
                <p className={styles.eyebrow}>CUSTOMER</p>
                <h2>{detail?.branding?.display_name || detail?.tenant?.legal_name || 'Agency workspace'}</h2>
                <span>{detail?.tenant?.slug || selectedTenantId}</span>
              </div>
              <button type="button" className={styles.iconButton} aria-label="Close customer" onClick={closeDetail}>
                <X size={17} />
              </button>
            </div>

            {detailLoading ? (
              <div className={styles.drawerLoading}>
                <LoaderCircle size={19} className={styles.spin} />
                Loading customer...
              </div>
            ) : detail ? (
              <div className={styles.drawerBody}>
                <div className={styles.detailStats}>
                  <DetailStat label="Stage" value={titleCase(detail.lifecycle?.stage || detail.tenant?.status)} />
                  <DetailStat label="Plan" value={titleCase(detail.plan?.plan_key || 'None')} />
                  <DetailStat
                    label="Onboarding"
                    value={`${detail.onboarding_tasks?.filter((task) => task.status === 'complete').length || 0}/${detail.onboarding_tasks?.filter((task) => task.required).length || 0}`}
                  />
                  <DetailStat label="Members" value={String(detail.memberships?.filter((member) => member.status === 'active').length || 0)} />
                </div>

                <section className={styles.drawerSection}>
                  <div className={styles.drawerSectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>COMMERCIAL</p>
                      <h3>Plan and owner</h3>
                    </div>
                    <CircleDollarSign size={17} />
                  </div>

                  <div className={styles.inlineControls}>
                    <label className={styles.field}>
                      <span>Plan</span>
                      <select value={detailPlan} onChange={(event) => setDetailPlan(event.target.value)}>
                        {plans.map((plan) => (
                          <option value={plan.plan_key} key={plan.plan_key}>
                            {plan.display_name} · {planPrice(plan)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => void updateCustomerPlan()}
                      disabled={detailBusy === 'plan' || detailPlan === detail.plan?.plan_key}
                    >
                      {detailBusy === 'plan' ? <LoaderCircle size={15} className={styles.spin} /> : <Check size={15} />}
                      Save
                    </button>
                  </div>

                  <div className={styles.inlineControls}>
                    <label className={styles.field}>
                      <span>Owner email</span>
                      <input
                        type="email"
                        value={detailOwnerEmail}
                        onChange={(event) => setDetailOwnerEmail(event.target.value)}
                        placeholder="owner@agency.com"
                      />
                    </label>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => void attachOwner()}
                      disabled={detailBusy === 'owner' || !detailOwnerEmail.trim()}
                    >
                      {detailBusy === 'owner' ? <LoaderCircle size={15} className={styles.spin} /> : <UsersRound size={15} />}
                      Attach
                    </button>
                  </div>
                </section>

                <section className={styles.drawerSection}>
                  <div className={styles.drawerSectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>ACTIVATION</p>
                      <h3>Onboarding</h3>
                    </div>
                    <Sparkles size={17} />
                  </div>

                  <div className={styles.taskList}>
                    {(detail.onboarding_tasks || []).map((task) => {
                      const complete = task.status === 'complete';
                      const busy = detailBusy === `task:${task.task_key}`;
                      return (
                        <button
                          type="button"
                          key={task.task_key}
                          className={`${styles.taskRow} ${complete ? styles.taskComplete : ''}`}
                          onClick={() => void updateOnboardingTask(task.task_key, complete ? 'pending' : 'complete')}
                          disabled={busy}
                        >
                          <span className={styles.taskCheck}>
                            {busy ? <LoaderCircle size={14} className={styles.spin} /> : complete ? <Check size={14} /> : null}
                          </span>
                          <div>
                            <strong>{task.title}</strong>
                            <span>{task.description || (task.required ? 'Required activation step' : 'Optional')}</span>
                          </div>
                          {task.required ? <small>Required</small> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className={styles.drawerSection}>
                  <div className={styles.drawerSectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>BRAND AND DOMAIN</p>
                      <h3>Customer surface</h3>
                    </div>
                    <Globe2 size={17} />
                  </div>

                  <div className={styles.brandDetail}>
                    <span
                      className={styles.brandSwatch}
                      style={{ background: detail.branding?.primary_color || '#061F3A' }}
                    />
                    <div>
                      <strong>{detail.branding?.portal_name || 'Player portal'}</strong>
                      <span>{detail.branding?.website_url || 'No website set'}</span>
                    </div>
                  </div>

                  <div className={styles.domainList}>
                    {(detail.domains || []).map((domain) => (
                      <div className={styles.domainRow} key={domain.id}>
                        <Globe2 size={14} />
                        <div>
                          <strong>{domain.hostname}</strong>
                          <span>{titleCase(domain.domain_type)}</span>
                        </div>
                        <small className={domain.status === 'active' ? styles.domainActive : ''}>
                          {titleCase(domain.status)}
                        </small>
                      </div>
                    ))}
                    {!detail.domains?.length ? <span className={styles.mutedText}>No domain configured yet.</span> : null}
                  </div>
                </section>

                <section className={styles.drawerSection}>
                  <div className={styles.drawerSectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>FEATURE OVERRIDES</p>
                      <h3>Entitlements</h3>
                    </div>
                    <Layers3 size={17} />
                  </div>

                  <div className={styles.entitlementList}>
                    {(detail.feature_overrides || []).map((feature) => (
                      <div className={styles.entitlementRow} key={feature.feature_key}>
                        <span className={feature.enabled ? styles.featureOn : styles.featureOff} />
                        <div>
                          <strong>{titleCase(feature.feature_key)}</strong>
                          <span>{titleCase(feature.source || 'override')}</span>
                        </div>
                        <small>{feature.enabled ? 'On' : 'Off'}</small>
                      </div>
                    ))}
                    {!detail.feature_overrides?.length ? (
                      <span className={styles.mutedText}>No customer-specific feature overrides.</span>
                    ) : null}
                  </div>
                </section>

                <section className={styles.drawerSection}>
                  <div className={styles.drawerSectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>AUDIT</p>
                      <h3>Recent platform changes</h3>
                    </div>
                    <ShieldCheck size={17} />
                  </div>

                  <div className={styles.auditList}>
                    {(detail.audit || []).slice(0, 12).map((entry) => (
                      <div className={styles.auditRow} key={entry.id}>
                        <span />
                        <div>
                          <strong>{titleCase(entry.action)}</strong>
                          <small>
                            {new Date(entry.occurred_at).toLocaleString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </small>
                        </div>
                      </div>
                    ))}
                    {!detail.audit?.length ? <span className={styles.mutedText}>No platform audit entries yet.</span> : null}
                  </div>
                </section>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
  attention = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  attention?: boolean;
}) {
  return (
    <article className={`${styles.metricCard} ${attention ? styles.metricAttention : ''}`}>
      <div className={styles.metricTop}>
        <span>{icon}</span>
        {attention ? <i /> : null}
      </div>
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{note}</small>
    </article>
  );
}

function Signal({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100));
  return (
    <div className={styles.signalRow}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className={styles.signalTrack}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ScoreRing({ score, band }: { score: number; band?: string | null }) {
  const clamped = Math.max(0, Math.min(100, Number(score || 0)));
  return (
    <div
      className={`${styles.scoreRing} ${healthTone(band)}`}
      style={{ '--score': `${clamped * 3.6}deg` } as CSSProperties}
      aria-label={`Health score ${clamped}`}
    >
      <div>
        <strong>{clamped}</strong>
        <span>health</span>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.detailStat}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
