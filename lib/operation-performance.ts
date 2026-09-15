export type OperationKind = 'rpc' | 'edge';

export type OperationPerformanceDetail = {
  kind: OperationKind;
  name: string;
  duration_ms: number;
  ok: boolean;
  at: string;
};

const now = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

function publish(detail: OperationPerformanceDetail) {
  if (typeof window === 'undefined') return;

  // Retain the old event channel for existing diagnostics during transition.
  window.dispatchEvent(new CustomEvent<OperationPerformanceDetail>('djm:performance', { detail }));
  window.dispatchEvent(
    new CustomEvent<OperationPerformanceDetail>('redream:performance', { detail }),
  );

}

export async function measureOperation<T>(
  kind: OperationKind,
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
