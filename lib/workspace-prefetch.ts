type Connection = EventTarget & {saveData?: boolean; effectiveType?: string};

// Optional reads wait until the visible page is settled. Explicit navigation
// does not use this scheduler and keeps its existing immediate loading path.
export function scheduleWorkspaceWarming(warm: (canContinue: () => boolean) => void | Promise<void>) {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof navigator === 'undefined') return () => {};
  const connection = (navigator as Navigator & {connection?: Connection}).connection;
  let stopped = false, started = false;
  let timer: number | undefined, idle: number | undefined;
  const allowed = () => !stopped && !document.hidden && navigator.onLine !== false && !connection?.saveData && !['slow-2g', '2g', '3g'].includes(connection?.effectiveType || '');
  const cancel = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
    timer = undefined; idle = undefined;
  };
  const run = () => {
    idle = undefined;
    if (started || !allowed()) return;
    started = true;
    void Promise.resolve().then(() => {if (allowed()) return warm(allowed);}).catch(() => {
      // Speculative reads must not interrupt the visible page.
    });
  };
  const schedule = () => {
    if (!allowed()) {cancel(); return;}
    if (started || timer !== undefined || idle !== undefined) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!allowed()) return;
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(run);
      else run();
    }, 1200);
  };
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('online', schedule);
  window.addEventListener('offline', schedule);
  connection?.addEventListener?.('change', schedule);
  schedule();
  return () => {
    stopped = true; cancel();
    document.removeEventListener('visibilitychange', schedule);
    window.removeEventListener('online', schedule);
    window.removeEventListener('offline', schedule);
    connection?.removeEventListener?.('change', schedule);
  };
}
