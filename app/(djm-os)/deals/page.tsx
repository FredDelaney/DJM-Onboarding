'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { compactDateTime, djmRpc, friendlyError } from '@/lib/djm-os';
import { dealCredibility } from '@/lib/intelligence';

export default function DealsPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState(0);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const result = await djmRpc<any[]>('djm_deal_rooms', { p_status: 'active' });
      setDeals(result || []);
      setCheckedAt(Date.now());
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const overdue = useMemo(
    () => deals.filter((deal) => deal.next_action_at && new Date(deal.next_action_at).getTime() < checkedAt),
    [checkedAt, deals],
  );
  const missingAction = deals.filter((deal) => !deal.next_action_at).length;
  const blocked = deals.filter((deal) => deal.primary_blocker).length;

  return (
    <DjmOsShell eyebrow="Decision, blocker and next action" title="Deals">
      {error ? (
        <div className="djm-os-error" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>Dismiss</button>
        </div>
      ) : null}

      <section className="djm-intelligence-hero djm-intelligence-hero-compact">
        <div>
          <span className="djm-intelligence-kicker"><CircleDollarSign size={14} /> Commercial control</span>
          <h2>Move evidence forward, not a percentage.</h2>
          <p>Each Deal Room holds the human decision, source-backed blocker, owner and dated next action.</p>
        </div>
        <button className="djm-os-secondary-button" type="button" onClick={() => void load()} disabled={busy}>
          <RefreshCw size={15} className={busy ? 'spin' : ''} /> Refresh
        </button>
      </section>

      <section className="djm-os-metrics djm-os-metrics-4" aria-label="Deal health">
        <Metric label="Live situations" value={deals.length} />
        <Metric label="Overdue next action" value={overdue.length} attention={overdue.length > 0} />
        <Metric label="No next action" value={missingAction} attention={missingAction > 0} />
        <Metric label="Explicit blockers" value={blocked} attention={blocked > 0} />
      </section>

      <section className="djm-os-panel">
        <div className="djm-os-panel-head">
          <div>
            <span className="djm-panel-kicker">ACTIVE ROOMS</span>
            <h2>Commercial situations</h2>
            <p>Sorted by the existing operational feed; credibility is derived from recorded evidence.</p>
          </div>
        </div>

        {deals.length ? (
          <div className="djm-deal-grid">
            {deals.map((deal) => {
              const credibility = dealCredibility(deal);
              const isOverdue = deal.next_action_at && new Date(deal.next_action_at).getTime() < checkedAt;
              return (
                <Link className="djm-deal-card" href={`/market/deals/${deal.id}`} key={deal.id}>
                  <div className="djm-command-meta">
                    <span className="djm-evidence-state is-review">{credibility}</span>
                    <span>{String(deal.stage || 'qualifying').replaceAll('_', ' ')}</span>
                  </div>
                  <h3>{deal.title}</h3>
                  <p>{[deal.organisation_name, deal.player_name].filter(Boolean).join(' · ') || 'Participants need confirmation'}</p>
                  <div className="djm-deal-card-facts">
                    <span className={deal.primary_blocker ? 'is-risk' : ''}>
                      <ShieldAlert size={14} /> {deal.primary_blocker || 'No blocker recorded'}
                    </span>
                    <span className={isOverdue ? 'is-risk' : ''}>
                      <CalendarClock size={14} /> {deal.next_action_at ? compactDateTime(deal.next_action_at) : 'Next action missing'}
                    </span>
                  </div>
                  <div className="djm-deal-card-action">Open decision room <ArrowRight size={15} /></div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="djm-os-empty">
            <CheckCircle2 size={25} />
            <p>No active deal is recorded. Start from a qualified need in Market.</p>
            <Link href="/market" className="djm-os-primary-button">Open Market <ArrowRight size={15} /></Link>
          </div>
        )}
      </section>
    </DjmOsShell>
  );
}

function Metric({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) {
  return <div className={`djm-os-metric ${attention ? 'is-attention' : ''}`}><strong>{value}</strong><span>{label}</span></div>;
}
