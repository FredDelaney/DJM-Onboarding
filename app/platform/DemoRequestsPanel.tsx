'use client';

import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  Mail,
  MousePointerClick,
  Save,
  Target,
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
  scenario_runs?: number | null;
  scenario_types?: number | null;
  top_scenario?: string | null;
  product_modes?: number | null;
  cta_clicks?: number | null;
  pricing_seen?: boolean | null;
  autopilot_seen?: boolean | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  reasons?: string[] | null;
};

export type FunnelSummary = {
  days?: number | null;
  sessions?: number | null;
  interactive_sessions?: number | null;
  pricing_sessions?: number | null;
  demo_open_sessions?: number | null;
  leads?: number | null;
  qualified_leads?: number | null;
  converted_leads?: number | null;
  visit_to_lead_pct?: number | null;
  interactive_to_lead_pct?: number | null;
  top_scenario?: string | null;
  top_sources?: Array<{ source?: string | null; leads?: number | null }> | null;
};

export type FunnelJourneyEvent = {
  event_name?: string | null;
  section_key?: string | null;
  scenario_kind?: string | null;
  cta_key?: string | null;
  mode?: string | null;
  plan?: string | null;
  created_at?: string | null;
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
  journey?: FunnelJourneyEvent[] | null;
};

type DisplayStage =
  | 'new'
  | 'contacted'
  | 'demo'
  | 'qualified'
  | 'trial'
  | 'customer'
  | 'closed';

const PIPELINE: DisplayStage[] = [
  'new',
  'contacted',
  'demo',
  'qualified',
  'trial',
  'customer',
];

const EDITABLE_STAGES: DemoSalesStage[] = [
  'new',
  'contacted',
  'demo',
  'qualified',
  'closed',
];

const human = (value?: string | null) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const when = (value?: string | null) => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

const sourceLabel = (item: DemoRequest) => {
  const source = item.acquisition?.utm_source?.trim();
  const campaign = item.acquisition?.utm_campaign?.trim();
  if (source && campaign) return `${source} · ${campaign}`;
  if (source) return source;
  if (item.acquisition?.conversion_source) {
    return human(item.acquisition.conversion_source);
  }
  if (item.acquisition?.referrer) return 'Referral';
  return 'Direct';
};

const effectiveStage = (
  item: DemoRequest,
  customerStages: Record<string, string>,
): DisplayStage => {
  if (item.converted_tenant_id) {
    return customerStages[item.converted_tenant_id] === 'trial'
      ? 'trial'
      : 'customer';
  }
  if (item.status === 'closed') return 'closed';
  if (item.sales_stage && item.sales_stage !== 'new') {
    return item.sales_stage as DisplayStage;
  }
  if (item.status === 'qualified') return 'qualified';
  if (item.status === 'contacted') return 'contacted';
  return 'new';
};

const fallbackAction = (stage: DisplayStage) => {
  if (stage === 'new') return 'Contact the agency';
  if (stage === 'contacted') return 'Book a demo';
  if (stage === 'demo') return 'Run the demo and record the outcome';
  if (stage === 'qualified') return 'Decide the commercial start';
  if (stage === 'trial') return 'Drive first value during the trial';
  if (stage === 'customer') return 'Continue customer activation';
  return 'No next action';
};

