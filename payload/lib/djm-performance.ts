export type DjmOperationKind = 'rpc' | 'edge';

export type DjmPerformanceDetail = {
  kind: DjmOperationKind;
  name: string;
  duration_ms: number;
  ok: boolean;
  at: string;
};

const now = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

function publish(detail: DjmPerformanceDetail) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<DjmPerformanceDetail>('djm:performance', { detail }),
  );

}

export async function measureDjmOperation<T>(
  kind: DjmOperationKind,
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = now();

  try {
    const result = await operation();
    publish({
      kind,
      name,
      duration_ms: Math.max(0, Math.round(now() - startedAt)),
      ok: true,
      at: new Date().toISOString(),
    });
    return result;
  } catch (error) {
    publish({
      kind,
      name,
      duration_ms: Math.max(0, Math.round(now() - startedAt)),
      ok: false,
      at: new Date().toISOString(),
    });
    throw error;
  }
}
