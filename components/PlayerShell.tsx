'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, LogOut, MessageCircle, UserRound } from 'lucide-react';

import Brand from './Brand';
import WorkspaceTabs, { type WorkspaceTab } from '@/components/WorkspaceTabs';
import { supabase } from '@/lib/supabase';

type PlayerState = {
  user: any;
  profile: any;
  player: any;
  privateInfo: any;
  openRequests: any[];
  latestCheckin: any;
  loading: boolean;
};

export type PlayerCtx = PlayerState & { refresh: () => Promise<void> };

const EMPTY_STATE: PlayerState = {
  user: null,
  profile: null,
  player: null,
  privateInfo: null,
  openRequests: [],
  latestCheckin: null,
  loading: true,
};

let playerCache: PlayerState | null = null;
let playerCacheAt = 0;
let playerLoad:
  | Promise<{ state: PlayerState | null; redirect: string | null }>
  | null = null;
const playerListeners = new Set<(state: PlayerState) => void>();

const publishPlayerState = (state: PlayerState) => {
  playerCache = state;
  playerCacheAt = Date.now();
  playerListeners.forEach((listener) => listener(state));
};

const clearPlayerState = () => {
  playerCache = null;
  playerCacheAt = 0;
};

const fetchPlayerState = async () => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user) return { state: null, redirect: '/sign-in' };
  const user = session.user;

  const [{ data: profile }, { data: players }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase
      .from('players')
      .select(
        'id,user_id,first_name,last_name,preferred_name,date_of_birth,nationalities,height_cm,preferred_foot,primary_position,secondary_positions,current_club,current_league,current_country,contract_status,contract_expiry,football_status,transfermarkt_url,wyscout_url,stats_url,instagram_url,profile_photo_path,onboarding_status,verification_status,current_season_label,current_season_start,updated_at',
      )
      .eq('user_id', user.id)
      .limit(1),
  ]);

  if (profile?.role === 'admin' || profile?.role === 'scout') {
    return { state: null, redirect: '/admin' };
  }

  const player = players?.[0] || null;
  if (!player) {
    return {
      redirect: null,
      state: {
        user,
        profile,
        player: null,
        privateInfo: null,
        openRequests: [],
        latestCheckin: null,
        loading: false,
      },
    };
  }

  const [{ data: privateInfo }, { data: requests }, { data: checkins }] = await Promise.all([
    supabase.from('player_private').select('*').eq('player_id', player.id).maybeSingle(),
    supabase
      .from('player_requests')
      .select('*')
      .eq('player_id', player.id)
      .neq('status', 'completed')
      .order('created_at', { ascending: false }),
    supabase
      .from('weekly_checkins')
      .select('*')
      .eq('player_id', player.id)
      .order('week_start', { ascending: false })
      .limit(1),
  ]);

  const actionable = (requests || []).filter(
    (request: any) =>
      request.status === 'open' &&
      request.request_type !== 'message' &&
      request.request_type !== 'signal',
  );

  return {
    redirect: null,
    state: {
      user,
      profile,
      player,
      privateInfo: privateInfo || null,
      openRequests: actionable,
      latestCheckin: checkins?.[0] || null,
      loading: false,
    },
  };
};

const loadPlayerState = async (force = false) => {
  const freshEnough = playerCache && Date.now() - playerCacheAt < 30_000;
  if (!force && freshEnough) return { state: playerCache, redirect: null };
  if (playerLoad) return playerLoad;

  playerLoad = fetchPlayerState()
    .catch(() => ({ state: playerCache || { ...EMPTY_STATE, loading: false }, redirect: null }))
    .finally(() => {
      playerLoad = null;
    });
  return playerLoad;
};

export function usePlayerContext(): PlayerCtx {
  const [state, setState] = useState<PlayerState>(() => playerCache || { ...EMPTY_STATE });
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const listener = (next: PlayerState) => active && setState(next);
    playerListeners.add(listener);

    void loadPlayerState(Boolean(playerCache)).then((result) => {
      if (!active) return;
      if (result.redirect) {
        clearPlayerState();
        router.replace(result.redirect);
        return;
      }
      if (result.state) publishPlayerState(result.state);
    });

    return () => {
      active = false;
      playerListeners.delete(listener);
    };
  }, [router]);

  const refresh = useCallback(async () => {
    const result = await loadPlayerState(true);
    if (result.redirect) {
      clearPlayerState();
      router.replace(result.redirect);
      return;
    }
    if (result.state) publishPlayerState(result.state);
  }, [router]);

  return { ...state, refresh };
}

const tabs = (inboxCount: number): WorkspaceTab[] => [
  { href: '/home', label: 'Home', icon: Home },
  {
    href: '/inbox',
    label: 'DJM',
    icon: MessageCircle,
    badge: inboxCount,
  },
  {
    href: '/profile',
    label: 'Me',
    icon: UserRound,
    activePrefixes: ['/profile', '/career', '/check-in', '/cv', '/documents'],
  },
];

export function PlayerShell({
  children,
  inboxCount,
}: {
  children: React.ReactNode;
  inboxCount?: number;
}) {
  const path = usePathname();
  const router = useRouter();
  const playerContext = usePlayerContext();
  const resolvedInboxCount = inboxCount ?? playerContext.openRequests.length;
  const nav = tabs(resolvedInboxCount);

  useEffect(() => {
    nav.forEach(({ href }) => router.prefetch(href));
  }, [router, resolvedInboxCount]);

  const signOut = async () => {
    clearPlayerState();
    await supabase.auth.signOut();
    router.replace('/sign-in');
  };

  const mobile = [
    ['/home', 'Home', Home],
    ['/inbox', 'DJM', MessageCircle],
    ['/profile', 'Me', UserRound],
  ] as const;

  const mobileActive = (href: string) => {
    if (href === '/profile') {
      return ['/profile', '/career', '/check-in', '/cv', '/documents'].some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
      );
    }
    return path === href || path.startsWith(`${href}/`);
  };

  return (
    <div className="screen player-premium-screen ux-player-root">
      <header className="djm-os-header player-workspace-header no-print ux-player-header">
        <div className="djm-os-header-inner">
          <div className="djm-os-brand-row">
            <Brand />
            <span className="djm-os-chip">Player</span>
          </div>

          <WorkspaceTabs
            items={nav}
            ariaLabel="Player navigation"
            className="player-workspace-tabs"
          />

          <div className="djm-os-button-row djm-os-header-actions">
            <button
              type="button"
              className="djm-os-icon-button"
              aria-label="Sign out"
              onClick={() => void signOut()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      {children}

      <nav className="bottom-nav no-print player-premium-nav ux-player-mobile-nav" aria-label="Player mobile navigation">
        {mobile.map(([href, label, Icon]) => {
          const active = mobileActive(href);
          const hasBadge = href === '/inbox' && resolvedInboxCount > 0;
          return (
            <Link
              key={href}
              href={href}
              prefetch
              aria-current={active ? 'page' : undefined}
              className={`nav-item ${active ? 'active' : ''} ${hasBadge ? 'nav-badge' : ''}`}
            >
              <Icon size={20} />
              <span>{label}</span>
              {hasBadge ? <em /> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="center">
      <div className="loader" />
    </div>
  );
}
