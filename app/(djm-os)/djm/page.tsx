'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Settings,
  Target,
} from 'lucide-react';

import './home-v2.css';

import DjmOsShell from '@/components/DjmOsShell';
import { useAdmin } from '@/components/AdminShell';
import {
  buildAdminPortfolio,
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
  const [actionBusy, setActionBusy] = useState('');
  const [homeControls, setHomeControls] = useState<any[]>([]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');

    try {
      const [commandResult, controlResult, queryResults] = await Promise.all([
        djmRpc<any>('djm_command_center'),
        djmRpc<any[]>('djm_home_item_controls'),
        Promise.all([
          supabase
            .from('players')
            .select(
              'id,first_name,last_name,preferred_name,date_of_birth,primary_position,current_club,current_league,current_country,contract_status,contract_expiry,football_status,verification_status,agency_priority,next_action,next_action_due,current_season_label,current_season_start,transfermarkt_url,wyscout_url,stats_url',
            ),
          supabase
            .from('player_private')
            .select(
              'player_id,market_preferences,preferred_move_timing,travel_availability,passports_held,work_rights',
            ),
          supabase
            .from('player_requests')
            .select(
              'id,player_id,title,message,request_type,status,due_at,player_reply,created_by,created_at,updated_at',
            ),
          supabase
            .from('weekly_checkins')
            .select(
              'id,player_id,week_start,availability_status,club_situation_changed,club_situation_notes,fitness_status,fitness_notes,support_request,player_notes,submitted_at',
            )
            .order('week_start', { ascending: false }),
          supabase
            .from('player_opportunities')
            .select(
              'id,player_id,club_name,country,stage,next_action,next_action_due,updated_at',
            ),
          supabase
            .from('player_agreements')
            .select(
              'id,player_id,agreement_type,status,title,start_date,end_date,visible_to_player,created_at,updated_at',
            ),
          supabase
            .from('player_documents')
            .select('id,player_id,title,document_type,expires_at,created_at'),
          supabase
            .from('player_videos')
            .select('id,player_id,title,url,video_type,featured,created_at'),
          supabase
            .from('player_public_profiles')
            .select('player_id,published,updated_at'),
        ]),
      ]);

      const firstFailure = queryResults.find((result: any) => result.error)?.error;
      if (firstFailure) throw firstFailure;

      setCommand(commandResult || null);
      setHomeControls(Array.isArray(controlResult) ? controlResult : []);
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

  const activeControlKeys = useMemo(
    () =>
      new Set(
        homeControls
          .filter(
            (control) =>
              control?.state === 'dismissed' ||
              (control?.state === 'snoozed' &&
                control?.snoozed_until &&
                new Date(control.snoozed_until).getTime() > Date.now()),
          )
          .map((control) => String(control.item_key)),
      ),
    [homeControls],
  );

  const combinedQueue = useMemo(() => {
    const playerIssues = portfolio.issues.map((issue) => ({
      id: `player-${issue.id}`,
      control_key: issue.recordId
        ? `player:${issue.kind}:${issue.recordId}`
        : `player:${issue.kind}:${issue.playerId}:${issue.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .slice(0, 80)}`,
      title: issue.title,
      subtitle: `${issue.playerName} · ${issue.detail}`,
      href: issue.href,
      score: issue.score,
      action_at: issue.dueAt || null,
      kind: issue.kind,
      source: 'player' as const,
      record_id: issue.recordId || null,
      can_complete:
        ['message', 'request'].includes(issue.kind) && Boolean(issue.recordId),
    }));

    const commandItems = (Array.isArray(command?.focus) ? command.focus : []).map(
      (item: any) => ({
        id: `system-${item.kind || 'item'}-${item.id || item.title}`,
        control_key: `system:${item.kind || 'item'}:${
          item.id ||
          String(item.title || 'item')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .slice(0, 80)
        }`,
        title: item.title || 'DJM action',
        subtitle: item.subtitle || 'Review the latest context.',
        href: normaliseLegacyHref(item.href || '/djm'),
        score: Number(item.score || 50),
        action_at: item.action_at || null,
        kind: item.kind || 'system',
        source: 'system' as const,
        record_id: item.id || null,
        can_complete: item.kind === 'task' || item.action === 'complete',
      }),
    );

    const deduped = new Map<string, any>();

    [...playerIssues, ...commandItems].forEach((item) => {
      const key = `${item.title}|${item.subtitle}`.toLowerCase();
      const previous = deduped.get(key);

      if (!previous || item.score > previous.score) {
        deduped.set(key, item);
      }
    });

    return [...deduped.values()]
      .filter((item) => !activeControlKeys.has(item.control_key))
      .sort(
        (a, b) =>
          b.score - a.score ||
          String(a.action_at || '').localeCompare(String(b.action_at || '')),
      )
      .slice(0, 12);
  }, [activeControlKeys, command?.focus, portfolio.issues]);

  const completeQueueItem = async (item: any) => {
    if (!item?.record_id || !item?.can_complete || actionBusy) return;

    setActionBusy(item.id);
    setError('');

    try {
      if (item.source === 'system' && item.kind === 'task') {
        await djmRpc('djm_network_set_task_status', {
          p_task_id: item.record_id,
          p_status: 'completed',
        });
      } else if (
        item.source === 'player' &&
        ['message', 'request'].includes(item.kind)
      ) {
        await djmRpc('djm_complete_player_request', {
          p_request_id: item.record_id,
        });
      }

      await load();
    } catch (completeError) {
      setError(friendlyError(completeError));
    } finally {
      setActionBusy('');
    }
  };

  const setQueueItemControl = async (
    item: any,
    action: 'dismiss' | 'snooze',
  ) => {
    if (!item?.control_key || actionBusy) return;

    let snoozedUntil: string | null = null;

    if (action === 'snooze') {
      const until = new Date();
      until.setDate(until.getDate() + 1);
      until.setHours(9, 0, 0, 0);
      snoozedUntil = until.toISOString();
    }

    setActionBusy(`control-${item.id}`);
    setError('');

    try {
      await djmRpc('djm_home_set_item_control', {
        p_item_key: item.control_key,
        p_action: action,
        p_snoozed_until: snoozedUntil,
      });

      setHomeControls((current) => [
        ...current.filter((control) => control?.item_key !== item.control_key),
        {
          item_key: item.control_key,
          state: action === 'dismiss' ? 'dismissed' : 'snoozed',
          snoozed_until: snoozedUntil,
        },
      ]);
    } catch (controlError) {
      setError(friendlyError(controlError));
    } finally {
      setActionBusy('');
    }
  };

  const liveNeeds = Array.isArray(command?.opportunities)
    ? command.opportunities
    : [];
  const summary = command?.summary || {};
  const urgentCount = combinedQueue.filter(
    (item) => Number(item.score || 0) >= 90,
  ).length;
  const displayName = auth.profile?.display_name?.split(' ')?.[0] || 'DJM';

  return (
    <DjmOsShell eyebrow="Agency operating system" title="Home">
      <div className="djm-home-v2">
        <section className="djm-home-v2-hero">
          <div className="djm-home-v2-hero-top">
            <div>
              <span className="djm-home-v2-kicker">
                {greeting()}, {displayName}.
              </span>
              <h1>
                {combinedQueue.length
                  ? `${combinedQueue.length} ${
                      combinedQueue.length === 1 ? 'thing is' : 'things are'
                    } worth your attention.`
                  : 'Everything is under control.'}
              </h1>
              <p>
                Only work that needs a decision, follow-up or response is kept
                on Home.
              </p>
            </div>

            <button
              type="button"
              className="djm-home-v2-refresh"
              onClick={() => void load()}
              disabled={busy}
            >
              <RefreshCw size={15} className={busy ? 'spin' : ''} />
              Refresh
            </button>
          </div>

          <div className="djm-home-v2-pulse" aria-label="Agency pulse">
            <HomePulse
              label="Needs action now"
              value={urgentCount}
              attention={urgentCount > 0}
            />
            <HomePulse
              label="Live opportunities"
              value={Number(summary.active_deals || 0)}
            />
            <HomePulse
              label="Players ready to move"
              value={portfolio.metrics.readyToMove}
            />
          </div>
        </section>

        {error ? (
          <div className="ux-alert ux-alert-error">
            <AlertCircle size={17} />
            {error}
          </div>
        ) : null}

        <div className="djm-home-v2-layout">
          <section className="djm-home-v2-queue">
            <header className="djm-home-v2-section-head">
              <div>
                <span>NOW</span>
                <h2>Your work queue</h2>
                <p>Highest-value work first. Nothing else needs to be here.</p>
              </div>

              <b>{combinedQueue.length}</b>
            </header>

            {busy ? (
              <div className="ux-loading-row">
                <RefreshCw className="spin" size={18} />
                Connecting the agency picture...
              </div>
            ) : null}

            {!busy && combinedQueue.length ? (
              <div className="djm-home-v2-task-list">
                {combinedQueue.map((item, index) => (
                  <article
                    key={item.id}
                    className={`djm-home-v2-task ${
                      item.score >= 90
                        ? 'is-urgent'
                        : item.score >= 70
                          ? 'is-next'
                          : ''
                    }`}
                  >
                    <Link href={item.href} className="djm-home-v2-task-main">
                      <span className="djm-home-v2-task-order">
                        {String(index + 1).padStart(2, '0')}
                      </span>

                      <span className="djm-home-v2-task-copy">
                        <strong>{item.title}</strong>
                        <span>{item.subtitle}</span>
                        <small>
                          {item.action_at
                            ? compactDateTime(item.action_at)
                            : item.source === 'player'
                              ? 'Player service'
                              : 'DJM system'}
                        </small>
                      </span>

                      <ArrowRight size={17} />
                    </Link>

                    <div className="djm-home-v2-task-actions">
                      {item.can_complete ? (
                        <button
                          type="button"
                          className="djm-home-v2-done"
                          disabled={Boolean(actionBusy)}
                          onClick={() => void completeQueueItem(item)}
                        >
                          <CheckCircle2 size={14} />
                          {actionBusy === item.id ? 'Saving' : 'Done'}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        className="djm-home-v2-icon-action"
                        aria-label="Snooze until tomorrow"
                        title="Snooze until tomorrow"
                        disabled={Boolean(actionBusy)}
                        onClick={() =>
                          void setQueueItemControl(item, 'snooze')
                        }
                      >
                        <Clock3 size={15} />
                      </button>

                      <button
                        type="button"
                        className="djm-home-v2-remove"
                        aria-label="Remove from Home"
                        title="Remove from Home"
                        disabled={Boolean(actionBusy)}
                        onClick={() =>
                          void setQueueItemControl(item, 'dismiss')
                        }
                      >
                        ×
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {!busy && !combinedQueue.length ? (
              <div className="djm-home-v2-clear">
                <span>
                  <CheckCircle2 size={20} />
                </span>
                <div>
                  <strong>All clear.</strong>
                  <p>Nothing you have kept on Home needs attention right now.</p>
                </div>
              </div>
            ) : null}
          </section>

          <aside className="djm-home-v2-side">
            <section className="djm-home-v2-demand">
              <header className="djm-home-v2-section-head is-compact">
                <div>
                  <span>LIVE DEMAND</span>
                  <h2>Club needs</h2>
                </div>
                <Link href="/opportunities">Open all</Link>
              </header>

              <div className="djm-home-v2-need-list">
                {liveNeeds.slice(0, 5).map((need: any) => (
                  <Link href="/opportunities" key={need.id}>
                    <span className="djm-home-v2-need-icon">
                      <Target size={14} />
                    </span>
                    <span>
                      <strong>{need.organisation_name}</strong>
                      <small>
                        {need.position || need.title || 'Player need'}
                      </small>
                    </span>
                    <b>{Number(need.match_count || 0)}</b>
                  </Link>
                ))}

                {!liveNeeds.length ? (
                  <div className="djm-home-v2-side-empty">
                    No live club needs are currently surfaced.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="djm-home-v2-health">
              <div className="djm-home-v2-health-head">
                <div>
                  <span>SYSTEM</span>
                  <strong>Quiet health</strong>
                </div>
                <Link href="/settings" aria-label="Open settings">
                  <Settings size={15} />
                </Link>
              </div>

              <div className="djm-home-v2-health-grid">
                <HealthMetric
                  label="Open reviews"
                  value={Number(command?.quality?.open_reviews || 0)}
                />
                <HealthMetric
                  label="Stale needs"
                  value={Number(command?.quality?.stale_needs || 0)}
                />
                <HealthMetric
                  label="Overdue tasks"
                  value={Number(summary.overdue_tasks || 0)}
                />
              </div>

              <p>Normal automation stays invisible when it is working.</p>
            </section>
          </aside>
        </div>
      </div>
    </DjmOsShell>
  );
}

function normaliseLegacyHref(value: string) {
  if (value === '/market') return '/opportunities';

  if (value.startsWith('/market/deals/')) {
    return value.replace('/market/deals/', '/opportunities/');
  }

  if (value.startsWith('/brain')) return '/settings';
  return value;
}

function HomePulse({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: number;
  attention?: boolean;
}) {
  return (
    <div className={`djm-home-v2-pulse-item ${attention ? 'is-attention' : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function HealthMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
