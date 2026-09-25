'use client';

import { platformInvoke } from '@/lib/platform-client';
import { supabase } from '@/lib/supabase';

type AgencyWorkspace = {
  tenant_id: string;
  slug: string;
  role: string;
  is_primary?: boolean;
};

type AgencyEntryOptions = {
  runtimeTenantId?: string | null;
  runtimeTenantSlug?: string | null;
};

export type SignedInDestination = {
  kind: 'agency' | 'player' | 'unresolved';
  href: string;
  workspace?: AgencyWorkspace;
};

const noAgencyAccess = (error: unknown) =>
  error instanceof Error &&
  /agency staff access required/i.test(error.message);

const chooseWorkspace = (
  workspaces: AgencyWorkspace[],
  options: AgencyEntryOptions,
) => {
  const runtimeTenantId = String(options.runtimeTenantId || '').trim();
  const runtimeTenantSlug = String(options.runtimeTenantSlug || '').trim();

  return (
    (runtimeTenantId
      ? workspaces.find((workspace) => workspace.tenant_id === runtimeTenantId)
      : null) ||
    (runtimeTenantSlug
      ? workspaces.find((workspace) => workspace.slug === runtimeTenantSlug)
      : null) ||
    workspaces.find((workspace) => workspace.is_primary === true) ||
    workspaces[0] ||
    null
  );
};

export async function resolveAgencyWorkspaceEntry(
  options: AgencyEntryOptions = {},
): Promise<SignedInDestination | null> {
  try {
    const result = await platformInvoke<{ tenants?: AgencyWorkspace[] }>(
      'agency-os',
      { action: 'tenants' },
    );

    const workspaces = Array.isArray(result?.tenants) ? result.tenants : [];
    if (!workspaces.length) return null;

    const workspace = chooseWorkspace(workspaces, options);
    if (!workspace) return null;

    const onResolvedTenantHost =
      Boolean(options.runtimeTenantId) &&
      workspace.tenant_id === options.runtimeTenantId;

    return {
      kind: 'agency',
      workspace,
      href: onResolvedTenantHost
        ? '/agency'
        : `/workspace/${encodeURIComponent(workspace.slug)}`,
    };
  } catch (error) {
    if (noAgencyAccess(error)) return null;
    throw error;
  }
}

export async function resolveSignedInDestination(
  userId: string,
  options: AgencyEntryOptions = {},
): Promise<SignedInDestination> {
  const agency = await resolveAgencyWorkspaceEntry(options);
  if (agency) return agency;

  let playerQuery = supabase
    .from('players')
    .select('id,tenant_id')
    .eq('user_id', userId);

  if (options.runtimeTenantId) {
    playerQuery = playerQuery.eq('tenant_id', options.runtimeTenantId);
  }

  const { data, error } = await playerQuery.limit(1);
  if (error) throw error;

  if (data?.length) {
    return {
      kind: 'player',
      href: '/home',
    };
  }

  return {
    kind: 'unresolved',
    href: '/',
  };
}
