'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const REDREAM_PUBLIC_ROUTES = new Set([
  '/',
  '/product',
  '/security',
  '/switch',
  '/support',
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

  // This route resolves its approved public snapshot and agency by slug.
  // A shared ReDream host does not need a private workspace domain mapping.
  const isPublicPlayerProfileRoute =
    /^\/p\/[^/]+\/?$/.test(pathname);

  // Recipient data is authorised by the share token, not a private host mapping.
  const isClubRecipientRoute = /^\/s\/[^/]+\/?$/.test(pathname);

  const isReDreamPublicRoute =
    allowReDreamPublicRoot &&
    REDREAM_PUBLIC_ROUTES.has(pathname);

  return (
    <>
      {isPlatformControlPlane ||
      isAgencyActivationRoute ||
      isAgencyWorkspaceRoute ||
      isPublicPlayerProfileRoute ||
      isClubRecipientRoute ||
      isReDreamPublicRoute ||
      pathname === '/tell' ||
      pathname === '/sign-in' ||
      pathname === '/forgot-password' ||
      pathname === '/reset-password' ||
      pathname === '/player-workspaces' ||
      pathname === '/privacy'
        ? children
        : fallback}
    </>
  );
}
