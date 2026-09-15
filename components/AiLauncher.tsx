'use client';

import { useAiWorkspace } from './useAiWorkspace';

import Link from 'next/link';
import { Mic, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';

import AiCapture from '@/components/AiCapture';
import { platformRpc } from '@/lib/platform-client';
import {
  contextFromRoute,
  mergeEntityContext,
  aiCaptureHref,
  type EntityContext,
} from '@/lib/entity-context';
import styles from './AiLauncher.module.css';

type AiAccess = {
  enabled?: boolean;
  permission_scope?: string | null;
  max_audio_seconds?: number | null;
};

export default function AiLauncher() {
  const [open, setOpen] = useState(false);
  const [unsafeToClose, setUnsafeToClose] = useState(false);
  const [mounted, setMounted] = useState(false);
  const workspaceSlug = useAiWorkspace();
  const pathname = usePathname() || '/djm';
  const routeFallback = useMemo(() => contextFromRoute(pathname), [pathname]);
  const [routeContext, setRouteContext] = useState<EntityContext>(routeFallback);
  const [workspaceContext, setWorkspaceContext] = useState<EntityContext | null>(null);
  const context = useMemo(
    () => mergeEntityContext(routeContext, workspaceContext),
    [routeContext, workspaceContext],
  );
  const [access, setAccess] = useState<AiAccess | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    setAccess(null);
    setWorkspaceContext(null);
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

    let active = true;
    void platformRpc<EntityContext>('redream_ai_context_for_route', {
      p_route: pathname,
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
  }, [pathname, routeFallback, workspaceSlug]);

  useEffect(() => {
    const onWorkspaceContext = (event: Event) => {
      const detail = (event as CustomEvent<EntityContext | null>).detail;
      setWorkspaceContext(detail || null);
    };
    window.addEventListener('redream:ai-context', onWorkspaceContext);
    window.addEventListener('djm:tell-context', onWorkspaceContext);
    return () => {
      window.removeEventListener('redream:ai-context', onWorkspaceContext);
      window.removeEventListener('djm:tell-context', onWorkspaceContext);
    };
  }, [workspaceSlug]);

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
              aria-labelledby="ai-capture-dialog-title"
            >
              <div className={styles.head}>
                <span id="ai-capture-dialog-title">Say what happened. We’ll handle the admin.</span>
                <button
                  type="button"
                  className={styles.close}
                  onClick={() => setOpen(false)}
                  aria-label={unsafeToClose ? 'Finish saving before closing Capture' : 'Close Capture'}
                  disabled={unsafeToClose}
                >
                  <X size={15} />
                </button>
              </div>
              <div className={styles.body}>
                <AiCapture
                  key={workspaceSlug || 'legacy'}
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
                    href={aiCaptureHref(pathname, context, workspaceSlug)}
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
        aria-label="Capture"
        title="Capture"
      >
        <Mic size={15} />
        <span>Capture</span>
      </button>
      {dialog}
    </>
  );
}
