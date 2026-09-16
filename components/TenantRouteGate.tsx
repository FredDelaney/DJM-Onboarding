'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

export function TenantRouteGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const isPlatformControlPlane =
    pathname === '/platform' ||
    pathname.startsWith('/platform/');

  const isAgencyActivationRoute =
    pathname === '/activate' ||
    pathname.startsWith('/activate/');

  const isAgencyWorkspaceRoute =
    pathname === '/workspace' ||
    pathname.startsWith('/workspace/');

  const isReDreamControlPlane = Boolean(
    process.env.NEXT_PUBLIC_REDREAM_ENVIRONMENT,
  );

  const shouldRedirectReDreamRoot =
    isReDreamControlPlane && pathname === '/';

  useEffect(() => {
    if (shouldRedirectReDreamRoot) {
      router.replace('/platform');
    }
  }, [router, shouldRedirectReDreamRoot]);

  if (shouldRedirectReDreamRoot) return null;

  return (
    <>
      {isPlatformControlPlane ||
      isAgencyActivationRoute ||
      isAgencyWorkspaceRoute || pathname === '/tell' || pathname === '/sign-in' || pathname === '/privacy'
        ? children
        : fallback}
    </>
  );
}
