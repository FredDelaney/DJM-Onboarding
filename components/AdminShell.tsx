'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import DjmWorkspaceHeader from './DjmWorkspaceHeader';
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


export function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

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
      <DjmWorkspaceHeader onSignOut={signOut} />
      {children}
    </div>
  );
}
