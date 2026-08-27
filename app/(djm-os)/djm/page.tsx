'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  UserPlus,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { compactDateTime, djmRpc, friendlyError } from '@/lib/djm-os';

export default function DjmHomePage() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setData(await djmRpc('djm_command_center'));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const completeTask = async (id: string) => {
    try {
      await djmRpc('djm_network_set_task_status', { p_task_id: id, p_status: 'completed' });
      await load();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const summary = data?.summary || {};
  const focus = data?.focus || [];
  const opportunities = data?.opportunities || [];
  const quality = data?.quality || {};
  const automation = data?.automation || {};

  const qualityCount = useMemo(
    () => Object.values(quality).reduce((sum: number, value: any) => sum + Number(value || 0), 0),
    [quality],
  );
  const incidentCount = Number(automation?.open_incidents || 0);
  const freshnessCount = Number(automation?.freshness?.due || 0) + Number(automation?.freshness?.locked || 0);
  const automationClean = incidentCount === 0 && freshnessCount === 0 && Number(summary.reviews || 0) === 0;

  return (
    <DjmOsShell eyebrow="Your agency, reduced to what matters" title="DJM Command Centre">
      {error ? (
        <div className="djm-os-error">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      ) : null}

      <div className="djm-os-toolbar">
        <div>
          <strong>Autopilot is doing the admin underneath</strong>
          <span className="djm-os-toolbar-note">
            Add conversations, players and club demand. DJM links, enriches, matches and creates follow-ups automatically.
          </span>
        </div>
        <button className="djm-os-secondary-button" type="button" onClick={() => void load()} disabled={busy}>
          <RefreshCw size={15} className={busy ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      <section className="djm-os-metrics">
        <Metric label="Overdue" value={Number(summary.overdue_tasks || 0)} attention={Number(summary.overdue_tasks || 0) > 0} />
        <Metric label="Needs review" value={Number(summary.reviews || 0)} attention={Number(summary.reviews || 0) > 0} />
        <Metric label="Hot recruitment" value={Number(summary.recruitment_hot || 0)} />
        <Metric label="Live club needs" value={Number(summary.active_needs || 0)} />
        <Metric label="Live deals" value={Number(summary.active_deals || 0)} />
      </section>

      <div className="djm-os-grid djm-os-grid-2">
        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Do now</h2>
              <p>One ranked queue. You should not need to hunt across the system.</p>
            </div>
            <Sparkles size={20} />
          </div>

          {focus.length ? (
            <div className="djm-os-list">
              {focus.slice(0, 10).map((item: any, index: number) => (
                <article className="djm-os-list-row" key={`${item.kind}-${item.id}`}>
                  <div style={{ width: 30, flex: '0 0 auto', fontWeight: 900, color: 'var(--djm-muted)' }}>
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <Link href={item.href || '/djm'} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
                    <strong>{item.title}</strong>
                    <p>{item.subtitle || labelForKind(item.kind)}</p>
                    <small>
                      {labelForKind(item.kind)}
                      {item.action_at ? ` · ${compactDateTime(item.action_at)}` : ''}
                    </small>
                  </Link>
                  {item.action === 'complete' ? (
                    <button
                      type="button"
                      className="djm-os-icon-button is-success"
                      onClick={() => void completeTask(item.id)}
                      aria-label="Complete task"
                    >
                      <CheckCircle2 size={17} />
                    </button>
                  ) : (
                    <Link href={item.href || '/djm'} className="djm-os-icon-button" aria-label="Open">
                      <ArrowRight size={16} />
                    </Link>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="djm-os-empty">
              <CheckCircle2 size={25} />
              <p>Nothing urgent. DJM will surface the next meaningful action here.</p>
            </div>
          )}
        </section>

        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Live opportunities</h2>
              <p>Club demand and whether DJM has a credible player fit.</p>
            </div>
            <Target size={20} />
          </div>

          {opportunities.length ? (
            <div className="djm-os-list">
              {opportunities.map((need: any) => (
                <Link
                  href="/market"
                  className="djm-os-list-row"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                  key={need.id}
                >
                  <div style={{ flex: 1 }}>
                    <strong>{need.organisation_name}</strong>
                    <p>{need.position || need.title}</p>
                    <small>
                      {Number(need.match_count || 0)} signed-player match{Number(need.match_count || 0) === 1 ? '' : 'es'}
                    </small>
                  </div>
                  <div className="djm-os-score">
                    <b>{need.top_match_score == null ? '—' : `${Math.round(Number(need.top_match_score))}%`}</b>
                    <small>best fit</small>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="djm-os-empty">
              <BriefcaseBusiness size={25} />
              <p>No live club demand yet. Add a request in plain English and DJM will start matching.</p>
            </div>
          )}
        </section>
      </div>

      <div className="djm-os-grid djm-os-grid-2">
        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Autopilot</h2>
              <p>The boring work should happen without you.</p>
            </div>
            <Bot size={20} />
          </div>
          <div style={{ padding: 16, display: 'grid', gap: 10 }}>
            <StatusRow
              icon={<ShieldCheck size={17} />}
              title={automationClean ? 'Running cleanly' : 'Needs attention'}
              detail={`${Number(automation?.cron_jobs?.length || 0)} scheduled jobs · ${incidentCount} incidents · ${freshnessCount} freshness items`}
              attention={!automationClean}
            />
            <StatusRow
              icon={<Clock3 size={17} />}
              title="Follow-ups"
              detail={`${Number(summary.open_tasks || 0)} open · ${Number(summary.overdue_tasks || 0)} overdue`}
              href="/network"
              attention={Number(summary.overdue_tasks || 0) > 0}
            />
            <StatusRow
              icon={<UserPlus size={17} />}
              title="Recruitment enrichment"
              detail={`${Number(summary.recruitment_active || 0)} active · ${Number(quality.recruitment_missing_transfermarkt || 0)} missing Transfermarkt`}
              href="/recruitment"
              attention={Number(quality.recruitment_missing_transfermarkt || 0) > 0}
            />
            <StatusRow
              icon={<Target size={17} />}
              title="Market matching"
              detail={`${Number(summary.active_needs || 0)} live needs · ${Number(summary.needs_without_matches || 0)} without signed-player match`}
              href="/market"
              attention={Number(summary.needs_without_matches || 0) > 0}
            />
          </div>
        </section>

        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <h2>Data quality</h2>
              <p>Only exceptions. You should not maintain clean data by hand.</p>
            </div>
          </div>
          {qualityCount === 0 ? (
            <div className="djm-os-empty">
              <CheckCircle2 size={25} />
              <p>Current DJM data has no obvious gaps requiring manual cleanup.</p>
            </div>
          ) : (
            <div className="djm-os-list">
              <QualityRow label="Contacts missing club" value={quality.contacts_missing_club} href="/network" />
              <QualityRow label="Contacts missing role" value={quality.contacts_missing_role} href="/network" />
              <QualityRow label="Recruitment missing Transfermarkt" value={quality.recruitment_missing_transfermarkt} href="/recruitment" />
              <QualityRow label="Recruitment missing contact route" value={quality.recruitment_missing_contact} href="/recruitment" />
              <QualityRow label="Open reviews" value={quality.open_reviews} href="/network" />
              <QualityRow label="Stale club needs" value={quality.stale_needs} href="/market" />
            </div>
          )}
        </section>
      </div>
    </DjmOsShell>
  );
}

function labelForKind(kind?: string) {
  return String(kind || 'action').replaceAll('_', ' ').replace(/^./, (x) => x.toUpperCase());
}

function Metric({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) {
  return (
    <div className="djm-os-metric" style={attention ? { borderColor: 'rgba(244,196,48,.7)', background: 'rgba(244,196,48,.08)' } : undefined}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function StatusRow({
  icon,
  title,
  detail,
  href,
  attention = false,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  href?: string;
  attention?: boolean;
}) {
  const content = (
    <>
      <span className="djm-os-panel-icon">{icon}</span>
      <div style={{ flex: 1 }}>
        <strong style={{ display: 'block', color: 'var(--djm-navy)', fontSize: 13 }}>{title}</strong>
        <small style={{ color: 'var(--djm-muted)' }}>{detail}</small>
      </div>
      {href ? <ArrowRight size={16} /> : null}
    </>
  );

  const style = {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    padding: 14,
    border: attention ? '1px solid rgba(244,196,48,.65)' : '1px solid var(--djm-line)',
    borderRadius: 13,
    textDecoration: 'none',
    color: 'inherit',
    background: attention ? 'rgba(244,196,48,.07)' : '#fbfcfd',
  } as const;

  return href ? <Link href={href} style={style}>{content}</Link> : <div style={style}>{content}</div>;
}

function QualityRow({ label, value, href }: { label: string; value: any; href: string }) {
  const count = Number(value || 0);
  if (!count) return null;
  return (
    <Link href={href} className="djm-os-list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{ flex: 1 }}><strong>{label}</strong><p>DJM could not safely fill this automatically.</p></div>
      <div className="djm-os-score"><b>{count}</b><small>review</small></div>
    </Link>
  );
}
