'use client';

import {
  ArrowRight,
  CheckCircle2,
  Mail,
  MousePointerClick,
  Target,
  XCircle,
} from 'lucide-react';

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
};

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
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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

export default function DemoRequestsPanel({
  requests,
  summary,
  busyId,
  onStatus,
  onCreateAgency,
}: {
  requests: DemoRequest[];
  summary?: FunnelSummary | null;
  busyId: string;
  onStatus: (id: string, status: 'contacted' | 'qualified' | 'closed') => void;
  onCreateAgency: (request: DemoRequest) => void;
}) {
  const open = requests.filter(
    (item) => !['converted', 'closed'].includes(item.status),
  );

  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <p>INBOUND + INTELLIGENCE</p>
          <h2>Sales funnel</h2>
          <span>
            Website enquiries stay separate from customers until an operator deliberately provisions an agency. First-party engagement is linked to a person only after they deliberately submit a demo request. Priority is a transparent engagement and fit signal, not a sales outcome prediction.
          </span>
        </div>

        <strong>{open.length}</strong>
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
          <small>{summary?.top_scenario ? `${human(summary.top_scenario)} interest` : 'No scenario signal yet'}</small>
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
          <small>{Number(summary?.interactive_to_lead_pct || 0).toFixed(1)}% after interaction</small>
        </div>
      </div>

      <div className={styles.rows}>
        {requests.slice(0, 16).map((item) => {
          const busy = busyId === item.id;
          const intel = item.lead_intelligence || {};
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
                  <em data-status={item.status}>{human(item.status)}</em>
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

              <div className={styles.actions}>
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
    </section>
  );
}
