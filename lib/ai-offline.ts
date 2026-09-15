import { pendingAiWorkspace, type AiWorkspaceContext } from './ai-workspace.ts';

export type PendingAiCapture = {
  workspace?: AiWorkspaceContext;
  workspaceSlug?: string | null;
  id: string;
  createdAt: string;
  channel: string;
  text: string;
  context: Record<string, unknown>;
  mimeType: string | null;
  fileName: string | null;
  durationSeconds: number | null;
  blob: Blob | null;
  parentCaptureId: string | null;
};

// Physical IndexedDB name is a compatibility contract. Keep one store; never reset queued audio.
const DB_NAME = 'djm-tell-djm';
const STORE = 'pending-captures';
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Offline storage is unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open offline storage'));
  });
}

export async function savePendingAiCapture(capture: PendingAiCapture) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(capture);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not save pending capture'));
  });
  db.close();
}

export async function removePendingAiCapture(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not remove pending capture'));
  });
  db.close();
}

export async function listPendingAiCaptures(): Promise<PendingAiCapture[]> {
  const db = await openDb();
  const items = await new Promise<PendingAiCapture[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result || []) as PendingAiCapture[]);
    request.onerror = () => reject(request.error || new Error('Could not read pending captures'));
  });
  db.close();
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}


export type ActiveAiCapture = {
  workspace?: AiWorkspaceContext;
  workspaceSlug?: string | null;
  captureId: string;
  createdAt: string;
};

const ACTIVE_KEY = 'redream-ai-active-captures';
const LEGACY_ACTIVE_KEY = 'djm-tell-djm-active-captures';
const ACTIVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function readActiveCaptures(): ActiveAiCapture[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const read = (key: string): ActiveAiCapture[] => {
      try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; }
      catch { return []; }
    };
    const merged = new Map<string, ActiveAiCapture>();
    for (const item of [...read(LEGACY_ACTIVE_KEY), ...read(ACTIVE_KEY)]) {
      if (item && typeof item.captureId === 'string') merged.set(item.captureId, item);
    }
    const parsed = [...merged.values()];
    const cutoff = Date.now() - ACTIVE_MAX_AGE_MS;
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.captureId === 'string' &&
          typeof item.createdAt === 'string' &&
          new Date(item.createdAt).getTime() >= cutoff,
      )
      .slice(-20);
  } catch {
    return [];
  }
}

function writeActiveCaptures(items: ActiveAiCapture[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    const encoded = JSON.stringify(items.slice(-20));
    localStorage.setItem(ACTIVE_KEY, encoded);
    // Rolling compatibility: older app versions can still resume the same captures.
    localStorage.setItem(LEGACY_ACTIVE_KEY, encoded);
  } catch {
    // Server-side capture is already durable. Receipt resume is best-effort.
  }
}

export function rememberActiveAiCapture(captureId: string, workspaceSlug: string | null = null, workspace?: AiWorkspaceContext) {
  if (!captureId) return;
  const saved = readActiveCaptures();
  const existing = saved.find((item) => item.captureId === captureId);
  if (existing && pendingAiWorkspace(existing) !== null && pendingAiWorkspace(existing) !== workspaceSlug) return;
  const current = saved.filter((item) => item.captureId !== captureId);
  current.push({ captureId, workspaceSlug, workspace: existing?.workspace?.workspaceSlug ? existing.workspace : workspace, createdAt: new Date().toISOString() });
  writeActiveCaptures(current);
}

export function forgetActiveAiCapture(captureId: string) {
  if (!captureId) return;
  writeActiveCaptures(
    readActiveCaptures().filter((item) => item.captureId !== captureId),
  );
}

export function listActiveAiCaptures(): ActiveAiCapture[] {
  const current = readActiveCaptures();
  writeActiveCaptures(current);
  return current;
}

export function chooseRecordingMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return [
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/webm',
  ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

// Resolve only old entries lacking an origin. The server validates current membership;
// a failed lookup leaves the local record intact for a later session.
export async function recoverLegacyAiCaptures(resolveWorkspace: (captureId: string) => Promise<string>) {
  const unknown = readActiveCaptures().filter((item) => pendingAiWorkspace(item) === null);
  await Promise.allSettled(unknown.map(async (item) => {
    const slug = await resolveWorkspace(item.captureId);
    if (slug) rememberActiveAiCapture(item.captureId, slug, {
      workspaceSlug: slug, originRoute: '/tell', runtimeOrigin: 'legacy',
    });
  }));
  return readActiveCaptures();
}
