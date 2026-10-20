'use client';

import { supabase } from '@/lib/supabase';
import { assertAiCaptureOwner } from '@/lib/ai-offline';
import { saveAiDraft } from '@/lib/ai-draft-save';
import { pollCaptureReceipt } from '@/lib/capture-polling';
import { flushAiQueue, uploadAiCaptureOnce } from '@/lib/ai-upload-queue';

import { pendingAiWorkspace } from '@/lib/ai-workspace';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { useAiWorkspaceContext } from './useAiWorkspace';
import Link from 'next/link';
import {captureOutcomeLinks} from '@/lib/capture-outcome-links';
import { readWithDeadline } from '@/lib/read-with-deadline';
import { aiTextDraftKey, readAiTextDraft, writeAiTextDraft } from '@/lib/ai-text-draft';

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
import AiAgentAnswer from './AiAgentAnswer';

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
    log_interaction: 'Note saved',
    upsert_club_need: 'Club need updated',
    create_task: 'Follow-up created',
    add_claim: 'Intelligence saved',
    suggest_player: 'Player added as an option',
    exclude_player: 'Player excluded from need',
  }[type] || type.replaceAll('_', ' ');
}

function receiptActionLabel(action: NonNullable<Receipt['actions']>[number]) {
  const payload = proposedPayload(action);
  const title = payload.task_title || payload.title || '';
  if (action.action_type === 'update_task') {
    const verb = action.status === 'applied'
      ? { complete: 'Completed', reopen: 'Reopened', reschedule: 'Rescheduled' }[String(payload.operation)] || 'Updated'
      : { complete: 'Complete', reopen: 'Reopen', reschedule: 'Reschedule' }[String(payload.operation)] || 'Update';
    return `${action.status === 'undone' ? 'Undone: ' : action.status === 'failed' ? 'Failed: ' : ''}${verb}: ${title}`;
  }
  if (action.status === 'applied') return actionLabel(action.action_type);
  return `${action.status === 'pending' ? 'Proposed' : action.status === 'undone' ? 'Undone' : action.status === 'failed' ? 'Failed' : 'Needs attention'}: ${title || action.action_type.replaceAll('_', ' ')}`;
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
        add('Owner', payload.responsible_display_names?.join(' + ') || payload.owner_display_name || payload.owner_name || 'You');
        add('Due', dueValue(payload.due_at));
      }
      if (action.action_type === 'update_task') {
        add('Task', payload.task_title);
        add('Change', { complete: 'Mark complete', reopen: 'Reopen', reschedule: 'Move due date' }[String(payload.operation)]);
        add('Owner', payload.owner_display_name || 'You');
        if (payload.operation === 'reschedule') add('Due', dueValue(payload.due_at));
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
  onNavigate,
  resumeCaptureId,
  maxAudioSeconds = DEFAULT_MAX_SECONDS,
  resolvedWorkspaceSlug,
  initialText = '',
}: {
  context?: Context;
  compact?: boolean;
  onCompleted?: (receipt: Receipt) => void;
  onUnsafeToCloseChange?: (unsafe: boolean) => void;
  onNavigate?: () => void;
  resumeCaptureId?: string | null;
  maxAudioSeconds?: number;
  resolvedWorkspaceSlug?: string | null;
  initialText?: string;
}) {
  const [mode, setMode] = useState<'voice' | 'text' | 'ask'>('voice');
  const [agentBusy, setAgentBusy] = useState(false);
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
  const actionInFlight = useRef(false);
  const [actionBusy, setActionBusy] = useState(false);

  const recordingRequestRef = useRef(false);
  const textRequestRef = useRef(false);
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
  const typedKey = useRef<string | null>(null);
  const typedOwner = useRef<string | null | undefined>(undefined);
  const typedEdited = useRef(false);
  const currentText = useRef(text);
  currentText.current = text;
  const typedContext = JSON.stringify([context?.organisation_id,context?.person_id,context?.player_id,context?.prospect_id,context?.opportunity_id,context?.club_need_id,context?.label]);
  const changeTypedText = (next:string) => {
    typedEdited.current = true;
    currentText.current = next;
    setText(next);
    if(typedKey.current)try{writeAiTextDraft(sessionStorage,typedKey.current,next);}catch{}
  };
  useEffect(() => {
    let active=true,authEpoch=0;
    typedKey.current=null;typedEdited.current=false;setText(initialText.trim());
    const scope=(userId:string|null) => {
      if(!active)return;
      const changedUser=typedOwner.current!==undefined&&typedOwner.current!==userId;
      typedOwner.current=userId;
      const key=userId&&workspaceSlug&&workspaceSlug!=='unresolved'?aiTextDraftKey(userId,workspaceSlug,typedContext):null;
      if(key===typedKey.current&&!changedUser)return;
      typedKey.current=key;
      if(changedUser){
        lifecycleRef.current++;setText('');setReceipt(null);setError('');setStatus('');typedEdited.current=false;
        setUnsavedDraft(null);setBusy(false);setApprovingCapture(false);setEditingCapture(false);setDeletingCapture(false);setAnswering(null);
        textRequestRef.current=false;actionInFlight.current=false;setActionBusy(false);
        recordingRequestRef.current=false;displayCaptureRef.current=null;
        pollingRef.current.forEach(controller=>controller.abort());pollingRef.current.clear();
        const recorder=recorderRef.current;
        if(recorder){recorder.onstop=null;if(recorder.state!=='inactive')recorder.stop();}
        streamRef.current?.getTracks().forEach(track=>track.stop());
        if(timerRef.current!==null)window.clearInterval(timerRef.current);
        timerRef.current=null;chunksRef.current=[];setRecording(false);
      }
      if(!key)return;
      try{
        if(!changedUser&&(typedEdited.current||initialText.trim())){writeAiTextDraft(sessionStorage,key,currentText.current||initialText.trim());return;}
        const saved=readAiTextDraft(sessionStorage,key);setText(saved);if(saved){setMode('text');setStatus('Unsent note restored.');}
      }catch{}
    };
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{++authEpoch;scope(session?.user.id||null);});
    const epoch=authEpoch;
    void readWithDeadline(supabase.auth.getSession()).then(({data})=>{if(epoch===authEpoch)scope(data.session?.user.id||null);}).catch(()=>undefined);
    return()=>{active=false;subscription.unsubscribe();};
  },[workspaceSlug,typedContext,initialText]);

  useEffect(() => {
    const sharedText = initialText.trim();

    if (
      !sharedText ||
      appliedInitialTextRef.current === sharedText ||
      recording ||
      busy ||
      agentBusy ||
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
    agentBusy,
    busy,
    initialText,
    recording,
    unsavedDraft,
  ]);

  useEffect(() => {
    onUnsafeToCloseChange?.(
      recording ||
      busy ||
      agentBusy ||
      approvingCapture ||
      editingCapture ||
      Boolean(unsavedDraft),
    );
  }, [
    approvingCapture,
    agentBusy,
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
      if (!mountedRef.current || activeWorkspaceRef.current !== workspaceSlug) return;
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
              setStatus(transcriptReady ? 'Transcript ready. Preparing suggestions...' : 'Transcribing...');
            }
            return attempt >= 40 ? BACKGROUND_POLL_MS : transcriptReady ? ACTIVE_POLL_MS : TRANSCRIBING_POLL_MS;
          },
          denied: () => {
            if (displayCaptureRef.current !== captureId) return;
            setReceipt(null);
            setStatus('');
            setError('This update is unavailable here. Check your access.');
          },
          exhausted: () => {
            if (displayCaptureRef.current !== captureId) return;
            setStatus(verified
              ? 'Note saved. Processing continues. You can close this screen.'
              : 'Could not check this update. Try again when connected.');
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
    setStatus('Checking...');
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
          throw new Error('Could not confirm the update. Try again.');
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
      if (result.failed > 0 && mountedRef.current) setError('Some notes could not upload. They are saved on this phone and will retry. Check your connection and account.');
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
          ? 'Finish the voice note first.'
          : 'Wait until the note is saved.',
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
    const generation=lifecycleRef.current;
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
    if(generation!==lifecycleRef.current||!mountedRef.current)return;
    setBusy(false);
    if (result.state === 'unsaved') {
      setStatus('Not saved. Keep this screen open and try again.');
      setError(result.error ? friendlyError(result.error) : 'Could not store the note.');
      return;
    }
    setUnsavedDraft(null);
    if(typedKey.current)try{writeAiTextDraft(sessionStorage,typedKey.current,'');}catch{}
    setText('');
    if (result.state === 'queued') {
      setStatus('Saved on this phone. It will retry when connected.');
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
      if (!session) throw new Error('Sign in to record.');
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
        if(lifecycle!==lifecycleRef.current||!mountedRef.current){stopTracks();return;}
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
      if(lifecycle===lifecycleRef.current){recordingRequestRef.current = false;if (mountedRef.current) setBusy(false);}
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  };

  const submitText = async () => {
    if (!text.trim() || busy || unsavedDraft || textRequestRef.current) return;
    textRequestRef.current=true;
    const generation=lifecycleRef.current;

    setBusy(true);
    try {
    const { data: { session } } = await readWithDeadline(supabase.auth.getSession());
    if(generation!==lifecycleRef.current||!mountedRef.current)return;
    if (!session) { setBusy(false); setError('Sign in to save.'); return; }
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
    }catch(error){if(generation===lifecycleRef.current)setError(friendlyError(error));}
    finally{if(generation===lifecycleRef.current){textRequestRef.current=false;setBusy(false);}}
  };

  const answerQuestion = async (
    questionId: string,
    candidate: Record<string, any>,
  ) => {
    const generation=lifecycleRef.current;
    setAnswering(questionId);
    setError('');
    try {
      const result: any = await platformRpc('redream_ai_answer_question', {
        p_question_id: questionId,
        p_value: candidate,
      }, workspaceSlug);

      if(generation!==lifecycleRef.current||!mountedRef.current)return;
      if (result?.capture_id) {
        setStatus('Got it. Preparing suggestions...');
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
      if(generation===lifecycleRef.current)setError(friendlyError(questionError));
    } finally {
      if(generation===lifecycleRef.current)setAnswering(null);
    }
  };

  const dismissAction = async (actionId: string) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setActionBusy(true);
    const generation = lifecycleRef.current;
    try {
      const next = await readWithDeadline(platformRpc<Receipt>('redream_ai_dismiss_action', { p_action_id: actionId }, workspaceSlug));
      if (generation !== lifecycleRef.current || !mountedRef.current) return;
      setReceipt(next); setError(''); onCompleted?.(next);
    } catch (error) {
      if (generation === lifecycleRef.current) setError(friendlyError(error));
    } finally {
      if(generation===lifecycleRef.current){actionInFlight.current = false; setActionBusy(false);}
    }
  };
  const undoAction = async (actionId: string) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setActionBusy(true);
    const generation = lifecycleRef.current;
    setError('');
    try {
      const next: any = await readWithDeadline(platformRpc('redream_ai_undo_action', {
        p_action_id: actionId,
      }, workspaceSlug));
      if (generation !== lifecycleRef.current || !mountedRef.current) return;
      const captureId=next?.capture_id||receipt?.capture?.id;
      if (captureId) void pollReceipt(captureId);
    } catch (undoError) {
      if(generation===lifecycleRef.current)setError(friendlyError(undoError));
    } finally {
      if(generation===lifecycleRef.current){actionInFlight.current = false;setActionBusy(false);}
    }
  };

  const retryCapture = async () => {
    const captureId = receipt?.capture?.id;
    if (!captureId) return;

    const generation=lifecycleRef.current;
    setError('');
    setStatus('Retrying...');
    try {
      const result: any = await platformRpc('redream_ai_retry_capture', {
        p_capture_id: captureId,
      }, workspaceSlug);
      if(generation!==lifecycleRef.current||!mountedRef.current)return;
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
      if(generation!==lifecycleRef.current)return;
      setStatus('');
      setError(friendlyError(retryError));
    }
  };

  const approveCapture = async () => {
    const captureId = receipt?.capture?.id;
    if (!captureId || approvingCapture || actionInFlight.current) return;
    actionInFlight.current = true;
    const generation = lifecycleRef.current;

    setApprovingCapture(true);
    setError('');
    setStatus('Applying approved updates...');
    try {
      const result: any = await readWithDeadline(platformRpc(
        'redream_ai_approve_capture',
        { p_capture_id: captureId },
        workspaceSlug,
      ));
      if (generation !== lifecycleRef.current || !mountedRef.current) return;
      const next = result?.receipt || result;
      if (next?.capture) {
        setReceipt(next);
        setStatus('');
        onCompleted?.(next);
      } else {
        void pollReceipt(captureId, true);
      }
    } catch (approvalError) {
      if (generation !== lifecycleRef.current || !mountedRef.current) return;
      setStatus('');
      setError(friendlyError(approvalError));
    } finally {
      if(generation===lifecycleRef.current){actionInFlight.current = false;setApprovingCapture(false);}
    }
  };

  const editCapture = async () => {
    const captureId = receipt?.capture?.id;
    const transcript = String(receipt?.capture?.transcript_text || '').trim();
    if (!captureId || !transcript || editingCapture) return;
    const generation=lifecycleRef.current;

    setEditingCapture(true);
    setError('');
    try {
      await platformRpc(
        'redream_ai_delete_capture',
        { p_capture_id: captureId },
        workspaceSlug,
      );
      if(generation!==lifecycleRef.current||!mountedRef.current)return;
      forgetActiveAiCapture(captureId);
      displayCaptureRef.current = null;
      setReceipt(null);
      setMode('text');
      changeTypedText(transcript);
      setStatus('Edit the note, then send it again.');
    } catch (editError) {
      if(generation===lifecycleRef.current)setError(friendlyError(editError));
    } finally {
      if(generation===lifecycleRef.current)setEditingCapture(false);
    }
  };

  const deleteCapture = async () => {
    const captureId = receipt?.capture?.id;
    if (!captureId || deletingCapture) return;

    const generation=lifecycleRef.current;
    setDeletingCapture(true);
    setError('');

    try {
      await platformRpc('redream_ai_delete_capture', {
        p_capture_id: captureId,
      }, workspaceSlug);

      if(generation!==lifecycleRef.current||!mountedRef.current)return;
      forgetActiveAiCapture(captureId);
      displayCaptureRef.current = null;
      setReceipt(null);
      setStatus('Update deleted.');
      setDeleteConfirmOpen(false);
      onCompleted?.({
        capture: {
          id: captureId,
          status: 'deleted',
        },
      });
    } catch (deleteError) {
      if(generation===lifecycleRef.current)setError(friendlyError(deleteError));
    } finally {
      if(generation===lifecycleRef.current)setDeletingCapture(false);
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
  const hasFailedActions = (receipt?.actions || []).some(action => action.status === 'failed');
  const hasReviewActions = (receipt?.actions || []).some(action => action.status === 'needs_review');
  const canApprove = (hasPendingActions || hasFailedActions) && unresolvedQuestions.length === 0;
  const canEditProposal =
    (hasPendingActions || hasReviewActions || hasFailedActions) &&
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
            {mode === 'ask' ? 'Ask about your records or research your next move.' : 'Clear task completions save with Undo. Review other changes before saving.'}
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
        ) : mode === 'text' ? (
          <div className={styles.textPanel}>
            <textarea
              aria-label="Your update"
              autoFocus
              disabled={busy || Boolean(unsavedDraft)}
              value={text}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                changeTypedText(event.target.value)
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
        ) : null}

        <div hidden={mode !== 'ask'} style={{ width: '100%', maxWidth: 560 }}>
          <AiAgentAnswer
            key={[workspaceSlug, context?.player_id, context?.prospect_id, context?.person_id, context?.organisation_id, context?.opportunity_id].join(':')}
            workspaceSlug={workspaceSlug}
            context={context}
            onBusyChange={setAgentBusy}
            onNavigate={onNavigate}
            onPrepareAction={proposal => { changeTypedText(text.trim() ? `${text.trim()}\n\n${proposal}` : proposal); setMode('text'); setStatus('Review the task wording, then send it to ReDream.'); }}
          />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setMode(mode === 'voice' ? 'text' : 'voice')}
            disabled={recording || busy || agentBusy || Boolean(unsavedDraft)}
          >
            {mode === 'voice' ? <Type size={14} /> : <Mic size={14} />}
            {mode === 'voice' ? 'Type instead' : 'Use voice'}
          </button>
          {mode !== 'ask' ? <button type="button" className={styles.secondary}
            onClick={() => setMode('ask')} disabled={recording || busy || Boolean(unsavedDraft)}>
            Ask a question
          </button> : null}
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
          <span>Keep this screen open until the note is saved.</span>
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
                {hasPendingActions ? 'Review proposed changes' : verifiedComplete ? 'Update complete' : 'Your update'}
              </strong>
              <span>
                {hasPendingActions
                  ? 'Review the changes below.'
                  : needsAttention
                    ? 'ReDream has not guessed. Resolve the items below or edit the note.'
                    : verifiedComplete
                      ? hasAppliedActions ? 'Changes saved. Undo is available where supported.' : 'Review complete. No changes were saved.'
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
                </div>
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
                    <span>{hasAppliedActions ? 'Saved changes are listed below. Approve the remaining proposals.' : 'Proposed changes wait for your approval.'}</span>
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

          {hasFailedActions && !hasPendingActions ? (
            <div className={styles.retryRow}>
              <button type="button" className={styles.primary} disabled={!canApprove || approvingCapture} onClick={() => void approveCapture()}>
                {approvingCapture ? 'Saving...' : 'Retry approved changes'}
              </button>
              <span>Saved actions are kept. Only failed actions are retried.</span>
            </div>
          ) : ['partial', 'failed'].includes(terminalStatus) ? (
            <div className={styles.retryRow}>
              <button
                type="button"
                className={styles.retryButton}
                onClick={() => void retryCapture()}
              >
                <RotateCcw size={12} />
                Retry failed updates
              </button>
              <span>The saved transcript and plan are reused. No duplicate is created.</span>
            </div>
          ) : null}

          {canEditProposal && !hasPendingActions ? <div className={styles.retryRow}>
            <button type="button" className={styles.secondary} disabled={editingCapture} onClick={() => void editCapture()}>Edit original note</button>
            <span>Clarify the person or unfinished work, then send it again.</span>
          </div> : null}

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
            {(receipt.actions || []).filter(action => action.status !== 'superseded').map((action) => (
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
                    {receiptActionLabel(action)}
                  </strong>
                  <details className={styles.provenance}><summary>Details</summary><span>
                    {action.evidence
                      ? `From your words: “${action.evidence}”`
                      : action.status.replaceAll('_', ' ')}
                  </span></details>
                  {action.error_message || proposedPayload(action)._review_reason ? <span role="status">{action.error_message || proposedPayload(action)._review_reason}</span> : null}
                </div>
                {['needs_review', 'failed', 'pending'].includes(action.status) ? <button type="button" className={styles.smallButton} disabled={actionBusy || approvingCapture} onClick={() => void dismissAction(action.id)}>Leave unchanged</button> : null}
                {action.status === 'applied' && action.undo_supported ? (
                  <button
                    type="button"
                    className={styles.smallButton}
                    disabled={actionBusy}
                    onClick={() => void undoAction(action.id)}
                  >
                    <RotateCcw size={11} />
                    Undo
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {hasAppliedActions ? <div className={styles.completeActions}>
            {captureOutcomeLinks(receipt.actions||[],workspaceSlug).map(link=><Link key={link.href} href={link.href} className={styles.secondary} onNavigate={onNavigate}>{link.label}</Link>)}
          </div> : null}
          {verifiedComplete ? (
            <div className={styles.completeActions}>
              <div>
                <strong>Update complete</strong>
                <span>{hasAppliedActions ? 'Changes saved. Ready for the next update.' : 'Ready for the next update.'}</span>
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

      {!compact && mode !== 'ask' ? (
        <div className={styles.status}>
          <Check size={14} />
          Raw voice is private and scheduled for deletion after 7 days.
        </div>
      ) : null}
    </div>
      <ConfirmActionDialog
        open={deleteConfirmOpen}
        title="Delete this ReDream update?"
        description="This removes the unresolved update. Undo applied changes first."
        confirmLabel="Delete update"
        busy={deletingCapture}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={deleteCapture}
      />
    </>
  );
}
