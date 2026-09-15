// A requested slug is routing context, never proof of membership.
export function tellWorkspaceSlug(
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

export function pendingTellWorkspace(capture: {
  workspaceSlug?: string | null;
  context?: Record<string, unknown>;
}): string | null {
  if (capture.workspaceSlug !== undefined) return capture.workspaceSlug;
  // Older records retain their original route, including explicit workspace routes.
  return tellWorkspaceSlug(null, String(capture.context?.route || ''));
}