const journeyLabel = (event: FunnelJourneyEvent) => {
  if (event.event_name === 'page_view') return 'Viewed the ReDream website';
  if (event.event_name === 'section_view') {
    return `Viewed ${human(event.section_key) || 'a product section'}`;
  }
  if (event.event_name === 'scenario_select') {
    return `Selected ${human(event.scenario_kind) || 'an'} agency scenario`;
  }
  if (event.event_name === 'scenario_run') {
    return `Ran ${human(event.scenario_kind) || 'an'} agency scenario`;
  }
  if (event.event_name === 'scenario_complete') {
    return `Completed ${human(event.scenario_kind) || 'an'} agency scenario`;
  }
  if (event.event_name === 'product_mode') {
    return `Explored ${human(event.mode) || 'the product workspace'}`;
  }
  if (event.event_name === 'cta_click') {
    return `Clicked ${human(event.cta_key) || 'a call to action'}`;
  }
  if (event.event_name === 'demo_open') return 'Opened the demo request';
  if (event.event_name === 'demo_step_2') return 'Reached demo details';
  if (event.event_name === 'demo_submit') return 'Submitted the demo request';
  return human(event.event_name) || 'Website interaction';
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

  const selectedLead = selectedId
    ? requests.find((item) => item.id === selectedId) || null
    : null;

  const open = requests.filter(
    (item) => !['converted', 'closed'].includes(item.status),
  );

  const pipelineCounts = useMemo(() => {
    return Object.fromEntries(
      PIPELINE.map((stage) => [
        stage,
        requests.filter(
          (item) => effectiveStage(item, customerStages) === stage,
        ).length,
      ]),
    ) as Record<DisplayStage, number>;
  }, [customerStages, requests]);

  const attentionRows = useMemo(
    () =>
      requests
        .filter((item) => {
          const stage = effectiveStage(item, customerStages);
          return (
            !item.converted_tenant_id &&
            stage !== 'closed' &&
            (item.needs_attention === true || stage === 'new')
          );
        })
        .sort((a, b) => {
          const dueA = a.attention_due_at
            ? new Date(a.attention_due_at).getTime()
            : Number.MAX_SAFE_INTEGER;
          const dueB = b.attention_due_at
            ? new Date(b.attention_due_at).getTime()
            : Number.MAX_SAFE_INTEGER;
          if (dueA !== dueB) return dueA - dueB;
          return (
            Number(b.lead_intelligence?.score || 0) -
            Number(a.lead_intelligence?.score || 0)
          );
        })
        .slice(0, 4),
    [customerStages, requests],
  );

  const openLead = (item: DemoRequest) => {
    const stage = effectiveStage(item, customerStages);
    setSelectedId(item.id);
    setDraftStage(
      ['new', 'contacted', 'demo', 'qualified', 'closed'].includes(stage)
        ? (stage as DemoSalesStage)
        : 'qualified',
    );
    setDraftAction(item.next_action || fallbackAction(stage));
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
          <p>INBOUND + INTELLIGENCE</p>
          <h2>Revenue command centre</h2>
          <span>
            Website enquiries stay separate from customers until an operator deliberately provisions an agency. First-party engagement is linked to a person only after they deliberately submit a demo request. Priority is a transparent engagement and fit signal, not a sales outcome prediction.
          </span>
        </div>

        <strong>{open.length}</strong>
      </div>

      <div className={styles.attentionBlock}>
        <div className={styles.subheading}>
          <div>
            <p>NEEDS ATTENTION TODAY</p>
            <strong>Work the right prospect next</strong>
          </div>
          <span>{attentionRows.length}</span>
        </div>

        <div className={styles.attentionGrid}>
          {attentionRows.map((item) => {
            const intel = item.lead_intelligence || {};
            return (
              <button
                type="button"
                className={styles.attentionCard}
                key={item.id}
                onClick={() => openLead(item)}
              >
                <span className={styles.attentionTop}>
                  <strong>{item.agency_name}</strong>
                  <em>{Math.round(Number(intel.score || 0))}</em>
                </span>
                <span>
                  {item.attention_reason ||
                    fallbackAction(effectiveStage(item, customerStages))}
                </span>
                <small>
                  {item.next_follow_up_at
                    ? `Follow-up ${when(item.next_follow_up_at)}`
                    : `${human(effectiveStage(item, customerStages))} · ${sourceLabel(item)}`}
                </small>
              </button>
            );
          })}

          {!attentionRows.length ? (
            <div className={styles.attentionEmpty}>
              <CheckCircle2 size={17} />
              <strong>No prospect follow-up is due right now</strong>
              <span>New enquiries and explicit follow-up dates will appear here.</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.pipeline}>
        {PIPELINE.map((stage) => (
          <div key={stage}>
            <span>{human(stage)}</span>
            <strong>{pipelineCounts[stage] || 0}</strong>
          </div>
        ))}
      </div>

      <div className={styles.funnelMetrics}>
        <div>
          <span>30D SESSIONS</span>
          <strong>{summary?.sessions || 0}</strong>
          <small>Canonical site visits</small>
        </div>
        <div>
          <span>INTERACTIVE</span>
          <strong>{summary?.interactive_sessions || 0}</strong>
          <small>
            {summary?.top_scenario
              ? `${human(summary.top_scenario)} interest`
              : 'No scenario signal yet'}
          </small>
        </div>
        <div>
          <span>DEMO OPENS</span>
          <strong>{summary?.demo_open_sessions || 0}</strong>
          <small>{summary?.pricing_sessions || 0} pricing viewers</small>
        </div>
        <div>
          <span>REQUESTS</span>
          <strong>{summary?.leads || 0}</strong>
          <small>{summary?.qualified_leads || 0} qualified</small>
        </div>
        <div>
          <span>VISIT TO REQUEST</span>
          <strong>{Number(summary?.visit_to_lead_pct || 0).toFixed(1)}%</strong>
          <small>
            {Number(summary?.interactive_to_lead_pct || 0).toFixed(1)}% after interaction
          </small>
        </div>
      </div>

      <div className={styles.rows}>
        {requests.slice(0, 20).map((item) => {
          const busy = busyId === item.id;
          const intel = item.lead_intelligence || {};
          const stage = effectiveStage(item, customerStages);
          const reasons = Array.isArray(intel.reasons)
            ? intel.reasons.filter(Boolean).slice(0, 3)
            : [];

          return (
            <article className={styles.row} key={item.id}>
              <div className={styles.identity}>
                <div>
                  <strong>{item.agency_name}</strong>
                  <span>
                    {item.full_name} · {item.email}
                  </span>
                </div>

                <div className={styles.badges}>
                  <span
                    className={styles.prioritySignal}
                    data-temperature={intel.temperature || 'new'}
                    title="Deterministic engagement + agency-fit signal"
                  >
                    {Math.round(Number(intel.score || 0))} priority
                  </span>
                  <em data-status={stage}>{human(stage)}</em>
                </div>
              </div>

              <div className={styles.meta}>
                <span>{item.staff_size ? `${item.staff_size} staff` : 'Team size open'}</span>
                <span>{item.player_count ? `${item.player_count} players` : 'Roster size open'}</span>
                <span>
                  {item.requested_plan
                    ? `${human(item.requested_plan)} interest`
                    : 'Plan open'}
                </span>
                <span>{when(item.created_at)}</span>
                <span>{sourceLabel(item)}</span>
              </div>

              <div className={styles.intelligence}>
                <div>
                  <Target size={14} />
                  <span>
                    <strong>{human(intel.top_scenario) || 'No scenario run'}</strong>
                    <small>
                      {intel.scenario_runs || 0} scenario runs · {intel.sections_seen || 0} sections seen
                    </small>
                  </span>
                </div>
                <div>
                  <MousePointerClick size={14} />
                  <span>
                    <strong>{intel.pricing_seen ? 'Pricing viewed' : 'Pricing not seen'}</strong>
                    <small>
                      Intent {intel.intent_score || 0}/60 · Fit {intel.fit_score || 0}/40
                    </small>
                  </span>
                </div>
              </div>

              {reasons.length ? (
                <div className={styles.reasons}>
                  {reasons.map((reason) => <span key={reason}>{reason}</span>)}
                </div>
              ) : null}

              {item.priority ? <p>{item.priority}</p> : null}

              <div className={styles.nextActionLine}>
                <Clock3 size={13} />
                <strong>{item.next_action || fallbackAction(stage)}</strong>
                <span>
                  {item.next_follow_up_at
                    ? `Follow-up ${when(item.next_follow_up_at)}`
                    : 'No follow-up date set'}
                </span>
              </div>

              <div className={styles.actions}>
                <button type="button" onClick={() => openLead(item)}>
                  <Eye size={14} />
                  Open lead
                </button>

                <a href={`mailto:${item.email}`}>
                  <Mail size={14} />
                  Email
                </a>

                {item.status === 'new' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onStatus(item.id, 'contacted')}
                  >
                    <CheckCircle2 size={14} />
                    Mark contacted
                  </button>
                ) : null}

                {['new', 'contacted'].includes(item.status) ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onStatus(item.id, 'qualified')}
                  >
                    <CheckCircle2 size={14} />
                    Qualify
                  </button>
                ) : null}

                {!['converted', 'closed'].includes(item.status) ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onCreateAgency(item)}
                  >
                    <ArrowRight size={14} />
                    Create agency
                  </button>
                ) : null}

                {!['converted', 'closed'].includes(item.status) ? (
                  <button
                    type="button"
                    className={styles.closeAction}
                    disabled={busy}
                    onClick={() => onStatus(item.id, 'closed')}
                  >
                    <XCircle size={14} />
                    Close
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}

        {!requests.length ? (
          <div className={styles.empty}>
            <Mail size={20} />
            <strong>No demo requests yet</strong>
            <span>
              Funnel activity can build before the first enquiry. Identifiable lead intelligence starts only after a visitor submits their details.
            </span>
          </div>
        ) : null}
      </div>

      {selectedLead ? (
        <div
          className={styles.drawerBackdrop}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSelectedId(null);
          }}
        >
          <aside className={styles.drawer} role="dialog" aria-modal="true">
            <div className={styles.drawerHeader}>
              <div>
                <p>PROSPECT WORKBENCH</p>
                <h3>{selectedLead.agency_name}</h3>
                <span>{selectedLead.full_name} · {selectedLead.email}</span>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Close lead"
                onClick={() => setSelectedId(null)}
              >
                <X size={17} />
              </button>
            </div>

            <div className={styles.drawerScore}>
              <div>
                <span>PRIORITY</span>
                <strong>{Math.round(Number(selectedLead.lead_intelligence?.score || 0))}</strong>
              </div>
              <div>
                <span>INTENT</span>
                <strong>{selectedLead.lead_intelligence?.intent_score || 0}/60</strong>
              </div>
              <div>
                <span>FIT</span>
                <strong>{selectedLead.lead_intelligence?.fit_score || 0}/40</strong>
              </div>
            </div>

            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}>
                <div>
                  <p>PIPELINE</p>
                  <strong>{human(effectiveStage(selectedLead, customerStages))}</strong>
                </div>
                {selectedLead.converted_tenant_id ? (
                  <span>Customer lifecycle owns this stage</span>
                ) : null}
              </div>

              {!selectedLead.converted_tenant_id ? (
                <div className={styles.stagePicker}>
                  {EDITABLE_STAGES.map((stage) => (
                    <button
                      type="button"
                      key={stage}
                      data-active={draftStage === stage ? 'true' : 'false'}
                      onClick={() => setDraftStage(stage)}
                    >
                      {human(stage)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}>
                <div>
                  <p>NEXT MOVE</p>
                  <strong>Make the follow-up explicit</strong>
                </div>
              </div>

              <label className={styles.field}>
                <span>Next action</span>
                <input
                  value={draftAction}
                  maxLength={500}
                  disabled={Boolean(selectedLead.converted_tenant_id)}
                  onChange={(event) => setDraftAction(event.target.value)}
                  placeholder="What should happen next?"
                />
              </label>

              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span>Follow-up</span>
                  <input
                    type="datetime-local"
                    value={draftFollowUp}
                    disabled={Boolean(selectedLead.converted_tenant_id)}
                    onChange={(event) => setDraftFollowUp(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span>Demo scheduled</span>
                  <input
                    type="datetime-local"
                    value={draftDemoAt}
                    disabled={Boolean(selectedLead.converted_tenant_id)}
                    onChange={(event) => setDraftDemoAt(event.target.value)}
                  />
                </label>
              </div>

              <label className={styles.field}>
                <span>Sales notes</span>
                <textarea
                  value={draftNotes}
                  maxLength={6000}
                  disabled={Boolean(selectedLead.converted_tenant_id)}
                  onChange={(event) => setDraftNotes(event.target.value)}
                  placeholder="Meeting context, objections, decision process, commercial notes..."
                />
              </label>

              {!selectedLead.converted_tenant_id ? (
                <button
                  type="button"
                  className={styles.saveButton}
                  disabled={saving}
                  onClick={() => void saveLead()}
                >
                  <Save size={14} />
                  {saving ? 'Saving...' : 'Save sales context'}
                </button>
              ) : null}
            </div>

            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}>
                <div>
                  <p>WHY THIS LEAD</p>
                  <strong>Observed buying context</strong>
                </div>
              </div>

              <div className={styles.signalGrid}>
                <div>
                  <Target size={14} />
                  <span>
                    <strong>{human(selectedLead.lead_intelligence?.top_scenario) || 'No scenario run'}</strong>
                    <small>{selectedLead.lead_intelligence?.scenario_runs || 0} runs</small>
                  </span>
                </div>
                <div>
                  <MousePointerClick size={14} />
                  <span>
                    <strong>
                      {selectedLead.lead_intelligence?.pricing_seen
                        ? 'Pricing viewed'
                        : 'Pricing not viewed'}
                    </strong>
                    <small>{selectedLead.lead_intelligence?.cta_clicks || 0} CTA clicks</small>
                  </span>
                </div>
                <div>
                  <CalendarClock size={14} />
                  <span>
                    <strong>{selectedLead.requested_plan ? human(selectedLead.requested_plan) : 'Plan open'}</strong>
                    <small>{selectedLead.staff_size || 'Team open'} · {selectedLead.player_count || 'Roster open'}</small>
                  </span>
                </div>
              </div>

              {selectedLead.priority ? (
                <div className={styles.prospectContext}>
                  <span>WHAT THEY TOLD US</span>
                  <p>{selectedLead.priority}</p>
                </div>
              ) : null}
            </div>

            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}>
                <div>
                  <p>ACQUISITION</p>
                  <strong>{sourceLabel(selectedLead)}</strong>
                </div>
              </div>
              <div className={styles.detailList}>
                <span>Source <strong>{selectedLead.acquisition?.utm_source || 'Direct / unknown'}</strong></span>
                <span>Campaign <strong>{selectedLead.acquisition?.utm_campaign || 'None'}</strong></span>
                <span>Conversion <strong>{human(selectedLead.acquisition?.conversion_source) || 'Direct enquiry'}</strong></span>
                <span>First seen <strong>{when(selectedLead.lead_intelligence?.first_seen_at)}</strong></span>
                <span>Last seen <strong>{when(selectedLead.lead_intelligence?.last_seen_at)}</strong></span>
              </div>
            </div>

            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}>
                <div>
                  <p>WEBSITE JOURNEY</p>
                  <strong>What happened before the enquiry</strong>
                </div>
                <span>{selectedLead.journey?.length || 0} events</span>
              </div>

              <div className={styles.timeline}>
                {(selectedLead.journey || []).map((event, index) => (
                  <div key={`${event.created_at || 'event'}-${index}`}>
                    <span className={styles.timelineDot} />
                    <div>
                      <strong>{journeyLabel(event)}</strong>
                      <small>{when(event.created_at)}</small>
                    </div>
                  </div>
                ))}
                {!selectedLead.journey?.length ? (
                  <div className={styles.timelineEmpty}>
                    No linked first-party journey is available for this enquiry.
                  </div>
                ) : null}
              </div>
            </div>

            <div className={styles.drawerFooter}>
              <a href={`mailto:${selectedLead.email}`}>
                <Mail size={14} />
                Email
              </a>
              {!['converted', 'closed'].includes(selectedLead.status) ? (
                <button
                  type="button"
                  onClick={() => onCreateAgency(selectedLead)}
                >
                  <ArrowRight size={14} />
                  Create agency
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
