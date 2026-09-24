'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const REDREAM_PUBLIC_ROUTES = new Set([
  '/',
  '/product',
  '/security',
  '/switch',
]);

export function TenantRouteGate({
  children,
  fallback,
  allowReDreamPublicRoot = false,
}: {
  children: ReactNode;
  fallback: ReactNode;
  allowReDreamPublicRoot?: boolean;
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

  const isReDreamPublicRoute =
    allowReDreamPublicRoot &&
    REDREAM_PUBLIC_ROUTES.has(pathname);

  return (
    <>
      {isPlatformControlPlane ||
      isAgencyActivationRoute ||
      isAgencyWorkspaceRoute ||
      isReDreamPublicRoute ||
      pathname === '/tell' ||
      pathname === '/sign-in' ||
      pathname === '/privacy'
        ? children
        : fallback}
    </>
  );
}
