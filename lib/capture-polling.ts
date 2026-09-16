export function isCaptureReadDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code } = error as { code?: string };
  return code === '42501' || code === 'PGRST301' || code === 'PGRST302';
}

export function waitForCapturePoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
  });
}

export async function pollCaptureReceipt<T>(options: {
  signal: AbortSignal;
  attempts: number;
  retryDelayMs: number;
  read: (signal: AbortSignal) => Promise<T>;
  received: (receipt: T, attempt: number) => number | null;
  denied: () => void;
  exhausted: () => void;
}) {
  const { signal } = options;
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    if (signal.aborted) return;
    let receipt: T;
    try { receipt = await options.read(signal); }
    catch (error) {
      if (signal.aborted) return;
      if (isCaptureReadDenied(error)) { options.denied(); return; }
      if (attempt < options.attempts - 1) await waitForCapturePoll(options.retryDelayMs, signal);
      continue;
    }
    if (signal.aborted) return;
    const delay = options.received(receipt, attempt);
    if (delay === null) return;
    if (attempt < options.attempts - 1) await waitForCapturePoll(delay, signal);
  }
  if (!signal.aborted) options.exhausted();
}
