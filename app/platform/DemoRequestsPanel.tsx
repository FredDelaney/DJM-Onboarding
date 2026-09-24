'use client';

import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Eye,
  Lightbulb,
  Mail,
  MousePointerClick,
  Save,
  ShieldCheck,
  Target,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import styles from './DemoRequestsPanel.module.css';

export type LeadIntelligence = {
  score?: number | null;
  intent_score?: number | null;
  fit_score?: number | null;
  temperature?: 'priority' | 'engaged' | 'new' | string | null;
  event_count?: number | null;
  sections_seen?: number | null;
  story_seen?: boolean | null;
  story_interactions?: number | null;
  story_steps?: number | null;
  value_seen?: boolean | null;
  control_seen?: boolean | null;
  pricing_seen?: boolean | null;
  demo_opened?: boolean | null;
  demo_step_2?: boolean | null;
  cta_clicks?: number | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  reasons?: string[] | null;
};

export type FunnelStage = {
  key?: string | null;
  label?: string | null;
  count?: number | null;
};

export type RevenueByCurrency = {
  currency?: string | null;
  mrr_cents?: number | null;
};

export type AttributionRow = {
  source?: string | null;
  visits?: number | null;
  story_used?: number | null;
  pricing?: number | null;
  demo_opens?: number | null;
  requests?: number | null;
  qualified?: number | null;
  trials?: number | null;
  customers?: number | null;
  mrr_by_currency?: RevenueByCurrency[] | null;
  visit_to_request_pct?: number | null;
  request_to_customer_pct?: number | null;
};

export type FunnelSummary = {
  days?: number | null;
  sessions?: number | null;
  interactive_sessions?: number | null;
  story_seen_sessions?: number | null;
  story_used_sessions?: number | null;
  pricing_sessions?: number | null;
  demo_open_sessions?: number | null;
  leads?: number | null;
  contacted_leads?: number | null;
  demo_leads?: number | null;
  qualified_leads?: number | null;
  trial_leads?: number | null;
  converted_leads?: number | null;
  new_mrr_by_currency?: RevenueByCurrency[] | null;
  visit_to_lead_pct?: number | null;
  interactive_to_lead_pct?: number | null;
  funnel?: FunnelStage[] | null;
  attribution?: AttributionRow[] | null;
  speed?: {
    avg_contact_hours?: number | null;
    avg_customer_days?: number | null;
  } | null;
  top_sources?: Array<{ source?: string | null; leads?: number | null }> | null;
};

export type FunnelJourneyEvent = {
  event_name?: string | null;
  section_key?: string | null;
  scenario_kind?: string | null;
  cta_key?: string | null;
  mode?: string | null;
  variant?: string | null;
  plan?: string | null;
  created_at?: string | null;
};

export type SalesHistoryEvent = {
  event_type?: string | null;
  from_stage?: string | null;
  to_stage?: string | null;
  next_action?: string | null;
  next_follow_up_at?: string | null;
  demo_scheduled_at?: string | null;
  created_at?: string | null;
};

export type SalesBrief = {
  headline?: string | null;
  what_to_show?: string[] | null;
  questions?: string[] | null;
  proof_to_use?: string | null;
  recommended_action?: string | null;
  why?: string[] | null;
};

export type DemoSalesStage = 'new' | 'contacted' | 'demo' | 'qualified' | 'closed';

export type DemoSalesUpdate = {
  salesStage: DemoSalesStage;
  nextAction: string;
  nextFollowUpAt: string | null;
  demoScheduledAt: string | null;
  operatorNotes: string;
};

export type DemoRequest = {
  id: string;
  full_name: string;
  email: string;
  agency_name: string;
  website_url?: string | null;
  staff_size?: string | null;
  player_count?: string | null;
  priority?: string | null;
  requested_plan?: string | null;
  status: string;
  sales_stage?: DemoSalesStage | string | null;
  next_action?: string | null;
  next_follow_up_at?: string | null;
  demo_scheduled_at?: string | null;
  operator_notes?: string | null;
  needs_attention?: boolean | null;
  attention_reason?: string | null;
  attention_due_at?: string | null;
  last_sales_activity_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  converted_tenant_id?: string | null;
  acquisition?: {
    conversion_source?: string | null;
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    referrer?: string | null;
  } | null;
  lead_intelligence?: LeadIntelligence | null;
  sales_brief?: SalesBrief | null;
  journey?: FunnelJourneyEvent[] | null;
  sales_history?: SalesHistoryEvent[] | null;
};

