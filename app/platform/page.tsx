'use client';

import {
  Activity,
  AlertTriangle,
  ArrowRight,
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

import { platformInvoke, friendlyError } from '@/lib/platform-client';
import { supabase } from '@/lib/supabase';

import AgencyActionBar, {
  type CustomerActionSurface,
} from './AgencyActionBar';
import AgencyActivationCard, {
  type ActivationJourney,
  type OwnerInvite,
  type OwnerInviteLink,
} from './AgencyActivationCard';
import AgencyGoLiveCard, {
  type GoLiveReadiness,
  type OperatorIntervention,
  type PrivacyReadiness,
} from './AgencyGoLiveCard';
import AgencyInterventionCard, {
  type InterventionOrchestration,
} from './AgencyInterventionCard';
import AgencyDomainCard, {
  type DomainControl,
} from './AgencyDomainCard';

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

type CustomerAttention = {
  requires_action?: boolean | null;
  state?: string | null;
  sort_rank?: number | null;
  source?: string | null;
  label?: string | null;
  why_now?: string | null;
  responsible_party?: string | null;
  due_at?: string | null;
  waiting_until?: string | null;
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
  activation_journey?: ActivationJourney | null;
  go_live_readiness?: GoLiveReadiness | null;
  operator_intervention?: OperatorIntervention | null;
  attention?: CustomerAttention | null;
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
    first_value_ready?: number;
    activation_score_avg?: number;
    launch_ready?: number;
    launch_blocked?: number;
    launch_readiness_avg?: number;
    redream_actions?: number;
    customer_actions?: number;
    due_now?: number;
    followups_due?: number;
    trials_urgent?: number;
    renewals_due?: number;
    stalled_activation?: number;
    waiting_on_agency?: number;
  };
  agenda: Customer[];
  customers: Customer[];
};

type CustomerDetail = {
  tenant?: Record<string, any> | null;
  branding?: Record<string, any> | null;
  lifecycle?: Record<string, any> | null;
  plan?: Record<string, any> | null;
  billing_account?: Record<string, any> | null;
  activation_journey?: ActivationJourney | null;
  go_live_readiness?: GoLiveReadiness | null;
  operator_intervention?: OperatorIntervention | null;
  intervention_orchestration?: InterventionOrchestration | null;
  attention?: CustomerAttention | null;
  action_surface?: CustomerActionSurface | null;
  privacy_readiness?: PrivacyReadiness | null;
  owner_invites?: OwnerInvite[];
  domains?: Array<Record<string, any>>;
  domain_control?: DomainControl | null;
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
  commercialStart: 'trial' | 'onboarding';
  trialDays: number;
  contractAmount: string;
  contractCurrency: string;
  annualCommitment: boolean;
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
  commercialStart: 'trial',
  trialDays: 14,
  contractAmount: '',
  contractCurrency: 'EUR',
  annualCommitment: false,
  websiteUrl: '',
  supportEmail: '',
  primaryColor: '#111827',
  accentColor: '#7C6CF2',
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

const aiCost = (micros = 0) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, micros) / 1_000_000);

const capacityPercent = (value?: number | null) =>
  Math.max(0, Math.min(100, Number(value || 0)));

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
  value ? ACTION_LABELS[value] || titleCase(value) : 'Monitor agency';

const attentionBadge = (state?: string | null) => {
  if (state === 'overdue') return 'OVERDUE';
  if (state === 'today') return 'TODAY';
  if (state === 'soon') return 'SOON';
  if (state === 'stalled') return 'STALLED';
  return 'NOW';
};

