export type AiWorkspaceContext = {
  workspaceSlug: string | null;
  originRoute: string;
  runtimeOrigin: 'workspace_route' | 'runtime' | 'deep_link' | 'legacy';
};

// A requested slug is routing context, never proof of membership.
export function aiWorkspaceSlug(
  runtime: { resolved: boolean; slug: string; tenant_type?: string } | null,
  route: string,
): string | null {
  const pathSlug = /^\/workspace\/([^/?#]+)/.exec(route)?.[1];
  if (pathSlug) {
    try { return decodeURIComponent(pathSlug); } catch { return 'unresolved'; }
  }
  if (runtime?.resolved) return runtime.slug;
  // Agency routes without a resolved runtime must never fall back to a primary tenant.
  if (/^\/(agency|workspace)(?:\/|$)/.test(route)) return 'unresolved';
  return null;
}

export function pendingAiWorkspace(capture: {
  workspace?: AiWorkspaceContext;
  workspaceSlug?: string | null;
  context?: Record<string, unknown>;
}): string | null {
  if (capture.workspace != null) {
    const slug = capture.workspace.workspaceSlug;
    if (slug === null && capture.workspace.runtimeOrigin === 'legacy') return aiWorkspaceSlug(null, capture.workspace.originRoute || '');
    return typeof slug === 'string' && slug.length > 0 ? slug : 'unresolved';
  }
  if (capture.workspaceSlug !== undefined && capture.workspaceSlug !== null) {
    return typeof capture.workspaceSlug === 'string' && capture.workspaceSlug.length > 0 ? capture.workspaceSlug : 'unresolved';
  }
  // Older records retain their original route, including explicit workspace routes.
  return aiWorkspaceSlug(null, String(capture.context?.route || ''));
}
