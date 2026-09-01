'use client';

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileText,
  LoaderCircle,
  Mic,
  RotateCcw,
  Send,
  Square,
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

import { djmInvoke, djmRpc, friendlyError } from '@/lib/djm-os';
import {
  chooseRecordingMimeType,
  forgetActiveTellDjmCapture,
  listActiveTellDjmCaptures,
  listPendingTellDjmCaptures,
  PendingTellDjmCapture,
  rememberActiveTellDjmCapture,
  removePendingTellDjmCapture,
  savePendingTellDjmCapture,
} from '@/lib/tell-djm-offline';

import styles from './TellDjmCapture.module.css';

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
    evidence?: string | null;
    undo_supported?: boolean;
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
const POLL_MS = 1400;
const POLL_ATTEMPTS = 90;
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

export default function TellDjmCapture({
  context,
  compact = false,
  onCompleted,
  onUnsafeToCloseChange,
  resumeCaptureId,
  maxAudioSeconds = DEFAULT_MAX_SECONDS,
}: {
  context?: Context;
  compact?: boolean;
  onCompleted?: (receipt: Receipt) => void;
  onUnsafeToCloseChange?: (unsafe: boolean) => void;
  resumeCaptureId?: string | null;
  maxAudioSeconds?: number;
}) {
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const pollingRef = useRef<Set<string>>(new Set());
  const displayCaptureRef = useRef<string | null>(null);

  useEffect(() => {
    onUnsafeToCloseChange?.(recording || busy);
  }, [busy, onUnsafeToCloseChange, recording]);

  const contextPayload = useCallback(
    () => ({
      ...(context || {}),
      route:
        context?.route ||
        (typeof window !== 'undefined' ? window.location.pathname : null),
    }),
    [context],
  );

  const pollReceipt = useCallback(
    async (captureId: string, focus = true) => {
      if (focus) displayCaptureRef.current = captureId;
      if (pollingRef.current.has(captureId)) return;
      pollingRef.current.add(captureId);

      try {
        for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
          try {
            const next = await djmRpc<Receipt>('djm_tell_receipt', {
              p_capture_id: captureId,
            });
            if (displayCaptureRef.current === captureId) setReceipt(next);
            const nextStatus = next?.capture?.status || '';
            if (TERMINAL.has(nextStatus)) {
              forgetActiveTellDjmCapture(captureId);
              if (displayCaptureRef.current === captureId) setStatus('');
              onCompleted?.(next);
              return;
            }
          } catch {
            // The durable worker owns the job. A transient receipt read can retry.
          }
          await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
        }

        if (displayCaptureRef.current === captureId) {
          setStatus(
            'Safely saved. DJM is still processing this in the background. You can close this screen.',
          );
        }
      } finally {
        pollingRef.current.delete(captureId);
      }
    },
    [onCompleted],
  );


  useEffect(() => {
    if (!resumeCaptureId) return;
    rememberActiveTellDjmCapture(resumeCaptureId);
    setStatus('Checking this Tell DJM update...');
    void pollReceipt(resumeCaptureId, true);
  }, [pollReceipt, resumeCaptureId]);

  const uploadPending = useCallback(
    async (pending: PendingTellDjmCapture, showReceipt = true) => {
      const form = new FormData();
      form.append('client_capture_id', pending.id);
      form.append('channel', pending.channel);
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
          pending.fileName || `tell-djm-${pending.id}.webm`,
          { type: pending.mimeType || pending.blob.type || 'audio/webm' },
        );
        form.append('file', file);
      }

      const result: any = await djmInvoke('djm-tell-capture', form);
      if (!result?.capture_id) {
        throw new Error('DJM did not return a capture ID');
      }

      rememberActiveTellDjmCapture(result.capture_id);
      await removePendingTellDjmCapture(pending.id).catch(() => undefined);
      if (showReceipt) void pollReceipt(result.capture_id, true);
      return result.capture_id as string;
    },
    [pollReceipt],
  );

  const flushPending = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    let pending: PendingTellDjmCapture[] = [];
    try {
      pending = await listPendingTellDjmCaptures();
    } catch {
      return;
    }

    let uploadedAny = false;
    for (const item of pending.slice(0, 20)) {
      try {
        await uploadPending(item, false);
        uploadedAny = true;
      } catch {
        return;
      }
    }

    if (uploadedAny) {
      const latest = listActiveTellDjmCaptures().slice(-1)[0];
      if (latest && !displayCaptureRef.current) {
        void pollReceipt(latest.captureId, true);
      }
    }
  }, [pollReceipt, uploadPending]);

  useEffect(() => {
    void flushPending();

    const active = listActiveTellDjmCaptures().slice(-1)[0];
    if (active && !displayCaptureRef.current) {
      void pollReceipt(active.captureId, true);
    }

    const online = () => void flushPending();
    const retryTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void flushPending();
    }, 60_000);

    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('online', online);
      window.clearInterval(retryTimer);
    };
  }, [flushPending, pollReceipt]);

  useEffect(() => {
    const unsafe = recording || busy;
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
          : 'DJM is still securing this note. Wait until it says safely saved.',
      );
    };

    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', guardLinks, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', guardLinks, true);
    };
  }, [busy, recording]);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => stopTracks(), []);

  const submitBlob = async (blob: Blob, durationSeconds: number) => {
    const id = crypto.randomUUID();
    const pending: PendingTellDjmCapture = {
      id,
      createdAt: new Date().toISOString(),
      channel: 'voice_debrief',
      text: '',
      context: contextPayload(),
      mimeType: blob.type || 'audio/webm',
      fileName: `tell-djm-${id}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`,
      durationSeconds,
      blob,
      parentCaptureId: null,
    };

    setBusy(true);
    setError('');
    setReceipt(null);
    setStatus('Saving your note...');

    let locallySaved = false;
    try {
      try {
        await savePendingTellDjmCapture(pending);
        locallySaved = true;
      } catch {
        locallySaved = false;
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setBusy(false);
        if (!locallySaved) {
          throw new Error(
            'You are offline and this browser could not safely store the voice note. Reconnect before closing this screen.',
          );
        }
        setStatus(
          'Saved on this phone. DJM will upload it when you are back online.',
        );
        return;
      }

      setStatus('Safely saved. DJM is sorting it out...');
      await uploadPending(pending);
      setBusy(false);
    } catch (uploadError) {
      setBusy(false);
      setStatus(
        locallySaved
          ? 'Saved on this phone. DJM will retry automatically.'
          : 'DJM could not safely save this note. Keep this screen open and retry when connected.',
      );
      setError(friendlyError(uploadError));
    }
  };

  const startRecording = async () => {
    if (recording || busy) return;

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

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = chooseRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
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
        void submitBlob(blob, duration);
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
      setError(friendlyError(recordError));
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  };

  const submitText = async () => {
    if (!text.trim() || busy) return;

    const id = crypto.randomUUID();
    const pending: PendingTellDjmCapture = {
      id,
      createdAt: new Date().toISOString(),
      channel: 'typed_debrief',
      text: text.trim(),
      context: contextPayload(),
      mimeType: null,
      fileName: null,
      durationSeconds: null,
      blob: null,
      parentCaptureId: null,
    };

    setBusy(true);
    setReceipt(null);
    setError('');
    setStatus('Safely saving this to DJM...');

    let locallySaved = false;
    try {
      try {
        await savePendingTellDjmCapture(pending);
        locallySaved = true;
      } catch {
        locallySaved = false;
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setBusy(false);
        if (!locallySaved) {
          throw new Error(
            'You are offline and this browser could not safely store the note. Reconnect before closing this screen.',
          );
        }
        setStatus(
          'Saved on this phone. DJM will upload it when you are back online.',
        );
        setText('');
        return;
      }

      await uploadPending(pending);
      setBusy(false);
      setText('');
    } catch (submitError) {
      setBusy(false);
      setStatus(
        locallySaved
          ? 'Saved on this phone. DJM will retry automatically.'
          : 'DJM could not safely save this note. Keep this screen open and retry when connected.',
      );
      setError(friendlyError(submitError));
    }
  };

  const answerQuestion = async (
    questionId: string,
    candidate: Record<string, any>,
  ) => {
    setAnswering(questionId);
    setError('');
    try {
      const result: any = await djmRpc('djm_tell_answer_question', {
        p_question_id: questionId,
        p_value: candidate,
      });

      if (result?.capture_id) {
        setStatus('Got it. DJM is finishing the update...');
        try {
          await djmInvoke('djm-tell-process', {
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
      const next: any = await djmRpc('djm_tell_undo_action', {
        p_action_id: actionId,
      });
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
      const result: any = await djmRpc('djm_tell_retry_capture', {
        p_capture_id: captureId,
      });
      if (result?.capture_id) {
        rememberActiveTellDjmCapture(result.capture_id);
        try {
          await djmInvoke('djm-tell-process', {
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

  const terminalStatus = receipt?.capture?.status || '';
  const needsAttention = [
    'needs_input',
    'needs_review',
    'partial',
    'failed',
    'budget_blocked',
  ].includes(terminalStatus);

  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        {context?.label ? (
          <div className={styles.context}>
            <Check size={12} />
            Talking about {context.label}
          </div>
        ) : null}

        <div className={styles.prompt}>
          <strong>Tell DJM</strong>
          <span>
            Say what happened naturally. DJM will put it in the right places and
            only ask when something genuinely needs you.
          </span>
        </div>

        {mode === 'voice' ? (
          <>
            <button
              type="button"
              className={recording ? styles.micRecording : styles.mic}
              onClick={recording ? stopRecording : startRecording}
              disabled={busy}
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
              disabled={busy || !text.trim()}
            >
              <Send size={14} />
              {busy ? 'Saving...' : 'Tell DJM'}
            </button>
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setMode(mode === 'voice' ? 'text' : 'voice')}
            disabled={recording || busy}
          >
            {mode === 'voice' ? <Type size={14} /> : <Mic size={14} />}
            {mode === 'voice' ? 'Type instead' : 'Use voice'}
          </button>
        </div>
      </section>

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

      {receipt?.capture ? (
        <section className={styles.receipt}>
          <div className={styles.receiptHead}>
            <div>
              <strong>
                {receipt.capture.summary || 'DJM captured your update'}
              </strong>
              <span>
                {needsAttention
                  ? 'The safe parts are saved. DJM only needs help with the items below.'
                  : 'Everything below was written back and verified.'}
              </span>
            </div>
            <div
              className={
                needsAttention ? styles.stateAttention : styles.state
              }
            >
              {needsAttention ? (
                <AlertTriangle size={11} />
              ) : (
                <CheckCircle2 size={11} />
              )}
              {terminalStatus.replaceAll('_', ' ') || 'processing'}
            </div>
          </div>

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
              <span>DJM reuses the saved transcript and plan. It does not create duplicates.</span>
            </div>
          ) : null}

          {(receipt.questions || []).filter(
            (item) => item.status !== 'resolved',
          ).length ? (
            <div className={styles.questions}>
              {(receipt.questions || [])
                .filter((item) => item.status !== 'resolved')
                .map((question) => (
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
                ) : (
                  <AlertTriangle size={15} />
                )}
                <div className={styles.actionCopy}>
                  <strong>{actionLabel(action.action_type)}</strong>
                  <span>
                    {action.evidence || action.status.replaceAll('_', ' ')}
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

          {receipt.capture.transcript_text ? (
            <details className={styles.details}>
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
  );
}
