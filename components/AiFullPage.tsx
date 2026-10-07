'use client';

import { useSearchParams } from 'next/navigation';

import { useAiWorkspace } from './useAiWorkspace';

import { useCallback, useEffect, useMemo, useState } from 'react';

import JourneyStatus from '@/components/JourneyStatus';
import { readWithDeadline } from '@/lib/read-with-deadline';
import AiCapture from '@/components/AiCapture';
import AiRecentCaptures from '@/components/AiRecentCaptures';
import { platformRpc, friendlyError } from '@/lib/platform-client';
import { readReDreamShare } from '@/lib/redream-share';
import {
  contextFromRoute,
  contextFromSearchParams,
  UUID_PATTERN,
  mergeEntityContext,
  type EntityContext,
} from '@/lib/entity-context';

type AiAccess = {
  workspace_slug?: string;
  enabled?: boolean;
  permission_scope?: string | null;
  max_audio_seconds?: number | null;
};

export default function AiFullPage() {
  const workspaceSlug = useAiWorkspace();
  const search = useSearchParams().toString();
  const shared = useMemo(
    () =>
      readReDreamShare(
        new URLSearchParams(search),
      ),
    [search],
  );
  const [sourceRoute, setSourceRoute] = useState('');
  const routeFallback = useMemo(
    () => (sourceRoute.startsWith('/') ? contextFromRoute(sourceRoute) : {}),
    [sourceRoute],
  );
  const [routeContext, setRouteContext] = useState<EntityContext>(routeFallback);
  const [queryContext, setQueryContext] = useState<EntityContext>({});
  const context = useMemo(
    () => ({
      ...mergeEntityContext(
        routeContext,
        queryContext,
      ),
      ...(shared.hasContent
        ? {
            capture_origin:
              'share_target',
            shared_title:
              shared.title || null,
            shared_url:
              shared.url || null,
          }
        : {}),
    }),
    [
      queryContext,
      routeContext,
      shared.hasContent,
      shared.title,
      shared.url,
    ],
  );
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(null);
  const [recentRefreshKey, setRecentRefreshKey] = useState(0);
  const [access, setAccess] = useState<AiAccess | null>(null);
  const [accessError, setAccessError] = useState('');
  const [accessAttempt, setAccessAttempt] = useState(0);

  const handleCaptureCompleted = useCallback(() => {
    setRecentRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const value = params.get('from') || '';
    const requestedCaptureId = params.get('capture');
    setSelectedCaptureId(null);
    setSourceRoute(value);
    setQueryContext(contextFromSearchParams(params));
    if (requestedCaptureId && UUID_PATTERN.test(requestedCaptureId)) {
      setSelectedCaptureId(requestedCaptureId);
    }
  }, [workspaceSlug, search]);

  useEffect(() => {
    setAccess(null);
    setAccessError('');
    let active = true;
    const controller = new AbortController();
    void readWithDeadline(platformRpc<AiAccess>('redream_ai_current_access', {}, workspaceSlug, controller.signal))
      .then((result) => {
        if (!active) return;
        if (!result || typeof result.enabled !== 'boolean') {
          throw new Error('Capture access could not be confirmed. Please try again.');
        }
        setAccess(result);
      })
      .catch((error) => {
        if (active) setAccessError(friendlyError(error));
      })
      .finally(() => controller.abort());
    return () => {
      active = false;
      controller.abort();
    };
  }, [workspaceSlug, accessAttempt]);

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

  if (accessError) {
    return <JourneyStatus kind="error" title="Could not open Capture" description={accessError} onRetry={() => setAccessAttempt(value => value + 1)}/>;
  }

  if (access === null) {
    return <JourneyStatus kind="loading" title="Opening Capture" description="Checking access to your agency workspace."/>;
  }

  if (!access.enabled) {
    return <JourneyStatus title="Capture is not enabled yet" description="Ask an agency admin to enable Capture for your workspace."/>;
  }

  return (
    <>
      <AiCapture
        key={`capture:${workspaceSlug || 'legacy'}`}
        context={context}
        resumeCaptureId={selectedCaptureId}
        maxAudioSeconds={Number(access.max_audio_seconds || 240)}
        resolvedWorkspaceSlug={access.workspace_slug}
        initialText={
          shared.hasContent
            ? shared.content
            : ''
        }
        onCompleted={handleCaptureCompleted}
      />
      <AiRecentCaptures
        key={`recent:${workspaceSlug || 'legacy'}`}
        refreshKey={recentRefreshKey}
        onOpen={(captureId) => {
          setSelectedCaptureId(null);
          window.setTimeout(() => setSelectedCaptureId(captureId), 0);
        }}
      />
    </>
  );
}
