'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useOptionalTenantRuntime } from './TenantRuntimeProvider';
import { aiWorkspaceSlug, type AiWorkspaceContext } from '@/lib/ai-workspace';

export function useAiWorkspaceContext(): AiWorkspaceContext {
  const runtime = useOptionalTenantRuntime();
  const pathname = usePathname() || '';
  const params = useSearchParams();
  if (pathname === '/tell') {
    const requested = params.get('workspace');
    if (requested !== null) return { workspaceSlug: requested || 'unresolved', originRoute: pathname, runtimeOrigin: 'deep_link' };
    const original = aiWorkspaceSlug(null, params.get('from') || '');
    if (original !== null) return { workspaceSlug: original, originRoute: params.get('from') || pathname, runtimeOrigin: 'deep_link' };
  }
  return {
    workspaceSlug: aiWorkspaceSlug(runtime, pathname),
    originRoute: pathname,
    runtimeOrigin: pathname.startsWith('/workspace/') ? 'workspace_route' : runtime?.resolved ? 'runtime' : 'legacy',
  };
}

export function useAiWorkspace() {
  return useAiWorkspaceContext().workspaceSlug;
}
