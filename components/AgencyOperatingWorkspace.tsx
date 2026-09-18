'use client';

import AiLauncher from '@/components/AiLauncher';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  LogOut,
  Network,
  RefreshCw,
  ShieldCheck,
  Target,
  Users,
} from 'lucide-react';
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useTenantRuntime } from '@/components/TenantRuntimeProvider';
import { platformInvoke, friendlyError, relativeDate } from '@/lib/platform-client';
import { supabase } from '@/lib/supabase';
import AgencyRosterMigrationPanel from '@/components/AgencyRosterMigrationPanel';

import styles from './AgencyOperatingWorkspace.module.css';

type View = 'home' | 'players' | 'network' | 'opportunities';

type Workspace = {
  tenant_id: string;
  slug: string;
  role: string;
  is_primary?: boolean;
  synthetic_demo?: boolean;
  display_name?: string | null;
  short_name?: string | null;
  portal_name?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
};

const NAV: Array<{
  key: View;
  label: string;
  icon: typeof Target;
}> = [
  { key: 'home', label: 'Home', icon: Target },
  { key: 'players', label: 'Players', icon: Users },
  { key: 'network', label: 'Network', icon: Network },
  { key: 'opportunities', label: 'Opportunities', icon: BriefcaseBusiness },
];

const ALLOWED_ROLES = ['owner', 'admin', 'agent', 'operations'];

const human = (value: unknown) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const initials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

