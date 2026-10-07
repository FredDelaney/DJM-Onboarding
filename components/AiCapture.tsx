'use client';

import { supabase } from '@/lib/supabase';
import { assertAiCaptureOwner } from '@/lib/ai-offline';
import { saveAiDraft } from '@/lib/ai-draft-save';
import { pollCaptureReceipt } from '@/lib/capture-polling';
import { flushAiQueue, uploadAiCaptureOnce } from '@/lib/ai-upload-queue';

import { pendingAiWorkspace } from '@/lib/ai-workspace';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { useAiWorkspaceContext } from './useAiWorkspace';

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileText,
  LoaderCircle,
  Mic,
  Plus,
  RotateCcw,
  Send,
  Square,
  Trash2,
  Type,
  WifiOff,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';

import { platformInvoke, platformRpc, friendlyError } from '@/lib/platform-client';
import {
  chooseRecordingMimeType,
  forgetActiveAiCapture,
  listActiveAiCaptures,
  recoverLegacyAiCaptures,
  listPendingAiCaptures,
  PendingAiCapture,
  rememberActiveAiCapture,
  removePendingAiCapture,
  savePendingAiCapture,
} from '@/lib/ai-offline';

import styles from './AiCapture.module.css';

type Context = {
  label?: string | null;
  organisation_id?: string | null;
  organisation_name?: string | null;
  person_id?: string | null;
  person_name?: string | null;
  player_id?: string | null;
  player_name?: string | null;
  prospect_id?: string | null;
  prospect_name?: string | null;
  opportunity_id?: string | null;
  club_need_id?: string | null;
  context_type?: string | null;
  route?: string | null;
};

type Receipt = {
  capture?: {
    id: string;
    status: string;
    summary?: string | null;
    transcript_text?: string | null;
    created_at?: string | null;
  };
  actions?: Array<{
    id: string;
    action_type: string;
    status: string;
    confidence?: number | null;
    evidence?: string | null;
    proposed_payload?: Record<string, any>;
    resolved_payload?: Record<string, any>;
    target_type?: string | null;
    target_id?: string | null;
    verification?: Record<string, any>;
    undo_supported?: boolean;
    error_message?: string | null;
  }>;
  questions?: Array<{
    id: string;
    prompt: string;
    reason?: string | null;
    status?: string;
    candidates?: Array<Record<string, any>>;
  }>;
};

const DEFAULT_MAX_SECONDS = 240;
const ACTIVE_POLL_MS = 200;
const TRANSCRIBING_POLL_MS = 400;
const BACKGROUND_POLL_MS = 1000;
const POLL_ATTEMPTS = 180;
const TERMINAL = new Set([
  'done',
  'needs_input',
  'needs_review',
  'partial',
  'failed',
  'budget_blocked',
]);

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function actionLabel(type: string) {
  return {
    log_interaction: 'Conversation logged',
    upsert_club_need: 'Club need updated',
    create_task: 'Follow-up created',
    add_claim: 'Intelligence saved',
    suggest_player: 'Player added as an option',
    exclude_player: 'Player excluded from need',
  }[type] || type.replaceAll('_', ' ');
}

function proposedPayload(action: NonNullable<Receipt['actions']>[number]) {
  return action?.resolved_payload || action?.proposed_payload || {};
}

function moneyValue(payload: Record<string, any>) {
  const raw = String(
    payload.transfer_budget_raw || payload.salary_budget_raw || '',
  ).trim();
  if (raw) return raw;
  const amount = payload.transfer_budget ?? payload.salary_budget;
  if (amount == null || amount === '') return '';
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return String(amount);
  const currency = String(payload.currency || '').trim();
  const prefix = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency ? `${currency} ` : '';
  if (Math.abs(numeric) >= 1_000_000) return `${prefix}${(numeric / 1_000_000).toLocaleString('en-GB', { maximumFractionDigits: 2 })}m`;
  if (Math.abs(numeric) >= 1_000) return `${prefix}${(numeric / 1_000).toLocaleString('en-GB', { maximumFractionDigits: 1 })}k`;
  return `${prefix}${numeric.toLocaleString('en-GB')}`;
}

