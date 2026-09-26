'use client';

import AiLauncher from '@/components/AiLauncher';
import AgencyCreateDrawer, {
  type AgencyCreateKind,
} from '@/components/AgencyCreateDrawer';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  BriefcaseBusiness,
  CakeSlice,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Coins,
  LoaderCircle,
  Home as HomeIcon,
  LogOut,
  Network,
  Plus,
  PlugZap,
  RefreshCw,
  Search,
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
import AgencyActionDrawer, {
  type AgencyActionRequest,
} from '@/components/AgencyActionDrawer';
import AgencyContactIntelligenceDrawer from '@/components/AgencyContactIntelligenceDrawer';
import AgencyEntityIntelligenceDrawer, {
  type AgencyIntelligenceRequest,
} from '@/components/AgencyEntityIntelligenceDrawer';
import AgencyPursuitRoom, {
  type AgencyPursuitRequest,
} from '@/components/AgencyPursuitRoom';
import AgencyOwnerCommandCentre from '@/components/AgencyOwnerCommandCentre';
import AgencyMemoryDrawer from '@/components/AgencyMemoryDrawer';
import AgencyDealCloseoutDrawer, {
  type AgencyDealCloseoutRequest,
} from '@/components/AgencyDealCloseoutDrawer';
import AgencyClubAccountDrawer, {
  type AgencyClubAccountRequest,
} from '@/components/AgencyClubAccountDrawer';
import AgencyNegotiationCommandRoom, {
  type AgencyNegotiationRequest,
} from '@/components/AgencyNegotiationCommandRoom';
import AgencyPlayerServiceReviewDrawer, {
  type AgencyPlayerServiceReviewRequest,
} from '@/components/AgencyPlayerServiceReviewDrawer';
import AgencyPlayersWorkspace from '@/components/AgencyPlayersWorkspace';
import AgencyPlayerProfile from '@/components/AgencyPlayerProfile';
import AgencyNetworkWorkspace from '@/components/AgencyNetworkWorkspace';
import AgencyOpportunitiesWorkspace from '@/components/AgencyOpportunitiesWorkspace';
import AgencyCalendarWorkspace from '@/components/AgencyCalendarWorkspace';
import AgencyConnectionsDrawer from '@/components/AgencyConnectionsDrawer';

import styles from './AgencyOperatingWorkspace.module.css';

type View = 'home' | 'players' | 'opportunities' | 'network' | 'calendar' | 'business';

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
  { key: 'home', label: 'Home', icon: HomeIcon },
  { key: 'players', label: 'Players', icon: Users },
  { key: 'opportunities', label: 'Opportunities', icon: Target },
  { key: 'network', label: 'Network', icon: Network },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'business', label: 'Business', icon: Coins },
];

const VIEW_PRESENTATION: Record<
  View,
  { eyebrow: string; title: string; description: string }
> = {
  home: {
    eyebrow: 'HOME',
    title: 'Home',
    description:
      'What needs your attention.',
  },
  players: {
    eyebrow: 'PLAYERS',
    title: 'Players',
    description:
      'Your players, recruitment and the next decisions around them.',
  },
  opportunities: {
    eyebrow: 'OPPORTUNITIES',
    title: 'Opportunities',
    description:
      'Club need, player fit, relationship and next action.',
  },
  network: {
    eyebrow: 'NETWORK',
    title: 'Network',
    description:
      'The clubs and people that move opportunities.',
  },
  calendar: {
    eyebrow: 'CALENDAR',
    title: 'Calendar',
    description:
      'Meetings, follow-ups and deadlines in one place.',
  },
  business: {
    eyebrow: 'BUSINESS',
    title: 'Business',
    description:
      'Money, live business and the agency position.',
  },
};

const ALLOWED_ROLES = ['owner', 'admin', 'agent', 'operations'];

const commandWorkingView = (command: any): View => {
  const source = String(command?.source_type || '');

  if (
    source === 'deal_room' ||
    source === 'club_need' ||
    source === 'player_match'
  ) {
    return 'opportunities';
  }

  if (source === 'player') return 'players';

  if (
    source === 'organisation' ||
    source === 'person' ||
    source === 'relationship'
  ) {
    return 'network';
  }

  return 'home';
};

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
  if (state.startsWith('hold_')) return 'Player decision needed';
  return human(state);
};