type DisplayStage = 'new' | 'contacted' | 'demo' | 'qualified' | 'trial' | 'customer' | 'closed';

const PIPELINE: DisplayStage[] = ['new', 'contacted', 'demo', 'qualified', 'trial', 'customer'];
const EDITABLE_STAGES: DemoSalesStage[] = ['new', 'contacted', 'demo', 'qualified', 'closed'];

const human = (value?: string | null) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const when = (value?: string | null) => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
};

const toLocalInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
};

const toIso = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const money = (cents?: number | null, currency = 'EUR') => {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(Number(cents || 0) / 100);
  } catch {
    return `${currency} ${Math.round(Number(cents || 0) / 100).toLocaleString('en-GB')}`;
  }
};

const revenueLabel = (rows?: RevenueByCurrency[] | null) => {
  const values = Array.isArray(rows)
    ? rows.filter((item) => item?.currency && Number(item?.mrr_cents || 0) !== 0)
    : [];
  if (!values.length) return money(0, 'EUR');
  if (values.length === 1) return money(values[0].mrr_cents, String(values[0].currency));
  return values.map((item) => money(item.mrr_cents, String(item.currency))).join(' + ');
};

const pct = (value?: number | null) => `${Number(value || 0).toFixed(1)}%`;

const sourceLabel = (item: DemoRequest) => {
  const source = item.acquisition?.utm_source?.trim();
  const campaign = item.acquisition?.utm_campaign?.trim();
  if (source && campaign) return `${source} · ${campaign}`;
  if (source) return source;
  if (item.acquisition?.referrer) return 'Referral';
  return 'Direct';
};

const effectiveStage = (item: DemoRequest, customerStages: Record<string, string>): DisplayStage => {
  if (item.converted_tenant_id) {
    return customerStages[item.converted_tenant_id] === 'trial' ? 'trial' : 'customer';
  }
  if (item.status === 'closed') return 'closed';
  if (item.sales_stage && item.sales_stage !== 'new') return item.sales_stage as DisplayStage;
  if (item.status === 'qualified') return 'qualified';
  if (item.status === 'contacted') return 'contacted';
  return 'new';
};

const fallbackAction = (stage: DisplayStage) => {
  if (stage === 'new') return 'Contact the agency and ask for one real situation';
  if (stage === 'contacted') return 'Book the demo';
  if (stage === 'demo') return 'Run the demo and agree the next step';
  if (stage === 'qualified') return 'Agree a trial or commercial start';
  if (stage === 'trial') return 'Drive first value during the trial';
  if (stage === 'customer') return 'Continue customer activation';
  return 'No next action';
};

const journeyLabel = (event: FunnelJourneyEvent) => {
  if (event.event_name === 'page_view') return 'Viewed the ReDream website';
  if (event.event_name === 'section_view') return `Viewed ${human(event.section_key) || 'a website section'}`;
  if (event.event_name === 'product_mode' && event.mode === 'simple_story') {
    return `Used the example${event.variant ? ` · ${human(event.variant)}` : ''}`;
  }
  if (event.event_name === 'cta_click') return `Clicked ${human(event.cta_key) || 'a call to action'}`;
  if (event.event_name === 'demo_open') return 'Opened the demo request';
  if (event.event_name === 'demo_step_2') return 'Reached demo details';
  if (event.event_name === 'demo_submit') return 'Submitted the demo request';
  if (event.event_name === 'scenario_run') return `Ran ${human(event.scenario_kind) || 'a'} legacy scenario`;
  return human(event.event_name) || 'Website interaction';
};

const historyLabel = (event: SalesHistoryEvent) => {
  if (event.event_type === 'converted_to_customer') return 'Converted to customer';
  if (event.event_type === 'stage_changed') return `${human(event.from_stage) || 'Lead'} → ${human(event.to_stage)}`;
  if (event.event_type === 'status_changed') return `${human(event.from_stage) || 'Lead'} → ${human(event.to_stage)}`;
  return 'Sales context updated';
};

