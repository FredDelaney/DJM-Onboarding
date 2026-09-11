'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import TellDjmCapture from '@/components/TellDjmCapture';
import TellDjmRecentCaptures from '@/components/TellDjmRecentCaptures';
import { djmRpc } from '@/lib/djm-os';
import {
  contextFromRoute,
  contextFromSearchParams,
  DJM_UUID_PATTERN,
  mergeDjmContext,
  type DjmEntityContext,
} from '@/lib/djm-context';

type TellAccess = {
  enabled?: boolean;
  permission_scope?: string | null;
  max_audio_seconds?: number | null;
};

export default function TellDjmFullPage() {
  const [sourceRoute, setSourceRoute] = useState('');
  const routeFallback = useMemo(
    () => (sourceRoute.startsWith('/') ? contextFromRoute(sourceRoute) : {}),
    [sourceRoute],
  );
  const [routeContext, setRouteContext] = useState<DjmEntityContext>(routeFallback);
  const [queryContext, setQueryContext] = useState<DjmEntityContext>({});
  const context = useMemo(
    () => mergeDjmContext(routeContext, queryContext),
    [queryContext, routeContext],
  );
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(null);
  const [recentRefreshKey, setRecentRefreshKey] = useState(0);
  const [access, setAccess] = useState<TellAccess | null>(null);

  const handleCaptureCompleted = useCallback(() => {
    setRecentRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get('from') || '';
    const requestedCaptureId = params.get('capture');
    setSourceRoute(value);
    setQueryContext(contextFromSearchParams(params));
    if (requestedCaptureId && DJM_UUID_PATTERN.test(requestedCaptureId)) {
      setSelectedCaptureId(requestedCaptureId);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void djmRpc<TellAccess>('djm_tell_current_access')
      .then((result) => {
        if (active) setAccess(result || { enabled: false });
      })
      .catch(() => {
        if (active) setAccess({ enabled: false });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setRouteContext(routeFallback);
    if (!sourceRoute.startsWith('/')) return;

    let active = true;
    void djmRpc<DjmEntityContext>('djm_tell_context_for_route', {
      p_route: sourceRoute,
    })
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
  }, [routeFallback, sourceRoute]);

  if (access === null) {
    return (
      <div style={{ padding: 18, border: '1px solid #e3e9ed', borderRadius: 16, background: '#fff', color: '#6d8190', fontSize: 11 }}>
        Checking Tell DJM...
      </div>
    );
  }

  if (!access.enabled) {
    return (
      <div style={{ padding: 18, border: '1px solid #e3e9ed', borderRadius: 16, background: '#fff' }}>
        <strong style={{ display: 'block', color: '#17364d', fontSize: 13 }}>Tell DJM is not enabled yet</strong>
        <span style={{ display: 'block', marginTop: 5, color: '#738793', fontSize: 10, lineHeight: 1.5 }}>The rest of DJM is working normally. This capture tool will appear automatically once its secure backend is live for your account.</span>
      </div>
    );
  }

  return (
    <>
      <TellDjmCapture
        context={context}
        resumeCaptureId={selectedCaptureId}
        maxAudioSeconds={Number(access.max_audio_seconds || 240)}
        onCompleted={handleCaptureCompleted}
      />
      <TellDjmRecentCaptures
        refreshKey={recentRefreshKey}
        onOpen={(captureId) => {
          setSelectedCaptureId(null);
          window.setTimeout(() => setSelectedCaptureId(captureId), 0);
        }}
      />
    </>
  );
}
