'use client';

import { AlertTriangle, CheckCircle2, LoaderCircle, Mic, Square, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';

import { djmInvoke, friendlyError } from '@/lib/djm-os';
import { chooseRecordingMimeType } from '@/lib/tell-djm-offline';
import styles from './PlayerVoiceLauncher.module.css';

const MAX_SECONDS = 240;

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

type VoiceResult = {
  ok?: boolean;
  request_id?: string | null;
  transcript?: string | null;
  delivered?: boolean;
};

export default function PlayerVoiceLauncher() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const retryBlobRef = useRef<Blob | null>(null);
  const retryDurationRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => stopTracks(), []);

  useEffect(() => {
    if (!open || !mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !recording && !busy) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, open, recording]);

  const sendVoice = async (blob: Blob, durationSeconds: number) => {
    setBusy(true);
    setError('');
    setTranscript('');
    retryBlobRef.current = blob;
    retryDurationRef.current = durationSeconds;

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('You are offline. Reconnect and tap retry before closing this message.');
      }

      const mime = blob.type || 'audio/webm';
      const extension = mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : 'webm';
      const form = new FormData();
      form.append(
        'file',
        new File([blob], `player-voice-${crypto.randomUUID()}.${extension}`, { type: mime }),
      );
      form.append('duration_seconds', String(durationSeconds));

      const result = await djmInvoke<VoiceResult>('djm-player-voice-message', form);
      if (!result?.delivered || !result?.transcript) {
        throw new Error('DJM could not confirm that the voice message was delivered');
      }

      retryBlobRef.current = null;
      retryDurationRef.current = null;
      setTranscript(result.transcript);
    } catch (sendError) {
      setError(friendlyError(sendError));
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (recording || busy) return;

    setError('');
    setTranscript('');
    setSeconds(0);
    retryBlobRef.current = null;
    retryDurationRef.current = null;

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
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
        void sendVoice(blob, duration);
      };

      recorder.start(1000);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.min(
          MAX_SECONDS,
          Math.floor((Date.now() - startedAtRef.current) / 1000),
        );
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS && recorder.state === 'recording') recorder.stop();
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

  const retry = () => {
    const blob = retryBlobRef.current;
    const duration = retryDurationRef.current;
    if (!blob || !duration || busy) return;
    void sendVoice(blob, duration);
  };

  const close = () => {
    if (recording || busy) return;
    setOpen(false);
    setError('');
    setTranscript('');
    setSeconds(0);
    retryBlobRef.current = null;
    retryDurationRef.current = null;
  };

  const dialog =
    open && mounted
      ? createPortal(
          <div
            className={styles.overlay}
            onClick={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="player-voice-title">
              <div className={styles.head}>
                <strong id="player-voice-title">Voice message to DJM</strong>
                <button
                  type="button"
                  className={styles.close}
                  onClick={close}
                  disabled={recording || busy}
                  aria-label="Close voice message"
                >
                  <X size={15} />
                </button>
              </div>

              <div className={styles.body}>
                <p className={styles.copy}>
                  Speak naturally. DJM transcribes the message and sends it straight to your agency team.
                </p>

                {!transcript ? (
                  <button
                    type="button"
                    className={recording ? styles.micRecording : styles.mic}
                    onClick={recording ? stopRecording : startRecording}
                    disabled={busy}
                    aria-label={recording ? 'Finish recording' : 'Start voice message'}
                  >
                    {recording ? <Square size={27} fill="currentColor" /> : <Mic size={31} />}
                  </button>
                ) : null}

                {recording ? <div className={styles.timer}>{formatTimer(seconds)}</div> : null}

                {busy ? (
                  <div className={styles.status}>
                    <LoaderCircle size={14} className={styles.spinner} />
                    Transcribing and sending...
                  </div>
                ) : null}

                {error ? (
                  <div className={styles.error}>
                    <AlertTriangle size={14} />
                    <span>{error}</span>
                  </div>
                ) : null}

                {error && retryBlobRef.current ? (
                  <button type="button" className={styles.reset} onClick={retry} disabled={busy}>
                    Retry this recording
                  </button>
                ) : null}

                {transcript ? (
                  <div className={styles.success}>
                    <strong>
                      <CheckCircle2 size={14} />
                      Sent to DJM
                    </strong>
                    {transcript}
                  </div>
                ) : null}

                {transcript ? (
                  <button type="button" className={styles.reset} onClick={() => {
                    setTranscript('');
                    setError('');
                    setSeconds(0);
                  }}>
                    Send another voice message
                  </button>
                ) : null}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-label="Voice message to DJM"
        title="Voice message to DJM"
      >
        <Mic size={15} />
        <span>Voice</span>
      </button>
      {dialog}
    </>
  );
}
