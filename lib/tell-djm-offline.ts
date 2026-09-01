export type PendingTellDjmCapture = {
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

export async function savePendingTellDjmCapture(capture: PendingTellDjmCapture) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(capture);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not save pending capture'));
  });
  db.close();
}

export async function removePendingTellDjmCapture(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not remove pending capture'));
  });
  db.close();
}

export async function listPendingTellDjmCaptures(): Promise<PendingTellDjmCapture[]> {
  const db = await openDb();
  const items = await new Promise<PendingTellDjmCapture[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result || []) as PendingTellDjmCapture[]);
    request.onerror = () => reject(request.error || new Error('Could not read pending captures'));
  });
  db.close();
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}


export type ActiveTellDjmCapture = {
  captureId: string;
  createdAt: string;
};

const ACTIVE_KEY = 'djm-tell-djm-active-captures';
const ACTIVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function readActiveCaptures(): ActiveTellDjmCapture[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
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

function writeActiveCaptures(items: ActiveTellDjmCapture[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(items.slice(-20)));
  } catch {
    // Server-side capture is already durable. Receipt resume is best-effort.
  }
}

export function rememberActiveTellDjmCapture(captureId: string) {
  if (!captureId) return;
  const current = readActiveCaptures().filter(
    (item) => item.captureId !== captureId,
  );
  current.push({ captureId, createdAt: new Date().toISOString() });
  writeActiveCaptures(current);
}

export function forgetActiveTellDjmCapture(captureId: string) {
  if (!captureId) return;
  writeActiveCaptures(
    readActiveCaptures().filter((item) => item.captureId !== captureId),
  );
}

export function listActiveTellDjmCaptures(): ActiveTellDjmCapture[] {
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
