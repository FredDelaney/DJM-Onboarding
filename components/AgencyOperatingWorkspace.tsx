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
import {
  platformInvoke,
  platformRpc,
  friendlyError,
  relativeDate,
} from '@/lib/platform-client';
import { supabase } from '@/lib/supabase';
import AgencyRosterMigrationPanel from '@/components/AgencyRosterMigrationPanel';

import styles from './AgencyOperatingWorkspace.module.css';

type View = 'home' | 'players' | 'market' | 'deals' | 'relationships';

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
  { key: 'market', label: 'Market', icon: Target },
  { key: 'deals', label: 'Deals', icon: BriefcaseBusiness },
  { key: 'relationships', label: 'Relationships', icon: Network },
];

const VIEW_PRESENTATION: Record<
  View,
  { eyebrow: string; title: string; description: string }
> = {
  home: {
    eyebrow: 'DAILY OPERATING PICTURE',
    title: 'Today',
    description:
      'The clearest next actions across players, relationships and live business.',
  },
  players: {
    eyebrow: 'PLAYER AUTOPILOT',
    title: 'Players',
    description:
      'Protect player service, career timing and active market coverage.',
  },
  market: {
    eyebrow: 'MARKET AUTOPILOT',
    title: 'Market',
    description:
      'Work real club demand, player routes and career-controlled market opportunities.',
  },
  deals: {
    eyebrow: 'DEAL CONTROL',
    title: 'Deals',
    description:
      'Protect momentum, commercial control and the next decision across live deals.',
  },
  relationships: {
    eyebrow: 'RELATIONSHIP AUTOPILOT',
    title: 'Relationships',
    description:
      'Know where real access exists, who can open the door and which club relationships matter now.',
  },
};

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

  const rawRequestedView = String(search.get('view') || 'home');
  const requestedView =
    rawRequestedView === 'opportunities'
      ? 'market'
      : rawRequestedView === 'network'
        ? 'relationships'
        : rawRequestedView;

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
  const viewPresentation = VIEW_PRESENTATION[view];

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

  const rpc = useCallback(
    async <T,>(
      name: string,
      args: Record<string, unknown> = {},
    ): Promise<T> => {
      if (!workspace?.slug) {
        throw new Error('Agency workspace is not resolved.');
      }

      return platformRpc<T>(
        name,
        args,
        workspace.slug,
      );
    },
    [workspace?.slug],
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
        const [home, operations] = await Promise.all([
          rpc<any>('redream_autopilot_home', {
            p_limit: 8,
          }),
          rpc<any>('redream_autopilot_operations', {
            p_horizon_days: 90,
            p_limit: 20,
          }),
        ]);

        setData({ home, operations });
      } else if (view === 'players') {
        setData(
          await rpc<any>('redream_autopilot_players', {
            p_limit: 100,
          }),
        );
      } else if (view === 'market') {
        setData(
          await rpc<any>('redream_autopilot_market', {
            p_limit: 100,
          }),
        );
      } else if (view === 'deals') {
        setData(
          await rpc<any>('redream_autopilot_deals', {
            p_limit: 100,
          }),
        );
      } else if (view === 'relationships') {
        setData(
          await rpc<any>('redream_autopilot_clubs', {
            p_limit: 100,
          }),
        );
      }
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, [invoke, rpc, view, workspace?.tenant_id]);

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
          <div className={styles.pageHeadCopy}>
            <div className={styles.pageHeadTitleLine}>
              <div>
                <p className={styles.eyebrow}>
                  {viewPresentation.eyebrow}
                </p>
                <h1>{viewPresentation.title}</h1>
              </div>
              <span className={styles.workspaceLive}>
                <i />
                Live workspace
              </span>
            </div>
            <p className={styles.pageDescription}>
              {viewPresentation.description}
            </p>
          </div>
          <div className={styles.headActions}>
            <AiLauncher />
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

        {showFirstValueHandoff && view === 'market' ? (
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
                current here, then use Today for the next evidence-backed action.
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
            {view === 'market' ? <Market data={data} /> : null}
            {view === 'deals' ? <Deals data={data} /> : null}
            {view === 'relationships' ? (
              <Relationships data={data} />
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

function WorkspaceIntro({
  eyebrow,
  title,
  copy,
  icon: Icon,
  badge,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  icon: typeof Users;
  badge: string;
}) {
  return (
    <section className={styles.viewIntro}>
      <div className={styles.viewIntroCopy}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      <div className={styles.viewIntroBadge}>
        <Icon size={16} />
        <span>{badge}</span>
      </div>
    </section>
  );
}

function EmptyState({
  icon: Icon,
  title,
  copy,
}: {
  icon: typeof Users;
  title: string;
  copy: string;
}) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyStateIcon}>
        <Icon size={18} />
      </div>
      <strong>{title}</strong>
      <span>{copy}</span>
    </div>
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
  const operations = data?.operations || {};

  const confirm = Array.isArray(home?.attention?.confirm)
    ? home.attention.confirm
    : [];

  const judgement = Array.isArray(home?.attention?.judgement)
    ? home.attention.judgement
    : [];

  const delegable = Array.isArray(home?.attention?.delegable)
    ? home.attention.delegable
    : [];

  const needsYou = [...judgement, ...confirm].sort(
    (a: any, b: any) =>
      Number(b?.priority_score || 0) -
      Number(a?.priority_score || 0),
  );

  const top = needsYou[0] || delegable[0] || null;

  const topOneTap =
    top?.actionability?.mode === 'one_tap' &&
    top?.actionability?.evidence_gate === 'ready';

  const overdueDeadlines = Number(
    operations?.deadlines?.summary?.overdue || 0,
  );

  const completedDelegated = Number(
    home?.delegated_work?.completed_count || 0,
  );

  const activeDelegated = Number(
    home?.delegated_work?.active_count || 0,
  );

  return (
    <div className={styles.stack}>
      <section className={styles.heroCard}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            {top ? 'DO THIS FIRST' : 'OPERATING PICTURE CLEAR'}
          </p>

          <h2>
            {top?.title ||
              'Nothing currently needs your judgement.'}
          </h2>

          <p>
            {top?.recommended_action ||
              top?.why_now ||
              'Autopilot will bring work back when a decision, confirmation or exception genuinely needs a person.'}
          </p>
        </div>

        <div className={styles.heroRight}>
          {top ? (
            <div className={styles.heroMeta}>
              <span>
                {human(top.priority_band || 'review')}
              </span>
              <small>{relativeDate(top.due_at)}</small>
            </div>
          ) : (
            <div className={styles.heroClear}>
              <CheckCircle2 size={18} />
              <span>Under control</span>
            </div>
          )}

          {topOneTap ? (
            <button
              type="button"
              className={styles.heroPrimaryAction}
              onClick={() => onPrepare(top)}
              disabled={Boolean(actionBusy)}
            >
              {actionBusy === top.command_id ? (
                <LoaderCircle
                  size={15}
                  className={styles.spin}
                />
              ) : (
                <ArrowRight size={15} />
              )}
              {top.actionability?.cta || 'Prepare action'}
            </button>
          ) : null}
        </div>
      </section>

      <section className={styles.metrics}>
        <Metric
          label="Needs you"
          value={String(needsYou.length)}
          detail="Judgement or confirmation"
        />

        <Metric
          label="Autopilot can handle"
          value={String(delegable.length)}
          detail="Safe reversible work"
        />

        <Metric
          label="Overdue deadlines"
          value={String(overdueDeadlines)}
          detail="Recorded operating dates"
        />

        <Metric
          label="Delegated work"
          value={String(activeDelegated)}
          detail={`${completedDelegated} completed`}
        />
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>NEEDS YOU</p>
            <h2>Decisions and confirmations</h2>
          </div>

          <span className={styles.sectionCount}>
            {needsYou.length} current
          </span>
        </div>

        <div className={styles.list}>
          {needsYou.slice(0, 8).map((command: any) => (
            <article
              className={styles.listRow}
              key={command.command_id}
            >
              <div className={styles.rank}>
                {command.rank || '•'}
              </div>

              <div className={styles.listCopy}>
                <strong>{command.title}</strong>

                <span>
                  {command.recommended_action ||
                    command.why_now ||
                    'Review the current evidence.'}
                </span>

                <small>
                  {human(command.command_type)} ·{' '}
                  {relativeDate(command.due_at)}
                </small>
              </div>

              <span className={styles.needsInput}>
                {command.actionability?.requires_input
                  ? 'Needs detail'
                  : 'Review'}
              </span>
            </article>
          ))}

          {!needsYou.length ? (
            <EmptyState
              icon={CheckCircle2}
              title="Operating queue is clear"
              copy="Autopilot will surface the next decision or exception when one genuinely requires a person."
            />
          ) : null}
        </div>
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>AUTOPILOT</p>
            <h2>Work Autopilot can prepare</h2>
          </div>

          <span className={styles.sectionCount}>
            {delegable.length} ready
          </span>
        </div>

        <div className={styles.list}>
          {delegable.slice(0, 8).map((command: any) => {
            const oneTap =
              command?.actionability?.mode === 'one_tap' &&
              command?.actionability?.evidence_gate === 'ready';

            return (
              <article
                className={styles.listRow}
                key={command.command_id}
              >
                <div className={styles.rank}>
                  {command.rank || '•'}
                </div>

                <div className={styles.listCopy}>
                  <strong>{command.title}</strong>

                  <span>
                    {command.recommended_action ||
                      command.why_now ||
                      'Safe internal work is ready.'}
                  </span>

                  <small>
                    {human(command.command_type)} ·{' '}
                    {relativeDate(command.due_at)}
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
                      <LoaderCircle
                        size={14}
                        className={styles.spin}
                      />
                    ) : (
                      <ArrowRight size={14} />
                    )}

                    {command.actionability?.cta || 'Prepare'}
                  </button>
                ) : (
                  <span className={styles.needsInput}>
                    Review
                  </span>
                )}
              </article>
            );
          })}

          {!delegable.length ? (
            <EmptyState
              icon={CheckCircle2}
              title="No delegated work waiting"
              copy="Routine work will appear here only when Autopilot has enough evidence to prepare it safely."
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Players({ data }: { data: any }) {
  const service = data?.service || {};
  const items = Array.isArray(service?.players)
    ? service.players
    : [];
  const summary = service?.summary || {};
  const representation = data?.representation_records?.summary || {};
  const relationship = data?.relationship_control?.summary || {};
  const nextPlayerAction = data?.next_player_action || {};

  return (
    <div className={styles.stack}>
      <WorkspaceIntro
        eyebrow="PLAYER AUTOPILOT"
        title="Protect value. Move careers."
        copy={
          nextPlayerAction?.instruction ||
          'A live operating view of player service, career timing, market coverage and preparation gaps.'
        }
        icon={Users}
        badge={`${summary.active_players ?? items.length} players`}
      />

      <section className={styles.metrics}>
        <Metric
          label="Service risk"
          value={String(summary.service_risk || 0)}
          detail={`${summary.urgent_service_queue || 0} urgent`}
        />

        <Metric
          label="Contract critical"
          value={String(summary.contract_critical_window || 0)}
          detail="Recorded contract windows"
        />

        <Metric
          label="Market gaps"
          value={String(summary.market_coverage_gaps || 0)}
          detail="No recorded active coverage"
        />

        <Metric
          label="Representation review"
          value={String(
            representation.records_needing_review || 0,
          )}
          detail={`${representation.missing_representation_records || 0} missing records`}
        />
      </section>

      <section className={styles.cards}>
        {items.map((item: any) => {
          const playerName = item.player?.name || 'Player';

          const serviceState =
            item.service_control?.state ||
            'recorded';

          const nextMove =
            item.next_service_move?.instruction ||
            item.player?.next_action ||
            'No next action recorded';

          const controlFix =
            item.next_control_fix?.instruction ||
            item.next_preparation_fix?.instruction ||
            '';

          const marketState =
            item.market_coverage?.state ||
            'no_market_state';

          const activeDeals = Number(
            item.market_coverage?.active_deals || 0,
          );

          const contractRemaining =
            item.career_timing?.contract_days_remaining;

          const contractDetail =
            item.player?.contract_status === 'free_agent'
              ? 'Free agent'
              : Number.isFinite(Number(contractRemaining))
                ? `${contractRemaining} days recorded`
                : item.player?.contract_expiry
                  ? relativeDate(item.player.contract_expiry)
                  : 'No expiry recorded';

          const serviceGaps = Array.isArray(
            item.service_control?.gaps,
          )
            ? item.service_control.gaps
            : [];

          return (
            <article
              className={styles.card}
              key={item.player_id}
            >
              <div className={styles.entityHeader}>
                <div className={styles.entityMark}>
                  {initials(playerName) || 'P'}
                </div>

                <div className={styles.entityIdentity}>
                  <p className={styles.eyebrow}>
                    PLAYER SERVICE
                  </p>

                  <h2>{playerName}</h2>

                  <p>
                    {human(item.player?.football_status)}
                    {item.player?.agency_priority
                      ? ` · ${human(item.player.agency_priority)} priority`
                      : ''}
                  </p>
                </div>

                <span className={styles.pill}>
                  {human(serviceState)}
                </span>
              </div>

              <div className={styles.facts}>
                <div>
                  <span>Next move</span>
                  <strong>{nextMove}</strong>
                  <small>
                    {relativeDate(item.player?.next_action_due)}
                  </small>
                </div>

                <div>
                  <span>Market coverage</span>
                  <strong>{human(marketState)}</strong>
                  <small>
                    {activeDeals
                      ? `${activeDeals} active recorded deal${activeDeals === 1 ? '' : 's'}`
                      : 'No active deal recorded'}
                  </small>
                </div>

                <div>
                  <span>Career timing</span>
                  <strong>
                    {human(
                      item.career_timing?.market_trigger ||
                        item.player?.contract_status ||
                        'recorded',
                    )}
                  </strong>
                  <small>{contractDetail}</small>
                </div>
              </div>

              {controlFix ? (
                <div className={styles.reason}>
                  {controlFix}
                </div>
              ) : null}

              {!controlFix && serviceGaps[0] ? (
                <div className={styles.reason}>
                  {human(serviceGaps[0])}
                </div>
              ) : null}
            </article>
          );
        })}

        {!items.length ? (
          <EmptyState
            icon={Users}
            title="No players recorded yet"
            copy="Once the first player is active, their service position and live business will appear here."
          />
        ) : null}
      </section>

      {Number(
        relationship.immediate_service_interventions || 0,
      ) > 0 ? (
        <section className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>
                PLAYER RELATIONSHIPS
              </p>
              <h2>Service interventions</h2>
            </div>

            <span className={styles.sectionCount}>
              {relationship.immediate_service_interventions} current
            </span>
          </div>

          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>
              <CircleAlert size={18} />
            </div>

            <strong>
              Protect the player relationship before lower-value admin.
            </strong>

            <span>
              These are operational service exceptions based on recorded
              ownership, actions, requests and coverage. They are not a
              measure of player satisfaction or agent quality.
            </span>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Relationships({ data }: { data: any }) {
  const accounts = data?.accounts || {};
  const items = Array.isArray(accounts?.clubs)
    ? accounts.clubs
    : [];
  const summary = accounts?.summary || {};
  const nextClubAction = data?.next_club_action || {};

  return (
    <div className={styles.stack}>
      <WorkspaceIntro
        eyebrow="RELATIONSHIP AUTOPILOT"
        title="Know who can move the conversation."
        copy={
          nextClubAction?.instruction ||
          'Direct access, warm introductions, current demand and live commercial relevance in one relationship view.'
        }
        icon={Network}
        badge={`${summary.relevant_clubs ?? items.length} relevant clubs`}
      />

      <section className={styles.metrics}>
        <Metric
          label="Relevant clubs"
          value={String(summary.relevant_clubs ?? items.length)}
          detail="Accounts with current relevance"
        />
        <Metric
          label="Live deal clubs"
          value={String(summary.clubs_with_active_deals || 0)}
          detail="Commercial relationships to protect"
        />
        <Metric
          label="Confirmed demand"
          value={String(summary.clubs_with_confirmed_demand || 0)}
          detail="Recorded confirmed club needs"
        />
        <Metric
          label="Warm introductions"
          value={String(
            summary.live_accounts_with_strong_introduction_option || 0,
          )}
          detail="Strong recorded introduction routes"
        />
      </section>

      <section className={styles.cards}>
        {items.map((item: any) => {
          const clubName = item.name || 'Club';
          const access = item.access || {};
          const demand = item.demand || {};
          const commercial = item.commercial || {};
          const topPlay = item.top_play || {};

          const useIntroduction =
            Number(access.introduction_score || 0) >
            Number(access.direct_score || 0);

          const routeName = useIntroduction
            ? access.introduction_via || 'Warm introduction'
            : access.best_direct_contact || 'No recorded contact';

          const routeDetail = useIntroduction
            ? access.introduction_target
              ? `Introduction to ${access.introduction_target}`
              : 'Recorded introduction route'
            : access.best_direct_role ||
              human(access.direct_state || 'recorded access');

          return (
            <article
              className={styles.card}
              key={item.organisation_id}
            >
              <div className={styles.entityHeader}>
                <div className={styles.entityMark}>
                  {initials(clubName) || 'C'}
                </div>

                <div className={styles.entityIdentity}>
                  <p className={styles.eyebrow}>
                    {human(
                      item.account_state ||
                        'relationship recorded',
                    )}
                  </p>
                  <h2>{clubName}</h2>
                  <p>
                    {[item.city, item.country]
                      .filter(Boolean)
                      .join(', ')}
                    {item.league_name
                      ? ` · ${item.league_name}`
                      : ''}
                  </p>
                </div>

                <span className={styles.pill}>
                  {useIntroduction
                    ? 'Warm introduction'
                    : human(
                        access.direct_state ||
                          'Recorded access',
                      )}
                </span>
              </div>

              <div className={styles.facts}>
                <div>
                  <span>Best route</span>
                  <strong>{routeName}</strong>
                  <small>{routeDetail}</small>
                </div>

                <div>
                  <span>Current demand</span>
                  <strong>
                    {demand.active_needs || 0} active
                  </strong>
                  <small>
                    {demand.confirmed_needs || 0} confirmed
                  </small>
                </div>

                <div>
                  <span>Live business</span>
                  <strong>
                    {commercial.active_deals || 0} active
                  </strong>
                  <small>
                    {commercial.deals_needing_action || 0} need action
                  </small>
                </div>
              </div>

              {topPlay.recommended_action ? (
                <div className={styles.reason}>
                  {topPlay.recommended_action}
                </div>
              ) : null}
            </article>
          );
        })}

        {!items.length ? (
          <EmptyState
            icon={Network}
            title="No relevant club relationships yet"
            copy="Recorded contacts, access routes, club demand and commercial activity will build this view."
          />
        ) : null}
      </section>
    </div>
  );
}

function Market({ data }: { data: any }) {
  const demand = data?.demand || {};
  const needs = Array.isArray(demand?.items)
    ? demand.items
    : [];

  const pursuits = Array.isArray(data?.pursuits?.items)
    ? data.pursuits.items
    : [];

  const demandSummary = demand?.summary || {};
  const pitchSummary = data?.pitch_readiness?.summary || {};
  const pursuitSummary = data?.pursuits?.summary || {};
  const nextMarketAction = data?.next_market_action || {};

  return (
    <div className={styles.stack}>
      <WorkspaceIntro
        eyebrow="MARKET AUTOPILOT"
        title="Find the route worth moving."
        copy={
          nextMarketAction?.instruction ||
          'Club demand, player fit, career control and relationship access in one market operating view.'
        }
        icon={Target}
        badge={`${demandSummary.active_needs ?? needs.length} active needs`}
      />

      <section className={styles.metrics}>
        <Metric
          label="Active needs"
          value={String(
            demandSummary.active_needs ?? needs.length,
          )}
          detail="Recorded club demand"
        />

        <Metric
          label="Roster gaps"
          value={String(demandSummary.roster_gaps || 0)}
          detail="Needs without a recorded roster route"
        />

        <Metric
          label="Live pursuits"
          value={String(
            pursuitSummary.pursuit_count ?? pursuits.length,
          )}
          detail="Recorded player-club routes"
        />

        <Metric
          label="Career holds"
          value={String(pitchSummary.career_holds || 0)}
          detail="Human-owned strategy required"
        />
      </section>

      <div className={styles.opportunityColumns}>
        <section
          className={`${styles.sectionCard} ${styles.opportunityPanel}`}
        >
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>CLUB DEMAND</p>
              <h2>Needs worth acting on</h2>
            </div>

            <span className={styles.sectionCount}>
              {needs.length} active
            </span>
          </div>

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
                <article
                  className={styles.listRow}
                  key={item.club_need_id}
                >
                  <div className={styles.rank}>
                    {item.command_rank || '•'}
                  </div>

                  <div className={styles.listCopy}>
                    <strong>
                      {item.club?.name} · {item.need?.title}
                    </strong>

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
                          <b>
                            {candidate.player_name || 'Player'}
                          </b>

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
                      {item.candidate_coverage
                        ?.recorded_candidates || 0}
                    </strong>
                    <small>candidates</small>
                  </div>
                </article>
              );
            })}

            {!needs.length ? (
              <EmptyState
                icon={Target}
                title="No active club demand"
                copy="Recorded club needs will appear here with route coverage and candidate context."
              />
            ) : null}
          </div>
        </section>

        <section
          className={`${styles.sectionCard} ${styles.opportunityPanel}`}
        >
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>
                PLAYER-CLUB ROUTES
              </p>
              <h2>Pursuits needing judgement</h2>
            </div>

            <span className={styles.sectionCount}>
              {pursuits.length} recorded
            </span>
          </div>

          <div className={styles.list}>
            {pursuits.map((item: any) => {
              const accessMode =
                item.access_strategy?.recommended_mode ||
                item.best_access_route?.route_state ||
                'recorded_route';

              const nextAction =
                item.career_strategy_gate?.next_action
                  ?.instruction ||
                item.best_access_route?.why_this_route ||
                'Review the pursuit evidence.';

              return (
                <article
                  className={styles.listRow}
                  key={item.player_match_id}
                >
                  <div className={styles.rank}>
                    {item.rank || '•'}
                  </div>

                  <div className={styles.listCopy}>
                    <strong>
                      {item.player?.name || 'Player'} →{' '}
                      {item.club?.name || 'Club'}
                    </strong>

                    <span>{nextAction}</span>

                    <small>
                      {human(item.readiness_state)} ·{' '}
                      {careerGateLabel(
                        item.career_strategy_gate?.state,
                      )}{' '}
                      · {human(accessMode)}
                    </small>
                  </div>

                  <div className={styles.sideStat}>
                    <strong>
                      {human(
                        item.pursuit_operating_mode ||
                          'review',
                      )}
                    </strong>
                    <small>operating state</small>
                  </div>
                </article>
              );
            })}

            {!pursuits.length ? (
              <EmptyState
                icon={Target}
                title="No active player-club pursuits"
                copy="Recorded player routes will appear here only when real club demand and player context exist."
              />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function Deals({ data }: { data: any }) {
  const portfolio = data?.portfolio || {};

  const deals = Array.isArray(portfolio?.deals)
    ? portfolio.deals
    : [];

  const summary = portfolio?.summary || {};
  const risk = data?.commercial_risk || {};
  const nextDealAction = data?.next_deal_action || {};

  return (
    <div className={styles.stack}>
      <WorkspaceIntro
        eyebrow="DEAL CONTROL"
        title="Move the deal, not the admin."
        copy={
          nextDealAction?.instruction ||
          'Live commercial work ordered around ownership, momentum, evidence and the next recorded decision.'
        }
        icon={BriefcaseBusiness}
        badge={`${summary.active_deals ?? deals.length} active deals`}
      />

      <section className={styles.metrics}>
        <Metric
          label="Active deals"
          value={String(
            summary.active_deals ?? deals.length,
          )}
          detail="Recorded live deal rooms"
        />

        <Metric
          label="Stage reviews"
          value={String(summary.stage_reviews_due || 0)}
          detail="Recorded reviews due"
        />

        <Metric
          label="Recovery"
          value={String(
            (summary.momentum_recovery_deals || 0) +
              (summary.commercial_rescue_deals || 0),
          )}
          detail="Cooling or stalled work"
        />

        <Metric
          label="Negotiation prep"
          value={String(
            summary.negotiation_preparation_required_count || 0,
          )}
          detail="Recorded preparation gaps"
        />
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>LIVE DEALS</p>
            <h2>Commercial pipeline</h2>
          </div>

          <span className={styles.sectionCount}>
            {deals.length} live
          </span>
        </div>

        <div className={styles.list}>
          {deals.map((deal: any) => {
            const nextMove =
              deal.next_best_move?.instruction ||
              deal.next_control_fix?.instruction ||
              deal.next_decision ||
              'Review the deal.';

            return (
              <article
                className={styles.listRow}
                key={deal.deal_room_id}
              >
                <div className={styles.rank}>
                  {deal.rank || '•'}
                </div>

                <div className={styles.listCopy}>
                  <strong>{deal.title}</strong>

                  <span>{nextMove}</span>

                  <small>
                    {human(deal.stage)} ·{' '}
                    {deal.organisation || 'Club'} ·{' '}
                    {deal.currency
                      ? money(
                          deal.expected_commission,
                          deal.currency,
                        )
                      : 'Commission not recorded'}
                  </small>
                </div>

                <div className={styles.sideStat}>
                  <strong>
                    {human(
                      deal.momentum_state || 'recorded',
                    )}
                  </strong>

                  <small>
                    {human(
                      deal.control_state ||
                        deal.rescue_state ||
                        'control recorded',
                    )}
                  </small>
                </div>
              </article>
            );
          })}

          {!deals.length ? (
            <EmptyState
              icon={BriefcaseBusiness}
              title="No live deals recorded"
              copy="Active deal rooms will appear here with their next recorded decision and commercial context."
            />
          ) : null}
        </div>
      </section>

      {Number(
        risk?.summary?.red_intervention_deals || 0,
      ) > 0 ||
      Number(
        risk?.summary?.amber_recovery_deals || 0,
      ) > 0 ? (
        <section className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>
                COMMERCIAL CONTROL
              </p>
              <h2>Deals needing recovery</h2>
            </div>

            <span className={styles.sectionCount}>
              {Number(
                risk?.summary?.red_intervention_deals || 0,
              ) +
                Number(
                  risk?.summary?.amber_recovery_deals || 0,
                )}{' '}
              current
            </span>
          </div>

          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>
              <CircleAlert size={18} />
            </div>

            <strong>
              Protect momentum before adding more pipeline.
            </strong>

            <span>
              Recovery states use recorded evidence, control,
              momentum and access. They do not change recorded deal
              probability or forecast a result.
            </span>
          </div>
        </section>
      ) : null}
    </div>
  );
}
