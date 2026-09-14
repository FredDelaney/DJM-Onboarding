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

  return <>{isPlatformControlPlane ? children : fallback}</>;
}
