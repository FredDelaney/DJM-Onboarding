'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useOptionalTenantRuntime } from './TenantRuntimeProvider';
import { tellWorkspaceSlug } from '@/lib/tell-workspace';

export function useTellWorkspace() {
  const runtime = useOptionalTenantRuntime();
  const pathname = usePathname() || '';
  const params = useSearchParams();
  if (pathname === '/tell') {
    const requested = params.get('workspace');
    if (requested !== null) return requested || 'unresolved';
    const original = tellWorkspaceSlug(null, params.get('from') || '');
    if (original !== null) return original;
  }
  return tellWorkspaceSlug(runtime, pathname);
}
