'use client';

import {
  createContext,
  useContext,
} from 'react';

import type {
  TenantRuntime,
} from '../lib/tenant-runtime';

const TenantRuntimeContext =
  createContext<TenantRuntime | null>(null);

export function TenantRuntimeProvider({
  runtime,
  children,
}: {
  runtime: TenantRuntime;
  children: React.ReactNode;
}) {
  return (
    <TenantRuntimeContext.Provider
      value={runtime}
    >
      {children}
    </TenantRuntimeContext.Provider>
  );
}

export function useTenantRuntime() {
  const runtime =
    useContext(TenantRuntimeContext);

  if (!runtime) {
    throw new Error(
      'useTenantRuntime must be used inside TenantRuntimeProvider',
    );
  }

  return runtime;
}

export function useTenantFeature(
  featureKey: string,
) {
  const runtime = useTenantRuntime();

  /*
   * Fail open only for the unresolved DJM fallback.
   * This preserves the live DJM experience if tenant
   * resolution is temporarily unavailable.
   */
  if (!runtime.resolved) return true;

  return (
    runtime.features[featureKey]?.enabled ===
    true
  );
}

export function useTenantPlanLimit(
  limitKey: string,
) {
  const runtime = useTenantRuntime();

  const value =
    runtime.plan.limits[limitKey];

  return typeof value === 'number'
    ? value
    : null;
}
