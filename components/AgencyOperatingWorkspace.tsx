'use client';

import AiLauncher from '@/components/AiLauncher';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  CircleAlert,
  Coins,
  LoaderCircle,
  LogOut,
  Network,
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

const commandWorkingView = (command: any): View => {
  const source = String(command?.source_type || '');

  if (source === 'deal_room') return 'deals';
  if (source === 'club_need') return 'market';
  if (source === 'player') return 'players';

  if (
    source === 'organisation' ||
    source === 'person' ||
    source === 'relationship'
  ) {
    return 'relationships';
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
        const [home, operations] = await Promise.all([
          rpc<any>('redream_autopilot_home', {
            p_limit: 8,
          }),
          rpc<any>('redream_autopilot_operations', {
            p_horizon_days: 90,
            p_limit: 20,
          }),
        ]);

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
          owner_business: ownerBusiness,
        });
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
          await rpc<any>('redream_autopilot_relationships', {
            p_limit: 100,
            p_contact_limit: 250,
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
                onOpenAction={openCommandAction}
                onOpenOwner={() => setOwnerCommandOpen(true)}
                onOpenMemory={() => setMemoryOpen(true)}
              />
            ) : null}
            {view === 'players' ? (
              <Players
                data={data}
                onOpenAction={(request) =>
                  setActionRequest(request)
                }
                onOpenIntelligence={setIntelligenceRequest}
              />
            ) : null}
            {view === 'market' ? (
              <Market
                data={data}
                onOpenAction={(request) =>
                  setActionRequest(request)
                }
                onOpenPursuit={setPursuitRequest}
              />
            ) : null}
            {view === 'deals' ? (
              <Deals
                data={data}
                onOpenAction={(request) =>
                  setActionRequest(request)
                }
                onOpenIntelligence={setIntelligenceRequest}
              />
            ) : null}
            {view === 'relationships' ? (
              <Relationships
                data={data}
                rpc={rpc}
                onRefresh={loadView}
                onOpenAction={(request) =>
                  setActionRequest(request)
                }
              />
            ) : null}
          </>
        ) : null}
      </main>

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
  onOpenOwner,
  onOpenMemory,
}: {
  data: any;
  actionBusy: string;
  onPrepare: (command: any) => void;
  onOpenAction: (command: any) => void;
  onOpenOwner: () => void;
  onOpenMemory: () => void;
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

          {top ? (
            topOneTap ? (
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
            ) : (
              <button
                type="button"
                className={styles.heroPrimaryAction}
                onClick={() => onOpenAction(top)}
              >
                <ArrowRight size={15} />
                {top.actionability?.cta || 'Open action'}
              </button>
            )
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
            <p className={styles.eyebrow}>AGENCY MEMORY</p>
            <h2>Movement, decisions and learning</h2>
          </div>

          <button
            type="button"
            className={styles.compactButton}
            onClick={onOpenMemory}
          >
            <Network size={14} />
            Open Agency Memory
          </button>
        </div>

        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>
            <Network size={18} />
          </div>

          <strong>
            See what changed, what was prepared or applied, and what the agency has enough evidence to learn from.
          </strong>

          <span>
            Provenance and reversibility stay visible while weak evidence stays explicitly inconclusive.
          </span>
        </div>
      </section>

      {data?.owner_business ? (
        <section className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>OWNER CONTROL</p>
              <h2>Business position</h2>
            </div>

            <button
              type="button"
              className={styles.compactButton}
              onClick={onOpenOwner}
            >
              <BriefcaseBusiness size={14} />
              Open Owner Command Centre
            </button>
          </div>

          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>
              <Coins size={18} />
            </div>

            <strong>
              Revenue, service, ownership and collection in one evidence-led owner view.
            </strong>

            <span>
              Commercial exposure stays separate from guaranteed revenue, and team load stays factual rather than becoming a made-up utilisation score.
            </span>
          </div>
        </section>
      ) : null}

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

              <button
                type="button"
                className={styles.compactButton}
                onClick={() => onOpenAction(command)}
              >
                <ArrowRight size={14} />
                {command.actionability?.requires_input
                  ? 'Continue'
                  : 'Review'}
              </button>
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
                  <button
                    type="button"
                    className={styles.compactButton}
                    onClick={() => onOpenAction(command)}
                  >
                    <ArrowRight size={14} />
                    Review
                  </button>
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
        eyebrow="PLAYER AUTOPILOT"
        title="Protect value. Move careers."
        copy="Player service, career timing, market coverage and preparation gaps ordered by recorded evidence."
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
              label: 'Service control',
              value: human(serviceState),
              detail: serviceGaps.length
                ? `${serviceGaps.length} recorded gap${serviceGaps.length === 1 ? '' : 's'}`
                : 'No service-control gap recorded',
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
              label: 'Career timing',
              value: human(
                item.career_timing?.market_trigger ||
                  item.player?.contract_status ||
                  'recorded',
              ),
              detail: contractDetail,
            },
            {
              label: 'Market coverage',
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
                    : 'Fix control',
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
                    : 'Apply control fix',
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
                  Player 360
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
              Player service exceptions are surfaced on the cards above.
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

function Relationships({
  data,
  rpc,
  onRefresh,
  onOpenAction,
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
        eyebrow="RELATIONSHIP AUTOPILOT"
        title="Know who can move the conversation."
        copy="Clubs and the people behind them, connected to recorded access, live demand, commercial activity and agency relationship memory."
        icon={Network}
        badge={`${clubSummary.relevant_clubs ?? clubs.length} relevant clubs`}
      />

      <section className={styles.metrics}>
        <Metric
          label="Relevant clubs"
          value={String(
            clubSummary.relevant_clubs ??
              clubs.length,
          )}
          detail="Accounts with current relevance"
        />

        <Metric
          label="Club contacts"
          value={String(
            contactSummary.club_contacts ??
              contacts.length,
          )}
          detail="Current recorded club people"
        />

        <Metric
          label="Strong direct routes"
          value={String(
            contactSummary
              .strong_recorded_direct_relationships ||
              0,
          )}
          detail="Strong recorded agency access"
        />

        <Metric
          label="Open follow-up"
          value={String(
            contactSummary
              .contacts_with_open_follow_up ||
              0,
          )}
          detail="Contacts with recorded work"
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
                    <span>Best route</span>
                    <strong>
                      {routeName}
                    </strong>
                    <small>
                      {routeDetail}
                    </small>
                  </div>

                  <div>
                    <span>Current demand</span>
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
                    <span>Live business</span>
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
                              ? '?view=deals'
                              : String(
                                    topPlay.play_type ||
                                      '',
                                  ) ===
                                  'source_for_confirmed_need'
                                ? '?view=market'
                                : String(
                                      topPlay.play_type ||
                                        '',
                                    ) ===
                                    'pitch_now'
                                  ? '?view=market'
                                  : '?view=relationships',
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
                              ? 'Open Deals'
                              : String(
                                    topPlay.play_type ||
                                      '',
                                  ) ===
                                  'pitch_now'
                                ? 'Open Market'
                                : String(
                                      topPlay.play_type ||
                                        '',
                                    ) ===
                                    'source_for_confirmed_need'
                                  ? 'Open Market'
                                  : 'Return to Relationships',
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
                  : 'Recorded contacts, access routes, club demand and commercial activity will build this view.'
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
        eyebrow="MARKET AUTOPILOT"
        title="Find the route worth moving."
        copy="Recorded club demand and player-club routes, with career control and relationship access made explicit."
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
                                    'Review career strategy',
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
                                        'Career control',
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
                            eyebrow: 'CLUB DEMAND',
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

                  <div className={styles.rowActions}>
                    <div className={styles.sideStat}>
                      <strong>
                        {human(
                          item.pursuit_operating_mode ||
                            'review',
                        )}
                      </strong>
                      <small>operating state</small>
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
                      Open pursuit
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
                            label: 'Review strategy',
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
                                  'Career control',
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
                                  'Operating readiness',
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
        eyebrow="DEAL CONTROL"
        title="Move the deal, not the admin."
        copy="Live commercial work ordered around ownership, momentum, evidence and the next recorded decision."
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
                    eyebrow: 'DEAL CONTROL',
                    title:
                      deal.title || 'Live deal',
                    instruction:
                      controlInstruction,
                    label: needsOwner
                      ? 'Assign owner'
                      : 'Fix control',
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
                        : 'Apply control fix',
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
                    War room
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
              Recovery actions are surfaced on the live deal rows above.
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
