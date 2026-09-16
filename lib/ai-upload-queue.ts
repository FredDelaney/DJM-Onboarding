// Share in-flight work across the launcher and full page without adding global UI state.
const uploads = new Map<string, Promise<string>>();
let draining: Promise<{ uploaded: number; failed: number }> | null = null;

export async function uploadAiCaptureOnce(id: string, upload: () => Promise<string>): Promise<string> {
  const existing = uploads.get(id);
  if (existing) return existing;
  const operation = Promise.resolve().then(upload);
  uploads.set(id, operation);
  try { return await operation; }
  finally { if (uploads.get(id) === operation) uploads.delete(id); }
}

export async function flushAiQueue<T>(
  read: () => Promise<T[]>,
  upload: (item: T) => Promise<unknown>,
  canContinue: () => boolean = () => true,
): Promise<{ uploaded: number; failed: number }> {
  if (draining) return draining;
  const operation = (async () => {
    const result = { uploaded: 0, failed: 0 };
    const items = await read();
    // A rejected capture stays in storage, but must not strand another agency's notes.
    for (const item of items) {
      if (!canContinue()) break;
      try { await upload(item); result.uploaded += 1; }
      catch { result.failed += 1; }
    }
    return result;
  })();
  draining = operation;
  try { return await operation; }
  finally { if (draining === operation) draining = null; }
}
