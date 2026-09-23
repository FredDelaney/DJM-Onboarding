'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function TenantRouteGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const pathname = usePathname();

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

  const isReDreamPublicRoot =
    isReDreamControlPlane && pathname === '/';

  return (
    <>
      {isPlatformControlPlane ||
      isAgencyActivationRoute ||
      isAgencyWorkspaceRoute ||
      isReDreamPublicRoot ||
      pathname === '/tell' ||
      pathname === '/sign-in' ||
      pathname === '/privacy'
        ? children
        : fallback}
    </>
  );
}
