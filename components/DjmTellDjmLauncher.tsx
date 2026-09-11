'use client';

import Link from 'next/link';
import { Mic, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';

import TellDjmCapture from '@/components/TellDjmCapture';
import { djmRpc } from '@/lib/djm-os';
import {
  contextFromRoute,
  mergeDjmContext,
  tellDjmHref,
  type DjmEntityContext,
} from '@/lib/djm-context';
import styles from './DjmTellDjmLauncher.module.css';

type TellAccess = {
  enabled?: boolean;
  permission_scope?: string | null;
  max_audio_seconds?: number | null;
};

export default function DjmTellDjmLauncher() {
  const [open, setOpen] = useState(false);
  const [unsafeToClose, setUnsafeToClose] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname() || '/djm';
  const routeFallback = useMemo(() => contextFromRoute(pathname), [pathname]);
  const [routeContext, setRouteContext] = useState<DjmEntityContext>(routeFallback);
  const [workspaceContext, setWorkspaceContext] = useState<DjmEntityContext | null>(null);
  const context = useMemo(
    () => mergeDjmContext(routeContext, workspaceContext),
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

    let active = true;
    void djmRpc<DjmEntityContext>('djm_tell_context_for_route', {
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
  }, [pathname, routeFallback]);

  useEffect(() => {
    const onWorkspaceContext = (event: Event) => {
      const detail = (event as CustomEvent<DjmEntityContext | null>).detail;
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
                    href={tellDjmHref(pathname, context)}
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
