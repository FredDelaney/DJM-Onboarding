'use client';

import { useAiWorkspace } from './useAiWorkspace';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AiCapture from '@/components/AiCapture';
import AiRecentCaptures from '@/components/AiRecentCaptures';
import { platformRpc } from '@/lib/platform-client';
import {
  contextFromRoute,
  contextFromSearchParams,
  UUID_PATTERN,
  mergeEntityContext,
  type EntityContext,
} from '@/lib/entity-context';

type AiAccess = {
  enabled?: boolean;
  permission_scope?: string | null;
  max_audio_seconds?: number | null;
};

export default function AiFullPage() {
  const workspaceSlug = useAiWorkspace();
  const [sourceRoute, setSourceRoute] = useState('');
  const routeFallback = useMemo(
    () => (sourceRoute.startsWith('/') ? contextFromRoute(sourceRoute) : {}),
    [sourceRoute],
  );
  const [routeContext, setRouteContext] = useState<EntityContext>(routeFallback);
  const [queryContext, setQueryContext] = useState<EntityContext>({});
  const context = useMemo(
    () => mergeEntityContext(routeContext, queryContext),
    [queryContext, routeContext],
  );
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(null);
  const [recentRefreshKey, setRecentRefreshKey] = useState(0);
  const [access, setAccess] = useState<AiAccess | null>(null);

  const handleCaptureCompleted = useCallback(() => {
    setRecentRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get('from') || '';
    const requestedCaptureId = params.get('capture');
    setSelectedCaptureId(null);
    setSourceRoute(value);
    setQueryContext(contextFromSearchParams(params));
    if (requestedCaptureId && UUID_PATTERN.test(requestedCaptureId)) {
      setSelectedCaptureId(requestedCaptureId);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    setAccess(null);
    let active = true;
    void platformRpc<AiAccess>('redream_ai_current_access', {}, workspaceSlug)
      .then((result) => {
        if (active) setAccess(result || { enabled: false });
      })
      .catch(() => {
        if (active) setAccess({ enabled: false });
      });
    return () => {
      active = false;
    };
  }, [workspaceSlug]);

  useEffect(() => {
    setRouteContext(routeFallback);
    if (!sourceRoute.startsWith('/')) return;

    let active = true;
    void platformRpc<EntityContext>('redream_ai_context_for_route', {
      p_route: sourceRoute,
    }, workspaceSlug)
      .then((resolved) => {
        if (!active) return;
        setRouteContext({ ...routeFallback, ...(resolved || {}) });
      })
      .catch(() => {
        if (active) setRouteContext(routeFallback);
      });

    return () => {
      active = false;
    };
  }, [routeFallback, sourceRoute, workspaceSlug]);

  if (access === null) {
    return (
      <div style={{ padding: 18, border: '1px solid #e3e9ed', borderRadius: 16, background: '#fff', color: '#6d8190', fontSize: 11 }}>
        Checking Capture...
      </div>
    );
  }

  if (!access.enabled) {
    return (
      <div style={{ padding: 18, border: '1px solid #e3e9ed', borderRadius: 16, background: '#fff' }}>
        <strong style={{ display: 'block', color: '#17364d', fontSize: 13 }}>Capture is not enabled yet</strong>
        <span style={{ display: 'block', marginTop: 5, color: '#738793', fontSize: 10, lineHeight: 1.5 }}>Your workspace is ready. Capture becomes available when your agency enables it.</span>
      </div>
    );
  }

  return (
    <>
      <AiCapture
        key={workspaceSlug || 'legacy'}
        context={context}
        resumeCaptureId={selectedCaptureId}
        maxAudioSeconds={Number(access.max_audio_seconds || 240)}
        onCompleted={handleCaptureCompleted}
      />
      <AiRecentCaptures
        key={workspaceSlug || 'legacy'}
        refreshKey={recentRefreshKey}
        onOpen={(captureId) => {
          setSelectedCaptureId(null);
          window.setTimeout(() => setSelectedCaptureId(captureId), 0);
        }}
      />
    </>
  );
}
