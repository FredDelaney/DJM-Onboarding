'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import {
  BriefcaseBusiness,
  LogOut,
  Network,
  UserPlus,
  UsersRound,
} from 'lucide-react';

import Brand from './Brand';
import { supabase } from '@/lib/supabase';

type AdminState = {
  user: any;
  profile: any;
  loading: boolean;
};

const EMPTY_ADMIN: AdminState = {
  user: null,
  profile: null,
  loading: true,
};

let adminCache:
  | AdminState
  | null = null;

let adminCacheAt = 0;

let adminLoad:
  | Promise<{
      state: AdminState | null;
      redirect: string | null;
    }>
  | null = null;

const adminListeners =
  new Set<
    (state: AdminState) => void
  >();

const publishAdmin = (
  state: AdminState,
) => {
  adminCache = state;
  adminCacheAt = Date.now();

  adminListeners.forEach(
    (listener) =>
      listener(state),
  );
};

const clearAdmin = () => {
  adminCache = null;
  adminCacheAt = 0;
};

const fetchAdmin = async () => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (
    sessionError ||
    !session?.user
  ) {
    return {
      state: null,
      redirect: '/sign-in',
    };
  }

  const user = session.user;

  const { data: profile } =
    await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

  if (
    !profile ||
    ![
      'admin',
      'scout',
    ].includes(profile.role)
  ) {
    return {
      state: null,
      redirect: '/home',
    };
  }

  return {
    redirect: null,
    state: {
      user,
      profile,
      loading: false,
    },
  };
};

const loadAdmin = async (
  force = false,
) => {
  const freshEnough =
    adminCache &&
    Date.now() - adminCacheAt < 60_000;

  if (
    !force &&
    freshEnough
  ) {
    return {
      state: adminCache,
      redirect: null,
    };
  }

  if (adminLoad) {
    return adminLoad;
  }

  adminLoad = fetchAdmin()
    .catch(() => ({
      state:
        adminCache ||
        {
          ...EMPTY_ADMIN,
          loading: false,
        },
      redirect: null,
    }))
    .finally(() => {
      adminLoad = null;
    });

  return adminLoad;
};

export function useAdmin() {
  const [state, setState] =
    useState<AdminState>(
      () =>
        adminCache || {
          ...EMPTY_ADMIN,
        },
    );

  const router = useRouter();

  useEffect(() => {
    let active = true;

    const listener = (
      next: AdminState,
    ) => {
      if (active) {
        setState(next);
      }
    };

    adminListeners.add(listener);

    const hydrate = async () => {
      const result =
        await loadAdmin(
          !!adminCache,
        );

      if (!active) {
        return;
      }

      if (result.redirect) {
        clearAdmin();
        router.replace(
          result.redirect,
        );
        return;
      }

      if (result.state) {
        publishAdmin(
          result.state,
        );
      }
    };

    void hydrate();

    return () => {
      active = false;
      adminListeners.delete(
        listener,
      );
    };
  }, [router]);

  const refresh = useCallback(
    async () => {
      const result =
        await loadAdmin(true);

      if (result.redirect) {
        clearAdmin();
        router.replace(
          result.redirect,
        );
        return;
      }

      if (result.state) {
        publishAdmin(
          result.state,
        );
      }
    },
    [router],
  );

  return {
    ...state,
    refresh,
  };
}

const workspaceItems = [
  { href: '/djm', label: 'Home', icon: BriefcaseBusiness },
  { href: '/admin', label: 'Signed Players', icon: UsersRound },
  { href: '/network', label: 'Network', icon: Network },
  { href: '/recruitment', label: 'Recruitment', icon: UserPlus },
  { href: '/market', label: 'Market', icon: BriefcaseBusiness },
];

export function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    router.prefetch('/djm');
    router.prefetch('/admin');
    router.prefetch('/network');
    router.prefetch('/recruitment');
    router.prefetch('/market');
  }, [router]);

  const signOut = async () => {
    clearAdmin();

    await supabase.auth.signOut();

    router.replace('/sign-in');
  };

  return (
    <div className="admin-shell">
      <div className="admin-head">
        <div className="container admin-top">
          <Brand />

          <div className="row">
            <span className="pill pill-dark">
              DJM ADMIN
            </span>

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

        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,.08)',
            overflowX: 'auto',
          }}
        >
          <nav
            className="container"
            aria-label="DJM workspaces"
            style={{
              minHeight: 48,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {workspaceItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === '/admin'
                  ? pathname === '/admin' || pathname.startsWith('/admin/')
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    minHeight: 34,
                    padding: '0 11px',
                    borderRadius: 9,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    background: active ? '#f4c430' : 'rgba(255,255,255,.06)',
                    color: active ? '#061f3a' : 'rgba(255,255,255,.78)',
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  <Icon size={15} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {children}
    </div>
  );
}
