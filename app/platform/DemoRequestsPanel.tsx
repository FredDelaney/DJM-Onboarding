'use client';

import {
  ArrowRight,
  CheckCircle2,
  Mail,
  XCircle,
} from 'lucide-react';

import styles from './DemoRequestsPanel.module.css';

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

export default function DemoRequestsPanel({
  requests,
  busyId,
  onStatus,
  onCreateAgency,
}: {
  requests: DemoRequest[];
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
          <p>INBOUND</p>
          <h2>Demo requests</h2>
          <span>
            Website enquiries stay separate from customers until an operator deliberately provisions an agency.
          </span>
        </div>

        <strong>{open.length}</strong>
      </div>

      <div className={styles.rows}>
        {requests.slice(0, 12).map((item) => {
          const busy = busyId === item.id;

          return (
            <article className={styles.row} key={item.id}>
              <div className={styles.identity}>
                <div>
                  <strong>{item.agency_name}</strong>
                  <span>
                    {item.full_name} · {item.email}
                  </span>
                </div>

                <em data-status={item.status}>{human(item.status)}</em>
              </div>

              <div className={styles.meta}>
                <span>{item.staff_size || 'Team size not supplied'} staff</span>
                <span>{item.player_count || 'Roster not supplied'} players</span>
                <span>
                  {item.requested_plan
                    ? `${human(item.requested_plan)} interest`
                    : 'Plan open'}
                </span>
                <span>{when(item.created_at)}</span>
              </div>

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
              New website requests will appear here without becoming customer records automatically.
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
