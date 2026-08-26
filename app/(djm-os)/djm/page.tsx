'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Network,
  RefreshCw,
  Search,
  UserPlus,
  UsersRound,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { compactDateTime, djmRpc, friendlyError } from '@/lib/djm-os';

export default function DjmHomePage() {
  const [home, setHome] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setHome(await djmRpc('djm_home'));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const network = home?.network || {};
  const recruitment = home?.recruitment || {};
  const market = home?.market || {};
  const actions = home?.top_actions || [];
  const deals = home?.closest_to_revenue || [];
  const revenue = home?.revenue_by_currency || [];

  return (
    <DjmOsShell
      eyebrow="What matters across DJM right now"
      title="DJM Home"
    >
      {error ? (
        <div className="djm-os-error">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      ) : null}

      <div className="djm-os-toolbar">
        <div>
          <strong>One operating picture</strong>
          <span className="djm-os-toolbar-note">
            Signed players, relationships, recruitment and club demand stay separate underneath. Home tells DJM what deserves attention.
          </span>
        </div>
        <button className="djm-os-secondary-button" onClick={() => void load()} disabled={busy}>
          <RefreshCw size={15} className={busy ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      <section className="djm-os-metrics">
        <Metric label="Clubs" value={Number(network.clubs || 0)} />
        <Metric label="Club contacts" value={Number(network.club_contacts || 0)} />
        <Metric label="Unsigned targets" value={Number(recruitment.active || 0)} />
        <Metric label="Active club needs" value={Number(market.active_needs || 0)} />
        <Metric label="Active deals" value={Number(market.active_deals || 0)} />
      </section>

      <div className="djm-os-grid djm-os-grid-2">
        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Closest to revenue</h2>
              <p>Only serious situations. Probability, blocker and next decision in one place.</p>
            </div>
          </div>
          {deals.length ? (
            <div className="djm-os-list">
              {deals.map((deal: any) => (
                <Link
                  key={deal.id}
                  href={`/market/deals/${deal.id}`}
                  className="djm-os-list-row"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{ flex: 1 }}>
                    <strong>{deal.title}</strong>
                    <p>{[deal.player_name, deal.organisation_name].filter(Boolean).join(' · ')}</p>
                    <small>
                      {deal.stage} · {deal.probability}% probability
                      {deal.primary_blocker ? ` · Blocker: ${deal.primary_blocker}` : ''}
                    </small>
                  </div>
                  <div className="djm-os-score">
                    <b>{deal.expected_commission != null ? `${deal.currency} ${Number(deal.expected_commission).toLocaleString('en-GB')}` : '—'}</b>
                    <small>commission</small>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="djm-os-empty">
              <BriefcaseBusiness size={25} />
              <p>No Deal Rooms yet. Create one only when a player-club situation becomes genuinely live.</p>
            </div>
          )}
        </section>

        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Revenue lens</h2>
              <p>Potential and probability-weighted commission, kept separate by currency.</p>
            </div>
          </div>
          {revenue.length ? (
            <div className="djm-os-list">
              {revenue.map((item: any) => (
                <article className="djm-os-list-row" key={item.currency}>
                  <div>
                    <strong>{item.currency}</strong>
                    <p>{item.active_deals} active deal{Number(item.active_deals) === 1 ? '' : 's'}</p>
                    <small>Potential {Number(item.potential_commission || 0).toLocaleString('en-GB')}</small>
                  </div>
                  <div className="djm-os-score">
                    <b>{Number(item.weighted_commission || 0).toLocaleString('en-GB')}</b>
                    <small>weighted</small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="djm-os-empty">
              <BriefcaseBusiness size={25} />
              <p>No commission pipeline yet.</p>
            </div>
          )}
        </section>
      </div>

      <div className="djm-os-grid djm-os-grid-2">
        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>What DJM should do next</h2>
              <p>Commitments, recruitment follow-ups and market signals ranked together.</p>
            </div>
          </div>

          {actions.length ? (
            <div className="djm-os-list">
              {actions.map((action: any, index: number) => {
                const href =
                  action.kind === 'recruitment'
                    ? `/recruitment/${action.entity_id}`
                    : action.kind === 'deal'
                      ? `/market/deals/${action.entity_id}`
                      : action.kind === 'signal'
                        ? '/market'
                        : '/network';

                return (
                  <Link
                    key={`${action.kind}-${action.entity_id}`}
                    href={href}
                    className="djm-os-list-row"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{ width: 34, flex: '0 0 auto', color: 'var(--djm-navy)', fontWeight: 900 }}>
                      {String(index + 1).padStart(2, '0')}
                    </div>
                    <div style={{ flex: 1 }}>
                      <strong>{action.title}</strong>
                      <p>{String(action.kind || '').replaceAll('_', ' ')}</p>
                      <small>
                        Priority {action.score || 0}
                        {action.action_at ? ` · ${compactDateTime(action.action_at)}` : ''}
                      </small>
                    </div>
                    <ArrowRight size={16} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="djm-os-empty">
              <Search size={25} />
              <p>No urgent actions yet. DJM Home will become more useful as real conversations are imported.</p>
            </div>
          )}
        </section>

        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Operating health</h2>
              <p>Where the agency needs attention, without vanity dashboards.</p>
            </div>
          </div>

          <div style={{ padding: 14, display: 'grid', gap: 10 }}>
            <HealthRow
              icon={<Network size={17} />}
              title="Network"
              detail={`${network.open_tasks || 0} commitments · ${network.review_items || 0} review items`}
              href="/network"
              attention={Number(network.open_tasks || 0) + Number(network.review_items || 0)}
            />
            <HealthRow
              icon={<UserPlus size={17} />}
              title="Recruitment"
              detail={`${recruitment.hot || 0} hot · ${recruitment.overdue || 0} overdue`}
              href="/recruitment"
              attention={Number(recruitment.overdue || 0)}
            />
            <HealthRow
              icon={<BriefcaseBusiness size={17} />}
              title="Market"
              detail={`${market.active_needs || 0} live needs · ${market.strong_matches || 0} strong matches`}
              href="/market"
              attention={0}
            />
            <HealthRow
              icon={<UsersRound size={17} />}
              title="Signed Players"
              detail="Representation, onboarding, CVs and player management"
              href="/admin"
              attention={0}
            />
          </div>
        </section>
      </div>

      <section className="djm-os-panel">
        <div className="djm-os-panel-head">
          <div>
            <h2>The DJM flywheel</h2>
            <p>Every normal action should improve the next decision.</p>
          </div>
        </div>
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>
          <FlywheelStep icon={<Building2 size={18} />} title="Network" text="Who do we know and who should lead the relationship?" />
          <FlywheelStep icon={<UserPlus size={18} />} title="Recruitment" text="Which unsigned players are genuinely worth winning?" />
          <FlywheelStep icon={<BriefcaseBusiness size={18} />} title="Market" text="Where is the real demand and which player pool fits?" />
          <FlywheelStep icon={<UsersRound size={18} />} title="Signed Players" text="Who do we represent and what move should we create next?" />
        </div>
      </section>
    </DjmOsShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="djm-os-metric"><strong>{value}</strong><span>{label}</span></div>;
}

function HealthRow({
  icon,
  title,
  detail,
  href,
  attention,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  href: string;
  attention: number;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: 14,
        border: '1px solid var(--djm-line)',
        borderRadius: 13,
        textDecoration: 'none',
        color: 'inherit',
        background: attention ? 'rgba(244,196,48,.08)' : '#fbfcfd',
      }}
    >
      <span className="djm-os-panel-icon">{icon}</span>
      <div style={{ flex: 1 }}>
        <strong style={{ display: 'block', color: 'var(--djm-navy)', fontSize: 13 }}>{title}</strong>
        <small style={{ color: 'var(--djm-muted)' }}>{detail}</small>
      </div>
      <ArrowRight size={16} />
    </Link>
  );
}

function FlywheelStep({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div style={{ padding: 16, border: '1px solid var(--djm-line)', borderRadius: 14, background: '#fbfcfd' }}>
      <span className="djm-os-panel-icon">{icon}</span>
      <strong style={{ display: 'block', marginTop: 12, color: 'var(--djm-navy)' }}>{title}</strong>
      <p style={{ margin: '6px 0 0', color: 'var(--djm-muted)', fontSize: 11, lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}