export default function DemoRequestsPanel({
  requests,
  summary,
  busyId,
  customerStages,
  onStatus,
  onSalesUpdate,
  onCreateAgency,
}: {
  requests: DemoRequest[];
  summary?: FunnelSummary | null;
  busyId: string;
  customerStages: Record<string, string>;
  onStatus: (id: string, status: 'contacted' | 'qualified' | 'closed') => void;
  onSalesUpdate: (id: string, update: DemoSalesUpdate) => Promise<void>;
  onCreateAgency: (request: DemoRequest) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftStage, setDraftStage] = useState<DemoSalesStage>('new');
  const [draftAction, setDraftAction] = useState('');
  const [draftFollowUp, setDraftFollowUp] = useState('');
  const [draftDemoAt, setDraftDemoAt] = useState('');
  const [draftNotes, setDraftNotes] = useState('');

  const selectedLead = selectedId ? requests.find((item) => item.id === selectedId) || null : null;
  const open = requests.filter((item) => !['converted', 'closed'].includes(item.status));

  const pipelineCounts = useMemo(() => Object.fromEntries(
    PIPELINE.map((stage) => [stage, requests.filter((item) => effectiveStage(item, customerStages) === stage).length]),
  ) as Record<DisplayStage, number>, [customerStages, requests]);

  const attentionRows = useMemo(() => requests
    .filter((item) => {
      const stage = effectiveStage(item, customerStages);
      return !item.converted_tenant_id && stage !== 'closed' && (item.needs_attention === true || stage === 'new');
    })
    .sort((a, b) => {
      const dueA = a.attention_due_at ? new Date(a.attention_due_at).getTime() : Number.MAX_SAFE_INTEGER;
      const dueB = b.attention_due_at ? new Date(b.attention_due_at).getTime() : Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) return dueA - dueB;
      return Number(b.lead_intelligence?.score || 0) - Number(a.lead_intelligence?.score || 0);
    })
    .slice(0, 4), [customerStages, requests]);

  const funnel = Array.isArray(summary?.funnel) ? summary!.funnel!.filter(Boolean) : [];
  const attribution = Array.isArray(summary?.attribution) ? summary!.attribution!.filter(Boolean) : [];

  const biggestDrop = useMemo(() => {
    const early = funnel.slice(0, 6);
    let best: { from: string; to: string; lost: number; rate: number } | null = null;
    for (let index = 1; index < early.length; index += 1) {
      const previous = Number(early[index - 1]?.count || 0);
      const current = Number(early[index]?.count || 0);
      if (previous <= 0 || current > previous) continue;
      const lost = previous - current;
      const rate = (lost / previous) * 100;
      if (!best || rate > best.rate) {
        best = {
          from: String(early[index - 1]?.label || ''),
          to: String(early[index]?.label || ''),
          lost,
          rate,
        };
      }
    }
    return best;
  }, [funnel]);

  const openLead = (item: DemoRequest) => {
    const stage = effectiveStage(item, customerStages);
    setSelectedId(item.id);
    setDraftStage(['new', 'contacted', 'demo', 'qualified', 'closed'].includes(stage) ? stage as DemoSalesStage : 'qualified');
    setDraftAction(item.next_action || item.sales_brief?.recommended_action || fallbackAction(stage));
    setDraftFollowUp(toLocalInput(item.next_follow_up_at));
    setDraftDemoAt(toLocalInput(item.demo_scheduled_at));
    setDraftNotes(item.operator_notes || '');
  };

  const saveLead = async () => {
    if (!selectedLead || selectedLead.converted_tenant_id || saving) return;
    setSaving(true);
    try {
      await onSalesUpdate(selectedLead.id, {
        salesStage: draftStage,
        nextAction: draftAction,
        nextFollowUpAt: toIso(draftFollowUp),
        demoScheduledAt: toIso(draftDemoAt),
        operatorNotes: draftNotes,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <p>MARKETING + SALES</p>
          <h2>Growth command centre</h2>
          <span>See what the website is producing, where people drop out, which sources create customers and what to do with each lead next.</span>
        </div>
        <strong>{open.length}</strong>
      </div>

      <div className={styles.outcomeGrid}>
        <div><span>WEBSITE VISITS</span><strong>{summary?.sessions || 0}</strong><small>Last {summary?.days || 30} days</small></div>
        <div><span>DEMO REQUESTS</span><strong>{summary?.leads || 0}</strong><small>{pct(summary?.visit_to_lead_pct)} of visits</small></div>
        <div><span>QUALIFIED</span><strong>{summary?.qualified_leads || 0}</strong><small>{summary?.demo_leads || 0} reached demo</small></div>
        <div><span>CUSTOMERS</span><strong>{summary?.converted_leads || 0}</strong><small>{summary?.trial_leads || 0} entered trial</small></div>
        <div className={styles.revenueMetric}><span>NEW MRR</span><strong>{revenueLabel(summary?.new_mrr_by_currency)}</strong><small>From linked website leads</small></div>
      </div>

      <div className={styles.growthGrid}>
        <article className={styles.funnelCard}>
          <div className={styles.subheading}>
            <div><p>VISIT TO CUSTOMER</p><strong>Where people move forward</strong></div>
            <BarChart3 size={18} />
          </div>
          <div className={styles.funnelRail}>
            {funnel.map((stage, index) => {
              const previous = index > 0 ? Number(funnel[index - 1]?.count || 0) : 0;
              const current = Number(stage.count || 0);
              const fromPrevious = previous > 0 ? Math.min(100, (current / previous) * 100) : null;
              return (
                <div key={stage.key || `${stage.label}-${index}`}>
                  <span>{stage.label}</span>
                  <strong>{current}</strong>
                  <small>{index === 0 ? 'Start' : fromPrevious === null ? 'No data yet' : `${fromPrevious.toFixed(0)}% from previous`}</small>
                </div>
              );
            })}
          </div>
          <div className={styles.funnelInsight}>
            <TrendingUp size={16} />
            <div>
              <strong>{biggestDrop ? `Biggest measured drop: ${biggestDrop.from} → ${biggestDrop.to}` : 'Waiting for enough traffic to show a useful drop-off'}</strong>
              <span>{biggestDrop ? `${biggestDrop.lost} people lost at this step (${biggestDrop.rate.toFixed(0)}%).` : 'The system will surface the largest early-funnel drop once visits start flowing through V6.1.'}</span>
            </div>
          </div>
        </article>

        <article className={styles.speedCard}>
          <div className={styles.subheading}>
            <div><p>SALES SPEED</p><strong>How quickly leads move</strong></div>
            <Clock3 size={18} />
          </div>
          <div className={styles.speedMetrics}>
            <div><span>FIRST CONTACT</span><strong>{summary?.speed?.avg_contact_hours == null ? 'No data' : `${Number(summary.speed.avg_contact_hours).toFixed(1)}h`}</strong></div>
            <div><span>TO CUSTOMER</span><strong>{summary?.speed?.avg_customer_days == null ? 'No data' : `${Number(summary.speed.avg_customer_days).toFixed(1)}d`}</strong></div>
          </div>
          <p>These are measured from real lead and customer timestamps. They are not predictions.</p>
        </article>
      </div>

      <div className={styles.attributionBlock}>
        <div className={styles.subheading}>
          <div><p>SOURCE TO REVENUE</p><strong>Which marketing is actually creating business</strong></div>
          <CircleDollarSign size={18} />
        </div>
        <div className={styles.attributionTable}>
          <div className={styles.attributionHead}>
            <span>Source</span><span>Visits</span><span>Requests</span><span>Qualified</span><span>Trials</span><span>Customers</span><span>New MRR</span>
          </div>
          {attribution.map((row, index) => (
            <div className={styles.attributionRow} key={`${row.source || 'source'}-${index}`}>
              <strong>{human(row.source) || 'Direct'}</strong>
              <span>{row.visits || 0}</span>
              <span>{row.requests || 0}</span>
              <span>{row.qualified || 0}</span>
              <span>{row.trials || 0}</span>
              <span>{row.customers || 0}</span>
              <b>{revenueLabel(row.mrr_by_currency)}</b>
            </div>
          ))}
          {!attribution.length ? <div className={styles.attributionEmpty}>No attributable traffic yet. UTM-tagged campaigns and direct/referral visits will appear here automatically.</div> : null}
        </div>
      </div>

      <div className={styles.attentionBlock}>
        <div className={styles.subheading}>
          <div><p>NEEDS YOU TODAY</p><strong>Work the right prospect next</strong></div>
          <span>{attentionRows.length}</span>
        </div>
        <div className={styles.attentionGrid}>
          {attentionRows.map((item) => (
            <button type="button" className={styles.attentionCard} key={item.id} onClick={() => openLead(item)}>
              <span className={styles.attentionTop}><strong>{item.agency_name}</strong><em>{Math.round(Number(item.lead_intelligence?.score || 0))}</em></span>
              <span>{item.sales_brief?.recommended_action || item.attention_reason || fallbackAction(effectiveStage(item, customerStages))}</span>
              <small>{item.attention_due_at ? when(item.attention_due_at) : `${human(effectiveStage(item, customerStages))} · ${sourceLabel(item)}`}</small>
            </button>
          ))}
          {!attentionRows.length ? (
            <div className={styles.attentionEmpty}><CheckCircle2 size={18} /><strong>No prospect follow-up is due right now</strong><span>New enquiries and explicit follow-up dates will appear here.</span></div>
          ) : null}
        </div>
      </div>

      <div className={styles.pipeline}>
        {PIPELINE.map((stage) => <div key={stage}><span>{human(stage)}</span><strong>{pipelineCounts[stage] || 0}</strong></div>)}
      </div>

      <div className={styles.rows}>
        {requests.slice(0, 20).map((item) => {
          const busy = busyId === item.id;
          const intel = item.lead_intelligence || {};
          const stage = effectiveStage(item, customerStages);
          const reasons = Array.isArray(intel.reasons) ? intel.reasons.filter(Boolean).slice(0, 3) : [];
          return (
            <article className={styles.row} key={item.id}>
              <div className={styles.identity}>
                <div><strong>{item.agency_name}</strong><span>{item.full_name} · {item.email}</span></div>
                <div className={styles.badges}>
                  <span className={styles.prioritySignal} data-temperature={intel.temperature || 'new'}>{Math.round(Number(intel.score || 0))} priority</span>
                  <em data-status={stage}>{human(stage)}</em>
                </div>
              </div>
              <div className={styles.meta}>
                <span>{item.staff_size ? `${item.staff_size} staff` : 'Team size open'}</span>
                <span>{item.player_count ? `${item.player_count} players` : 'Roster size open'}</span>
                <span>{item.requested_plan ? `${human(item.requested_plan)} interest` : 'Plan open'}</span>
                <span>{sourceLabel(item)}</span>
              </div>
              <div className={styles.intelligence}>
                <div><Target size={15} /><span><strong>{intel.story_interactions ? 'Used the example' : intel.story_seen ? 'Saw the example' : 'Example not used'}</strong><small>{intel.story_interactions || 0} interactions · {intel.story_steps || 0} steps</small></span></div>
                <div><MousePointerClick size={15} /><span><strong>{intel.pricing_seen ? 'Pricing viewed' : 'Pricing not viewed'}</strong><small>Intent {intel.intent_score || 0}/60 · Fit {intel.fit_score || 0}/40</small></span></div>
              </div>
              {reasons.length ? <div className={styles.reasons}>{reasons.map((reason) => <span key={reason}>{reason}</span>)}</div> : null}
              {item.priority ? <p>{item.priority}</p> : null}
              <div className={styles.nextActionLine}><Lightbulb size={14} /><strong>{item.sales_brief?.recommended_action || item.next_action || fallbackAction(stage)}</strong><span>{item.next_follow_up_at ? `Follow-up ${when(item.next_follow_up_at)}` : 'No follow-up date set'}</span></div>
              <div className={styles.actions}>
                <button type="button" onClick={() => openLead(item)}><Eye size={15} />Open lead</button>
                <a href={`mailto:${item.email}`}><Mail size={15} />Email</a>
                {item.status === 'new' ? <button type="button" disabled={busy} onClick={() => onStatus(item.id, 'contacted')}><CheckCircle2 size={15} />Mark contacted</button> : null}
                {['new', 'contacted'].includes(item.status) ? <button type="button" disabled={busy} onClick={() => onStatus(item.id, 'qualified')}><CheckCircle2 size={15} />Qualify</button> : null}
                {!['converted', 'closed'].includes(item.status) ? <button type="button" disabled={busy} onClick={() => onCreateAgency(item)}><ArrowRight size={15} />Create agency</button> : null}
                {!['converted', 'closed'].includes(item.status) ? <button type="button" className={styles.closeAction} disabled={busy} onClick={() => onStatus(item.id, 'closed')}><XCircle size={15} />Close</button> : null}
              </div>
            </article>
          );
        })}
        {!requests.length ? <div className={styles.empty}><Mail size={22} /><strong>No demo requests yet</strong><span>The marketing funnel can fill before the first identifiable enquiry. Lead-level intelligence starts only after a visitor submits their details.</span></div> : null}
      </div>

      {selectedLead ? (
        <div className={styles.drawerBackdrop} onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedId(null); }}>
          <aside className={styles.drawer} role="dialog" aria-modal="true">
            <div className={styles.drawerHeader}>
              <div><p>PROSPECT WORKBENCH</p><h3>{selectedLead.agency_name}</h3><span>{selectedLead.full_name} · {selectedLead.email}</span></div>
              <button type="button" className={styles.iconButton} aria-label="Close lead" onClick={() => setSelectedId(null)}><X size={18} /></button>
            </div>

            <div className={styles.drawerScore}>
              <div><span>PRIORITY</span><strong>{Math.round(Number(selectedLead.lead_intelligence?.score || 0))}</strong></div>
              <div><span>INTENT</span><strong>{selectedLead.lead_intelligence?.intent_score || 0}/60</strong></div>
              <div><span>FIT</span><strong>{selectedLead.lead_intelligence?.fit_score || 0}/40</strong></div>
            </div>

            <div className={`${styles.drawerSection} ${styles.briefSection}`}>
              <div className={styles.drawerSectionTitle}><div><p>SALES BRIEF</p><strong>{selectedLead.sales_brief?.headline || 'Use one real situation to qualify the need.'}</strong></div><Lightbulb size={17} /></div>
              <div className={styles.briefAction}><span>DO THIS NEXT</span><strong>{selectedLead.sales_brief?.recommended_action || selectedLead.next_action || fallbackAction(effectiveStage(selectedLead, customerStages))}</strong></div>
              <div className={styles.briefGrid}>
                <div><span>SHOW THEM</span>{(selectedLead.sales_brief?.what_to_show || []).map((item) => <p key={item}>{item}</p>)}</div>
                <div><span>ASK THEM</span>{(selectedLead.sales_brief?.questions || []).map((item) => <p key={item}>{item}</p>)}</div>
              </div>
              <div className={styles.proofLine}><ShieldCheck size={15} /><span><small>PROOF TO USE</small><strong>{selectedLead.sales_brief?.proof_to_use || 'Use a real ReDream workflow and avoid invented outcomes.'}</strong></span></div>
            </div>

            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}><div><p>PIPELINE</p><strong>{human(effectiveStage(selectedLead, customerStages))}</strong></div>{selectedLead.converted_tenant_id ? <span>Customer lifecycle owns this stage</span> : null}</div>
              {!selectedLead.converted_tenant_id ? <div className={styles.stagePicker}>{EDITABLE_STAGES.map((stage) => <button type="button" key={stage} data-active={draftStage === stage ? 'true' : 'false'} onClick={() => setDraftStage(stage)}>{human(stage)}</button>)}</div> : null}
            </div>

            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}><div><p>NEXT MOVE</p><strong>Make the follow-up explicit</strong></div></div>
              <label className={styles.field}><span>Next action</span><input value={draftAction} maxLength={500} disabled={Boolean(selectedLead.converted_tenant_id)} onChange={(event) => setDraftAction(event.target.value)} placeholder="What should happen next?" /></label>
              <div className={styles.fieldGrid}>
                <label className={styles.field}><span>Follow-up</span><input type="datetime-local" value={draftFollowUp} disabled={Boolean(selectedLead.converted_tenant_id)} onChange={(event) => setDraftFollowUp(event.target.value)} /></label>
                <label className={styles.field}><span>Demo scheduled</span><input type="datetime-local" value={draftDemoAt} disabled={Boolean(selectedLead.converted_tenant_id)} onChange={(event) => setDraftDemoAt(event.target.value)} /></label>
              </div>
              <label className={styles.field}><span>Sales notes</span><textarea value={draftNotes} maxLength={6000} disabled={Boolean(selectedLead.converted_tenant_id)} onChange={(event) => setDraftNotes(event.target.value)} placeholder="Meeting context, objections, decision process, commercial notes..." /></label>
              {!selectedLead.converted_tenant_id ? <button type="button" className={styles.saveButton} disabled={saving} onClick={() => void saveLead()}><Save size={15} />{saving ? 'Saving...' : 'Save sales context'}</button> : null}
            </div>

            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}><div><p>WHY THIS LEAD</p><strong>Observed behaviour and submitted context</strong></div></div>
              <div className={styles.signalGrid}>
                <div><Target size={15} /><span><strong>{selectedLead.lead_intelligence?.story_interactions ? 'Used the example' : selectedLead.lead_intelligence?.story_seen ? 'Saw the example' : 'No example interaction'}</strong><small>{selectedLead.lead_intelligence?.story_interactions || 0} interactions</small></span></div>
                <div><MousePointerClick size={15} /><span><strong>{selectedLead.lead_intelligence?.pricing_seen ? 'Pricing viewed' : 'Pricing not viewed'}</strong><small>{selectedLead.lead_intelligence?.cta_clicks || 0} CTA clicks</small></span></div>
                <div><CalendarClock size={15} /><span><strong>{selectedLead.requested_plan ? human(selectedLead.requested_plan) : 'Plan open'}</strong><small>{selectedLead.staff_size || 'Team open'} · {selectedLead.player_count || 'Roster open'}</small></span></div>
              </div>
              {selectedLead.priority ? <div className={styles.prospectContext}><span>WHAT THEY TOLD US</span><p>{selectedLead.priority}</p></div> : null}
            </div>

            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}><div><p>ACQUISITION</p><strong>{sourceLabel(selectedLead)}</strong></div></div>
              <div className={styles.detailList}>
                <span>Source <strong>{selectedLead.acquisition?.utm_source || 'Direct / unknown'}</strong></span>
                <span>Campaign <strong>{selectedLead.acquisition?.utm_campaign || 'None'}</strong></span>
                <span>Conversion <strong>{human(selectedLead.acquisition?.conversion_source) || 'Direct enquiry'}</strong></span>
                <span>First seen <strong>{when(selectedLead.lead_intelligence?.first_seen_at)}</strong></span>
                <span>Last seen <strong>{when(selectedLead.lead_intelligence?.last_seen_at)}</strong></span>
              </div>
            </div>

            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}><div><p>WEBSITE JOURNEY</p><strong>What happened before the enquiry</strong></div><span>{selectedLead.journey?.length || 0} events</span></div>
              <div className={styles.timeline}>
                {(selectedLead.journey || []).map((event, index) => <div key={`${event.created_at || 'event'}-${index}`}><span className={styles.timelineDot} /><div><strong>{journeyLabel(event)}</strong><small>{when(event.created_at)}</small></div></div>)}
                {!selectedLead.journey?.length ? <div className={styles.timelineEmpty}>No linked first-party journey is available for this enquiry.</div> : null}
              </div>
            </div>

            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}><div><p>SALES HISTORY</p><strong>What changed after the enquiry</strong></div><span>{selectedLead.sales_history?.length || 0} events</span></div>
              <div className={styles.timeline}>
                {(selectedLead.sales_history || []).map((event, index) => <div key={`${event.created_at || 'sale'}-${index}`}><span className={`${styles.timelineDot} ${styles.salesDot}`} /><div><strong>{historyLabel(event)}</strong><small>{when(event.created_at)}{event.next_action ? ` · ${event.next_action}` : ''}</small></div></div>)}
                {!selectedLead.sales_history?.length ? <div className={styles.timelineEmpty}>Sales changes recorded from this release onward will appear here automatically.</div> : null}
              </div>
            </div>

            <div className={styles.drawerFooter}>
              <a href={`mailto:${selectedLead.email}`}><Mail size={15} />Email</a>
              {!['converted', 'closed'].includes(selectedLead.status) ? <button type="button" onClick={() => onCreateAgency(selectedLead)}><ArrowRight size={15} />Create agency</button> : null}
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
