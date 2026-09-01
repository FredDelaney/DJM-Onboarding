'use client';

import { useEffect, useMemo, useState } from 'react';

import TellDjmCapture from '@/components/TellDjmCapture';
import TellDjmRecentCaptures from '@/components/TellDjmRecentCaptures';
import { djmRpc } from '@/lib/djm-os';

type TellAccess = {
  enabled?: boolean;
  permission_scope?: string | null;
  max_audio_seconds?: number | null;
};

type TellContext = {
  route?: string | null;
  label?: string | null;
  context_type?: string | null;
  organisation_id?: string | null;
  organisation_name?: string | null;
  person_id?: string | null;
  person_name?: string | null;
  player_id?: string | null;
  player_name?: string | null;
  prospect_id?: string | null;
  prospect_name?: string | null;
  opportunity_id?: string | null;
  club_need_id?: string | null;
  need_position?: string | null;
};

const UUID =
  '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})';

function fallbackContext(pathname: string): TellContext {
  const match = (pattern: RegExp) => pathname.match(pattern)?.[1] || null;

  const playerId = match(new RegExp(`^/admin/players/${UUID}(?:/|$)`));
  if (playerId) {
    return { route: pathname, player_id: playerId, context_type: 'player' };
  }

  const clubId = match(new RegExp(`^/network/clubs/${UUID}(?:/|$)`));
  if (clubId) {
    return { route: pathname, organisation_id: clubId, context_type: 'club' };
  }

  const personId = match(new RegExp(`^/network/contacts/${UUID}(?:/|$)`));
  if (personId) {
    return { route: pathname, person_id: personId, context_type: 'contact' };
  }

  const prospectId = match(new RegExp(`^/recruitment/${UUID}(?:/|$)`));
  if (prospectId) {
    return {
      route: pathname,
      prospect_id: prospectId,
      context_type: 'recruitment',
    };
  }

  const opportunityId = match(
    new RegExp(`^/(?:opportunities|market/deals)/${UUID}(?:/|$)`),
  );
  if (opportunityId) {
    return {
      route: pathname,
      opportunity_id: opportunityId,
      context_type: 'opportunity',
    };
  }

  return { route: pathname };
}

export default function TellDjmFullPage() {
  const [sourceRoute, setSourceRoute] = useState('');
  const routeFallback = useMemo(
    () => (sourceRoute.startsWith('/') ? fallbackContext(sourceRoute) : {}),
    [sourceRoute],
  );
  const [routeContext, setRouteContext] = useState<TellContext>(routeFallback);
  const [queryContext, setQueryContext] = useState<TellContext>({});
  const context = useMemo(
    () => ({ ...routeContext, ...queryContext }),
    [queryContext, routeContext],
  );
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(null);
  const [recentRefreshKey, setRecentRefreshKey] = useState(0);
  const [access, setAccess] = useState<TellAccess | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get('from') || '';
    const requestedCaptureId = params.get('capture');
    setSourceRoute(value);
    const inlineContext: TellContext = {};
    const idKeys = new Set([
      'organisation_id',
      'person_id',
      'player_id',
      'prospect_id',
      'opportunity_id',
      'club_need_id',
    ]);
    [
      'context_type',
      'label',
      'organisation_id',
      'organisation_name',
      'person_id',
      'person_name',
      'player_id',
      'player_name',
      'prospect_id',
      'prospect_name',
      'opportunity_id',
      'club_need_id',
      'need_position',
    ].forEach((key) => {
      const contextValue = params.get(key);
      if (
        contextValue &&
        (!idKeys.has(key) || new RegExp(`^${UUID}$`).test(contextValue))
      ) {
        (inlineContext as Record<string, string>)[key] = contextValue;
      }
    });
    setQueryContext(inlineContext);
    if (
      requestedCaptureId &&
      new RegExp(`^${UUID}$`).test(requestedCaptureId)
    ) {
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
    void djmRpc<TellContext>('djm_tell_context_for_route', {
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
        onCompleted={() => setRecentRefreshKey((value) => value + 1)}
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