function dueValue(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return String(value);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayKey = (item: Date) =>
    [item.getFullYear(), item.getMonth(), item.getDate()].join('-');
  if (dayKey(date) === dayKey(today)) return 'Today';
  if (dayKey(date) === dayKey(tomorrow)) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function previewRows(actions: Receipt['actions'] = []) {
  const rows: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: unknown) => {
    const text = String(value ?? '').trim();
    if (!text || rows.some(row => row.label === label && row.value === text)) return;
    rows.push({ label, value: text });
  };

  actions
    .filter(action => ['pending', 'applied', 'undone'].includes(action.status))
    .forEach(action => {
      const payload = proposedPayload(action);
      if (action.action_type === 'upsert_club_need') {
        add('Club need', payload.club_name);
        add('Position', payload.position);
        if (payload.preferred_foot) add('Preferred foot', payload.preferred_foot);
        if (payload.max_age != null && payload.min_age == null) {
          const max = Number(payload.max_age);
          add('Age', Number.isFinite(max) && max === 22 ? 'U23' : `Up to ${payload.max_age}`);
        } else if (payload.min_age != null || payload.max_age != null) {
          add('Age', [payload.min_age, payload.max_age].filter((value: any) => value != null).join(' to '));
        }
        add('Budget', moneyValue(payload));
      }
      if (action.action_type === 'suggest_player') {
        add('Suggested player', payload.player_name);
      }
      if (action.action_type === 'create_task') {
        add('Next action', payload.title);
        add('Owner', payload.owner_display_name || payload.owner_name || 'You');
        add('Due', dueValue(payload.due_at));
      }
      if (action.action_type === 'log_interaction') {
        add('Relationship event', payload.summary || 'Conversation logged');
      }
      if (action.action_type === 'add_claim') {
        add('Intelligence', payload.claim_value);
      }
      if (action.action_type === 'log_scout_observation') {
        add('Scouting note', payload.player_name);
      }
    });

  return rows.slice(0, 12);
}

