'use client';

import { platformInvoke } from '@/lib/platform-client';

export type FunnelEventName =
  | 'page_view'
  | 'section_view'
  | 'scenario_select'
  | 'scenario_run'
  | 'scenario_complete'
  | 'product_mode'
  | 'cta_click'
  | 'demo_open'
  | 'demo_step_2'
  | 'demo_submit';

type FunnelContext = {
  session_id: string;
  source_host: string;
  source_path: string;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
};

type FunnelEventDetails = {
  section_key?: string | null;
  scenario_kind?: string | null;
  cta_key?: string | null;
  metadata?: {
    mode?: string | null;
    plan?: string | null;
    variant?: string | null;
  };
};

let runtimeContext: FunnelContext | null = null;

const value = (params: URLSearchParams, key: string) => {
  const candidate = params.get(key)?.trim() || '';
  return candidate ? candidate.slice(0, 160) : null;
};

const freshUuid = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : '';

export function getFunnelContext(): FunnelContext | null {
  if (typeof window === 'undefined') return null;
  if (runtimeContext) {
    return {
      ...runtimeContext,
      source_path: window.location.pathname,
    };
  }

  const sessionId = freshUuid();
  if (!sessionId) return null;

  const params = new URLSearchParams(window.location.search);
  runtimeContext = {
    session_id: sessionId,
    source_host: window.location.hostname.toLowerCase(),
    source_path: window.location.pathname,
    referrer: document.referrer?.trim().slice(0, 1000) || null,
    utm_source: value(params, 'utm_source'),
    utm_medium: value(params, 'utm_medium'),
    utm_campaign: value(params, 'utm_campaign'),
    utm_content: value(params, 'utm_content'),
    utm_term: value(params, 'utm_term'),
  };

  return { ...runtimeContext };
}

export function trackFunnel(
  eventName: FunnelEventName,
  details: FunnelEventDetails = {},
) {
  const context = getFunnelContext();
  const clientEventId = freshUuid();
  if (!context || !clientEventId) return;

  void platformInvoke('redream-funnel-event', {
    client_event_id: clientEventId,
    event_name: eventName,
    ...context,
    section_key: details.section_key || null,
    scenario_kind: details.scenario_kind || null,
    cta_key: details.cta_key || null,
    metadata: {
      mode: details.metadata?.mode || null,
      plan: details.metadata?.plan || null,
      variant: details.metadata?.variant || null,
    },
  }).catch(() => {
    // Analytics must never interrupt the sales experience.
  });
}
