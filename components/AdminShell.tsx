'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import WorkspaceHeader from './WorkspaceHeader';
import {
  useTenantRuntime,
} from '@/components/TenantRuntimeProvider';
import {
  platformInvoke,
} from '@/lib/platform-client';
import { supabase } from '@/lib/supabase';

type Workspace = {
  tenant_id: string;
  slug: string;
  role: string;
  is_primary?: boolean;
  display_name?: string | null;
  short_name?: string | null;
  portal_name?: string | null;
};

type AdminState = {
  user: any;
  profile: any;
  workspace: Workspace | null;
  loading: boolean;
};

const EMPTY_ADMIN: AdminState = {
  user: null,
  profile: null,
  workspace: null,
  loading: true,
};

const fetchAdmin = async ({
  tenantId,
  tenantSlug,
}: {
  tenantId: string | null;
  tenantSlug: string | null;
}) => {
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

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'id,email,display_name,avatar_path,updated_at',
    )
    .eq('id', user.id)
    .maybeSingle();

  const result = await platformInvoke<{
    tenants?: Workspace[];
  }>('agency-os', {
    action: 'tenants',
  });

  const workspaces = Array.isArray(
    result?.tenants,
  )
    ? result.tenants
    : [];

  let workspace =
    (tenantId
      ? workspaces.find(
          (item) =>
            String(item.tenant_id) === tenantId,
        )
      : null) ||
    (tenantSlug
      ? workspaces.find(
          (item) =>
            String(item.slug) === tenantSlug,
        )
      : null) ||
    workspaces.find(
      (item) => item.is_primary === true,
    ) ||
    (workspaces.length === 1
      ? workspaces[0]
      : null);

  if (!workspace) {
    return {
      state: null,
      redirect: '/home',
    };
  }

  const tenantRole = String(
    workspace.role || '',
  );

  const compatibilityRole = [
    'owner',
    'admin',
  ].includes(tenantRole)
    ? 'admin'
    : 'scout';

  const displayName =
    profile?.display_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Agency team member';

  return {
    redirect: null,
    state: {
      user,
      workspace,
      loading: false,
      profile: {
        id: user.id,
        email:
          profile?.email ||
          user.email ||
          null,
        display_name: displayName,
        avatar_path:
          profile?.avatar_path || null,
        updated_at:
          profile?.updated_at || null,

        // Compatibility only for old screens.
        // Agency authorisation comes from
        // platform.tenant_memberships.
        role: compatibilityRole,
        tenant_role: tenantRole,
        tenant_id: workspace.tenant_id,
        tenant_slug: workspace.slug,
      },
    },
  };
};

export function useAdmin() {
  const router = useRouter();
  const runtime = useTenantRuntime();

  const [state, setState] =
    useState<AdminState>({
      ...EMPTY_ADMIN,
    });

  const resolve = useCallback(
    () =>
      fetchAdmin({
        tenantId:
          runtime.tenant_id || null,
        tenantSlug: runtime.resolved
          ? runtime.slug
          : null,
      }),
    [
      runtime.tenant_id,
      runtime.resolved,
      runtime.slug,
    ],
  );

  useEffect(() => {
    let active = true;

    void resolve()
      .then((result) => {
        if (!active) return;

        if (result.redirect) {
          setState({
            ...EMPTY_ADMIN,
            loading: false,
          });
          router.replace(result.redirect);
          return;
        }

        if (result.state) {
          setState(result.state);
        }
      })
      .catch(() => {
        if (!active) return;

        setState({
          ...EMPTY_ADMIN,
          loading: false,
        });

        router.replace('/home');
      });

    return () => {
      active = false;
    };
  }, [resolve, router]);

  const refresh = useCallback(async () => {
    const result = await resolve();

    if (result.redirect) {
      setState({
        ...EMPTY_ADMIN,
        loading: false,
      });
      router.replace(result.redirect);
      return;
    }

    if (result.state) {
      setState(result.state);
    }
  }, [resolve, router]);

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
  const auth = useAdmin();

  useEffect(() => {
    [
      '/agency',
      '/settings',
    ].forEach((path) =>
      router.prefetch(path),
    );
  }, [router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/sign-in');
  };

  if (auth.loading || !auth.user) {
    return null;
  }

  return (
    <div className="admin-shell">
      <WorkspaceHeader
        onSignOut={signOut}
      />
      {children}
    </div>
  );
}