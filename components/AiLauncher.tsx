'use client';

import { isolateElements, lockPageScroll } from '@/lib/page-scroll-lock';
import { useAiWorkspace } from './useAiWorkspace';
import { useVisualViewport } from './useVisualViewport';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Mic, X } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';

import { platformRpc } from '@/lib/platform-client';
import {
  contextFromWorkspaceRoute,
  entityContextLookupRoute,
  mergeEntityContext,
  aiCaptureHref,
  type EntityContext,
} from '@/lib/entity-context';
import styles from './AiLauncher.module.css';

const AiCapture = dynamic(() => import('@/components/AiCapture'), {
  loading: () => <p className={styles.loading} role="status">Opening Tell ReDream...</p>,
});

const preloadCapture = () => {
  void import('@/components/AiCapture').catch(() => {
    // Opening the dialog retains the normal module loading and error path.
  });
};

type AiAccess = {
  workspace_slug?: string;
  enabled?: boolean;
  permission_scope?: string | null;
  max_audio_seconds?: number | null;
};

const aiAccessRequests = new Map<string, Promise<AiAccess>>();
const aiRouteRequests = new Map<string, Promise<EntityContext>>();

const cachedAiAccess = (workspaceSlug?: string | null) => {
  const key = workspaceSlug || 'legacy';
  let request = aiAccessRequests.get(key);
  if (!request) {
    request = platformRpc<AiAccess>(
      'redream_ai_current_access',
      {},
      workspaceSlug,
    ).catch((error) => {
      aiAccessRequests.delete(key);
      throw error;
    });
    aiAccessRequests.set(key, request);
  }
  return request;
};

const cachedAiRouteContext = (
  pathname: string,
  workspaceSlug?: string | null,
) => {
  const key = `${workspaceSlug || 'legacy'}:${pathname}`;
  let request = aiRouteRequests.get(key);
  if (!request) {
    request = platformRpc<EntityContext>(
      'redream_ai_context_for_route',
      { p_route: pathname },
      workspaceSlug,
    ).catch((error) => {
      aiRouteRequests.delete(key);
      throw error;
    });
    aiRouteRequests.set(key, request);
  }
  return request;
};