export default function AgencyOperatingWorkspace() {
  const runtime = useTenantRuntime();
  const params = useParams<{ tenantSlug?: string }>();
  const search = useSearchParams();

  const rawRequestedView = String(search.get('view') || 'home');
  const requestedView =
    rawRequestedView === 'market' ||
    rawRequestedView === 'deals'
      ? 'opportunities'
      : rawRequestedView === 'relationships'
        ? 'network'
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

  const selectedPlayerId =
    view === 'players'
      ? String(search.get('player') || '').trim()
      : '';

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
  const [actionRequest, setActionRequest] =
    useState<AgencyActionRequest | null>(null);
  const [intelligenceRequest, setIntelligenceRequest] =
    useState<AgencyIntelligenceRequest | null>(null);
  const [pursuitRequest, setPursuitRequest] =
    useState<AgencyPursuitRequest | null>(null);
  const [ownerCommandOpen, setOwnerCommandOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [dealCloseoutRequest, setDealCloseoutRequest] =
    useState<AgencyDealCloseoutRequest | null>(null);
  const [clubAccountRequest, setClubAccountRequest] =
    useState<AgencyClubAccountRequest | null>(null);
  const [negotiationRequest, setNegotiationRequest] =
    useState<AgencyNegotiationRequest | null>(null);
  const [playerServiceReviewRequest, setPlayerServiceReviewRequest] =
    useState<AgencyPlayerServiceReviewRequest | null>(null);
  const [rosterImportOpen, setRosterImportOpen] = useState(false);
  const [createKind, setCreateKind] =
    useState<AgencyCreateKind | null>(null);
  const [showFirstValueHandoff, setShowFirstValueHandoff] = useState(
    () => search.get('handoff') === 'first-value',
  );
  const [connectionsOpen, setConnectionsOpen] = useState(
    () => search.get('connections') === '1',
  );

  const workspaceName =
    workspace?.display_name ||
    runtime.branding.display_name ||
    'Agency workspace';
  const viewPresentation = VIEW_PRESENTATION[view];
  const canSeeBusiness = ['owner', 'admin'].includes(
    String(workspace?.role || ''),
  );
  const navigation = NAV.filter(
    (item) => item.key !== 'business' || canSeeBusiness,
  );

  const createAction:
    | { kind: AgencyCreateKind; label: string }
    | null =
    view === 'players' && !selectedPlayerId
      ? { kind: 'player', label: 'Add player' }
      : view === 'opportunities'
        ? { kind: 'club_need', label: 'Add opportunity' }
        : view === 'network'
          ? { kind: 'contact', label: 'Add contact' }
          : null;

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

  const marketInvoke = useCallback(
    async <T,>(
      action: string,
      body: Record<string, unknown> = {},
    ): Promise<T> => {
      if (!workspace?.tenant_id) {
        throw new Error('Agency workspace is not resolved.');
      }

      return platformInvoke<T>('agency-market', {
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
        const reads = await Promise.allSettled([
          rpc<any>('redream_autopilot_home', {
            p_limit: 8,
          }),
          rpc<any>('redream_autopilot_operations', {
            p_horizon_days: 90,
            p_limit: 20,
          }),
          rpc<any>('redream_autopilot_players', {
            p_limit: 12,
          }),
          rpc<any>('redream_autopilot_market', {
            p_limit: 12,
          }),
          rpc<any>('redream_autopilot_deals', {
            p_limit: 12,
          }),
        ]);

        if (reads[0].status === 'rejected') {
          throw reads[0].reason;
        }

        const readValue = (
          index: number,
          fallback: any = {},
        ) =>
          reads[index]?.status === 'fulfilled'
            ? (reads[index] as PromiseFulfilledResult<any>).value
            : fallback;

        const home = readValue(0);
        const operations = readValue(1);
        const players = readValue(2);
        const market = readValue(3);
        const deals = readValue(4);

        let ownerBusiness: any = null;

        if (
          ['owner', 'admin'].includes(
            String(workspace?.role || ''),
          )
        ) {
          const results = await Promise.allSettled([
            invoke<any>('agency_control_centre'),
            invoke<any>('agency_roi_proof', {
              window_days: 30,
            }),
            invoke<any>('receivables_command', {
              horizon_days: 90,
              limit: 100,
            }),
          ]);

          const value = (
            index: number,
            key: string,
          ) =>
            results[index]?.status ===
            'fulfilled'
              ? (results[index] as PromiseFulfilledResult<any>)
                  .value?.[key] || null
              : null;

          ownerBusiness = {
            control: value(0, 'control_centre'),
            roi: value(1, 'roi'),
            receivables: value(
              2,
              'receivables',
            ),
          };
        }

        setData({
          home,
          operations,
          players,
          market,
          deals,
          owner_business: ownerBusiness,
        });
      } else if (view === 'players') {
        const reads = await Promise.allSettled([
          invoke<any>('players_workspace', { limit: 100 }),
          invoke<any>('recruitment_board', { limit: 250 }),
        ]);

        if (reads[0].status === 'rejected') throw reads[0].reason;

        setData({
          directory:
            reads[0].status === 'fulfilled'
              ? reads[0].value?.players || {}
              : {},
          recruitment:
            reads[1].status === 'fulfilled'
              ? reads[1].value?.recruitment || {}
              : {},
        });
      } else if (view === 'opportunities') {
        const [market, deals] = await Promise.all([
          rpc<any>('redream_autopilot_market', {
            p_limit: 100,
          }),
          rpc<any>('redream_autopilot_deals', {
            p_limit: 100,
          }),
        ]);

        setData({ market, deals });
      } else if (view === 'network') {
        setData(
          await rpc<any>('redream_autopilot_relationships', {
            p_limit: 100,
            p_contact_limit: 250,
          }),
        );
      } else if (view === 'calendar') {
        setData(
          await rpc<any>('redream_autopilot_calendar', {
            p_horizon_days: 90,
            p_limit: 100,
          }),
        );
      } else if (view === 'business') {
        if (
          !['owner', 'admin'].includes(
            String(workspace?.role || ''),
          )
        ) {
          setData(null);
          setError(
            'Business is available to agency owners and administrators.',
          );
        } else {
          const results = await Promise.allSettled([
            invoke<any>('agency_control_centre'),
            invoke<any>('agency_roi_proof', {
              window_days: 30,
            }),
            invoke<any>('receivables_command', {
              horizon_days: 90,
              limit: 100,
            }),
          ]);

          const value = (
            index: number,
            key: string,
          ) =>
            results[index]?.status === 'fulfilled'
              ? (results[index] as PromiseFulfilledResult<any>)
                  .value?.[key] || null
              : null;

          setData({
            owner_business: {
              control: value(0, 'control_centre'),
              roi: value(1, 'roi'),
              receivables: value(2, 'receivables'),
            },
          });
        }
      }
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setBusy(false);
    }
  }, [invoke, rpc, view, workspace?.role, workspace?.tenant_id]);

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
    if (search.get('connections') === '1') {
      setConnectionsOpen(true);
    }
  }, [search]);

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

  const openCommandAction = (command: any) => {
    const destination = commandWorkingView(command);

    const fallbackHref =
      destination === 'home'
        ? basePath
        : `${basePath}?view=${destination}`;

    setActionRequest({
      key: `command:${String(command?.command_id || 'review')}`,
      eyebrow: human(
        command?.command_type || 'Agency action',
      ),
      title:
        command?.title ||
        'Agency action',
      instruction:
        command?.recommended_action ||
        command?.why_now ||
        'Review the current evidence and decide the next step.',
      label:
        command?.actionability?.cta ||
        (command?.actionability?.requires_input
          ? 'Continue action'
          : 'Prepare action'),
      action: 'action_prepare',
      payload: {
        command_id: command?.command_id,
      },
      context: command?.due_at
        ? relativeDate(command.due_at)
        : null,
      facts: [
        {
          label: 'Type',
          value: human(
            command?.command_type ||
              'Agency action',
          ),
        },
        {
          label: 'Priority',
          value: human(
            command?.priority_band ||
              'Review',
          ),
        },
        {
          label: 'Due',
          value: command?.due_at
            ? relativeDate(command.due_at)
            : 'No deadline recorded',
        },
      ],
      fallbackHref,
      fallbackLabel:
        destination === 'home'
          ? 'Return to Today'
          : `Open ${NAV.find((item) => item.key === destination)?.label || 'working area'}`,
    });
  };

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
          {navigation.map((item) => {
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
                <h1>{viewPresentation.title}</h1>
              </div>
            </div>
            <p className={styles.pageDescription}>
              {viewPresentation.description}
            </p>
          </div>
          <div className={styles.headActions}>
            <AiLauncher />
            <button
              type="button"
              className={styles.refresh}
              onClick={() => setConnectionsOpen(true)}
              title="Connections"
            >
              <PlugZap size={15} />
              Connections
            </button>
            {createAction ? (
              <button
                type="button"
                className={styles.createButton}
                onClick={() => setCreateKind(createAction.kind)}
              >
                <Plus size={15} />
                {createAction.label}
              </button>
            ) : null}
            {view === 'players' &&
            ['owner', 'admin', 'operations'].includes(
              workspace.role,
            ) ? (
              <button
                type="button"
                className={styles.refresh}
                onClick={() => setRosterImportOpen(true)}
              >
                Import players
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
                Your player, club contact and live opportunity are now connected.
                Keep the opportunity current here, then use Today to see what
                matters next.
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
                onOpenAction={openCommandAction}
              />
            ) : null}
            {view === 'players' ? (
              selectedPlayerId ? (
                <AgencyPlayerProfile
                  key={`player-profile:${selectedPlayerId}`}
                  playerId={selectedPlayerId}
                  backHref={`${basePath}?view=players`}
                  role={String(workspace?.role || '')}
                  fallbackAgency={runtime.branding}
                  invoke={(action, body) => invoke<any>(action, body)}
                  onOpenIntelligence={(playerId, title, context) =>
                    setIntelligenceRequest({
                      key: `player-360:${playerId}`,
                      kind: 'player',
                      entityId: playerId,
                      title,
                      context,
                    })
                  }
                />
              ) : (
                <AgencyPlayersWorkspace
                  data={data}
                  basePath={basePath}
                  invoke={(action, body) => invoke<any>(action, body)}
                  onRefresh={loadView}
                  onOpenAction={(request) => setActionRequest(request)}
                />
              )
            ) : null}
            {view === 'opportunities' ? (
              <AgencyOpportunitiesWorkspace
                data={data}
                onOpenAction={(request) =>
                  setActionRequest(request)
                }
                onOpenPursuit={setPursuitRequest}
                onOpenIntelligence={setIntelligenceRequest}
              />
            ) : null}
            {view === 'network' ? (
              <AgencyNetworkWorkspace
                data={data}
                rpc={rpc}
                onRefresh={loadView}
                onOpenAction={(request) =>
                  setActionRequest(request)
                }
                onOpenClubAccount={setClubAccountRequest}
              />
            ) : null}
            {view === 'calendar' ? (
              <AgencyCalendarWorkspace
                data={data}
                basePath={basePath}
              />
            ) : null}
            {view === 'business' && canSeeBusiness ? (
              <Business
                data={data}
                onOpenOwner={() => setOwnerCommandOpen(true)}
              />
            ) : null}
          </>
        ) : null}
      </main>

      {connectionsOpen ? (
        <AgencyConnectionsDrawer
          key={`connections:${workspace.slug}`}
          workspaceSlug={workspace.slug}
          onClose={() => setConnectionsOpen(false)}
        />
      ) : null}

      {createKind ? (
        <AgencyCreateDrawer
          key={`create:${createKind}`}
          kind={createKind}
          invoke={(action, body) => invoke<any>(action, body)}
          onClose={() => setCreateKind(null)}
          onCreated={async () => {
            await loadView();
          }}
        />
      ) : null}

      {actionRequest ? (
        <AgencyActionDrawer
          key={actionRequest.key}
          request={actionRequest}
          invoke={(action, body) =>
            invoke<any>(action, body)
          }
          onClose={() => setActionRequest(null)}
          onApplied={async () => {
            await loadView();
          }}
        />
      ) : null}

      {intelligenceRequest ? (
        <AgencyEntityIntelligenceDrawer
          key={intelligenceRequest.key}
          request={intelligenceRequest}
          invoke={(action, body) => invoke<any>(action, body)}
          onClose={() => setIntelligenceRequest(null)}
          onOpenAction={(request) => {
            setIntelligenceRequest(null);
            setActionRequest(request);
          }}
          onOpenCloseout={(dealRoomId, title, context) => {
            setIntelligenceRequest(null);
            setDealCloseoutRequest({
              key: `deal-closeout:${dealRoomId}`,
              dealRoomId,
              title,
              context,
            });
          }}
          onOpenNegotiation={(dealRoomId, title, context) => {
            setIntelligenceRequest(null);
            setNegotiationRequest({
              key: `negotiation-room:${dealRoomId}`,
              dealRoomId,
              title,
              context,
            });
          }}
          onOpenPlayerReview={(playerId, title, context) => {
            setIntelligenceRequest(null);
            setPlayerServiceReviewRequest({
              key: `player-service-review:${playerId}`,
              playerId,
              title,
              context,
            });
          }}
        />
      ) : null}

      {pursuitRequest ? (
        <AgencyPursuitRoom
          key={pursuitRequest.key}
          request={pursuitRequest}
          role={String(workspace?.role || '')}
          marketData={data}
          invoke={(action, body) =>
            marketInvoke<any>(action, body)
          }
          onClose={() => setPursuitRequest(null)}
          onOpenAction={(request) => {
            setPursuitRequest(null);
            setActionRequest(request);
          }}
          onOpenDeal={(dealRoomId, title, context) => {
            setPursuitRequest(null);
            setIntelligenceRequest({
              key: `deal-war-room:${dealRoomId}`,
              kind: 'deal',
              entityId: dealRoomId,
              title,
              context,
            });
          }}
          onApplied={async () => {
            await loadView();
          }}
        />
      ) : null}

      {playerServiceReviewRequest ? (
        <AgencyPlayerServiceReviewDrawer
          key={playerServiceReviewRequest.key}
          request={playerServiceReviewRequest}
          invoke={(action, body) => invoke<any>(action, body)}
          onClose={() => setPlayerServiceReviewRequest(null)}
          onOpenAction={(request) => {
            setPlayerServiceReviewRequest(null);
            setActionRequest(request);
          }}
          onApplied={async () => {
            await loadView();
          }}
        />
      ) : null}

      {negotiationRequest ? (
        <AgencyNegotiationCommandRoom
          key={negotiationRequest.key}
          request={negotiationRequest}
          role={String(workspace?.role || '')}
          invoke={(action, body) => invoke<any>(action, body)}
          onClose={() => setNegotiationRequest(null)}
          onOpenAction={(request) => {
            setNegotiationRequest(null);
            setActionRequest(request);
          }}
          onApplied={async () => {
            await loadView();
          }}
        />
      ) : null}

      {clubAccountRequest ? (
        <AgencyClubAccountDrawer
          key={clubAccountRequest.key}
          request={clubAccountRequest}
          invoke={(action, body) => invoke<any>(action, body)}
          onClose={() => setClubAccountRequest(null)}
          onOpenAction={(request) => {
            setClubAccountRequest(null);
            setActionRequest(request);
          }}
          onOpenDeal={(dealRoomId, title, context) => {
            setClubAccountRequest(null);
            setIntelligenceRequest({
              key: `deal-war-room:${dealRoomId}`,
              kind: 'deal',
              entityId: dealRoomId,
              title,
              context,
            });
          }}
          onOpenMarket={() => {
            setClubAccountRequest(null);
            window.history.pushState(
              window.history.state,
              '',
              `${basePath}?view=opportunities`,
            );
          }}
          onOpenPursuit={(request) => {
            setClubAccountRequest(null);
            setPursuitRequest(request);
          }}
          onOpenPlayer={(playerId) => {
            setClubAccountRequest(null);
            window.history.pushState(
              window.history.state,
              '',
              `${basePath}?view=players&player=${encodeURIComponent(
                playerId,
              )}`,
            );
          }}
        />
      ) : null}

      {dealCloseoutRequest ? (
        <AgencyDealCloseoutDrawer
          key={dealCloseoutRequest.key}
          request={dealCloseoutRequest}
          role={String(workspace?.role || '')}
          invoke={(action, body) => invoke<any>(action, body)}
          onClose={() => setDealCloseoutRequest(null)}
          onApplied={async () => {
            await loadView();
          }}
        />
      ) : null}

      {memoryOpen ? (
        <AgencyMemoryDrawer
          invoke={(action, body) => invoke<any>(action, body)}
          onClose={() => setMemoryOpen(false)}
          onApplied={async () => {
            await loadView();
          }}
        />
      ) : null}

      {ownerCommandOpen && data?.owner_business ? (
        <AgencyOwnerCommandCentre
          data={data.owner_business}
          onClose={() => setOwnerCommandOpen(false)}
          onOpenDeal={(dealRoomId, title, context) => {
            setOwnerCommandOpen(false);
            setIntelligenceRequest({
              key: `deal-war-room:${dealRoomId}`,
              kind: 'deal',
              entityId: dealRoomId,
              title,
              context,
            });
          }}
          onOpenAction={(request) => {
            setOwnerCommandOpen(false);
            setActionRequest(request);
          }}
        />
      ) : null}

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
              Nothing changes until you confirm. The latest recorded
              information will be checked again first.
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
  onOpenAction,
}: {
  data: any;
  actionBusy: string;
  onPrepare: (command: any) => void;
  onOpenAction: (command: any) => void;
}) {
  const [greeting, setGreeting] = useState('Good to see you.');

  useEffect(() => {
    const hour = new Date().getHours();

    setGreeting(
      hour < 12
        ? 'Good morning.'
        : hour < 18
          ? 'Good afternoon.'
          : 'Good evening.',
    );
  }, []);

  const home = data?.home || {};
  const operations = data?.operations || {};
  const playerService = data?.players?.service || {};
  const market = data?.market || {};
  const dealData = data?.deals || {};
  const ownerBusiness = data?.owner_business || null;

  const confirm = Array.isArray(home?.attention?.confirm)
    ? home.attention.confirm
    : [];

  const judgement = Array.isArray(home?.attention?.judgement)
    ? home.attention.judgement
    : [];

  const delegable = Array.isArray(home?.attention?.delegable)
    ? home.attention.delegable
    : [];

  const priority = [...judgement, ...confirm, ...delegable]
    .filter(
      (command: any, index: number, source: any[]) =>
        source.findIndex(
          (candidate: any) =>
            String(candidate?.command_id || '') ===
            String(command?.command_id || ''),
        ) === index,
    )
    .sort(
      (a: any, b: any) =>
        Number(b?.priority_score || 0) -
        Number(a?.priority_score || 0),
    )
    .slice(0, 5);

  const deadlines = Array.isArray(
    operations?.deadlines?.items,
  )
    ? operations.deadlines.items
    : [];

  const birthdays = Array.isArray(
    operations?.important_dates?.birthdays?.items,
  )
    ? operations.important_dates.birthdays.items
    : [];

  const dayItems = [
    ...deadlines.map((item: any) => ({
      ...item,
      calendar_kind: 'deadline',
    })),
    ...birthdays.map((item: any) => ({
      ...item,
      calendar_kind: 'birthday',
      deadline_at: item?.date_at,
      deadline_state: item?.date_state,
      context: {
        player_id: item?.player_id,
        player_name: item?.player_name,
        turns_age: item?.turns_age,
      },
    })),
  ].sort((a: any, b: any) => {
    const aTime = Date.parse(
      String(a?.deadline_at || ''),
    );
    const bTime = Date.parse(
      String(b?.deadline_at || ''),
    );

    if (!Number.isFinite(aTime)) return 1;
    if (!Number.isFinite(bTime)) return -1;
    return aTime - bTime;
  });

  const players = Array.isArray(playerService?.players)
    ? playerService.players
    : [];

  const marketNeeds = Array.isArray(market?.demand?.items)
    ? market.demand.items
    : [];

  const pursuits = Array.isArray(market?.pursuits?.items)
    ? market.pursuits.items
    : [];

  const liveDeals = Array.isArray(
    dealData?.portfolio?.deals,
  )
    ? dealData.portfolio.deals
    : [];

  const opportunityMoves = [
    ...liveDeals.map((deal: any) => ({
      key: `deal:${deal.deal_room_id}`,
      type: 'Live deal',
      title: deal.title || 'Live deal',
      detail:
        deal.next_control_fix?.instruction ||
        deal.next_best_move?.instruction ||
        deal.next_decision ||
        'Review the live deal.',
      meta:
        [deal.organisation, human(deal.stage)]
          .filter(Boolean)
          .join(' · ') || 'Commercial work',
    })),
    ...pursuits.map((item: any) => ({
      key: `pursuit:${item.player_match_id}`,
      type: 'Player route',
      title:
        `${item.player?.name || 'Player'} → ${item.club?.name || 'Club'}`,
      detail:
        item.career_strategy_gate?.next_action?.instruction ||
        item.best_access_route?.why_this_route ||
        'Review the recorded player-club route.',
      meta:
        item.best_access_route?.person_name ||
        human(item.readiness_state || 'Recorded route'),
    })),
    ...marketNeeds.map((item: any) => ({
      key: `need:${item.club_need_id}`,
      type: 'Club need',
      title:
        `${item.club?.name || 'Club'} · ${item.need?.title || 'Player need'}`,
      detail:
        item.next_action?.instruction ||
        'Review the recorded club need.',
      meta:
        [
          item.need?.position,
          human(item.coverage_state),
        ]
          .filter(Boolean)
          .join(' · ') || 'Active need',
    })),
  ].slice(0, 3);

  const playerAttention = [...players]
    .filter((item: any) => {
      const contractDays = Number(
        item?.career_timing?.contract_days_remaining,
      );
      const marketState = String(
        item?.market_coverage?.state || '',
      );

      return Boolean(
        item?.next_control_fix?.instruction ||
          item?.next_service_move?.instruction ||
          (Number.isFinite(contractDays) &&
            contractDays <= 180) ||
          /(gap|missing|no_market|no_active)/i.test(
            marketState,
          ),
      );
    })
    .sort((a: any, b: any) => {
      const priorityFor = (item: any) => {
        if (item?.next_control_fix?.instruction) return 0;
        if (item?.next_service_move?.instruction) return 1;

        const contractDays = Number(
          item?.career_timing?.contract_days_remaining,
        );

        if (
          Number.isFinite(contractDays) &&
          contractDays <= 90
        ) {
          return 2;
        }

        return 3;
      };

      return priorityFor(a) - priorityFor(b);
    })
    .slice(0, 3);

  const executive =
    ownerBusiness?.control?.executive_summary || {};

  const serviceSummary =
    ownerBusiness?.control?.service_control?.summary ||
    ownerBusiness?.control?.service_assurance?.summary ||
    {};

  const receivableSummary =
    ownerBusiness?.receivables?.summary || {};

  const hasBusinessSnapshot = Boolean(
    ownerBusiness?.control ||
      ownerBusiness?.roi ||
      ownerBusiness?.receivables,
  );

  const actionFor = (command: any) => {
    const oneTap =
      command?.actionability?.mode === 'one_tap' &&
      command?.actionability?.evidence_gate === 'ready';

    if (oneTap) {
      return (
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
          {command.actionability?.cta || 'Continue'}
        </button>
      );
    }

    return (
      <button
        type="button"
        className={styles.compactButton}
        onClick={() => onOpenAction(command)}
      >
        <ArrowRight size={14} />
        {command.actionability?.cta || 'Open'}
      </button>
    );
  };

  return (
    <div className={styles.homeStack}>
      <section className={styles.homeWelcome}>
        <p>{greeting}</p>
        <h2>
          {priority.length
            ? `${priority.length} ${priority.length === 1 ? 'thing needs' : 'things need'} you`
            : 'Everything important is under control'}
        </h2>
      </section>

      <div className={styles.homeOverviewGrid}>
        <section
          className={`${styles.sectionCard} ${styles.homeAttentionPanel}`}
        >
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>NEEDS YOU</p>
              <h2>What needs your attention</h2>
            </div>
            {priority.length ? (
              <span className={styles.sectionCount}>
                {priority.length}
              </span>
            ) : null}
          </div>

          <div className={styles.list}>
            {priority.map((command: any, index: number) => (
              <article
                className={`${styles.attentionCard} ${
                  index === 0
                    ? styles.attentionCardPrimary
                    : ''
                }`}
                key={command.command_id}
              >
                <div className={styles.attentionCopy}>
                  <div className={styles.attentionMeta}>
                    <span>
                      {index === 0
                        ? 'NEXT'
                        : human(
                            command.source_type ||
                              command.command_type ||
                              'Action',
                          )}
                    </span>
                    <small>
                      {command.due_at
                        ? relativeDate(command.due_at)
                        : human(
                            command.command_type ||
                              'Agency action',
                          )}
                    </small>
                  </div>

                  <strong>{command.title}</strong>
                  <span>
                    {command.recommended_action ||
                      command.why_now ||
                      'Review the current situation.'}
                  </span>
                </div>

                {actionFor(command)}
              </article>
            ))}

            {!priority.length ? (
              <EmptyState
                icon={CheckCircle2}
                title="You are clear for now"
                copy="The next decision will appear here when it matters."
              />
            ) : null}
          </div>
        </section>

        <section
          className={`${styles.sectionCard} ${styles.homeDayPanel}`}
        >
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>TODAY</p>
              <h2>Your day</h2>
            </div>

            <a
              className={styles.homeTextLink}
              href="?view=calendar"
            >
              Calendar
              <ArrowRight size={13} />
            </a>
          </div>

          <div className={styles.list}>
            {dayItems
              .slice(0, 5)
              .map((item: any, index: number) => (
                <article
                  className={styles.simpleTimelineRow}
                  key={
                    item?.item_id ||
                    item?.entity_id ||
                    `${item?.title || 'item'}-${index}`
                  }
                >
                  {item?.calendar_kind === 'birthday' ? (
                    <CakeSlice size={16} />
                  ) : (
                    <CalendarDays size={16} />
                  )}
                  <div>
                    <strong>
                      {item?.title || 'Agency date'}
                    </strong>
                    <span>
                      {item?.deadline_at
                        ? `${relativeDate(
                            item.deadline_at,
                          )} · ${human(
                            item.deadline_state ||
                              'Recorded',
                          )}`
                        : 'Date not recorded'}
                      {item?.calendar_kind === 'birthday' &&
                      item?.context?.turns_age
                        ? ` · Turns ${item.context.turns_age}`
                        : ''}
                    </span>
                  </div>
                </article>
              ))}

            {!dayItems.length ? (
              <EmptyState
                icon={CalendarDays}
                title="Nothing dated for today"
                copy="Meetings, follow-ups and deadlines will appear here as they become known."
              />
            ) : null}
          </div>
        </section>
      </div>

      <div className={styles.homeSupportGrid}>
        <section className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>
                OPPORTUNITIES MOVING
              </p>
              <h2>Keep momentum</h2>
            </div>

            <a
              className={styles.homeTextLink}
              href="?view=opportunities"
            >
              Open
              <ArrowRight size={13} />
            </a>
          </div>

          <div className={styles.list}>
            {opportunityMoves.map((item: any) => (
              <a
                className={styles.homeSupportRow}
                href="?view=opportunities"
                key={item.key}
              >
                <div className={styles.homeSupportIcon}>
                  <BriefcaseBusiness size={15} />
                </div>

                <div className={styles.homeSupportCopy}>
                  <small>{item.type}</small>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  <em>{item.meta}</em>
                </div>

                <ArrowRight size={14} />
              </a>
            ))}

            {!opportunityMoves.length ? (
              <EmptyState
                icon={BriefcaseBusiness}
                title="No live movement yet"
                copy="Active club needs, player routes and deals will appear here."
              />
            ) : null}
          </div>
        </section>

        <section className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>
                PLAYERS NEEDING ATTENTION
              </p>
              <h2>Player care</h2>
            </div>

            <a
              className={styles.homeTextLink}
              href="?view=players"
            >
              Open
              <ArrowRight size={13} />
            </a>
          </div>

          <div className={styles.list}>
            {playerAttention.map((item: any) => {
              const playerName =
                item?.player?.name || 'Player';

              const contractDays = Number(
                item?.career_timing?.contract_days_remaining,
              );

              const detail =
                item?.next_control_fix?.instruction ||
                item?.next_service_move?.instruction ||
                (Number.isFinite(contractDays)
                  ? `Contract timing: ${contractDays} days recorded`
                  : 'Review the current player position.');

              return (
                <a
                  className={styles.homeSupportRow}
                  href="?view=players"
                  key={item.player_id}
                >
                  <div className={styles.homeSupportAvatar}>
                    {initials(playerName) || 'P'}
                  </div>

                  <div className={styles.homeSupportCopy}>
                    <small>PLAYER</small>
                    <strong>{playerName}</strong>
                    <span>{detail}</span>
                    <em>
                      {human(
                        item?.market_coverage?.state ||
                          item?.player?.football_status ||
                          'Recorded',
                      )}
                    </em>
                  </div>

                  <ArrowRight size={14} />
                </a>
              );
            })}

            {!playerAttention.length ? (
              <EmptyState
                icon={Users}
                title="No player action is pressing"
                copy="Player service, contract timing and market coverage will surface here when needed."
              />
            ) : null}
          </div>
        </section>
      </div>

      {hasBusinessSnapshot ? (
        <a
          className={styles.homeBusinessStrip}
          href="?view=business"
        >
          <div className={styles.homeBusinessIntro}>
            <Coins size={16} />
            <div>
              <small>BUSINESS</small>
              <strong>Agency position</strong>
            </div>
          </div>

          <div className={styles.homeBusinessFacts}>
            <span>
              <b>{Number(executive.active_deals ?? 0)}</b>
              active deals
            </span>
            <span>
              <b>
                {Number(
                  serviceSummary.total_breaches ??
                    executive.service_standard_breaches ??
                    0,
                )}
              </b>
              service issues
            </span>
            <span>
              <b>
                {Number(
                  receivableSummary.open_receivables ?? 0,
                )}
              </b>
              open receivables
            </span>
          </div>

          <ArrowRight size={15} />
        </a>
      ) : null}
    </div>
  );
}

