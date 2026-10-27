'use client';

import { isolateElements, lockPageScroll } from '@/lib/page-scroll-lock';
import WorkResponsibilityControl from './WorkResponsibilityControl';
import {workRefFor,homeWorkRefFor,workHref,readAssignedWorkPages} from '@/lib/work-responsibility';
import {homeRelevanceReference} from '@/lib/home-relevance';
import {useHomeRelevance} from './useHomeRelevance';
import {useHomeWork,HomeWorkRow,HomeWorkEditor,HomeWorkFeedback} from './HomeWorkControl';
import AiLauncher from '@/components/AiLauncher';
import AgencyMobileNavigation from './AgencyMobileNavigation';
import {workspaceIntelligenceHref,workspaceIntelligenceListHref,workspaceIntelligenceRequestFromQuery} from '@/lib/workspace-record-navigation';
import PeopleViewSwitcher from './PeopleViewSwitcher';
import WorkspaceSearch from '@/components/WorkspaceSearch';
import type { AgencyCreateKind } from '@/components/AgencyCreateDrawer';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { preparationLink } from '@/lib/capture-preparation';
import {
  ArrowRight,
  ChevronRight,
  BriefcaseBusiness,
  CakeSlice,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Coins,
  FileText,
  LoaderCircle,
  Home as HomeIcon,
  LogOut,
  MessageCircleMore,
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
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import ToolsMenu from './ToolsMenu';

import { useTenantRuntime } from '@/components/TenantRuntimeProvider';
import {
  platformInvoke,
  platformRpc,
  friendlyError,
  relativeDate,
} from '@/lib/platform-client';
import { supabase } from '@/lib/supabase';
import type { AgencyActionRequest } from '@/components/AgencyActionDrawer';
import type { AgencyIntelligenceRequest } from '@/components/AgencyEntityIntelligenceDrawer';
import type { AgencyPursuitRequest } from '@/components/AgencyPursuitRoom';
import type { AgencyDealCloseoutRequest } from '@/components/AgencyDealCloseoutDrawer';
import type { AgencyClubAccountRequest } from '@/components/AgencyClubAccountDrawer';
import type { AgencyNegotiationRequest } from '@/components/AgencyNegotiationCommandRoom';
import type { AgencyPlayerServiceReviewRequest } from '@/components/AgencyPlayerServiceReviewDrawer';
import { readWithDeadline } from '@/lib/read-with-deadline';
import AgencyOwnershipChip from '@/components/AgencyOwnershipChip';
import AccountMenu from '@/components/AccountMenu';
import TenantWorkspaceBrand from '@/components/TenantWorkspaceBrand';
import { tenantBrandCssVariables } from '@/lib/tenant-brand-style';

import { brandingForWorkspace } from '@/lib/workspace-branding';
import { readHomePosition } from '@/lib/read-home-position';
import { homeReadState, settleHomeReads } from '@/lib/agency-home-state';
import { homeCommandCategory, isHomePlayerDataReview, isHomeStatisticsReview, isHomeDetailsReview, type HomeQueueCategory } from '@/lib/home-priority';
import { scheduleWorkspaceWarming } from '@/lib/workspace-prefetch';

import styles from './AgencyOperatingWorkspace.module.css';

function WorkspaceSectionLoading({label = 'workspace'}: {label?: string}) {
  return <section className={styles.viewLoading} role="status" aria-busy="true" aria-atomic="true">
    <LoaderCircle size={18} className={styles.spin} />
    <span>Loading {label}...</span>
  </section>;
}

const AgencyPlayersWorkspace = dynamic(() => import('@/components/AgencyPlayersWorkspace'), {loading: () => <WorkspaceSectionLoading label="players"/>});
const AgencyNetworkWorkspace = dynamic(() => import('@/components/AgencyNetworkWorkspace'), {loading: () => <WorkspaceSectionLoading label="Network"/>});
const AgencyOpportunitiesWorkspace = dynamic(() => import('@/components/AgencyOpportunitiesWorkspace'), {loading: () => <WorkspaceSectionLoading label="opportunities"/>});
const AgencyCalendarWorkspace = dynamic(() => import('@/components/AgencyCalendarWorkspace'), {loading: () => <WorkspaceSectionLoading label="calendar"/>});
const AgencyCreateDrawer = dynamic(() => import('@/components/AgencyCreateDrawer'));
const AgencyRosterMigrationPanel = dynamic(() => import('@/components/AgencyRosterMigrationPanel'));
const AgencyActionDrawer = dynamic(() => import('@/components/AgencyActionDrawer'));
const AgencyContactIntelligenceDrawer = dynamic(() => import('@/components/AgencyContactIntelligenceDrawer'));
const AgencyEntityIntelligenceDrawer = dynamic(() => import('@/components/AgencyEntityIntelligenceDrawer'));
const AgencyPursuitRoom = dynamic(() => import('@/components/AgencyPursuitRoom'));
const AgencyOwnerCommandCentre = dynamic(() => import('@/components/AgencyOwnerCommandCentre'));
const AgencyMemoryDrawer = dynamic(() => import('@/components/AgencyMemoryDrawer'));
const AgencyDealCloseoutDrawer = dynamic(() => import('@/components/AgencyDealCloseoutDrawer'));
const AgencyClubAccountDrawer = dynamic(() => import('@/components/AgencyClubAccountDrawer'));
const AgencyNegotiationCommandRoom = dynamic(() => import('@/components/AgencyNegotiationCommandRoom'));
const AgencyPlayerServiceReviewDrawer = dynamic(() => import('@/components/AgencyPlayerServiceReviewDrawer'));
const AgencyPlayerProfile = dynamic(() => import('@/components/AgencyPlayerProfile'));
const AgencyConnectionsDrawer = dynamic(() => import('@/components/AgencyConnectionsDrawer'));
const AgencyConnectedIdentityResolverDrawer = dynamic(() => import('@/components/AgencyConnectedIdentityResolverDrawer'));
const AgencyConnectedReplyDrawer = dynamic(() => import('@/components/AgencyConnectedReplyDrawer'));
const AgencyMeetingOutcomeDrawer = dynamic(() => import('@/components/AgencyMeetingOutcomeDrawer'));
const AgencyTeamHandoffDrawer = dynamic(() => import('@/components/AgencyTeamHandoffDrawer'));

type View = 'home' | 'players' | 'opportunities' | 'network' | 'calendar' | 'business';

function preloadWorkspaceView(view: View, showPlayerProfile = false) {
  // Start the visible destination alongside its reads, or on navigation intent.
  // Background data warming must not download every hidden page's code.
  let request: Promise<unknown> | undefined;
  if (view === 'players') request = showPlayerProfile
    ? import('@/components/AgencyPlayerProfile')
    : import('@/components/AgencyPlayersWorkspace');
  else if (view === 'network') request = import('@/components/AgencyNetworkWorkspace');
  else if (view === 'opportunities') request = import('@/components/AgencyOpportunitiesWorkspace');
  else if (view === 'calendar') request = import('@/components/AgencyCalendarWorkspace');
  void request?.catch(() => {
    // The rendered destination retains its normal module loading/error path.
  });
}

type ViewCacheEntry = {
  data: any;
  expiresAt: number;
};

const viewDataCache = new Map<string, ViewCacheEntry>();
const viewWarmRequests = new Map<string, Promise<void>>();
const VIEW_CACHE_TTL_MS = 10 * 60_000;

const readViewCache = (key: string) => {
  const cached = viewDataCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    viewDataCache.delete(key);
    return null;
  }
  return cached.data;
};

const writeViewCache = (key: string, data: any) => {
  if (!key || !data) return;
  viewDataCache.set(key, {
    data,
    expiresAt: Date.now() + VIEW_CACHE_TTL_MS,
  });
};

type Workspace = {
  tenant_id: string;
  slug: string;
  role: string;
  is_primary?: boolean;
  synthetic_demo?: boolean;
  display_name?: string | null;
  logo_asset?: string | null;
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
      'What needs attention.',
  },
  players: {
    eyebrow: 'PLAYERS',
    title: 'Players',
    description:
      'Roster and next steps.',
  },
  opportunities: {
    eyebrow: 'OPPORTUNITIES',
    title: 'Opportunities',
    description:
      'Needs, matches and deals.',
  },
  network: {
    eyebrow: 'NETWORK',
    title: 'Network',
    description:
      'Clubs and relationships.',
  },
  calendar: {
    eyebrow: 'CALENDAR',
    title: 'Calendar',
    description:
      'Meetings and deadlines.',
  },
  business: {
    eyebrow: 'BUSINESS',
    title: 'Business',
    description:
      'Deals and revenue.',
  },
};

const ALLOWED_ROLES = ['owner', 'admin', 'agent', 'scout', 'operations'];

const reviewPlayerId = (command: any): string => {
  const review = isHomePlayerDataReview(command) ||
    (command?.source_type === 'task' && /^Review (?:the player record and resolve the flagged issue\.|player data:)/i.test(String(command?.title || '')));
  if (!review) return '';
  const tasks = Array.isArray(command?.evidence?.tasks) ? command.evidence.tasks : [];
  const players = [...new Set(tasks.map((task: any) => String(task?.player_id || '')).filter(Boolean))];
  if (tasks.length && (players.length !== 1 || tasks.some((task: any) => !task?.player_id))) return '';
  return String(command?.player_id || (command?.source_type === 'player' ? command?.source_id : players[0]) || '');
};

