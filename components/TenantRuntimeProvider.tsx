'use client';

import {
  createContext,
  useContext,
} from 'react';

import {
  isTenantFeatureEnabled,
  type TenantRuntime,
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

export function useOptionalTenantRuntime() {
  return useContext(TenantRuntimeContext);
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

  return isTenantFeatureEnabled(
    runtime,
    featureKey,
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