export default function AiLauncher({navigation=false,className,onCaptureCompleted}:{navigation?:boolean;className?:string;onCaptureCompleted?:()=>void}={}) {
  const [open, setOpen] = useState(false);
  const viewport = useVisualViewport(open);
  const [unsafeToClose, setUnsafeToClose] = useState(false);
  const [mounted, setMounted] = useState(false);
  const workspaceSlug = useAiWorkspace();
  const pathname = usePathname() || '/djm';
  const query=useSearchParams().toString();
  const sourceRoute=pathname+(query?'?'+query:'');
  const routeFallback=useMemo(()=>contextFromWorkspaceRoute(pathname,new URLSearchParams(query)),[pathname,query]);
  const captureDialog=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const [routeContext, setRouteContext] = useState<EntityContext>(routeFallback);
  const [workspaceContext, setWorkspaceContext] = useState<{route:string;value:EntityContext}|null>(null);
  const context = useMemo(
    () => mergeEntityContext(routeContext.route===sourceRoute?routeContext:routeFallback,workspaceContext?.route===sourceRoute?workspaceContext.value:null),
    [routeContext,routeFallback,workspaceContext,sourceRoute],
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
    const timer = window.setTimeout(() => {
      void cachedAiAccess(workspaceSlug)
        .then((result) => {
          if (active) setAccess(result || { enabled: false });
        })
        .catch(() => {
          if (active) setAccess({ enabled: false });
        });
    }, 750);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [workspaceSlug]);

  useEffect(() => {
    setRouteContext(routeFallback);
    if (!open) return;

    let active = true;
    void cachedAiRouteContext(entityContextLookupRoute(routeFallback,sourceRoute), workspaceSlug)
      .then((resolved) => {
        if (!active) return;
        setRouteContext(mergeEntityContext(resolved||{},routeFallback));
      })
      .catch(() => {
        if (active) setRouteContext(routeFallback);
      });

    return () => {
      active = false;
    };
  }, [open, sourceRoute, routeFallback, workspaceSlug]);

  useEffect(() => {
    const onWorkspaceContext = (event: Event) => {
      const detail = (event as CustomEvent<EntityContext | null>).detail;
      setWorkspaceContext(detail?{route:sourceRoute,value:detail}:null);
    };
    window.addEventListener('redream:ai-context', onWorkspaceContext);
    window.addEventListener('djm:tell-context', onWorkspaceContext);
    return () => {
      window.removeEventListener('redream:ai-context', onWorkspaceContext);
      window.removeEventListener('djm:tell-context', onWorkspaceContext);
    };
  }, [workspaceSlug,sourceRoute]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const anotherModal = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]')).some(node =>
        node !== captureDialog.current && node.getClientRects().length > 0 && !node.closest('[inert]') && !captureDialog.current?.contains(node),
      );
      if (anotherModal) return;
      if (event.key === 'Escape' && !unsafeToClose) {event.preventDefault();setOpen(false);}
      if(event.key==='Tab'){
        const controls=Array.from(captureDialog.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')||[]).filter(node=>node.getClientRects().length&&!node.closest('[inert]'));
        const first=controls[0],last=controls.at(-1);
        if(!first){event.preventDefault();captureDialog.current?.focus();}
        else if(event.shiftKey&&(document.activeElement===first||!captureDialog.current?.contains(document.activeElement))){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||!captureDialog.current?.contains(document.activeElement))){event.preventDefault();first.focus();}
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, unsafeToClose]);

  useEffect(() => {
    if (!open || !mounted) return;
    const releaseScroll = lockPageScroll();
    const previousFocus=trigger.current;
    const siblings=Array.from(document.body.children).filter((node):node is HTMLElement=>node instanceof HTMLElement&&!node.contains(captureDialog.current));
    const releaseBackground = isolateElements(siblings);

    captureDialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      releaseBackground();
      releaseScroll();
      if(previousFocus?.isConnected)previousFocus.focus();
    };
  }, [open, mounted]);

  if (!access?.enabled) {
    if(!navigation)return null;
    return <Link href={aiCaptureHref(sourceRoute,context,workspaceSlug)} className={className} aria-label="Tell ReDream"><Mic size={21}/><span>Tell ReDream</span></Link>;
  }

  const dialog =
    open && mounted
      ? createPortal(
          <div
            className={styles.overlay}
            data-compact={viewport ? viewport.height < 500 : undefined}
            style={viewport ? {top: viewport.top, height: viewport.height, bottom: 'auto'} : undefined}
            onClick={(event) => {
              if (event.target !== event.currentTarget || unsafeToClose) return;
              setOpen(false);
            }}
          >
            <div
              className={styles.modal}
              ref={captureDialog}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-capture-dialog-title"
            >
              <div className={styles.head}>
                <span id="ai-capture-dialog-title">Tell ReDream</span>
                <button
                  type="button"
                  className={styles.close}
                  onClick={() => setOpen(false)}
                  aria-label={unsafeToClose ? 'Finish saving before closing Tell ReDream' : 'Close Tell ReDream'}
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
                  onNavigate={() => { if (!unsafeToClose) setOpen(false); }}
                  onCompleted={onCaptureCompleted}
                  maxAudioSeconds={Number(access.max_audio_seconds || 240)}
                  resolvedWorkspaceSlug={access.workspace_slug}
                />
                {unsafeToClose ? (
                  <span className={styles.fullDisabled} aria-disabled="true">
                    Finish saving before opening full screen
                  </span>
                ) : (
                  <Link
                    className={styles.full}
                    href={aiCaptureHref(sourceRoute, context, workspaceSlug)}
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
        className={navigation?className:styles.trigger}
        ref={trigger}
        aria-haspopup="dialog" aria-expanded={open}
        onPointerEnter={preloadCapture}
        onPointerDown={preloadCapture}
        onFocus={preloadCapture}
        onClick={() => setOpen(true)}
        aria-label="Tell ReDream"
        title="Tell ReDream"
      >
        <Mic size={15} />
        <span>Tell ReDream</span>
      </button>
      {dialog}
    </>
  );
}
