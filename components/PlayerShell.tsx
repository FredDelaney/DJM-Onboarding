'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import Link from 'next/link';
import {
  usePathname,
  useRouter,
} from 'next/navigation';
import {
  Activity,
  Compass,
  Home,
  LogOut,
  MessageCircle,
  UserRound,
} from 'lucide-react';

import Brand from './Brand';
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

export type PlayerCtx = PlayerState & {
  refresh: () => Promise<void>;
};

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
  | Promise<{
      state: PlayerState | null;
      redirect: string | null;
    }>
  | null = null;

const playerListeners = new Set<
  (state: PlayerState) => void
>();

const publishPlayerState = (
  state: PlayerState,
) => {
  playerCache = state;
  playerCacheAt = Date.now();
  playerListeners.forEach((listener) =>
    listener(state),
  );
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

  if (sessionError || !session?.user) {
    return {
      state: null,
      redirect: '/sign-in',
    };
  }

  const user = session.user;

  const [
    { data: profile },
    { data: players },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle(),

    supabase
      .from('players')
      .select(
        'id,user_id,first_name,last_name,preferred_name,date_of_birth,nationalities,height_cm,preferred_foot,primary_position,secondary_positions,current_club,current_league,current_country,contract_status,contract_expiry,football_status,transfermarkt_url,wyscout_url,stats_url,instagram_url,profile_photo_path,onboarding_status,verification_status,current_season_label,current_season_start,updated_at',
      )
      .eq('user_id', user.id)
      .limit(1),
  ]);

  if (
    profile?.role === 'admin' ||
    profile?.role === 'scout'
  ) {
    return {
      state: null,
      redirect: '/admin',
    };
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

  const [
    { data: privateInfo },
    { data: requests },
    { data: checkins },
  ] = await Promise.all([
    supabase
      .from('player_private')
      .select('*')
      .eq('player_id', player.id)
      .maybeSingle(),

    supabase
      .from('player_requests')
      .select('*')
      .eq('player_id', player.id)
      .neq('status', 'completed')
      .order('created_at', {
        ascending: false,
      }),

    supabase
      .from('weekly_checkins')
      .select('*')
      .eq('player_id', player.id)
      .order('week_start', {
        ascending: false,
      })
      .limit(1),
  ]);

  const actionable = (
    requests || []
  ).filter(
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
      privateInfo:
        privateInfo || null,
      openRequests: actionable,
      latestCheckin:
        checkins?.[0] || null,
      loading: false,
    },
  };
};

const loadPlayerState = async (
  force = false,
) => {
  const freshEnough =
    playerCache &&
    Date.now() - playerCacheAt < 30_000;

  if (!force && freshEnough) {
    return {
      state: playerCache,
      redirect: null,
    };
  }

  if (playerLoad) {
    return playerLoad;
  }

  playerLoad = fetchPlayerState()
    .catch(() => ({
      state:
        playerCache || {
          ...EMPTY_STATE,
          loading: false,
        },
      redirect: null,
    }))
    .finally(() => {
      playerLoad = null;
    });

  return playerLoad;
};

export function usePlayerContext(): PlayerCtx {
  const [state, setState] =
    useState<PlayerState>(() =>
      playerCache || {
        ...EMPTY_STATE,
      },
    );

  const router = useRouter();

  useEffect(() => {
    let active = true;

    const listener = (
      next: PlayerState,
    ) => {
      if (active) {
        setState(next);
      }
    };

    playerListeners.add(listener);

    const hydrate = async () => {
      const hadCache = !!playerCache;
      const result = await loadPlayerState(
        hadCache,
      );

      if (!active) return;

      if (result.redirect) {
        clearPlayerState();
        router.replace(result.redirect);
        return;
      }

      if (result.state) {
        publishPlayerState(result.state);
      }
    };

    void hydrate();

    return () => {
      active = false;
      playerListeners.delete(listener);
    };
  }, [router]);

  const refresh = useCallback(
    async () => {
      const result =
        await loadPlayerState(true);

      if (result.redirect) {
        clearPlayerState();
        router.replace(result.redirect);
        return;
      }

      if (result.state) {
        publishPlayerState(result.state);
      }
    },
    [router],
  );

  return {
    ...state,
    refresh,
  };
}

export function PlayerShell({
  children,
  inboxCount = 0,
}: {
  children: React.ReactNode;
  inboxCount?: number;
}) {
  const path = usePathname();
  const router = useRouter();

  const nav = [
    ['/home', 'Today', Home],
    ['/career', 'Career', Compass],
    ['/check-in', 'Check-in', Activity],
    ['/inbox', 'DJM', MessageCircle],
    ['/profile', 'Me', UserRound],
  ] as const;

  useEffect(() => {
    nav.forEach(([href]) => {
      router.prefetch(href);
    });
    router.prefetch('/cv');
    router.prefetch('/documents');
    router.prefetch('/career');
  }, [router]);

  const signOut = async () => {
    clearPlayerState();
    await supabase.auth.signOut();
    router.replace('/sign-in');
  };

  return (
    <div className="screen player-premium-screen">
      <div className="header-glass no-print player-premium-header">
        <div className="container topbar topbar-min">
          <Brand />
          <button
            type="button"
            className="icon-btn"
            aria-label="Sign out"
            onClick={signOut}
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>

      {children}

      <nav
        className="bottom-nav no-print player-premium-nav"
        aria-label="Player navigation"
      >
        {nav.map(
          ([href, label, Icon]) => {
            const active = path === href;
            const hasBadge =
              href === '/inbox' &&
              inboxCount > 0;

            return (
              <Link
                key={href}
                href={href}
                prefetch
                aria-current={
                  active
                    ? 'page'
                    : undefined
                }
                className={`nav-item ${
                  active ? 'active' : ''
                } ${
                  hasBadge
                    ? 'nav-badge'
                    : ''
                }`}
              >
                <Icon size={20} />
                <span>{label}</span>
                {hasBadge && <em />}
              </Link>
            );
          },
        )}
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
