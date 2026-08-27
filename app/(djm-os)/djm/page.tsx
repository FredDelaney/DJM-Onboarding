'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { compactDateTime, djmRpc, friendlyError } from '@/lib/djm-os';
import { commandRecommendation } from '@/lib/intelligence';

export default function DjmHomePage() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setData(await djmRpc('djm_command_center'));
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const completeTask = async (id: string) => {
    try {
      await djmRpc('djm_network_set_task_status', {
        p_task_id: id,
        p_status: 'completed',
      });
      await load();
    } catch (taskError) {
      setError(friendlyError(taskError));
    }
  };

  const summary = data?.summary || {};
  const focus = data?.focus || [];
  const opportunities = data?.opportunities || [];
  const quality = data?.quality || {};
  const automation = data?.automation || {};
  const commandReferenceTime = data?.generated_at
    ? new Date(data.generated_at).getTime()
    : undefined;

  const qualityCount = useMemo(
    () =>
      Object.values(quality).reduce(
        (sum: number, value: any) => sum + Number(value || 0),
        0,
      ),
    [quality],
  );
  const incidentCount = Number(automation?.open_incidents || 0);
  const freshnessCount =
    Number(automation?.freshness?.due || 0) +
    Number(automation?.freshness?.locked || 0);
  const systemNeedsAttention =
    incidentCount > 0 ||
    freshnessCount > 0 ||
    Number(summary.reviews || 0) > 0;

  return (
    <DjmOsShell
      eyebrow="One operational truth · explainable next actions"
      title="Command"
    >
      {error ? (
        <div className="djm-os-error" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="djm-intelligence-hero">
        <div>
          <span className="djm-intelligence-kicker">
            <Sparkles size={14} /> Decision support, not a vanity dashboard
          </span>
          <h2>Know what deserves attention—and why.</h2>
          <p>
            Command connects service, relationships, demand and deals into one
            ranked queue. Every recommendation remains a human decision.
          </p>
        </div>
        <div className="djm-intelligence-hero-actions">
          <span>
            {data?.generated_at
              ? `Operational view ${compactDateTime(data.generated_at)}`
              : 'Connecting live records…'}
          </span>
          <button
            className="djm-os-secondary-button"
            type="button"
            onClick={() => void load()}
            disabled={busy}
          >
            <RefreshCw size={15} className={busy ? 'spin' : ''} />
            Refresh truth
          </button>
        </div>
      </section>

      <section className="djm-os-metrics" aria-label="Command overview">
        <Metric label="Overdue commitments" value={Number(summary.overdue_tasks || 0)} attention={Number(summary.overdue_tasks || 0) > 0} />
        <Metric label="Human verification" value={Number(summary.reviews || 0)} attention={Number(summary.reviews || 0) > 0} />
        <Metric label="Active player work" value={Number(summary.recruitment_hot || 0)} />
        <Metric label="Live demand" value={Number(summary.active_needs || 0)} />
        <Metric label="Live deals" value={Number(summary.active_deals || 0)} />
      </section>

      <div className="djm-os-grid djm-command-grid">
        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <span className="djm-panel-kicker">NEXT BEST ACTION</span>
              <h2>Decision queue</h2>
              <p>Act, prepare, qualify, review—or consciously hold.</p>
            </div>
            <Target size={20} />
          </div>

          {focus.length ? (
            <div className="djm-os-list djm-command-list">
              {focus.slice(0, 10).map((item: any, index: number) => {
                const recommendation = commandRecommendation(item, commandReferenceTime);
                return (
                  <article className="djm-command-row" key={`${item.kind}-${item.id}`}>
                    <span className="djm-command-order">{String(index + 1).padStart(2, '0')}</span>
                    <div className="djm-command-copy">
                      <div className="djm-command-meta">
                        <span className={`djm-recommendation is-${slug(recommendation.kind)}`}>{recommendation.kind}</span>
                        <span>{labelForKind(item.kind)}</span>
                        {item.action_at ? <span>{compactDateTime(item.action_at)}</span> : null}
                      </div>
                      <Link href={item.href || '/djm'}>{item.title}</Link>
                      <p>{item.subtitle || recommendation.explanation}</p>
                      <small>{recommendation.explanation}</small>
                    </div>
                    {item.action === 'complete' ? (
                      <button type="button" className="djm-os-icon-button is-success" onClick={() => void completeTask(item.id)} aria-label={`Complete ${item.title}`}>
                        <CheckCircle2 size={17} />
                      </button>
                    ) : (
                      <Link href={item.href || '/djm'} className="djm-os-icon-button" aria-label={`Open ${item.title}`}>
                        <ArrowRight size={16} />
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <Empty icon={<CheckCircle2 size={25} />} text="No unresolved action is supported by the current record. Holding is valid until evidence changes." />
          )}
        </section>

        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <span className="djm-panel-kicker">MARKET PULSE</span>
              <h2>Demand worth qualifying</h2>
              <p>Counts and evidence—not invented fit percentages.</p>
            </div>
            <DatabaseZap size={20} />
          </div>

          {opportunities.length ? (
            <div className="djm-os-list">
              {opportunities.map((need: any) => {
                const matches = Number(need.match_count || 0);
                return (
                  <Link href="/market" className="djm-opportunity-row" key={need.id}>
                    <div>
                      <strong>{need.organisation_name}</strong>
                      <p>{need.position || need.title}</p>
                      <small>{matches ? `${matches} candidate record${matches === 1 ? '' : 's'} to review` : 'No current candidate evidence'}</small>
                    </div>
                    <span className={`djm-evidence-state ${matches ? 'is-review' : 'is-missing'}`}>
                      {matches ? 'Evidence to review' : 'Qualification gap'}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Empty icon={<Target size={25} />} text="No live demand is recorded. Capture a real club need before matching players." />
          )}
        </section>
      </div>

      <div className="djm-os-grid djm-os-grid-2">
        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <span className="djm-panel-kicker">CONNECTED OPERATIONS</span>
              <h2>Automation assurance</h2>
              <p>Only configured jobs and recorded exceptions are shown.</p>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className="djm-assurance-list">
            <StatusRow icon={<ShieldCheck size={17} />} title={systemNeedsAttention ? 'Human attention required' : 'No recorded exception'} detail={`${Number(automation?.cron_jobs?.length || 0)} configured jobs · ${incidentCount} incidents · ${freshnessCount} freshness checks`} attention={systemNeedsAttention} />
            <StatusRow icon={<Clock3 size={17} />} title="Commitment follow-through" detail={`${Number(summary.open_tasks || 0)} open · ${Number(summary.overdue_tasks || 0)} overdue`} href="/network" attention={Number(summary.overdue_tasks || 0) > 0} />
            <StatusRow icon={<Target size={17} />} title="Demand matching" detail={`${Number(summary.active_needs || 0)} live needs · ${Number(summary.needs_without_matches || 0)} with no candidate evidence`} href="/market" attention={Number(summary.needs_without_matches || 0) > 0} />
          </div>
        </section>

        <section className="djm-os-panel">
          <div className="djm-os-panel-head">
            <div>
              <span className="djm-panel-kicker">TRUTH MAINTENANCE</span>
              <h2>Evidence gaps</h2>
              <p>Exceptions that automation cannot resolve safely.</p>
            </div>
          </div>
          {qualityCount === 0 ? (
            <Empty icon={<CheckCircle2 size={25} />} text="No obvious gaps are currently recorded. This is not a guarantee that every fact is verified." />
          ) : (
            <div className="djm-os-list">
              <QualityRow label="Contacts missing club" value={quality.contacts_missing_club} href="/network" />
              <QualityRow label="Contacts missing role" value={quality.contacts_missing_role} href="/network" />
              <QualityRow label="Prospects missing source profile" value={quality.recruitment_missing_transfermarkt} href="/recruitment" />
              <QualityRow label="Prospects missing contact route" value={quality.recruitment_missing_contact} href="/recruitment" />
              <QualityRow label="Claims awaiting review" value={quality.open_reviews} href="/network" />
              <QualityRow label="Demand needing reverification" value={quality.stale_needs} href="/market" />
            </div>
          )}
        </section>
      </div>
    </DjmOsShell>
  );
}

function slug(value: string) {
  return value.toLowerCase().replaceAll(' ', '-');
}

function labelForKind(kind?: string) {
  return String(kind || 'action').replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase());
}

function Metric({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) {
  return <div className={`djm-os-metric ${attention ? 'is-attention' : ''}`}><strong>{value}</strong><span>{label}</span></div>;
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="djm-os-empty">{icon}<p>{text}</p></div>;
}

function StatusRow({ icon, title, detail, href, attention = false }: { icon: React.ReactNode; title: string; detail: string; href?: string; attention?: boolean }) {
  const content = <><span className="djm-os-panel-icon">{icon}</span><div><strong>{title}</strong><small>{detail}</small></div>{href ? <ArrowRight size={16} /> : null}</>;
  return href ? <Link className={`djm-assurance-row ${attention ? 'is-attention' : ''}`} href={href}>{content}</Link> : <div className={`djm-assurance-row ${attention ? 'is-attention' : ''}`}>{content}</div>;
}

function QualityRow({ label, value, href }: { label: string; value: any; href: string }) {
  const count = Number(value || 0);
  if (!count) return null;
  return <Link href={href} className="djm-opportunity-row"><div><strong>{label}</strong><p>DJM could not fill this safely without human confirmation.</p></div><span className="djm-evidence-state is-missing">{count} to review</span></Link>;
}
