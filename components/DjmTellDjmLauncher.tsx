'use client';

import Link from 'next/link';
import { Mic, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';

import TellDjmCapture from '@/components/TellDjmCapture';
import { djmRpc } from '@/lib/djm-os';
import styles from './DjmTellDjmLauncher.module.css';

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

const UUID = '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})';

function fallbackContext(pathname: string): TellContext {
  const match = (pattern: RegExp) => pathname.match(pattern)?.[1] || null;
  const playerId = match(new RegExp(`^/admin/players/${UUID}(?:/|$)`));
  if (playerId) return { route: pathname, player_id: playerId, context_type: 'player' };

  const clubId = match(new RegExp(`^/network/clubs/${UUID}(?:/|$)`));
  if (clubId) return { route: pathname, organisation_id: clubId, context_type: 'club' };

  const personId = match(new RegExp(`^/network/contacts/${UUID}(?:/|$)`));
  if (personId) return { route: pathname, person_id: personId, context_type: 'contact' };

  const prospectId = match(new RegExp(`^/recruitment/${UUID}(?:/|$)`));
  if (prospectId) return { route: pathname, prospect_id: prospectId, context_type: 'recruitment' };

  const opportunityId = match(
    new RegExp(`^/(?:opportunities|market/deals)/${UUID}(?:/|$)`),
  );
  if (opportunityId) {
    return { route: pathname, opportunity_id: opportunityId, context_type: 'opportunity' };
  }

  return { route: pathname };
}

function fullScreenHref(pathname: string, context: TellContext) {
  const params = new URLSearchParams({ from: pathname });
  const values: Record<string, string | null | undefined> = {
    context_type: context.context_type,
    label: context.label,
    organisation_id: context.organisation_id,
    organisation_name: context.organisation_name,
    person_id: context.person_id,
    person_name: context.person_name,
    player_id: context.player_id,
    player_name: context.player_name,
    prospect_id: context.prospect_id,
    prospect_name: context.prospect_name,
    opportunity_id: context.opportunity_id,
    club_need_id: context.club_need_id,
    need_position: context.need_position,
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `/tell?${params.toString()}`;
}

export default function DjmTellDjmLauncher() {
  const [open, setOpen] = useState(false);
  const [unsafeToClose, setUnsafeToClose] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname() || '/djm';
  const routeFallback = useMemo(() => fallbackContext(pathname), [pathname]);
  const [routeContext, setRouteContext] = useState<TellContext>(routeFallback);
  const [workspaceContext, setWorkspaceContext] = useState<TellContext | null>(null);
  const context = useMemo(
    () => ({ ...routeContext, ...(workspaceContext || {}) }),
    [routeContext, workspaceContext],
  );
  const [access, setAccess] = useState<TellAccess | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
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
    if (!open) return;

    let active = true;
    void djmRpc<TellContext>('djm_tell_context_for_route', {
      p_route: pathname,
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
  }, [open, pathname, routeFallback]);

  useEffect(() => {
    const onWorkspaceContext = (event: Event) => {
      const detail = (event as CustomEvent<TellContext | null>).detail;
      setWorkspaceContext(detail || null);
    };
    window.addEventListener('djm:tell-context', onWorkspaceContext);
    return () => {
      window.removeEventListener('djm:tell-context', onWorkspaceContext);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !unsafeToClose) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, unsafeToClose]);

  useEffect(() => {
    if (!open || !mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, mounted]);

  if (!access?.enabled) return null;

  const dialog =
    open && mounted
      ? createPortal(
          <div
            className={styles.overlay}
            onClick={(event) => {
              if (event.target !== event.currentTarget || unsafeToClose) return;
              setOpen(false);
            }}
          >
            <div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="tell-djm-dialog-title"
            >
              <div className={styles.head}>
                <span id="tell-djm-dialog-title">Say what happened. DJM does the admin.</span>
                <button
                  type="button"
                  className={styles.close}
                  onClick={() => setOpen(false)}
                  aria-label={unsafeToClose ? 'Finish saving before closing Tell DJM' : 'Close Tell DJM'}
                  disabled={unsafeToClose}
                >
                  <X size={15} />
                </button>
              </div>
              <div className={styles.body}>
                <TellDjmCapture
                  compact
                  context={context}
                  onUnsafeToCloseChange={setUnsafeToClose}
                  maxAudioSeconds={Number(access.max_audio_seconds || 240)}
                />
                {unsafeToClose ? (
                  <span className={styles.fullDisabled} aria-disabled="true">
                    Finish saving before opening full screen
                  </span>
                ) : (
                  <Link
                    className={styles.full}
                    href={fullScreenHref(pathname, context)}
                    onClick={() => setOpen(false)}
                  >
                    Open full screen
                  </Link>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-label="Tell DJM"
        title="Tell DJM"
      >
        <Mic size={15} />
        <span>Tell DJM</span>
      </button>
      {dialog}
    </>
  );
}