const reviewCopy = (command: any) => ({
  title: isHomeDetailsReview(command) ? `Review ${command?.title || 'player'} details` : isHomeStatisticsReview(command) ? `Review ${command?.title || 'player'} statistics` : command?.source_type === 'player' ? `Review ${command?.title || 'player'} data` : `Review reminder · ${command?.evidence?.player_name || 'player'}`,
  reason: command?.source_type === 'player' ? command?.evidence?.review_reason || command?.why_now || 'Review the player profile.' : 'Review the profile, then mark this done.',
});

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

  if (source === 'task') return 'calendar';
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
  if (!state) return 'Upcoming';
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
  const showPlayerProfile =
    Boolean(selectedPlayerId) && search.get('profile') === '1';
  const selectedNetworkPersonId =
    view === 'network' ? String(search.get('person') || '').trim() : '';
  const selectedRecruitmentTargetId =
    view === 'players' ? String(search.get('target') || '').trim() : '';
  const playersSection =
    view === 'players' && search.get('tab') === 'recruitment'
      ? 'recruitment'
      : 'players';
  const opportunitiesSection =
    view === 'opportunities' && search.get('tab') === 'deals'
      ? 'deals'
      : view === 'opportunities' && search.get('tab') === 'routes'
        ? 'routes'
        : 'needs';
  const inlineEntityWorkspaceOpen = Boolean(
    selectedPlayerId || selectedNetworkPersonId || selectedRecruitmentTargetId,
  );
  const requestedMeetingOutcomeId =
    view === 'home'
      ? String(search.get('meetingOutcome') || '').trim()
      : '';

  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [sessionUserId, setSessionUserId] = useState('');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(true);
  const loadSequenceRef = useRef(0);
  const workspaceSequenceRef = useRef(0);
  const authIdentityRef = useRef('');
  const directoryRefreshRef = useRef(false);
  const [directoryRefreshing, setDirectoryRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState('');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [proposal, setProposal] = useState<any>(null);
  const [proposalError, setProposalError] = useState('');
  const confirmationId = useId();
  const confirmationBackdrop = useRef<HTMLDivElement>(null);
  const confirmationDialog = useRef<HTMLElement>(null);
  const confirmationOpener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!proposal || !signedIn || !workspace?.tenant_id) return;
    const previous = confirmationOpener.current || document.activeElement as HTMLElement | null;
    const releaseScroll = lockPageScroll();
    const siblings = [...document.body.children].filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element !== confirmationBackdrop.current,
    );
    const releaseBackground = isolateElements(siblings);

    confirmationDialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      releaseBackground();
      releaseScroll();
      if (previous?.isConnected) previous.focus();
    };
  }, [proposal, signedIn, workspace?.tenant_id]);
  const [actionRequest, setActionRequest] =
    useState<AgencyActionRequest | null>(null);
  const [intelligenceRequest, setIntelligenceRequest] =
    useState<AgencyIntelligenceRequest | null>(null);
  const [pursuitRequest, setPursuitRequest] =
    useState<AgencyPursuitRequest | null>(null);
  const [ownerCommandOpen, setOwnerCommandOpen] = useState(false);
  const [teamHandoffMember, setTeamHandoffMember] = useState<any>(null);
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
  const [connectedIdentityResolverOpen, setConnectedIdentityResolverOpen] =
    useState(false);
  const [connectedReplyRequest, setConnectedReplyRequest] =
    useState<any>(null);
  const [meetingOutcomeRequest, setMeetingOutcomeRequest] =
    useState<any>(null);
  const [openedMeetingOutcomeId, setOpenedMeetingOutcomeId] =
    useState('');
  const previousViewRef = useRef<View>(view);
  const recordRouteQuery = search.toString();

  useEffect(() => {
    setIntelligenceRequest(current => workspaceIntelligenceRequestFromQuery(recordRouteQuery, current, ['owner','admin'].includes(String(workspace?.role || ''))));
    if (previousViewRef.current === view) return;
    previousViewRef.current = view;

    setActionRequest(null);
    setPursuitRequest(null);
    setClubAccountRequest(null);
    setNegotiationRequest(null);
    setPlayerServiceReviewRequest(null);
    setDealCloseoutRequest(null);
    setCreateKind(null);
  }, [view, recordRouteQuery, workspace?.role]);

  const agencyBranding = brandingForWorkspace(runtime, workspace);
  const workspaceName =
    workspace?.display_name ||
    agencyBranding.display_name ||
    'Agency workspace';
  const viewPresentation = VIEW_PRESENTATION[view];
  const stateScope = workspace?.tenant_id && sessionUserId
    ? `${workspace.tenant_id}:${sessionUserId}:${workspace.role}` : '';
  const canSeeBusiness = ['owner', 'admin'].includes(
    String(workspace?.role || ''),
  );
  const canCreateRecords = ['owner','admin','agent','operations'].includes(String(workspace?.role || ''));
  const restrictedView = !canSeeBusiness && ['opportunities','business'].includes(view);
  const navigation = NAV.filter(
    (item) => !['business','opportunities'].includes(item.key) || canSeeBusiness,
  );

  const createAction:
    | { kind: AgencyCreateKind; label: string }
    | null =
    view === 'players' && canCreateRecords &&
    !selectedPlayerId &&
    search.get('tab') !== 'recruitment'
      ? { kind: 'player', label: 'Add player' }
      : view === 'opportunities' && canSeeBusiness
        ? { kind: 'club_need', label: 'Add club need' }
        : null;

  const theme = tenantBrandCssVariables({
    primary:
      workspace?.primary_color ||
      agencyBranding.primary_color,
    secondary: agencyBranding.secondary_color,
    accent:
      workspace?.accent_color ||
      agencyBranding.accent_color,
  });

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
      signal?: AbortSignal,
    ): Promise<T> => {
      if (!workspace?.slug) {
        throw new Error('Agency workspace is not resolved.');
      }

      return platformRpc<T>(
        name,
        args,
        workspace.slug,
        signal,
      );
    },
    [workspace?.slug],
  );

  const warmView = useCallback(
    async (targetView: View, preloadCode = true) => {
      if (
        !workspace?.tenant_id ||
        !workspace?.slug ||
        targetView === 'business' ||
        (targetView === 'opportunities' && !['owner','admin'].includes(String(workspace.role)))
      ) {
        return;
      }

      if (preloadCode) preloadWorkspaceView(targetView);

      const cacheKey = [
        workspace.tenant_id,
        sessionUserId,
        workspace.role,
        targetView,
        targetView === 'players' ? 'players' : 'main',
      ].join(':');

      if (readViewCache(cacheKey)) return;

      const existingRequest = viewWarmRequests.get(cacheKey);
      if (existingRequest) {
        await existingRequest;
        return;
      }

      const request = (async () => {
        try {
          if (targetView === 'home') {
            const home = await readHomePosition(
              () => invoke<any>('home_focus', {limit:8}),
              () => rpc<any>('redream_autopilot_home', {p_limit:8}),
              3000,
            );

            writeViewCache(cacheKey, { home });
            return;
          }

          if (targetView === 'players') {
            const directory = await readWithDeadline(invoke<any>(
              'players_workspace',
              { limit: 100 },
            ), 3000);

            writeViewCache(cacheKey, {
              directory: directory?.players || {},
            });
            return;
          }

          if (targetView === 'opportunities') {
            const market = await readWithDeadline(rpc<any>(
              'redream_autopilot_market',
              { p_limit: 100 },
            ), 3000);

            writeViewCache(cacheKey, {
              market,
              connected: {},
            });
            return;
          }

          if (targetView === 'network') {
            writeViewCache(
              cacheKey,
              await readWithDeadline(rpc<any>('redream_autopilot_relationships', {
                p_limit: 100,
                p_contact_limit: 250,
              }), 3000),
            );
            return;
          }

          if (targetView === 'calendar') {
            writeViewCache(
              cacheKey,
              await readWithDeadline(rpc<any>('redream_autopilot_calendar', {
                p_horizon_days: 90,
                p_limit: 100,
              }), 3000),
            );
          }
        } catch {
          // Warming is opportunistic. The visible view keeps its normal load path.
        }
      })();

      viewWarmRequests.set(cacheKey, request);

      try {
        await request;
      } finally {
        if (viewWarmRequests.get(cacheKey) === request) {
          viewWarmRequests.delete(cacheKey);
        }
      }
    },
    [
      invoke,
      rpc,
      workspace?.slug,
      workspace?.tenant_id,
      sessionUserId,
      workspace?.role,
    ],
  );

  const navigateWorkspaceView = useCallback(
    (targetView: View, href: string) => {
      if (typeof window === 'undefined' || href === window.location.pathname + window.location.search) return;

      setActionRequest(null);
      setIntelligenceRequest(null);
      setPursuitRequest(null);
      setClubAccountRequest(null);
      setNegotiationRequest(null);
      setPlayerServiceReviewRequest(null);
      setDealCloseoutRequest(null);
      setCreateKind(null);
      if (targetView !== view) void warmView(targetView);
      window.history.pushState(
        { redreamView: targetView },
        '',
        href,
      );
    },
    [view, warmView],
  );

  const resolveWorkspace = useCallback(async () => {
    const sequence = ++workspaceSequenceRef.current;
    const identity = sessionUserId;
    const current = () => sequence === workspaceSequenceRef.current && authIdentityRef.current === identity;
    if (!targetSlug) {
      setError('Workspace unavailable.');
      setBusy(false);
      return;
    }

    setBusy(true);
    setError('');

    try {
      const result = await readWithDeadline(platformInvoke<{ tenants?: Workspace[] }>(
        'agency-os',
        { action: 'tenants' },
      ));
      if (!current()) return;
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
          'This account does not have staff access.',
        );
        return;
      }

      setWorkspace(match);
    } catch (loadError) {
      if (!current()) return;
      setWorkspace(null);
      setData(null);
      setError(friendlyError(loadError));
    } finally {
      if (current()) setBusy(false);
    }
  }, [targetSlug, sessionUserId]);

  const loadView = useCallback(async (options?: { rejectOnError?: boolean }) => {
    if (!workspace?.tenant_id) return;

    const requestId = ++loadSequenceRef.current;
    const isCurrent = () => loadSequenceRef.current === requestId;
    if (!['owner','admin'].includes(String(workspace.role)) && ['opportunities','business'].includes(view)) {
      setError('');
      setProposal(null);
      setData({access:{restricted:true}});
      setBusy(false);
      setDirectoryRefreshing(false);
      return;
    }
    directoryRefreshRef.current = view === 'players' && playersSection === 'players' && !inlineEntityWorkspaceOpen;
    setDirectoryRefreshing(directoryRefreshRef.current);

    if (view === 'players' && inlineEntityWorkspaceOpen) {
      setError('');
      setData({ directory: {}, recruitment: {} });
      setBusy(false);
      return;
    }

    const cacheKey = [
      workspace.tenant_id,
      sessionUserId,
      workspace.role,
      view,
      view === 'players' ? playersSection : 'main',
    ].join(':');
    let cached = readViewCache(cacheKey);

    if (!cached) {
      const warming = viewWarmRequests.get(cacheKey);
      if (warming) {
        setError('');
        setProposal(null);
        setData(null);
        setBusy(true);
        await warming;
        if (!isCurrent()) return;
        cached = readViewCache(cacheKey);
      }
    }

    const cachedSupportsVisibleView =
      view !== 'opportunities' ||
      (opportunitiesSection === 'deals'
        ? Boolean(cached?.deals)
        : Boolean(cached?.market));
    let latestData = cached;

    const commit = (nextData: any) => {
      if (!isCurrent()) return;
      latestData = nextData;
      writeViewCache(cacheKey, nextData);
      if (isCurrent()) setData(nextData);
    };

    const merge = (patch: Record<string, unknown>) => {
      commit({ ...(latestData || {}), ...patch });
    };

    setError('');
    setProposal(null);

    if (cached && cachedSupportsVisibleView) {
      setData(cached);
      setBusy(false);
    } else {
      setData(null);
      setBusy(true);
    }

    try {
      if (view === 'home') {
        const home = await readHomePosition(
          () => invoke<any>('home_focus', {limit:8}),
          () => rpc<any>('redream_autopilot_home', {p_limit:8}),
        );

        commit({ ...(latestData || {}), home, home_reads: { operations: 'loading', connected_work: 'loading', meeting_aftercare: 'loading' }, home_read_version: requestId });
        if (isCurrent()) setBusy(false);

        void Promise.allSettled([
          ['owner','admin'].includes(String(workspace.role))
            ? readWithDeadline(rpc<any>('redream_autopilot_operations', {p_horizon_days:90,p_limit:20}))
            : Promise.resolve({access:{restricted:true}}),
          readWithDeadline(rpc<any>('redream_connected_work', {
            p_limit: 6,
          })),
          readWithDeadline(rpc<any>('redream_meeting_aftercare', {
            p_limit: 12,
          })),
        ]).then((reads) => {
          if (!isCurrent()) return;
          merge(settleHomeReads(latestData || {}, reads));
        });
      } else if (view === 'players') {
        if (playersSection === 'recruitment') {
          const recruitment = await readWithDeadline(invoke<any>('recruitment_board', {
            limit: 250,
          }));

          merge({
            recruitment: recruitment?.recruitment || {},
          });
        } else {
          let response = await readWithDeadline(invoke<any>('players_workspace', { limit: 100, offset: 0 }));
          let directory = response?.players || {};
          const items = [...(directory.items || [])];
          const wanted = Math.max(100, cached?.directory?.items?.length || 100);
          while (directory.has_more && items.length < wanted) {
            if (!isCurrent()) return;
            response = await readWithDeadline(invoke<any>('players_workspace', { limit: 100, offset: directory.next_offset }));
            const next = response?.players || {};
            if (!(next.next_offset > directory.next_offset)) break;
            directory = next;
            items.push(...(next.items || []));
          }
          merge({ directory: { ...directory, items } });
        }
      } else if (view === 'opportunities') {
        if (opportunitiesSection === 'deals') {
          const deals = await readWithDeadline(rpc<any>('redream_autopilot_deals', {
            p_limit: 100,
          }));

          commit({
            ...(latestData || {}),
            market: latestData?.market,
            deals,
            opportunity_errors: {},
            connected: latestData?.connected || {},
          });
          if (isCurrent()) setBusy(false);

          void Promise.allSettled([
            readWithDeadline(rpc<any>('redream_autopilot_market', {
              p_limit: 100,
            })),
            readWithDeadline(rpc<any>('redream_opportunity_connected_context', {
              p_limit: 100,
            })),
          ]).then((reads) => {
            if (!isCurrent()) return;
            merge({
              opportunity_errors: { market: reads[0]?.status === 'rejected' },
              market:
                reads[0]?.status === 'fulfilled'
                  ? reads[0].value
                  : latestData?.market,
              connected:
                reads[1]?.status === 'fulfilled'
                  ? reads[1].value
                  : latestData?.connected || {},
            });
          });
        } else {
          const market = await readWithDeadline(rpc<any>('redream_autopilot_market', {
            p_limit: 100,
          }));

          commit({
            ...(latestData || {}),
            market,
            opportunity_errors: {},
            deals: latestData?.deals,
            connected: latestData?.connected || {},
          });
          if (isCurrent()) setBusy(false);

          void Promise.allSettled([
            readWithDeadline(rpc<any>('redream_autopilot_deals', {
              p_limit: 100,
            })),
            readWithDeadline(rpc<any>('redream_opportunity_connected_context', {
              p_limit: 100,
            })),
          ]).then((reads) => {
            if (!isCurrent()) return;
            merge({
              opportunity_errors: { deals: reads[0]?.status === 'rejected' },
              deals:
                reads[0]?.status === 'fulfilled'
                  ? reads[0].value
                  : latestData?.deals,
              connected:
                reads[1]?.status === 'fulfilled'
                  ? reads[1].value
                  : latestData?.connected || {},
            });
          });
        }
      } else if (view === 'network') {
        commit(
          await readWithDeadline(rpc<any>('redream_autopilot_relationships', {
            p_limit: 100,
            p_contact_limit: 250,
          })),
        );
      } else if (view === 'calendar') {
        commit(
          await readWithDeadline(rpc<any>('redream_autopilot_calendar', {
            p_horizon_days: 90,
            p_limit: 100,
          })),
        );
      } else if (view === 'business') {
        if (
          !['owner', 'admin'].includes(
            String(workspace?.role || ''),
          )
        ) {
          if (isCurrent()) {
            setData(null);
            setError(
              'Business is for owners and admins.',
            );
          }
        } else {
          const control = await readWithDeadline(invoke<any>('agency_control_centre'));
          commit({
            owner_business: {
              control: control?.control_centre || null,
              roi: latestData?.owner_business?.roi || null,
              receivables:
                latestData?.owner_business?.receivables || null,
              team_capacity:
                latestData?.owner_business?.team_capacity || null,
            },
          });
          if (isCurrent()) setBusy(false);

          void Promise.allSettled([
            readWithDeadline(invoke<any>('agency_roi_proof', {
              window_days: 30,
            })),
            readWithDeadline(invoke<any>('receivables_command', {
              horizon_days: 90,
              limit: 100,
            })),
            readWithDeadline(invoke<any>('team_capacity')),
          ]).then((results) => {
            if (!isCurrent()) return;
            const value = (index: number, key: string) =>
              results[index]?.status === 'fulfilled'
                ? (results[index] as PromiseFulfilledResult<any>)
                    .value?.[key] || null
                : null;

            merge({
              owner_business: {
                control: control?.control_centre || null,
                roi: value(0, 'roi'),
                receivables: value(1, 'receivables'),
                team_capacity: value(2, 'capacity'),
              },
            });
          });
        }
      }
    } catch (loadError) {
      if (isCurrent()) setError(friendlyError(loadError));
      if (options?.rejectOnError) throw loadError;
    } finally {
      if (isCurrent()) {
        directoryRefreshRef.current = false;
        setDirectoryRefreshing(false);
        setBusy(false);
      }
    }
  }, [
    inlineEntityWorkspaceOpen,
    invoke,
    opportunitiesSection,
    playersSection,
    rpc,
    view,
    workspace?.role,
    workspace?.tenant_id,
    sessionUserId,
  ]);

  // Editors must distinguish a confirmed write from a failed list refresh.
  // Ordinary navigation/refresh keeps its existing page-level error handling.
  const refreshRecords = useCallback(() => loadView({ rejectOnError: true }), [loadView]);
  const handleCaptureCompleted = useCallback(() => { void loadView(); }, [loadView]);
  const openIntelligenceRequest = useCallback((request: AgencyIntelligenceRequest) => {
    setIntelligenceRequest(request);
    const href = workspaceIntelligenceHref(basePath, window.location.search, request);
    if (href && href !== window.location.pathname + window.location.search) {
      window.history.pushState(null, '', href);
    }
  }, [basePath]);
  const closeIntelligenceRequest = useCallback((request: AgencyIntelligenceRequest) => {
    const href = workspaceIntelligenceListHref(basePath, window.location.search, request);
    if (href) window.history.replaceState(null, '', href);
    setIntelligenceRequest(current => current?.kind === request.kind && current.entityId === request.entityId ? null : current);
  }, [basePath]);

  useEffect(() => {
    let active = true;

    const acceptSession = (session: {user: {id: string}} | null) => {
      if (!active) return;
      const identity = session?.user.id || '';
      if (identity !== authIdentityRef.current) {
        authIdentityRef.current = identity;
        loadSequenceRef.current++;
        workspaceSequenceRef.current++;
        setWorkspace(null);
        setData(null);
        setProposal(null);
        setProposalError('');
        setIntelligenceRequest(null);
        setClubAccountRequest(null);
        setActionRequest(null);
        setPursuitRequest(null);
        setDirectoryRefreshing(false);
        directoryRefreshRef.current = false;
      }
      setSignedIn(Boolean(identity));
      setSessionUserId(identity);
      setSessionReady(true);
      if (!identity) setBusy(false);
    };
    let authEvent = 0;
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return;
        authEvent++;
        if (event === 'SIGNED_OUT') {
          loadSequenceRef.current++;
          workspaceSequenceRef.current++;
        }
        acceptSession(session);
      },
    );

    const initialEvent = authEvent;
    void readWithDeadline(supabase.auth.getSession()).then(({data: auth,error}) => {
      if (!active || initialEvent !== authEvent) return;
      if (error) throw error;
      acceptSession(auth.session);
    }).catch(error => {
      if (!active) return;
      setSessionReady(true);
      setBusy(false);
      setError(friendlyError(error));
    });
    return () => {
      active = false;
      loadSequenceRef.current++;
      workspaceSequenceRef.current++;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (sessionReady && signedIn) void resolveWorkspace();
  }, [resolveWorkspace, sessionReady, signedIn]);

  useEffect(() => {
    if (!signedIn || !workspace?.tenant_id || restrictedView) return;
    preloadWorkspaceView(view, showPlayerProfile);
  }, [view, showPlayerProfile, signedIn, workspace?.tenant_id, restrictedView]);

  useEffect(() => {
    if (workspace?.tenant_id) void loadView();
    return () => { loadSequenceRef.current++; };
  }, [loadView, workspace?.tenant_id]);

  useEffect(() => {
    if (
      !workspace?.tenant_id ||
      busy ||
      inlineEntityWorkspaceOpen
    ) {
      return;
    }

    const targets: View[] = [
      'home',
      'players',
      'opportunities',
      'network',
      'calendar',
    ].filter((targetView) => targetView !== view) as View[];

    return scheduleWorkspaceWarming(async (canContinue) => {
      if (!canContinue()) return;
      const priorityTargets = targets.slice(0, 2);
      const remainingTargets = targets.slice(2);

      await Promise.allSettled(
        priorityTargets.map((targetView) => warmView(targetView, false)),
      );

      for (const targetView of remainingTargets) {
        if (!canContinue()) return;
        await warmView(targetView, false);
        await new Promise((resolve) =>
          window.setTimeout(resolve, 60),
        );
      }
    });
  }, [
    busy,
    inlineEntityWorkspaceOpen,
    view,
    warmView,
    workspace?.tenant_id,
  ]);

  useEffect(() => {
    if (
      view !== 'home' ||
      !requestedMeetingOutcomeId ||
      openedMeetingOutcomeId === requestedMeetingOutcomeId
    ) {
      return;
    }

    const items = Array.isArray(data?.meeting_aftercare?.items)
      ? data.meeting_aftercare.items
      : [];
    const meeting = items.find(
      (item: any) =>
        String(item?.meeting_id || '') ===
        requestedMeetingOutcomeId,
    );

    if (!meeting) return;

    setOpenedMeetingOutcomeId(requestedMeetingOutcomeId);
    setMeetingOutcomeRequest(meeting);

    const next = new URLSearchParams(search.toString());
    next.delete('meetingOutcome');
    const query = next.toString();

    window.history.replaceState(
      null,
      '',
      `${basePath}${query ? `?${query}` : ''}`,
    );
  }, [
    basePath,
    data,
    openedMeetingOutcomeId,
    requestedMeetingOutcomeId,
    search,
    view,
  ]);

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
      null,
      '',
      `${basePath}${query ? `?${query}` : ''}`,
    );
  }, [basePath, search]);

  const closeClubAccount = () => {
    setClubAccountRequest(null);

    if (view !== 'network' || !search.get('club')) return;

    const next = new URLSearchParams(search.toString());
    next.delete('club');
    const query = next.toString();
    window.history.replaceState(
      null,
      '',
      `${basePath}${query ? `?${query}` : ''}`,
    );
  };

  const openCommandAction = (command: any) => {
    const destination = commandWorkingView(command);

    const linkedPlayerId = String(command?.player_id || '').trim();
    const fallbackHref = linkedPlayerId
      ? `${basePath}?view=players&player=${encodeURIComponent(linkedPlayerId)}&profile=1`
      :
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
        'Review the evidence and decide.',
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
        linkedPlayerId ? 'Open player profile' : destination === 'home'
          ? 'Return to Today'
          : `Open ${NAV.find((item) => item.key === destination)?.label || 'working area'}`,
    });
  };

  const loadMorePlayers = async () => {
    const directory = data?.directory;
    if (!directory?.has_more || !workspace?.tenant_id || directoryRefreshRef.current) return;
    const sequence = loadSequenceRef.current;
    const response = await readWithDeadline(invoke<any>('players_workspace', { limit: 100, offset: directory.next_offset }));
    if (sequence !== loadSequenceRef.current) return;
    const next = response?.players;
    if (!next || !Array.isArray(next.items)) throw new Error('Players could not load. Try again.');
    const items = [...new Map([...(directory.items || []), ...next.items].map(item => [item.player_id, item])).values()];
    const nextData = { ...data, directory: { ...next, items } };
    writeViewCache([workspace.tenant_id, sessionUserId, workspace.role, 'players', 'players'].join(':'), nextData);
    setData(nextData);
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

    confirmationOpener.current = document.activeElement as HTMLElement | null;
    setActionBusy(commandId);
    setError('');
    setProposalError('');
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
    setProposalError('');
    try {
      await invoke('action_execute', {
        proposal_id: proposalId,
      });
      setProposal(null);
      await loadView();
    } catch (actionError) {
      setProposalError(friendlyError(actionError));
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
            data-ui-button="primary"
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
          <h1>Workspace unavailable</h1>
          <p>{error || 'Staff access is required.'}</p>
          <button
            type="button"
            data-ui-button="secondary"
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
    <div className={styles.root} style={theme} data-interface="calm" data-mobile-workspace data-people-directory={['players','network'].includes(view)&&!inlineEntityWorkspaceOpen&&playersSection!=='recruitment'?'true':undefined}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <TenantWorkspaceBrand
            branding={agencyBranding}
            href={basePath}
          />
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
                prefetch={false}
                aria-current={view === item.key ? 'page' : undefined}
                className={`${view === item.key ? styles.navActive : ''} ${item.key === 'business' ? styles.navManagement : ''}`}
                onPointerDown={() => void warmView(item.key)}
                onPointerEnter={() => void warmView(item.key)}
                onFocus={() => void warmView(item.key)}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }

                  event.preventDefault();
                  navigateWorkspaceView(item.key, href);
                }}
              >
                <Icon size={17} />
                {item.key === 'opportunities' ? <>
                  <span className={styles.navDesktopLabel}>{item.label}</span>
                  <span className={styles.navMobileLabel}>Market</span>
                </> : <span>{item.label}</span>}
              </Link>
            );
          })}
          <WorkspaceSearch compact className={styles.findButton}
            tenantId={workspace.tenant_id} userId={sessionUserId}
            basePath={basePath} cacheScope={stateScope} invoke={invoke} rpc={rpc}
            seed={{view,data}} onCreate={setCreateKind}/>
        </nav>

        <div className={styles.sidebarFoot}>
          <div>
            <span>{human(workspace.role)}</span>
            {workspace.synthetic_demo ? <small>Demo workspace</small> : null}
          </div>
          <button data-ui-button="tertiary" type="button" onClick={() => void signOut()}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={`${styles.pageHead} ${inlineEntityWorkspaceOpen ? styles.pageHeadHidden : ''}`}>
          <div className={styles.mobileTenantBrand}>
            <TenantWorkspaceBrand branding={agencyBranding} href={basePath} compact />
          </div>
          <div className={styles.pageHeadCopy}>
            <div className={styles.pageHeadTitleLine}>
              <div>
                <h1>{viewPresentation.title}</h1>
              </div>
            </div>
          </div>
          <div className={styles.desktopHeadActions}>
            <AiLauncher onCaptureCompleted={handleCaptureCompleted} />
            {createAction && view !== 'players' ? (
              <button
                type="button"
                data-ui-button="secondary"
                className={styles.createButton}
                onClick={() => setCreateKind(createAction.kind)}
              >
                <Plus size={15} />
                {createAction.label}
              </button>
            ) : null}
            <ToolsMenu className={styles.workspaceTools} menuClassName={styles.workspaceToolsMenu} label="Workspace tools">
                {canSeeBusiness ? <Link data-ui-button="tertiary" className={styles.refresh} href={'/workspace/' + encodeURIComponent(workspace.slug) + '/documents'}><FileText size={15}/>Documents</Link> : null}
                <button
                  type="button"
                  data-ui-button="tertiary"
                  className={styles.refresh}
                  onClick={() => setConnectionsOpen(true)}
                  title="Connections"
                >
                  <PlugZap size={15} />
                  Connections
                </button>
                {view === 'players' &&
                ['owner', 'admin', 'operations'].includes(
                  workspace.role,
                ) ? (
                  <button
                    type="button"
                    data-ui-button="tertiary"
                  className={styles.refresh}
                    onClick={() => setRosterImportOpen(true)}
                  >
                    Import players
                  </button>
                ) : null}
                <button
                  type="button"
                  data-ui-button="tertiary"
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
            </ToolsMenu>
            <AccountMenu
              workspace={workspace}
              onSignOut={signOut}
            />
          </div>
          <div className={styles.mobileHeadActions}>
            <AccountMenu
              workspace={workspace}
              onSignOut={signOut}
            />
          </div>
        </header>

        {['players','network'].includes(view)&&!inlineEntityWorkspaceOpen&&playersSection!=='recruitment'?<PeopleViewSwitcher basePath={basePath} view={view} onNavigate={navigateWorkspaceView}/>:null}
        {createAction && !inlineEntityWorkspaceOpen && view !== 'players' ? (
          <div className={styles.mobileContextAction}>
            <button
              type="button"
              data-ui-button="secondary"
              className={styles.createButton}
              onClick={() => setCreateKind(createAction.kind)}
            >
              <Plus size={15} />
              {createAction.label}
            </button>
          </div>
        ) : null}

        {showFirstValueHandoff && view === 'opportunities' ? (
          <section className={styles.firstValueHandoff}>
            <div className={styles.firstValueHandoffIcon}>
              <CheckCircle2 size={20} />
            </div>
            <div className={styles.firstValueHandoffCopy}>
              <p className={styles.eyebrow}>FIRST WORKING VALUE REACHED</p>
              <h2>Ready to go</h2>
              <p>
                Your player, contact and opportunity are connected. Keep the next step current here.
              </p>
            </div>
            <button
              type="button"
              data-ui-button="primary"
              className={styles.firstValueHandoffAction}
              onClick={() => setShowFirstValueHandoff(false)}
            >
              Continue working
            </button>
          </section>
        ) : null}

        {error ? (
          <div>
            <ErrorBox text={error} />
            <button type="button" data-ui-button="secondary"
              className={styles.secondaryButton}
              disabled={busy} onClick={() => void loadView()}>
              <RefreshCw size={15} />
              {busy ? 'Trying again...' : 'Try again'}
            </button>
          </div>
        ) : null}

        {busy && !data ? (
          <WorkspaceSectionLoading label={view === 'players' && playersSection === 'recruitment' ? 'recruitment' : view === 'home' ? 'your day' : view}/>
        ) : null}

        {data ? (
          <div
            className={styles.viewStage}
            key={`view:${stateScope}:${view}:${selectedPlayerId || playersSection}:${opportunitiesSection}`}
          >
            {restrictedView ? (
              <section className={styles.sectionCard}>
                <h2>Admin access needed</h2>
                <p>Commercial records are for owners and admins.</p>
                <Link className={styles.homeTextLink} href={basePath+'?view=players'}>Open assigned players <ChevronRight size={14}/></Link>
              </section>
            ) : null}
            {view === 'home' ? (
              <Home
                rpc={rpc}
                tenantId={workspace.tenant_id}
                userId={sessionUserId}
                data={data}
                basePath={basePath}
                workspaceSlug={String(workspace?.slug || targetSlug || '')}
                actionBusy={actionBusy}
                onRetry={() => void loadView()}
                onPrepare={prepareCommand}
                onOpenAction={openCommandAction}
                onPrepareConnectedReply={(interaction) =>
                  setConnectedReplyRequest(interaction)
                }
                onRecordMeetingOutcome={(meeting) =>
                  setMeetingOutcomeRequest(meeting)
                }
              />
            ) : null}
            {view === 'players' ? (
              showPlayerProfile ? (
                <AgencyPlayerProfile
                  key={`player-profile:${selectedPlayerId}`}
                  playerId={selectedPlayerId}
                  preparation={preparationLink(search.get("capture"), search.get("preparation"))}
                  backHref={`${basePath}?view=players`}
                  cacheScope={stateScope}
                  workHref={`${basePath}?view=players&player=${encodeURIComponent(selectedPlayerId)}`}
                  role={String(workspace?.role || '')}
                  fallbackAgency={agencyBranding}
                  invoke={(action, body) => invoke<any>(action, body)}
                  rpc={rpc}
                  onOpenAction={(request) => setActionRequest(request)}
                  onOpenIntelligence={(playerId, title, context) =>
                    openIntelligenceRequest({
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
                  stateScope={stateScope}
                  canManageRecords={canSeeBusiness}
                  canCreateRecords={canCreateRecords}
                  onCreatePlayer={() => setCreateKind('player')}
                  onRecordRefresh={refreshRecords}
                  data={data}
                  basePath={basePath}
                  invoke={invoke}
                  rpc={rpc}
                  onRefresh={loadView}
                  onLoadMore={loadMorePlayers}
                  directoryRefreshing={directoryRefreshing}
                  onOpenAction={(request) => setActionRequest(request)}
                />
              )
            ) : null}
            {view === 'opportunities' && canSeeBusiness ? (
              <AgencyOpportunitiesWorkspace
                onRecordRefresh={refreshRecords}
                key={stateScope}
                invoke={invoke}
                onRetry={() => void loadView()}
                onRefresh={loadView}
                rpc={rpc}
                data={data}
                basePath={basePath}
                onOpenAction={(request) =>
                  setActionRequest(request)
                }
                onOpenPursuit={setPursuitRequest}
                onOpenIntelligence={openIntelligenceRequest}
              />
            ) : null}
            {view === 'network' ? (
              <AgencyNetworkWorkspace
                onRecordRefresh={refreshRecords}
                key={stateScope}
                stateScope={stateScope}
                canManageRecords={canSeeBusiness}
                canCreateRecords={canCreateRecords}
                data={data}
                basePath={basePath}
                rpc={rpc}
                onRefresh={loadView}
                onCreate={(kind) => setCreateKind(kind)}
                onOpenAction={(request) =>
                  setActionRequest(request)
                }
                onOpenClubAccount={setClubAccountRequest}
              />
            ) : null}
            {view === 'calendar' ? (
              <AgencyCalendarWorkspace
                key={`calendar:${workspace.tenant_id}:${sessionUserId}`}
                preferenceKey={`${workspace.tenant_id}:${sessionUserId}`}
                tenantId={workspace.tenant_id}
                userId={sessionUserId}
                data={data}
                basePath={basePath}
                rpc={rpc}
                onRecordMeetingOutcome={(meeting) =>
                  setMeetingOutcomeRequest(meeting)
                }
              />
            ) : null}
            {view === 'business' && canSeeBusiness ? (
              <Business
                data={data}
                onOpenOwner={() => setOwnerCommandOpen(true)}
              />
            ) : null}
          </div>
        ) : null}
      </main>

      <AgencyMobileNavigation basePath={basePath} workspaceSlug={workspace.slug} view={view} canSeeBusiness={canSeeBusiness} onCaptureCompleted={handleCaptureCompleted}
        search={{tenantId:workspace.tenant_id,userId:sessionUserId,basePath,cacheScope:stateScope,invoke,rpc,seed:{view,data},onCreate:setCreateKind}}
        onNavigate={navigateWorkspaceView} onWarm={target=>void warmView(target)} onConnections={()=>setConnectionsOpen(true)}/>

      {connectionsOpen ? (
        <AgencyConnectionsDrawer
          key={`connections:${workspace.slug}`}
          workspaceSlug={workspace.slug}
          onClose={() => setConnectionsOpen(false)}
          onResolveIdentities={() =>
            setConnectedIdentityResolverOpen(true)
          }
        />
      ) : null}

      {connectedIdentityResolverOpen ? (
        <AgencyConnectedIdentityResolverDrawer
          key={`connected-identity:${workspace.slug}`}
          workspaceSlug={workspace.slug}
          networkHref={`${basePath}?view=network`}
          onClose={() => setConnectedIdentityResolverOpen(false)}
          onResolved={async () => {
            await loadView();
          }}
        />
      ) : null}

      {connectedReplyRequest ? (
        <AgencyConnectedReplyDrawer
          key={`connected-reply:${connectedReplyRequest.interaction_id}`}
          tenantId={workspace.tenant_id}
          interaction={connectedReplyRequest}
          onClose={() => setConnectedReplyRequest(null)}
        />
      ) : null}

      {meetingOutcomeRequest ? (
        <AgencyMeetingOutcomeDrawer
          key={`meeting-outcome:${meetingOutcomeRequest.meeting_id}`}
          meeting={meetingOutcomeRequest}
          rpc={rpc}
          onClose={() => setMeetingOutcomeRequest(null)}
          onSaved={async () => {
            setMeetingOutcomeRequest(null);
            await loadView();
          }}
        />
      ) : null}

      {createKind ? (
        <AgencyCreateDrawer
          key={`create:${createKind}`}
          kind={createKind}
          theme={theme}
          invoke={(action, body) => invoke<any>(action, body)}
          onClose={() => setCreateKind(null)}
          onCreated={refreshRecords}
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
          presentation="page"
          rpc={rpc}
          canManageRecords={canSeeBusiness}
          onRefresh={refreshRecords}
          invoke={invoke}
          onClose={() => closeIntelligenceRequest(intelligenceRequest)}
          onOpenAction={(request) => {
            setActionRequest(request);
          }}
          onOpenCloseout={(dealRoomId, title, context) => {
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
          presentation="page"
          role={String(workspace?.role || '')}
          marketData={data}
          invoke={(action, body) =>
            marketInvoke<any>(action, body)
          }
          onClose={() => setPursuitRequest(null)}
          onOpenAction={(request) => {
            setActionRequest(request);
          }}
          onOpenDeal={(dealRoomId, title, context) => {
            setPursuitRequest(null);
            openIntelligenceRequest({
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
          presentation="page"
          invoke={invoke}
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
          presentation="page"
          role={String(workspace?.role || '')}
          invoke={invoke}
          onClose={() => setNegotiationRequest(null)}
          onOpenAction={(request) => {
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
          presentation="page"
          invoke={invoke}
          rpc={rpc}
          onRefresh={refreshRecords}
          onClose={closeClubAccount}
          onOpenAction={(request) => {
            setActionRequest(request);
          }}
          onOpenDeal={(dealRoomId, title, context) => {
            closeClubAccount();
            openIntelligenceRequest({
              key: `deal-war-room:${dealRoomId}`,
              kind: 'deal',
              entityId: dealRoomId,
              title,
              context,
            });
          }}
          onOpenMarket={(needId) => {
            setClubAccountRequest(null);
            window.history.pushState(
              null,
              '',
              `${basePath}?view=opportunities${needId ? '&tab=needs&record=' + encodeURIComponent(needId) : ''}`,
            );
          }}
          onOpenPursuit={(request) => {
            closeClubAccount();
            setPursuitRequest(request);
          }}
          onOpenPlayer={(playerId) => {
            setClubAccountRequest(null);
            window.history.pushState(
              null,
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
          presentation="page"
          role={String(workspace?.role || '')}
          invoke={invoke}
          onClose={() => setDealCloseoutRequest(null)}
          onApplied={async () => {
            await loadView();
          }}
        />
      ) : null}

      {memoryOpen ? (
        <AgencyMemoryDrawer
          presentation="page"
          invoke={invoke}
          onClose={() => setMemoryOpen(false)}
          onApplied={async () => {
            await loadView();
          }}
        />
      ) : null}

      {ownerCommandOpen && data?.owner_business ? (
        <AgencyOwnerCommandCentre
          data={data.owner_business}
          presentation="page"
          onClose={() => setOwnerCommandOpen(false)}
          onOpenDeal={(dealRoomId, title, context) => {
            setOwnerCommandOpen(false);
            openIntelligenceRequest({
              key: `deal-war-room:${dealRoomId}`,
              kind: 'deal',
              entityId: dealRoomId,
              title,
              context,
            });
          }}
          onOpenAction={(request) => {
            setActionRequest(request);
          }}
          onOpenHandoff={(member) => {
            setTeamHandoffMember(member);
          }}
        />
      ) : null}

      {teamHandoffMember ? (
        <AgencyTeamHandoffDrawer
          key={`team-handoff:${teamHandoffMember.user_id}`}
          workspaceSlug={workspace.slug}
          member={teamHandoffMember}
          onClose={() => {
            setTeamHandoffMember(null);
          }}
          onApplied={async () => {
            await loadView();
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

      {proposal && typeof document !== 'undefined' ? createPortal(
        <div ref={confirmationBackdrop} className={styles.modalBackdrop} style={theme}
          onKeyDown={event => {
            if (event.key === 'Escape' && !actionBusy) { event.preventDefault(); setProposal(null); }
            if (event.key !== 'Tab') return;
            const buttons = [...(confirmationDialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])];
            const first = buttons[0], last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }}>
          <section ref={confirmationDialog} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={confirmationId}>
            <div className={styles.authMark}>
              <CheckCircle2 size={18} />
            </div>
            <p className={styles.eyebrow}>CONFIRM ACTION</p>
            <h2 id={confirmationId}>
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
            {proposalError ? <div><ErrorBox text={proposalError} /></div> : null}
            <div className={styles.modalActions}>
              <button
                type="button"
                data-ui-button="secondary"
              className={styles.secondaryButton}
                onClick={() => setProposal(null)}
                disabled={Boolean(actionBusy)}
              >
                Cancel
              </button>
              <button
                type="button"
                data-ui-button="primary"
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
        </div>, document.body
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
    <div className={styles.error} role="alert" aria-atomic="true">
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
  action,
}: {
  icon: typeof Users;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyStateIcon}>
        <Icon size={18} />
      </div>
      <strong>{title}</strong>
      <span>{copy}</span>
      {action ? <div className={styles.emptyStateAction}>{action}</div> : null}
    </div>
  );
}

function Home({
  rpc,
  tenantId,
  userId,
  data,
  basePath,
  workspaceSlug,
  actionBusy,
  onPrepare,
  onRetry,
  onOpenAction,
  onPrepareConnectedReply,
  onRecordMeetingOutcome,
}: {
  rpc: <T=any>(name:string,args?:Record<string,unknown>)=>Promise<T>;
  tenantId: string;
  userId: string;
  data: any;
  basePath: string;
  workspaceSlug: string;
  actionBusy: string;
  onRetry: () => void;
  onPrepare: (command: any) => void;
  onOpenAction: (command: any) => void;
  onPrepareConnectedReply: (interaction: any) => void;
  onRecordMeetingOutcome: (meeting: any) => void;
}) {
  const restricted = Boolean(data?.home?.access?.restricted);
  const [agencyOverview,setAgencyOverview]=useState(false);
  const homeWork = useHomeWork(rpc,tenantId,userId);
  const retryHome=useRef(onRetry);retryHome.current=onRetry;
  const assignedScope=tenantId+':'+userId;
  const [assignedLoading,setAssignedLoading]=useState(true);
  const [assignedWork,setAssignedWork]=useState<{scope:string;items:any[]}>({scope:'',items:[]});
  const [assignedError,setAssignedError]=useState('');
  useEffect(()=>{
    let alive=true,request=0;
    // Keep local confirmations until both the Home/operations feed and assignments refresh.
    // Only reconcile captured values, never an edit which completed during this read.
    const confirmedOverrides=typeof data?.home_read_version==='number'&&data?.home_reads?.operations==='ready'?homeWork.overrides:{};
    const load=()=>{const token=++request;setAssignedError('');setAssignedLoading(true);void readWithDeadline(readAssignedWorkPages(rpc,tenantId).then(items=>({items}))).then(value=>{if(alive&&token===request){if(!Array.isArray(value?.items)){setAssignedError('Could not confirm your assigned tasks.');}else {setAssignedWork({scope:assignedScope,items:value.items});homeWork.reconcile(confirmedOverrides);}setAssignedLoading(false);}},()=>{if(alive&&token===request){setAssignedError('Could not load your assigned tasks.');setAssignedLoading(false);}});};
    const reload=()=>{retryHome.current();};
    load();window.addEventListener('redream:responsibilities-updated',reload);
    return()=>{alive=false;window.removeEventListener('redream:responsibilities-updated',reload);};
  },[rpc,tenantId,assignedScope,data?.home_read_version,data?.home_reads?.operations]);

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

  const allState = homeReadState(data?.home_reads, [
    'operations',
    'connected_work',
    'meeting_aftercare',
  ]);
  const readNotice = (state: string) => state === 'ready' ? null : (
    <div className={styles.homeReadNotice} role="status">
      <span>{state === 'loading' ? 'Checking...' : 'Some updates failed to load.'}</span>
      {state === 'error' ? (
        <button type="button" className={styles.compactButton} onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );

  const home = data?.home || {};
  const operations = data?.operations || {};
  const connectedWork = data?.connected_work || {};
  const connectedMeetings = Array.isArray(connectedWork?.upcoming_meetings)
    ? connectedWork.upcoming_meetings
    : [];
  const meetingAftercareItems = Array.isArray(data?.meeting_aftercare?.items)
    ? data.meeting_aftercare.items.slice(0, 5)
    : [];

  const confirm = Array.isArray(home?.attention?.confirm)
    ? home.attention.confirm
    : [];
  const judgement = Array.isArray(home?.attention?.judgement)
    ? home.attention.judgement
    : [];
  const delegable = Array.isArray(home?.attention?.delegable)
    ? home.attention.delegable
    : [];
  const commands = [...judgement, ...confirm, ...delegable];
  const activeReviews = new Set(
    commands
      .filter((command: any) => command?.command_type === 'Player review required')
      .map(reviewPlayerId)
      .filter(Boolean),
  );
  const priority = [...judgement, ...confirm, ...delegable]
    .filter(
      (command: any) =>
        !(command?.source_type === 'task' && activeReviews.has(reviewPlayerId(command))),
    )
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
    );

  const deadlines = Array.isArray(operations?.deadlines?.items)
    ? operations.deadlines.items
    : [];
  const birthdays = Array.isArray(operations?.important_dates?.birthdays?.items)
    ? operations.important_dates.birthdays.items
    : [];

  const localDayKey = (value: unknown) => {
    const date = value instanceof Date
      ? value
      : new Date(String(value || ''));
    if (!Number.isFinite(date.getTime())) return '';
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  };
  const now = new Date();
  const todayKey = localDayKey(now);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const dayItems = [
    ...connectedMeetings.map((item: any) => ({
      ...item,
      calendar_kind: 'meeting',
      deadline_at: item?.starts_at,
      title:
        item?.title ||
        item?.person_name ||
        item?.organisation_name ||
        'Meeting',
    })),
    ...deadlines.map((item: any) => ({
      ...item,
      calendar_kind: 'deadline',
    })),
    ...birthdays.map((item: any) => ({
      ...item,
      calendar_kind: 'birthday',
      deadline_at: item?.date_at,
      context: {
        player_id: item?.player_id,
        player_name: item?.player_name,
        person_id: item?.person_id,
        turns_age: item?.turns_age,
      },
    })),
  ];

  const dayHrefFor = (item: any) => {
    const meetingId = String(item?.meeting_id || '').trim();
    if (item?.calendar_kind === 'meeting') {
      return meetingId
        ? `${basePath}?view=calendar&meeting=${encodeURIComponent(meetingId)}`
        : `${basePath}?view=calendar`;
    }

    const playerId = String(
      item?.context?.player_id || item?.player_id || '',
    ).trim();
    if (playerId) {
      return `${basePath}?view=players&player=${encodeURIComponent(playerId)}`;
    }

    const clubNeedId = String(
      item?.context?.club_need_id || item?.club_need_id || (item?.entity_type === 'club_need' ? item?.entity_id : '') || '',
    ).trim();
    const entityType = String(item?.entity_type || '');

    if (entityType === 'deal') {
      return `${basePath}?view=opportunities&tab=deals`;
    }
    if (entityType === 'player_match') {
      return `${basePath}?view=opportunities&tab=routes`;
    }
    if (clubNeedId || entityType === 'club_need') {
      return `${basePath}?view=opportunities&tab=needs${clubNeedId ? '&record=' + encodeURIComponent(clubNeedId) : ''}`;
    }

    const personId = String(
      item?.context?.person_id || item?.person_id || '',
    ).trim();
    if (personId) {
      return `${basePath}?view=network&person=${encodeURIComponent(personId)}`;
    }

    const organisationId = String(
      item?.context?.organisation_id || item?.organisation_id || '',
    ).trim();
    if (organisationId) {
      return `${basePath}?view=network&club=${encodeURIComponent(organisationId)}`;
    }

    return `${basePath}?view=calendar`;
  };

  const actionFor = (command: any) => {
    const playerId = reviewPlayerId(command);
    if (playerId && isHomeDetailsReview(command)) return <Link className={styles.compactButton} href={`${basePath}?view=players&player=${encodeURIComponent(playerId)}&profile=1#player-details`}><ChevronRight size={16}/>Review player details</Link>;
    if (playerId && isHomeStatisticsReview(command)) return <Link className={styles.compactButton} href={`${basePath}?view=players&player=${encodeURIComponent(playerId)}&profile=1#player-data`}><ChevronRight size={16}/>Review suggested figures</Link>;
    if (playerId) return (
      <div className={styles.homeReviewActions}>
        <Link
          className={styles.compactButton}
          href={`${basePath}?view=players&player=${encodeURIComponent(playerId)}&profile=1`}
        >
          <ChevronRight size={16} />
          Review player data
        </Link>
        {command?.source_type === 'task' &&
        Number(command?.evidence?.task_count || 0) === 1 ? (
          <button
            type="button"
            className={styles.compactButton}
            onClick={() => onPrepare(command)}
            disabled={Boolean(actionBusy)}
          >
            <CheckCircle2 size={16} />
            Mark reminder done
          </button>
        ) : null}
      </div>
    );

    if (command?.source_type === 'capture' && command?.source_id) return (
      <Link
        className={styles.compactButton}
        href={`${workspaceSlug ? `/workspace/${encodeURIComponent(workspaceSlug)}/capture` : '/tell'}?capture=${encodeURIComponent(command.source_id)}`}
      >
        <ChevronRight size={16} />
        Answer question
      </Link>
    );

    const replyInteractionId =
      command?.source_type === 'task' &&
      Number(command?.evidence?.task_count || 0) === 1
        ? String(command?.reply_interaction_id || '').trim()
        : '';

    if (replyInteractionId) {
      return (
        <button
          type="button"
          className={styles.compactButton}
          onClick={() =>
            onPrepareConnectedReply({
              interaction_id: replyInteractionId,
            })
          }
        >
          <MessageCircleMore size={14} />
          Prepare reply
        </button>
      );
    }

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
            <ChevronRight size={16} />
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
        <ChevronRight size={16} />
        {command.actionability?.cta || 'Open'}
      </button>
    );
  };

  type QueueCategory = HomeQueueCategory;
  type QueueItem = {
    id: string;
    category: QueueCategory;
    score: number;
    title: string;
    why: string;
    recommendation: string;
    owner: string;
    deadline: string;
    kind: 'command' | 'meeting_aftercare' | 'day';
    payload: any;
    canEdit?: boolean;
  };

  const categoryScore: Record<QueueCategory, number> = {
    'Needs action now': 50_000,
    'Waiting on someone': 40_000,
    'Upcoming risk': 30_000,
    'Opportunity detected': 20_000,
    FYI: 10_000,
  };
  const ownerFor = (command: any) =>
    command?.owner_name ||
    command?.assignee_name ||
    command?.assigned_to_name ||
    command?.evidence?.owner_name ||
    'You';
  const dateLabel = (value: unknown, fallback = 'Today') =>
    value ? relativeDate(String(value)) : fallback;

  const queueCandidates: QueueItem[] = [];

  priority.forEach((command: any, index: number) => {
    const category = homeCommandCategory(command, now);
    const review = reviewPlayerId(command) ? reviewCopy(command) : null;
    const why =
      review?.reason ||
      command?.why_now ||
      command?.evidence?.reason ||
      'This needs a decision.';
    const recommendation =
      command?.recommended_action ||
      command?.actionability?.cta ||
      (review ? 'Review the player.' : 'Decide the next move.');
    queueCandidates.push({
      id: `command:${command?.command_id || index}`,
      category,
      score:
        categoryScore[category] +
        Math.min(9_000, Math.max(0, Number(command?.priority_score || 0))),
      title: review?.title || (command?.command_type === 'Player follow-up due' && command?.evidence?.next_action
        ? `${command.title}: ${command.evidence.next_action}`
        : command?.title) || human(command?.command_type || 'Agency action'),
      why,
      recommendation,
      owner: ownerFor(command),
      deadline: isHomePlayerDataReview(command) ? 'Data review' : dateLabel(command?.due_at, category === 'Waiting on someone' ? 'Waiting' : 'No date'),
      kind: 'command',
      payload: command,
    });
  });

  meetingAftercareItems.forEach((item: any, index: number) => {
    const name =
      item?.person_name ||
      item?.organisation_name ||
      item?.title ||
      'Linked meeting';
    queueCandidates.push({
      id: `aftercare:${item?.meeting_id || index}`,
      category: 'Needs action now',
      score: categoryScore['Needs action now'] + 8_500 - index,
      title: `Record the outcome from ${name}`,
      why: 'The meeting outcome is missing.',
      recommendation: 'Capture what happened and the next action while it is still fresh.',
      owner: 'You',
      deadline: item?.ends_at ? `Ended ${relativeDate(item.ends_at)}` : 'Now',
      kind: 'meeting_aftercare',
      payload: item,
    });
  });

  dayItems.forEach((item: any, index: number) => {
    const date = new Date(String(item?.deadline_at || ''));
    if (!Number.isFinite(date.getTime())) return;
    const isToday = localDayKey(date) === todayKey;
    const isPast = date.getTime() < now.getTime();
    const daysAway = Math.ceil((date.getTime() - endOfToday.getTime()) / 86_400_000);

    if (item?.calendar_kind === 'meeting' && isToday) {
      queueCandidates.push({
        id: `meeting:${item?.meeting_id || index}`,
        category: 'Needs action now',
        score: categoryScore['Needs action now'] + 5_500 - index,
        title: item?.title || 'Meeting today',
        why: 'This meeting is on today and may need preparation or context before it starts.',
        recommendation: 'Open the meeting and check the people, club and current situation.',
        owner: 'You',
        deadline: new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        }).format(date),
        kind: 'day',
        payload: item,
      });
      return;
    }

    if (item?.calendar_kind === 'deadline' && (isPast || isToday || (daysAway >= 0 && daysAway <= 30))) {
      const category: QueueCategory =
        isPast || isToday ? 'Needs action now' : 'Upcoming risk';
      queueCandidates.push({
        id: `deadline:${item?.item_id || item?.entity_id || index}`,
        category,
        score:
          categoryScore[category] +
          (isPast ? 7_500 : isToday ? 6_500 : Math.max(0, 4_000 - daysAway * 50)),
        title: item?.title || 'Agency deadline',
        why: isPast
          ? 'This deadline has passed and still needs attention.'
          : isToday
            ? 'This deadline is today.'
            : `This date is approaching in ${daysAway} day${daysAway === 1 ? '' : 's'}.`,
        recommendation: 'Open the item and confirm the next move.',
        owner: item?.owner_name || 'You',
        deadline: isPast ? relativeDate(item.deadline_at) : relativeDate(item.deadline_at),
        kind: 'day',
        payload: item,
      });
      return;
    }

    if (item?.calendar_kind === 'birthday' && isToday) {
      queueCandidates.push({
        id: `birthday:${item?.item_id || item?.player_id || item?.person_id || index}`,
        category: 'FYI',
        score: categoryScore.FYI + 1_000 - index,
        title: item?.title || item?.context?.player_name || 'Birthday today',
        why: item?.context?.turns_age
          ? `Turns ${item.context.turns_age} today.`
          : 'Birthday recorded for today.',
        recommendation: 'Open the relationship if a personal message would be useful.',
        owner: 'You',
        deadline: 'Today',
        kind: 'day',
        payload: item,
      });
    }
  });



  for (const work of assignedWork.scope===assignedScope?assignedWork.items:[]) {
    const date=work.due_at?new Date(work.date_only?String(work.due_at).slice(0,10)+'T12:00:00':work.due_at):null;
    if(date&&(Number.isNaN(date.getTime())||date.getTime()>now.getTime()+7*86400000))continue;
    const key=work.work_kind+':'+work.work_id;
    if(queueCandidates.some(item=>{const ref=homeWorkRefFor(item.payload)||workRefFor(item.payload);return ref?.kind+':'+ref?.id===key;}))continue;
    queueCandidates.push({id:'assigned:'+key,category:!date||date<=endOfToday?'Needs action now':'Upcoming risk',score:!date?15000:date<now?47500:date<=endOfToday?46500:30500,title:work.title,why:'This work is assigned to you.',recommendation:'',owner:work.responsible_people?.map((person:any)=>person.display_name).join(', ')||'',deadline:date?dateLabel(work.due_at):'No date',kind:'day',payload:work});
  }

  const relevance=useHomeRelevance(rpc,assignedScope,tenantId,JSON.stringify(queueCandidates.map(item=>homeRelevanceReference(item.payload))),agencyOverview,data?.home_read_version);
  const visibleItems = queueCandidates
    .map((item,index)=>({...item,canEdit:relevance.editable.has(index),visible:relevance.visible.has(index)}))
    .filter(item=>item.visible)
    .map(item=>{
      const ref=homeWorkRefFor(item.payload),saved=ref?homeWork.overrides[ref.kind+':'+ref.id]:null;
      if(!saved)return item;
      const effectiveDue=saved.due_at||saved.due_on;
      const dateOnly=ref!.kind==='player_next_action'||(ref!.kind==='calendar_task'&&!saved.due_at);
      const date=effectiveDue?new Date(dateOnly?String(effectiveDue).slice(0,10)+'T12:00:00':effectiveDue):null;
      const category:QueueCategory=!date||date<=endOfToday?'Needs action now':'Upcoming risk';
      return {...item,title:saved.display_title,deadline:date?dateLabel(effectiveDue):'No date',category,score:!date?15000:date<now?47500:date<=endOfToday?46500:30500,payload:{...item.payload,due_at:effectiveDue,deadline_at:effectiveDue,date_only:dateOnly,home_saved_status:saved.status}};
    })
    .filter(item=>item.payload?.home_saved_status!=='done')
    .filter(
      (item, index, source) =>
        source.findIndex(candidate => {
          const a=homeWorkRefFor(candidate.payload),b=homeWorkRefFor(item.payload);
          return a&&b?a.kind===b.kind&&a.id===b.id:candidate.id===item.id;
        }) === index,
    );
  // Group only after the server has confirmed personal visibility. Never count or
  // reveal another colleague's reviews, and never let review flags consume all five slots.
  const dataReviews = visibleItems.filter(item => item.kind === 'command' && isHomePlayerDataReview(item.payload));
  const queue = visibleItems
    .filter(item => !(item.kind === 'command' && isHomePlayerDataReview(item.payload)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const queueSummary = (
    [
      'Needs action now',
      'Waiting on someone',
      'Upcoming risk',
      'Opportunity detected',
      'FYI',
    ] as QueueCategory[]
  )
    .map((category) => ({
      category,
      count: queue.filter((item) => item.category === category).length,
    }))
    .filter((item) => item.count > 0);

  const queueAction = (item: QueueItem) => {
    const ref=homeWorkRefFor(item.payload)||workRefFor(item.payload);
    if(ref&&item.canEdit===false){
      const related={...item.payload,work_kind:ref.kind,work_id:ref.id,context:{...item.payload?.context}};
      const playerId=item.payload?.player_id||(item.payload?.source_type==='player'?item.payload.source_id:'');
      if(playerId)related.context.player_id=playerId;
      return <Link className={styles.compactButton} href={workHref(related,basePath)}>Review<ChevronRight size={16}/></Link>;
    }
    if (item.kind === 'command') return actionFor(item.payload);
    if (item.kind === 'meeting_aftercare') {
      return (
        <button
          type="button"
          className={styles.compactButton}
          onClick={() => onRecordMeetingOutcome(item.payload)}
        >
          <ChevronRight size={16} />
          Record outcome
        </button>
      );
    }
    return (
      <Link
        className={styles.compactButton}
        href={item.payload?.work_kind?workHref(item.payload,basePath):dayHrefFor(item.payload)}
      >
        <ChevronRight size={16} />
        {item.payload?.calendar_kind === 'meeting'
          ? 'Open meeting'
          : item.payload?.calendar_kind === 'birthday'
            ? 'Open relationship'
            : 'Review'}
      </Link>
    );
  };

  const categoryLabel: Record<QueueCategory,string> = {
    'Needs action now':'Needs attention','Waiting on someone':'Waiting',
    'Upcoming risk':'Coming up','Opportunity detected':'Opportunity','FYI':'For you',
  };
  const meaningfulRecommendation = (item: QueueItem) =>
    item.recommendation && !/^(Open the item|Decide the next move|Review the player|Open the meeting)/i.test(item.recommendation)
      && item.recommendation.trim() !== item.why.trim();

  const renderQueueItem = (item: QueueItem) => {
    const ref=homeWorkRefFor(item.payload);
    if(ref&&item.canEdit)return <HomeWorkRow key={item.id} entry={{ref,title:item.title,payload:item.payload}} deadline={item.deadline} waiting={item.category==='Waiting on someone'} controller={homeWork} relatedAction={item.kind==='command'&&item.payload?.reply_interaction_id?queueAction(item):null}>
      {ref.kind!=='calendar_task'?<WorkResponsibilityControl key={assignedScope+item.id} work={ref} tenantId={tenantId} rpc={rpc}/>:null}
    </HomeWorkRow>;
    return <article className={styles.focusRow} key={item.id}>
      <div className={styles.focusCopy}>
        <div className={styles.focusMeta}>
          <span className={item.category === 'Needs action now' ? styles.focusUrgency : undefined}>
            {item.category === 'Needs action now' ? item.deadline.replace(/^Overdue\s+(.*overdue)$/i, '$1') : categoryLabel[item.category]}
          </span>
          {item.category !== 'Needs action now' && item.deadline !== categoryLabel[item.category]
            ? <small>{item.deadline.replace(/^Overdue\s+(.*overdue)$/i, '$1')}</small> : null}
        </div>
        <strong>{item.title}</strong>
        <details className={styles.focusDetails}><summary>Details</summary>
          <p>{item.why}</p>{meaningfulRecommendation(item)?<p>{item.recommendation}</p>:null}
          {item.owner && item.owner !== 'You' ? <p>Responsible: {item.owner}</p>:null}
        </details>
        {item.canEdit&&workRefFor(item.payload)?<WorkResponsibilityControl key={assignedScope+item.id} work={workRefFor(item.payload)!} tenantId={tenantId} rpc={rpc}/>:null}
      </div>
      <div className={styles.focusAction}>{queueAction(item)}</div>
    </article>;
  };

  return (
    <div className={styles.focusHome}>
      <header className={styles.focusWelcome}>
        <div><p>{greeting}</p><h2>Your day</h2></div>
        <Link className={styles.focusCalendarLink} href={`${basePath}?view=calendar`}>Calendar<ChevronRight size={16}/></Link>
      </header>
      {!restricted&&relevance.personalisationReady?<div className={styles.homeScope} role="group" aria-label="Home view"><button type="button" aria-pressed={!agencyOverview} onClick={()=>setAgencyOverview(false)}>My work</button><button type="button" aria-pressed={agencyOverview} onClick={()=>setAgencyOverview(true)}>Agency overview</button></div>:null}
      <p className={styles.homeScopeHint}>{!relevance.personalisationReady?'Staff tagging is not enabled yet. Showing your existing Home feed.':agencyOverview?'Agency updates, with your personal tasks kept private.':'Your tagged players and assigned tasks. Task assignments take priority.'}</p>
      <HomeWorkFeedback controller={homeWork}/>
      <section className={styles.focusPanel} aria-label="Today priorities">
        <div className={styles.focusHeading}><h3>{restricted ? 'Your work' : 'Needs your attention'}</h3>
          <span>{queue.length ? `${queue.length} item${queue.length===1?'':'s'}` : allState !== 'ready' || assignedLoading || relevance.loading ? 'Updating' : assignedError || relevance.error ? 'Unavailable' : dataReviews.length ? 'Reviews below' : 'All clear'}</span></div>
        {restricted ? <p className={styles.homeReadNotice}>Your work only. Commercial records require admin access.</p> : null}
        {readNotice(allState)}
        {assignedLoading&&!queue.length?<p className={styles.homeReadNotice} role="status">Loading your tasks...</p>:null}
        {assignedError?<div className={styles.homeReadNotice} role="alert">{assignedError}<button type="button" className={styles.compactButton} onClick={onRetry}>Retry tasks</button></div>:null}
        {relevance.loading&&!queue.length?<p className={styles.homeReadNotice} role="status">Checking your updates...</p>:null}
        {relevance.error?<div className={styles.homeReadNotice} role="alert">{relevance.error}<button type="button" onClick={relevance.retry}>Retry updates</button></div>:null}
        <div className={styles.focusList}>
          {queue.map(renderQueueItem)}
          {!queue.length && allState === 'ready' && !assignedLoading && !assignedError && !relevance.loading && !relevance.error ? dataReviews.length ? <p className={styles.homeReadNotice}>No other priorities right now. Player data reviews are below.</p> : <EmptyState icon={CheckCircle2} title="Nothing needs you right now"
            copy={restricted ? "Your work is up to date." : "Check your players or capture a new update."}
            action={<div className={styles.emptyStateActions}><AiLauncher onCaptureCompleted={onRetry}/><Link className={styles.compactButton} href={basePath+'?view=players'}><Users size={14}/>Check players</Link></div>}/>:null}
        </div>
      </section>
      {dataReviews.length ? <details className={`${styles.focusPanel} ${styles.homeReviewGroup}`}>
        <summary><span>Player data to review</span><span>{dataReviews.length}</span></summary>
        <p>Suggested updates and verification checks. Review these before sharing a profile.</p>
        {home?.attention?.player_reviews_has_more?<p className={styles.homeReadNotice}>Showing up to 200 reviews. <Link href={`${basePath}?view=players`}>Open Players for other records</Link></p>:null}
        <div className={styles.focusList}>{dataReviews.map(renderQueueItem)}</div>
      </details> : null}
      <HomeWorkEditor controller={homeWork}/>
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
        title="Know what each player needs next."
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
          label="Contracts coming up"
          value={String(summary.contract_critical_window || 0)}
          detail="Players with an important contract date approaching"
        />

        <Metric
          label="No active opportunity"
          value={String(summary.market_coverage_gaps || 0)}
          detail="Players with no live club opportunity"
        />

        <Metric
          label="Representation details"
          value={String(
            representation.records_needing_review || 0,
          )}
          detail={`${representation.missing_representation_records || 0} missing details`}
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
                : 'Nothing missing right now',
            },
            {
              label: 'Next move',
              value: nextMove,
              detail:
                item.player?.next_action_due
                  ? relativeDate(
                      item.player.next_action_due,
                    )
                  : 'No due date set',
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
                ? `${activeDeals} active opportunit${activeDeals === 1 ? 'y' : 'ies'}`
                : 'No active opportunity',
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
                    : 'The player issue is resolved.'),
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
                      ? `${activeDeals} active opportunit${activeDeals === 1 ? 'y' : 'ies'}`
                      : 'No active opportunity'}
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
            title="Add your first player"
            copy="Add the player once. Their contract, opportunities and next actions stay together."
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
              The players who need action are shown above.
            </strong>

            <span>
              These players have a follow-up, ownership or opportunity issue. Open a player to see what needs to happen next.
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
        copy="See who you know and the best route in."
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
          detail="Clubs in your network and live work"
        />

        <Metric
          label="Contacts"
          value={String(
            contactSummary.club_contacts ??
              contacts.length,
          )}
          detail="People you know at clubs"
        />

        <Metric
          label="Strong relationships"
          value={String(
            contactSummary
              .strong_recorded_direct_relationships ||
              0,
          )}
          detail="People you already know well"
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
            <button data-ui-button="tertiary"
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
                  'No contact yet';

            const routeDetail =
              useIntroduction
                ? access.introduction_target
                  ? `Introduction to ${access.introduction_target}`
                  : 'Warm introduction available'
                : access.best_direct_role ||
                  human(
                    access.direct_state ||
                      'contact available',
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
                ? 'An introduction task is ready from the known relationship. No external message is sent automatically.'
                : [
                      'protect_live_deal',
                      'remove_deal_blocker',
                    ].includes(playType)
                  ? 'The known relationship action is prepared against the live deal and remains human-controlled.'
                  : playType ===
                        'source_for_confirmed_need'
                    ? 'A controlled sourcing task is prepared against the confirmed club need.'
                    : playType === 'pitch_now'
                      ? 'The pitch route is reviewed and prepared for human-led external action.'
                      : 'The recommended relationship step is based on the information you have.';

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
                  'Club details',
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
                          'relationship',
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
                            'Contact available',
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
                          : 'No contacts yet'}
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
                                    'not set',
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
                      Add the people you know at this club so ReDream can show you the best route in.
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
                            'Prepare the best relationship route.',
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
                  : 'Add your first club relationship'
              }
              copy={
                relationshipSearch
                  ? 'Try another club, country or league.'
                  : 'Add a club or contact to start building your network here.'
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
                'Club not set';

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
                            'relationship',
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
                          'not set',
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
                          'Location not set'}
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
                          ? `Contact route ${relationship.route_score}`
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
                          : 'Not set'}
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
                  : 'No club contacts yet'
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
    if (!raw) return 'Date not set';

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
        title="Everything coming up."
        copy="Meetings, follow-ups and key dates."
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
            Coming up in this period
          </small>
        </div>

        <div>
          <span>AGENCY AGREEMENTS</span>
          <strong>
            {representationDates}
          </strong>
          <small>
            Agreements ending in this period
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
                          'Important date',
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
                              'Upcoming',
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
                          : 'Date not set'}
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
              title="Nothing coming up yet"
              copy="Connect your calendar or add a meeting."
            />
          ) : null}
        </div>

        <p
          className={
            styles.calendarTruth
          }
        >
          Calendar dates help you plan your work. Always check the underlying contract or agreement before relying on a legal or commercial deadline.
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
        title="Your business"
        copy="Live deals, income and owners."
        icon={Coins}
        badge="Management only"
      />

      <section className={styles.businessEntry}>
        <div>
          <h2>Deals, income and team ownership</h2>
        </div>

        <button
          type="button"
          data-ui-button="primary"
              className={styles.primaryButton}
          onClick={onOpenOwner}
          disabled={!data?.owner_business}
        >
          <Coins size={15} />
          Open business
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
        title="See every live opportunity clearly."
        copy="See the need, player fit and best route in."
        icon={Target}
        badge={`${demandSummary.active_needs ?? needs.length} active needs`}
      />

      <section className={styles.metrics}>
        <Metric
          label="Club needs"
          value={String(
            demandSummary.active_needs ?? needs.length,
          )}
          detail="What clubs are actively looking for"
        />

        <Metric
          label="Needs without a match"
          value={String(demandSummary.roster_gaps || 0)}
          detail="No suitable player linked yet"
        />

        <Metric
          label="Player opportunities"
          value={String(
            pursuitSummary.pursuit_count ?? pursuits.length,
          )}
          detail="Players linked to a club opportunity"
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
                        'Review the club need.'}
                    </span>

                    <small>
                      {human(item.need?.need_type)} ·{' '}
                      {item.need?.position || 'Position open'} ·{' '}
                      {human(item.coverage_state)}
                    </small>

                    <div
                      className={styles.routeCandidates}
                      aria-label="Player opportunities"
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
                                    'Player opportunity',
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
                                        'Player need',
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
                          No player linked yet
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
                              'Create scouting work for this club need.',
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
                                  'Player need',
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
                                  : 'Transfer type not set',
                              },
                              {
                                label: 'Coverage',
                                value:
                                  `${Number(item.candidate_coverage?.recorded_candidates || 0)} recorded candidate${Number(item.candidate_coverage?.recorded_candidates || 0) === 1 ? '' : 's'}`,
                                detail: human(
                                  item.coverage_state ||
                                    'coverage not set',
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
                              'At least one credible player is linked to this club need.',
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
                title="No club needs yet"
                copy="Add what the club needs. Matching players and next steps stay together."
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
                PLAYER OPPORTUNITIES
              </p>
              <h2>Player opportunities to move</h2>
            </div>

            <span className={styles.sectionCount}>
              {pursuits.length} opportunities
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
                'Review this player opportunity.';

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
                      Open opportunity
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
                                  'Relationship route',
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
                                ? 'The player-owned career strategy is current before the opportunity progresses externally.'
                                : 'The required career action is completed before the opportunity progresses externally.',
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
                title="No player opportunities yet"
                copy="Add a club need and player. The next step stays with the opportunity."
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
          detail="Deals you are actively working"
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
          detail="Deals that need a push"
        />

        <Metric
          label="Negotiation work"
          value={String(
            summary.negotiation_preparation_required_count || 0,
          )}
          detail="Deals to prepare for negotiation"
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
                : 'Commission not set';

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
                  'No blocker',
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
                    : 'Expected commission not set',
              },
              {
                label: 'Access route',
                value:
                  introductionTarget ||
                  deal.organisation ||
                  'No contact route yet',
                detail:
                  introductionVia
                    ? `Warm introduction via ${introductionVia}`
                    : introductionRole ||
                      'No warm introduction yet',
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
                        : 'Nothing needs attention.'),
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

                  <AgencyOwnershipChip
                    label="Deal owner"
                    name={deal.owner_name || null}
                    emptyText={
                      deal.owner_user_id
                        ? 'Needs reassignment'
                        : 'Unassigned'
                    }
                    attention={
                      deal.owner_state !==
                      'active_staff'
                    }
                  />
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
              title="No live deals yet"
              copy="Create a deal when money or terms are being discussed."
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