const money = (value: unknown, currency = 'EUR') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('en-GB')}`;
  }
};

const careerGateLabel = (value: unknown) => {
  const state = String(value || '').trim().toLowerCase();
  if (!state) return 'Recorded';
  if (state.startsWith('open_')) return 'Open to progress';
  if (state.startsWith('review_')) return 'Review needed';
  if (state.startsWith('hold_')) return 'Held by career control';
  return human(state);
};

export default function AgencyOperatingWorkspace() {
  const runtime = useTenantRuntime();
  const params = useParams<{ tenantSlug?: string }>();
  const search = useSearchParams();

  const requestedView = String(search.get('view') || 'home');
  const view: View = NAV.some((item) => item.key === requestedView)
    ? (requestedView as View)
    : 'home';

  const explicitSlug =
    typeof params?.tenantSlug === 'string'
      ? params.tenantSlug.trim().toLowerCase()
      : '';

  const targetSlug =
    explicitSlug ||
    (runtime.resolved ? runtime.slug : '');

  const basePath = explicitSlug
    ? `/workspace/${encodeURIComponent(explicitSlug)}`
    : '/agency';

  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(true);
  const [actionBusy, setActionBusy] = useState('');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [proposal, setProposal] = useState<any>(null);
  const [rosterImportOpen, setRosterImportOpen] = useState(false);
  const [showFirstValueHandoff, setShowFirstValueHandoff] = useState(
    () => search.get('handoff') === 'first-value',
  );

  const workspaceName =
    workspace?.display_name ||
    runtime.branding.display_name ||
    'Agency workspace';

  const theme = {
    '--agency-primary':
      workspace?.primary_color ||
      runtime.branding.primary_color ||
      '#111827',
    '--agency-accent':
      workspace?.accent_color ||
      runtime.branding.accent_color ||
      '#64748B',
  } as React.CSSProperties;

  const invoke = useCallback(
    async <T,>(
      action: string,
      body: Record<string, unknown> = {},
    ): Promise<T> => {
      if (!workspace?.tenant_id) {
        throw new Error('Agency workspace is not resolved.');
      }
      return platformInvoke<T>('agency-os', {
        action,
        tenant_id: workspace.tenant_id,
        ...body,
      });
    },
    [workspace?.tenant_id],
  );

  const resolveWorkspace = useCallback(async () => {
    if (!targetSlug) {
      setError('This agency workspace could not be resolved.');
      setBusy(false);
      return;
    }

    setBusy(true);
    setError('');

    try {
      const result = await platformInvoke<{ tenants?: Workspace[] }>(
        'agency-os',
        { action: 'tenants' },
      );
      const tenants = Array.isArray(result?.tenants)
        ? result.tenants
        : [];
      const match = tenants.find(
        (tenant) =>
          String(tenant.slug || '').toLowerCase() === targetSlug,
      );

      if (!match || !ALLOWED_ROLES.includes(String(match.role || ''))) {
        setWorkspace(null);
        setData(null);
        setError(
          'This signed-in account does not have agency staff access here.',
        );
        return;
      }

      setWorkspace(match);
    } catch (loadError) {
      setWorkspace(null);
      setData(null);
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, [targetSlug]);

  const loadView = useCallback(async () => {
    if (!workspace?.tenant_id) return;

    setBusy(true);
    setError('');
    setProposal(null);

    try {
      if (view === 'home') {
        setData(await invoke('home', { command_limit: 8 }));
      } else if (view === 'players') {
        setData(await invoke('roster_command', { limit: 100 }));
      } else if (view === 'network') {
        setData(await invoke('club_portfolio_control', { limit: 100 }));
      } else {
        const [deals, demand] = await Promise.all([
          invoke('deal_portfolio', { limit: 100 }),
          invoke('demand_control_fast', { limit: 100 }),
        ]);
        setData({ deals, demand });
      }
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, [invoke, view, workspace?.tenant_id]);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data: auth }) => {
      if (!active) return;
      const hasSession = Boolean(auth.session?.user);
      setSignedIn(hasSession);
      setSessionReady(true);
      if (!hasSession) setBusy(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;
        const hasSession = Boolean(session?.user);
        setSignedIn(hasSession);
        setSessionReady(true);
        if (!hasSession) {
          setWorkspace(null);
          setData(null);
          setBusy(false);
        }
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (sessionReady && signedIn) void resolveWorkspace();
  }, [resolveWorkspace, sessionReady, signedIn]);

  useEffect(() => {
    if (workspace?.tenant_id) void loadView();
  }, [loadView, workspace?.tenant_id]);

  useEffect(() => {
    if (workspace) {
      document.title = `${workspaceName} | ${human(view)}`;
    }
  }, [view, workspace, workspaceName]);

  useEffect(() => {
    if (search.get('handoff') !== 'first-value') return;

    const next = new URLSearchParams(search.toString());
    next.delete('handoff');
    const query = next.toString();

    window.history.replaceState(
      window.history.state,
      '',
      `${basePath}${query ? `?${query}` : ''}`,
    );
  }, [basePath, search]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (actionBusy) return;

    setActionBusy('sign-in');
    setError('');
    try {
      const { error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
      if (authError) throw authError;
    } catch (authError) {
      setError(friendlyError(authError));
    } finally {
      setActionBusy('');
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setWorkspace(null);
    setData(null);
    setPassword('');
  };

  const prepareCommand = async (command: any) => {
    const commandId = String(command?.command_id || '');
    if (!commandId || actionBusy) return;

    setActionBusy(commandId);
    setError('');
    try {
      const result = await invoke<any>('action_prepare', {
        command_id: commandId,
      });
      setProposal(result?.proposal || null);
    } catch (actionError) {
      setError(friendlyError(actionError));
    } finally {
      setActionBusy('');
    }
  };

  const executeProposal = async () => {
    const proposalId = String(
      proposal?.proposal_id || proposal?.id || '',
    );
    if (!proposalId || actionBusy) return;

    setActionBusy('execute');
    setError('');
    try {
      await invoke('action_execute', {
        proposal_id: proposalId,
      });
      setProposal(null);
      await loadView();
    } catch (actionError) {
      setError(friendlyError(actionError));
    } finally {
      setActionBusy('');
    }
  };

  if (!sessionReady) {
    return <Loading theme={theme} />;
  }

  if (!signedIn) {
    return (
      <main className={styles.authPage} style={theme}>
        <form className={styles.authCard} onSubmit={signIn}>
          <div className={styles.authMark}>
            <ShieldCheck size={18} />
          </div>
          <p className={styles.eyebrow}>PRIVATE AGENCY WORKSPACE</p>
          <h1>Open your workspace.</h1>
          <p>
            Sign in with an owner, admin, agent or operations account.
          </p>
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <ErrorBox text={error} /> : null}
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={actionBusy === 'sign-in'}
          >
            {actionBusy === 'sign-in' ? (
              <LoaderCircle size={16} className={styles.spin} />
            ) : (
              <ArrowRight size={16} />
            )}
            Open workspace
          </button>
        </form>
      </main>
    );
  }

  if (busy && !workspace) {
    return <Loading theme={theme} />;
  }

  if (!workspace) {
    return (
      <main className={styles.authPage} style={theme}>
        <section className={styles.authCard}>
          <CircleAlert size={22} />
          <h1>Workspace access unavailable.</h1>
          <p>{error || 'Agency staff access is required.'}</p>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void signOut()}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className={styles.root} style={theme}>
      <AiLauncher />
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.mark}>
            {initials(workspaceName) || 'A'}
          </div>
          <div>
            <strong>{workspaceName}</strong>
            <span>
              {workspace.portal_name ||
                workspace.short_name ||
                'Agency workspace'}
            </span>
          </div>
        </div>

        <nav className={styles.nav} aria-label="Agency workspace">
          {NAV.map((item) => {
            const Icon = item.icon;
            const href =
              item.key === 'home'
                ? basePath
                : `${basePath}?view=${item.key}`;

            return (
              <Link
                key={item.key}
                href={href}
                className={view === item.key ? styles.navActive : ''}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFoot}>
          <div>
            <span>{human(workspace.role)}</span>
            {workspace.synthetic_demo ? <small>Demo workspace</small> : null}
          </div>
          <button type="button" onClick={() => void signOut()}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.pageHead}>
          <div>
            <p className={styles.eyebrow}>
              {workspace.short_name || workspaceName}
            </p>
            <h1>{view === 'home' ? 'Today' : human(view)}</h1>
          </div>
          <div className={styles.headActions}>
            {view === 'home' &&
            ['owner', 'admin', 'operations'].includes(
              workspace.role,
            ) ? (
              <button
                type="button"
                className={styles.refresh}
                onClick={() => setRosterImportOpen(true)}
              >
                Import roster
              </button>
            ) : null}
            <button
              type="button"
              className={styles.refresh}
              onClick={() => void loadView()}
              disabled={busy}
            >
              <RefreshCw
                size={15}
                className={busy ? styles.spin : ''}
              />
              Refresh
            </button>
          </div>
        </header>

        {showFirstValueHandoff && view === 'opportunities' ? (
          <section className={styles.firstValueHandoff}>
            <div className={styles.firstValueHandoffIcon}>
              <CheckCircle2 size={20} />
            </div>
            <div className={styles.firstValueHandoffCopy}>
              <p className={styles.eyebrow}>FIRST WORKING VALUE REACHED</p>
              <h2>Your agency is operating now.</h2>
              <p>
                The player, club relationship and live route you just created
                are now part of the real workspace. Keep the opportunity
                current here, then use Today for the next evidence-backed
                action.
              </p>
            </div>
            <button
              type="button"
              className={styles.firstValueHandoffAction}
              onClick={() => setShowFirstValueHandoff(false)}
            >
              Continue working
            </button>
          </section>
        ) : null}

        {error ? <ErrorBox text={error} /> : null}

        {busy && !data ? (
          <section className={styles.loadingCard}>
            <LoaderCircle size={20} className={styles.spin} />
            Loading current agency position...
          </section>
        ) : null}

        {data ? (
          <>
            {view === 'home' ? (
              <Home
                data={data}
                actionBusy={actionBusy}
                onPrepare={prepareCommand}
              />
            ) : null}
            {view === 'players' ? <Players data={data} /> : null}
            {view === 'network' ? <NetworkView data={data} /> : null}
            {view === 'opportunities' ? (
              <Opportunities data={data} />
            ) : null}
          </>
        ) : null}
      </main>

      {rosterImportOpen ? (
        <AgencyRosterMigrationPanel
          workspaceName={workspaceName}
          invoke={invoke}
          onClose={() => setRosterImportOpen(false)}
          onImported={async () => {
            await loadView();
          }}
        />
      ) : null}

      {proposal ? (
        <div className={styles.modalBackdrop}>
          <section className={styles.modal}>
            <div className={styles.authMark}>
              <CheckCircle2 size={18} />
            </div>
            <p className={styles.eyebrow}>CONFIRM ACTION</p>
            <h2>
              {String(
                proposal?.title ||
                  proposal?.summary ||
                  'Apply this agency action?',
              )}
            </h2>
            <p>
              Nothing is applied until you confirm. The server will
              revalidate the action against the current tenant evidence.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setProposal(null)}
                disabled={Boolean(actionBusy)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void executeProposal()}
                disabled={Boolean(actionBusy)}
              >
                {actionBusy === 'execute' ? (
                  <LoaderCircle size={15} className={styles.spin} />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                Confirm
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Loading({
  theme,
}: {
  theme: React.CSSProperties;
}) {
  return (
    <main className={styles.loading} style={theme}>
      <LoaderCircle size={22} className={styles.spin} />
      <strong>Opening agency workspace</strong>
    </main>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className={styles.error}>
      <CircleAlert size={16} />
      <span>{text}</span>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Home({
  data,
  actionBusy,
  onPrepare,
}: {
  data: any;
  actionBusy: string;
  onPrepare: (command: any) => void;
}) {
  const home = data?.home || {};
  const commands = Array.isArray(home?.attention?.commands)
    ? home.attention.commands
    : [];
  const revenue = data?.revenue?.by_currency?.[0] || null;
  const roster = data?.roster_command?.summary || {};
  const top = commands[0] || null;

  return (
    <div className={styles.stack}>
      <section className={styles.heroCard}>
        <div>
          <p className={styles.eyebrow}>
            {top ? 'DO THIS FIRST' : 'CLEAR'}
          </p>
          <h2>
            {top?.title ||
              'No urgent operating action is recorded.'}
          </h2>
          <p>
            {top?.why_now ||
              'The workspace will surface the next evidence-backed action here.'}
          </p>
        </div>
        {top ? (
          <div className={styles.heroMeta}>
            <span>{human(top.priority_band || 'high')}</span>
            <small>{relativeDate(top.due_at)}</small>
          </div>
        ) : null}
      </section>

      <section className={styles.metrics}>
        <Metric
          label="Expected commission"
          value={
            revenue
              ? money(revenue.expected_commission, revenue.currency)
              : '-'
          }
          detail={`${revenue?.active_deals || 0} active deals`}
        />
        <Metric
          label="Weighted commission"
          value={
            revenue
              ? money(revenue.weighted_commission, revenue.currency)
              : '-'
          }
          detail="Recorded probability context only"
        />
        <Metric
          label="Players"
          value={String(roster.active_players ?? '-')}
          detail={`${roster.live_deals_needing_protection || 0} need deal protection`}
        />
        <Metric
          label="Needs attention"
          value={String(home?.attention?.high_count ?? 0)}
          detail={`${home?.attention?.critical_count || 0} critical`}
        />
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>OPERATING QUEUE</p>
          <h2>What needs attention now</h2>
        </div>
        <div className={styles.list}>
          {commands.slice(0, 8).map((command: any) => {
            const oneTap =
              command?.actionability?.mode === 'one_tap' &&
              command?.actionability?.evidence_gate === 'ready';

            return (
              <article className={styles.listRow} key={command.command_id}>
                <div className={styles.rank}>{command.rank || '•'}</div>
                <div className={styles.listCopy}>
                  <strong>{command.title}</strong>
                  <span>
                    {command.recommended_action ||
                      command.why_now ||
                      'Review current evidence.'}
                  </span>
                  <small>
                    {human(command.command_type)} · {relativeDate(command.due_at)}
                  </small>
                </div>
                {oneTap ? (
                  <button
                    type="button"
                    className={styles.compactButton}
                    onClick={() => onPrepare(command)}
                    disabled={Boolean(actionBusy)}
                  >
                    {actionBusy === command.command_id ? (
                      <LoaderCircle size={14} className={styles.spin} />
                    ) : (
                      <ArrowRight size={14} />
                    )}
                    {command.actionability?.cta || 'Prepare'}
                  </button>
                ) : (
                  <span className={styles.needsInput}>
                    {command.actionability?.requires_input
                      ? 'Needs detail'
                      : 'Review'}
                  </span>
                )}
              </article>
            );
          })}
          {!commands.length ? (
            <div className={styles.empty}>No current commands.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Players({ data }: { data: any }) {
  const roster = data?.roster || data || {};
  const items = Array.isArray(roster?.items) ? roster.items : [];
  const summary = roster?.summary || {};

  return (
    <div className={styles.stack}>
      <section className={styles.metrics}>
        <Metric label="Active players" value={String(summary.active_players ?? items.length)} detail="Current represented roster" />
        <Metric label="Deal protection" value={String(summary.live_deals_needing_protection || 0)} detail="Players with live business to protect" />
        <Metric label="Market activation" value={String(summary.players_needing_market_activation || 0)} detail="Players needing active market work" />
        <Metric label="Unassigned" value={String(summary.players_without_primary_staff || 0)} detail="Players without primary staff owner" />
      </section>
      <section className={styles.cards}>
        {items.map((item: any) => (
          <article className={styles.card} key={item.player_id}>
            <div className={styles.cardTop}>
              <div>
                <p className={styles.eyebrow}>PRIORITY {item.priority_rank || '-'}</p>
                <h2>{item.player?.name || 'Player'}</h2>
                <p>{human(item.player?.football_status)}</p>
              </div>
              <span className={styles.pill}>{human(item.service?.state)}</span>
            </div>
            <div className={styles.facts}>
              <div><span>Next action</span><strong>{item.player?.next_action || 'No action recorded'}</strong><small>{relativeDate(item.player?.next_action_due)}</small></div>
              <div><span>Live deals</span><strong>{item.live_deals?.count || 0}</strong><small>{item.live_deals?.highest_probability ? `${item.live_deals.highest_probability}% recorded probability` : 'No active deal'}</small></div>
              <div><span>Career control</span><strong>{human(item.career?.alignment_state)}</strong><small>{item.blocks_external_escalation ? 'External escalation blocked' : human(item.execution_window)}</small></div>
            </div>
            {item.why_now?.[0] ? <div className={styles.reason}>{item.why_now[0]}</div> : null}
          </article>
        ))}
      </section>
    </div>
  );
}

function NetworkView({ data }: { data: any }) {
  const clubs = data?.clubs || data || {};
  const items = Array.isArray(clubs?.items) ? clubs.items : [];
  const summary = clubs?.summary || {};

  return (
    <div className={styles.stack}>
      <section className={styles.metrics}>
        <Metric label="Relevant clubs" value={String(summary.relevant_clubs ?? items.length)} detail="Accounts with current relevance" />
        <Metric label="Live business" value={String(summary.live_business_to_protect || 0)} detail="Club accounts with active deals" />
        <Metric label="Roster gaps" value={String(summary.confirmed_roster_gaps || 0)} detail="Confirmed needs without recorded match" />
        <Metric label="Access development" value={String(summary.live_demand_access_development || 0)} detail="Live demand needing stronger route" />
      </section>
      <section className={styles.cards}>
        {items.map((item: any) => (
          <article className={styles.card} key={item.organisation_id}>
            <div className={styles.cardTop}>
              <div>
                <p className={styles.eyebrow}>{human(item.state)}</p>
                <h2>{item.club?.name || 'Club'}</h2>
                <p>{[item.club?.city, item.club?.country].filter(Boolean).join(', ')}</p>
              </div>
              <span className={styles.score}>{item.direct_relationship?.access_score ?? '-'}</span>
            </div>
            <div className={styles.facts}>
              <div><span>Best contact</span><strong>{item.direct_relationship?.best_recorded_contact || 'No contact'}</strong><small>{item.direct_relationship?.role_title || 'No role'}</small></div>
              <div><span>Active needs</span><strong>{item.demand?.active_needs || 0}</strong><small>{item.demand?.confirmed_needs || 0} confirmed</small></div>
              <div><span>Active deals</span><strong>{item.live_business?.active_deals || 0}</strong><small>{item.live_business?.deals_needing_action || 0} need action</small></div>
            </div>
            {item.next_action?.instruction ? <div className={styles.reason}>{item.next_action.instruction}</div> : null}
          </article>
        ))}
      </section>
    </div>
  );
}

function Opportunities({ data }: { data: any }) {
  const deals = data?.deals?.deals || data?.deals || {};
  const dealItems = Array.isArray(deals?.deals) ? deals.deals : [];
  const demand = data?.demand?.coverage || data?.demand || {};
  const needs = Array.isArray(demand?.items) ? demand.items : [];

  return (
    <div className={styles.stack}>
      <section className={styles.metrics}>
        <Metric label="Active deals" value={String(deals?.summary?.active_deals ?? dealItems.length)} detail={`${deals?.summary?.progressing_deals || 0} progressing`} />
        <Metric label="Stage reviews" value={String(deals?.summary?.stage_reviews_due || 0)} detail="Due now" />
        <Metric label="Active needs" value={String(demand?.summary?.active_needs ?? needs.length)} detail={`${demand?.summary?.roster_gaps || 0} roster gaps`} />
        <Metric label="Ready pursuits" value={String(demand?.summary?.ready_for_deep_pursuit_review || 0)} detail="Ready for human deep review" />
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}><p className={styles.eyebrow}>LIVE DEALS</p><h2>Commercial pipeline</h2></div>
        <div className={styles.list}>
          {dealItems.map((deal: any) => (
            <article className={styles.listRow} key={deal.deal_room_id}>
              <div className={styles.rank}>{deal.rank || '•'}</div>
              <div className={styles.listCopy}>
                <strong>{deal.title}</strong>
                <span>{deal.next_best_move?.instruction || deal.next_decision || 'Review the deal.'}</span>
                <small>{human(deal.stage)} · {deal.organisation} · {deal.currency ? money(deal.expected_commission, deal.currency) : '-'}</small>
              </div>
              <div className={styles.sideStat}><strong>{deal.probability ?? '-'}%</strong><small>{human(deal.momentum_state)}</small></div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}><p className={styles.eyebrow}>CLUB DEMAND</p><h2>Needs worth acting on</h2></div>
        <div className={styles.list}>
          {needs.map((item: any) => {
            const candidates = Array.isArray(
              item?.candidate_coverage?.candidates,
            )
              ? item.candidate_coverage.candidates
              : [];
            const visibleCandidates = candidates.slice(0, 4);
            const hiddenCandidates = Math.max(
              0,
              candidates.length - visibleCandidates.length,
            );

            return (
              <article className={styles.listRow} key={item.club_need_id}>
                <div className={styles.rank}>{item.command_rank || '•'}</div>
                <div className={styles.listCopy}>
                  <strong>{item.club?.name} · {item.need?.title}</strong>
                  <span>
                    {item.next_action?.instruction ||
                      'Review the recorded need.'}
                  </span>
                  <small>
                    {human(item.need?.need_type)} ·{' '}
                    {item.need?.position || 'Position open'} ·{' '}
                    {human(item.coverage_state)}
                  </small>

                  <div
                    className={styles.routeCandidates}
                    aria-label="Recorded player routes"
                  >
                    {visibleCandidates.map((candidate: any) => (
                      <div
                        className={styles.routeCandidate}
                        key={
                          candidate.player_match_id ||
                          candidate.player_id ||
                          candidate.player_name
                        }
                      >
                        <b>{candidate.player_name || 'Player'}</b>
                        <small>
                          {careerGateLabel(
                            candidate.career_gate_state ||
                              candidate.match_status,
                          )}
                        </small>
                      </div>
                    ))}
                    {!visibleCandidates.length ? (
                      <div className={styles.routeCandidateEmpty}>
                        No recorded candidate yet
                      </div>
                    ) : null}
                    {hiddenCandidates ? (
                      <div className={styles.routeCandidateMore}>
                        +{hiddenCandidates} more
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className={styles.sideStat}>
                  <strong>
                    {item.candidate_coverage?.recorded_candidates || 0}
                  </strong>
                  <small>candidates</small>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
