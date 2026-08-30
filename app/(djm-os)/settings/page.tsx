'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Settings,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { useAdmin } from '@/components/AdminShell';
import { djmInvoke, djmRpc, friendlyError } from '@/lib/djm-os';

export default function SettingsPage() {
  const auth = useAdmin();
  const [command, setCommand] = useState<any>(null);
  const [providerStatus, setProviderStatus] = useState<any>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [commandResult, providerResult] = await Promise.all([
        djmRpc<any>('djm_command_center'),
        djmInvoke<any>('refresh-player-data', { mode: 'status' }).catch(() => null),
      ]);
      setCommand(commandResult || null);
      setProviderStatus(providerResult || null);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!auth.loading && auth.user) void load();
  }, [auth.loading, auth.user, load]);

  const quality = command?.quality || {};
  const automation = command?.automation || {};
  const attention =
    Number(quality.open_reviews || 0) +
    Number(quality.stale_needs || 0) +
    Number(command?.summary?.overdue_tasks || 0);

  return (
    <DjmOsShell eyebrow="Administration that stays out of the way" title="Settings">
      {error ? <div className="ux-alert ux-alert-error"><AlertCircle size={17} />{error}</div> : null}

      <section className="ux-settings-hero">
        <div>
          <p className="ux-eyebrow">DATA HEALTH</p>
          <h2>{attention ? `${attention} things need attention.` : 'System looks healthy.'}</h2>
          <p>Normal successful automation remains quiet. This page only surfaces exceptions, permissions and advanced administration.</p>
        </div>
        <button type="button" className="ux-secondary-action" onClick={() => void load()} disabled={busy}>
          <RefreshCw size={15} className={busy ? 'spin' : ''} /> Recheck
        </button>
      </section>

      <section className="ux-settings-grid">
        <SettingsCard
          icon={<CheckCircle2 size={20} />}
          title="Data health"
          text={providerStatus?.pitchapi_configured ? 'Automatic player provider is connected.' : 'Provider status needs review.'}
          meta={`${Number(quality.open_reviews || 0)} reviews · ${Number(quality.stale_needs || 0)} stale needs`}
          href="/admin"
          action="Open players"
        />
        <SettingsCard
          icon={<UsersRound size={20} />}
          title="Team & permissions"
          text="Manage staff roles and exactly which players scouts can see or edit."
          meta={auth.profile?.role === 'admin' ? 'Admin controlled' : 'Admin access required'}
          href="/settings/team"
          action="Manage access"
        />
        <SettingsCard
          icon={<ShieldCheck size={20} />}
          title="Player experience"
          text="Publish player resources and meaningful DJM announcements without adding another primary workspace."
          meta="Player-facing content"
          href="/settings/player-experience"
          action="Manage player experience"
        />
        <SettingsCard
          icon={<Settings size={20} />}
          title="Advanced evidence"
          text="Benchmarks, provider diagnostics and technical evidence tools remain available without living in normal navigation."
          meta={`Automation ${normaliseAutomation(automation)}`}
          href="/brain/data"
          action="Open advanced tools"
        />
      </section>

      <section className="ux-surface ux-settings-principle">
        <div><p className="ux-eyebrow">OPERATING RULE</p><h2>No routine CSV or JSON.</h2></div>
        <p>Player information should arrive automatically or through one-click updates. Technical imports remain a developer fallback, not an everyday workflow for agents.</p>
      </section>
    </DjmOsShell>
  );
}

function SettingsCard({ icon, title, text, meta, href, action }: { icon: React.ReactNode; title: string; text: string; meta: string; href: string; action: string }) {
  return (
    <Link className="ux-settings-card" href={href}>
      <div className="ux-settings-icon">{icon}</div>
      <div><strong>{title}</strong><p>{text}</p><small>{meta}</small></div>
      <span>{action}<ArrowRight size={15} /></span>
    </Link>
  );
}

function normaliseAutomation(value: any) {
  if (!value) return 'status unavailable';
  if (typeof value === 'string') return value;
  if (value.ok === true || value.healthy === true) return 'healthy';
  if (value.status) return String(value.status).replaceAll('_', ' ');
  return 'connected';
}