export default function AiCapture({
  context,
  compact = false,
  onCompleted,
  onUnsafeToCloseChange,
  resumeCaptureId,
  maxAudioSeconds = DEFAULT_MAX_SECONDS,
  resolvedWorkspaceSlug,
  initialText = '',
}: {
  context?: Context;
  compact?: boolean;
  onCompleted?: (receipt: Receipt) => void;
  onUnsafeToCloseChange?: (unsafe: boolean) => void;
  resumeCaptureId?: string | null;
  maxAudioSeconds?: number;
  resolvedWorkspaceSlug?: string | null;
  initialText?: string;
}) {
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const requestedWorkspace = useAiWorkspaceContext();
  const workspace = { ...requestedWorkspace, workspaceSlug: requestedWorkspace.workspaceSlug ?? resolvedWorkspaceSlug ?? 'unresolved' };
  const workspaceSlug = workspace.workspaceSlug;
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [unsavedDraft, setUnsavedDraft] = useState<PendingAiCapture | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);
  const [deletingCapture, setDeletingCapture] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [approvingCapture, setApprovingCapture] = useState(false);
  const [editingCapture, setEditingCapture] = useState(false);

  const recordingRequestRef = useRef(false);
  const lifecycleRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const pollingRef = useRef<Map<string, AbortController>>(new Map());
  const activeWorkspaceRef = useRef(workspaceSlug);
  activeWorkspaceRef.current = workspaceSlug;
  const displayCaptureRef = useRef<string | null>(null);
  const appliedInitialTextRef = useRef('');

  useEffect(() => {
    const sharedText = initialText.trim();

    if (
      !sharedText ||
      appliedInitialTextRef.current === sharedText ||
      recording ||
      busy ||
      unsavedDraft
    ) {
      return;
    }

    appliedInitialTextRef.current = sharedText;
    setMode('text');
    setText(sharedText);
    setReceipt(null);
    setStatus('');
    setError('');
  }, [
    busy,
    initialText,
    recording,
    unsavedDraft,
  ]);

  useEffect(() => {
    onUnsafeToCloseChange?.(
      recording ||
      busy ||
      approvingCapture ||
      editingCapture ||
      Boolean(unsavedDraft),
    );
  }, [
    approvingCapture,
    busy,
    editingCapture,
    onUnsafeToCloseChange,
    recording,
    unsavedDraft,
  ]);

  useEffect(() => {
    displayCaptureRef.current = null;
    setReceipt(null);
    setStatus('');
  }, [workspaceSlug]);

  const contextPayload = useCallback(
    () => ({
      ...(context || {}),
      route:
        context?.route ||
        (typeof window !== 'undefined' ? window.location.pathname : null),
    }),
    [context],
  );

  useEffect(() => {
    mountedRef.current = true;
    const controllers = pollingRef.current;
    return () => {
      mountedRef.current = false;
      lifecycleRef.current += 1;
      controllers.forEach(controller => controller.abort());
      controllers.clear();
    };
  }, [workspaceSlug]);

  const pollReceipt = useCallback(
    async (captureId: string, focus = true) => {
      if (!mountedRef.current) return;
      if (focus) displayCaptureRef.current = captureId;
      if (pollingRef.current.has(captureId)) return;
      const controller = new AbortController();
      pollingRef.current.set(captureId, controller);
      let verified = false;
      try {
        await pollCaptureReceipt<Receipt>({
          signal: controller.signal,
          attempts: POLL_ATTEMPTS,
          retryDelayMs: BACKGROUND_POLL_MS,
          read: signal => platformRpc<Receipt>('redream_ai_receipt', {
            p_capture_id: captureId,
          }, workspaceSlug, signal),
          received: (next, attempt) => {
            if (activeWorkspaceRef.current !== workspaceSlug) return null;
            verified = true;
            if (displayCaptureRef.current === captureId) setReceipt(next);
            const nextStatus = next?.capture?.status || '';
            const transcriptReady = Boolean(next?.capture?.transcript_text);
            if (TERMINAL.has(nextStatus)) {
              forgetActiveAiCapture(captureId);
              if (displayCaptureRef.current === captureId) setStatus('');
              onCompleted?.(next);
              return null;
            }
            if (displayCaptureRef.current === captureId) {
              setStatus(transcriptReady ? 'Transcript ready. Doing it now...' : 'Transcribing...');
            }
            return attempt >= 40 ? BACKGROUND_POLL_MS : transcriptReady ? ACTIVE_POLL_MS : TRANSCRIBING_POLL_MS;
          },
          denied: () => {
            if (displayCaptureRef.current !== captureId) return;
            setReceipt(null);
            setStatus('');
            setError('This update is not available in this workspace. Check your agency access and try again.');
          },
          exhausted: () => {
            if (displayCaptureRef.current !== captureId) return;
            setStatus(verified
              ? 'Safely saved. ReDream is still processing this in the background. You can close this screen.'
              : 'Unable to check this update right now. Reopen Capture when connected.');
          },
        });
      } finally {
        if (pollingRef.current.get(captureId) === controller) pollingRef.current.delete(captureId);
      }
    },
    [onCompleted, workspaceSlug],
  );


  useEffect(() => {
    if (!resumeCaptureId) return;
    rememberActiveAiCapture(resumeCaptureId, workspaceSlug, workspace);
    setStatus('Checking this ReDream update...');
    void pollReceipt(resumeCaptureId, true);
  }, [pollReceipt, resumeCaptureId, workspaceSlug]);

  const uploadPending = useCallback(
    async (pending: PendingAiCapture, showReceipt = true) => {
      const captureId = await uploadAiCaptureOnce(pending.id, async () => {
        const { data: { session } } = await supabase.auth.getSession();
        assertAiCaptureOwner(pending, session?.user.id);
        const form = new FormData();
        form.append('client_capture_id', pending.id);
        form.append('channel', pending.channel);
        const pendingWorkspace = pendingAiWorkspace(pending);
        if (pendingWorkspace != null) form.append('workspace_slug', pendingWorkspace);
        form.append('context_json', JSON.stringify(pending.context || {}));
        if (pending.text.trim()) form.append('text', pending.text.trim());
        if (pending.parentCaptureId) {
          form.append('parent_capture_id', pending.parentCaptureId);
        }
        if (pending.durationSeconds != null) {
          form.append('duration_seconds', String(pending.durationSeconds));
        }
        if (pending.blob) {
          const file = new File(
            [pending.blob],
            pending.fileName || `ai-capture-${pending.id}.webm`,
            { type: pending.mimeType || pending.blob.type || 'audio/webm' },
          );
          form.append('file', file);
        }

        const result: any = await platformInvoke('redream-ai-capture', form, session!.access_token);
        if (!result?.capture_id) {
          throw new Error('Your update could not be confirmed. Please try again.');
        }

        rememberActiveAiCapture(result.capture_id, pendingWorkspace, pending.workspace);
        await removePendingAiCapture(pending.id).catch(() => undefined);
        return result.capture_id as string;
      });
      // Each caller may open its own receipt even when the upload was shared.
      if (showReceipt && pendingAiWorkspace(pending) === workspaceSlug) void pollReceipt(captureId, true);
      return captureId;
    },
    [pollReceipt, workspaceSlug],
  );

  const flushPending = useCallback(async () => {
    let uploadedAny = false;
    try {
      const result = await flushAiQueue(listPendingAiCaptures, (item) => uploadPending(item, false));
      uploadedAny = result.uploaded > 0;
      if (result.failed > 0 && mountedRef.current) setError('Some saved notes could not upload. They remain on this phone; check your connection and original account. Older notes without an account need recovery.');
    } catch {
      return; // Local storage is unavailable; existing pending data is untouched.
    }

    if (uploadedAny) {
      const latest = listActiveAiCaptures().filter((item) => pendingAiWorkspace(item) === workspaceSlug).slice(-1)[0];
      if (latest && !displayCaptureRef.current) {
        void pollReceipt(latest.captureId, true);
      }
    }
  }, [pollReceipt, uploadPending, workspaceSlug]);

  useEffect(() => {
    void flushPending();

    let mounted = true;
    void recoverLegacyAiCaptures((captureId) => platformRpc<string>(
      'redream_ai_capture_workspace', { p_capture_id: captureId },
    )).then((captures) => {
      const active = captures.filter((item) => pendingAiWorkspace(item) === workspaceSlug).slice(-1)[0];
      if (mounted && active && !displayCaptureRef.current) void pollReceipt(active.captureId, true);
    });

    const online = () => void flushPending();
    const retryTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void flushPending();
    }, 60_000);

    window.addEventListener('online', online);
    return () => {
      mounted = false;
      window.removeEventListener('online', online);
      window.clearInterval(retryTimer);
    };
  }, [flushPending, pollReceipt]);

  useEffect(() => {
    const unsafe = recording || busy || Boolean(unsavedDraft);
    if (!unsafe) return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    const guardLinks = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a[href]');
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      setError(
        recording
          ? 'Finish the voice note before leaving this screen.'
          : 'ReDream is still securing this note. Wait until it says safely saved.',
      );
    };

    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', guardLinks, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', guardLinks, true);
    };
  }, [busy, recording, unsavedDraft]);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => stopTracks(), []);

  const persistDraft = async (pending: PendingAiCapture) => {
    setUnsavedDraft(pending);
    setBusy(true);
    setError('');
    setReceipt(null);
    setStatus('Saving your note...');
    const result = await saveAiDraft(pending, {
      saveLocal: savePendingAiCapture,
      upload: uploadPending,
      online: () => navigator.onLine,
    });
    setBusy(false);
    if (result.state === 'unsaved') {
      setStatus('Not saved yet. Keep this screen open, reconnect and try saving again.');
      setError(result.error ? friendlyError(result.error) : 'This browser could not store the note.');
      return;
    }
    setUnsavedDraft(null);
    setText('');
    if (result.state === 'queued') {
      setStatus('Saved on this phone. ReDream will retry automatically when connected.');
      if (result.error) setError(friendlyError(result.error));
    }
  };

  const submitBlob = async (blob: Blob, durationSeconds: number, userId: string) => {
    const id = crypto.randomUUID();
    const pending: PendingAiCapture = {
      id,
      createdAt: new Date().toISOString(),
      channel: 'voice_debrief',
      userId,
      text: '',
      context: contextPayload(),
      workspaceSlug,
      workspace,
      mimeType: blob.type || 'audio/webm',
      fileName: `ai-capture-${id}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`,
      durationSeconds,
      blob,
      parentCaptureId: null,
    };

    await persistDraft(pending);
  };

  const startRecording = async () => {
    if (recording || recordingRequestRef.current || busy || unsavedDraft) return;
    recordingRequestRef.current = true;
    const lifecycle = lifecycleRef.current;
    setBusy(true);

    setError('');
    setReceipt(null);
    setStatus('');

    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined'
      ) {
        throw new Error('Microphone recording is not supported in this browser');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sign in before recording a note.');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!mountedRef.current || lifecycle !== lifecycleRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = chooseRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      setSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const duration = Math.max(
          1,
          Math.round((Date.now() - startedAtRef.current) / 1000),
        );
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        });
        chunksRef.current = [];
        stopTracks();
        setRecording(false);
        void submitBlob(blob, duration, session.user.id);
      };

      recorder.start(1000);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.min(
          maxAudioSeconds,
          Math.floor((Date.now() - startedAtRef.current) / 1000),
        );
        setSeconds(elapsed);
        if (elapsed >= maxAudioSeconds && recorder.state === 'recording') {
          recorder.stop();
        }
      }, 500);
    } catch (recordError) {
      stopTracks();
      setRecording(false);
      if (mountedRef.current) setError(friendlyError(recordError));
    } finally {
      recordingRequestRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  };

  const submitText = async () => {
    if (!text.trim() || busy || unsavedDraft) return;

    setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setBusy(false); setError('Sign in before saving a note.'); return; }
    const id = crypto.randomUUID();
    const pending: PendingAiCapture = {
      id,
      userId: session.user.id,
      createdAt: new Date().toISOString(),
      channel: 'typed_debrief',
      text: text.trim(),
      context: contextPayload(),
      workspaceSlug,
      workspace,
      mimeType: null,
      fileName: null,
      durationSeconds: null,
      blob: null,
      parentCaptureId: null,
    };

    await persistDraft(pending);
  };

  const answerQuestion = async (
    questionId: string,
    candidate: Record<string, any>,
  ) => {
    setAnswering(questionId);
    setError('');
    try {
      const result: any = await platformRpc('redream_ai_answer_question', {
        p_question_id: questionId,
        p_value: candidate,
      }, workspaceSlug);

      if (result?.capture_id) {
        setStatus('Got it. ReDream is finishing the update...');
        try {
          await platformInvoke('redream-ai-process', {
            capture_id: result.capture_id,
          });
        } catch {
          // Cron is the durable fallback.
        }
        setBusy(false);
        void pollReceipt(result.capture_id);
      }
    } catch (questionError) {
      setError(friendlyError(questionError));
    } finally {
      setAnswering(null);
    }
  };

  const undoAction = async (actionId: string) => {
    setError('');
    try {
      const next: any = await platformRpc('redream_ai_undo_action', {
        p_action_id: actionId,
      }, workspaceSlug);
      if (next?.capture_id) void pollReceipt(next.capture_id);
    } catch (undoError) {
      setError(friendlyError(undoError));
    }
  };

  const retryCapture = async () => {
    const captureId = receipt?.capture?.id;
    if (!captureId) return;

    setError('');
    setStatus('Retrying the unfinished updates...');
    try {
      const result: any = await platformRpc('redream_ai_retry_capture', {
        p_capture_id: captureId,
      }, workspaceSlug);
      if (result?.capture_id) {
        rememberActiveAiCapture(result.capture_id, workspaceSlug, workspace);
        try {
          await platformInvoke('redream-ai-process', {
            capture_id: result.capture_id,
          });
        } catch {
          // The durable cron worker is the fallback.
        }
        void pollReceipt(result.capture_id);
      }
    } catch (retryError) {
      setStatus('');
      setError(friendlyError(retryError));
    }
  };

  const approveCapture = async () => {
    const captureId = receipt?.capture?.id;
    if (!captureId || approvingCapture) return;

    setApprovingCapture(true);
    setError('');
    setStatus('Applying the updates you approved...');
    try {
      const result: any = await platformRpc(
        'redream_ai_approve_capture',
        { p_capture_id: captureId },
        workspaceSlug,
      );
      const next = result?.receipt || result;
      if (next?.capture) {
        setReceipt(next);
        setStatus('');
        onCompleted?.(next);
      } else {
        void pollReceipt(captureId, true);
      }
    } catch (approvalError) {
      setStatus('');
      setError(friendlyError(approvalError));
    } finally {
      setApprovingCapture(false);
    }
  };

  const editCapture = async () => {
    const captureId = receipt?.capture?.id;
    const transcript = String(receipt?.capture?.transcript_text || '').trim();
    if (!captureId || !transcript || editingCapture) return;

    setEditingCapture(true);
    setError('');
    try {
      await platformRpc(
        'redream_ai_delete_capture',
        { p_capture_id: captureId },
        workspaceSlug,
      );
      forgetActiveAiCapture(captureId);
      displayCaptureRef.current = null;
      setReceipt(null);
      setMode('text');
      setText(transcript);
      setStatus('Edit what happened, then send it back to ReDream.');
    } catch (editError) {
      setError(friendlyError(editError));
    } finally {
      setEditingCapture(false);
    }
  };

  const deleteCapture = async () => {
    const captureId = receipt?.capture?.id;
    if (!captureId || deletingCapture) return;

    setDeletingCapture(true);
    setError('');

    try {
      await platformRpc('redream_ai_delete_capture', {
        p_capture_id: captureId,
      }, workspaceSlug);

      forgetActiveAiCapture(captureId);
      displayCaptureRef.current = null;
      setReceipt(null);
      setStatus('ReDream update deleted.');
      setDeleteConfirmOpen(false);
      onCompleted?.({
        capture: {
          id: captureId,
          status: 'deleted',
        },
      });
    } catch (deleteError) {
      setError(friendlyError(deleteError));
    } finally {
      setDeletingCapture(false);
    }
  };

  const startAnotherUpdate = () => {
    displayCaptureRef.current = null;
    setReceipt(null);
    setStatus('');
    setError('');
    setText('');
  };

  const terminalStatus = receipt?.capture?.status || '';
  const needsAttention = [
    'needs_input',
    'needs_review',
    'partial',
    'failed',
    'budget_blocked',
  ].includes(terminalStatus);
  const verifiedComplete = terminalStatus === 'done';
  const inFlight = Boolean(terminalStatus) && !TERMINAL.has(terminalStatus);
  const hasAppliedActions = (receipt?.actions || []).some(
    (action) => action.status === 'applied',
  );
  const hasPendingActions = (receipt?.actions || []).some(
    (action) => action.status === 'pending',
  );
  const unresolvedQuestions = (receipt?.questions || []).filter(
    (item) => item.status !== 'resolved',
  );
  const proposedRows = previewRows(receipt?.actions || []);
  const canApprove = hasPendingActions && unresolvedQuestions.length === 0;
  const canEditProposal =
    hasPendingActions &&
    !hasAppliedActions &&
    Boolean(receipt?.capture?.transcript_text);
  const canDeleteCapture =
    [
      'needs_input',
      'needs_review',
      'partial',
      'failed',
      'budget_blocked',
    ].includes(terminalStatus) && !hasAppliedActions;

  return (
    <>
    <div className={`${styles.shell} ${compact ? styles.compact : ''}`}>
      {!receipt?.capture ? (
        <section className={styles.hero}>
        {context?.label ? (
          <div className={styles.context}>
            <Check size={12} />
            Talking about {context.label}
          </div>
        ) : null}

        <div className={styles.prompt}>
          <strong>Tell ReDream</strong>
          <span>
            Say or type what happened. ReDream proposes the right updates, then waits for your approval before anything changes.
          </span>
        </div>

        {mode === 'voice' ? (
          <>
            <button
              type="button"
              className={recording ? styles.micRecording : styles.mic}
              onClick={recording ? stopRecording : startRecording}
              disabled={busy || Boolean(unsavedDraft)}
              aria-label={recording ? 'Finish recording' : 'Start recording'}
            >
              {recording ? (
                <Square size={27} fill="currentColor" />
              ) : (
                <Mic size={31} />
              )}
            </button>

            {recording ? (
              <>
                <div className={styles.timer}>{formatTimer(seconds)}</div>
                <div className={styles.wave} aria-hidden="true">
                  {Array.from({ length: 15 }, (_, index) => (
                    <span key={index} />
                  ))}
                </div>
                <span style={{ color: '#7b8f9b', fontSize: 9 }}>
                  Tap the square when you are finished. Maximum {Math.round(maxAudioSeconds / 60)} minutes.
                </span>
              </>
            ) : null}
          </>
        ) : (
          <div className={styles.textPanel}>
            <textarea
              autoFocus
              disabled={busy || Boolean(unsavedDraft)}
              value={text}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setText(event.target.value)
              }
              placeholder="Spoke to Chris at Wellington. They need a striker..."
            />
            <button
              type="button"
              className={styles.primary}
              onClick={() => void submitText()}
              disabled={busy || Boolean(unsavedDraft) || !text.trim()}
            >
              <Send size={14} />
              {busy ? 'Saving...' : 'Send to ReDream'}
            </button>
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setMode(mode === 'voice' ? 'text' : 'voice')}
            disabled={recording || busy || Boolean(unsavedDraft)}
          >
            {mode === 'voice' ? <Type size={14} /> : <Mic size={14} />}
            {mode === 'voice' ? 'Type instead' : 'Use voice'}
          </button>
        </div>
      </section>

      ) : null}

      {status ? (
        <div
          role="status"
          aria-live="polite"
          className={`${styles.status} ${
            status.includes('phone') ? styles.offline : ''
          }`}
        >
          {status.includes('phone') ? (
            <WifiOff size={14} />
          ) : busy ? (
            <LoaderCircle size={14} />
          ) : unsavedDraft ? (
            <AlertTriangle size={14} />
          ) : (
            <CheckCircle2 size={14} />
          )}
          {status}
        </div>
      ) : null}

      {error ? (
        <div className={styles.status} role="alert">
          <AlertTriangle size={14} />
          {error}
        </div>
      ) : null}

      {unsavedDraft && !busy ? (
        <div className={styles.status}>
          <span>Your note is still in this screen. It will be lost if the browser closes before saving.</span>
          <button type="button" className={styles.primary} onClick={() => void persistDraft(unsavedDraft)}>
            Try saving again
          </button>
        </div>
      ) : null}

      {receipt?.capture ? (
        <section className={styles.receipt}>
          <div className={styles.receiptHead}>
            <div>
              <strong>
                {receipt.capture.summary || 'ReDream captured your update'}
              </strong>
              <span>
                {hasPendingActions
                  ? 'Check what ReDream understood. Nothing changes until you approve.'
                  : needsAttention
                    ? 'ReDream has not guessed. Resolve the items below or edit the note.'
                    : verifiedComplete
                      ? 'Approved, written back and verified. Supported changes can still be undone.'
                      : 'ReDream is finishing the interpretation. You do not need to do anything yet.'}
              </span>
            </div>
            <div
              className={
                needsAttention ? styles.stateAttention : styles.state
              }
            >
              {needsAttention ? (
                <AlertTriangle size={11} />
              ) : inFlight ? (
                <LoaderCircle size={11} />
              ) : (
                <CheckCircle2 size={11} />
              )}
              {terminalStatus.replaceAll('_', ' ') || 'processing'}
            </div>
          </div>

          {proposedRows.length ? (
            <div className={styles.preview}>
              <div className={styles.previewHead}>
                <div>
                  <strong>{hasPendingActions ? 'Proposed changes' : 'What ReDream understood'}</strong>
                  <span>
                    {hasPendingActions
                      ? 'Approve once to save these updates.'
                      : 'This is the structured result from your original words.'}
                  </span>
                </div>
                {hasPendingActions ? <small>Approval required</small> : null}
              </div>
              <div className={styles.previewGrid}>
                {proposedRows.map(row => (
                  <div className={styles.previewField} key={`${row.label}:${row.value}`}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
              {hasPendingActions ? (
                <div className={styles.approvalBar}>
                  <div>
                    <strong>Review before saving</strong>
                    <span>Approve these updates, or edit your note first.</span>
                  </div>
                  <div className={styles.approvalActions}>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => void editCapture()}
                      disabled={!canEditProposal || approvingCapture || editingCapture}
                    >
                      <Type size={14} />
                      {editingCapture ? 'Opening...' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() => void approveCapture()}
                      disabled={!canApprove || approvingCapture || editingCapture}
                    >
                      {approvingCapture ? (
                        <LoaderCircle size={14} />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}
                      {approvingCapture ? 'Saving...' : 'Approve & save'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {['partial', 'failed'].includes(terminalStatus) ? (
            <div className={styles.retryRow}>
              <button
                type="button"
                className={styles.retryButton}
                onClick={() => void retryCapture()}
              >
                <RotateCcw size={12} />
                Retry failed updates
              </button>
              <span>ReDream reuses the saved transcript and plan. It does not create duplicates.</span>
            </div>
          ) : null}

          {canDeleteCapture ? (
            <div className={styles.retryRow}>
              <button
                type="button"
                className={styles.retryButton}
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={deletingCapture}
              >
                <Trash2 size={12} />
                {deletingCapture ? 'Deleting...' : 'Delete this update'}
              </button>
              <span>Discard this unresolved update.</span>
            </div>
          ) : null}

          {unresolvedQuestions.length ? (
            <div className={styles.questions}>
              {unresolvedQuestions.map((question) => (
                  <div className={styles.question} key={question.id}>
                    <strong>{question.prompt}</strong>
                    {question.reason ? <p>{question.reason}</p> : null}
                    <div className={styles.answers}>
                      {(question.candidates || []).map((candidate, index) => (
                        <button
                          type="button"
                          className={styles.answer}
                          key={`${question.id}-${index}`}
                          disabled={answering === question.id}
                          onClick={() =>
                            void answerQuestion(question.id, candidate)
                          }
                        >
                          {candidate.label || candidate.value || 'Use this'}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ) : null}

          <div className={styles.actionList}>
            {(receipt.actions || []).map((action) => (
              <div className={styles.actionRow} key={action.id}>
                {action.status === 'applied' ? (
                  <CheckCircle2 size={15} />
                ) : action.status === 'undone' ? (
                  <RotateCcw size={15} />
                ) : action.status === 'pending' ? (
                  <FileText size={15} />
                ) : (
                  <AlertTriangle size={15} />
                )}
                <div className={styles.actionCopy}>
                  <strong>
                    {action.status === 'pending'
                      ? actionLabel(action.action_type).replace('updated', 'proposed').replace('created', 'proposed').replace('logged', 'proposed')
                      : actionLabel(action.action_type)}
                  </strong>
                  <span className={styles.provenance}>
                    {action.evidence
                      ? `From your words: “${action.evidence}”`
                      : action.status.replaceAll('_', ' ')}
                  </span>
                </div>
                {action.status === 'applied' && action.undo_supported ? (
                  <button
                    type="button"
                    className={styles.smallButton}
                    onClick={() => void undoAction(action.id)}
                  >
                    <RotateCcw size={11} />
                    Undo
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {verifiedComplete ? (
            <div className={styles.completeActions}>
              <div>
                <strong>Update complete</strong>
                <span>The approved changes are saved. You can capture the next update now.</span>
              </div>
              <button
                type="button"
                className={styles.secondary}
                onClick={startAnotherUpdate}
              >
                <Plus size={14} />
                Capture another update
              </button>
            </div>
          ) : null}

          {receipt.capture.transcript_text ? (
            <details className={styles.details} open={!TERMINAL.has(receipt.capture.status)}>
              <summary>
                <FileText
                  size={11}
                  style={{ verticalAlign: 'middle', marginRight: 5 }}
                />
                Check transcript
              </summary>
              <p className={styles.transcript}>
                {receipt.capture.transcript_text}
              </p>
            </details>
          ) : null}
        </section>
      ) : null}

      {!compact ? (
        <div className={styles.status}>
          <Check size={14} />
          Raw voice is private and scheduled for deletion after 7 days.
        </div>
      ) : null}
    </div>
      <ConfirmActionDialog
        open={deleteConfirmOpen}
        title="Delete this ReDream update?"
        description="This removes the unresolved update. If changes were already applied, undo them first."
        confirmLabel="Delete update"
        busy={deletingCapture}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={deleteCapture}
      />
    </>
  );
}