function Players({
  data,
  onOpenAction,
  onOpenIntelligence,
}: {
  data: any;
  onOpenAction: (
    request: AgencyActionRequest,
  ) => void;
  onOpenIntelligence: (
    request: AgencyIntelligenceRequest,
  ) => void;
}) {
  const service = data?.service || {};
  const items = Array.isArray(service?.players)
    ? service.players
    : [];
  const summary = service?.summary || {};
  const representation = data?.representation_records?.summary || {};
  const relationship = data?.relationship_control?.summary || {};
  return (
    <div className={styles.stack}>
      <WorkspaceIntro
        eyebrow="PLAYERS"
        title="Know what every player needs next."
        copy="Contracts, opportunities and next actions in one place."
        icon={Users}
        badge={`${summary.active_players ?? items.length} players`}
      />

      <section className={styles.metrics}>
        <Metric
          label="Needs attention"
          value={String(summary.service_risk || 0)}
          detail={`${summary.urgent_service_queue || 0} urgent`}
        />

        <Metric
          label="Contract windows"
          value={String(summary.contract_critical_window || 0)}
          detail="Players nearing a key contract date"
        />

        <Metric
          label="Without market activity"
          value={String(summary.market_coverage_gaps || 0)}
          detail="No active route or deal recorded"
        />

        <Metric
          label="Representation records"
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

          const playerFacts = [
            {
              label: 'Player status',
              value: human(serviceState),
              detail: serviceGaps.length
                ? `${serviceGaps.length} recorded gap${serviceGaps.length === 1 ? '' : 's'}`
                : 'No player-service gap recorded',
            },
            {
              label: 'Next move',
              value: nextMove,
              detail:
                item.player?.next_action_due
                  ? relativeDate(
                      item.player.next_action_due,
                    )
                  : 'No due date recorded',
            },
            {
              label: 'Contract timing',
              value: human(
                item.career_timing?.market_trigger ||
                  item.player?.contract_status ||
                  'recorded',
              ),
              detail: contractDetail,
            },
            {
              label: 'Market activity',
              value: human(marketState),
              detail: activeDeals
                ? `${activeDeals} active recorded deal${activeDeals === 1 ? '' : 's'}`
                : 'No active deal recorded',
            },
          ];

          const playerAction = controlFix
            ? {
                key: `player-control:${item.player_id}`,
                eyebrow: 'PLAYER CONTROL',
                title: playerName,
                instruction: controlFix,
                label:
                  item.next_control_fix?.fix_type ===
                  'assign_primary_staff'
                    ? 'Assign owner'
                    : 'Fix this',
                action: 'player_control_fix_prepare',
                payload: {
                  player_id: item.player_id,
                },
                context: human(serviceState),
                facts: playerFacts,
                successCondition:
                  item.next_control_fix
                    ?.success_condition ||
                  (item.next_control_fix
                    ?.fix_type ===
                  'assign_primary_staff'
                    ? 'One accountable primary staff member owns the player.'
                    : 'The recorded player-control gap is resolved.'),
                confirmationLabel:
                  item.next_control_fix?.fix_type ===
                  'assign_primary_staff'
                    ? 'Assign primary owner'
                    : 'Apply fix',
              }
            : item.next_service_move?.instruction
              ? {
                  key: `player-service:${item.player_id}`,
                  eyebrow: 'PLAYER SERVICE',
                  title: playerName,
                  instruction:
                    item.next_service_move.instruction,
                  label: 'Prepare next move',
                  action:
                    'player_service_move_prepare',
                  payload: {
                    player_id: item.player_id,
                  },
                  context: human(serviceState),
                  facts: playerFacts,
                  successCondition:
                    item.next_service_move
                      ?.success_condition ||
                    'The player action is completed and a new next action is recorded if further work remains.',
                  confirmationLabel:
                    'Create player action',
                }
              : null;

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
                    PLAYER
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
                  <span>Next action</span>
                  <strong>{nextMove}</strong>
                  <small>
                    {relativeDate(item.player?.next_action_due)}
                  </small>
                </div>

                <div>
                  <span>Market activity</span>
                  <strong>{human(marketState)}</strong>
                  <small>
                    {activeDeals
                      ? `${activeDeals} active recorded deal${activeDeals === 1 ? '' : 's'}`
                      : 'No active deal recorded'}
                  </small>
                </div>

                <div>
                  <span>Contract</span>
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

              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.compactButton}
                  onClick={() =>
                    onOpenIntelligence({
                      key: `player-360:${item.player_id}`,
                      kind: 'player',
                      entityId: String(item.player_id),
                      title: playerName,
                      context: human(item.player?.football_status),
                    })
                  }
                >
                  <Search size={14} />
                  Open player
                </button>

                {playerAction ? (
                  <button
                    type="button"
                    className={styles.compactButton}
                    onClick={() =>
                      onOpenAction(playerAction)
                    }
                  >
                    <ArrowRight size={14} />
                    {playerAction.label}
                  </button>
                ) : null}
              </div>
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
                NEEDS ATTENTION
              </p>
              <h2>Players needing attention</h2>
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
              Player service exceptions are surfaced on the cards above.
            </strong>

            <span>
              These players have a real follow-up, ownership or coverage issue
              recorded. Open the player above to see the next action.
            </span>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Relationships({
  data,
  rpc,
  onRefresh,
  onOpenAction,
  onOpenClubAccount,
}: {
  data: any;
  rpc: <T,>(
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<T>;
  onRefresh: () => Promise<void>;
  onOpenAction: (
    request: AgencyActionRequest,
  ) => void;
  onOpenClubAccount: (
    request: AgencyClubAccountRequest,
  ) => void;
}) {
  const [relationshipView, setRelationshipView] =
    useState<'clubs' | 'contacts'>('clubs');
  const [relationshipSearch, setRelationshipSearch] =
    useState('');

  const [selectedContact, setSelectedContact] =
    useState<any>(null);

  const accounts = data?.accounts || {};
  const clubs = Array.isArray(accounts?.clubs)
    ? accounts.clubs
    : [];
  const clubSummary = accounts?.summary || {};

  const contactData = data?.contacts || {};
  const contacts = Array.isArray(contactData?.items)
    ? contactData.items
    : [];
  const contactSummary = contactData?.summary || {};

  const searchValue = relationshipSearch
    .trim()
    .toLowerCase();

  const filteredContacts = useMemo(() => {
    if (!searchValue) return contacts;

    return contacts.filter((item: any) => {
      const person = item.person || {};
      const employment = item.employment || {};

      return [
        person.full_name,
        person.preferred_name,
        person.country,
        person.city,
        employment.role_title,
        employment.department,
        employment.organisation_name,
        employment.organisation_country,
        employment.organisation_city,
        employment.league_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(searchValue);
    });
  }, [contacts, searchValue]);

  const filteredClubs = useMemo(() => {
    if (!searchValue) return clubs;

    return clubs.filter((item: any) =>
      [
        item.name,
        item.city,
        item.country,
        item.league_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(searchValue),
    );
  }, [clubs, searchValue]);

  const contactsByClub = useMemo(() => {
    const grouped = new Map<string, any[]>();

    contacts.forEach((contact: any) => {
      const organisationId = String(
        contact.employment?.organisation_id || '',
      );

      if (!organisationId) return;

      const current = grouped.get(organisationId) || [];
      current.push(contact);
      grouped.set(organisationId, current);
    });

    grouped.forEach((group) => {
      group.sort(
        (a, b) =>
          Number(
            b.relationship?.route_score || 0,
          ) -
          Number(
            a.relationship?.route_score || 0,
          ),
      );
    });

    return grouped;
  }, [contacts]);

  const openClubFromContact = (
    clubName: string,
  ) => {
    setRelationshipView('clubs');
    setRelationshipSearch(clubName);
  };

  return (
    <div className={styles.stack}>
      <WorkspaceIntro
        eyebrow="NETWORK"
        title="Your football network."
        copy="See the clubs and people you know, what is happening there and the best route in."
        icon={Network}
        badge={`${clubSummary.relevant_clubs ?? clubs.length} relevant clubs`}
      />

      <section className={styles.metrics}>
        <Metric
          label="Clubs"
          value={String(
            clubSummary.relevant_clubs ??
              clubs.length,
          )}
          detail="Clubs connected to current work"
        />

        <Metric
          label="Contacts"
          value={String(
            contactSummary.club_contacts ??
              contacts.length,
          )}
          detail="People recorded at clubs"
        />

        <Metric
          label="Strong relationships"
          value={String(
            contactSummary
              .strong_recorded_direct_relationships ||
              0,
          )}
          detail="Direct access already recorded"
        />

        <Metric
          label="Follow-ups"
          value={String(
            contactSummary
              .contacts_with_open_follow_up ||
              0,
          )}
          detail="Contacts with something due"
        />
      </section>

      <section
        className={styles.relationshipToolbar}
        aria-label="Relationship workspace controls"
      >
        <div
          className={styles.relationshipTabs}
          role="group"
          aria-label="Relationship view"
        >
          <button
            type="button"
            className={
              relationshipView === 'clubs'
                ? styles.relationshipTabActive
                : styles.relationshipTab
            }
            aria-pressed={
              relationshipView === 'clubs'
            }
            onClick={() =>
              setRelationshipView('clubs')
            }
          >
            Clubs
            <span>{clubs.length}</span>
          </button>

          <button
            type="button"
            className={
              relationshipView === 'contacts'
                ? styles.relationshipTabActive
                : styles.relationshipTab
            }
            aria-pressed={
              relationshipView === 'contacts'
            }
            onClick={() =>
              setRelationshipView('contacts')
            }
          >
            Contacts
            <span>{contacts.length}</span>
          </button>
        </div>

        <label
          className={styles.relationshipSearch}
        >
          <Search size={15} />

          <input
            type="search"
            value={relationshipSearch}
            onChange={(event) =>
              setRelationshipSearch(
                event.target.value,
              )
            }
            placeholder={
              relationshipView === 'contacts'
                ? 'Search name, club, role or country'
                : 'Search clubs'
            }
            aria-label={
              relationshipView === 'contacts'
                ? 'Search club contacts'
                : 'Search clubs'
            }
          />

          {relationshipSearch ? (
            <button
              type="button"
              onClick={() =>
                setRelationshipSearch('')
              }
              aria-label="Clear relationship search"
            >
              Clear
            </button>
          ) : null}
        </label>
      </section>

      {relationshipView === 'clubs' ? (
        <section className={styles.cards}>
          {filteredClubs.map((item: any) => {
            const clubName =
              item.name || 'Club';

            const access =
              item.access || {};

            const demand =
              item.demand || {};

            const commercial =
              item.commercial || {};

            const topPlay =
              item.top_play || {};

            const clubContacts =
              contactsByClub.get(
                String(
                  item.organisation_id || '',
                ),
              ) || [];

            const keyContacts =
              clubContacts.slice(0, 3);

            const useIntroduction =
              Number(
                access.introduction_score || 0,
              ) >
              Number(
                access.direct_score || 0,
              );

            const routeName =
              useIntroduction
                ? access.introduction_via ||
                  'Warm introduction'
                : access.best_direct_contact ||
                  'No recorded contact';

            const routeDetail =
              useIntroduction
                ? access.introduction_target
                  ? `Introduction to ${access.introduction_target}`
                  : 'Recorded introduction route'
                : access.best_direct_role ||
                  human(
                    access.direct_state ||
                      'recorded access',
                  );

            const playType = String(
              topPlay.play_type || '',
            );

            const warmPlay = String(
              topPlay.access_route_mode || '',
            ).includes('warm');

            const playActionLabel =
              warmPlay
                ? 'Prepare introduction'
                : [
                      'protect_live_deal',
                      'remove_deal_blocker',
                    ].includes(playType)
                  ? 'Protect deal'
                  : playType ===
                        'source_for_confirmed_need'
                    ? 'Work confirmed need'
                    : playType === 'pitch_now'
                      ? 'Review pitch route'
                      : 'Prepare play';

            const playSuccessCondition =
              warmPlay
                ? 'A controlled introduction task is prepared from the recorded route. No external message is sent automatically.'
                : [
                      'protect_live_deal',
                      'remove_deal_blocker',
                    ].includes(playType)
                  ? 'The recorded relationship action is prepared against the live deal and remains human-controlled.'
                  : playType ===
                        'source_for_confirmed_need'
                    ? 'A controlled sourcing task is prepared against the confirmed club need.'
                    : playType === 'pitch_now'
                      ? 'The pitch route is reviewed and prepared for human-led external action.'
                      : 'The recommended relationship play is prepared against the recorded evidence.';

            const playConfirmationLabel =
              warmPlay
                ? 'Create introduction task'
                : [
                      'protect_live_deal',
                      'remove_deal_blocker',
                    ].includes(playType)
                  ? 'Create deal relationship task'
                  : playType ===
                        'source_for_confirmed_need'
                    ? 'Create sourcing task'
                    : playType === 'pitch_now'
                      ? 'Review pitch route'
                      : 'Create relationship task';

            const relationshipFacts = [
              {
                label: 'Club',
                value: clubName,
                detail:
                  [
                    item.city,
                    item.country,
                    item.league_name,
                  ]
                    .filter(Boolean)
                    .join(' · ') ||
                  'Club context recorded',
              },
              {
                label: 'Best route',
                value: routeName,
                detail: routeDetail,
              },
              {
                label: 'Current demand',
                value:
                  `${Number(demand.active_needs || 0)} active`,
                detail:
                  `${Number(demand.confirmed_needs || 0)} confirmed`,
              },
              {
                label: 'Live business',
                value:
                  `${Number(commercial.active_deals || 0)} active`,
                detail:
                  `${Number(commercial.deals_needing_action || 0)} need action`,
              },
            ];

            return (
              <article
                className={styles.card}
                key={item.organisation_id}
              >
                <div
                  className={styles.entityHeader}
                >
                  <div
                    className={styles.entityMark}
                  >
                    {initials(clubName) || 'C'}
                  </div>

                  <div
                    className={
                      styles.entityIdentity
                    }
                  >
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

                  <span
                    className={styles.pill}
                  >
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
                    <span>Best contact</span>
                    <strong>
                      {routeName}
                    </strong>
                    <small>
                      {routeDetail}
                    </small>
                  </div>

                  <div>
                    <span>Club needs</span>
                    <strong>
                      {demand.active_needs || 0}{' '}
                      active
                    </strong>
                    <small>
                      {demand.confirmed_needs ||
                        0}{' '}
                      confirmed
                    </small>
                  </div>

                  <div>
                    <span>Live deals</span>
                    <strong>
                      {commercial.active_deals ||
                        0}{' '}
                      active
                    </strong>
                    <small>
                      {commercial
                        .deals_needing_action ||
                        0}{' '}
                      need action
                    </small>
                  </div>
                </div>

                <div
                  className={
                    styles.clubPeople
                  }
                >
                  <div
                    className={
                      styles.clubPeopleHead
                    }
                  >
                    <div>
                      <span>KEY PEOPLE</span>
                      <strong>
                        {keyContacts.length
                          ? 'Who we know here'
                          : 'No current contact recorded'}
                      </strong>
                    </div>

                    {clubContacts.length >
                    keyContacts.length ? (
                      <small>
                        +
                        {clubContacts.length -
                          keyContacts.length}{' '}
                        more
                      </small>
                    ) : null}
                  </div>

                  {keyContacts.length ? (
                    <div
                      className={
                        styles.clubPeopleList
                      }
                    >
                      {keyContacts.map(
                        (contact: any) => {
                          const person =
                            contact.person || {};

                          const employment =
                            contact.employment ||
                            {};

                          const relationship =
                            contact.relationship ||
                            {};

                          return (
                            <button
                              type="button"
                              className={
                                styles.clubPerson
                              }
                              key={
                                contact.person_id
                              }
                              onClick={() =>
                                setSelectedContact(
                                  contact,
                                )
                              }
                            >
                              <div
                                className={
                                  styles.clubPersonAvatar
                                }
                              >
                                {initials(
                                  person.full_name ||
                                    'Contact',
                                ) || 'P'}
                              </div>

                              <div
                                className={
                                  styles.clubPersonMain
                                }
                              >
                                <strong>
                                  {person.full_name ||
                                    'Club contact'}
                                </strong>

                                <span>
                                  {employment.role_title ||
                                    'Club contact'}
                                </span>
                              </div>

                              <small
                                className={
                                  styles.clubPersonRoute
                                }
                              >
                                {human(
                                  relationship.route_state ||
                                    'not recorded',
                                )}
                              </small>
                            </button>
                          );
                        },
                      )}
                    </div>
                  ) : (
                    <p
                      className={
                        styles.clubPeopleEmpty
                      }
                    >
                      Add or capture the people
                      behind this club to build a
                      usable relationship route.
                    </p>
                  )}
                </div>

                {topPlay.recommended_action ? (
                  <div
                    className={styles.reason}
                  >
                    {topPlay.recommended_action}
                  </div>
                ) : null}

                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={styles.compactButton}
                    onClick={() =>
                      onOpenClubAccount({
                        key: `club-account:${item.organisation_id}`,
                        organisationId: String(item.organisation_id),
                        title: clubName,
                        context:
                          [item.city, item.country, item.league_name]
                            .filter(Boolean)
                            .join(' · ') || null,
                      })
                    }
                  >
                    <Network size={14} />
                    Open club
                  </button>
                </div>

                {topPlay.play_id ? (
                  <div
                    className={
                      styles.cardActions
                    }
                  >
                    <button
                      type="button"
                      className={
                        styles.compactButton
                      }
                      onClick={() =>
                        onOpenAction({
                          key:
                            `relationship-play:${topPlay.play_id}`,
                          eyebrow:
                            'RELATIONSHIP PLAY',
                          title:
                            topPlay.title ||
                            clubName,
                          instruction:
                            topPlay.recommended_action ||
                            'Prepare the strongest recorded relationship route.',
                          label:
                            playActionLabel,
                          action:
                            'play_prepare',
                          payload: {
                            play_id:
                              topPlay.play_id,
                          },
                          context: clubName,
                          facts:
                            relationshipFacts,
                          successCondition:
                            playSuccessCondition,
                          confirmationLabel:
                            playConfirmationLabel,
                          fallbackHref:
                            [
                              'protect_live_deal',
                              'remove_deal_blocker',
                            ].includes(
                              String(
                                topPlay.play_type ||
                                  '',
                              ),
                            )
                              ? '?view=opportunities'
                              : String(
                                    topPlay.play_type ||
                                      '',
                                  ) ===
                                  'source_for_confirmed_need'
                                ? '?view=opportunities'
                                : String(
                                      topPlay.play_type ||
                                        '',
                                    ) ===
                                    'pitch_now'
                                  ? '?view=opportunities'
                                  : '?view=network',
                          fallbackLabel:
                            [
                              'protect_live_deal',
                              'remove_deal_blocker',
                            ].includes(
                              String(
                                topPlay.play_type ||
                                  '',
                              ),
                            )
                              ? 'Open Opportunities'
                              : String(
                                    topPlay.play_type ||
                                      '',
                                  ) ===
                                  'pitch_now'
                                ? 'Open Opportunities'
                                : String(
                                      topPlay.play_type ||
                                        '',
                                    ) ===
                                    'source_for_confirmed_need'
                                  ? 'Open Opportunities'
                                  : 'Return to Network',
                        })
                      }
                    >
                      <ArrowRight size={14} />
                      {playActionLabel}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}

          {!filteredClubs.length ? (
            <EmptyState
              icon={Network}
              title={
                relationshipSearch
                  ? 'No clubs match this search'
                  : 'No relevant club relationships yet'
              }
              copy={
                relationshipSearch
                  ? 'Try another club, country or league.'
                  : 'Add club contacts and keep your relationships current to build this view.'
              }
            />
          ) : null}
        </section>
      ) : (
        <section
          className={`${styles.cards} ${styles.relationshipCards}`}
        >
          {filteredContacts.map(
            (item: any) => {
              const person =
                item.person || {};

              const employment =
                item.employment || {};

              const relationship =
                item.relationship || {};

              const activity =
                item.activity || {};

              const clubContext =
                item.club_context || {};

              const work =
                item.work || {};

              const fullName =
                person.full_name ||
                'Club contact';

              const clubName =
                employment.organisation_name ||
                'Club not recorded';

              const location = [
                employment.organisation_city,
                employment.organisation_country,
              ]
                .filter(Boolean)
                .join(', ');

              const activeDeals = Number(
                clubContext.active_deals || 0,
              );

              const confirmedNeeds = Number(
                clubContext.confirmed_needs ||
                  0,
              );

              const openTasks = Number(
                work.open_tasks || 0,
              );

              const overdueTasks = Number(
                work.overdue_tasks || 0,
              );

              return (
                <article
                  className={`${styles.card} ${styles.contactCard}`}
                  key={item.person_id}
                >
                  <div
                    className={
                      styles.entityHeader
                    }
                  >
                    <div
                      className={
                        styles.entityMark
                      }
                    >
                      {initials(fullName) || 'P'}
                    </div>

                    <div
                      className={
                        styles.entityIdentity
                      }
                    >
                      <p
                        className={
                          styles.eyebrow
                        }
                      >
                        {human(
                          item.operating_state ||
                            'relationship recorded',
                        )}
                      </p>

                      <h2>{fullName}</h2>

                      <p>
                        {[
                          employment.role_title,
                          clubName,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>

                    <span
                      className={styles.pill}
                    >
                      {human(
                        relationship.route_state ||
                          'not recorded',
                      )}
                    </span>
                  </div>

                  <div
                    className={
                      styles.contactContext
                    }
                  >
                    <div>
                      <span>CLUB</span>
                      <strong>
                        {clubName}
                      </strong>
                      <small>
                        {location ||
                          employment.league_name ||
                          'Location not recorded'}
                      </small>
                    </div>

                    <div>
                      <span>
                        RELATIONSHIP OWNER
                      </span>
                      <strong>
                        {relationship.owner_name ||
                          'No recorded owner'}
                      </strong>
                      <small>
                        {relationship.route_score
                          ? `Recorded route ${relationship.route_score}`
                          : 'No direct relationship score recorded'}
                      </small>
                    </div>
                  </div>

                  <div className={styles.facts}>
                    <div>
                      <span>
                        Last interaction
                      </span>
                      <strong>
                        {activity.last_interaction_at
                          ? relativeDate(
                              activity.last_interaction_at,
                            )
                          : 'Not recorded'}
                      </strong>
                      <small>
                        {Number(
                          activity.interactions_30d ||
                            0,
                        )}{' '}
                        in last 30 days
                      </small>
                    </div>

                    <div>
                      <span>
                        Club context
                      </span>
                      <strong>
                        {activeDeals}{' '}
                        {activeDeals === 1
                          ? 'live deal'
                          : 'live deals'}
                      </strong>
                      <small>
                        {confirmedNeeds}{' '}
                        confirmed{' '}
                        {confirmedNeeds === 1
                          ? 'need'
                          : 'needs'}
                      </small>
                    </div>

                    <div>
                      <span>Follow-up</span>
                      <strong>
                        {openTasks}{' '}
                        {openTasks === 1
                          ? 'open item'
                          : 'open items'}
                      </strong>
                      <small>
                        {overdueTasks
                          ? `${overdueTasks} overdue`
                          : work.next_task_due
                            ? relativeDate(
                                work.next_task_due,
                              )
                            : 'Nothing due'}
                      </small>
                    </div>
                  </div>

                  {item.contact?.email ||
                  item.contact?.whatsapp ? (
                    <div
                      className={
                        styles.contactMethods
                      }
                    >
                      {item.contact?.email ? (
                        <span>
                          {item.contact.email}
                        </span>
                      ) : null}

                      {item.contact?.whatsapp ? (
                        <span>
                          {item.contact.whatsapp}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <div
                    className={
                      styles.cardActions
                    }
                  >
                    <button
                      type="button"
                      className={
                        styles.compactButton
                      }
                      onClick={() =>
                        setSelectedContact(
                          item,
                        )
                      }
                    >
                      <Users size={14} />
                      Open contact
                    </button>

                    <button
                      type="button"
                      className={
                        styles.compactButton
                      }
                      onClick={() =>
                        openClubFromContact(
                          clubName,
                        )
                      }
                    >
                      <ArrowRight size={14} />
                      View club context
                    </button>
                  </div>
                </article>
              );
            },
          )}

          {!filteredContacts.length ? (
            <EmptyState
              icon={Users}
              title={
                relationshipSearch
                  ? 'No contacts match this search'
                  : 'No club contacts recorded yet'
              }
              copy={
                relationshipSearch
                  ? 'Search by person, club, role, city or country.'
                  : 'Club decision-makers and relationship routes will appear here as they are captured.'
              }
            />
          ) : null}
        </section>
      )}

      {selectedContact ? (
        <AgencyContactIntelligenceDrawer
          contact={selectedContact}
          rpc={rpc}
          onClose={() =>
            setSelectedContact(null)
          }
          onRefresh={onRefresh}
          onOpenClub={(clubName) => {
            setSelectedContact(null);
            openClubFromContact(
              clubName,
            );
          }}
        />
      ) : null}
    </div>
  );
}

function Opportunities({
  data,
  onOpenAction,
  onOpenPursuit,
  onOpenIntelligence,
}: {
  data: any;
  onOpenAction: (
    request: AgencyActionRequest,
  ) => void;
  onOpenPursuit: (
    request: AgencyPursuitRequest,
  ) => void;
  onOpenIntelligence: (
    request: AgencyIntelligenceRequest,
  ) => void;
}) {
  const activeDeals = Number(
    data?.deals?.portfolio?.summary?.active_deals ||
      data?.deals?.portfolio?.deals?.length ||
      0,
  );

  return (
    <div className={styles.stack}>
      <Market
        data={data?.market}
        onOpenAction={onOpenAction}
        onOpenPursuit={onOpenPursuit}
      />

      {activeDeals > 0 ? (
        <Deals
          data={data?.deals}
          onOpenAction={onOpenAction}
          onOpenIntelligence={onOpenIntelligence}
        />
      ) : null}
    </div>
  );
}

function AgencyCalendar({
  data,
  basePath,
}: {
  data: any;
  basePath: string;
}) {
  const deadlines = Array.isArray(
    data?.deadlines?.items,
  )
    ? data.deadlines.items
    : Array.isArray(data?.items)
      ? data.items
      : [];

  const birthdayPack =
    data?.important_dates?.birthdays ||
    {};

  const birthdays = Array.isArray(
    birthdayPack?.items,
  )
    ? birthdayPack.items
    : [];

  const birthdaySummary =
    birthdayPack?.summary || {};

  const items = [
    ...deadlines.map((item: any) => ({
      ...item,
      calendar_kind: 'deadline',
      date_at: item?.deadline_at,
      date_state: item?.deadline_state,
    })),
    ...birthdays.map((item: any) => ({
      ...item,
      calendar_kind: 'birthday',
      entity_type: 'player',
      entity_id: item?.player_id,
      context: {
        player_id: item?.player_id,
        player_name: item?.player_name,
        turns_age: item?.turns_age,
      },
    })),
  ].sort((a: any, b: any) => {
    const aTime = Date.parse(
      String(a?.date_at || ''),
    );
    const bTime = Date.parse(
      String(b?.date_at || ''),
    );

    if (!Number.isFinite(aTime)) return 1;
    if (!Number.isFinite(bTime)) return -1;
    return aTime - bTime;
  });

  const needsAttention = deadlines.filter(
    (item: any) =>
      [
        'overdue',
        'today',
        'next_48_hours',
      ].includes(
        String(
          item?.deadline_state || '',
        ),
      ),
  ).length;

  const contractDates = deadlines.filter(
    (item: any) =>
      item?.deadline_type ===
      'contract_expiry',
  ).length;

  const representationDates =
    deadlines.filter(
      (item: any) =>
        item?.deadline_type ===
        'representation_record_end',
    ).length;

  const birthdaysNext30 = Number(
    birthdaySummary?.next_30_days || 0,
  );

  const exactDate = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return 'Date not recorded';

    const date = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? `${raw}T12:00:00`
        : raw,
    );

    if (Number.isNaN(date.getTime())) {
      return raw;
    }

    return new Intl.DateTimeFormat(
      'en-GB',
      {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      },
    ).format(date);
  };

  const categoryFor = (item: any) => {
    if (
      item?.calendar_kind ===
      'birthday'
    ) {
      return 'Birthday';
    }

    switch (
      String(
        item?.deadline_type || '',
      )
    ) {
      case 'contract_expiry':
        return 'Playing contract';
      case 'representation_record_end':
        return 'Agency agreement';
      case 'document_expiry':
        return 'Player document';
      case 'player_next_action':
        return 'Player action';
      case 'deal_next_action':
        return 'Deal';
      case 'club_need_expiry':
        return 'Club need';
      case 'player_request_due':
        return 'Player request';
      case 'career_strategy_review':
        return 'Career review';
      case 'target_window_end':
        return 'Move window';
      default:
        return 'Agency date';
    }
  };

  const iconFor = (item: any) => {
    if (
      item?.calendar_kind ===
      'birthday'
    ) {
      return <CakeSlice size={16} />;
    }

    if (
      item?.deadline_type ===
      'contract_expiry'
    ) {
      return (
        <BriefcaseBusiness size={16} />
      );
    }

    if (
      item?.deadline_type ===
      'representation_record_end'
    ) {
      return <ShieldCheck size={16} />;
    }

    return <CalendarDays size={16} />;
  };

  return (
    <div className={styles.stack}>
      <WorkspaceIntro
        eyebrow="CALENDAR"
        title="The dates your agency cannot forget."
        copy="Birthdays, contracts, representation records and dated work from information already recorded by the agency."
        icon={CalendarDays}
        badge={`${items.length} upcoming dates`}
      />

      <section
        className={
          styles.calendarSummary
        }
      >
        <div>
          <span>NEEDS ATTENTION</span>
          <strong>
            {needsAttention}
          </strong>
          <small>
            Overdue, today or within 48 hours
          </small>
        </div>

        <div>
          <span>BIRTHDAYS</span>
          <strong>
            {birthdaysNext30}
          </strong>
          <small>
            In the next 30 days
          </small>
        </div>

        <div>
          <span>PLAYER CONTRACTS</span>
          <strong>
            {contractDates}
          </strong>
          <small>
            Recorded in this horizon
          </small>
        </div>

        <div>
          <span>AGENCY AGREEMENTS</span>
          <strong>
            {representationDates}
          </strong>
          <small>
            Recorded end dates
          </small>
        </div>
      </section>

      <section
        className={styles.sectionCard}
      >
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>
              NEXT
            </p>
            <h2>Coming up</h2>
          </div>
        </div>

        <div
          className={
            styles.calendarList
          }
        >
          {items
            .slice(0, 50)
            .map(
              (
                item: any,
                index: number,
              ) => {
                const playerId =
                  item?.context
                    ?.player_id ||
                  item?.player_id ||
                  '';

                const playerHref =
                  playerId
                    ? `${basePath}?view=players&player=${encodeURIComponent(
                        String(playerId),
                      )}`
                    : '';

                const opportunityHref =
                  [
                    'deal',
                    'club_need',
                  ].includes(
                    String(
                      item?.entity_type ||
                        '',
                    ),
                  )
                    ? `${basePath}?view=opportunities`
                    : '';

                const destination =
                  playerHref ||
                  opportunityHref;

                const actionLabel =
                  playerHref
                    ? 'Open player'
                    : opportunityHref
                      ? 'Open Opportunities'
                      : '';

                const detail =
                  item?.calendar_kind ===
                  'birthday'
                    ? item?.turns_age
                      ? `Turns ${item.turns_age}`
                      : 'Player birthday'
                    : item?.next_action
                        ?.instruction ||
                      human(
                        item?.deadline_type ||
                          'Recorded date',
                      );

                return (
                  <article
                    className={
                      styles.calendarRow
                    }
                    key={
                      item?.item_id ||
                      item?.entity_id ||
                      `${item?.title || 'item'}-${index}`
                    }
                  >
                    <div
                      className={
                        styles.calendarIcon
                      }
                    >
                      {iconFor(item)}
                    </div>

                    <div
                      className={
                        styles.calendarCopy
                      }
                    >
                      <div
                        className={
                          styles.calendarMeta
                        }
                      >
                        <span>
                          {categoryFor(
                            item,
                          )}
                        </span>

                        <small>
                          {human(
                            item?.date_state ||
                              item?.deadline_state ||
                              'Recorded',
                          )}
                        </small>
                      </div>

                      <strong>
                        {item?.title ||
                          item?.label ||
                          'Agency date'}
                      </strong>

                      <span>
                        {item?.date_at
                          ? `${exactDate(
                              item.date_at,
                            )} · ${relativeDate(
                              item.date_at,
                            )}`
                          : 'Date not recorded'}
                      </span>

                      <small>
                        {detail}
                      </small>
                    </div>

                    {destination ? (
                      <Link
                        className={
                          styles.calendarAction
                        }
                        href={destination}
                      >
                        {actionLabel}
                        <ArrowRight
                          size={13}
                        />
                      </Link>
                    ) : null}
                  </article>
                );
              },
            )}

          {!items.length ? (
            <EmptyState
              icon={CalendarDays}
              title="No upcoming dates recorded"
              copy="Birthdays, contracts, representation dates, meetings and follow-ups will appear here as they are recorded."
            />
          ) : null}
        </div>

        <p
          className={
            styles.calendarTruth
          }
        >
          The calendar shows recorded dates and recurring player birthdays. A date can prompt attention, but it does not determine legal, regulatory or commercial consequence.
        </p>
      </section>
    </div>
  );
}

function Business({
  data,
  onOpenOwner,
}: {
  data: any;
  onOpenOwner: () => void;
}) {
  return (
    <div className={styles.stack}>
      <WorkspaceIntro
        eyebrow="BUSINESS"
        title="The agency as a business."
        copy="Revenue, collections and live commercial work for authorised management."
        icon={Coins}
        badge="Management only"
      />

      <section className={styles.businessEntry}>
        <div>
          <p className={styles.eyebrow}>BUSINESS</p>
          <h2>See what needs a management decision.</h2>
          <p>
            Owner control, revenue and receivables are already connected
            underneath. Open the detail when you need it.
          </p>
        </div>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={onOpenOwner}
          disabled={!data?.owner_business}
        >
          <Coins size={15} />
          Open business view
        </button>
      </section>
    </div>
  );
}

function Market({
  data,
  onOpenAction,
  onOpenPursuit,
}: {
  data: any;
  onOpenAction: (
    request: AgencyActionRequest,
  ) => void;
  onOpenPursuit: (
    request: AgencyPursuitRequest,
  ) => void;
}) {
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
  return (
    <div className={styles.stack}>
      <WorkspaceIntro
        eyebrow="OPPORTUNITIES"
        title="Club needs. Player fits. Best route in."
        copy="See what clubs need, which players could fit and who can open the door."
        icon={Target}
        badge={`${demandSummary.active_needs ?? needs.length} active needs`}
      />

      <section className={styles.metrics}>
        <Metric
          label="Club needs"
          value={String(
            demandSummary.active_needs ?? needs.length,
          )}
          detail="Live requirements from clubs"
        />

        <Metric
          label="Needs without a player"
          value={String(demandSummary.roster_gaps || 0)}
          detail="No player route recorded yet"
        />

        <Metric
          label="Player routes"
          value={String(
            pursuitSummary.pursuit_count ?? pursuits.length,
          )}
          detail="Player to club opportunities"
        />

        <Metric
          label="Player decisions"
          value={String(pitchSummary.career_holds || 0)}
          detail="A player or agent decision is needed"
        />
      </section>

      <div className={styles.opportunityColumns}>
        <section
          className={`${styles.sectionCard} ${styles.opportunityPanel}`}
        >
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>CLUB NEEDS</p>
              <h2>What clubs are looking for</h2>
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

                          {candidate.player_id ? (
                            <button
                              type="button"
                              className={
                                styles.routeCandidateAction
                              }
                              onClick={() =>
                                onOpenAction({
                                  key:
                                    `career-candidate:${candidate.player_id}`,
                                  eyebrow:
                                    'PLAYER-CLUB ROUTE',
                                  title:
                                    candidate.player_name ||
                                    'Player route',
                                  instruction:
                                    candidate.career_gate_reason ||
                                    'Review the player-owned career strategy before external activity.',
                                  label:
                                    'Review player plan',
                                  action:
                                    'career_strategy_action_prepare',
                                  payload: {
                                    player_id:
                                      candidate.player_id,
                                  },
                                  context:
                                    item.club?.name ||
                                    item.need?.title,
                                  facts: [
                                    {
                                      label: 'Player',
                                      value:
                                        candidate.player_name ||
                                        'Player',
                                      detail: human(
                                        candidate.match_status ||
                                          'recorded candidate',
                                      ),
                                    },
                                    {
                                      label: 'Club need',
                                      value:
                                        item.need?.title ||
                                        'Recorded player need',
                                      detail:
                                        item.club?.name ||
                                        'Club recorded',
                                    },
                                    {
                                      label:
                                        'Player plan',
                                      value:
                                        careerGateLabel(
                                          candidate.career_gate_state ||
                                            candidate.match_status,
                                        ),
                                      detail:
                                        candidate.career_gate_reason ||
                                        'Player-owned strategy status recorded',
                                    },
                                    {
                                      label: 'Route status',
                                      value: human(
                                        item.coverage_state ||
                                          'recorded',
                                      ),
                                      detail:
                                        `${Number(item.candidate_coverage?.recorded_candidates || 0)} candidate route${Number(item.candidate_coverage?.recorded_candidates || 0) === 1 ? '' : 's'} recorded`,
                                    },
                                  ],
                                  successCondition:
                                    String(
                                      candidate.career_gate_state ||
                                        '',
                                    ).startsWith(
                                      'hold_',
                                    )
                                      ? 'The player-owned career strategy is recorded and current before external activity progresses.'
                                      : 'The career-control requirement is resolved before external activity progresses.',
                                  confirmationLabel:
                                    'Continue career review',
                                })
                              }
                            >
                              Review
                            </button>
                          ) : null}
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

                  <div className={styles.rowActions}>
                    <div className={styles.sideStat}>
                      <strong>
                        {item.candidate_coverage
                          ?.recorded_candidates || 0}
                      </strong>
                      <small>candidates</small>
                    </div>

                    {!candidates.length ? (
                      <button
                        type="button"
                        className={styles.compactButton}
                        onClick={() =>
                          onOpenAction({
                            key:
                              `scouting:${item.club_need_id}`,
                            eyebrow: 'CLUB NEED',
                            title:
                              `${item.club?.name || 'Club'} · ${item.need?.title || 'Player need'}`,
                            instruction:
                              item.next_action
                                ?.instruction ||
                              'Create controlled scouting work against the recorded club need.',
                            label: 'Prepare search',
                            action:
                              'scouting_mandate_prepare',
                            payload: {
                              club_need_id:
                                item.club_need_id,
                            },
                            context:
                              item.need?.position ||
                              'Recorded club need',
                            facts: [
                              {
                                label: 'Need',
                                value:
                                  item.need?.title ||
                                  'Recorded player need',
                                detail:
                                  `${human(item.need?.need_type || 'recorded')} · ${item.club?.name || 'Club recorded'}`,
                              },
                              {
                                label: 'Profile',
                                value:
                                  [
                                    item.need?.position,
                                    item.need?.preferred_foot
                                      ? `${item.need.preferred_foot} foot`
                                      : null,
                                    item.need?.min_height_cm
                                      ? `${item.need.min_height_cm}cm+`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ') ||
                                  'Profile not fully recorded',
                                detail: item.need
                                  ?.transfer_type
                                  ? human(
                                      item.need
                                        .transfer_type,
                                    )
                                  : 'Transfer type not recorded',
                              },
                              {
                                label: 'Coverage',
                                value:
                                  `${Number(item.candidate_coverage?.recorded_candidates || 0)} recorded candidate${Number(item.candidate_coverage?.recorded_candidates || 0) === 1 ? '' : 's'}`,
                                detail: human(
                                  item.coverage_state ||
                                    'coverage not recorded',
                                ),
                              },
                              {
                                label: 'Timing',
                                value:
                                  item.need?.expires_at
                                    ? relativeDate(
                                        item.need
                                          .expires_at,
                                      )
                                    : 'No expiry recorded',
                                detail:
                                  'Recorded club-demand timing',
                              },
                            ],
                            successCondition:
                              'At least one credible candidate route is recorded against this club need.',
                            confirmationLabel:
                              'Create search task',
                          })
                        }
                      >
                        <ArrowRight size={14} />
                        Start search
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}

            {!needs.length ? (
              <EmptyState
                icon={Target}
                title="No active club demand"
                copy="Club needs will appear here with possible players and the next action."
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
              <h2>Routes to move</h2>
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

                  <div className={styles.rowActions}>
                    <div className={styles.sideStat}>
                      <strong>
                        {human(
                          item.pursuit_operating_mode ||
                            'review',
                        )}
                      </strong>
                      <small>status</small>
                    </div>

                    <button
                      type="button"
                      className={styles.compactButton}
                      onClick={() =>
                        onOpenPursuit({
                          key:
                            `pursuit:${item.player_match_id}`,
                          playerMatchId:
                            String(item.player_match_id),
                          playerId:
                            item.player?.player_id
                              ? String(item.player.player_id)
                              : null,
                          playerName:
                            item.player?.name ||
                            'Player',
                          clubId:
                            item.club?.organisation_id
                              ? String(item.club.organisation_id)
                              : null,
                          clubName:
                            item.club?.name ||
                            'Club',
                          needTitle:
                            item.need?.title ||
                            null,
                          careerGateState:
                            item.career_strategy_gate?.state ||
                            null,
                          careerGateReason:
                            item.career_strategy_gate?.reason ||
                            null,
                          accessLabel:
                            item.best_access_route
                              ?.person_name ||
                            human(accessMode),
                          accessDetail:
                            item.best_access_route
                              ?.why_this_route ||
                            null,
                        })
                      }
                    >
                      <BriefcaseBusiness size={14} />
                      Open route
                    </button>

                    {item.player?.player_id ? (
                      <button
                        type="button"
                        className={styles.compactButton}
                        onClick={() =>
                          onOpenAction({
                            key:
                              `career-pursuit:${item.player.player_id}`,
                            eyebrow:
                              'PLAYER-CLUB ROUTE',
                            title:
                              `${item.player?.name || 'Player'} → ${item.club?.name || 'Club'}`,
                            instruction:
                              nextAction,
                            label: 'Review player plan',
                            action:
                              'career_strategy_action_prepare',
                            payload: {
                              player_id:
                                item.player.player_id,
                            },
                            context:
                              careerGateLabel(
                                item.career_strategy_gate
                                  ?.state,
                              ),
                            facts: [
                              {
                                label: 'Player',
                                value:
                                  item.player?.name ||
                                  'Player',
                                detail:
                                  item.club?.name ||
                                  'Club recorded',
                              },
                              {
                                label:
                                  'Player plan',
                                value:
                                  careerGateLabel(
                                    item
                                      .career_strategy_gate
                                      ?.state,
                                  ),
                                detail:
                                  item
                                    .career_strategy_gate
                                    ?.next_action
                                    ?.instruction ||
                                  'Player-owned strategy control recorded',
                              },
                              {
                                label: 'Access route',
                                value:
                                  item.best_access_route
                                    ?.person_name ||
                                  human(accessMode),
                                detail:
                                  item.best_access_route
                                    ?.role_title ||
                                  item.best_access_route
                                    ?.why_this_route ||
                                  'Recorded relationship route',
                              },
                              {
                                label:
                                  'Ready to work',
                                value: human(
                                  item.readiness_state ||
                                    'review',
                                ),
                                detail:
                                  'Work-allocation signal, not success probability',
                              },
                            ],
                            successCondition:
                              String(
                                item
                                  .career_strategy_gate
                                  ?.state ||
                                  '',
                              ).startsWith(
                                'hold_',
                              )
                                ? 'The player-owned career strategy is current before the pursuit progresses externally.'
                                : 'The recorded career-control action is completed before the pursuit progresses externally.',
                            confirmationLabel:
                              'Continue strategy review',
                          })
                        }
                      >
                        <ArrowRight size={14} />
                        Review strategy
                      </button>
                    ) : null}
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

function Deals({
  data,
  onOpenAction,
  onOpenIntelligence,
}: {
  data: any;
  onOpenAction: (
    request: AgencyActionRequest,
  ) => void;
  onOpenIntelligence: (
    request: AgencyIntelligenceRequest,
  ) => void;
}) {
  const portfolio = data?.portfolio || {};

  const deals = Array.isArray(portfolio?.deals)
    ? portfolio.deals
    : [];

  const summary = portfolio?.summary || {};
  const risk = data?.commercial_risk || {};
  return (
    <div className={styles.stack}>
      <WorkspaceIntro
        eyebrow="DEALS"
        title="Keep every live deal moving."
        copy="See the stage, value, blocker and next action for every deal."
        icon={BriefcaseBusiness}
        badge={`${summary.active_deals ?? deals.length} active deals`}
      />

      <section className={styles.metrics}>
        <Metric
          label="Active deals"
          value={String(
            summary.active_deals ?? deals.length,
          )}
          detail="Deals currently in play"
        />

        <Metric
          label="Needs review"
          value={String(summary.stage_reviews_due || 0)}
          detail="Deals with a review due"
        />

        <Metric
          label="Losing momentum"
          value={String(
            (summary.momentum_recovery_deals || 0) +
              (summary.commercial_rescue_deals || 0),
          )}
          detail="Cooling or stalled work"
        />

        <Metric
          label="Negotiation work"
          value={String(
            summary.negotiation_preparation_required_count || 0,
          )}
          detail="Deals needing preparation"
        />
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>LIVE DEALS</p>
            <h2>Live deals</h2>
          </div>

          <span className={styles.sectionCount}>
            {deals.length} live
          </span>
        </div>

        <div className={styles.list}>
          {deals.map((deal: any) => {
            const controlInstruction =
              deal.next_control_fix?.instruction || '';

            const nextMove =
              controlInstruction ||
              deal.next_best_move?.instruction ||
              deal.next_decision ||
              'Review the deal.';

            const hasExpectedCommission =
              deal.expected_commission !== null &&
              deal.expected_commission !== undefined &&
              deal.expected_commission !== '' &&
              Number.isFinite(
                Number(deal.expected_commission),
              );

            const commissionValue =
              hasExpectedCommission && deal.currency
                ? money(
                    deal.expected_commission,
                    deal.currency,
                  )
                : 'Commission not recorded';

            const introductionContext =
              deal.next_best_move
                ?.introduction_context || {};

            const introductionTarget =
              introductionContext?.target_contact
                ?.name || '';

            const introductionRole =
              introductionContext?.target_contact
                ?.role_title || '';

            const introductionVia =
              introductionContext?.intermediary
                ?.name || '';

            const hasIntroductionRoute = Boolean(
              introductionTarget ||
                introductionVia,
            );

            const needsOwner =
              /owner|ownership/i.test(
                controlInstruction,
              );

            const dealFacts = [
              {
                label: 'Stage',
                value: human(
                  deal.stage || 'recorded',
                ),
                detail: human(
                  deal.momentum_state ||
                    'momentum recorded',
                ),
              },
              {
                label: 'Primary blocker',
                value:
                  deal.primary_blocker ||
                  'No blocker recorded',
                detail: human(
                  deal.control_state ||
                    deal.rescue_state ||
                    'control recorded',
                ),
              },
              {
                label: 'Commercial value',
                value: commissionValue,
                detail:
                  hasExpectedCommission
                    ? 'Expected commission'
                    : 'Expected commission not recorded',
              },
              {
                label: 'Access route',
                value:
                  introductionTarget ||
                  deal.organisation ||
                  'No route recorded',
                detail:
                  introductionVia
                    ? `Warm introduction via ${introductionVia}`
                    : introductionRole ||
                      'No warm introduction recorded',
              },
            ];

            const dealAction =
              controlInstruction
                ? {
                    key:
                      `deal-control:${deal.deal_room_id}`,
                    eyebrow: 'DEAL ACTION',
                    title:
                      deal.title || 'Live deal',
                    instruction:
                      controlInstruction,
                    label: needsOwner
                      ? 'Assign owner'
                      : 'Fix this',
                    action:
                      'deal_control_fix_prepare',
                    payload: {
                      deal_room_id:
                        deal.deal_room_id,
                    },
                    context:
                      deal.organisation ||
                      deal.stage,
                    facts: dealFacts,
                    successCondition:
                      deal.next_control_fix
                        ?.success_condition ||
                      (needsOwner
                        ? 'One accountable owner controls the live deal.'
                        : 'The recorded deal-control gap is resolved.'),
                    confirmationLabel:
                      needsOwner
                        ? 'Assign deal owner'
                        : 'Apply fix',
                  }
                : {
                    key:
                      `deal-next:${deal.deal_room_id}`,
                    eyebrow: 'DEAL NEXT MOVE',
                    title:
                      deal.title || 'Live deal',
                    instruction: nextMove,
                    label: hasIntroductionRoute
                      ? 'Prepare introduction'
                      : 'Prepare next move',
                    action:
                      'deal_next_move_prepare',
                    payload: {
                      deal_room_id:
                        deal.deal_room_id,
                    },
                    context:
                      deal.organisation ||
                      deal.stage,
                    facts: dealFacts,
                    successCondition:
                      deal.next_best_move
                        ?.success_condition ||
                      (hasIntroductionRoute
                        ? 'A controlled introduction task is created without sending an external message.'
                        : 'A decision-producing next move is recorded against the live deal.'),
                    confirmationLabel:
                      hasIntroductionRoute
                        ? 'Create introduction task'
                        : 'Create deal checkpoint',
                  };

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
                    {commissionValue}
                  </small>
                </div>

                <div className={styles.rowActions}>
                  <div className={styles.sideStat}>
                    <strong>
                      {human(
                        deal.momentum_state ||
                          'recorded',
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

                  <button
                    type="button"
                    className={styles.compactButton}
                    onClick={() =>
                      onOpenIntelligence({
                        key: `deal-war-room:${deal.deal_room_id}`,
                        kind: 'deal',
                        entityId: String(deal.deal_room_id),
                        title: deal.title || 'Live deal',
                        context: deal.organisation || human(deal.stage),
                      })
                    }
                  >
                    <BriefcaseBusiness size={14} />
                    Open deal
                  </button>

                  <button
                    type="button"
                    className={styles.compactButton}
                    onClick={() =>
                      onOpenAction(dealAction)
                    }
                  >
                    <ArrowRight size={14} />
                    {dealAction.label}
                  </button>
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
                NEEDS ATTENTION
              </p>
              <h2>Deals losing momentum</h2>
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
              Recovery actions are surfaced on the live deal rows above.
            </strong>

            <span>
              Open the deal above to see the blocker and the next action.
              These signals organise work. They do not predict the outcome.
            </span>
          </div>
        </section>
      ) : null}
    </div>
  );
}
