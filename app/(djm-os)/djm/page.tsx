'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  HeartPulse,
  RefreshCw,
  Target,
  UsersRound,
} from 'lucide-react';

import DjmOsShell from '@/components/DjmOsShell';
import { useAdmin } from '@/components/AdminShell';
import {
  buildAdminPortfolio,
  type AdminIssue,
  type AdminRow,
} from '@/lib/admin-command-centre';
import { compactDateTime, djmRpc, friendlyError } from '@/lib/djm-os';
import { supabase } from '@/lib/supabase';

type PortfolioData = {
  players: AdminRow[];
  privateRows: AdminRow[];
  requests: AdminRow[];
  checkins: AdminRow[];
  opportunities: AdminRow[];
  agreements: AdminRow[];
  documents: AdminRow[];
  videos: AdminRow[];
  publicProfiles: AdminRow[];
};

const EMPTY_PORTFOLIO: PortfolioData = {
  players: [],
  privateRows: [],
  requests: [],
  checkins: [],
  opportunities: [],
  agreements: [],
  documents: [],
  videos: [],
  publicProfiles: [],
};

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const rowData = (result: any) => result?.data || [];

export default function DjmHomePage() {
  const auth = useAdmin();
  const [command, setCommand] = useState<any>(null);
  const [portfolioData, setPortfolioData] = useState<PortfolioData>(EMPTY_PORTFOLIO);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [commandResult, queryResults] = await Promise.all([
        djmRpc<any>('djm_command_center'),
        Promise.all([
          supabase.from('players').select('id,first_name,last_name,preferred_name,date_of_birth,primary_position,current_club,current_league,current_country,contract_status,contract_expiry,football_status,verification_status,agency_priority,next_action,next_action_due,current_season_label,current_season_start,transfermarkt_url,wyscout_url,stats_url'),
          supabase.from('player_private').select('player_id,market_preferences,preferred_move_timing,travel_availability,passports_held,work_rights'),
          supabase.from('player_requests').select('id,player_id,title,message,request_type,status,due_at,player_reply,created_at,updated_at'),
          supabase.from('weekly_checkins').select('id,player_id,week_start,availability_status,club_situation_changed,club_situation_notes,fitness_status,fitness_notes,support_request,player_notes,submitted_at').order('week_start', { ascending: false }),
          supabase.from('player_opportunities').select('id,player_id,club_name,country,stage,next_action,next_action_due,updated_at'),
          supabase.from('player_agreements').select('id,player_id,agreement_type,status,title,start_date,end_date,visible_to_player,created_at,updated_at'),
          supabase.from('player_documents').select('id,player_id,title,document_type,expires_at,created_at'),
          supabase.from('player_videos').select('id,player_id,title,url,video_type,featured,created_at'),
          supabase.from('player_public_profiles').select('player_id,published,updated_at'),
        ]),
      ]);

      const firstFailure = queryResults.find((result: any) => result.error)?.error;
      if (firstFailure) throw firstFailure;

      setCommand(commandResult || null);
      setPortfolioData({
        players: rowData(queryResults[0]),
        privateRows: rowData(queryResults[1]),
        requests: rowData(queryResults[2]),
        checkins: rowData(queryResults[3]),
        opportunities: rowData(queryResults[4]),
        agreements: rowData(queryResults[5]),
        documents: rowData(queryResults[6]),
        videos: rowData(queryResults[7]),
        publicProfiles: rowData(queryResults[8]),
      });
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!auth.loading && auth.user) void load();
  }, [auth.loading, auth.user, load]);

  const portfolio = useMemo(
    () =>
      buildAdminPortfolio({
        players: portfolioData.players,
        privateRows: portfolioData.privateRows,
        requests: portfolioData.requests,
        checkins: portfolioData.checkins,
        opportunities: portfolioData.opportunities,
        agreements: portfolioData.agreements,
        documents: portfolioData.documents,
        videos: portfolioData.videos,
        publicProfiles: portfolioData.publicProfiles,
      }),
    [portfolioData],
  );

  const combinedQueue = useMemo(() => {
    const playerIssues = portfolio.issues.map((issue) => ({
      id: `player-${issue.id}`,
      title: issue.title,
      subtitle: `${issue.playerName} · ${issue.detail}`,
      href: issue.href,
      score: issue.score,
      action_at: issue.dueAt || null,
      kind: issue.kind,
      source: 'player' as const,
    }));

    const commandItems = (Array.isArray(command?.focus) ? command.focus : []).map((item: any) => ({
      id: `system-${item.kind || 'item'}-${item.id || item.title}`,
      title: item.title || 'DJM action',
      subtitle: item.subtitle || 'Review the latest context.',
      href: normaliseLegacyHref(item.href || '/djm'),
      score: Number(item.score || 50),
      action_at: item.action_at || null,
      kind: item.kind || 'system',
      source: 'system' as const,
    }));

    const deduped = new Map<string, any>();
    [...playerIssues, ...commandItems].forEach((item) => {
      const key = `${item.title}|${item.subtitle}`.toLowerCase();
      const previous = deduped.get(key);
      if (!previous || item.score > previous.score) deduped.set(key, item);
    });

    return [...deduped.values()]
      .sort((a, b) => b.score - a.score || String(a.action_at || '').localeCompare(String(b.action_at || '')))
      .slice(0, 12);
  }, [command?.focus, portfolio.issues]);

  const liveNeeds = Array.isArray(command?.opportunities) ? command.opportunities : [];
  const summary = command?.summary || {};
  const urgentCount = combinedQueue.filter((item) => Number(item.score || 0) >= 90).length;
  const displayName = auth.profile?.display_name?.split(' ')?.[0] || 'DJM';

  return (
    <DjmOsShell eyebrow="Agency operating system" title="Home">
      <section className="ux-staff-home-hero">
        <div>
          <p className="ux-eyebrow">{greeting()}, {displayName}.</p>
          <h2>{combinedQueue.length ? `${combinedQueue.length} things deserve DJM's attention.` : 'DJM is under control.'}</h2>
          <p>Player service, club demand, relationships and deals are ranked together. Routine automation stays quiet.</p>
        </div>
        <button type="button" className="ux-secondary-action" onClick={() => void load()} disabled={busy}>
          <RefreshCw size={15} className={busy ? 'spin' : ''} /> Refresh
        </button>
      </section>

      {error ? <div className="ux-alert ux-alert-error"><AlertCircle size={17} />{error}</div> : null}

      <section className="ux-signal-strip" aria-label="Agency summary">
        <Signal icon={<HeartPulse size={18} />} value={urgentCount} label="needs action now" attention={urgentCount > 0} />
        <Signal icon={<Target size={18} />} value={Number(summary.active_deals || 0)} label="live opportunities" />
        <Signal icon={<UsersRound size={18} />} value={portfolio.metrics.readyToMove} label="players ready to move" />
      </section>

      <div className="ux-staff-home-grid">
        <section className="ux-surface ux-priority-surface">
          <div className="ux-surface-head">
            <div><p className="ux-eyebrow">TODAY</p><h2>What should DJM do next?</h2></div>
            <span>{combinedQueue.length}</span>
          </div>

          {busy ? <div className="ux-loading-row"><RefreshCw className="spin" size={18} />Connecting the agency picture...</div> : null}
          {!busy && combinedQueue.length ? (
            <div className="ux-action-list">
              {combinedQueue.map((item, index) => (
                <Link className="ux-action-row" href={item.href} key={item.id}>
                  <div className={`ux-action-rank ${item.score >= 90 ? 'is-urgent' : item.score >= 70 ? 'is-next' : ''}`}>{index + 1}</div>
                  <div className="ux-action-copy">
                    <strong>{item.title}</strong>
                    <p>{item.subtitle}</p>
                    <small>{item.action_at ? compactDateTime(item.action_at) : item.source === 'player' ? 'Player service' : 'DJM system'}</small>
                  </div>
                  <ArrowRight size={17} />
                </Link>
              ))}
            </div>
          ) : null}
          {!busy && !combinedQueue.length ? (
            <div className="ux-evidence-empty"><CheckCircle2 size={28} /><div><strong>Nothing urgent.</strong><p>Automation is healthy and there is no ranked action waiting.</p></div></div>
          ) : null}
        </section>

        <aside className="ux-home-side-stack">
          <section className="ux-surface">
            <div className="ux-surface-head"><div><p className="ux-eyebrow">LIVE DEMAND</p><h2>Club needs</h2></div><Link href="/opportunities">Open</Link></div>
            <div className="ux-mini-list">
              {liveNeeds.slice(0, 5).map((need: any) => (
                <Link href="/opportunities" key={need.id}>
                  <strong>{need.organisation_name}</strong>
                  <span>{need.position || need.title || 'Player need'}</span>
                  <small>{Number(need.match_count || 0)} match{Number(need.match_count || 0) === 1 ? '' : 'es'}</small>
                </Link>
              ))}
              {!liveNeeds.length ? <p className="ux-muted-copy">No live club needs currently surfaced.</p> : null}
            </div>
          </section>

          <section className="ux-surface">
            <div className="ux-surface-head"><div><p className="ux-eyebrow">QUIET SYSTEM</p><h2>Health</h2></div><Link href="/settings">Settings</Link></div>
            <div className="ux-health-lines">
              <HealthLine label="Open reviews" value={Number(command?.quality?.open_reviews || 0)} />
              <HealthLine label="Stale needs" value={Number(command?.quality?.stale_needs || 0)} />
              <HealthLine label="Overdue tasks" value={Number(summary.overdue_tasks || 0)} />
            </div>
            <p className="ux-muted-copy">Successful refreshes and normal automation are deliberately not shown here.</p>
          </section>
        </aside>
      </div>
    </DjmOsShell>
  );
}

function normaliseLegacyHref(value: string) {
  if (value === '/market') return '/opportunities';
  if (value.startsWith('/market/deals/')) return value.replace('/market/deals/', '/opportunities/');
  if (value.startsWith('/brain')) return '/settings';
  return value;
}

function Signal({ icon, value, label, attention = false }: { icon: React.ReactNode; value: number; label: string; attention?: boolean }) {
  return <div className={`ux-signal ${attention ? 'is-attention' : ''}`}>{icon}<strong>{value}</strong><span>{label}</span></div>;
}

function HealthLine({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