const attentionTone = (state?: string | null) => {
  if (state === 'overdue') return styles.agendaUrgent;
  if (state === 'today' || state === 'soon') return styles.agendaSoon;
  if (state === 'stalled') return styles.agendaStalled;
  return styles.agendaNow;
};

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
  const [environmentLabel, setEnvironmentLabel] = useState('Environment');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'attention' | 'launch' | 'trials' | 'risk' | 'expansion'>('all');

  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPlan, setDetailPlan] = useState('');
  const [detailOwnerEmail, setDetailOwnerEmail] = useState('');
  const [detailContractAmount, setDetailContractAmount] = useState('');
  const [detailContractCurrency, setDetailContractCurrency] = useState('EUR');
  const [detailAnnualCommitment, setDetailAnnualCommitment] = useState(false);
  const [detailContractTermEnd, setDetailContractTermEnd] = useState('');
  const [confirmingContractTerm, setConfirmingContractTerm] = useState(false);
  const [confirmingConversion, setConfirmingConversion] = useState(false);
  const [confirmingPlanChange, setConfirmingPlanChange] = useState(false);
  const [confirmingContractUpdate, setConfirmingContractUpdate] = useState(false);
  const [serviceStateTarget, setServiceStateTarget] = useState<
    'live' | 'at_risk' | 'paused' | 'churned' | null
  >(null);
  const [serviceStateReason, setServiceStateReason] = useState('');
  const [detailBusy, setDetailBusy] = useState('');
  const [privacyFocusToken, setPrivacyFocusToken] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [agency, setAgency] = useState<NewAgencyState>({ ...EMPTY_AGENCY });
  const [latestInvite, setLatestInvite] = useState<OwnerInviteLink | null>(null);

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
        router.replace('/platform/sign-in');
        return;
      }

      const [portfolioResult, plansResult] = await Promise.all([
        platformInvoke<any>('platform-ops', { action: 'portfolio' }),
        platformInvoke<any>('platform-ops', { action: 'plans' }),
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

  useEffect(() => {
    const configuredEnvironment =
      process.env.NEXT_PUBLIC_REDREAM_ENVIRONMENT?.trim();

    if (configuredEnvironment) {
      setEnvironmentLabel(configuredEnvironment);
      return;
    }

    const hostname = window.location.hostname.toLowerCase();
    setEnvironmentLabel(
      hostname.includes('staging') || hostname.includes('localhost')
        ? 'Staging'
        : 'Production',
    );
  }, []);

  const openCustomer = useCallback(async (tenantId: string) => {
    setSelectedTenantId(tenantId);
    setDetail(null);
    setDetailLoading(true);
    setDetailBusy('');
    setDetailOwnerEmail('');
    setDetailContractAmount('');
    setDetailContractCurrency('EUR');
    setDetailAnnualCommitment(false);
    setDetailContractTermEnd('');
    setConfirmingContractTerm(false);
    setConfirmingConversion(false);
    setConfirmingPlanChange(false);
    setConfirmingContractUpdate(false);
    setConfirmingContractTerm(false);
    setDetailContractTermEnd('');
    setServiceStateTarget(null);
    setServiceStateReason('');
    try {
      const result = await platformInvoke<any>('platform-ops', {
        action: 'customer_detail',
        tenant_id: tenantId,
      });
      const next = (result?.customer || null) as CustomerDetail | null;
      setDetail(next);
      setDetailPlan(String(next?.plan?.plan_key || ''));
      setDetailOwnerEmail(String(next?.lifecycle?.owner_contact_email || ''));
      const contractedCents = Number(
        next?.lifecycle?.contracted_monthly_cents || 0,
      );
      setDetailContractAmount(
        contractedCents > 0 ? (contractedCents / 100).toFixed(2) : '',
      );
      setDetailContractCurrency(
        String(next?.lifecycle?.contract_currency || 'EUR').toUpperCase(),
      );
      setDetailAnnualCommitment(
        Boolean(next?.lifecycle?.annual_commitment),
      );
      setDetailContractTermEnd(
        String(next?.lifecycle?.contract_term_ends_on || ''),
      );
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
    setConfirmingConversion(false);
    setConfirmingPlanChange(false);
    setConfirmingContractUpdate(false);
    setServiceStateTarget(null);
    setServiceStateReason('');
    setPrivacyFocusToken(0);
  };

  const focusCustomerControl = (target: string) => {
    if (!target) return;
    if (target === 'privacy-control') {
      setPrivacyFocusToken((current) => current + 1);
    }
    window.requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
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
          customer.operator_intervention?.label,
          customer.operator_intervention?.why,
          customer.attention?.label,
          customer.attention?.why_now,
          ...(customer.risk_flags || []),
          ...(customer.expansion_signals || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);

      if (!matchesSearch) return false;
      if (filter === 'attention') return customer.stage !== 'internal' && customer.attention?.requires_action === true;
      if (filter === 'launch') return customer.stage !== 'internal' && customer.go_live_readiness?.ready === false;
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

  const selectedCustomer = useMemo(
    () =>
      selectedTenantId
        ? portfolio?.customers?.find(
            (customer) => customer.tenant_id === selectedTenantId,
          ) || null
        : null,
    [portfolio?.customers, selectedTenantId],
  );

  const currentPlan = useMemo(
    () =>
      plans.find(
        (plan) =>
          plan.plan_key ===
          (detail?.plan?.plan_key || selectedCustomer?.plan_key),
      ) || null,
    [detail?.plan?.plan_key, plans, selectedCustomer?.plan_key],
  );

  const selectedPlan = useMemo(
    () =>
      plans.find(
        (plan) =>
          plan.plan_key ===
          (detailPlan || selectedCustomer?.plan_key || detail?.plan?.plan_key),
      ) || null,
    [detail?.plan?.plan_key, detailPlan, plans, selectedCustomer?.plan_key],
  );

  const planChangeReady = Boolean(
    detailPlan &&
      currentPlan &&
      selectedPlan &&
      detailPlan !== currentPlan.plan_key,
  );

  const planChangeKind = useMemo(() => {
    if (!currentPlan || !selectedPlan) return 'Plan change';

    const currentPrice = currentPlan.monthly_price_cents;
    const targetPrice = selectedPlan.monthly_price_cents;

    if (
      typeof currentPrice === 'number' &&
      typeof targetPrice === 'number'
    ) {
      if (targetPrice > currentPrice) return 'Upgrade';
      if (targetPrice < currentPrice) return 'Downgrade';
    }

    return 'Plan change';
  }, [currentPlan, selectedPlan]);

  const planChangeEvidenceMatches =
    selectedCustomer?.capacity?.next_plan_key === detailPlan;

  const agencyContractMonthlyCents = useMemo(() => {
    const normalized = agency.contractAmount.trim().replace(',', '.');
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount > 0
      ? Math.round(amount * 100)
      : 0;
  }, [agency.contractAmount]);

  const agencyContractCurrency = agency.contractCurrency.trim().toUpperCase();
  const directOnboardingReady =
    agency.commercialStart !== 'onboarding' ||
    (agencyContractMonthlyCents > 0 &&
      /^[A-Z]{3}$/.test(agencyContractCurrency));

  const conversionMonthlyCents = useMemo(() => {
    const normalized = detailContractAmount.trim().replace(',', '.');
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount > 0
      ? Math.round(amount * 100)
      : 0;
  }, [detailContractAmount]);

  const conversionCurrency = detailContractCurrency.trim().toUpperCase();
  const conversionReady = Boolean(
    selectedCustomer?.stage === 'trial' &&
      detailPlan &&
      conversionMonthlyCents > 0 &&
      /^[A-Z]{3}$/.test(conversionCurrency),
  );

  const currentContractMonthlyCents = Number(
    detail?.lifecycle?.contracted_monthly_cents || 0,
  );
  const currentContractCurrency = String(
    detail?.lifecycle?.contract_currency || 'EUR',
  ).toUpperCase();
  const currentAnnualCommitment = Boolean(
    detail?.lifecycle?.annual_commitment,
  );
  const contractHasChanges =
    conversionMonthlyCents !== currentContractMonthlyCents ||
    conversionCurrency !== currentContractCurrency ||
    detailAnnualCommitment !== currentAnnualCommitment;
  const contractUpdateReady = Boolean(
    selectedCustomer &&
      !['trial', 'internal'].includes(selectedCustomer.stage) &&
      conversionMonthlyCents > 0 &&
      /^[A-Z]{3}$/.test(conversionCurrency) &&
      contractHasChanges,
  );

  const currentContractTermEnd = String(
    detail?.lifecycle?.contract_term_ends_on || '',
  );
  const contractedOn = String(detail?.lifecycle?.contracted_at || '').slice(
    0,
    10,
  );
  const contractTermChanged =
    detailContractTermEnd !== currentContractTermEnd;
  const contractTermFormatValid =
    !detailContractTermEnd ||
    /^\d{4}-\d{2}-\d{2}$/.test(detailContractTermEnd);
  const contractTermChronologyValid =
    !detailContractTermEnd ||
    !contractedOn ||
    detailContractTermEnd >= contractedOn;
  const contractTermReady = Boolean(
    selectedCustomer &&
      !['trial', 'internal', 'churned'].includes(selectedCustomer.stage) &&
      currentContractMonthlyCents > 0 &&
      detail?.lifecycle?.contracted_at &&
      contractTermChanged &&
      contractTermFormatValid &&
      contractTermChronologyValid,
  );

  const serviceState = String(
    detail?.lifecycle?.stage || selectedCustomer?.stage || '',
  );

  const serviceStateActions = useMemo(() => {
    if (serviceState === 'live') {
      return [
        { state: 'at_risk' as const, label: 'Mark at risk' },
        { state: 'paused' as const, label: 'Pause service' },
        { state: 'churned' as const, label: 'End customer' },
      ];
    }
    if (serviceState === 'at_risk') {
      return [
        { state: 'live' as const, label: 'Return to live' },
        { state: 'paused' as const, label: 'Pause service' },
        { state: 'churned' as const, label: 'End customer' },
      ];
    }
    if (serviceState === 'paused') {
      return [
        { state: 'live' as const, label: 'Resume service' },
        { state: 'churned' as const, label: 'End customer' },
      ];
    }
    return [];
  }, [serviceState]);

  const serviceStateNeedsReason =
    serviceStateTarget === 'paused' || serviceStateTarget === 'churned';
  const serviceStateReady = Boolean(
    serviceStateTarget &&
      serviceStateTarget !== serviceState &&
      (!serviceStateNeedsReason || serviceStateReason.trim()),
  );

  const serviceStateEffect = useMemo(() => {
    if (serviceStateTarget === 'at_risk') {
      return 'Keeps workspace access and billing unchanged while flagging the customer for retention attention.';
    }
    if (serviceStateTarget === 'paused') {
      return 'Suspends workspace access. An active billing account moves to on hold. No customer data is deleted and the active plan is retained.';
    }
    if (serviceStateTarget === 'live' && serviceState === 'paused') {
      return 'Restores workspace access. Billing returns to active only when ReDream previously placed it on hold; past-due billing remains past due.';
    }
    if (serviceStateTarget === 'live') {
      return 'Returns the customer to live service without changing plan or contract terms.';
    }
    if (serviceStateTarget === 'churned') {
      return 'Closes workspace access, cancels the billing account and ends the active plan. Customer data is retained.';
    }
    return '';
  }, [serviceState, serviceStateTarget]);

  const commercialDecision = useMemo(() => {
    if (!selectedCustomer) {
      return {
        label: 'Commercial evidence loading',
        copy: 'Waiting for the portfolio snapshot for this agency.',
      };
    }

    if (selectedCustomer.stage === 'trial') {
      const days =
        selectedCustomer.trial_days_left === null ||
        selectedCustomer.trial_days_left === undefined
          ? null
          : Math.max(0, selectedCustomer.trial_days_left);

      if (selectedCustomer.activation_journey?.first_value_ready) {
        return {
          label: 'Conversion evidence available',
          copy:
            days === null
              ? 'First working value is recorded. Review contracted terms before changing the customer stage.'
              : `First working value is recorded with ${days} day${days === 1 ? '' : 's'} left in the trial. Review contracted terms before changing the customer stage.`,
        };
      }

      return {
        label: 'Trial still proving value',
        copy:
          days === null
            ? 'First working value is not recorded yet. Keep the commercial decision tied to evidence, not login activity.'
            : `${days} day${days === 1 ? '' : 's'} remain and first working value is not recorded yet. Keep the commercial decision tied to evidence, not login activity.`,
      };
    }

    if (selectedCustomer.attention?.source === 'renewal') {
      return {
        label: selectedCustomer.attention.label || 'Renewal attention',
        copy:
          selectedCustomer.attention.why_now ||
          'Review the recorded contract term and renewal timing.',
      };
    }

    if (selectedCustomer.expansion_signals?.length) {
      return {
        label: 'Expansion evidence available',
        copy: selectedCustomer.expansion_signals
          .slice(0, 3)
          .map((signal) => titleCase(signal))
          .join(' · '),
      };
    }

    return {
      label: 'Commercial position stable',
      copy: 'No evidence-led expansion signal is currently recorded.',
    };
  }, [selectedCustomer]);

  const createAgency = async (event: FormEvent) => {
    event.preventDefault();
    if (
      creating ||
      !agency.displayName.trim() ||
      !agency.planKey ||
      !directOnboardingReady
    ) {
      return;
    }

    setCreating(true);
    setError('');
    setNotice('');

    const finalSlug = agency.slug.trim() || slugify(agency.displayName);
    const shortName = agency.displayName.trim().split(/\s+/).slice(0, 3).join(' ');

    try {
      const result = await platformInvoke<any>('platform-ops', {
        action: 'create_customer',
        display_name: agency.displayName.trim(),
        slug: finalSlug,
        legal_name: agency.legalName.trim() || agency.displayName.trim(),
        plan_key: agency.planKey,
        owner_email: agency.ownerEmail.trim().toLowerCase() || null,
        trial_days:
          agency.commercialStart === 'trial' ? agency.trialDays : 14,
        stage: agency.commercialStart,
        billing_mode: 'manual',
        contracted_monthly_cents:
          agency.commercialStart === 'onboarding'
            ? agencyContractMonthlyCents
            : undefined,
        contract_currency:
          agency.commercialStart === 'onboarding'
            ? agencyContractCurrency
            : undefined,
        annual_commitment:
          agency.commercialStart === 'onboarding'
            ? agency.annualCommitment
            : undefined,
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
      const inviteId = String(result?.owner?.invite?.invite_id || '');
      const invitePath = String(result?.owner?.invite?.invite_path || '');
      if (tenantId && inviteId && invitePath) {
        setLatestInvite({
          tenantId,
          inviteId,
          url: `${window.location.origin}${invitePath}`,
        });
      }
      setNotice(
        invitePath
          ? `${agency.displayName} is provisioned. The secure owner invitation is ready to share.`
          : `${agency.displayName} is provisioned and ready for activation.`,
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

  const convertTrial = async () => {
    if (
      !selectedTenantId ||
      !conversionReady ||
      detailBusy ||
      selectedCustomer?.stage !== 'trial'
    ) {
      return;
    }

    if (!confirmingConversion) {
      setConfirmingConversion(true);
      return;
    }

    setDetailBusy('conversion');
    setError('');

    try {
      await platformInvoke('platform-ops', {
        action: 'update_customer',
        tenant_id: selectedTenantId,
        plan_key: detailPlan,
        stage: 'onboarding',
        contracted_monthly_cents: conversionMonthlyCents,
        contract_currency: conversionCurrency,
        annual_commitment: detailAnnualCommitment,
      });

      setConfirmingConversion(false);
      await Promise.all([openCustomer(selectedTenantId), load(true)]);
      setNotice(
        `${selectedCustomer.display_name} is converted from trial with contracted MRR recorded.`,
      );
    } catch (conversionError) {
      setError(friendlyError(conversionError));
    } finally {
      setDetailBusy('');
    }
  };

  const updateCommercialContract = async () => {
    if (!selectedTenantId || !contractUpdateReady || detailBusy) return;

    if (!confirmingContractUpdate) {
      setConfirmingContractUpdate(true);
      return;
    }

    setDetailBusy('contract');
    setError('');
    try {
      await platformInvoke('platform-ops', {
        action: 'update_customer',
        tenant_id: selectedTenantId,
        contracted_monthly_cents: conversionMonthlyCents,
        contract_currency: conversionCurrency,
        annual_commitment: detailAnnualCommitment,
      });
      setConfirmingContractUpdate(false);
      await Promise.all([openCustomer(selectedTenantId), load(true)]);
      setNotice('Commercial contract evidence updated.');
    } catch (contractError) {
      setError(friendlyError(contractError));
    } finally {
      setDetailBusy('');
    }
  };

  const updateContractTerm = async () => {
    if (!selectedTenantId || !contractTermReady || detailBusy) return;

    if (!confirmingContractTerm) {
      setConfirmingContractTerm(true);
      return;
    }

    setDetailBusy('contract-term');
    setError('');
    try {
      await platformInvoke('platform-ops', {
        action: 'set_contract_term',
        tenant_id: selectedTenantId,
        contract_term_ends_on: detailContractTermEnd || null,
      });
      setConfirmingContractTerm(false);
      await Promise.all([openCustomer(selectedTenantId), load(true)]);
      setNotice(
        detailContractTermEnd
          ? 'Contract term end date recorded for renewal tracking.'
          : 'Contract term end date cleared after explicit review.',
      );
    } catch (termError) {
      setError(friendlyError(termError));
    } finally {
      setDetailBusy('');
    }
  };

  const updateCustomerServiceState = async () => {
    if (
      !selectedTenantId ||
      !serviceStateTarget ||
      !serviceStateReady ||
      detailBusy
    ) {
      return;
    }

    setDetailBusy('service-state');
    setError('');
    try {
      await platformInvoke('platform-ops', {
        action: 'set_customer_service_state',
        tenant_id: selectedTenantId,
        state: serviceStateTarget,
        reason: serviceStateReason.trim() || null,
      });
      const completedState = serviceStateTarget;
      setServiceStateTarget(null);
      setServiceStateReason('');
      await Promise.all([openCustomer(selectedTenantId), load(true)]);
      setNotice(
        completedState === 'churned'
          ? 'Customer service ended with commercial state synchronised.'
          : completedState === 'paused'
            ? 'Customer service paused with workspace and billing state synchronised.'
            : completedState === 'live'
              ? 'Customer returned to live service.'
              : 'Customer marked at risk.',
      );
    } catch (serviceStateError) {
      setError(friendlyError(serviceStateError));
    } finally {
      setDetailBusy('');
    }
  };

  const updateCustomerPlan = async () => {
    if (!selectedTenantId || !planChangeReady || detailBusy) return;

    if (!confirmingPlanChange) {
      setConfirmingPlanChange(true);
      return;
    }

    setDetailBusy('plan');
    setError('');
    try {
      await platformInvoke('platform-ops', {
        action: 'update_customer',
        tenant_id: selectedTenantId,
        plan_key: detailPlan,
      });
      setConfirmingPlanChange(false);
      await Promise.all([openCustomer(selectedTenantId), load(true)]);
      setNotice('Plan updated after explicit review.');
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
      await platformInvoke('platform-ops', {
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
      await platformInvoke('platform-ops', {
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
    router.replace('/platform/sign-in');
  };

  if (loading) {
    return (
      <main className={styles.loadingPage}>
        <div className={styles.loadingMark}>
          <Sparkles size={18} />
        </div>
        <div>
          <strong>Opening ReDream</strong>
          <span>Loading the ReDream Systems control plane</span>
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
          <h1>ReDream operator access required</h1>
          <p>This control plane is separate from agency administration and is only available to authorised ReDream Systems operators.</p>
          <button type="button" onClick={() => void signOut()}>
            Sign in with another account
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brandBlock}>
          <div className={styles.brandMark}>R</div>
          <div>
            <strong>ReDream Systems</strong>
            <span>Operator cockpit</span>
          </div>
        </div>

        <div className={styles.topbarActions}>
          <div className={styles.liveStatus}>
            <span />
            {environmentLabel}
          </div>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Refresh ReDream"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            <RefreshCw size={17} className={refreshing ? styles.spin : ''} />
          </button>
          <button type="button" className={styles.iconButton} aria-label="Sign out" onClick={() => void signOut()}>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className={styles.canvas}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>REDREAM SYSTEMS</p>
            <h1>Know what blocks launch, value and revenue before the agency asks.</h1>
            <p className={styles.heroCopy}>
              ReDream separates launch readiness, working value and commercial intervention so you always know who should act next.
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
            note={`${summary.live_customers || 0} live agenc${summary.live_customers === 1 ? 'y' : 'ies'}`}
          />
          <Metric
            icon={<ShieldCheck size={17} />}
            label="Launch ready"
            value={`${summary.launch_ready || 0}/${summary.external_customers || 0}`}
            note={`Average readiness ${summary.launch_readiness_avg || 0}%`}
            attention={Boolean(summary.launch_blocked)}
          />
          <Metric
            icon={<AlertTriangle size={17} />}
            label="At risk"
            value={String(summary.at_risk_customers || 0)}
            note={`${summary.customers_needing_action || 0} agenc${summary.customers_needing_action === 1 ? 'y' : 'ies'} need action`}
            attention={Boolean(summary.at_risk_customers)}
          />
          <Metric
            icon={<Clock3 size={17} />}
            label="Due now"
            value={String(summary.due_now || 0)}
            note={`${summary.followups_due || 0} follow-ups due · ${summary.trials_urgent || 0} urgent trials`}
            attention={Boolean(summary.due_now)}
          />
          <Metric
            icon={<Gauge size={17} />}
            label="First value reached"
            value={`${summary.first_value_ready || 0}/${summary.external_customers || 0}`}
            note={`Average activation ${summary.activation_score_avg || 0}%`}
            attention={
              Boolean(summary.external_customers) &&
              Number(summary.first_value_ready || 0) <
                Number(summary.external_customers || 0)
            }
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
                  <span
                    className={`${styles.agendaRank} ${attentionTone(customer.attention?.state)}`}
                  >
                    {attentionBadge(customer.attention?.state)}
                  </span>
                  <div className={styles.agendaIdentity}>
                    <strong>{customer.display_name} · {customer.attention?.label || customer.operator_intervention?.label || actionLabel(customer.next_action)}</strong>
                    <span>{customer.attention?.why_now || customer.operator_intervention?.why || actionLabel(customer.next_action)}</span>
                  </div>
                  <div className={styles.agendaSignal}>
                    <span className={`${styles.healthDot} ${healthTone(customer.health_band)}`} />
                    {customer.attention?.responsible_party === 'agency_owner' ? 'Agency' : 'ReDream'}
                  </div>
                  <ChevronRight size={16} />
                </button>
              ))}

              {!portfolio?.agenda?.length ? (
                <div className={styles.clearState}>
                  <ShieldCheck size={21} />
                  <strong>No urgent agency action</strong>
                  <span>The portfolio has no external agency currently below the action threshold.</span>
                </div>
              ) : null}
            </div>
          </article>

          <article className={styles.signalPanel}>
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.eyebrow}>PORTFOLIO SIGNAL</p>
                <h2>Agency portfolio</h2>
              </div>
              <Gauge size={18} />
            </div>

            <div className={styles.signalStack}>
              <Signal
                label="External agencies"
                value={summary.external_customers || 0}
                max={Math.max(summary.total_tenants || 1, 1)}
              />
              <Signal
                label="Launch ready"
                value={summary.launch_ready || 0}
                max={Math.max(summary.external_customers || 1, 1)}
              />
              <Signal
                label="First value reached"
                value={summary.first_value_ready || 0}
                max={Math.max(summary.external_customers || 1, 1)}
              />
              <Signal
                label="Live"
                value={summary.live_customers || 0}
                max={Math.max(summary.external_customers || 1, 1)}
              />
            </div>

            <div className={styles.signalFooter}>
              <Activity size={16} />
              <div>
                <strong>{summary.due_now || 0} due now · {summary.waiting_on_agency || 0} deliberately waiting</strong>
                <span>Ranked from explicit follow-ups, trial deadlines, owner-invite timing and observed activation progress.</span>
              </div>
            </div>
          </article>
        </section>

        <section className={styles.customersSection}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>AGENCIES</p>
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

              <div className={styles.filters} role="tablist" aria-label="Agency filters">
                {[
                  ['all', 'All'],
                  ['attention', 'Needs action'],
                  ['launch', 'Launch blocked'],
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
                  <span>Launch readiness</span>
                  <div>
                    <i style={{ width: `${Math.max(0, Math.min(100, customer.go_live_readiness?.readiness_pct || 0))}%` }} />
                  </div>
                  <strong>{customer.go_live_readiness?.readiness_pct ?? 0}%</strong>
                </div>

                <div className={styles.activationMini}>
                  <span>
                    <Layers3 size={13} />
                    {customer.activation_journey?.counts?.roster_players || 0} players
                  </span>
                  <span>
                    <Globe2 size={13} />
                    {customer.activation_journey?.counts?.relationships || 0} relationships
                  </span>
                  <span>
                    <Sparkles size={13} />
                    {customer.activation_journey?.score || 0}% activated
                  </span>
                </div>

                <div className={styles.nextAction}>
                  <span>{customer.attention?.requires_action ? 'Due now' : customer.attention?.state === 'waiting' ? 'Waiting on agency' : 'Next intervention'}</span>
                  <strong>{customer.attention?.label || customer.operator_intervention?.label || actionLabel(customer.next_action)}</strong>
                </div>

                <ScoreRing score={customer.health_score || 0} band={customer.health_band} />
                <ChevronRight size={17} className={styles.cardChevron} />
              </button>
            ))}

            {!customers.length ? (
              <div className={styles.emptyCustomers}>
                <Building2 size={23} />
                <strong>No agencies match this view</strong>
                <span>Change the filter or create a new agency.</span>
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
                <p className={styles.eyebrow}>NEW AGENCY</p>
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

              <div className={styles.commercialStartPicker}>
                <button
                  type="button"
                  className={
                    agency.commercialStart === 'trial'
                      ? styles.commercialStartActive
                      : ''
                  }
                  onClick={() =>
                    setAgency((current) => ({
                      ...current,
                      commercialStart: 'trial',
                    }))
                  }
                >
                  <strong>Start as trial</strong>
                  <span>
                    Starts the trial clock and keeps conversion evidence visible.
                  </span>
                </button>
                <button
                  type="button"
                  className={
                    agency.commercialStart === 'onboarding'
                      ? styles.commercialStartActive
                      : ''
                  }
                  onClick={() =>
                    setAgency((current) => ({
                      ...current,
                      commercialStart: 'onboarding',
                    }))
                  }
                >
                  <strong>Direct onboarding</strong>
                  <span>
                    Use when commercial terms are already agreed outside a trial.
                  </span>
                </button>
              </div>

              {agency.commercialStart === 'onboarding' ? (
                <div className={styles.directContract}>
                  <div className={styles.commercialSubhead}>
                    <span>Signed commercial terms</span>
                    <small>
                      Direct onboarding requires real contract evidence because
                      go-live is blocked until contracted MRR is recorded.
                    </small>
                  </div>
                  <div className={styles.conversionFields}>
                    <label className={styles.field}>
                      <span>Contract MRR</span>
                      <input
                        inputMode="decimal"
                        value={agency.contractAmount}
                        onChange={(event) =>
                          setAgency((current) => ({
                            ...current,
                            contractAmount: event.target.value,
                          }))
                        }
                        placeholder="500.00"
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Currency</span>
                      <input
                        value={agency.contractCurrency}
                        maxLength={3}
                        onChange={(event) =>
                          setAgency((current) => ({
                            ...current,
                            contractCurrency: event.target.value
                              .replace(/[^a-z]/gi, '')
                              .slice(0, 3)
                              .toUpperCase(),
                          }))
                        }
                        placeholder="EUR"
                      />
                    </label>
                    <label className={styles.commitmentToggle}>
                      <input
                        type="checkbox"
                        checked={agency.annualCommitment}
                        onChange={(event) =>
                          setAgency((current) => ({
                            ...current,
                            annualCommitment: event.target.checked,
                          }))
                        }
                      />
                      <span>
                        <strong>Annual commitment</strong>
                        <small>
                          Record only when the signed agreement is annual.
                        </small>
                      </span>
                    </label>
                  </div>
                </div>
              ) : null}

              <div className={styles.formGrid}>
                {agency.commercialStart === 'trial' ? (
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
                          trialDays: Math.max(
                            1,
                            Math.min(90, Number(event.target.value) || 14),
                          ),
                        }))
                      }
                    />
                  </label>
                ) : null}

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
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={creating || !directOnboardingReady}
                >
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
                <p className={styles.eyebrow}>AGENCY</p>
                <h2>{detail?.branding?.display_name || detail?.tenant?.legal_name || 'Agency workspace'}</h2>
                <span>{detail?.tenant?.slug || selectedTenantId}</span>
              </div>
              <button type="button" className={styles.iconButton} aria-label="Close agency" onClick={closeDetail}>
                <X size={17} />
              </button>
            </div>

            {detailLoading ? (
              <div className={styles.drawerLoading}>
                <LoaderCircle size={19} className={styles.spin} />
                Loading agency...
              </div>
            ) : detail ? (
              <div className={styles.drawerBody}>
                <div className={styles.detailStats}>
                  <DetailStat label="Stage" value={titleCase(detail.lifecycle?.stage || detail.tenant?.status)} />
                  <DetailStat label="Plan" value={titleCase(detail.plan?.plan_key || 'None')} />
                  <DetailStat label="Launch" value={`${detail.go_live_readiness?.readiness_pct || 0}%`} />
                  <DetailStat label="First value" value={detail.activation_journey?.first_value_ready ? 'Reached' : 'Not yet'} />
                </div>

                <AgencyActionBar
                  tenantId={selectedTenantId}
                  agencyName={detail?.branding?.display_name || detail?.tenant?.legal_name || 'Agency'}
                  surface={detail.action_surface}
                  onFocus={focusCustomerControl}
                  onRefresh={async () => {
                    await Promise.all([
                      openCustomer(selectedTenantId),
                      load(true),
                    ]);
                  }}
                  onNotice={setNotice}
                  onError={setError}
                />

                <section id="commercial-control" className={styles.drawerSection}>
                  <div className={styles.drawerSectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>COMMERCIAL</p>
                      <h3>Plan and conversion</h3>
                    </div>
                    <CircleDollarSign size={17} />
                  </div>

                  <div className={styles.commercialMetrics}>
                    <CommercialMetric
                      label="Current plan"
                      value={
                        selectedCustomer?.plan_name ||
                        selectedPlan?.display_name ||
                        titleCase(detail.plan?.plan_key || 'None')
                      }
                      detail={
                        selectedPlan
                          ? planPrice(selectedPlan)
                          : 'No list price resolved'
                      }
                    />
                    <CommercialMetric
                      label="Trial position"
                      value={
                        selectedCustomer?.stage === 'trial'
                          ? selectedCustomer.trial_days_left === null ||
                            selectedCustomer.trial_days_left === undefined
                            ? 'Active trial'
                            : `${Math.max(0, selectedCustomer.trial_days_left)} days left`
                          : titleCase(
                              selectedCustomer?.stage ||
                                detail.lifecycle?.stage ||
                                'Unknown',
                            )
                      }
                      detail={
                        selectedCustomer?.attention?.source === 'trial'
                          ? selectedCustomer.attention.why_now ||
                            'Trial review is due.'
                          : 'Evidence-derived lifecycle state'
                      }
                    />
                    <CommercialMetric
                      label="Contracted MRR"
                      value={
                        selectedCustomer?.commercial
                          ?.contracted_monthly_cents
                          ? money(
                              selectedCustomer.commercial
                                .contracted_monthly_cents,
                              selectedCustomer.commercial.contract_currency ||
                                'EUR',
                            )
                          : 'Not set'
                      }
                      detail={
                        selectedCustomer?.commercial?.annual_commitment
                          ? 'Annual commitment recorded'
                          : 'Monthly commercial position'
                      }
                    />
                    <CommercialMetric
                      label="AI cost 30d"
                      value={aiCost(
                        selectedCustomer?.commercial?.ai_cost_micros_30d || 0,
                      )}
                      detail="Estimated model cost in US dollars"
                    />
                  </div>

                  <div className={styles.commercialDecision}>
                    <div>
                      <p className={styles.eyebrow}>DECISION SIGNAL</p>
                      <strong>{commercialDecision.label}</strong>
                      <span>{commercialDecision.copy}</span>
                    </div>
                    {selectedCustomer?.capacity?.next_plan_name ? (
                      <div className={styles.nextPlanSignal}>
                        <TrendingUp size={15} />
                        <span>
                          Next plan evidence
                          <strong>
                            {selectedCustomer.capacity.next_plan_name}
                          </strong>
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {selectedCustomer?.stage === 'trial' ? (
                    <div className={styles.trialConversion}>
                      <div className={styles.commercialSubhead}>
                        <span>Convert trial</span>
                        <small>
                          Record the agreed contract and move the customer from
                          Trial to Onboarding. Go-live remains a separate
                          evidence-guarded action.
                        </small>
                      </div>

                      <div className={styles.conversionFields}>
                        <label className={styles.field}>
                          <span>Contract MRR</span>
                          <input
                            inputMode="decimal"
                            value={detailContractAmount}
                            onChange={(event) => {
                              setDetailContractAmount(event.target.value);
                              setConfirmingConversion(false);
                              setConfirmingContractUpdate(false);
                            }}
                            placeholder="500.00"
                          />
                        </label>

                        <label className={styles.field}>
                          <span>Currency</span>
                          <input
                            value={detailContractCurrency}
                            maxLength={3}
                            onChange={(event) => {
                              setDetailContractCurrency(
                                event.target.value
                                  .replace(/[^a-z]/gi, '')
                                  .slice(0, 3)
                                  .toUpperCase(),
                              );
                              setConfirmingConversion(false);
                              setConfirmingContractUpdate(false);
                            }}
                            placeholder="EUR"
                          />
                        </label>

                        <label className={styles.commitmentToggle}>
                          <input
                            type="checkbox"
                            checked={detailAnnualCommitment}
                            onChange={(event) => {
                              setDetailAnnualCommitment(event.target.checked);
                              setConfirmingConversion(false);
                              setConfirmingContractUpdate(false);
                            }}
                          />
                          <span>
                            <strong>Annual commitment</strong>
                            <small>
                              Record only when the signed commercial agreement
                              is annual.
                            </small>
                          </span>
                        </label>
                      </div>

                      {confirmingConversion ? (
                        <div className={styles.conversionConfirm}>
                          <strong>Confirm paid conversion</strong>
                          <span>
                            {selectedPlan?.display_name ||
                              titleCase(detailPlan)}{' '}
                            · {money(
                              conversionMonthlyCents,
                              conversionCurrency,
                            )}
                            /mo
                            {detailAnnualCommitment
                              ? ' · annual commitment'
                              : ''}
                          </span>
                          <small>
                            This records contracted MRR and the contract date.
                            It does not mark the agency live.
                          </small>
                        </div>
                      ) : null}

                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => void convertTrial()}
                        disabled={!conversionReady || detailBusy === 'conversion'}
                      >
                        {detailBusy === 'conversion' ? (
                          <LoaderCircle size={15} className={styles.spin} />
                        ) : confirmingConversion ? (
                          <Check size={15} />
                        ) : (
                          <ArrowRight size={15} />
                        )}
                        {detailBusy === 'conversion'
                          ? 'Converting...'
                          : confirmingConversion
                            ? 'Confirm conversion'
                            : 'Review conversion'}
                      </button>
                    </div>
                  ) : null}

                  {selectedCustomer &&
                  !['trial', 'internal'].includes(selectedCustomer.stage) ? (
                    <div className={styles.contractControl}>
                      <div className={styles.commercialSubhead}>
                        <span>Commercial contract</span>
                        <small>
                          Record or correct contract evidence without changing
                          the plan, lifecycle stage or go-live state.
                        </small>
                      </div>

                      <div className={styles.conversionFields}>
                        <label className={styles.field}>
                          <span>Contract MRR</span>
                          <input
                            inputMode="decimal"
                            value={detailContractAmount}
                            onChange={(event) => {
                              setDetailContractAmount(event.target.value);
                              setConfirmingContractUpdate(false);
                            }}
                            placeholder="500.00"
                          />
                        </label>

                        <label className={styles.field}>
                          <span>Currency</span>
                          <input
                            value={detailContractCurrency}
                            maxLength={3}
                            onChange={(event) => {
                              setDetailContractCurrency(
                                event.target.value
                                  .replace(/[^a-z]/gi, '')
                                  .slice(0, 3)
                                  .toUpperCase(),
                              );
                              setConfirmingContractUpdate(false);
                            }}
                            placeholder="EUR"
                          />
                        </label>

                        <label className={styles.commitmentToggle}>
                          <input
                            type="checkbox"
                            checked={detailAnnualCommitment}
                            onChange={(event) => {
                              setDetailAnnualCommitment(event.target.checked);
                              setConfirmingContractUpdate(false);
                            }}
                          />
                          <span>
                            <strong>Annual commitment</strong>
                            <small>
                              Keep this aligned to the signed commercial agreement.
                            </small>
                          </span>
                        </label>
                      </div>

                      {confirmingContractUpdate ? (
                        <div className={styles.contractConfirm}>
                          <strong>
                            {currentContractMonthlyCents > 0
                              ? 'Confirm contract update'
                              : 'Confirm contract evidence'}
                          </strong>
                          <span>
                            {currentContractMonthlyCents > 0
                              ? `${money(
                                  currentContractMonthlyCents,
                                  currentContractCurrency,
                                )}/mo to `
                              : ''}
                            {money(
                              conversionMonthlyCents,
                              conversionCurrency,
                            )}
                            /mo
                            {detailAnnualCommitment
                              ? ' · annual commitment'
                              : ''}
                          </span>
                          <small>
                            This writes commercial evidence only. Plan and
                            lifecycle state stay unchanged.
                          </small>
                        </div>
                      ) : null}

                      <button
                        type="button"
                        className={
                          confirmingContractUpdate
                            ? styles.primaryButton
                            : styles.secondaryButton
                        }
                        onClick={() => void updateCommercialContract()}
                        disabled={
                          detailBusy === 'contract' || !contractUpdateReady
                        }
                      >
                        {detailBusy === 'contract' ? (
                          <LoaderCircle size={15} className={styles.spin} />
                        ) : confirmingContractUpdate ? (
                          <Check size={15} />
                        ) : (
                          <ArrowRight size={15} />
                        )}
                        {detailBusy === 'contract'
                          ? 'Updating...'
                          : confirmingContractUpdate
                            ? 'Confirm contract'
                            : 'Review contract'}
                      </button>

                      <div className={styles.contractTermControl}>
                        <div className={styles.commercialSubhead}>
                          <span>Contract term</span>
                          <small>
                            Record the signed term end date so ReDream can
                            surface renewal work at the right time. No end date
                            is guessed automatically.
                          </small>
                        </div>

                        <div className={styles.contractTermRow}>
                          <label className={styles.field}>
                            <span>Term ends</span>
                            <input
                              type="date"
                              value={detailContractTermEnd}
                              onChange={(event) => {
                                setDetailContractTermEnd(event.target.value);
                                setConfirmingContractTerm(false);
                              }}
                            />
                          </label>

                          <button
                            type="button"
                            className={
                              confirmingContractTerm
                                ? styles.primaryButton
                                : styles.secondaryButton
                            }
                            onClick={() => void updateContractTerm()}
                            disabled={
                              detailBusy === 'contract-term' ||
                              !contractTermReady
                            }
                          >
                            {detailBusy === 'contract-term' ? (
                              <LoaderCircle
                                size={15}
                                className={styles.spin}
                              />
                            ) : confirmingContractTerm ? (
                              <Check size={15} />
                            ) : (
                              <Clock3 size={15} />
                            )}
                            {detailBusy === 'contract-term'
                              ? 'Updating...'
                              : confirmingContractTerm
                                ? 'Confirm term'
                                : 'Review term'}
                          </button>
                        </div>

                        {!contractTermChronologyValid ? (
                          <small className={styles.contractTermWarning}>
                            The term end date cannot be before the recorded
                            contract date.
                          </small>
                        ) : null}

                        {detailAnnualCommitment &&
                        !currentContractTermEnd &&
                        !detailContractTermEnd ? (
                          <small className={styles.contractTermWarning}>
                            This annual commitment has no term end date, so
                            renewal timing cannot yet be tracked.
                          </small>
                        ) : null}

                        {confirmingContractTerm ? (
                          <div className={styles.contractTermConfirm}>
                            <strong>Confirm contract term change</strong>
                            <span>
                              {currentContractTermEnd || 'Not recorded'} to{' '}
                              {detailContractTermEnd || 'Not recorded'}
                            </span>
                            <small>
                              This changes renewal evidence only. It does not
                              change MRR, plan, billing state or lifecycle.
                            </small>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className={styles.capacityGrid}>
                    <CommercialCapacity
                      label="Player capacity"
                      value={capacityPercent(
                        selectedCustomer?.capacity?.player_pct,
                      )}
                    />
                    <CommercialCapacity
                      label="Staff capacity"
                      value={capacityPercent(
                        selectedCustomer?.capacity?.staff_pct,
                      )}
                    />
                  </div>

                  {selectedCustomer?.expansion_signals?.length ? (
                    <div className={styles.expansionSignals}>
                      {selectedCustomer.expansion_signals
                        .slice(0, 4)
                        .map((signal) => (
                          <span key={signal}>{titleCase(signal)}</span>
                        ))}
                    </div>
                  ) : null}

                  <div className={styles.commercialSubhead}>
                    <span>Plan control</span>
                    <small>
                      Changing plan changes entitlements. It does not convert
                      the lifecycle stage by itself. Every change requires
                      explicit review and confirmation.
                    </small>
                  </div>

                  <div className={styles.inlineControls}>
                    <label className={styles.field}>
                      <span>Plan</span>
                      <select
                        value={detailPlan}
                        onChange={(event) => {
                          setDetailPlan(event.target.value);
                          setConfirmingConversion(false);
                          setConfirmingPlanChange(false);
                        }}
                      >
                        {plans.map((plan) => (
                          <option value={plan.plan_key} key={plan.plan_key}>
                            {plan.display_name} · {planPrice(plan)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className={
                        confirmingPlanChange
                          ? styles.primaryButton
                          : styles.secondaryButton
                      }
                      onClick={() => void updateCustomerPlan()}
                      disabled={detailBusy === 'plan' || !planChangeReady}
                    >
                      {detailBusy === 'plan' ? (
                        <LoaderCircle size={15} className={styles.spin} />
                      ) : confirmingPlanChange ? (
                        <Check size={15} />
                      ) : (
                        <ArrowRight size={15} />
                      )}
                      {detailBusy === 'plan'
                        ? 'Updating...'
                        : confirmingPlanChange
                          ? 'Confirm plan change'
                          : 'Review plan change'}
                    </button>
                  </div>

                  {confirmingPlanChange && currentPlan && selectedPlan ? (
                    <div className={styles.planChangeConfirm}>
                      <div>
                        <p className={styles.eyebrow}>{planChangeKind.toUpperCase()}</p>
                        <strong>
                          {currentPlan.display_name} to {selectedPlan.display_name}
                        </strong>
                        <span>
                          {planPrice(currentPlan)} to {planPrice(selectedPlan)}
                        </span>
                      </div>
                      <div className={styles.planChangeEvidence}>
                        <small>
                          {planChangeEvidenceMatches
                            ? 'This target matches the recorded next-plan capacity evidence.'
                            : 'No automatic upgrade decision is being made. Confirm only if this commercial change is intended.'}
                        </small>
                        {selectedCustomer?.expansion_signals?.length ? (
                          <div className={styles.expansionSignals}>
                            {selectedCustomer.expansion_signals
                              .slice(0, 3)
                              .map((signal) => (
                                <span key={signal}>{titleCase(signal)}</span>
                              ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className={styles.commercialSubhead}>
                    <span>Account owner</span>
                    <small>
                      Attach the accountable agency owner without changing
                      commercial evidence.
                    </small>
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

                {['live', 'at_risk', 'paused', 'churned'].includes(
                  serviceState,
                ) ? (
                  <section
                    id="service-lifecycle-control"
                    className={styles.drawerSection}
                  >
                    <div className={styles.drawerSectionHeading}>
                      <div>
                        <p className={styles.eyebrow}>SERVICE LIFECYCLE</p>
                        <h3>Customer state</h3>
                      </div>
                      <Activity size={17} />
                    </div>

                    <div className={styles.serviceStateSummary}>
                      <span>
                        Lifecycle
                        <strong>{titleCase(serviceState)}</strong>
                      </span>
                      <span>
                        Workspace
                        <strong>
                          {titleCase(String(detail.tenant?.status || 'unknown'))}
                        </strong>
                      </span>
                      <span>
                        Billing
                        <strong>
                          {titleCase(
                            String(
                              detail.billing_account?.status ||
                                'not configured',
                            ),
                          )}
                        </strong>
                      </span>
                    </div>

                    {serviceState === 'churned' ? (
                      <div className={styles.serviceTerminal}>
                        <strong>Customer ended</strong>
                        <span>
                          Workspace access is closed and this control does not
                          reactivate churned customers.
                        </span>
                        {detail.lifecycle?.cancellation_reason ? (
                          <small>
                            Reason: {String(detail.lifecycle.cancellation_reason)}
                          </small>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <div className={styles.serviceStateActions}>
                          {serviceStateActions.map((action) => (
                            <button
                              type="button"
                              key={action.state}
                              className={
                                action.state === 'churned'
                                  ? styles.dangerButton
                                  : styles.secondaryButton
                              }
                              onClick={() => {
                                setServiceStateTarget(action.state);
                                setServiceStateReason('');
                              }}
                              disabled={detailBusy === 'service-state'}
                            >
                              {action.state === 'at_risk' ? (
                                <AlertTriangle size={14} />
                              ) : action.state === 'paused' ? (
                                <Clock3 size={14} />
                              ) : action.state === 'churned' ? (
                                <X size={14} />
                              ) : (
                                <Check size={14} />
                              )}
                              {action.label}
                            </button>
                          ))}
                        </div>

                        {serviceStateTarget ? (
                          <div className={styles.serviceStateConfirm}>
                            <div>
                              <p className={styles.eyebrow}>
                                CONFIRM {titleCase(serviceStateTarget).toUpperCase()}
                              </p>
                              <strong>{serviceStateEffect}</strong>
                            </div>

                            {serviceStateNeedsReason ? (
                              <label className={styles.field}>
                                <span>
                                  {serviceStateTarget === 'churned'
                                    ? 'Cancellation reason'
                                    : 'Pause reason'}
                                </span>
                                <textarea
                                  value={serviceStateReason}
                                  onChange={(event) =>
                                    setServiceStateReason(event.target.value)
                                  }
                                  rows={3}
                                  maxLength={500}
                                  placeholder={
                                    serviceStateTarget === 'churned'
                                      ? 'Why is the customer ending service?'
                                      : 'Why is service being paused?'
                                  }
                                />
                              </label>
                            ) : null}

                            <div className={styles.serviceConfirmActions}>
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() => {
                                  setServiceStateTarget(null);
                                  setServiceStateReason('');
                                }}
                                disabled={detailBusy === 'service-state'}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className={
                                  serviceStateTarget === 'churned'
                                    ? styles.dangerButton
                                    : styles.primaryButton
                                }
                                onClick={() =>
                                  void updateCustomerServiceState()
                                }
                                disabled={
                                  detailBusy === 'service-state' ||
                                  !serviceStateReady
                                }
                              >
                                {detailBusy === 'service-state' ? (
                                  <LoaderCircle
                                    size={14}
                                    className={styles.spin}
                                  />
                                ) : (
                                  <Check size={14} />
                                )}
                                {detailBusy === 'service-state'
                                  ? 'Updating...'
                                  : 'Confirm state change'}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </section>
                ) : null}

                <AgencyGoLiveCard
                  tenantId={selectedTenantId}
                  agencyName={detail?.branding?.display_name || detail?.tenant?.legal_name || 'Agency'}
                  internal={detail?.lifecycle?.stage === 'internal'}
                  readiness={detail.go_live_readiness}
                  intervention={detail.operator_intervention}
                  privacy={detail.privacy_readiness}
                  privacyFocusToken={privacyFocusToken}
                  onRefresh={async () => {
                    await Promise.all([
                      openCustomer(selectedTenantId),
                      load(true),
                    ]);
                  }}
                  onNotice={setNotice}
                  onError={setError}
                />

                <AgencyInterventionCard
                  tenantId={selectedTenantId}
                  agencyName={detail?.branding?.display_name || detail?.tenant?.legal_name || 'Agency'}
                  orchestration={detail.intervention_orchestration}
                  onRefresh={async () => {
                    await Promise.all([
                      openCustomer(selectedTenantId),
                      load(true),
                    ]);
                  }}
                  onNotice={setNotice}
                  onError={setError}
                />

                <AgencyActivationCard
                  tenantId={selectedTenantId}
                  ownerEmail={
                    detailOwnerEmail ||
                    String(detail.lifecycle?.owner_contact_email || '')
                  }
                  ownerActive={Boolean(
                    detail.memberships?.some(
                      (member) =>
                        member.role === 'owner' &&
                        member.status === 'active',
                    ),
                  )}
                  journey={detail.activation_journey}
                  invites={detail.owner_invites || []}
                  initialInvite={
                    latestInvite?.tenantId === selectedTenantId
                      ? latestInvite
                      : null
                  }
                  onRefresh={async () => {
                    await Promise.all([
                      openCustomer(selectedTenantId),
                      load(true),
                    ]);
                  }}
                  onNotice={setNotice}
                  onError={setError}
                />

                <section className={styles.drawerSection}>
                  <div className={styles.drawerSectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>SETUP</p>
                      <h3>Workspace checklist</h3>
                    </div>
                    <Sparkles size={17} />
                  </div>

                  <div className={styles.taskList}>
                    {(detail.onboarding_tasks || []).map((task) => {
                      const complete = ['complete', 'waived'].includes(String(task.status));
                      return (
                        <div
                          key={task.task_key}
                          className={`${styles.taskRow} ${complete ? styles.taskComplete : ''}`}
                        >
                          <span className={styles.taskCheck}>
                            {complete ? <Check size={14} /> : null}
                          </span>
                          <div>
                            <strong>{task.title}</strong>
                            <span>{task.description || (task.required ? 'Required setup evidence' : 'Optional')}</span>
                          </div>
                          <small>{complete ? 'Observed' : task.required ? 'Required' : titleCase(task.status)}</small>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className={styles.drawerSection}>
                  <div className={styles.drawerSectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>BRAND</p>
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
                </section>

                <AgencyDomainCard
                  tenantId={selectedTenantId}
                  initialControl={detail.domain_control}
                  onRefresh={async () => {
                    await Promise.all([
                      openCustomer(selectedTenantId),
                      load(true),
                    ]);
                  }}
                  onNotice={setNotice}
                  onError={setError}
                />

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

function CommercialMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className={styles.commercialMetric}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function CommercialCapacity({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className={styles.commercialCapacity}>
      <div>
        <span>{label}</span>
        <strong>{Math.round(value)}%</strong>
      </div>
      <div className={styles.commercialCapacityTrack}>
        <i style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
